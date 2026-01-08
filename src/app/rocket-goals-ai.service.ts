import { Injectable, inject, signal, effect, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Functions, getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
import { AuthService } from './auth.service';
import { RocketGoalsService } from './rocket-goals.service';
import { CalendarEventsService, type CalendarEventData } from './calendar-events.service';
import type { RocketGoal } from './models/rocket-goal';

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  timestamp: Date;
}

export interface ChatSessionMeta {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  lastMessage?: string;
  goalId?: string; // Optional: links conversation to a specific goal
}

type FirestoreSessionDoc = {
  title?: string;
  createdAt?: any;
  updatedAt?: any;
  lastMessage?: string;
  goalId?: string; // Optional: links conversation to a specific goal
};

type FirestoreMessageDoc = {
  role?: 'user' | 'model';
  content?: string;
  createdAt?: any;
};

interface AIRequest {
  message: string;
  conversationHistory?: { role: 'user' | 'model'; content: string }[];
  goalContext?: {
    id: string;
    title: string;
    primaryGoal: string;
    answers: Record<string, any>;
    status: string;
    copilot?: {
      avatar: string;
      name: string;
      role: string;
    };
  };
  calendarEvents?: Array<{
    id: string;
    title: string;
    date: string; // ISO string
    time?: string;
    duration?: number;
    color?: string;
    completed?: boolean;
    description?: string;
  }>;
}

/**
 * Side effects represent changes made to the world by AI tools
 */
type SideEffect =
  | { type: 'event_created'; eventId: string; title: string }
  | { type: 'event_updated'; eventId: string; title?: string }
  | { type: 'event_deleted'; eventId: string }
  | { type: 'email_sent'; to: string; subject: string }
  | { type: 'sms_sent'; to: string }
  | { type: 'reminder_scheduled'; reminderId: string; scheduledFor: string }
  | { type: 'goal_updated'; goalId: string };

/**
 * Result from a tool execution
 */
interface ToolCallResult {
  name: string;
  args: Record<string, any>;
  result: {
    success: boolean;
    message: string;
    data?: Record<string, any>;
  };
}

/**
 * Response from the AI backend
 */
interface AIResponse {
  response: string;
  model: string;
  toolCalls?: ToolCallResult[];
  sideEffects?: SideEffect[];
}

@Injectable({
  providedIn: 'root'
})
export class RocketGoalsAIService {
  private readonly functions = getFunctions(getApp(), 'us-central1');
  private readonly authService = inject(AuthService);
  private readonly goalsService = inject(RocketGoalsService);
  private readonly calendarEventsService = inject(CalendarEventsService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly messages = signal<ChatMessage[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly isOpen = signal(false);

  readonly sessions = signal<ChatSessionMeta[]>([]);
  readonly sessionsLoading = signal(false);
  readonly sessionsError = signal<string | null>(null);
  readonly currentSessionId = signal<string | null>(null);
  readonly currentSessionTitle = signal<string | null>(null);
  readonly currentSessionCreatedAt = signal<Date | null>(null);

  private conversationHistory: { role: 'user' | 'model'; content: string }[] = [];
  private firestorePromise?: Promise<import('firebase/firestore').Firestore>;
  private currentUserId: string | null = null;
  private currentGoalId: string | null = null; // Track which goal's conversation is currently loaded
  private preventAutoSelect = false;

  private readonly systemPrompt = `You are RocketGoals AI, a helpful assistant for goal-setting and achievement. You help users create, manage, and achieve their goals using the 7-day Rocket Goal challenge methodology.

Your role is to:
1. Help users understand the 7-day challenge concept
2. Provide guidance on goal setting and achievement
3. Offer motivation and accountability support
4. Help users refine their goals and action plans
5. Answer questions about goal tracking and progress
6. Provide tips for staying motivated and overcoming obstacles

Key principles you follow:
- Be encouraging and supportive
- Focus on actionable advice
- Use the rocket metaphor when appropriate
- Keep responses concise but helpful
- Ask clarifying questions when needed
- Celebrate small wins and progress

If asked about technical issues or features, explain them clearly and suggest solutions.

Remember: Users are on a 7-day journey to transform their goals into reality. Help them launch successfully and stay on course!`;

  constructor() {
    effect(() => {
      const profile = this.authService.profile();
      const nextUserId = profile?.userId ?? null;

      if (nextUserId === this.currentUserId) {
        return;
      }

      this.handleAuthChange(nextUserId);
    });
  }

  private async ensureFirestore() {
    if (!this.firestorePromise) {
      this.firestorePromise = (async () => {
        const firestoreModule = await import('firebase/firestore');
        return firestoreModule.getFirestore(getApp());
      })();
    }
    return this.firestorePromise;
  }

  private handleAuthChange(userId: string | null): void {
    this.currentUserId = userId;
    this.resetClientState();

    if (userId) {
      // Check if there's an autoLaunch or prompt in the URL
      // This runs BEFORE ngOnInit, so we need to check URL directly
      const hasExternalPrompt = this.hasExternalPromptInUrl();

      if (hasExternalPrompt) {
        // Don't auto-select any session - a fresh prompt will be processed
        this.preventAutoSelect = true;
        void this.loadSessionsForCurrentUser(false);
      } else if (!this.preventAutoSelect) {
        // Normal flow - load and select most recent session
        void this.loadSessionsForCurrentUser(true);
      } else {
        // preventAutoSelect was already set by component
        void this.loadSessionsForCurrentUser(false);
      }
    }
  }

  /**
   * Check if the current URL has an external prompt (autoLaunch or prompt param)
   * This is checked early to prevent loading old sessions when a fresh prompt is incoming
   */
  private hasExternalPromptInUrl(): boolean {
    if (!isPlatformBrowser(this.platformId)) {
      return false;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const hasAutoLaunch = urlParams.has('autoLaunch');
    const hasPrompt = urlParams.has('prompt') && !!urlParams.get('prompt')?.trim();

    return hasAutoLaunch || hasPrompt;
  }

  private resetClientState(): void {
    this.startNewSession();
    this.currentGoalId = null; // Clear goal tracking on auth change
    this.sessions.set([]);
    this.sessionsError.set(null);
    this.sessionsLoading.set(false);
  }

  private buildTitleFromMessage(message: string) {
    if (!message) return 'New chat';
    const words = message.trim().split(/\s+/).slice(0, 8);
    const title = words.join(' ');
    return title.charAt(0).toUpperCase() + title.slice(1);
  }

  private convertToDate(value: any): Date {
    if (!value) return new Date();
    if (value instanceof Date) return value;
    if (typeof value === 'number') return new Date(value);
    if (typeof value === 'string') return new Date(value);
    if (value?.toDate) return value.toDate();
    return new Date();
  }

  togglePanel(): void {
    this.isOpen.update(v => !v);
  }

  openPanel(): void {
    this.isOpen.set(true);
  }

  closePanel(): void {
    this.isOpen.set(false);
  }

  async loadSessionsForCurrentUser(selectMostRecent: boolean = true, goalId?: string): Promise<void> {
    const profile = this.authService.profile();
    if (!profile?.userId) {
      this.sessions.set([]);
      return;
    }

    // CRITICAL: If preventAutoSelect is set (fresh prompt pending), NEVER load messages
    // Even if selectMostRecent is false, we should not load any session messages
    if (this.preventAutoSelect && selectMostRecent) {
      // Only load the session list for the sidebar, but don't select any
      selectMostRecent = false;
    }

    this.sessionsLoading.set(true);
    this.sessionsError.set(null);

    try {
      const firestore = await this.ensureFirestore();
      const firestoreModule = await import('firebase/firestore');
      
      let snapshot;
      
      // If goalId is provided, try to filter by goalId
      if (goalId) {
        try {
          // Try query with goalId filter and orderBy
          const sessionsQuery = firestoreModule.query(
            firestoreModule.collection(firestore, 'userProfiles', profile.userId, 'aiChats'),
            firestoreModule.where('goalId', '==', goalId),
            firestoreModule.orderBy('updatedAt', 'desc')
          );
          snapshot = await firestoreModule.getDocs(sessionsQuery);
        } catch (queryError: any) {
          // If query fails (e.g., missing index), fall back to loading all and filtering client-side
          console.warn('Query with goalId filter failed, falling back to client-side filter:', queryError);
          const allSessionsQuery = firestoreModule.query(
            firestoreModule.collection(firestore, 'userProfiles', profile.userId, 'aiChats'),
            firestoreModule.orderBy('updatedAt', 'desc')
          );
          const allSnapshot = await firestoreModule.getDocs(allSessionsQuery);
          // Filter client-side
          snapshot = {
            docs: allSnapshot.docs.filter(doc => {
              const data = doc.data() as FirestoreSessionDoc;
              return data.goalId === goalId;
            })
          } as any;
        }
      } else {
        // Load all sessions
        const sessionsQuery = firestoreModule.query(
          firestoreModule.collection(firestore, 'userProfiles', profile.userId, 'aiChats'),
          firestoreModule.orderBy('updatedAt', 'desc')
        );
        snapshot = await firestoreModule.getDocs(sessionsQuery);
      }
      
      const mapped: ChatSessionMeta[] = snapshot.docs.map((doc: any) => {
        const data = doc.data() as FirestoreSessionDoc;
        return {
          id: doc.id,
          title: data.title || 'Chat',
          createdAt: this.convertToDate(data.createdAt),
          updatedAt: this.convertToDate(data.updatedAt),
          lastMessage: data.lastMessage,
          goalId: data.goalId
        };
      });
      this.sessions.set(mapped);

      // CRITICAL: Only auto-select if preventAutoSelect is NOT set
      // This prevents old sessions from loading when a fresh prompt is pending
      if (selectMostRecent && mapped.length > 0 && !this.preventAutoSelect) {
        // If we're loading for a specific goal and already have a session for that goal, use it
        // Otherwise, load the most recent session
        const targetSessionId = this.currentSessionId() && 
          mapped.find(s => s.id === this.currentSessionId() && s.goalId === goalId)?.id;
        
        if (targetSessionId) {
          // Already have the right session loaded
          return;
        } else {
          // Load the most recent session for this goal
          await this.loadSession(mapped[0].id);
        }
      }
    } catch (error: any) {
      console.error('Failed to load chat sessions', error);
      this.sessionsError.set(error?.message || 'Unable to load chat history');
    } finally {
      this.sessionsLoading.set(false);
    }
  }

  async loadSession(sessionId: string): Promise<void> {
    // Don't load old sessions if a fresh prompt is pending
    if (this.preventAutoSelect) {
      return;
    }

    const profile = this.authService.profile();
    if (!profile?.userId) return;

    this.isLoading.set(true);
    this.error.set(null);

    try {
      const firestore = await this.ensureFirestore();
      const firestoreModule = await import('firebase/firestore');
      const messagesQuery = firestoreModule.query(
        firestoreModule.collection(firestore, 'userProfiles', profile.userId, 'aiChats', sessionId, 'messages'),
        firestoreModule.orderBy('createdAt', 'asc')
      );
      const snapshot = await firestoreModule.getDocs(messagesQuery);
      const loadedMessages: ChatMessage[] = snapshot.docs.map(doc => {
        const data = doc.data() as FirestoreMessageDoc;
        return {
          role: (data as any)['role'] || 'model',
          content: (data as any)['content'] || '',
          timestamp: this.convertToDate((data as any)['createdAt'])
        } as ChatMessage;
      });

      this.messages.set(loadedMessages);
      this.conversationHistory = loadedMessages.map(msg => ({ role: msg.role, content: msg.content })).slice(-20);
      this.currentSessionId.set(sessionId);

      const sessionMeta = this.sessions().find(s => s.id === sessionId);
      this.currentSessionTitle.set(sessionMeta?.title || 'Chat');
      this.currentSessionCreatedAt.set(sessionMeta?.createdAt || loadedMessages[0]?.timestamp || new Date());
    } catch (error: any) {
      console.error('Failed to load session messages', error);
      this.error.set(error?.message || 'Unable to load chat');
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Load conversation for a specific goal
   * If a conversation exists for this goal, load it; otherwise start fresh
   */
  async loadConversationForGoal(goalId: string): Promise<void> {
    // Don't load old conversations if a fresh prompt is pending
    if (this.preventAutoSelect) {
      return;
    }

    // If we're already viewing this goal's conversation, don't reload
    if (this.currentGoalId === goalId && this.currentSessionId()) {
      return;
    }

    // Track that we're switching to this goal
    const previousGoalId = this.currentGoalId;
    this.currentGoalId = goalId;

    const profile = this.authService.profile();
    if (!profile?.userId) {
      // If not logged in, just start a new session
      this.startNewSession();
      return;
    }

    try {
      // Try to load sessions for this specific goal (without auto-selecting)
      await this.loadSessionsForCurrentUser(false, goalId);
      
      // If a session exists for this goal, load it
      if (this.sessions().length > 0) {
        // Clear old messages only if we're switching from a different goal
        if (previousGoalId && previousGoalId !== goalId) {
          this.messages.set([]);
          this.conversationHistory = [];
        }
        // Load the most recent session for this goal
        await this.loadSession(this.sessions()[0].id);
      } else {
        // No session found for this goal - clear and start fresh
        // Only clear if we're switching from a different goal
        if (previousGoalId && previousGoalId !== goalId) {
          this.messages.set([]);
          this.conversationHistory = [];
        }
        this.startNewSession();
      }
    } catch (error: any) {
      console.error('Failed to load conversation for goal', error);
      // On error, clear and start fresh
      this.messages.set([]);
      this.conversationHistory = [];
      this.startNewSession();
    }
  }

  startNewSession(): void {
    this.messages.set([]);
    this.conversationHistory = [];
    this.error.set(null);
    this.isLoading.set(false);
    this.currentSessionId.set(null);
    this.currentSessionTitle.set(null);
    this.currentSessionCreatedAt.set(null);
    // Don't clear currentGoalId here - it should persist until explicitly changed
  }

  setPreventAutoSelect(value: boolean): void {
    this.preventAutoSelect = value;
  }

  /**
   * Clear the current goal context to prevent loadConversationForGoal from loading old chats
   * Used when launching a fresh prompt from external sources (rocket-prompt, one-shot)
   */
  clearGoalContext(): void {
    this.currentGoalId = null;
  }

  /**
   * Check if a fresh prompt session is pending (preventAutoSelect is true)
   * This helps child components know not to load goal-specific conversations
   */
  isFreshPromptPending(): boolean {
    return this.preventAutoSelect;
  }

  async deleteSession(sessionId: string): Promise<void> {
    const profile = this.authService.profile();
    if (!profile?.userId) return;

    try {
      const firestore = await this.ensureFirestore();
      const firestoreModule = await import('firebase/firestore');

      // Delete message subcollection
      const messagesRef = firestoreModule.collection(
        firestore,
        'userProfiles',
        profile.userId,
        'aiChats',
        sessionId,
        'messages'
      );
      const messagesSnap = await firestoreModule.getDocs(messagesRef);
      await Promise.all(messagesSnap.docs.map(doc => firestoreModule.deleteDoc(doc.ref)));

      // Delete session doc
      const sessionRef = firestoreModule.doc(firestore, 'userProfiles', profile.userId, 'aiChats', sessionId);
      await firestoreModule.deleteDoc(sessionRef);

      this.sessions.update(list => list.filter(session => session.id !== sessionId));

      if (this.currentSessionId() === sessionId) {
        this.startNewSession();
      }
    } catch (error: any) {
      console.error('Failed to delete session', error);
      this.sessionsError.set(error?.message || 'Unable to delete chat');
    }
  }

  private async ensureActiveSession(initialUserMessage?: string, goalId?: string): Promise<string | null> {
    const profile = this.authService.profile();
    if (!profile?.userId) return null;

    // CRITICAL: If a fresh prompt is pending (preventAutoSelect is true), ALWAYS create a new session
    // Never reuse an existing session when auto-launching - this ensures a fresh chat
    if (this.preventAutoSelect) {
      // Force create a new session - don't reuse existing one
      // Clear current session ID to ensure new session is created
      this.currentSessionId.set(null);
    } else if (this.currentSessionId()) {
      // Normal flow: reuse existing session if available
      return this.currentSessionId();
    }

    try {
      const firestore = await this.ensureFirestore();
      const firestoreModule = await import('firebase/firestore');
      const title = this.buildTitleFromMessage(initialUserMessage || 'New chat');
      const now = firestoreModule.serverTimestamp();
      const sessionData: any = {
        title,
        createdAt: now,
        updatedAt: now,
        lastMessage: initialUserMessage || 'New chat'
      };

      // Add goalId if provided
      if (goalId) {
        sessionData.goalId = goalId;
      }

      const docRef = await firestoreModule.addDoc(
        firestoreModule.collection(firestore, 'userProfiles', profile.userId, 'aiChats'),
        sessionData
      );

      this.currentSessionId.set(docRef.id);
      this.currentSessionTitle.set(title);
      this.currentSessionCreatedAt.set(new Date());

      // Refresh session list but don't override selection
      void this.loadSessionsForCurrentUser(false, goalId);

      return docRef.id;
    } catch (error) {
      console.error('Failed to create chat session', error);
      return null;
    }
  }

  private async persistMessageToSession(sessionId: string | null, message: ChatMessage): Promise<void> {
    const profile = this.authService.profile();
    if (!profile?.userId || !sessionId) return;

    try {
      const firestore = await this.ensureFirestore();
      const firestoreModule = await import('firebase/firestore');
      await firestoreModule.addDoc(
        firestoreModule.collection(
          firestore,
          'userProfiles',
          profile.userId,
          'aiChats',
          sessionId,
          'messages'
        ),
        {
          role: message.role,
          content: message.content,
          createdAt: firestoreModule.serverTimestamp()
        }
      );

      await this.updateSessionMetadata(sessionId, message);
    } catch (error) {
      console.warn('Failed to persist chat message (non-blocking)', error);
    }
  }

  private async updateSessionMetadata(sessionId: string, message: ChatMessage): Promise<void> {
    const profile = this.authService.profile();
    if (!profile?.userId) return;

    try {
      const firestore = await this.ensureFirestore();
      const firestoreModule = await import('firebase/firestore');
      const sessionRef = firestoreModule.doc(firestore, 'userProfiles', profile.userId, 'aiChats', sessionId);
      const updates: Record<string, any> = {
        updatedAt: firestoreModule.serverTimestamp(),
        lastMessage: message.content,
        lastMessageRole: message.role
      };

      // If session title hasn't been set yet, use first user message as title
      if (!this.currentSessionTitle() && message.role === 'user') {
        updates['title'] = this.buildTitleFromMessage(message.content);
      }

      await firestoreModule.updateDoc(sessionRef, updates);

      // Update local cache to keep UI fresh
      this.sessions.update(list => {
        const existing = list.find(item => item.id === sessionId);
        const updated: ChatSessionMeta = {
          id: sessionId,
          title: updates['title'] || existing?.title || this.currentSessionTitle() || 'Chat',
          createdAt: existing?.createdAt || new Date(),
          updatedAt: new Date(),
          lastMessage: message.content
        };

        const without = list.filter(item => item.id !== sessionId);
        return [updated, ...without];
      });

      if (updates['title']) {
        this.currentSessionTitle.set(updates['title']);
      }
      this.currentSessionCreatedAt.set(this.currentSessionCreatedAt() || new Date());
    } catch (error) {
      console.warn('Failed to update session metadata (non-blocking)', error);
    }
  }

  async sendMessage(userMessage: string, goalContext?: RocketGoal | null): Promise<string> {
    if (!userMessage.trim()) {
      throw new Error('Message cannot be empty');
    }

    this.isLoading.set(true);
    this.error.set(null);

    const sessionId = await this.ensureActiveSession(userMessage, goalContext?.id);

    // Add user message to conversation
    const userChatMessage: ChatMessage = {
      role: 'user',
      content: userMessage.trim(),
      timestamp: new Date()
    };
    this.messages.update(msgs => [...msgs, userChatMessage]);
    void this.persistMessageToSession(sessionId, userChatMessage);

    try {
      // Prepare conversation history for context (last 10 messages for efficiency)
      const conversationHistory = this.messages()
        .slice(-10)
        .map(msg => ({
          role: msg.role,
          content: msg.content
        }));

      // Fetch calendar events if goal context is provided
      let calendarEvents: CalendarEventData[] = [];
      if (goalContext?.id) {
        try {
          calendarEvents = await this.calendarEventsService.getEventsByGoalId(goalContext.id);
        } catch (error) {
          console.warn('Failed to fetch calendar events:', error);
          // Continue without calendar events if fetch fails
        }
      }

      // Call the Cloud Function
      const callable = httpsCallable<AIRequest, AIResponse>(
        this.functions,
        'rocketGoalsAI'
      );

      const result = await callable({
        message: userMessage.trim(),
        conversationHistory: conversationHistory.slice(0, -1), // Exclude the current message we just added
        goalContext: goalContext ? {
          id: goalContext.id,
          title: this.getGoalTitle(goalContext),
          primaryGoal: goalContext.primaryGoal || '',
          answers: goalContext.answers || {},
          status: goalContext.status,
          // Include copilot data for app-suite launched goals
          copilot: goalContext.copilot || undefined
        } : undefined,
        calendarEvents: calendarEvents.length > 0 ? calendarEvents.map(event => ({
          id: event.id,
          title: event.title,
          date: event.date.toISOString(),
          time: event.time,
          duration: event.duration,
          color: event.color,
          completed: event.completed,
          description: event.description
        })) : undefined
      });

      // Add AI response to conversation
      const aiChatMessage: ChatMessage = {
        role: 'model',
        content: result.data.response,
        timestamp: new Date()
      };
      this.messages.update(msgs => [...msgs, aiChatMessage]);
      void this.persistMessageToSession(sessionId, aiChatMessage);

      // Add to conversation history
      this.conversationHistory.push({
        role: 'user',
        content: userMessage.trim()
      });
      this.conversationHistory.push({
        role: 'model',
        content: result.data.response
      });

      // Keep only last 20 messages in history to manage context
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20);
      }

      return result.data.response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get AI response';
      this.error.set(errorMessage);

      // Remove the user message if we failed
      this.messages.update(msgs => msgs.slice(0, -1));

      throw new Error(errorMessage);
    } finally {
      this.isLoading.set(false);
    }
  }

  // Send message but don't add the AI response (let component handle with typewriter)
  async sendMessageWithoutAddingResponse(userMessage: string, goalContext?: RocketGoal | null): Promise<string | { response: string; sideEffects?: SideEffect[] }> {
    if (!userMessage.trim()) {
      throw new Error('Message cannot be empty');
    }

    this.isLoading.set(true);
    this.error.set(null);

    // CRITICAL: If preventAutoSelect is set (fresh prompt pending), ensure we preserve the user message
    // The user message should have been added by triggerAutoLaunch - we need to keep it visible
    if (this.preventAutoSelect && this.messages().length > 0) {
      // Find the user message that matches our prompt (added by triggerAutoLaunch)
      const userMsg = this.messages().find(msg => 
        msg.role === 'user' && msg.content.trim() === userMessage.trim()
      );
      
      if (userMsg) {
        // User message exists - keep ONLY this message, remove everything else (greetings, etc.)
        this.messages.set([userMsg]);
        this.conversationHistory = [];
      } else {
        // User message not found - this shouldn't happen, but clear everything to be safe
        console.warn('User message not found during auto-launch, clearing all messages');
        this.messages.set([]);
        this.conversationHistory = [];
        this.currentSessionId.set(null);
      }
    }

    const sessionId = await this.ensureActiveSession(userMessage, goalContext?.id);

    // CRITICAL: Add user message to conversation (only if not already present)
    // The user message should already be in the messages array from triggerAutoLaunch
    const hasUserMessage = this.messages().some(msg => 
      msg.role === 'user' && msg.content.trim() === userMessage.trim()
    );
    
    if (!hasUserMessage) {
      // User message not found - add it (shouldn't happen, but safety check)
      console.warn('User message missing, adding it');
      const userChatMessage: ChatMessage = {
        role: 'user',
        content: userMessage.trim(),
        timestamp: new Date()
      };
      this.messages.update(msgs => [...msgs, userChatMessage]);
      void this.persistMessageToSession(sessionId, userChatMessage);
    } else {
      // User message already exists - ensure it's persisted to Firestore
      const existingUserMsg = this.messages().find(msg => 
        msg.role === 'user' && msg.content.trim() === userMessage.trim()
      );
      if (existingUserMsg) {
        void this.persistMessageToSession(sessionId, existingUserMsg);
      }
    }

    try {
      // Prepare conversation history for context (last 10 messages for efficiency)
      const conversationHistory = this.messages()
        .slice(-10)
        .map(msg => ({
          role: msg.role,
          content: msg.content
        }));

      // Fetch calendar events if goal context is provided
      let calendarEvents: CalendarEventData[] = [];
      if (goalContext?.id) {
        try {
          calendarEvents = await this.calendarEventsService.getEventsByGoalId(goalContext.id);
        } catch (error) {
          console.warn('Failed to fetch calendar events:', error);
          // Continue without calendar events if fetch fails
        }
      }

      // Call the Cloud Function
      const callable = httpsCallable<AIRequest, AIResponse>(
        this.functions,
        'rocketGoalsAI'
      );

      const result = await callable({
        message: userMessage.trim(),
        conversationHistory: conversationHistory.slice(0, -1),
        goalContext: goalContext ? {
          id: goalContext.id,
          title: this.getGoalTitle(goalContext),
          primaryGoal: goalContext.primaryGoal || '',
          answers: goalContext.answers || {},
          status: goalContext.status,
          // Include copilot data for app-suite launched goals
          copilot: goalContext.copilot || undefined
        } : undefined,
        calendarEvents: calendarEvents.length > 0 ? calendarEvents.map(event => ({
          id: event.id,
          title: event.title,
          date: event.date.toISOString(),
          time: event.time,
          duration: event.duration,
          color: event.color,
          completed: event.completed,
          description: event.description
        })) : undefined
      });

      // Add user message to conversation history (AI will be added when typewriter finishes)
      this.conversationHistory.push({
        role: 'user',
        content: userMessage.trim()
      });

      // Keep only last 20 messages in history to manage context
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20);
      }

      // Return response with side effects if present (calendar actions, etc.)
      if (result.data.sideEffects && result.data.sideEffects.length > 0) {
        return {
          response: result.data.response,
          sideEffects: result.data.sideEffects
        };
      }
      return result.data.response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get AI response';
      this.error.set(errorMessage);

      // Remove the user message if we failed
      this.messages.update(msgs => msgs.slice(0, -1));

      throw new Error(errorMessage);
    } finally {
      this.isLoading.set(false);
    }
  }

  clearConversation(): void {
    this.startNewSession();
  }

  addLocalUserMessage(content: string): void {
    const cleanContent = content.trim();
    if (!cleanContent) {
      return;
    }

    const message: ChatMessage = {
      role: 'user',
      content: cleanContent,
      timestamp: new Date(),
    };

    this.messages.update(msgs => [...msgs, message]);
    void this.ensureActiveSession(cleanContent).then(sessionId => {
      if (sessionId) {
        void this.persistMessageToSession(sessionId, message);
      }
    });
  }

  addAIMessage(content: string): void {
    const cleanContent = content.trim();
    if (!cleanContent) {
      return;
    }

    const message: ChatMessage = {
      role: 'model',
      content: cleanContent,
      timestamp: new Date(),
    };

    this.messages.update(msgs => [...msgs, message]);

    // Also add to conversation history so context is maintained
    this.conversationHistory.push({
      role: 'model',
      content: cleanContent
    });

    const sessionId = this.currentSessionId();
    if (sessionId) {
      void this.persistMessageToSession(sessionId, message);
    }
  }

  addAIMessageWithTimestamp(content: string, timestamp: number): void {
    const message: ChatMessage = {
      role: 'model',
      content: content,
      timestamp: new Date(timestamp),
    };

    this.messages.update(msgs => [...msgs, message]);
  }

  updateMessageContent(timestamp: number, content: string): void {
    this.messages.update(msgs =>
      msgs.map(msg =>
        msg.timestamp.getTime() === timestamp
          ? { ...msg, content }
          : msg
      )
    );
  }

  finalizeMessage(timestamp: number, content: string): void {
    // Update the message content and add to conversation history
    this.updateMessageContent(timestamp, content);
    this.conversationHistory.push({
      role: 'model',
      content: content
    });

    const sessionId = this.currentSessionId();
    if (sessionId) {
      const message: ChatMessage = {
        role: 'model',
        content,
        timestamp: new Date(timestamp)
      };
      void this.persistMessageToSession(sessionId, message);
    }
  }

  private getGoalTitle(goal: RocketGoal): string {
    return goal.answers?.['goal_title_label'] ||
      goal.answers?.['custom_goal_title'] ||
      goal.primaryGoal ||
      'Untitled Goal';
  }
}

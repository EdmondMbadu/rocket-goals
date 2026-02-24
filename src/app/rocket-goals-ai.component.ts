import { Component, inject, signal, computed, ElementRef, ViewChild, AfterViewChecked, Input, OnChanges, SimpleChanges, OnDestroy, Output, EventEmitter, OnInit, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { RocketGoalsAIService, ChatMessage } from './rocket-goals-ai.service';
import { AuthService } from './auth.service';
import { TeamService } from './team.service';
import type { RocketGoal, RocketGoalCopilot } from './models/rocket-goal';
import type { TeamDirectMessage } from './models/team';

type DisplayChatMessage = ChatMessage & {
  source?: 'ai' | 'team-direct';
  sourceId?: string;
  senderName?: string;
  senderAvatarUrl?: string;
  privateMessage?: boolean;
};

@Component({
  selector: 'app-rocket-goals-ai',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './rocket-goals-ai.component.html',
  styleUrl: './rocket-goals-ai.component.css'
})
export class RocketGoalsAIComponent implements OnInit, AfterViewChecked, OnChanges, OnDestroy {
  @Input() goalContext: RocketGoal | null = null;
  @Input() embedded: boolean = false; // New: embedded mode (always visible, no floating)
  @Input() teamContextId: string | null = null;
  @Input() teamParticipantUserId: string | null = null;
  @Input()
  set teamDirectMessages(value: TeamDirectMessage[] | null | undefined) {
    this.teamDirectMessagesInput.set(value || []);
  }
  @Output() eventAction = new EventEmitter<'refresh'>(); // Emit when calendar events are modified
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;
  @ViewChild('messageInput') private messageInput!: ElementRef<HTMLTextAreaElement>;

  private readonly aiService = inject(RocketGoalsAIService);
  private readonly authService = inject(AuthService);
  private readonly teamService = inject(TeamService);
  private readonly router = inject(Router);

  readonly isOpen = this.aiService.isOpen;
  readonly inputMessage = signal('');
  private readonly aiMessages = this.aiService.messages;
  private readonly teamDirectMessagesInput = signal<TeamDirectMessage[]>([]);
  readonly messages = computed<DisplayChatMessage[]>(() => {
    const aiMessages = this.aiMessages().map(message => ({
      ...message,
      source: 'ai' as const,
      sourceId: `ai-${message.timestamp.getTime()}-${message.role}`
    }));
    const currentUserId = this.authService.profile()?.userId || '';
    const directMessages = this.teamDirectMessagesInput()
      .filter(message => !!message?.content?.trim())
      .filter(message => message.senderId !== currentUserId)
      .filter(message => message.senderId !== 'rocket-ai')
      .map(message => {
        const timestampMs = this.getTimestampMillis(message.timestamp) ?? Date.now();
        const sourceId = message.id || `team-${message.senderId}-${timestampMs}`;
        const role: ChatMessage['role'] = 'model';
        return {
          role,
          content: message.content,
          timestamp: new Date(timestampMs),
          source: 'team-direct' as const,
          sourceId,
          senderName: message.senderName,
          senderAvatarUrl: message.senderAvatarUrl,
          privateMessage: true
        };
      });

    const merged = [...aiMessages, ...directMessages];
    merged.sort((left, right) => {
      const leftTime = left.timestamp.getTime();
      const rightTime = right.timestamp.getTime();
      if (leftTime !== rightTime) {
        return leftTime - rightTime;
      }
      return (left.sourceId || '').localeCompare(right.sourceId || '');
    });
    return merged;
  });
  readonly isLoading = this.aiService.isLoading;
  readonly error = this.aiService.error;
  readonly copiedMessageId = signal<number | null>(null);
  readonly hasGreeted = signal(false);
  readonly currentSessionTitle = this.aiService.currentSessionTitle;
  readonly currentSessionCreatedAt = this.aiService.currentSessionCreatedAt;
  readonly attachments = signal<File[]>([]);
  readonly attachmentsUploading = signal(false);
  readonly attachmentsError = signal<string | null>(null);

  private readonly maxAttachmentCount = 4;
  private readonly maxAttachmentSizeBytes = 15 * 1024 * 1024;
  private readonly maxTotalAttachmentSizeBytes = 25 * 1024 * 1024;
  private readonly allowedExtensions = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'webp',
    'pdf', 'txt', 'md', 'csv', 'json',
    'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'
  ]);
  private readonly allowedMimeTypes = new Set([
    'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    'application/pdf', 'text/plain', 'text/markdown', 'text/csv', 'application/json',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]);

  // Typewriter effect state
  readonly typewriterMessageId = signal<number | null>(null);
  readonly typewriterDisplayedText = signal<string>('');
  private typewriterInterval: any = null;

  // Copilot avatar - computed from goalContext
  readonly copilot = computed<RocketGoalCopilot | null>(() => {
    return this.goalContext?.copilot || null;
  });

  private shouldScrollToBottom = false;
  private scrollInterval: any = null;
  private scrollRetryTimeout: ReturnType<typeof setTimeout> | null = null;
  private lastAutoPrompt: string | null = null;
  private greetingTimeout: any = null; // Track greeting timeout to cancel it if auto-launch happens

  constructor() {
    effect(() => {
      const panelVisible = this.embedded || this.isOpen();
      const loading = this.isLoading();
      const messageList = this.messages();
      const lastMessageLength = messageList.length > 0 ? messageList[messageList.length - 1].content.length : 0;

      if (!panelVisible) return;
      if (messageList.length === 0 && !loading) return;

      void lastMessageLength;
      this.queueScrollToBottom();
    });
  }

  ngOnInit(): void {
    // If a fresh prompt is pending (from rocket-prompt or one-shot), don't load old conversations
    // This prevents race conditions where old chat history overwrites the new prompt session
    if (this.aiService.isFreshPromptPending()) {
      // Skip loading goal conversations - a fresh prompt will be processed
      // CRITICAL: Also ensure messages are cleared to prevent old chat from showing
      if (this.aiService.messages().length > 0) {
        this.aiService.startNewSession();
      }
      return;
    }

    // If we have a goal context, load conversation for that goal
    if (this.goalContext?.id) {
      void this.aiService.loadConversationForGoal(this.goalContext.id).then(() => {
        // After loading, check if we should show greeting
        // Wait a bit for messages to load, then check
        setTimeout(() => {
          // Only show greeting if there are NO messages (fresh conversation)
          if (this.embedded && this.goalContext && !this.hasGreeted() && this.messages().length === 0) {
            this.triggerGreeting();
          }
        }, 1200);
      });
    } else {
      // Otherwise, load general sessions
      // BUT: Only if preventAutoSelect is NOT set (i.e., no fresh prompt pending)
      const profile = this.authService.profile();
      if (profile?.userId && this.aiService.sessions().length === 0 && !this.aiService.isFreshPromptPending()) {
        void this.aiService.loadSessionsForCurrentUser();
      }
    }

    // If embedded mode and no goal context, show a greeting for non-logged-in users
    // BUT: Don't show greeting if a fresh prompt is pending (auto-launch scenario)
    if (this.embedded && !this.goalContext && !this.hasGreeted() && this.messages().length === 0 && !this.aiService.isFreshPromptPending()) {
      // Wait a bit for the UI to settle, then trigger greeting
      // Store timeout so we can cancel it if auto-launch happens
      this.greetingTimeout = setTimeout(() => {
        // Double-check: still no messages and no fresh prompt pending
        if (this.messages().length === 0 && !this.aiService.isFreshPromptPending() && !this.hasGreeted()) {
          this.triggerGreetingForNonLoggedIn();
        }
        this.greetingTimeout = null;
      }, 1000);
    }
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // If a fresh prompt is pending, don't load old conversations
    if (this.aiService.isFreshPromptPending()) {
      return;
    }

    // When goal context becomes available or changes, load the conversation for that goal
    if (changes['goalContext']) {
      const previousGoalId = changes['goalContext'].previousValue?.id;
      const currentGoalId = this.goalContext?.id;

      // Only reload if the goal actually changed
      if (currentGoalId && currentGoalId !== previousGoalId) {
        // Reset greeting state when switching goals
        this.hasGreeted.set(false);
        // Load conversation specific to this goal
        void this.aiService.loadConversationForGoal(currentGoalId).then(() => {
          // After loading, check if we should show greeting
          // Wait a bit for messages to load, then check
          setTimeout(() => {
            // Only show greeting if there are NO messages (fresh conversation)
            if (this.embedded && this.goalContext && !this.hasGreeted() && this.messages().length === 0) {
              this.triggerGreeting();
            }
          }, 1200);
        });
      }
    }
  }

  private async triggerGreetingForNonLoggedIn(): Promise<void> {
    // CRITICAL: Never show greeting if a fresh prompt is pending (auto-launch scenario)
    if (this.hasGreeted() || this.messages().length > 0 || this.aiService.isFreshPromptPending()) {
      return;
    }
    this.hasGreeted.set(true);

    // Wait a moment for the UI to settle
    await new Promise(resolve => setTimeout(resolve, 800));

    // CRITICAL: Double-check conditions haven't changed (e.g., auto-launch started)
    if (this.messages().length > 0 || this.aiService.isFreshPromptPending()) {
      this.hasGreeted.set(false); // Reset so it can show next time if needed
      return;
    }

    // Check if user is signed in
    const currentUser = this.authService.profile();
    const isSignedIn = !!currentUser;

    // Create welcoming greeting for non-logged-in users
    let greeting = '';
    if (isSignedIn && currentUser?.firstName) {
      // Signed in but no goal context
      const greetings = [
        `Hey ${currentUser.firstName}! 🚀 I'm here to help you with your goals. What would you like to know?`,
        `Welcome back, ${currentUser.firstName}! 👋 Ask me anything about goal setting or how RocketGoals works!`,
        `${currentUser.firstName}, ready to achieve your goals? 🚀 What can I help you with today?`,
      ];
      greeting = greetings[Math.floor(Math.random() * greetings.length)];
    } else {
      // Not signed in - welcoming greeting
      const greetings = [
        `Hello! 🚀 I'm here to help you with your goals. What would you like to know about RocketGoals?`,
        `Hi there! 👋 Ask me anything about goal setting, productivity, or how RocketGoals can help you achieve your dreams!`,
        `Welcome! 🚀 I'm your AI coach. Feel free to ask me questions about goals, motivation, or how to get started!`,
      ];
      greeting = greetings[Math.floor(Math.random() * greetings.length)];
    }

    // Add the AI greeting with typewriter effect
    this.addMessageWithTypewriter(greeting);
  }

  private async triggerGreeting(): Promise<void> {
    // Prevent duplicate greetings - check multiple conditions
    // IMPORTANT: Only show greeting if there are NO existing messages and no fresh prompt pending
    if (this.hasGreeted() || !this.goalContext || this.messages().length > 0 || this.aiService.isFreshPromptPending()) {
      return;
    }
    
    // Set greeting flag immediately to prevent duplicates
    this.hasGreeted.set(true);

    // Wait a moment for the UI to settle and for any messages to finish loading
    await new Promise(resolve => setTimeout(resolve, 800));

    // CRITICAL: Double-check conditions haven't changed (e.g., auto-launch started)
    // This prevents greeting from appearing after existing conversation loads or auto-launch
    if (this.messages().length > 0 || this.aiService.isFreshPromptPending()) {
      // Messages were loaded or auto-launch started while we waited - don't show greeting
      this.hasGreeted.set(false); // Reset flag so it can show next time if needed
      return;
    }

    // Check if user is signed in
    const currentUser = this.authService.profile();
    const isSignedIn = !!currentUser;

    // Get name: use signed-in user's name, or goal participant's name, or just "hello"
    let firstName = '';
    if (isSignedIn && currentUser?.firstName) {
      firstName = currentUser.firstName;
    } else if (this.goalContext.participant?.firstName) {
      // If not signed in but goal has participant name, just use generic greeting
      firstName = '';
    }

    const goalTitle = this.getGoalTitle(this.goalContext);

    // Create personalized greeting messages
    let greeting = '';
    if (isSignedIn && firstName) {
      // Signed in with name
      const greetings = [
        `Hey ${firstName}! 🚀 I see you're working on "${goalTitle}". What's the one thing you want to accomplish with this today?`,
        `Welcome back, ${firstName}! Ready to make progress on "${goalTitle}"? What's on your mind?`,
        `${firstName}, your mission "${goalTitle}" awaits! What would help you most right now - strategy, motivation, or tracking your progress?`,
      ];
      greeting = greetings[Math.floor(Math.random() * greetings.length)];
    } else {
      // Not signed in - welcoming greeting
      const greetings = [
        `Hello! 🚀 I'm here to help you with your goals. What would you like to know about RocketGoals?`,
        `Hi there! 👋 Ask me anything about goal setting, productivity, or how RocketGoals can help you achieve your dreams!`,
        `Welcome! 🚀 I'm your AI coach. Feel free to ask me questions about goals, motivation, or how to get started!`,
      ];
      greeting = greetings[Math.floor(Math.random() * greetings.length)];
    }

    // Add the AI greeting with typewriter effect
    this.addMessageWithTypewriter(greeting);
  }

  private addMessageWithTypewriter(text: string): void {
    // Add an empty message first
    const timestamp = Date.now();
    this.aiService.addAIMessageWithTimestamp('', timestamp);

    // Start typewriter effect
    this.typewriterMessageId.set(timestamp);
    this.typewriterDisplayedText.set('');

    let charIndex = 0;
    const charsPerTick = 3; // Characters to type per interval tick
    const tickInterval = 1; // ms between ticks (1ms = max speed)

    // Clear any existing interval
    if (this.typewriterInterval) {
      clearInterval(this.typewriterInterval);
    }

    // Start continuous scrolling during typewriter
    this.startContinuousScroll();

    this.typewriterInterval = setInterval(() => {
      if (charIndex < text.length) {
        charIndex = Math.min(charIndex + charsPerTick, text.length);
        this.typewriterDisplayedText.set(text.substring(0, charIndex));
        // Update the actual message in service
        this.aiService.updateMessageContent(timestamp, text.substring(0, charIndex));
      } else {
        // Finished typing
        clearInterval(this.typewriterInterval);
        this.typewriterInterval = null;
        this.typewriterMessageId.set(null);
        this.stopContinuousScroll();
        this.queueScrollToBottom();

        // Finalize the message in service (adds to conversation history)
        this.aiService.finalizeMessage(timestamp, text);
      }
    }, tickInterval);
  }

  private startContinuousScroll(): void {
    if (this.scrollInterval) return;
    this.scrollInterval = setInterval(() => {
      this.scrollToBottom();
    }, 50);
  }

  private stopContinuousScroll(): void {
    if (this.scrollInterval) {
      clearInterval(this.scrollInterval);
      this.scrollInterval = null;
    }
  }

  isTypewriting(message: ChatMessage): boolean {
    return this.typewriterMessageId() === message.timestamp.getTime();
  }

  toggle(): void {
    this.aiService.togglePanel();
    if (this.isOpen()) {
      setTimeout(() => this.messageInput?.nativeElement?.focus(), 100);
    }
  }

  close(): void {
    this.aiService.closePanel();
  }

  ngOnDestroy(): void {
    // Cleanup intervals
    if (this.typewriterInterval) {
      clearInterval(this.typewriterInterval);
    }
    if (this.scrollInterval) {
      clearInterval(this.scrollInterval);
    }
    if (this.scrollRetryTimeout) {
      clearTimeout(this.scrollRetryTimeout);
      this.scrollRetryTimeout = null;
    }
  }

  async sendMessage(): Promise<void> {
    const message = this.inputMessage().trim();
    const pendingAttachments = this.attachments();
    let attachmentContext: Array<{ name: string; text: string; url: string; mimeType: string }> = [];
    if (this.isLoading() || this.attachmentsUploading()) return;
    if (!message && pendingAttachments.length === 0) return;

    this.attachmentsError.set(null);
    let finalMessage = message;
    if (pendingAttachments.length > 0) {
      this.attachmentsUploading.set(true);
      try {
        const uploaded = await this.uploadAttachments(pendingAttachments);
        if (uploaded.length > 0) {
          const attachmentLines = uploaded
            .map(att => `- [${att.name}](${att.url})`)
            .join('\n');
          finalMessage = finalMessage
            ? `${finalMessage}\n\nAttachments:\n${attachmentLines}`
            : `Attachments:\n${attachmentLines}`;
          try {
            attachmentContext = await this.extractAttachmentContext(uploaded);
          } catch (error) {
            console.warn('Attachment extraction failed, sending without context:', error);
            this.attachmentsError.set('Uploaded, but could not read attachment content.');
          }
        }
        this.attachments.set([]);
      } catch (error) {
        console.error('Failed to upload attachments:', error);
        this.attachmentsError.set('Could not upload attachments. Please try again.');
        return;
      } finally {
        this.attachmentsUploading.set(false);
      }
    }

    if (!finalMessage.trim()) return;

    // Allow both logged-in and non-logged-in users to send messages
    this.inputMessage.set('');
    this.queueScrollToBottom();

    // Track if this was an auto-launch to reset preventAutoSelect after sending
    const wasAutoLaunch = this.aiService.isFreshPromptPending();

    try {
      const result = await this.aiService.sendMessageWithoutAddingResponse(
        finalMessage,
        this.goalContext,
        attachmentContext.length > 0 ? attachmentContext : undefined
      );
      // Check if result contains side effects (calendar actions, etc.)
      let aiResponseText = '';
      if (typeof result === 'object' && result !== null && 'response' in result) {
        // Add response with typewriter effect
        aiResponseText = result.response;
        this.addMessageWithTypewriter(result.response);
        // If side effects occurred, notify parent to refresh calendar
        if (result.sideEffects && result.sideEffects.length > 0) {
          console.log('AI actions completed:', result.sideEffects);
          // Small delay to ensure Firestore write is complete
          setTimeout(() => {
            this.eventAction.emit('refresh');
          }, 500);
        }
      } else {
        // Result is just a string (no side effects)
        aiResponseText = result;
        this.addMessageWithTypewriter(result);
      }

      void this.mirrorToTeamDirectConversation(finalMessage, aiResponseText);

      // After message is successfully sent, reset preventAutoSelect if this was an auto-launch
      // This allows normal session loading for future interactions
      if (wasAutoLaunch) {
        // Small delay to ensure message is fully processed
        setTimeout(() => {
          this.aiService.setPreventAutoSelect(false);
        }, 500);
      }
    } catch {
      // Error is already handled in service
      // Still reset preventAutoSelect even on error to prevent blocking future interactions
      if (wasAutoLaunch) {
        this.aiService.setPreventAutoSelect(false);
      }
    }
  }

  handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  onAttachmentSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const files = Array.from(input.files);
    input.value = '';

    const current = this.attachments();
    const next: File[] = [...current];
    let totalSize = next.reduce((sum, file) => sum + file.size, 0);
    this.attachmentsError.set(null);

    for (const file of files) {
      if (next.length >= this.maxAttachmentCount) {
        this.attachmentsError.set(`You can attach up to ${this.maxAttachmentCount} files.`);
        break;
      }
      if (!this.isAllowedFile(file)) {
        this.attachmentsError.set('Unsupported file type. Try PDF, images, or office docs.');
        continue;
      }
      if (file.size > this.maxAttachmentSizeBytes) {
        this.attachmentsError.set('Each file must be 15MB or less.');
        continue;
      }
      if (totalSize + file.size > this.maxTotalAttachmentSizeBytes) {
        this.attachmentsError.set('Total attachments must be 25MB or less.');
        break;
      }
      next.push(file);
      totalSize += file.size;
    }

    this.attachments.set(next);
  }

  removeAttachment(index: number): void {
    const current = [...this.attachments()];
    current.splice(index, 1);
    this.attachments.set(current);
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  clearChat(): void {
    this.aiService.clearConversation();
  }

  startNewChat(): void {
    this.aiService.startNewSession();
  }

  triggerAutoLaunch(promptText: string): void {
    const trimmedPrompt = promptText?.trim();
    if (!trimmedPrompt) {
      return;
    }

    if (this.lastAutoPrompt === trimmedPrompt) {
      return;
    }

    this.lastAutoPrompt = trimmedPrompt;
    
    // CRITICAL: Cancel any pending greeting timeout
    if (this.greetingTimeout) {
      clearTimeout(this.greetingTimeout);
      this.greetingTimeout = null;
    }
    
    // CRITICAL: Prevent greeting from showing during auto-launch - do this FIRST
    this.hasGreeted.set(true);
    
    // CRITICAL: Clear existing chat state IMMEDIATELY before auto-launching
    // This ensures we start with a fresh chat, not appending to existing messages
    // Must be done synchronously to prevent any race conditions with session loading
    this.aiService.setPreventAutoSelect(true);
    this.aiService.startNewSession();
    
    // Double-check messages are cleared (defensive programming)
    if (this.aiService.messages().length > 0) {
      console.warn('Messages not cleared, forcing clear');
      this.aiService.startNewSession();
    }
    
    // CRITICAL: Add the user's prompt as a visible message IMMEDIATELY
    // This ensures the user can see their question before the AI responds
    // We'll add it to the service's messages array directly so it's visible right away
    const userMessage: ChatMessage = {
      role: 'user',
      content: trimmedPrompt,
      timestamp: new Date()
    };
    
    // Add user message to the service - this makes it visible in the UI immediately
    this.aiService.messages.update(msgs => {
      // Remove any existing messages (greetings, etc.) and add only the user message
      return [userMessage];
    });
    
    // Set the input field with the prompt (will be cleared by sendMessage)
    this.inputMessage.set(trimmedPrompt);
    
    // Scroll to bottom to show the new message
    this.queueScrollToBottom();

    // Small delay to ensure UI updates, then send
    // sendMessageWithoutAddingResponse will check if user message exists and preserve it
    setTimeout(() => {
      // Final verification: ensure user message is still there and is the only message
      const currentMessages = this.aiService.messages();
      const userMsg = currentMessages.find(msg => 
        msg.role === 'user' && msg.content.trim() === trimmedPrompt
      );
      
      if (!userMsg) {
        // User message disappeared - add it back
        console.warn('User message disappeared, restoring it');
        this.aiService.messages.set([userMessage]);
      } else if (currentMessages.length > 1) {
        // There are other messages (like greetings) - keep only the user message
        console.warn('Non-user messages detected, clearing them');
        this.aiService.messages.set([userMsg]);
      }
      
      // Now send the message - sendMessageWithoutAddingResponse will preserve the user message
      void this.sendMessage();
    }, 300);
  }

  sendQuickPrompt(prompt: string): void {
    this.inputMessage.set(prompt);
    this.sendMessage();
  }

  formatMessage(content: string): string {
    const safe = this.escapeHtml(content);
    const withMarkdownLinks = safe
      .replace(/^### (.+)$/gm, '<h3 class="ai-heading">$1</h3>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a class="ai-attachment-link" href="$2" target="_blank" rel="noopener noreferrer"><span class="ai-attachment-icon" aria-hidden="true">📎</span><span class="ai-attachment-name">$1</span></a>');
    const withAutoLinks = withMarkdownLinks.replace(/(^|[\s(])((https?:\/\/)[^\s<]+)/g, '$1<a class="ai-link" href="$2" target="_blank" rel="noopener noreferrer">$2</a>');
    return withAutoLinks
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono">$1</code>')
      .replace(/\n/g, '<br>');
  }

  private escapeHtml(content: string): string {
    return content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  trackByTimestamp(index: number, message: DisplayChatMessage): string {
    return `${message.timestamp.getTime()}-${message.source || 'ai'}-${message.sourceId || index}`;
  }

  getGoalSpecificPrompts(): string[] {
    if (!this.goalContext) {
      return [
        'How do I set better goals?',
        'How do I stay motivated?',
        'What is the 7-day challenge?'
      ];
    }

    const goalTitle = this.getGoalTitle(this.goalContext);
    const dailyEffort = this.goalContext.answers?.['daily_effort'];

    return [
      `How can I stay motivated with ${goalTitle}?`,
      `What strategies work for ${dailyEffort || 'daily'} practice?`,
      `How do I overcome obstacles in ${goalTitle}?`
    ];
  }

  private getGoalTitle(goal: any): string {
    return goal.answers?.goal_title_label ||
      goal.answers?.custom_goal_title ||
      goal.primaryGoal ||
      'my goal';
  }

  trackByIndex(index: number): number {
    return index;
  }

  formatSessionTimestamp(date: Date | null): string {
    if (!date) return '';
    return date.toLocaleString();
  }

  private isAllowedFile(file: File): boolean {
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    return this.allowedExtensions.has(extension) || this.allowedMimeTypes.has(file.type);
  }

  private async uploadAttachments(files: File[]): Promise<Array<{ name: string; url: string; size: number; type: string; path: string }>> {
    const profile = this.authService.profile();
    if (!profile?.userId) {
      throw new Error('Sign in required to upload attachments.');
    }

    const appModule = await import('firebase/app');
    const storageModule = await import('firebase/storage');
    const { firebaseConfig } = await import('../../environments/environment');

    const app =
      appModule.getApps().length === 0
        ? appModule.initializeApp(firebaseConfig)
        : appModule.getApp();

    const storage = storageModule.getStorage(app);
    const sessionId = this.aiService.currentSessionId() || 'general';
    const timestamp = Date.now();

    const uploads: Array<{ name: string; url: string; size: number; type: string; path: string }> = [];
    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `ai-attachments/${profile.userId}/${sessionId}/${timestamp}-${safeName}`;
      const storageRef = storageModule.ref(storage, path);
      await storageModule.uploadBytes(storageRef, file);
      const url = await storageModule.getDownloadURL(storageRef);
      uploads.push({ name: file.name, url, size: file.size, type: file.type, path });
    }

    return uploads;
  }

  private async extractAttachmentContext(
    uploads: Array<{ name: string; url: string; size: number; type: string; path: string }>
  ): Promise<Array<{ name: string; text: string; url: string; mimeType: string }>> {
    const appModule = await import('firebase/app');
    const functionsModule = await import('firebase/functions');
    const { firebaseConfig } = await import('../../environments/environment');

    const app =
      appModule.getApps().length === 0
        ? appModule.initializeApp(firebaseConfig)
        : appModule.getApp();

    const functions = functionsModule.getFunctions(app, 'us-central1');
    const extractAttachmentContent = functionsModule.httpsCallable<
      { storagePath: string; fileName: string; mimeType: string },
      { text: string; truncated: boolean; kind: 'text' | 'image' | 'unsupported' }
    >(functions, 'extractAttachmentContent');

    const results = await Promise.all(
      uploads.map(async (upload) => {
        const result = await extractAttachmentContent({
          storagePath: upload.path,
          fileName: upload.name,
          mimeType: upload.type
        });
        return {
          name: upload.name,
          url: upload.url,
          mimeType: upload.type || 'application/octet-stream',
          text: result.data.text || ''
        };
      })
    );

    return results.filter(item => item.text && item.text.trim().length > 0);
  }

  async copyMessage(message: ChatMessage): Promise<void> {
    try {
      // Get plain text content (strip HTML tags for copying)
      const textContent = message.content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();

      await navigator.clipboard.writeText(textContent);

      // Show feedback
      const messageId = message.timestamp.getTime();
      this.copiedMessageId.set(messageId);

      // Reset feedback after 2 seconds
      setTimeout(() => {
        this.copiedMessageId.set(null);
      }, 2000);
    } catch (error) {
      console.error('Failed to copy message:', error);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = message.content.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        const messageId = message.timestamp.getTime();
        this.copiedMessageId.set(messageId);
        setTimeout(() => {
          this.copiedMessageId.set(null);
        }, 2000);
      } catch (err) {
        console.error('Fallback copy failed:', err);
      }
      document.body.removeChild(textArea);
    }
  }

  isCopied(message: ChatMessage): boolean {
    return this.copiedMessageId() === message.timestamp.getTime();
  }

  isPrivateTeamMessage(message: DisplayChatMessage): boolean {
    return message.source === 'team-direct' && !!message.privateMessage;
  }

  getMessageSenderName(message: DisplayChatMessage): string {
    if (this.isPrivateTeamMessage(message)) {
      return message.senderName?.trim() || 'Team Lead';
    }
    return this.copilot()?.name || 'Mission Control AI';
  }

  getMessageSenderInitials(message: DisplayChatMessage): string {
    const name = this.getMessageSenderName(message);
    const tokens = name.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) {
      return 'T';
    }
    if (tokens.length === 1) {
      return tokens[0].charAt(0).toUpperCase();
    }
    return `${tokens[0].charAt(0)}${tokens[tokens.length - 1].charAt(0)}`.toUpperCase();
  }

  private getTimestampMillis(value: any): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    if (value instanceof Date) {
      return value.getTime();
    }
    if (typeof value?.toMillis === 'function') {
      try {
        return value.toMillis();
      } catch {
        return null;
      }
    }
    if (typeof value?.toDate === 'function') {
      try {
        const date = value.toDate();
        return date instanceof Date ? date.getTime() : null;
      } catch {
        return null;
      }
    }
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : null;
  }

  private resolveTeamContext(goalContext?: RocketGoal | null): { teamId: string; participantUserId: string } | null {
    const profile = this.authService.profile();
    const explicitParticipantUserId = (this.teamParticipantUserId || '').trim();
    const participantUserId = explicitParticipantUserId || (profile?.userId || '').trim();
    if (!participantUserId) {
      return null;
    }

    const goal = goalContext || this.goalContext;
    if (!goal) {
      return null;
    }

    const answerTeamId = typeof goal.answers?.['teamId'] === 'string' ? goal.answers['teamId'].trim() : '';
    const deterministicTeamId = (() => {
      if (typeof goal.id !== 'string' || !goal.id.startsWith('team-')) {
        return '';
      }
      const memberMatch = goal.id.match(/^team-(.+?)-member-.+$/);
      if (memberMatch?.[1]) {
        return memberMatch[1].trim();
      }
      return goal.id.slice('team-'.length).trim();
    })();
    const explicitTeamId = (this.teamContextId || '').trim();
    const teamId = explicitTeamId || answerTeamId || deterministicTeamId;
    if (!teamId) {
      return null;
    }

    return { teamId, participantUserId };
  }

  private async mirrorToTeamDirectConversation(userMessage: string, aiResponse: string): Promise<void> {
    const context = this.resolveTeamContext(this.goalContext);
    const profile = this.authService.profile();
    if (!context || !profile?.userId) {
      return;
    }

    const senderName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || profile.email || 'Member';
    try {
      const userContent = userMessage.trim();
      if (!userContent) {
        return;
      }
      await this.teamService.sendDirectMessage(context.teamId, context.participantUserId, {
        senderId: profile.userId,
        senderName,
        senderAvatarUrl: profile.profilePictureUrl,
        content: userContent,
        type: 'text',
        source: 'web'
      });

      const aiContent = aiResponse.trim();
      if (!aiContent) {
        return;
      }
      const aiSenderName = this.copilot()?.name || 'Rocket AI';
      await this.teamService.sendDirectMessage(context.teamId, context.participantUserId, {
        senderId: 'rocket-ai',
        senderName: aiSenderName,
        senderAvatarUrl: this.copilot()?.avatar,
        content: aiContent,
        type: 'text',
        source: 'web'
      });
    } catch (error) {
      console.warn('Unable to mirror AI chat into team direct conversation:', error);
    }
  }

  private scrollToBottom(): void {
    if (this.messagesContainer?.nativeElement) {
      const el = this.messagesContainer.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }

  private queueScrollToBottom(): void {
    this.shouldScrollToBottom = true;

    if (this.scrollRetryTimeout) {
      return;
    }

    let attempts = 0;
    const maxAttempts = 6;
    const tryScroll = () => {
      this.scrollToBottom();
      attempts += 1;

      const hasContainer = !!this.messagesContainer?.nativeElement;
      if (!hasContainer && attempts < maxAttempts) {
        this.scrollRetryTimeout = setTimeout(tryScroll, 60);
        return;
      }

      this.scrollRetryTimeout = null;
    };

    this.scrollRetryTimeout = setTimeout(tryScroll, 0);
  }
}

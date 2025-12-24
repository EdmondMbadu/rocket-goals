import { Component, inject, signal, ElementRef, ViewChild, AfterViewChecked, Input, OnChanges, SimpleChanges, OnDestroy, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { RocketGoalsAIService, ChatMessage } from './rocket-goals-ai.service';
import { AuthService } from './auth.service';
import type { RocketGoal } from './models/rocket-goal';

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
  @Output() eventAction = new EventEmitter<'refresh'>(); // Emit when calendar events are modified
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;
  @ViewChild('messageInput') private messageInput!: ElementRef<HTMLTextAreaElement>;

  private readonly aiService = inject(RocketGoalsAIService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly isOpen = this.aiService.isOpen;
  readonly inputMessage = signal('');
  readonly messages = this.aiService.messages;
  readonly isLoading = this.aiService.isLoading;
  readonly error = this.aiService.error;
  readonly copiedMessageId = signal<number | null>(null);
  readonly hasGreeted = signal(false);
  readonly currentSessionTitle = this.aiService.currentSessionTitle;
  readonly currentSessionCreatedAt = this.aiService.currentSessionCreatedAt;

  // Typewriter effect state
  readonly typewriterMessageId = signal<number | null>(null);
  readonly typewriterDisplayedText = signal<string>('');
  private typewriterInterval: any = null;

  private shouldScrollToBottom = false;
  private scrollInterval: any = null;
  private lastAutoPrompt: string | null = null;

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
      setTimeout(() => {
        // Double-check: still no messages and no fresh prompt pending
        if (this.messages().length === 0 && !this.aiService.isFreshPromptPending()) {
          this.triggerGreetingForNonLoggedIn();
        }
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
    if (this.hasGreeted() || this.messages().length > 0) return;
    this.hasGreeted.set(true);

    // Wait a moment for the UI to settle
    await new Promise(resolve => setTimeout(resolve, 800));

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
    // IMPORTANT: Only show greeting if there are NO existing messages
    if (this.hasGreeted() || !this.goalContext || this.messages().length > 0) {
      return;
    }
    
    // Set greeting flag immediately to prevent duplicates
    this.hasGreeted.set(true);

    // Wait a moment for the UI to settle and for any messages to finish loading
    await new Promise(resolve => setTimeout(resolve, 800));

    // CRITICAL: Double-check messages are still empty before proceeding
    // This prevents greeting from appearing after existing conversation loads
    if (this.messages().length > 0) {
      // Messages were loaded while we waited - don't show greeting
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
        this.shouldScrollToBottom = true;

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
  }

  async sendMessage(): Promise<void> {
    const message = this.inputMessage().trim();
    if (!message || this.isLoading()) return;

    // Allow both logged-in and non-logged-in users to send messages
    this.inputMessage.set('');
    this.shouldScrollToBottom = true;

    // Track if this was an auto-launch to reset preventAutoSelect after sending
    const wasAutoLaunch = this.aiService.isFreshPromptPending();

    try {
      const result = await this.aiService.sendMessageWithoutAddingResponse(message, this.goalContext);
      // Check if result contains side effects (calendar actions, etc.)
      if (typeof result === 'object' && result !== null && 'response' in result) {
        // Add response with typewriter effect
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
        this.addMessageWithTypewriter(result);
      }

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
    
    // CRITICAL: Clear existing chat state IMMEDIATELY before auto-launching
    // This ensures we start with a fresh chat, not appending to existing messages
    // Must be done synchronously to prevent any race conditions with session loading
    this.aiService.setPreventAutoSelect(true);
    this.aiService.startNewSession();
    
    // Prevent greeting from showing during auto-launch
    this.hasGreeted.set(true);
    
    // Double-check messages are cleared (defensive programming)
    if (this.aiService.messages().length > 0) {
      console.warn('Messages not cleared, forcing clear');
      this.aiService.startNewSession();
    }
    
    // CRITICAL: Add the user's prompt as a visible message FIRST
    // This ensures the user can see their question before the AI responds
    const userMessage: ChatMessage = {
      role: 'user',
      content: trimmedPrompt,
      timestamp: new Date()
    };
    this.aiService.messages.update(msgs => [...msgs, userMessage]);
    
    // Set the input field with the prompt (will be cleared by sendMessage)
    this.inputMessage.set(trimmedPrompt);
    
    // Scroll to bottom to show the new message
    this.shouldScrollToBottom = true;

    // Small delay to ensure UI updates and messages are cleared, then send
    // Note: sendMessage() will add the user message again, but we've already added it above
    // This ensures it's visible even if there's a race condition
    setTimeout(() => {
      // Final check: ensure user message is visible
      const currentMessages = this.aiService.messages();
      const hasUserMessage = currentMessages.some(msg => 
        msg.role === 'user' && msg.content.trim() === trimmedPrompt
      );
      
      if (!hasUserMessage) {
        // User message not found, add it again
        console.warn('User message not found, adding it');
        this.aiService.messages.update(msgs => [...msgs, userMessage]);
      }
      
      // Clear any non-user messages that might have appeared (like greetings)
      const nonUserMessages = currentMessages.filter(msg => 
        msg.role !== 'user' || msg.content.trim() !== trimmedPrompt
      );
      if (nonUserMessages.length > 0 && currentMessages.length > 1) {
        // Keep only the user message
        this.aiService.messages.set([userMessage]);
      }
      
      void this.sendMessage();
    }, 200);
  }

  sendQuickPrompt(prompt: string): void {
    this.inputMessage.set(prompt);
    this.sendMessage();
  }

  formatMessage(content: string): string {
    // Basic markdown-like formatting
    return content
      .replace(/^### (.+)$/gm, '<h3 class="ai-heading">$1</h3>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code class="bg-gray-100 px-1 py-0.5 rounded text-sm font-mono">$1</code>')
      .replace(/\n/g, '<br>');
  }

  trackByTimestamp(_index: number, message: ChatMessage): number {
    return message.timestamp.getTime();
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

  private scrollToBottom(): void {
    if (this.messagesContainer?.nativeElement) {
      const el = this.messagesContainer.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }
}

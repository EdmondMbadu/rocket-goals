import { Component, inject, signal, ElementRef, ViewChild, AfterViewChecked, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RocketGoalsAIService, ChatMessage } from './rocket-goals-ai.service';
import type { RocketGoal } from './models/rocket-goal';

@Component({
  selector: 'app-rocket-goals-ai',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './rocket-goals-ai.component.html',
  styleUrl: './rocket-goals-ai.component.css'
})
export class RocketGoalsAIComponent implements AfterViewChecked, OnChanges {
  @Input() goalContext: RocketGoal | null = null;
  @Input() embedded: boolean = false; // New: embedded mode (always visible, no floating)
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;
  @ViewChild('messageInput') private messageInput!: ElementRef<HTMLTextAreaElement>;

  private readonly aiService = inject(RocketGoalsAIService);

  readonly isOpen = this.aiService.isOpen;
  readonly inputMessage = signal('');
  readonly messages = this.aiService.messages;
  readonly isLoading = this.aiService.isLoading;
  readonly error = this.aiService.error;
  readonly copiedMessageId = signal<number | null>(null);
  readonly hasGreeted = signal(false);

  private shouldScrollToBottom = false;

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // When embedded and goal context becomes available, trigger a greeting
    if (changes['goalContext'] && this.embedded && this.goalContext && !this.hasGreeted()) {
      this.triggerGreeting();
    }
  }

  private async triggerGreeting(): Promise<void> {
    if (this.hasGreeted() || !this.goalContext) return;
    this.hasGreeted.set(true);

    // Wait a moment for the UI to settle
    await new Promise(resolve => setTimeout(resolve, 800));

    const firstName = this.goalContext.participant?.firstName || 'there';
    const goalTitle = this.getGoalTitle(this.goalContext);
    
    // Create personalized greeting messages based on goal context
    const greetings = [
      `Hey ${firstName}! 🚀 I see you're working on "${goalTitle}". What's the one thing you want to accomplish with this today?`,
      `Welcome back, ${firstName}! Ready to make progress on "${goalTitle}"? What's on your mind?`,
      `${firstName}, your mission "${goalTitle}" awaits! What would help you most right now - strategy, motivation, or tracking your progress?`,
    ];
    
    const greeting = greetings[Math.floor(Math.random() * greetings.length)];
    
    // Add the AI greeting as a message
    this.aiService.addAIMessage(greeting);
    this.shouldScrollToBottom = true;
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

  async sendMessage(): Promise<void> {
    const message = this.inputMessage().trim();
    if (!message || this.isLoading()) return;

    this.inputMessage.set('');
    this.shouldScrollToBottom = true;

    try {
      await this.aiService.sendMessage(message, this.goalContext);
      this.shouldScrollToBottom = true;
    } catch {
      // Error is already handled in service
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

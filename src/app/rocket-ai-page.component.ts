import { CommonModule } from '@angular/common';
import { Component, ViewChild, computed, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from './auth.service';
import { AvatarDropdownComponent } from './avatar-dropdown.component';
import { RocketGoalsAIComponent } from './rocket-goals-ai.component';
import { RocketGoalsAIService } from './rocket-goals-ai.service';
import { RocketGoalsService } from './rocket-goals.service';
import { ThemeService } from './theme.service';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';

export type GoalTimeframe = 'week' | 'month' | '6months';

@Component({
  selector: 'app-rocket-ai-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RocketGoalsAIComponent, AvatarDropdownComponent],
  templateUrl: './rocket-ai-page.component.html',
  styleUrl: './rocket-ai-page.component.css'
})
export class RocketAiPageComponent implements OnInit {
  protected readonly aiService = inject(RocketGoalsAIService);
  protected readonly authService = inject(AuthService);
  protected readonly goalsService = inject(RocketGoalsService);
  private readonly router = inject(Router);
  private readonly theme = inject(ThemeService);
  private readonly functions = getFunctions(getApp(), 'us-central1');

  protected readonly isDarkMode = this.theme.isDarkMode;
  protected readonly showHistory = signal(true);
  protected readonly isLoggedIn = computed(() => !!this.authService.profile()?.userId);
  protected readonly sessions = this.aiService.sessions;
  protected readonly sessionsLoading = this.aiService.sessionsLoading;
  protected readonly sessionsError = this.aiService.sessionsError;
  protected readonly currentSessionId = this.aiService.currentSessionId;
  protected readonly confirmingDeleteSessionId = signal<string | null>(null);

  // Goal creation modal state
  protected readonly showGoalModal = signal(false);
  protected readonly goalModalStep = signal<1 | 2>(1);
  protected readonly goalDescription = signal('');
  protected readonly selectedTimeframe = signal<GoalTimeframe | null>(null);
  protected readonly isCreatingGoal = signal(false);
  protected readonly goalCreationError = signal<string | null>(null);

  @ViewChild(RocketGoalsAIComponent) aiPanel?: RocketGoalsAIComponent;

  protected readonly starterPrompts = [
    'Give me a focused 7-day launch plan.',
    'What should I do today to keep momentum?',
    'Break my goal into the next three actions.',
    'Write a motivational boost for my mission.'
  ];

  protected readonly timeframeOptions: { value: GoalTimeframe; label: string; description: string }[] = [
    { value: 'week', label: 'Within a week', description: '7-day intensive sprint' },
    { value: 'month', label: 'Within a month', description: '30-day focused journey' },
    { value: '6months', label: 'Within 6 months', description: 'Long-term transformation' }
  ];

  async ngOnInit() {
    if (this.isLoggedIn()) {
      await this.aiService.loadSessionsForCurrentUser();
    }
  }

  protected runPrompt(prompt: string): void {
    if (this.aiPanel) {
      this.aiPanel.sendQuickPrompt(prompt);
    } else {
      this.aiService.addLocalUserMessage(prompt);
    }
  }

  protected async openSession(sessionId: string): Promise<void> {
    await this.aiService.loadSession(sessionId);
  }

  protected startNewChat(): void {
    this.aiService.startNewSession();
  }

  protected openDeleteModal(sessionId: string, event?: Event): void {
    event?.stopPropagation();
    this.confirmingDeleteSessionId.set(sessionId);
  }

  protected cancelDelete(): void {
    this.confirmingDeleteSessionId.set(null);
  }

  protected async confirmDelete(): Promise<void> {
    const sessionId = this.confirmingDeleteSessionId();
    if (!sessionId) return;
    await this.aiService.deleteSession(sessionId);
    this.confirmingDeleteSessionId.set(null);
  }

  protected trackBySession(_index: number, session: { id: string }): string {
    return session.id;
  }

  protected toggleTheme(): void {
    this.theme.toggleDarkMode();
  }

  protected toggleHistory(): void {
    this.showHistory.update((current) => !current);
  }

  // Goal creation modal methods
  protected openGoalModal(): void {
    if (!this.isLoggedIn()) {
      // Redirect to login with return URL
      this.router.navigate(['/login'], {
        queryParams: { redirectTo: '/ai' }
      });
      return;
    }

    // Check if there's any chat content to turn into a goal
    const messages = this.aiService.messages();
    if (messages.length === 0) {
      this.goalCreationError.set('Start a conversation first to turn it into a goal.');
      return;
    }

    this.showGoalModal.set(true);
    this.goalModalStep.set(1);
    this.goalDescription.set('');
    this.selectedTimeframe.set(null);
    this.goalCreationError.set(null);
  }

  protected closeGoalModal(): void {
    this.showGoalModal.set(false);
    this.goalModalStep.set(1);
    this.goalDescription.set('');
    this.selectedTimeframe.set(null);
    this.goalCreationError.set(null);
    this.isCreatingGoal.set(false);
  }

  protected goToStep2(): void {
    if (!this.goalDescription().trim()) {
      this.goalCreationError.set('Please describe your goal.');
      return;
    }
    this.goalCreationError.set(null);
    this.goalModalStep.set(2);
  }

  protected goBackToStep1(): void {
    this.goalModalStep.set(1);
    this.goalCreationError.set(null);
  }

  protected selectTimeframe(timeframe: GoalTimeframe): void {
    this.selectedTimeframe.set(timeframe);
  }

  protected async createGoalFromChat(): Promise<void> {
    if (!this.selectedTimeframe()) {
      this.goalCreationError.set('Please select a timeframe.');
      return;
    }

    const profile = this.authService.profile();
    if (!profile?.userId) {
      this.goalCreationError.set('You must be logged in to create a goal.');
      return;
    }

    this.isCreatingGoal.set(true);
    this.goalCreationError.set(null);

    try {
      // Get the chat context
      const messages = this.aiService.messages();
      const chatContext = messages.map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`).join('\n\n');

      // Calculate the end date based on timeframe
      const now = Date.now();
      const timeframeDays = this.selectedTimeframe() === 'week' ? 7 :
                           this.selectedTimeframe() === 'month' ? 30 : 180;

      // Create the goal
      const goalId = await this.goalsService.createRocketGoal({
        userId: profile.userId,
        primaryGoal: this.goalDescription(),
        answers: {
          goal_title_label: this.goalDescription(),
          timeframe: this.selectedTimeframe(),
          timeframe_days: timeframeDays,
          chat_context: chatContext,
          source: 'ai_chat'
        },
        participant: {
          firstName: profile.firstName || '',
          lastName: profile.lastName || '',
          email: profile.email || ''
        },
        status: 'active',
        entryPoint: 'launch_challenge',
        startTime: now
      });

      // Send email notification via Cloud Function
      try {
        const sendGoalEmail = httpsCallable<{
          goalId: string;
          goalTitle: string;
          timeframe: string;
          userEmail: string;
          userName: string;
        }, { success: boolean }>(this.functions, 'sendGoalCreatedEmail');

        await sendGoalEmail({
          goalId,
          goalTitle: this.goalDescription(),
          timeframe: this.selectedTimeframe()!,
          userEmail: profile.email || '',
          userName: profile.firstName || 'Achiever'
        });
      } catch (emailError) {
        console.warn('Failed to send goal creation email:', emailError);
        // Don't block goal creation if email fails
      }

      // Close modal and navigate to the new goal
      this.closeGoalModal();
      this.router.navigate(['/rocketgoal', goalId]);
    } catch (error: any) {
      console.error('Failed to create goal:', error);
      this.goalCreationError.set(error?.message || 'Failed to create goal. Please try again.');
    } finally {
      this.isCreatingGoal.set(false);
    }
  }
}

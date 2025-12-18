import { CommonModule } from '@angular/common';
import { Component, ViewChild, computed, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { AuthService } from './auth.service';
import { AvatarDropdownComponent } from './avatar-dropdown.component';
import { RocketGoalsAIComponent } from './rocket-goals-ai.component';
import { RocketGoalsAIService } from './rocket-goals-ai.service';
import { RocketGoalsService } from './rocket-goals.service';
import { ThemeService } from './theme.service';
import { VisualizationService } from './visualization.service';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';

export type GoalTimeframe = 'week' | 'month' | '3months';

export interface RocketQuizAnswers {
  goalDescription: string;
  timeframe: GoalTimeframe | null;
  futureSelfClarity: number; // 1-10 scale
  dailyTimeForGoal: string; // time option
  challengePerception: string; // obstacles or growth
  emotionalResilience: string; // yes/no
  dailyConsistency: string; // consistency option
  hasAccountabilitySupport: string; // yes/no
  additionalNotes: string;
}

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
  private readonly route = inject(ActivatedRoute);
  private readonly theme = inject(ThemeService);
  private readonly visualizationService = inject(VisualizationService);
  private readonly functions = getFunctions(getApp(), 'us-central1');
  
  // Flag to track if this is a 7-day challenge
  private readonly isSevenDayChallenge = signal(false);

  protected readonly isDarkMode = this.theme.isDarkMode;
  protected readonly showHistory = signal(true);
  protected readonly isLoggedIn = computed(() => !!this.authService.profile()?.userId);
  protected readonly sessions = this.aiService.sessions;
  protected readonly sessionsLoading = this.aiService.sessionsLoading;
  protected readonly sessionsError = this.aiService.sessionsError;
  protected readonly currentSessionId = this.aiService.currentSessionId;
  protected readonly confirmingDeleteSessionId = signal<string | null>(null);

  // Goal creation modal state (Launch Your GOAL wizard)
  protected readonly showGoalModal = signal(false);
  protected readonly goalModalStep = signal<number>(1);
  protected readonly totalSteps = 9; // Total quiz steps
  protected readonly isCreatingGoal = signal(false);
  protected readonly goalCreationError = signal<string | null>(null);
  protected readonly showAuthPrompt = signal(false);

  // Quiz answers
  protected readonly quizAnswers = signal<RocketQuizAnswers>({
    goalDescription: '',
    timeframe: null,
    futureSelfClarity: 5,
    dailyTimeForGoal: '',
    challengePerception: '',
    emotionalResilience: '',
    dailyConsistency: '',
    hasAccountabilitySupport: '',
    additionalNotes: ''
  });

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
    { value: '3months', label: 'Within 3 months', description: 'Sustained transformation' }
  ];

  protected readonly dailyTimeOptions = [
    { value: 'less-than-30', label: 'Less than 30 minutes' },
    { value: '30-60', label: '30–60 minutes' },
    { value: '1-2-hours', label: '1–2 hours' },
    { value: 'more-than-2', label: 'More than 2 hours' }
  ];

  protected readonly consistencyOptions = [
    { value: 'rarely', label: 'Rarely – I struggle to show up' },
    { value: 'sometimes', label: 'Sometimes – depends on the day' },
    { value: 'often', label: 'Often – I have good habits' },
    { value: 'always', label: 'Always – I never miss a day' }
  ];

  async ngOnInit() {
    if (this.isLoggedIn()) {
      await this.aiService.loadSessionsForCurrentUser();
      // Check if user was redirected back after login with pending goal
      await this.checkPendingGoalCreation();
    }
    
    // Check for 7-day challenge query parameter
    this.route.queryParams.subscribe(params => {
      if (params['sevenDayChallenge'] === 'true') {
        this.isSevenDayChallenge.set(true);
        // Open modal and pre-fill for 7-day challenge
        this.openGoalModalForSevenDayChallenge();
        // Clear the query parameter from URL
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: {},
          replaceUrl: true
        });
      }
    });
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

  // Goal creation modal methods (Launch Your GOAL wizard)
  protected openGoalModal(): void {
    // Always open modal - auth check happens at the end
    this.showGoalModal.set(true);
    this.goalModalStep.set(1);
    this.showAuthPrompt.set(false);
    this.goalCreationError.set(null);
    this.quizAnswers.set({
      goalDescription: '',
      timeframe: null,
      futureSelfClarity: 5,
      dailyTimeForGoal: '',
      challengePerception: '',
      emotionalResilience: '',
      dailyConsistency: '',
      hasAccountabilitySupport: '',
      additionalNotes: ''
    });
  }

  // Open modal specifically for 7-day challenge
  private openGoalModalForSevenDayChallenge(): void {
    this.showGoalModal.set(true);
    this.goalModalStep.set(1);
    this.showAuthPrompt.set(false);
    this.goalCreationError.set(null);
    // Pre-fill with "7Day challenge" and set timeframe to week
    this.quizAnswers.set({
      goalDescription: '7Day challenge',
      timeframe: 'week', // Automatically set to one week
      futureSelfClarity: 5,
      dailyTimeForGoal: '',
      challengePerception: '',
      emotionalResilience: '',
      dailyConsistency: '',
      hasAccountabilitySupport: '',
      additionalNotes: ''
    });
  }

  protected closeGoalModal(): void {
    this.showGoalModal.set(false);
    this.goalModalStep.set(1);
    this.showAuthPrompt.set(false);
    this.goalCreationError.set(null);
    this.isCreatingGoal.set(false);
    // Reset 7-day challenge flag when closing
    this.isSevenDayChallenge.set(false);
  }

  protected updateQuizAnswer<K extends keyof RocketQuizAnswers>(key: K, value: RocketQuizAnswers[K]): void {
    this.quizAnswers.update(current => ({ ...current, [key]: value }));
  }

  protected canProceedToNextStep(): boolean {
    const step = this.goalModalStep();
    const answers = this.quizAnswers();

    switch (step) {
      case 1: return !!answers.goalDescription.trim();
      case 2: return !!answers.timeframe;
      case 3: return answers.futureSelfClarity >= 1 && answers.futureSelfClarity <= 10;
      case 4: return !!answers.dailyTimeForGoal;
      case 5: return !!answers.challengePerception;
      case 6: return !!answers.emotionalResilience;
      case 7: return !!answers.dailyConsistency;
      case 8: return !!answers.hasAccountabilitySupport;
      case 9: return true; // Additional notes is optional
      default: return false;
    }
  }

  protected goToNextStep(): void {
    if (!this.canProceedToNextStep()) {
      this.goalCreationError.set('Please answer this question to continue.');
      return;
    }
    this.goalCreationError.set(null);

    const currentStep = this.goalModalStep();
    
    // For 7-day challenge, skip step 2 (timeframe) since it's already set
    if (this.isSevenDayChallenge() && currentStep === 1) {
      // Skip step 2 and go directly to step 3
      this.goalModalStep.set(3);
    } else if (currentStep < this.totalSteps) {
      this.goalModalStep.set(currentStep + 1);
    } else {
      // Last step - check auth and create goal
      this.handleFinalStep();
    }
  }

  protected goToPreviousStep(): void {
    this.goalCreationError.set(null);
    this.showAuthPrompt.set(false);
    const currentStep = this.goalModalStep();
    
    // For 7-day challenge, skip step 2 when going back
    if (this.isSevenDayChallenge() && currentStep === 3) {
      // Go back to step 1, skipping step 2
      this.goalModalStep.set(1);
    } else if (currentStep > 1) {
      this.goalModalStep.set(currentStep - 1);
    }
  }

  protected handleFinalStep(): void {
    if (!this.isLoggedIn()) {
      // Show auth prompt within the modal
      this.showAuthPrompt.set(true);
    } else {
      this.createGoalFromQuiz();
    }
  }

  protected navigateToAuth(mode: 'login' | 'signup'): void {
    // Store quiz answers in sessionStorage before redirecting
    sessionStorage.setItem('pendingGoalQuiz', JSON.stringify(this.quizAnswers()));
    this.closeGoalModal();
    this.router.navigate([`/${mode}`], {
      queryParams: { redirectTo: '/ai', createGoal: 'true' }
    });
  }

  protected async createGoalFromQuiz(): Promise<void> {
    const profile = this.authService.profile();
    if (!profile?.userId) {
      this.goalCreationError.set('You must be logged in to create a goal.');
      return;
    }

    this.isCreatingGoal.set(true);
    this.goalCreationError.set(null);

    try {
      const answers = this.quizAnswers();

      // Get chat context if available
      const messages = this.aiService.messages();
      const chatContext = messages.length > 0
        ? messages.map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`).join('\n\n')
        : '';

      // Calculate timeframe days
      const now = Date.now();
      const timeframeDays = answers.timeframe === 'week' ? 7 :
                           answers.timeframe === 'month' ? 30 : 90;

      // Create the goal with all quiz data points
      const goalId = await this.goalsService.createRocketGoal({
        userId: profile.userId,
        primaryGoal: answers.goalDescription,
        answers: {
          goal_title_label: answers.goalDescription,
          timeframe: answers.timeframe,
          timeframe_days: timeframeDays,
          chat_context: chatContext,
          source: 'launch_your_goal_quiz',
          // ROCKET quiz data points
          rocket_quiz: {
            futureSelfClarity: answers.futureSelfClarity,
            dailyTimeForGoal: answers.dailyTimeForGoal,
            challengePerception: answers.challengePerception,
            emotionalResilience: answers.emotionalResilience,
            dailyConsistency: answers.dailyConsistency,
            hasAccountabilitySupport: answers.hasAccountabilitySupport,
            additionalNotes: answers.additionalNotes
          }
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
          goalTitle: answers.goalDescription,
          timeframe: answers.timeframe!,
          userEmail: profile.email || '',
          userName: profile.firstName || 'Achiever'
        });
      } catch (emailError) {
        console.warn('Failed to send goal creation email:', emailError);
      }

      // Generate visualization image in the background (don't wait for it)
      this.visualizationService.generateVisualization({
        goalId,
        goalDescription: answers.goalDescription,
        timeframe: answers.timeframe!,
        hasAccountabilitySupport: answers.hasAccountabilitySupport
      }).then(result => {
        if (result.success) {
          console.log('Visualization generated successfully:', result.imageUrl);
        } else {
          console.warn('Failed to generate visualization:', result.message);
        }
      }).catch(error => {
        console.warn('Error generating visualization:', error);
      });

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

  // Check for pending goal creation after login/signup
  async checkPendingGoalCreation(): Promise<void> {
    const pendingQuiz = sessionStorage.getItem('pendingGoalQuiz');
    if (pendingQuiz && this.isLoggedIn()) {
      try {
        const answers = JSON.parse(pendingQuiz) as RocketQuizAnswers;
        this.quizAnswers.set(answers);
        sessionStorage.removeItem('pendingGoalQuiz');
        await this.createGoalFromQuiz();
      } catch (error) {
        console.error('Failed to restore pending goal:', error);
        sessionStorage.removeItem('pendingGoalQuiz');
      }
    }
  }
}

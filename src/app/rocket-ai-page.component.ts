import { CommonModule } from '@angular/common';
import { Component, ViewChild, computed, inject, signal, OnInit, OnDestroy, HostListener, AfterViewInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { AuthService } from './auth.service';
import { AvatarDropdownComponent } from './avatar-dropdown.component';
import { RocketGoalsAIComponent } from './rocket-goals-ai.component';
import { RocketGoalsAIService } from './rocket-goals-ai.service';
import { RocketGoalsLaunchService } from './rocket-goals-launch.service';
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
export class RocketAiPageComponent implements OnInit, OnDestroy, AfterViewInit {
  protected readonly aiService = inject(RocketGoalsAIService);
  protected readonly authService = inject(AuthService);
  protected readonly goalsService = inject(RocketGoalsService);
  private readonly launchService = inject(RocketGoalsLaunchService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly theme = inject(ThemeService);
  private readonly visualizationService = inject(VisualizationService);
  private readonly functions = getFunctions(getApp(), 'us-central1');
  
  // Flag to track if this is a 7-day challenge (exposed for template)
  protected readonly isSevenDayChallenge = signal(false);
  
  // Scroll indicator state
  protected readonly isAtBottom = signal(false);
  private scrollSections: HTMLElement[] = [];
  private currentSectionIndex = 0;

  protected readonly isDarkMode = this.theme.isDarkMode;
  protected readonly showHistory = signal(true);
  protected readonly isLoggedIn = computed(() => !!this.authService.profile()?.userId);
  protected readonly mobileNavOpen = signal(false);
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
  private pendingAutoPrompt: string | null = null;
  private autoPromptHandled = false; // Prevent duplicate prompt handling

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
    const initialParams = this.route.snapshot.queryParamMap;
    const initialAutoPrompt = this.resolveAutoPrompt(
      initialParams.get('autoLaunch'),
      initialParams.get('prompt')
    );
    const shouldOpenLaunchGoal = initialParams.get('launchGoal') === 'true';
    const initialGoalDescription = initialParams.get('goal')?.trim() || '';
    const shouldStartFresh = !!initialAutoPrompt;

    if (this.isLoggedIn()) {
      if (shouldStartFresh) {
        // Mark that we're handling an auto-prompt to prevent duplicate processing
        this.autoPromptHandled = true;
        this.aiService.setPreventAutoSelect(true);
        // Clear any existing goal context to prevent loadConversationForGoal interference
        this.aiService.clearGoalContext();
        // CRITICAL: Start a fresh session to clear all messages before auto-launching
        // This ensures the user's prompt appears in an empty chat, not appended to existing messages
        this.aiService.startNewSession();
        // Queue the prompt BEFORE loading sessions to ensure it's ready
        this.queueAutoLaunch(initialAutoPrompt);
        // Load sessions in background without selecting any (to populate history sidebar)
        void this.aiService.loadSessionsForCurrentUser(false);
      } else {
        await this.aiService.loadSessionsForCurrentUser();
      }
      // Check if user was redirected back after login with pending goal
      await this.checkPendingGoalCreation();
    } else if (shouldStartFresh) {
      // For non-logged-in users with a prompt, ensure fresh state and queue it
      this.autoPromptHandled = true;
      // Clear any existing messages to ensure fresh start
      this.aiService.startNewSession();
      this.queueAutoLaunch(initialAutoPrompt);
    }

    if (shouldOpenLaunchGoal) {
      this.openGoalModal(initialGoalDescription);
    }

    this.route.queryParamMap.subscribe(params => {
      const hasSevenDayChallenge = params.get('sevenDayChallenge') === 'true';
      const hasLaunchGoal = params.get('launchGoal') === 'true';
      const autoLaunchToken = params.get('autoLaunch');
      const inlinePrompt = params.get('prompt');
      const goalDescription = params.get('goal')?.trim() || '';

      if (hasSevenDayChallenge) {
        this.isSevenDayChallenge.set(true);
        // Open modal and pre-fill for 7-day challenge
        this.openGoalModalForSevenDayChallenge();
      } else if (hasLaunchGoal) {
        this.openGoalModal(goalDescription);
      }

      // Only process prompt if we haven't already handled it in ngOnInit
      if (!this.autoPromptHandled) {
        const promptText = this.resolveAutoPrompt(autoLaunchToken, inlinePrompt);
        if (promptText) {
          if (this.isLoggedIn()) {
            this.aiService.setPreventAutoSelect(true);
            this.aiService.clearGoalContext();
            // CRITICAL: Start fresh session to clear all messages before auto-launching
            this.aiService.startNewSession();
          } else {
            // For non-logged-in users, also ensure fresh state
            this.aiService.startNewSession();
          }
          this.queueAutoLaunch(promptText);
        }
      }

      if (hasSevenDayChallenge || hasLaunchGoal || autoLaunchToken || inlinePrompt) {
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: {},
          replaceUrl: true
        });
      }
    });

    // Initialize scroll sections for non-logged-in users
    if (!this.isLoggedIn()) {
      setTimeout(() => {
        this.initializeScrollSections();
        this.checkScrollPosition();
      }, 500);
    }
  }
  
  ngOnDestroy(): void {
    // Cleanup if needed
  }

  ngAfterViewInit(): void {
    if (this.pendingAutoPrompt && this.aiPanel) {
      this.aiPanel.triggerAutoLaunch(this.pendingAutoPrompt);
      this.pendingAutoPrompt = null;
      // DON'T reset preventAutoSelect here - let it stay true until message is sent
      // The sendMessage() method will reset it after the message is successfully sent
    }
  }
  
  @HostListener('window:scroll')
  onWindowScroll(): void {
    if (!this.isLoggedIn()) {
      this.checkScrollPosition();
    }
  }
  
  private initializeScrollSections(): void {
    // Get all landing page sections
    const sections = document.querySelectorAll('.landing-scroll-sections > section');
    this.scrollSections = Array.from(sections) as HTMLElement[];
  }
  
  private checkScrollPosition(): void {
    const windowHeight = window.innerHeight;
    const documentHeight = document.documentElement.scrollHeight;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollBottom = scrollTop + windowHeight;
    
    // Check if we're near the bottom (within 100px)
    const isNearBottom = scrollBottom >= documentHeight - 100;
    this.isAtBottom.set(isNearBottom);
    
    // Update current section index based on scroll position
    if (!isNearBottom && this.scrollSections.length > 0) {
      for (let i = 0; i < this.scrollSections.length; i++) {
        const section = this.scrollSections[i];
        const rect = section.getBoundingClientRect();
        if (rect.top <= windowHeight * 0.5 && rect.bottom > windowHeight * 0.5) {
          this.currentSectionIndex = i;
          break;
        }
      }
    }
  }

  private resolveAutoPrompt(token: string | null, inlinePrompt: string | null): string | null {
    if (token) {
      const storedPrompt = this.launchService.consumePrompt(token);
      if (storedPrompt) {
        return storedPrompt;
      }
    }

    if (inlinePrompt && inlinePrompt.trim()) {
      return inlinePrompt.trim();
    }

    return null;
  }

  private queueAutoLaunch(promptText: string): void {
    if (this.aiPanel) {
      this.aiPanel.triggerAutoLaunch(promptText);
      // DON'T reset preventAutoSelect here - let it stay true until message is sent
      // The sendMessage() method will reset it after the message is successfully sent
      return;
    }
    this.pendingAutoPrompt = promptText;
  }
  
  protected handleScrollIndicatorClick(): void {
    if (this.isAtBottom()) {
      // Scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      // Scroll to next section
      this.scrollToNextSection();
    }
  }
  
  private scrollToNextSection(): void {
    // If we haven't initialized sections yet, try to find them
    if (this.scrollSections.length === 0) {
      this.initializeScrollSections();
    }
    
    if (this.scrollSections.length === 0) {
      // If no sections found, scroll to landing sections start
      const landingSections = document.querySelector('.landing-scroll-sections');
      if (landingSections) {
        landingSections.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }
    
    // Find the next section that's not fully visible
    const windowHeight = window.innerHeight;
    let nextSection: HTMLElement | null = null;
    
    for (let i = this.currentSectionIndex; i < this.scrollSections.length; i++) {
      const section = this.scrollSections[i];
      const rect = section.getBoundingClientRect();
      
      // If section is below the viewport or only partially visible
      if (rect.top > windowHeight * 0.2) {
        nextSection = section;
        this.currentSectionIndex = i;
        break;
      }
    }
    
    // If no next section found, scroll to the last one
    if (!nextSection && this.scrollSections.length > 0) {
      nextSection = this.scrollSections[this.scrollSections.length - 1];
      this.currentSectionIndex = this.scrollSections.length - 1;
    }
    
    if (nextSection) {
      nextSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  protected toggleMobileNav(): void {
    this.mobileNavOpen.set(!this.mobileNavOpen());
  }

  protected closeMobileNav(): void {
    this.mobileNavOpen.set(false);
  }

  protected toggleHistory(): void {
    this.showHistory.update((current) => !current);
  }

  private createEmptyQuizAnswers(goalDescription = '', timeframe: GoalTimeframe | null = null): RocketQuizAnswers {
    return {
      goalDescription,
      timeframe,
      futureSelfClarity: 5,
      dailyTimeForGoal: '',
      challengePerception: '',
      emotionalResilience: '',
      dailyConsistency: '',
      hasAccountabilitySupport: '',
      additionalNotes: ''
    };
  }

  // Goal creation modal methods (Launch Your GOAL wizard)
  protected openGoalModal(goalDescription = ''): void {
    const trimmedGoalDescription = goalDescription.trim();
    // Always open modal - auth check happens at the end
    this.showGoalModal.set(true);
    this.goalModalStep.set(trimmedGoalDescription ? 2 : 1);
    this.showAuthPrompt.set(false);
    this.goalCreationError.set(null);
    this.quizAnswers.set(this.createEmptyQuizAnswers(trimmedGoalDescription));
  }

  // Open modal specifically for 7-day challenge
  private openGoalModalForSevenDayChallenge(): void {
    this.showGoalModal.set(true);
    this.goalModalStep.set(1);
    this.showAuthPrompt.set(false);
    this.goalCreationError.set(null);
    // Set timeframe to week automatically, but leave goal description empty
    this.quizAnswers.set(this.createEmptyQuizAnswers('', 'week'));
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
      queryParams: { redirectTo: '/goals', createGoal: 'true' }
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

      // Generate visualization image first, then send email with the image
      let visualizationImageUrl: string | undefined;
      try {
        // Get user photo from profile for visualization
        let userPhotoBase64: string | null = null;
        if (profile.rocketGoalPhotoUrl) {
          // Convert profile photo URL to base64
          try {
            userPhotoBase64 = await this.imageUrlToBase64(profile.rocketGoalPhotoUrl);
          } catch (error) {
            console.warn('Failed to convert profile photo to base64:', error);
          }
        }

        const visualizationResult = await this.visualizationService.generateVisualization({
          goalId,
          goalDescription: answers.goalDescription,
          timeframe: answers.timeframe!,
          hasAccountabilitySupport: answers.hasAccountabilitySupport,
          userPhotoBase64: userPhotoBase64
        });

        if (visualizationResult.success && visualizationResult.imageUrl) {
          visualizationImageUrl = visualizationResult.imageUrl;
          console.log('Visualization generated successfully:', visualizationImageUrl);
        } else {
          console.warn('Failed to generate visualization:', visualizationResult.message);
        }
      } catch (visualizationError) {
        console.warn('Error generating visualization:', visualizationError);
        // Continue to send email even if visualization fails
      }

      // Send email notification via Cloud Function (with image if available)
      try {
        const sendGoalEmail = httpsCallable<{
          goalId: string;
          goalTitle: string;
          timeframe: string;
          userEmail: string;
          userName: string;
          imageUrl?: string;
        }, { success: boolean }>(this.functions, 'sendGoalCreatedEmail');

        await sendGoalEmail({
          goalId,
          goalTitle: answers.goalDescription,
          timeframe: answers.timeframe!,
          userEmail: profile.email || '',
          userName: profile.firstName || 'Achiever',
          imageUrl: visualizationImageUrl
        });
      } catch (emailError) {
        console.warn('Failed to send goal creation email:', emailError);
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

  /**
   * Convert image URL to base64 data URL for visualization
   */
  private async imageUrlToBase64(imageUrl: string): Promise<string> {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('Error converting image URL to base64:', error);
      throw error;
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

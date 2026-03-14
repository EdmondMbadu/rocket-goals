import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
import { AuthService } from './auth.service';
import { RocketGoalsService } from './rocket-goals.service';
import { VisualizationService } from './visualization.service';
import { RocketGoalsAIService } from './rocket-goals-ai.service';

type GoalTimeframe = 'week' | 'month' | '3months';

interface PendingGoalQuizAnswers {
  goalDescription: string;
  timeframe: GoalTimeframe | null;
  futureSelfClarity: number;
  dailyTimeForGoal: string;
  challengePerception: string;
  emotionalResilience: string;
  dailyConsistency: string;
  hasAccountabilitySupport: string;
  additionalNotes: string;
}

@Component({
  selector: 'app-pending-goal-redirect',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-white px-6 text-center dark:bg-slate-950">
      <div class="max-w-lg">
        <div class="inline-flex items-center gap-3 rounded-full border border-black/10 bg-black px-5 py-3 text-white dark:border-white/10 dark:bg-white dark:text-black">
          <span class="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse"></span>
          <span class="text-xs font-bold uppercase tracking-[0.28em]">Preparing Your RocketGoal</span>
        </div>
        <h1 class="mt-8 text-4xl font-black tracking-tight text-black dark:text-white">
          {{ statusTitle() }}
        </h1>
        <p class="mt-4 text-base leading-relaxed text-black/70 dark:text-slate-300">
          {{ statusMessage() }}
        </p>
      </div>
    </div>
  `
})
export class PendingGoalRedirectComponent {
  private readonly authService = inject(AuthService);
  private readonly goalsService = inject(RocketGoalsService);
  private readonly visualizationService = inject(VisualizationService);
  private readonly aiService = inject(RocketGoalsAIService);
  private readonly router = inject(Router);
  private readonly functions = getFunctions(getApp(), 'us-central1');

  protected readonly statusMessage = signal('Building your dashboard and milestones now.');
  protected readonly statusTitle = computed(() => this.errorMessage() ? 'We hit a snag' : 'Launching your mission');
  private readonly errorMessage = signal<string | null>(null);

  constructor() {
    void this.completePendingGoal();
  }

  private async completePendingGoal(): Promise<void> {
    const pendingQuiz = sessionStorage.getItem('pendingGoalQuiz');
    if (!pendingQuiz) {
      await this.router.navigateByUrl('/goals');
      return;
    }

    try {
      const profile = await this.waitForProfile();
      if (!profile?.userId) {
        await this.router.navigate(['/login'], { queryParams: { redirectTo: '/goal-launch-complete' } });
        return;
      }

      const answers = JSON.parse(pendingQuiz) as PendingGoalQuizAnswers;
      const messages = this.aiService.messages();
      const chatContext = messages.length > 0
        ? messages.map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`).join('\n\n')
        : '';

      const timeframeDays = answers.timeframe === 'week' ? 7 :
        answers.timeframe === 'month' ? 30 : 90;
      const now = Date.now();

      this.statusMessage.set('Creating your RocketGoal and generating milestones.');

      const goalId = await this.goalsService.createRocketGoal({
        userId: profile.userId,
        primaryGoal: answers.goalDescription,
        answers: {
          goal_title_label: answers.goalDescription,
          timeframe: answers.timeframe,
          timeframe_days: timeframeDays,
          chat_context: chatContext,
          source: 'launch_your_goal_quiz',
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

      let visualizationImageUrl: string | undefined;
      try {
        let userPhotoBase64: string | null = null;
        if (profile.rocketGoalPhotoUrl) {
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
          userPhotoBase64
        });

        if (visualizationResult.success && visualizationResult.imageUrl) {
          visualizationImageUrl = visualizationResult.imageUrl;
        }
      } catch (visualizationError) {
        console.warn('Error generating visualization:', visualizationError);
      }

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

      sessionStorage.removeItem('pendingGoalQuiz');
      await this.router.navigate(['/rocketgoal', goalId], { replaceUrl: true });
    } catch (error) {
      console.error('Failed to complete pending goal redirect:', error);
      this.errorMessage.set('We could not finish preparing your goal right now.');
      this.statusMessage.set('Redirecting you to your dashboard so you can try again.');
      sessionStorage.removeItem('pendingGoalQuiz');
      setTimeout(() => {
        void this.router.navigateByUrl('/goals', { replaceUrl: true });
      }, 1200);
    }
  }

  private async waitForProfile(): Promise<ReturnType<AuthService['profile']>> {
    const immediate = this.authService.profile();
    if (immediate?.userId) {
      return immediate;
    }

    for (let attempt = 0; attempt < 20; attempt++) {
      await new Promise(resolve => setTimeout(resolve, 100));
      const profile = this.authService.profile();
      if (profile?.userId) {
        return profile;
      }
    }

    return this.authService.profile();
  }

  private async imageUrlToBase64(imageUrl: string): Promise<string> {
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

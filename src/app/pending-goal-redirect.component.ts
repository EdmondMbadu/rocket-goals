import { CommonModule } from '@angular/common';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { AuthService } from './auth.service';
import { RocketGoalsAIService } from './rocket-goals-ai.service';
import { RocketGoalsService } from './rocket-goals.service';
import { VisualizationService } from './visualization.service';

type GoalTimeframe = 'week' | 'month' | '3months' | 'custom';

interface PendingGoalQuizAnswers {
  goalDescription: string;
  timeframe: GoalTimeframe | null;
  customDeadline?: string;
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
    <div class="launch-loading-shell">
      <div class="launch-loading-glow launch-loading-glow-left"></div>
      <div class="launch-loading-glow launch-loading-glow-right"></div>

      <div class="launch-loading-card">
        <div class="launch-loading-badge">
          <span class="launch-loading-badge-dot"></span>
          <span>Preparing Your RocketGoal</span>
        </div>

        <div class="launch-loading-orbit" aria-hidden="true">
          <div class="launch-loading-ring launch-loading-ring-outer"></div>
          <div class="launch-loading-ring launch-loading-ring-middle"></div>
          <div class="launch-loading-ring launch-loading-ring-inner"></div>
          <div class="launch-loading-core">RG</div>
        </div>

        <div class="launch-loading-copy">
          <p class="launch-loading-kicker">Mission launch in progress</p>
          <h1 class="launch-loading-title">{{ statusTitle() }}</h1>
          <p class="launch-loading-message">{{ statusMessage() }}</p>
          @if (goalPreview()) {
            <div class="launch-loading-goal">
              <span class="launch-loading-goal-label">Goal</span>
              <p>{{ goalPreview() }}</p>
            </div>
          }
        </div>

        <div class="launch-loading-progress-wrap" aria-label="Launch progress">
          <div class="launch-loading-progress-head">
            <span>{{ currentPhaseLabel() }}</span>
            <span>{{ progress() }}%</span>
          </div>
          <div class="launch-loading-progress-track">
            <div class="launch-loading-progress-fill" [style.width.%]="progress()"></div>
          </div>
        </div>

        <div class="launch-loading-steps">
          <div class="launch-loading-step" [class.complete]="phaseIndex() > 0" [class.active]="phaseIndex() === 0">
            <span class="launch-loading-step-dot"></span>
            <span>Secure session</span>
          </div>
          <div class="launch-loading-step" [class.complete]="phaseIndex() > 1" [class.active]="phaseIndex() === 1">
            <span class="launch-loading-step-dot"></span>
            <span>Create your goal and milestones</span>
          </div>
          <div class="launch-loading-step" [class.complete]="phaseIndex() > 2" [class.active]="phaseIndex() === 2">
            <span class="launch-loading-step-dot"></span>
            <span>Generate your visual</span>
          </div>
          <div class="launch-loading-step" [class.complete]="phaseIndex() > 3" [class.active]="phaseIndex() === 3">
            <span class="launch-loading-step-dot"></span>
            <span>Finalize dashboard handoff</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .launch-loading-shell {
      min-height: 100vh;
      position: relative;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem 1.25rem;
      background:
        radial-gradient(circle at top left, rgba(239, 68, 68, 0.16), transparent 28%),
        radial-gradient(circle at bottom right, rgba(251, 146, 60, 0.14), transparent 24%),
        linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%);
    }

    :host-context(.dark) .launch-loading-shell {
      background:
        radial-gradient(circle at top left, rgba(239, 68, 68, 0.18), transparent 28%),
        radial-gradient(circle at bottom right, rgba(251, 146, 60, 0.14), transparent 24%),
        linear-gradient(180deg, #020617 0%, #0f172a 100%);
    }

    .launch-loading-glow {
      position: absolute;
      width: 28rem;
      height: 28rem;
      border-radius: 9999px;
      filter: blur(90px);
      opacity: 0.45;
      pointer-events: none;
    }

    .launch-loading-glow-left {
      top: -8rem;
      left: -8rem;
      background: rgba(239, 68, 68, 0.25);
    }

    .launch-loading-glow-right {
      right: -10rem;
      bottom: -10rem;
      background: rgba(249, 115, 22, 0.18);
    }

    .launch-loading-card {
      position: relative;
      z-index: 1;
      width: min(100%, 46rem);
      padding: 2rem;
      border-radius: 2rem;
      border: 1px solid rgba(15, 23, 42, 0.08);
      background: rgba(255, 255, 255, 0.74);
      box-shadow: 0 30px 100px rgba(15, 23, 42, 0.12);
      backdrop-filter: blur(24px);
      text-align: center;
    }

    :host-context(.dark) .launch-loading-card {
      border-color: rgba(255, 255, 255, 0.12);
      background: rgba(15, 23, 42, 0.76);
      box-shadow: 0 30px 100px rgba(2, 6, 23, 0.6);
    }

    .launch-loading-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.75rem;
      border-radius: 9999px;
      padding: 0.85rem 1.1rem;
      border: 1px solid rgba(15, 23, 42, 0.08);
      background: rgba(15, 23, 42, 0.92);
      color: #fff;
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.28em;
      text-transform: uppercase;
    }

    :host-context(.dark) .launch-loading-badge {
      border-color: rgba(255, 255, 255, 0.12);
      background: rgba(255, 255, 255, 0.92);
      color: #020617;
    }

    .launch-loading-badge-dot {
      width: 0.65rem;
      height: 0.65rem;
      border-radius: 9999px;
      background: #ef4444;
      box-shadow: 0 0 16px rgba(239, 68, 68, 0.85);
      animation: pulse-dot 1.5s ease-in-out infinite;
    }

    .launch-loading-orbit {
      position: relative;
      width: 9rem;
      height: 9rem;
      margin: 1.75rem auto 1.5rem;
      display: grid;
      place-items: center;
    }

    .launch-loading-ring {
      position: absolute;
      inset: 0;
      border-radius: 9999px;
      border: 1px solid rgba(239, 68, 68, 0.14);
    }

    .launch-loading-ring-outer {
      animation: spin-orbit 11s linear infinite;
    }

    .launch-loading-ring-middle {
      inset: 0.85rem;
      border-color: rgba(249, 115, 22, 0.22);
      animation: spin-orbit-reverse 8s linear infinite;
    }

    .launch-loading-ring-inner {
      inset: 1.7rem;
      border-color: rgba(15, 23, 42, 0.1);
      animation: pulse-ring 2.4s ease-in-out infinite;
    }

    :host-context(.dark) .launch-loading-ring-inner {
      border-color: rgba(255, 255, 255, 0.12);
    }

    .launch-loading-core {
      width: 4rem;
      height: 4rem;
      border-radius: 9999px;
      display: grid;
      place-items: center;
      background: linear-gradient(135deg, #111827 0%, #ef4444 100%);
      color: #fff;
      font-size: 1rem;
      font-weight: 900;
      letter-spacing: 0.08em;
      box-shadow: 0 18px 45px rgba(239, 68, 68, 0.28);
    }

    .launch-loading-kicker {
      margin: 0;
      color: rgba(15, 23, 42, 0.58);
      font-size: 0.75rem;
      font-weight: 800;
      letter-spacing: 0.26em;
      text-transform: uppercase;
    }

    :host-context(.dark) .launch-loading-kicker {
      color: rgba(226, 232, 240, 0.72);
    }

    .launch-loading-title {
      margin: 0.75rem 0 0;
      color: #020617;
      font-size: clamp(2rem, 4vw, 3.2rem);
      line-height: 0.98;
      font-weight: 900;
      letter-spacing: -0.04em;
    }

    :host-context(.dark) .launch-loading-title {
      color: #fff;
    }

    .launch-loading-message {
      margin: 1rem auto 0;
      max-width: 35rem;
      color: rgba(15, 23, 42, 0.72);
      font-size: 1rem;
      line-height: 1.7;
    }

    :host-context(.dark) .launch-loading-message {
      color: rgba(226, 232, 240, 0.8);
    }

    .launch-loading-goal {
      margin: 1.25rem auto 0;
      max-width: 34rem;
      padding: 1rem 1.1rem;
      border-radius: 1.25rem;
      border: 1px solid rgba(15, 23, 42, 0.08);
      background: rgba(255, 255, 255, 0.55);
      text-align: left;
    }

    :host-context(.dark) .launch-loading-goal {
      border-color: rgba(255, 255, 255, 0.1);
      background: rgba(15, 23, 42, 0.68);
    }

    .launch-loading-goal-label {
      display: block;
      margin-bottom: 0.45rem;
      color: rgba(15, 23, 42, 0.55);
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }

    .launch-loading-goal p {
      margin: 0;
      color: #020617;
      font-size: 1rem;
      line-height: 1.6;
      font-weight: 700;
    }

    :host-context(.dark) .launch-loading-goal-label {
      color: rgba(226, 232, 240, 0.6);
    }

    :host-context(.dark) .launch-loading-goal p {
      color: #fff;
    }

    .launch-loading-progress-wrap {
      margin-top: 1.5rem;
      text-align: left;
    }

    .launch-loading-progress-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      margin-bottom: 0.75rem;
      color: rgba(15, 23, 42, 0.72);
      font-size: 0.92rem;
      font-weight: 700;
    }

    :host-context(.dark) .launch-loading-progress-head {
      color: rgba(226, 232, 240, 0.82);
    }

    .launch-loading-progress-track {
      width: 100%;
      height: 0.85rem;
      overflow: hidden;
      border-radius: 9999px;
      background: rgba(15, 23, 42, 0.08);
    }

    :host-context(.dark) .launch-loading-progress-track {
      background: rgba(255, 255, 255, 0.08);
    }

    .launch-loading-progress-fill {
      height: 100%;
      min-width: 0.85rem;
      border-radius: inherit;
      background: linear-gradient(90deg, #ef4444 0%, #f97316 55%, #facc15 100%);
      box-shadow: 0 10px 30px rgba(239, 68, 68, 0.3);
      transition: width 400ms ease;
    }

    .launch-loading-steps {
      margin-top: 1.4rem;
      display: grid;
      gap: 0.85rem;
      text-align: left;
    }

    .launch-loading-step {
      display: flex;
      align-items: center;
      gap: 0.8rem;
      color: rgba(15, 23, 42, 0.45);
      font-size: 0.94rem;
      font-weight: 600;
      transition: color 180ms ease;
    }

    :host-context(.dark) .launch-loading-step {
      color: rgba(226, 232, 240, 0.42);
    }

    .launch-loading-step-dot {
      width: 0.8rem;
      height: 0.8rem;
      border-radius: 9999px;
      border: 2px solid currentColor;
      flex: 0 0 auto;
    }

    .launch-loading-step.active,
    .launch-loading-step.complete {
      color: #020617;
    }

    :host-context(.dark) .launch-loading-step.active,
    :host-context(.dark) .launch-loading-step.complete {
      color: #fff;
    }

    .launch-loading-step.active .launch-loading-step-dot {
      background: #ef4444;
      border-color: #ef4444;
      box-shadow: 0 0 0 6px rgba(239, 68, 68, 0.12);
    }

    .launch-loading-step.complete .launch-loading-step-dot {
      background: #16a34a;
      border-color: #16a34a;
    }

    @keyframes spin-orbit {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    @keyframes spin-orbit-reverse {
      from { transform: rotate(360deg); }
      to { transform: rotate(0deg); }
    }

    @keyframes pulse-dot {
      0%, 100% { transform: scale(1); opacity: 0.7; }
      50% { transform: scale(1.25); opacity: 1; }
    }

    @keyframes pulse-ring {
      0%, 100% { transform: scale(1); opacity: 0.65; }
      50% { transform: scale(1.06); opacity: 1; }
    }

    @media (max-width: 640px) {
      .launch-loading-card {
        padding: 1.4rem;
        border-radius: 1.6rem;
      }

      .launch-loading-badge {
        letter-spacing: 0.2em;
        font-size: 0.65rem;
      }

      .launch-loading-orbit {
        width: 7.5rem;
        height: 7.5rem;
      }

      .launch-loading-title {
        font-size: 2rem;
      }
    }
  `]
})
export class PendingGoalRedirectComponent implements OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly goalsService = inject(RocketGoalsService);
  private readonly visualizationService = inject(VisualizationService);
  private readonly aiService = inject(RocketGoalsAIService);
  private readonly router = inject(Router);
  private readonly functions = getFunctions(getApp(), 'us-central1');
  private progressInterval: ReturnType<typeof setInterval> | null = null;

  protected readonly statusMessage = signal('Building your dashboard and milestones now.');
  protected readonly statusTitle = computed(() => this.errorMessage() ? 'We hit a snag' : 'Launching your mission');
  protected readonly currentPhaseLabel = computed(() => this.phaseLabels[Math.min(this.phaseIndex(), this.phaseLabels.length - 1)]);
  protected readonly progress = signal(8);
  protected readonly phaseIndex = signal(0);
  protected readonly goalPreview = signal('');
  private readonly errorMessage = signal<string | null>(null);
  private readonly phaseLabels = [
    'Secure session',
    'Create goal',
    'Generate visual',
    'Finalize and redirect',
    'Ready'
  ];
  private readonly phaseProgressTargets = [18, 56, 82, 94, 100];

  constructor() {
    this.startProgressAnimation();
    void this.completePendingGoal();
  }

  ngOnDestroy(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
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
      this.goalPreview.set(answers.goalDescription?.trim() || '');
      const messages = this.aiService.messages();
      const chatContext = messages.length > 0
        ? messages.map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`).join('\n\n')
        : '';

      const now = Date.now();
      const timeframeDays = this.resolveTimeframeDays(answers, now);
      const deadlineDate = this.resolveDeadlineTimestamp(answers.customDeadline || '');
      const timeframeLabel = this.getExternalTimeframeLabel(answers);

      this.setPhase(1, 'Creating your RocketGoal and generating the first milestone set.');

      const goalId = await this.goalsService.createRocketGoal({
        userId: profile.userId,
        primaryGoal: answers.goalDescription,
        answers: {
          goal_title_label: answers.goalDescription,
          timeframe: answers.timeframe,
          timeframe_days: timeframeDays,
          ...(deadlineDate ? { deadlineDate } : {}),
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
        this.setPhase(2, 'Designing the visual that will anchor this mission.');
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
          timeframe: timeframeLabel,
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
        this.setPhase(3, 'Finalizing your dashboard, notifications, and redirect.');
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
          timeframe: timeframeLabel,
          userEmail: profile.email || '',
          userName: profile.firstName || 'Achiever',
          imageUrl: visualizationImageUrl
        });
      } catch (emailError) {
        console.warn('Failed to send goal creation email:', emailError);
      }

      this.phaseIndex.set(4);
      this.progress.set(100);
      this.statusMessage.set('Your RocketGoal is ready. Opening it now.');
      sessionStorage.removeItem('pendingGoalQuiz');
      await new Promise(resolve => setTimeout(resolve, 350));
      await this.router.navigate(['/rocketgoal', goalId], { replaceUrl: true });
    } catch (error) {
      console.error('Failed to complete pending goal redirect:', error);
      this.errorMessage.set('We could not finish preparing your goal right now.');
      this.statusMessage.set('Redirecting you to your dashboard so you can try again.');
      this.progress.set(100);
      sessionStorage.removeItem('pendingGoalQuiz');
      setTimeout(() => {
        void this.router.navigateByUrl('/goals', { replaceUrl: true });
      }, 1200);
    }
  }

  private setPhase(index: number, message: string): void {
    this.phaseIndex.set(index);
    this.statusMessage.set(message);
  }

  private startProgressAnimation(): void {
    this.progressInterval = setInterval(() => {
      if (this.errorMessage()) {
        return;
      }

      const target = this.phaseProgressTargets[Math.min(this.phaseIndex(), this.phaseProgressTargets.length - 1)];
      this.progress.update(current => current >= target ? current : Math.min(target, current + 1));
    }, 90);
  }

  private resolveDeadlineTimestamp(value: string): number | null {
    const trimmed = String(value || '').trim();
    if (!trimmed) return null;

    const [year, month, day] = trimmed.split('-').map(part => Number(part));
    if (!year || !month || !day) return null;

    const deadline = new Date(year, month - 1, day, 23, 59, 59, 999);
    return Number.isNaN(deadline.getTime()) ? null : deadline.getTime();
  }

  private resolveTimeframeDays(answers: PendingGoalQuizAnswers, startTimeMs: number): number {
    if (answers.timeframe === 'custom') {
      const deadline = this.resolveDeadlineTimestamp(answers.customDeadline || '');
      if (deadline) {
        return Math.max(1, Math.ceil((deadline - startTimeMs) / (1000 * 60 * 60 * 24)));
      }
    }

    if (answers.timeframe === 'week') return 7;
    if (answers.timeframe === 'month') return 30;
    return 90;
  }

  private getExternalTimeframeLabel(answers: PendingGoalQuizAnswers): string {
    if (answers.timeframe === 'custom') {
      const deadline = this.resolveDeadlineTimestamp(answers.customDeadline || '');
      if (deadline) {
        return `by ${new Date(deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
      }
      return 'custom deadline';
    }

    if (answers.timeframe === 'week') return 'Within a week';
    if (answers.timeframe === 'month') return 'Within a month';
    return 'Within 3 months';
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

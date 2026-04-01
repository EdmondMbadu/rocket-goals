import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { Firestore } from 'firebase/firestore';
import { firebaseConfig } from '../../environments/environment';
import { AuthService } from './auth.service';
import {
  GROWTH_ARCHETYPES,
  GROWTH_DIMENSIONS,
  GROWTH_INSIGHTS,
  GROWTH_QUESTIONS,
  type GrowthArchetype,
  type GrowthDimension,
  type GrowthDimensionId,
  type GrowthQuestion
} from './growth-lead.data';
import { ThemeService } from './theme.service';

type GrowthLeadPhase = 'start' | 'quiz' | 'email' | 'results';
type SharePlatform = 'fb' | 'tw' | 'li';
type ShareMode = 'score' | 'link';
type LeadCaptureStatus = 'cloud' | 'local' | 'failed' | null;
type LeadCaptureResult = {
  status: LeadCaptureStatus;
  leadId: string | null;
};

interface DimensionCardView {
  dimension: GrowthDimension;
  score: number;
  insight: { text: string; action: string } | null;
  tone: 'low' | 'mid' | 'high';
}

interface RadarAxisView {
  dimension: GrowthDimension;
  axisX: number;
  axisY: number;
  labelX: number;
  labelY: number;
  pointX: number;
  pointY: number;
  score: number;
  textAnchor: 'start' | 'middle' | 'end';
}

@Component({
  selector: 'app-growth-lead',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './growth-lead.component.html',
  styleUrl: './growth-lead.component.css'
})
export class GrowthLeadComponent {
  protected readonly theme = inject(ThemeService);
  protected readonly authService = inject(AuthService);
  protected readonly dimensions = GROWTH_DIMENSIONS;
  protected readonly questions = GROWTH_QUESTIONS;
  protected readonly researchRefs = [
    'Dweck (2006)',
    'Ericsson (2016)',
    'Fogg (2019)',
    'Deci & Ryan (2000)',
    'Karpathy (2026)',
    'Huang et al. (2025)'
  ];
  protected readonly couponCode = 'Growth2026';

  protected readonly isDarkMode = this.theme.isDarkMode;
  protected readonly phase = signal<GrowthLeadPhase>('start');
  protected readonly currentIndex = signal(0);
  protected readonly answers = signal<Record<number, number>>({});
  protected readonly email = signal('');
  protected readonly emailTouched = signal(false);
  protected readonly emailError = signal('');
  protected readonly selectingAnswer = signal(false);
  protected readonly emailSubmitting = signal(false);
  protected readonly leadCaptureStatus = signal<LeadCaptureStatus>(null);
  protected readonly shareMode = signal<ShareMode>('score');
  protected readonly sharedPlatforms = signal<Record<SharePlatform, boolean>>({
    fb: false,
    tw: false,
    li: false
  });
  protected readonly couponCopied = signal(false);

  private firestoreInstance?: Promise<Firestore>;
  private leadRecordId: string | null = null;
  private leadShareToken = this.createShareToken();
  private readonly questionRanges = this.dimensions.map(dimension => {
    const indices = this.questions
      .map((question, index) => (question.dim === dimension.id ? index : -1))
      .filter(index => index >= 0);

    return {
      id: dimension.id,
      first: indices[0],
      last: indices[indices.length - 1]
    };
  });

  protected readonly currentQuestion = computed<GrowthQuestion | null>(() => {
    if (this.phase() !== 'quiz') {
      return null;
    }
    return this.questions[this.currentIndex()] ?? null;
  });

  protected readonly currentDimension = computed(() => {
    const question = this.currentQuestion();
    if (!question) {
      return null;
    }

    return this.dimensions.find(dimension => dimension.id === question.dim) ?? null;
  });

  protected readonly currentAnswerIndex = computed(() => {
    const answer = this.answers()[this.currentIndex()];
    return typeof answer === 'number' ? answer : null;
  });

  protected readonly progressPercent = computed(() => {
    if (this.phase() !== 'quiz') {
      return 0;
    }
    return Math.round(((this.currentIndex() + 1) / this.questions.length) * 100);
  });

  protected readonly dimensionPills = computed(() => {
    const index = this.currentIndex();

    return this.questionRanges.map(range => {
      let status: 'pending' | 'active' | 'done' = 'pending';
      if (index > range.last) {
        status = 'done';
      } else if (index >= range.first && index <= range.last) {
        status = 'active';
      }

      return {
        dimension: this.dimensions.find(item => item.id === range.id)!,
        status
      };
    });
  });

  protected readonly scores = computed<Record<GrowthDimensionId, number>>(() => {
    const allAnswers = this.answers();
    const base = {} as Record<GrowthDimensionId, number>;

    for (const dimension of this.dimensions) {
      const matchingQuestions = this.questions
        .map((question, index) => ({ question, index }))
        .filter(entry => entry.question.dim === dimension.id);

      const maxScore = matchingQuestions.length * 5;
      let earnedScore = 0;

      for (const entry of matchingQuestions) {
        const answerIndex = allAnswers[entry.index];
        if (typeof answerIndex === 'number') {
          earnedScore += entry.question.options[answerIndex]?.score ?? 0;
        }
      }

      base[dimension.id] = maxScore > 0 ? Math.round((earnedScore / maxScore) * 100) : 0;
    }

    return base;
  });

  protected readonly totalScore = computed(() => {
    const values = Object.values(this.scores());
    if (!values.length) {
      return 0;
    }

    const total = values.reduce((sum, value) => sum + value, 0);
    return Math.round(total / values.length);
  });

  protected readonly currentArchetype = computed<GrowthArchetype>(() => {
    const total = this.totalScore();
    return GROWTH_ARCHETYPES.find(archetype => total >= archetype.min && total <= archetype.max) ?? GROWTH_ARCHETYPES[0];
  });

  protected readonly dimensionCards = computed<DimensionCardView[]>(() => {
    const allScores = this.scores();

    return this.dimensions.map(dimension => {
      const score = allScores[dimension.id] ?? 0;
      const insight = GROWTH_INSIGHTS[dimension.id].find(item => score >= item.min && score <= item.max) ?? null;

      return {
        dimension,
        score,
        insight,
        tone: score >= 70 ? 'high' : score >= 40 ? 'mid' : 'low'
      };
    });
  });

  protected readonly weakestDimension = computed(() => {
    const cards = this.dimensionCards();
    return cards.reduce((lowest, card) => (card.score < lowest.score ? card : lowest), cards[0]);
  });

  protected readonly dimensionSummaryRows = computed(() => this.dimensionCards());

  protected readonly emailValid = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email().trim()));

  protected readonly shareCount = computed(() => {
    const shared = this.sharedPlatforms();
    return (shared.fb ? 1 : 0) + (shared.tw ? 1 : 0) + (shared.li ? 1 : 0);
  });

  protected readonly shareUnlocked = computed(() => this.shareCount() >= 3);

  protected readonly shareText = computed(() => {
    const archetype = this.currentArchetype();
    if (this.shareMode() === 'score') {
      return `I scored ${this.totalScore()}/100 on the RocketGoals Growth Mindset Test - I'm "${archetype.name}". Are you wired to win?`;
    }
    return 'Are you wired to win? Take the RocketGoals Growth Mindset Test and see the invisible patterns shaping your potential.';
  });

  protected readonly captureNotice = computed(() => {
    switch (this.leadCaptureStatus()) {
      case 'cloud':
        return 'Saved to RocketGoals.';
      case 'local':
        return 'Saved locally. Results are unlocked, but cloud capture was unavailable.';
      case 'failed':
        return 'Results unlocked. We could not store this lead.';
      default:
        return '';
    }
  });

  protected readonly radar = computed(() => {
    const centerX = 170;
    const centerY = 158;
    const radius = 100;
    const count = this.dimensions.length;
    const step = (Math.PI * 2) / count;
    const startAngle = -Math.PI / 2;
    const scores = this.scores();

    const polygonPointsForScale = (scale: number) =>
      this.dimensions
        .map((_, index) => {
          const angle = startAngle + index * step;
          return `${centerX + radius * scale * Math.cos(angle)},${centerY + radius * scale * Math.sin(angle)}`;
        })
        .join(' ');

    const axes: RadarAxisView[] = this.dimensions.map((dimension, index) => {
      const angle = startAngle + index * step;
      const axisX = centerX + radius * Math.cos(angle);
      const axisY = centerY + radius * Math.sin(angle);
      const labelX = centerX + (radius + 36) * Math.cos(angle);
      const labelY = centerY + (radius + 36) * Math.sin(angle);
      const textAnchor = Math.abs(Math.cos(angle)) < 0.1 ? 'middle' : Math.cos(angle) > 0 ? 'start' : 'end';
      const score = scores[dimension.id] ?? 0;
      const pointX = centerX + radius * (score / 100) * Math.cos(angle);
      const pointY = centerY + radius * (score / 100) * Math.sin(angle);

      return {
        dimension,
        axisX,
        axisY,
        labelX,
        labelY,
        pointX,
        pointY,
        score,
        textAnchor
      };
    });

    return {
      levels: [0.2, 0.4, 0.6, 0.8, 1].map(scale => ({
        id: `grid-${scale}`,
        points: polygonPointsForScale(scale)
      })),
      axes,
      dataPolygon: axes.map(axis => `${axis.pointX},${axis.pointY}`).join(' ')
    };
  });

  constructor() {
    effect(() => {
      const profile = this.authService.profile();
      const user = this.authService.user();
      const candidate = profile?.email || user?.email || '';

      if (candidate && !this.email()) {
        this.email.set(candidate);
      }
    });
  }

  protected toggleTheme(): void {
    this.theme.toggleDarkMode();
  }

  protected startQuiz(): void {
    this.phase.set('quiz');
    this.currentIndex.set(0);
    this.scrollToTop();
  }

  protected previousQuestion(): void {
    if (this.currentIndex() === 0 || this.selectingAnswer()) {
      return;
    }

    this.currentIndex.update(index => Math.max(0, index - 1));
    this.scrollToTop();
  }

  protected selectOption(optionIndex: number): void {
    if (!this.currentQuestion() || this.selectingAnswer()) {
      return;
    }

    const questionIndex = this.currentIndex();
    this.answers.update(current => ({
      ...current,
      [questionIndex]: optionIndex
    }));
    this.selectingAnswer.set(true);

    window.setTimeout(() => {
      const isLastQuestion = questionIndex >= this.questions.length - 1;
      if (isLastQuestion) {
        this.phase.set('email');
      } else {
        this.currentIndex.update(index => index + 1);
      }

      this.selectingAnswer.set(false);
      this.scrollToTop();
    }, 260);
  }

  protected editAnswers(): void {
    this.phase.set('quiz');
    this.currentIndex.set(Math.max(0, this.questions.length - 1));
    this.scrollToTop();
  }

  protected updateEmail(value: string): void {
    this.email.set(value);

    if (this.emailTouched()) {
      this.validateEmail();
    }
  }

  protected async unlockReport(): Promise<void> {
    this.emailTouched.set(true);

    if (!this.validateEmail() || this.emailSubmitting()) {
      return;
    }

    this.emailSubmitting.set(true);
    const result = await this.persistLead();
    this.leadCaptureStatus.set(result.status);
    this.leadRecordId = result.leadId;

    window.setTimeout(() => {
      this.phase.set('results');
      this.emailSubmitting.set(false);
      this.scrollToTop();
    }, 420);
  }

  protected retake(): void {
    this.phase.set('start');
    this.currentIndex.set(0);
    this.answers.set({});
    this.emailTouched.set(false);
    this.emailError.set('');
    this.shareMode.set('score');
    this.sharedPlatforms.set({ fb: false, tw: false, li: false });
    this.couponCopied.set(false);
    this.leadCaptureStatus.set(null);
    this.leadRecordId = null;
    this.leadShareToken = this.createShareToken();
    this.selectingAnswer.set(false);
    this.emailSubmitting.set(false);
    this.scrollToTop();
  }

  protected setShareMode(mode: ShareMode): void {
    this.shareMode.set(mode);
  }

  protected shareTo(platform: SharePlatform): void {
    const text = encodeURIComponent(this.shareText());
    const url = encodeURIComponent(this.getShareUrl());
    let shareUrl = '';

    if (platform === 'fb') {
      shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${text}`;
    } else if (platform === 'tw') {
      shareUrl = `https://twitter.com/intent/tweet?text=${text}&url=${url}`;
    } else {
      shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${url}`;
    }

    if (typeof window !== 'undefined') {
      window.open(shareUrl, '_blank', 'noopener,noreferrer,width=640,height=640');
    }

    const current = this.sharedPlatforms();
    if (current[platform]) {
      return;
    }

    const nextState = {
      ...current,
      [platform]: true
    };

    this.sharedPlatforms.set(nextState);
    void this.syncShareProgress(nextState);
  }

  protected async copyCoupon(): Promise<void> {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(this.couponCode);
      } else if (typeof document !== 'undefined') {
        const textarea = document.createElement('textarea');
        textarea.value = this.couponCode;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      this.couponCopied.set(true);
      window.setTimeout(() => this.couponCopied.set(false), 1800);
    } catch (error) {
      console.warn('Unable to copy coupon code', error);
    }
  }

  protected toneLabel(score: number): string {
    if (score >= 70) {
      return 'High';
    }
    if (score >= 40) {
      return 'Emerging';
    }
    return 'Needs work';
  }

  protected optionLetter(index: number): string {
    return ['A', 'B', 'C', 'D'][index] ?? `${index + 1}`;
  }

  private async getFirestore(): Promise<Firestore> {
    if (!this.firestoreInstance) {
      this.firestoreInstance = (async () => {
        const appModule = await import('firebase/app');
        const firestoreModule = await import('firebase/firestore');
        const app =
          appModule.getApps().length === 0
            ? appModule.initializeApp(firebaseConfig)
            : appModule.getApp();

        return firestoreModule.getFirestore(app);
      })();
    }

    return this.firestoreInstance;
  }

  private async persistLead(): Promise<LeadCaptureResult> {
    const payload = this.buildLeadPayload();

    try {
      const firestore = await this.getFirestore();
      const firestoreModule = await import('firebase/firestore');

      const docRef = await firestoreModule.addDoc(firestoreModule.collection(firestore, 'bookDownloads'), {
        ...payload,
        downloadedAt: firestoreModule.serverTimestamp()
      });

      return {
        status: 'cloud',
        leadId: docRef.id
      };
    } catch (error) {
      console.warn('Failed to capture growth lead in Firestore, falling back to local storage.', error);
    }

    try {
      if (typeof localStorage !== 'undefined') {
        const key = `growthLead:${Date.now()}`;
        localStorage.setItem(key, JSON.stringify({
          ...payload,
          downloadedAt: new Date().toISOString()
        }));
        return {
          status: 'local',
          leadId: null
        };
      }
    } catch (error) {
      console.warn('Failed to store growth lead locally.', error);
    }

    return {
      status: 'failed',
      leadId: null
    };
  }

  private validateEmail(): boolean {
    const trimmed = this.email().trim();
    this.email.set(trimmed);

    if (!trimmed) {
      this.emailError.set('Enter your email to unlock your report.');
      return false;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      this.emailError.set('Enter a valid email address.');
      return false;
    }

    this.emailError.set('');
    return true;
  }

  private buildLeadPayload() {
    const profile = this.authService.profile();
    const user = this.authService.user();
    const cleanedEmail = this.email().trim().toLowerCase();

    return {
      userId: profile?.userId || profile?.id || user?.uid || null,
      firstName: profile?.firstName || '',
      lastName: profile?.lastName || '',
      email: cleanedEmail,
      hasAccount: !!user,
      bookTitle: 'Growth Lead Quiz',
      leadSource: 'growth-lead',
      quizName: 'growth-mindset-test',
      shareToken: this.leadShareToken,
      sharedPlatforms: { fb: false, tw: false, li: false },
      shareCount: 0,
      codeUnlocked: false,
      codeUnlockedAt: null,
      shareUpdatedAt: null,
      totalScore: this.totalScore(),
      archetype: this.currentArchetype().name,
      scores: this.scores(),
      answers: this.serializedAnswers()
    };
  }

  private serializedAnswers() {
    const allAnswers = this.answers();

    return this.questions.map((question, index) => {
      const answerIndex = allAnswers[index];
      const answer = typeof answerIndex === 'number' ? question.options[answerIndex] : null;

      return {
        questionNumber: index + 1,
        dimension: question.dim,
        scenario: question.scenario,
        answerIndex,
        answerText: answer?.text ?? null,
        score: answer?.score ?? null
      };
    });
  }

  private getShareUrl(): string {
    return 'https://rocketgoals.com/growth-lead';
  }

  private async syncShareProgress(sharedPlatforms: Record<SharePlatform, boolean>): Promise<void> {
    if (this.leadCaptureStatus() !== 'cloud' || !this.leadRecordId) {
      return;
    }

    const shareCount = (sharedPlatforms.fb ? 1 : 0) + (sharedPlatforms.tw ? 1 : 0) + (sharedPlatforms.li ? 1 : 0);
    const codeUnlocked = shareCount >= 3;

    try {
      const firestore = await this.getFirestore();
      const firestoreModule = await import('firebase/firestore');

      await firestoreModule.updateDoc(firestoreModule.doc(firestore, 'bookDownloads', this.leadRecordId), {
        shareToken: this.leadShareToken,
        sharedPlatforms,
        shareCount,
        codeUnlocked,
        shareUpdatedAt: firestoreModule.serverTimestamp(),
        codeUnlockedAt: codeUnlocked ? firestoreModule.serverTimestamp() : null
      });
    } catch (error) {
      console.warn('Unable to sync growth lead share progress.', error);
    }
  }

  private createShareToken(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    return `growth-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  }

  private scrollToTop(): void {
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
}

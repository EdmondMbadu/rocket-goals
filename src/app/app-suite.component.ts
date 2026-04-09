import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from './auth.service';
import { RocketGoalsService } from './rocket-goals.service';
import { ThemeService } from './theme.service';
import { AvatarDropdownComponent } from './avatar-dropdown.component';
import { VisualizationService } from './visualization.service';
import { CommunityCoachService, CommunityCoach } from './community-coach.service';
import { RocketGoalsAIService } from './rocket-goals-ai.service';
import { CoachCatalogService } from './coach-catalog.service';
import { PrebuiltTemplate } from './coach-catalog.data';
import {
  buildCoachPersonalityRefinementPrompt,
  buildFallbackCoachPersonality,
  COACH_CATEGORIES,
  DEFAULT_COACH_PHILOSOPHY,
  normalizeCoachPersonality
} from './coach-builder.util';

@Component({
  selector: 'app-app-suite',
  standalone: true,
  imports: [CommonModule, RouterLink, AvatarDropdownComponent, FormsModule],
  templateUrl: './app-suite.component.html',
  styleUrl: './app-suite.component.css'
})
export class AppSuiteComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly goalsService = inject(RocketGoalsService);
  private readonly theme = inject(ThemeService);
  private readonly visualizationService = inject(VisualizationService);
  private readonly coachCatalogService = inject(CoachCatalogService);
  private readonly communityCoachService = inject(CommunityCoachService);
  private readonly aiService = inject(RocketGoalsAIService);

  protected readonly isDarkMode = this.theme.isDarkMode;
  protected readonly isLoggedIn = computed(() => !!this.authService.profile()?.userId);
  protected readonly isCreating = signal(false);
  protected readonly selectedTemplate = signal<PrebuiltTemplate | null>(null);
  protected readonly showConfirmModal = signal(false);
  protected readonly mobileNavOpen = signal(false);
  protected readonly pageNotice = signal<string | null>(null);

  // Community coaches loaded from Firestore
  readonly communityCoaches = signal<CommunityCoach[]>([]);

  // Wizard state
  readonly showCreateModal = signal(false);
  readonly wizardStep = signal(1);
  readonly wizardSubmitting = signal(false);
  readonly wizardError = signal<string | null>(null);
  forkingCoach: CommunityCoach | null = null;

  // Step 1: Coach Identity
  readonly coachName = signal('');
  readonly coachPersonality = signal('');
  readonly coachCategory = signal('Custom');
  readonly coachAvatarPreview = signal<string | null>(null);
  readonly generatingAvatar = signal(false);
  readonly expandingCoachPersonality = signal(false);
  readonly avatarLightboxOpen = signal(false);
  private coachAvatarData = '';
  protected readonly coachPhilosophyBlurb = signal(DEFAULT_COACH_PHILOSOPHY);

  // Step 2: Goal
  readonly goalPrimaryGoal = signal('');
  readonly goalTheme = signal('career');
  readonly goalDailyEffort = signal('1hour');
  readonly goalObjective1 = signal('');
  readonly goalObjective2 = signal('');
  readonly goalObjective3 = signal('');
  readonly goalAppName = signal('');
  readonly goalTagline = signal('');
  readonly goalDeadline = signal('');

  // Step 3: Visibility
  readonly coachVisibility = signal<'public' | 'private'>('public');

  readonly categories = [...COACH_CATEGORIES];
  readonly themes = [
    { value: 'career', label: 'Career' },
    { value: 'health', label: 'Health' },
    { value: 'finance', label: 'Finance' },
    { value: 'learning', label: 'Learning' },
    { value: 'fitness', label: 'Fitness' },
    { value: 'creative', label: 'Creative' },
    { value: 'personal', label: 'Personal' }
  ];
  readonly effortOptions = [
    { value: '20min', label: '20 minutes' },
    { value: '30min', label: '30 minutes' },
    { value: '1hour', label: '1 hour' },
    { value: '2hours', label: '2 hours' }
  ];

  protected readonly isAdmin = computed(() => {
    const profile = this.authService.profile();
    return profile?.role === 'admin' || profile?.admin === true;
  });

  protected readonly hasMoonshot = computed(() => {
    const plan = this.authService.profile()?.subscriptionPlan;
    if (!plan) return false;
    const hierarchy: Record<string, number> = { moonshot: 1, team: 2, interplanetary: 3, galactic: 4 };
    return (hierarchy[plan] || 0) >= 1;
  });

  prebuiltTemplates: PrebuiltTemplate[] = [];

  async ngOnInit() {
    window.scrollTo({ top: 0, behavior: 'smooth' });

    this.prebuiltTemplates = await this.coachCatalogService.getPrebuiltTemplates();
    this.communityCoaches.set(
      await this.coachCatalogService.getAvailableCommunityCoaches(this.authService.profile()?.userId)
    );

    if (this.isLoggedIn()) {
      await this.checkPendingPrebuilt();
    }
  }

  toggleTheme() {
    this.theme.toggleDarkMode();
  }

  toggleMobileNav(): void {
    this.mobileNavOpen.set(!this.mobileNavOpen());
  }

  closeMobileNav(): void {
    this.mobileNavOpen.set(false);
  }

  selectTemplate(template: PrebuiltTemplate) {
    this.selectedTemplate.set(template);
    this.showConfirmModal.set(true);
  }

  closeConfirmModal() {
    this.showConfirmModal.set(false);
    this.selectedTemplate.set(null);
  }

  // --- Wizard Methods ---

  openCreateCoachWizard() {
    if (!this.isLoggedIn()) {
      sessionStorage.setItem('pendingAction', 'createCoach');
      this.router.navigate(['/signup'], {
        queryParams: { redirectTo: '/app-suite' }
      });
      return;
    }
    this.closeMobileNav();
    this.pageNotice.set(null);
    this.resetWizard();
    this.showCreateModal.set(true);
  }

  closeCreateModal() {
    this.showCreateModal.set(false);
    this.resetWizard();
  }

  private resetWizard() {
    this.wizardStep.set(1);
    this.wizardError.set(null);
    this.wizardSubmitting.set(false);
    this.forkingCoach = null;
    this.coachName.set('');
    this.coachPersonality.set('');
    this.coachCategory.set('Custom');
    this.coachAvatarPreview.set(null);
    this.generatingAvatar.set(false);
    this.expandingCoachPersonality.set(false);
    this.avatarLightboxOpen.set(false);
    this.coachAvatarData = '';
    this.goalPrimaryGoal.set('');
    this.goalTheme.set('career');
    this.goalDailyEffort.set('1hour');
    this.goalObjective1.set('');
    this.goalObjective2.set('');
    this.goalObjective3.set('');
    this.goalAppName.set('');
    this.goalTagline.set('');
    this.goalDeadline.set('');
    this.coachVisibility.set('public');
  }

  nextStep() {
    if (this.wizardStep() === 1) {
      if (!this.coachName().trim()) {
        this.wizardError.set('Please enter a coach name.');
        return;
      }
      if (!this.coachPersonality().trim()) {
        this.wizardError.set('Please describe your coach\'s personality.');
        return;
      }
      this.prefillCoachSetupStep();
      this.wizardError.set(null);
      this.wizardStep.set(2);
      return;
    }

    if (this.forkingCoach && this.wizardStep() === 2) {
      if (!this.goalPrimaryGoal().trim()) {
        this.wizardError.set('Please enter your primary goal.');
        return;
      }
      this.wizardError.set(null);
      this.submitCoach();
      return;
    }

    if (this.wizardStep() === 2) {
      if (!this.goalAppName().trim()) {
        this.wizardError.set('Please enter an app name for your coach.');
        return;
      }
      this.wizardError.set(null);
      this.wizardStep.set(3);
      return;
    }

    this.wizardError.set(null);
    this.wizardStep.set(this.wizardStep() + 1);
  }

  private prefillCoachSetupStep() {
    const name = this.coachName().trim();
    const personality = this.coachPersonality().trim();
    const category = this.coachCategory();

    if (!this.goalAppName()) {
      const appName = name.replace(/^(coach|dr\.?|professor|sensei|mentor)\s+/i, '').trim();
      const formatted = appName.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
      this.goalAppName.set(formatted || name);
    }

    if (!this.goalTagline()) {
      const first = personality.split(/[.!?]/)[0]?.trim();
      this.goalTagline.set(first ? (first.length > 80 ? first.substring(0, 77) + '...' : first) : `Your personal ${category.toLowerCase()} coach`);
    }

    if (!this.goalObjective1() && !this.goalObjective2() && !this.goalObjective3()) {
      const objectives = this.deriveObjectives(personality, category);
      this.goalObjective1.set(objectives[0] || '');
      this.goalObjective2.set(objectives[1] || '');
      this.goalObjective3.set(objectives[2] || '');
    }

    const defaultTheme = this.getThemeForCategory(category);
    if (this.goalTheme() === 'career' && defaultTheme) {
      this.goalTheme.set(defaultTheme);
    }
  }

  private deriveObjectives(personality: string, category: string): string[] {
    const lower = personality.toLowerCase();
    const categoryDefaults: Record<string, string[]> = {
      Business: ['Weekly business reviews', 'Revenue tracking', 'Customer outreach'],
      Health: ['Daily health tracking', 'Nutrition planning', 'Wellness check-ins'],
      Fitness: ['Complete daily workouts', 'Track progress metrics', 'Hit weekly targets'],
      Career: ['Skill development', 'Networking outreach', 'Weekly progress review'],
      Creative: ['Daily creative practice', 'Project milestones', 'Portfolio updates'],
      Learning: ['Daily study sessions', 'Practice exercises', 'Knowledge reviews'],
      Sales: ['Lead generation', 'Follow-up cadence', 'Deal closing'],
      Founder: ['Product development', 'Customer acquisition', 'Revenue milestones'],
      Custom: ['Daily progress', 'Weekly review', 'Hit key milestones']
    };

    const keywordObjectives: [string, string][] = [
      ['workout', 'Complete daily workouts'],
      ['weight', 'Track weight progress'],
      ['nutrition', 'Follow nutrition plan'],
      ['run', 'Complete training runs'],
      ['code', 'Ship code daily'],
      ['writing', 'Write every day'],
      ['sales', 'Close deals consistently'],
      ['marketing', 'Execute marketing campaigns'],
      ['meditat', 'Daily mindfulness practice'],
      ['read', 'Complete reading goals'],
      ['network', 'Build professional network'],
      ['budget', 'Track spending & savings']
    ];

    const matched: string[] = [];
    for (const [keyword, objective] of keywordObjectives) {
      if (lower.includes(keyword) && matched.length < 3) {
        matched.push(objective);
      }
    }

    if (matched.length >= 2) return matched.slice(0, 3);
    return categoryDefaults[category] || categoryDefaults['Custom'];
  }

  private formatDateISO(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  prevStep() {
    this.wizardError.set(null);
    this.wizardStep.set(Math.max(1, this.wizardStep() - 1));
  }

  handleAvatarUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      this.wizardError.set('Image must be under 10 MB.');
      return;
    }

    this.wizardError.set(null);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      this.coachAvatarPreview.set(dataUrl);
      this.coachAvatarData = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  async generateCoachAvatar() {
    const name = this.coachName().trim();
    const description = this.coachPersonality().trim();

    if (!name) {
      this.wizardError.set('Please enter a coach name first.');
      return;
    }
    if (!description) {
      this.wizardError.set('Please describe your coach\'s personality first.');
      return;
    }

    this.generatingAvatar.set(true);
    this.wizardError.set(null);

    try {
      const result = await this.communityCoachService.generateAvatar({
        coachName: name,
        coachDescription: description,
        category: this.coachCategory()
      });

      if (result.success && result.imageUrl) {
        this.coachAvatarPreview.set(result.imageUrl);
        this.coachAvatarData = result.imageUrl;
      } else {
        this.wizardError.set('Could not generate avatar. Try again or upload your own.');
      }
    } catch (error: any) {
      console.error('Avatar generation error:', error);
      this.wizardError.set('Failed to generate avatar. Try again or upload your own image.');
    } finally {
      this.generatingAvatar.set(false);
    }
  }

  async refineCoachPersonality() {
    const seed = this.coachPersonality().trim();
    if (!seed) {
      this.wizardError.set('Start with a short coach description first.');
      return;
    }

    this.expandingCoachPersonality.set(true);
    this.wizardError.set(null);

    try {
      const response = await this.aiService.callAISilent(
        buildCoachPersonalityRefinementPrompt({
          category: this.coachCategory(),
          coachName: this.coachName().trim(),
          philosophy: this.coachPhilosophyBlurb(),
          seed
        })
      );
      const refined = normalizeCoachPersonality(response);
      this.coachPersonality.set(refined);
      this.prefillCoachSetupStep();
    } catch (error) {
      console.warn('Failed to refine coach personality with AI:', error);
      this.coachPersonality.set(
        buildFallbackCoachPersonality({
          seed,
          category: this.coachCategory(),
          coachName: this.coachName().trim()
        })
      );
      this.prefillCoachSetupStep();
    } finally {
      this.expandingCoachPersonality.set(false);
    }
  }

  setVisibility(v: 'public' | 'private') {
    if (v === 'private' && !this.hasMoonshot()) {
      return;
    }
    this.coachVisibility.set(v);
  }

  goToPricing() {
    this.closeCreateModal();
    this.router.navigate(['/pricing']);
  }

  async submitCoach() {
    this.wizardError.set(null);
    this.wizardSubmitting.set(true);

    const profile = this.authService.profile();
    if (!profile?.userId) {
      this.wizardError.set('You must be logged in.');
      this.wizardSubmitting.set(false);
      return;
    }

    const objectives = [
      this.goalObjective1().trim(),
      this.goalObjective2().trim(),
      this.goalObjective3().trim()
    ].filter(Boolean);

    try {
      if (this.forkingCoach) {
        await this.launchGoalWithCoach(profile, objectives);
        return;
      }

      const defaultGoals = this.buildCoachDefaultGoals(objectives);
      const coachPayload = {
        coachName: this.coachName().trim(),
        avatar: this.coachAvatarData,
        soulFilet: this.coachPersonality().trim(),
        appName: this.goalAppName().trim(),
        tagline: this.goalTagline().trim(),
        description: this.coachPersonality().trim(),
        icon: '🎯',
        category: this.coachCategory(),
        visibility: this.coachVisibility(),
        defaultGoals
      };

      const result = await this.communityCoachService.saveCommunityCoach(coachPayload);

      if (!result.success) {
        throw new Error('Failed to save coach.');
      }

      const coach: CommunityCoach = {
        id: result.coachId,
        creatorUserId: profile.userId,
        ...coachPayload
      };

      this.communityCoaches.update((coaches) => [coach, ...coaches.filter((item) => item.id !== coach.id)]);
      this.pageNotice.set(`"${coach.appName}" is ready. Launch your goal from its coach card when you're ready.`);
      this.closeCreateModal();
    } catch (error: any) {
      console.error('Error creating community coach:', error);
      this.wizardError.set(error?.message || 'Something went wrong. Please try again.');
    } finally {
      this.wizardSubmitting.set(false);
    }
  }

  launchCommunityCoach(coach: CommunityCoach) {
    if (!this.isLoggedIn()) {
      this.router.navigate(['/signup'], {
        queryParams: { redirectTo: '/app-suite' }
      });
      return;
    }

    this.closeMobileNav();
    this.pageNotice.set(null);
    this.resetWizard();
    this.forkingCoach = coach;

    this.coachName.set(coach.coachName);
    this.coachPersonality.set(coach.soulFilet || coach.description);
    this.coachCategory.set(coach.category);
    this.coachAvatarPreview.set(coach.avatar || null);
    this.coachAvatarData = coach.avatar || '';

    this.goalAppName.set(coach.appName);
    this.goalTagline.set(coach.tagline || '');
    this.goalPrimaryGoal.set('');
    this.goalTheme.set(coach.defaultGoals?.theme || 'career');
    this.goalDailyEffort.set(coach.defaultGoals?.dailyEffort || '1hour');

    const objs = coach.defaultGoals?.objectives || [];
    this.goalObjective1.set(objs[0] || '');
    this.goalObjective2.set(objs[1] || '');
    this.goalObjective3.set(objs[2] || '');

    const d = new Date();
    d.setDate(d.getDate() + 30);
    this.goalDeadline.set(this.formatDateISO(d));

    this.wizardStep.set(2);
    this.showCreateModal.set(true);
  }

  async deleteCommunityCoachById(coachId: string, event: Event) {
    event.stopPropagation();
    if (!confirm('Delete this community coach? Existing goals using this coach will not be affected.')) return;

    try {
      await this.communityCoachService.deleteCommunityCoach(coachId);
      this.communityCoaches.set(this.communityCoaches().filter(c => c.id !== coachId));
    } catch (error: any) {
      console.error('Error deleting community coach:', error);
      alert(error?.message || 'Failed to delete coach.');
    }
  }

  private buildCoachDefaultGoals(objectives: string[]) {
    return {
      primaryGoal: `Make measurable progress with ${this.goalAppName().trim() || this.coachName().trim()}`,
      theme: this.goalTheme(),
      dailyEffort: this.goalDailyEffort(),
      objectives: objectives.length > 0 ? objectives : ['Make progress']
    };
  }

  private async launchGoalWithCoach(
    profile: {
      userId: string;
      firstName?: string;
      lastName?: string;
      email?: string;
      rocketGoalPhotoUrl?: string;
    },
    objectives: string[]
  ) {
    const coachId = this.forkingCoach!.id;
    const now = Date.now();
    const appName = this.goalAppName().trim();

    const deadlineStr = this.goalDeadline();
    let timeframe: string = 'week';
    let deadlineDate: number | undefined;
    if (deadlineStr) {
      const end = new Date(deadlineStr);
      deadlineDate = end.getTime();
      const totalDays = Math.ceil((deadlineDate - now) / (1000 * 60 * 60 * 24));
      if (totalDays <= 7) timeframe = 'week';
      else if (totalDays <= 30) timeframe = 'month';
      else if (totalDays <= 90) timeframe = '3months';
      else timeframe = '6months';
    }

    const goalId = await this.goalsService.createRocketGoal({
      userId: profile.userId,
      primaryGoal: this.goalPrimaryGoal().trim(),
      answers: {
        goal_title_label: `${appName} Mission`,
        goal_theme: this.goalTheme(),
        goal_theme_label: this.coachCategory(),
        daily_effort: this.goalDailyEffort(),
        source: 'community_coach',
        community_coach_id: coachId,
        community_coach_name: this.coachName().trim(),
        objectives: objectives.length > 0 ? objectives : ['Make progress'],
        custom_goal_title: `${appName} Mission`,
        goalDescription: this.coachPersonality().trim(),
        timeframe,
        ...(deadlineDate ? { deadlineDate } : {})
      },
      participant: {
        firstName: profile.firstName || '',
        lastName: profile.lastName || '',
        email: profile.email || ''
      },
      status: 'active',
      entryPoint: 'launch_challenge',
      startTime: now,
      copilot: {
        avatar: this.coachAvatarData || '/assets/rocket-goals.png',
        name: this.coachName().trim(),
        role: this.coachPersonality().trim()
      }
    });

    this.generateVisualizationAsync(
      goalId,
      appName,
      this.coachPersonality().trim(),
      this.goalPrimaryGoal().trim(),
      profile
    );

    this.closeCreateModal();
    this.router.navigate(['/rocketgoal', goalId]);
  }

  private getThemeForCategory(category: string): string {
    const themeMap: Record<string, string> = {
      Business: 'career',
      Health: 'health',
      Fitness: 'fitness',
      Career: 'career',
      Creative: 'creative',
      Learning: 'learning',
      Sales: 'finance',
      Founder: 'career',
      Custom: 'personal'
    };
    return themeMap[category] || 'personal';
  }

  private async generateVisualizationAsync(
    goalId: string,
    appName: string,
    description: string,
    primaryGoal: string,
    profile: any
  ) {
    try {
      let userPhotoBase64: string | null = null;
      if (profile.rocketGoalPhotoUrl) {
        try {
          userPhotoBase64 = await this.imageUrlToBase64(profile.rocketGoalPhotoUrl);
        } catch { /* ignore */ }
      }
      const vis = await this.visualizationService.generateVisualization({
        goalId,
        goalDescription: `${appName}: ${description}. Goal: ${primaryGoal}`,
        timeframe: 'week',
        hasAccountabilitySupport: 'yes',
        userPhotoBase64
      });
      if (vis.success && vis.imageUrl) {
        await this.goalsService.updateRocketGoal(goalId, { visualizationImageUrl: vis.imageUrl });
      }
    } catch { /* visualization is best-effort */ }
  }

  async launchPrebuilt() {
    const template = this.selectedTemplate();
    if (!template) return;

    if (!this.isLoggedIn()) {
      sessionStorage.setItem('pendingPrebuilt', JSON.stringify(template));
      this.closeConfirmModal();
      this.router.navigate(['/signup'], {
        queryParams: { redirectTo: '/app-suite', createPrebuilt: 'true' }
      });
      return;
    }

    await this.createGoalFromPrebuilt(template);
  }

  async createGoalFromPrebuilt(template: PrebuiltTemplate) {
    const profile = this.authService.profile();
    if (!profile?.userId) {
      this.router.navigate(['/signup'], {
        queryParams: { redirectTo: '/app-suite', createPrebuilt: 'true' }
      });
      return;
    }

    this.isCreating.set(true);

    try {
      const now = Date.now();

      const goalId = await this.goalsService.createRocketGoal({
        userId: profile.userId,
        primaryGoal: template.defaultGoals.primaryGoal,
        answers: {
          goal_title_label: `${template.name} Mission`,
          goal_theme: template.defaultGoals.theme,
          goal_theme_label: template.category,
          daily_effort: template.defaultGoals.dailyEffort,
          source: 'prebuilt_template',
          prebuilt_template_id: template.id,
          prebuilt_template_name: template.name,
          prebuilt_tagline: template.tagline,
          objectives: template.defaultGoals.objectives,
          custom_goal_title: `${template.name} Mission`,
          goalDescription: template.description,
          timeframe: 'week'
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

      this.generateVisualizationAsync(goalId, template.name, template.description, template.defaultGoals.primaryGoal, profile);

      this.closeConfirmModal();
      this.isCreating.set(false);
      this.router.navigate(['/rocketgoal', goalId]);
    } catch (error) {
      console.error('Error creating prebuilt goal:', error);
      this.isCreating.set(false);
    }
  }

  private async imageUrlToBase64(url: string): Promise<string | null> {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('Error converting image URL to base64:', error);
      return null;
    }
  }

  async checkPendingPrebuilt() {
    const pending = sessionStorage.getItem('pendingPrebuilt');
    if (pending && this.isLoggedIn()) {
      try {
        const template = JSON.parse(pending) as PrebuiltTemplate;
        sessionStorage.removeItem('pendingPrebuilt');
        await this.createGoalFromPrebuilt(template);
      } catch (error) {
        console.error('Failed to create pending prebuilt:', error);
        sessionStorage.removeItem('pendingPrebuilt');
      }
    }
  }

  getUserFirstName(): string {
    return this.authService.profile()?.firstName || 'Achiever';
  }

  getCurrentYear(): number {
    return new Date().getFullYear();
  }
}

import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from './auth.service';
import { RocketGoalsService } from './rocket-goals.service';
import { ThemeService } from './theme.service';
import { AvatarDropdownComponent } from './avatar-dropdown.component';
import { VisualizationService } from './visualization.service';
import { CoachPromptsService } from './coach-prompts.service';
import { CommunityCoachService, CommunityCoach } from './community-coach.service';

export interface PrebuiltTemplate {
  id: string;
  name: string;
  tagline: string;
  description: string;
  icon: string;
  imageUrl: string;
  coPilotAvatar: string;
  coPilotName: string;
  color: string;
  category: string;
  defaultGoals: {
    primaryGoal: string;
    theme: string;
    dailyEffort: string;
    objectives: string[];
  };
}

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
  private readonly coachPromptsService = inject(CoachPromptsService);
  private readonly communityCoachService = inject(CommunityCoachService);

  protected readonly isDarkMode = this.theme.isDarkMode;
  protected readonly isLoggedIn = computed(() => !!this.authService.profile()?.userId);
  protected readonly isCreating = signal(false);
  protected readonly selectedTemplate = signal<PrebuiltTemplate | null>(null);
  protected readonly showConfirmModal = signal(false);
  protected readonly mobileNavOpen = signal(false);

  // Community coaches loaded from Firestore
  readonly communityCoaches = signal<CommunityCoach[]>([]);

  // Wizard state
  readonly showCreateModal = signal(false);
  readonly wizardStep = signal(1);
  readonly wizardSubmitting = signal(false);
  readonly wizardError = signal<string | null>(null);

  // Step 1: Coach Identity
  readonly coachName = signal('');
  readonly coachPersonality = signal('');
  readonly coachCategory = signal('Custom');
  readonly coachIcon = signal('🎯');
  readonly coachAvatarPreview = signal<string | null>(null);
  private coachAvatarData = '';

  // Step 2: Goal
  readonly goalPrimaryGoal = signal('');
  readonly goalTheme = signal('career');
  readonly goalDailyEffort = signal('1hour');
  readonly goalObjective1 = signal('');
  readonly goalObjective2 = signal('');
  readonly goalObjective3 = signal('');
  readonly goalAppName = signal('');
  readonly goalTagline = signal('');

  // Step 3: Visibility
  readonly coachVisibility = signal<'public' | 'private'>('public');

  readonly categories = ['Business', 'Health', 'Fitness', 'Career', 'Creative', 'Learning', 'Sales', 'Founder', 'Custom'];
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

  protected readonly hasMoonshot = computed(() => {
    const plan = this.authService.profile()?.subscriptionPlan;
    if (!plan) return false;
    const hierarchy: Record<string, number> = { moonshot: 1, interplanetary: 2, galactic: 3 };
    return (hierarchy[plan] || 0) >= 1;
  });

  readonly prebuiltTemplates: PrebuiltTemplate[] = [
    {
      id: 'hustle-orbit',
      name: 'HustleOrbit',
      tagline: 'Solopreneur & Indie Hacker execution coach.',
      description: 'Build your indie empire with focused execution. Track product launches, customer acquisition, and revenue milestones.',
      icon: '🚀',
      imageUrl: '/assets/app-suite/hustle-orbit.png',
      coPilotAvatar: '/assets/ogilvy.jpg',
      coPilotName: 'Marcus Chen',
      color: 'from-slate-900 via-slate-800 to-slate-900',
      category: 'Business',
      defaultGoals: {
        primaryGoal: 'Launch and grow my indie product',
        theme: 'career',
        dailyEffort: '1hour',
        objectives: ['Ship features', 'Grow audience', 'Generate revenue']
      }
    },
    {
      id: 'opti-human',
      name: 'OptiHuman',
      tagline: 'Biohacker performance & health optimization.',
      description: 'Optimize your biology for peak performance. Track sleep, nutrition, exercise, and cognitive enhancement protocols.',
      icon: '🧬',
      imageUrl: '/assets/app-suite/opti-human.png',
      coPilotAvatar: '/assets/a-2.jpg',
      coPilotName: 'Dr. Elena Vance',
      color: 'from-indigo-950 via-purple-900 to-indigo-900',
      category: 'Health',
      defaultGoals: {
        primaryGoal: 'Optimize my health and performance',
        theme: 'health',
        dailyEffort: '30min',
        objectives: ['Sleep optimization', 'Nutrition tracking', 'Energy management']
      }
    },
    {
      id: 'marketing-maven',
      name: 'MarketingMaven',
      tagline: 'Campaign strategist for consistent growth.',
      description: 'Plan sharper marketing moves after hours. Track experiments, conversions, and brand momentum without burning out.',
      icon: '🌙',
      imageUrl: '/assets/app-suite/moonlight-maker.png',
      coPilotAvatar: '/assets/sarah-jenkins.jpg',
      coPilotName: 'Sarah Jenkins',
      color: 'from-blue-950 via-indigo-950 to-slate-900',
      category: 'Business',
      defaultGoals: {
        primaryGoal: 'Build a profitable marketing engine',
        theme: 'career',
        dailyEffort: '1hour',
        objectives: ['Run experiments', 'Improve conversion', 'Scale channels']
      }
    },
    {
      id: 'pipeline-pilot',
      name: 'PipelinePilot',
      tagline: 'Real Estate & Sales Pro deal accelerator.',
      description: 'Close more deals and grow your pipeline. Track leads, follow-ups, and revenue targets with precision.',
      icon: '📈',
      imageUrl: '/assets/app-suite/pipeline-pilot.png',
      coPilotAvatar: '/assets/jordan-blake.jpg',
      coPilotName: 'Jordan Blake',
      color: 'from-emerald-950 via-teal-900 to-cyan-950',
      category: 'Sales',
      defaultGoals: {
        primaryGoal: 'Close more deals and grow revenue',
        theme: 'finance',
        dailyEffort: '2hours',
        objectives: ['Lead generation', 'Follow-up cadence', 'Deal closing']
      }
    },
    {
      id: 'apex-ascend',
      name: 'ApexAscend',
      tagline: 'Corporate Climber leadership & strategy.',
      description: 'Advance your corporate career with strategic moves. Track promotions, skill building, and leadership development.',
      icon: '⛰️',
      imageUrl: '/assets/app-suite/apex-ascend.png',
      coPilotAvatar: '/assets/a-5.jpg',
      coPilotName: 'Robert Sterling',
      color: 'from-slate-900 via-blue-950 to-indigo-950',
      category: 'Career',
      defaultGoals: {
        primaryGoal: 'Advance my corporate career',
        theme: 'career',
        dailyEffort: '30min',
        objectives: ['Visibility projects', 'Networking', 'Skill development']
      }
    },
    {
      id: 'creator-craft',
      name: 'CreatorCraft',
      tagline: 'Creative Freelancer project completion tool.',
      description: 'Ship creative projects on time. Track client work, personal projects, and portfolio building.',
      icon: '🎨',
      imageUrl: '/assets/app-suite/creator-craft.png',
      coPilotAvatar: '/assets/a-6.jpg',
      coPilotName: 'Maya Rivera',
      color: 'from-orange-950 via-amber-900 to-yellow-950',
      category: 'Creative',
      defaultGoals: {
        primaryGoal: 'Complete creative projects consistently',
        theme: 'career',
        dailyEffort: '2hours',
        objectives: ['Client deliverables', 'Portfolio pieces', 'Skill growth']
      }
    },
    {
      id: 'neuro-nexus',
      name: 'NeuroNexus',
      tagline: 'AI Early Adopter neural network coaching.',
      description: 'Master AI tools and stay ahead of the curve. Track learning, experiments, and AI project implementations.',
      icon: '🧠',
      imageUrl: '/assets/app-suite/opti-human.png', // Reusing opti-human for technical vibe
      coPilotAvatar: '/assets/a-7.jpg',
      coPilotName: 'Alex Tech',
      color: 'from-cyan-950 via-teal-900 to-emerald-950',
      category: 'Learning',
      defaultGoals: {
        primaryGoal: 'Master AI tools and applications',
        theme: 'learning',
        dailyEffort: '1hour',
        objectives: ['AI tool mastery', 'Project experiments', 'Knowledge sharing']
      }
    },
    {
      id: 'boss-beam',
      name: 'BossBeam',
      tagline: 'Female Founder vision & scaling platform.',
      description: 'Scale your vision with confidence. Track fundraising, team building, and company milestones.',
      icon: '👑',
      imageUrl: '/assets/app-suite/pipeline-pilot.png', // Reusing pipeline-pilot for office vibe
      coPilotAvatar: '/assets/a-8.jpg',
      coPilotName: 'Claire Beaumont',
      color: 'from-fuchsia-950 via-pink-900 to-rose-950',
      category: 'Founder',
      defaultGoals: {
        primaryGoal: 'Scale my company and vision',
        theme: 'career',
        dailyEffort: '2hours',
        objectives: ['Team growth', 'Revenue milestones', 'Vision execution']
      }
    },
    {
      id: 'my-sugar-shift',
      name: 'MySugarShift',
      tagline: 'Wellness & nutrition balance assistant.',
      description: 'Transform your relationship with food and energy. Track nutrition, blood sugar, and wellness habits.',
      icon: '🍎',
      imageUrl: '/assets/app-suite/opti-human.png', // Reusing opti-human for lab/health vibe
      coPilotAvatar: '/assets/a-9.jpg',
      coPilotName: 'Lucille Grant',
      color: 'from-lime-950 via-green-900 to-emerald-950',
      category: 'Health',
      defaultGoals: {
        primaryGoal: 'Optimize nutrition and energy levels',
        theme: 'health',
        dailyEffort: '20min',
        objectives: ['Meal tracking', 'Energy patterns', 'Healthy habits']
      }
    },
    {
      id: 'my-rocket-ride',
      name: 'MyRocketRide',
      tagline: 'Distance Biker mileage & route planner.',
      description: 'Conquer long-distance cycling goals. Track mileage, routes, and training progress.',
      icon: '🚴',
      imageUrl: '/assets/app-suite/moonlight-maker.png', // Reusing moonlight-maker for atmospheric vibe
      coPilotAvatar: '/assets/a-10.jpg',
      coPilotName: 'Tom Wheeler',
      color: 'from-orange-950 via-red-900 to-rose-950',
      category: 'Fitness',
      defaultGoals: {
        primaryGoal: 'Complete my cycling distance goals',
        theme: 'health',
        dailyEffort: '1hour',
        objectives: ['Weekly mileage', 'Route completion', 'Performance gains']
      }
    },
    {
      id: 'marathon-mover',
      name: 'MarathonMover',
      tagline: 'Marathon runner training & pacing guide.',
      description: 'Train for your marathon with precision. Track runs, pacing strategies, and race preparation.',
      icon: '🏃',
      imageUrl: '/assets/app-suite/apex-ascend.png', // Reusing apex-ascend for goal-oriented vibe
      coPilotAvatar: '/assets/gym-coach.jpg',
      coPilotName: 'Coach Alina Park',
      color: 'from-amber-950 via-orange-900 to-red-950',
      category: 'Fitness',
      defaultGoals: {
        primaryGoal: 'Complete my marathon training',
        theme: 'health',
        dailyEffort: '1hour',
        objectives: ['Weekly mileage', 'Pace improvement', 'Race readiness']
      }
    },
    {
      id: 'career-quest',
      name: 'CareerQuest',
      tagline: 'Job Seeker application & interview tracker.',
      description: 'Land your dream job with organized tracking. Manage applications, interviews, and networking.',
      icon: '💼',
      imageUrl: '/assets/app-suite/pipeline-pilot.png', // Reusing pipeline-pilot for corporate vibe
      coPilotAvatar: '/assets/career.jpg',
      coPilotName: 'Maya Ellis',
      color: 'from-slate-900 via-zinc-900 to-neutral-800',
      category: 'Career',
      defaultGoals: {
        primaryGoal: 'Land my dream job',
        theme: 'career',
        dailyEffort: '2hours',
        objectives: ['Applications sent', 'Interviews completed', 'Network growth']
      }
    },
    {
      id: 'lean-launch',
      name: 'Home Workout and Weight Loss',
      tagline: 'Home workout plan and weight loss coaching.',
      description: 'Home Workout & Weight Loss Coach. Tess the "Time-Shifter" is a sharp, no-nonsense coach backed by the latest training and nutrition innovations. She can help you create power-packed 20-30 minute home workouts routines tailored to your schedule and goals, while also building a personalized diet and weight loss plan.\n\n"I\'ll be your lead strategist for this mission. Our objective is to optimize your health trajectory through focused execution and high-performance protocols."',
      icon: '⚖️',
      imageUrl: '/assets/app-suite/lean-launch.png',
      coPilotAvatar: '/assets/tess.png',
      coPilotName: 'Coach Tess',
      color: 'from-emerald-950 via-slate-900 to-black',
      category: 'Health',
      defaultGoals: {
        primaryGoal: 'Lose weight with consistent home workouts',
        theme: 'health',
        dailyEffort: '30min',
        objectives: ['Weekly workouts', 'Daily movement', 'Weekly weigh-ins']
      }
    }
  ];

  async ngOnInit() {
    window.scrollTo({ top: 0, behavior: 'smooth' });

    this.loadCoachOverrides();
    this.loadCommunityCoaches();

    if (this.isLoggedIn()) {
      await this.checkPendingPrebuilt();
    }
  }

  private async loadCoachOverrides() {
    try {
      const configs = await this.coachPromptsService.getAllConfigs();
      for (const template of this.prebuiltTemplates) {
        const saved = configs[template.id];
        if (saved) {
          if (saved.coachName) template.coPilotName = saved.coachName;
          if (saved.avatar) template.coPilotAvatar = saved.avatar;
        }
      }
    } catch (err) {
      console.warn('Failed to load coach overrides:', err);
    }
  }

  private async loadCommunityCoaches() {
    try {
      const publicCoaches = await this.communityCoachService.getPublicCoaches();
      const profile = this.authService.profile();
      let allCoaches = [...publicCoaches];

      if (profile?.userId) {
        const myCoaches = await this.communityCoachService.getMyCoaches(profile.userId);
        const publicIds = new Set(publicCoaches.map(c => c.id));
        const privateOnly = myCoaches.filter(c => !publicIds.has(c.id));
        allCoaches = [...allCoaches, ...privateOnly];
      }

      this.communityCoaches.set(allCoaches);
    } catch (err) {
      console.warn('Failed to load community coaches:', err);
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
    this.coachName.set('');
    this.coachPersonality.set('');
    this.coachCategory.set('Custom');
    this.coachIcon.set('🎯');
    this.coachAvatarPreview.set(null);
    this.coachAvatarData = '';
    this.goalPrimaryGoal.set('');
    this.goalTheme.set('career');
    this.goalDailyEffort.set('1hour');
    this.goalObjective1.set('');
    this.goalObjective2.set('');
    this.goalObjective3.set('');
    this.goalAppName.set('');
    this.goalTagline.set('');
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
    }
    if (this.wizardStep() === 2) {
      if (!this.goalPrimaryGoal().trim()) {
        this.wizardError.set('Please enter your primary goal.');
        return;
      }
      if (!this.goalAppName().trim()) {
        this.wizardError.set('Please enter an app name for your coach.');
        return;
      }
    }
    this.wizardError.set(null);
    this.wizardStep.set(this.wizardStep() + 1);
  }

  prevStep() {
    this.wizardError.set(null);
    this.wizardStep.set(Math.max(1, this.wizardStep() - 1));
  }

  handleAvatarUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input?.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      this.wizardError.set('Image must be under 2 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      this.coachAvatarPreview.set(dataUrl);
      this.coachAvatarData = dataUrl;
    };
    reader.readAsDataURL(file);
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
      const result = await this.communityCoachService.saveCommunityCoach({
        coachName: this.coachName().trim(),
        avatar: this.coachAvatarData,
        soulFilet: this.coachPersonality().trim(),
        appName: this.goalAppName().trim(),
        tagline: this.goalTagline().trim(),
        description: this.coachPersonality().trim(),
        icon: this.coachIcon().trim() || '🎯',
        category: this.coachCategory(),
        visibility: this.coachVisibility(),
        defaultGoals: {
          primaryGoal: this.goalPrimaryGoal().trim(),
          theme: this.goalTheme(),
          dailyEffort: this.goalDailyEffort(),
          objectives: objectives.length > 0 ? objectives : ['Make progress']
        }
      });

      if (!result.success) {
        throw new Error('Failed to save coach.');
      }

      const now = Date.now();
      const appName = this.goalAppName().trim();
      const goalId = await this.goalsService.createRocketGoal({
        userId: profile.userId,
        primaryGoal: this.goalPrimaryGoal().trim(),
        answers: {
          goal_title_label: `${appName} Mission`,
          goal_theme: this.goalTheme(),
          goal_theme_label: this.coachCategory(),
          daily_effort: this.goalDailyEffort(),
          source: 'community_coach',
          community_coach_id: result.coachId,
          community_coach_name: this.coachName().trim(),
          objectives: objectives.length > 0 ? objectives : ['Make progress'],
          custom_goal_title: `${appName} Mission`,
          goalDescription: this.coachPersonality().trim(),
          timeframe: 'week'
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

      this.generateVisualizationAsync(goalId, appName, this.coachPersonality().trim(), this.goalPrimaryGoal().trim(), profile);

      this.closeCreateModal();
      this.router.navigate(['/rocketgoal', goalId]);
    } catch (error: any) {
      console.error('Error creating community coach:', error);
      this.wizardError.set(error?.message || 'Something went wrong. Please try again.');
    } finally {
      this.wizardSubmitting.set(false);
    }
  }

  async launchCommunityCoach(coach: CommunityCoach) {
    const profile = this.authService.profile();
    if (!profile?.userId) {
      this.router.navigate(['/signup'], {
        queryParams: { redirectTo: '/app-suite' }
      });
      return;
    }

    this.isCreating.set(true);
    try {
      const now = Date.now();
      const goalId = await this.goalsService.createRocketGoal({
        userId: profile.userId,
        primaryGoal: coach.defaultGoals.primaryGoal,
        answers: {
          goal_title_label: `${coach.appName} Mission`,
          goal_theme: coach.defaultGoals.theme,
          goal_theme_label: coach.category,
          daily_effort: coach.defaultGoals.dailyEffort,
          source: 'community_coach',
          community_coach_id: coach.id,
          community_coach_name: coach.coachName,
          objectives: coach.defaultGoals.objectives,
          custom_goal_title: `${coach.appName} Mission`,
          goalDescription: coach.description,
          timeframe: 'week'
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
          avatar: coach.avatar || '/assets/rocket-goals.png',
          name: coach.coachName,
          role: coach.soulFilet
        }
      });

      this.generateVisualizationAsync(goalId, coach.appName, coach.description, coach.defaultGoals.primaryGoal, profile);
      this.isCreating.set(false);
      this.router.navigate(['/rocketgoal', goalId]);
    } catch (error) {
      console.error('Error launching community coach:', error);
      this.isCreating.set(false);
    }
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

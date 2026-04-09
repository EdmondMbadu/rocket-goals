import { Component, inject, OnInit, signal, HostListener, AfterViewInit, OnDestroy, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute, NavigationEnd } from '@angular/router';
import { RocketGoalsService } from './rocket-goals.service';
import { AuthService } from './auth.service';
import { RocketGoalsAIComponent } from './rocket-goals-ai.component';
import { AvatarDropdownComponent } from './avatar-dropdown.component';
import type { RocketGoal } from './models/rocket-goal';
import type { Team, TeamInvite, TeamMember } from './models/team';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { ThemeService } from './theme.service';
import { FansService, Fan } from './fans.service';
import { VisualizationService } from './visualization.service';
import { RocketGoalsAIService } from './rocket-goals-ai.service';
import { TeamService } from './team.service';
import { CoachCatalogService } from './coach-catalog.service';
import { CommunityCoach, CommunityCoachService } from './community-coach.service';
import { PrebuiltTemplate } from './coach-catalog.data';
import {
  buildFallbackGoalDescription,
  buildFallbackTeamDescription,
  buildCoachPersonalityRefinementPrompt,
  buildGoalDescriptionRefinementPrompt,
  buildTeamDescriptionRefinementPrompt,
  buildFallbackCoachPersonality,
  COACH_CATEGORIES,
  DEFAULT_COACH_PHILOSOPHY,
  normalizeCoachPersonality,
  normalizeGoalDescription,
  normalizeTeamDescription
} from './coach-builder.util';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';

export type GoalTimeframe = 'week' | 'month' | '3months' | 'custom';

export interface RocketQuizAnswers {
  goalDescription: string;
  timeframe: GoalTimeframe | null;
  customDeadline: string;
  futureSelfClarity: number; // 1-10 scale
  dailyTimeForGoal: string; // time option
  challengePerception: string; // obstacles or growth
  emotionalResilience: string; // yes/no
  dailyConsistency: string; // consistency option
  hasAccountabilitySupport: string; // yes/no
  additionalNotes: string;
  userPhotoBase64: string | null; // base64 encoded user face photo for visualization
}

interface FanMissionContext {
  fan: Fan;
  goal: RocketGoal | null;
}

interface PendingTeamInviteContext {
  invite: TeamInvite;
  team: Team | null;
}

type TeamCoachSource = 'prebuilt' | 'community' | 'custom';

interface ResolvedTeamCoachSelection {
  source: TeamCoachSource;
  title: string;
  subtitle: string;
  description: string;
  settings: NonNullable<Team['aiSettings']>;
  previewAvatarUrl?: string;
  uploadFile?: File | null;
}

@Component({
  selector: 'app-goals-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, RocketGoalsAIComponent, AvatarDropdownComponent],
  templateUrl: './goals-list.component.html',
  styleUrl: './goals-list.component.css'
})
export class GoalsListComponent implements OnInit, AfterViewInit, OnDestroy {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private rocketGoalsService = inject(RocketGoalsService);
  private teamService = inject(TeamService);
  private fansService = inject(FansService);
  // Expose authService for template access
  authService = inject(AuthService);
  private readonly theme = inject(ThemeService);
  private readonly visualizationService = inject(VisualizationService);
  private readonly aiService = inject(RocketGoalsAIService);
  private readonly coachCatalogService = inject(CoachCatalogService);
  private readonly communityCoachService = inject(CommunityCoachService);
  private readonly functions = getFunctions(getApp(), 'us-central1');
  protected readonly isDarkMode = this.theme.isDarkMode;
  protected readonly isLoggedIn = computed(() => !!this.authService.profile()?.userId);
  protected readonly mobileNavOpen = signal(false);
  private routerSubscription?: Subscription;
  private storage: any = null;

  goals = signal<RocketGoal[]>([]);
  teams = signal<Team[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  success = signal<string | null>(null);
  showAvatarDropdown = signal(false);
  dashboardTitle = signal<string>('MISSION CONTROL');
  isEditingTitle = signal(false);
  editingTitleValue = signal<string>('');
  workOnTitle = signal<string>('Work on Life Balance');
  isEditingWorkOnTitle = signal(false);
  editingWorkOnTitleValue = signal<string>('');
  fanMemberships = signal<FanMissionContext[]>([]);
  fanMembershipsLoading = signal(false);
  leavingFanIds = signal<Record<string, boolean>>({});
  pendingTeamInvites = signal<PendingTeamInviteContext[]>([]);
  pendingTeamInvitesLoading = signal(false);
  teamInviteActionState = signal<Record<string, 'accepting' | 'declining'>>({});
  editingGoalId = signal<string | null>(null);
  editingGoalTitleValue = signal<string>('');
  activeGoalMenuId = signal<string | null>(null);
  editingTeamId = signal<string | null>(null);
  editingTeamTitleValue = signal<string>('');
  activeTeamMenuId = signal<string | null>(null);
  expandedTeamDescriptionIds = signal<Record<string, boolean>>({});

  // Goal creation modal state (Launch Your GOAL wizard)
  protected readonly showGoalModal = signal(false);
  protected readonly goalModalStep = signal<number>(1);
  protected readonly totalSteps = 10; // Total quiz steps (including photo capture)
  protected readonly isCreatingGoal = signal(false);
  protected readonly refiningGoalDescription = signal(false);
  protected readonly goalCreationError = signal<string | null>(null);
  protected readonly showAuthPrompt = signal(false);
  protected readonly showCreateTeamModal = signal(false);
  protected readonly creatingTeam = signal(false);
  protected readonly refiningTeamDescription = signal(false);
  protected newTeamName = '';
  protected newCoachTeamLeadName = '';
  protected newTeamDescription = '';
  protected inviteEmail = '';
  protected inviteEmails = signal<string[]>([]);
  protected readonly teamCoachLibraryLoading = signal(false);
  protected readonly teamCoachBrowseMode = signal<TeamCoachSource>('prebuilt');
  protected readonly teamCoachSelectionSource = signal<TeamCoachSource | null>(null);
  protected readonly selectedPrebuiltCoachId = signal<string | null>(null);
  protected readonly selectedCommunityCoachId = signal<string | null>(null);
  protected readonly teamCoachError = signal<string | null>(null);
  protected readonly prebuiltTeamCoaches = signal<PrebuiltTemplate[]>([]);
  protected readonly communityTeamCoaches = signal<CommunityCoach[]>([]);
  protected readonly customTeamCoachName = signal('');
  protected readonly customTeamCoachPersonality = signal('');
  protected readonly customTeamCoachCategory = signal<string>('Custom');
  protected readonly customTeamCoachAvatarPreview = signal<string | null>(null);
  protected readonly customTeamCoachGeneratingAvatar = signal(false);
  protected readonly customTeamCoachRefining = signal(false);
  protected readonly customTeamCoachAvatarLightboxOpen = signal(false);
  protected readonly teamCoachPhilosophyBlurb = signal(DEFAULT_COACH_PHILOSOPHY);
  protected readonly teamCoachCategories = [...COACH_CATEGORIES];
  private customTeamCoachAvatarFile: File | null = null;

  // Photo capture state
  protected readonly isCameraActive = signal(false);
  protected readonly isCameraLoading = signal(false);
  protected readonly cameraError = signal<string | null>(null);
  protected readonly capturedPhoto = signal<string | null>(null);
  protected readonly isUsingPhoto = signal(false);
  protected readonly isSkippingPhoto = signal(false); // True when user clicks Skip
  protected readonly isPhotoPrefilled = signal(false); // True when photo was loaded from profile
  protected readonly isLoadingPrefill = signal(false); // True while loading photo from profile
  myOneThingGoalId = signal<string | null>(null);
  isUpdatingMyOneThing = signal(false);
  private videoStream: MediaStream | null = null;

  // Quiz answers
  protected readonly quizAnswers = signal<RocketQuizAnswers>({
    goalDescription: '',
    timeframe: null,
    customDeadline: '',
    futureSelfClarity: 5,
    dailyTimeForGoal: '',
    challengePerception: '',
    emotionalResilience: '',
    dailyConsistency: '',
    hasAccountabilitySupport: '',
    additionalNotes: '',
    userPhotoBase64: null
  });

  protected readonly timeframeOptions: { value: GoalTimeframe; label: string; description: string }[] = [
    { value: 'week', label: 'Within a week', description: '7-day intensive sprint' },
    { value: 'month', label: 'Within a month', description: '30-day focused journey' },
    { value: '3months', label: 'Within 3 months', description: 'Sustained transformation' },
    { value: 'custom', label: 'Custom deadline', description: 'Pick the exact date you want to hit' }
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

  protected readonly teamDescriptionPreviewThreshold = 110;

  async ngOnInit() {
    // Load custom dashboard title from localStorage
    const savedTitle = localStorage.getItem('dashboardTitle');
    if (savedTitle) {
      this.dashboardTitle.set(savedTitle);
    }

    // Load work on title from localStorage
    const savedWorkOnTitle = localStorage.getItem('workOnTitle');
    if (savedWorkOnTitle) {
      this.workOnTitle.set(savedWorkOnTitle);
    }

    // Wait for auth to initialize, then load goals
    await this.waitForAuthAndLoadGoals();
    
    // Check if user was redirected back after login with pending goal
    if (this.isLoggedIn()) {
      await this.checkPendingGoalCreation();
    }
  }

  protected isTeamDescriptionExpanded(teamId: string): boolean {
    return !!this.expandedTeamDescriptionIds()[teamId];
  }

  protected toggleTeamDescription(teamId: string, event: Event): void {
    event.stopPropagation();
    this.expandedTeamDescriptionIds.update(current => ({
      ...current,
      [teamId]: !current[teamId]
    }));
  }

  protected shouldShowTeamDescriptionToggle(description?: string): boolean {
    return (description || '').trim().length > this.teamDescriptionPreviewThreshold;
  }

  ngAfterViewInit() {
    const clearQueryFlag = (flag: string) => {
      const nextParams = { ...this.route.snapshot.queryParams };
      delete nextParams[flag];
      this.router.navigate([], {
        relativeTo: this.route,
        queryParams: nextParams,
        replaceUrl: true
      });
    };

    // Check for startChallenge query param immediately and on changes
    // This handles the case where we navigate to the same route with different query params
    const checkParams = () => {
      const params = this.route.snapshot.queryParams;
      if (params['startChallenge'] === 'true') {
        // Dispatch a custom event that the app component can listen to
        // This handles same-route navigation where NavigationEnd might not fire
        window.dispatchEvent(new CustomEvent('startChallenge', { detail: { source: 'goals-list' } }));
      }
      if (params['refresh'] === 'true') {
        // Reload goals when refresh param is present
        this.loadGoals();
        // Remove the refresh param from URL
        this.router.navigate(['/goals'], { replaceUrl: true, queryParams: {} });
      }
      if (params['createTeam'] === 'true') {
        if (!this.showCreateTeamModal()) {
          this.openCreateTeamModal();
        }
        clearQueryFlag('createTeam');
      }
    };

    // Check immediately
    checkParams();

    // Subscribe to query param changes
    this.route.queryParams.subscribe(params => {
      if (params['startChallenge'] === 'true') {
        window.dispatchEvent(new CustomEvent('startChallenge', { detail: { source: 'goals-list' } }));
      }
      if (params['refresh'] === 'true') {
        // Reload goals when refresh param is present
        this.loadGoals();
        // Remove the refresh param from URL
        this.router.navigate(['/goals'], { replaceUrl: true, queryParams: {} });
      }
      if (params['createTeam'] === 'true') {
        if (!this.showCreateTeamModal()) {
          this.openCreateTeamModal();
        }
        clearQueryFlag('createTeam');
      }
    });

    // Also listen to navigation events to reload when navigating to /goals
    this.routerSubscription = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        if (event.url === '/goals' || event.url.startsWith('/goals?')) {
          // Check if we have a refresh param
          const urlParams = new URLSearchParams(event.url.split('?')[1] || '');
          if (urlParams.get('refresh') === 'true') {
            this.loadGoals();
            // Remove the refresh param
            this.router.navigate(['/goals'], { replaceUrl: true, queryParams: {} });
          }
        }
      });
  }

  ngOnDestroy() {
    if (this.routerSubscription) {
      this.routerSubscription.unsubscribe();
    }
  }

  private async waitForAuthAndLoadGoals() {
    // Try multiple times to wait for profile to be ready
    let attempts = 0;
    const maxAttempts = 10;

    const tryLoad = async () => {
      attempts++;
      const profile = this.authService.profile();

      if (profile?.userId) {
        // Profile is ready, load goals
        await this.loadGoals();
      } else if (attempts < maxAttempts) {
        // Wait a bit more and try again
        setTimeout(tryLoad, 200);
      } else {
        // Give up after max attempts
        this.error.set('Please log in to view your goals');
        this.loading.set(false);
      }
    };

    // Start trying after a short delay
    setTimeout(tryLoad, 100);
  }

  async loadGoals() {
    const profile = this.authService.profile();
    if (!profile?.userId) {
      this.teams.set([]);
      this.pendingTeamInvites.set([]);
      this.error.set('Please log in to view your goals');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.pendingTeamInvitesLoading.set(true);
    this.error.set(null);
    try {
      console.log('Loading goals for userId:', profile.userId);
      const [goalsResult, teamsResult, teamInvitesResult] = await Promise.allSettled([
        this.rocketGoalsService.getRocketGoalsByUserId(profile.userId),
        this.teamService.getTeamsByUserId(profile.userId),
        profile.email
          ? this.teamService.getPendingInvitesByEmail(profile.email)
          : Promise.resolve([])
      ]);

      if (goalsResult.status !== 'fulfilled') {
        throw goalsResult.reason;
      }

      const goals = (goalsResult.value as RocketGoal[]).map(goal => this.normalizeGoal(goal));
      const teams = teamsResult.status === 'fulfilled'
        ? (teamsResult.value as Team[])
        : [];
      const pendingInvites = teamInvitesResult.status === 'fulfilled'
        ? (teamInvitesResult.value as TeamInvite[])
        : [];

      if (teamsResult.status !== 'fulfilled') {
        console.warn('Failed to load teams for goals page:', teamsResult.reason);
      }
      if (teamInvitesResult.status !== 'fulfilled') {
        console.warn('Failed to load team invites for goals page:', teamInvitesResult.reason);
      }

      const visibleGoals = goals.filter(goal => !this.isTeamLinkedGoal(goal));
      const pendingInviteEntries: PendingTeamInviteContext[] = pendingInvites
        .filter(invite => !teams.some(team => team.id === invite.teamId))
        .map(invite => ({
          invite,
          team: null
        }));

      console.log('Loaded goals:', goals);
      this.goals.set(visibleGoals);
      this.teams.set(teams);
      this.pendingTeamInvites.set(pendingInviteEntries);
      const preferredGoalId = profile?.myOneThingGoalId;
      const preferredExists = preferredGoalId && visibleGoals.some(goal => goal.id === preferredGoalId);
      const defaultGoalId = visibleGoals[0]?.id || null;
      if (preferredExists) {
        this.myOneThingGoalId.set(preferredGoalId || null);
      } else {
        this.myOneThingGoalId.set(defaultGoalId);
        if (defaultGoalId && preferredGoalId !== defaultGoalId) {
          try {
            await this.authService.updateUserProfile({ myOneThingGoalId: defaultGoalId });
          } catch (error) {
            console.warn('Failed to save My One THING default:', error);
          }
        }
      }
      this.loadFanMemberships();
      if (visibleGoals.length === 0) {
        console.log('No goals found for user - showing empty state');
      }
    } catch (err) {
      console.error('Error loading goals:', err);
      this.teams.set([]);
      this.pendingTeamInvites.set([]);
      this.error.set('Failed to load goals. Please try again.');
    } finally {
      this.pendingTeamInvitesLoading.set(false);
      this.loading.set(false);
    }
  }

  private isTeamLinkedGoal(goal: RocketGoal): boolean {
    const answers = goal?.answers || {};
    const explicitTeamGoal = answers['teamGoal'] === true;
    const hasTeamId = typeof answers['teamId'] === 'string' && answers['teamId'].trim().length > 0;
    const deterministicTeamGoalId = typeof goal?.id === 'string' && goal.id.startsWith('team-');
    return explicitTeamGoal || hasTeamId || deterministicTeamGoalId;
  }

  private normalizeGoal(goal: RocketGoal): RocketGoal {
    return {
      ...goal,
      answers: goal?.answers ?? {}
    };
  }

  async loadFanMemberships() {
    const profile = this.authService.profile();
    const email = profile?.email?.toLowerCase();
    if (!email) {
      this.fanMemberships.set([]);
      return;
    }

    this.fanMembershipsLoading.set(true);
    try {
      const memberships = await this.fansService.getFanMembershipsByEmail(email);
      if (!memberships.length) {
        this.fanMemberships.set([]);
        return;
      }

      const goalIds = Array.from(new Set(memberships.map(membership => membership.goalId).filter(Boolean)));
      const goalResults = await Promise.all(
        goalIds.map(async goalId => {
          try {
            const goal = await this.rocketGoalsService.getRocketGoalById(goalId);
            return { goalId, goal: goal ? this.normalizeGoal(goal as RocketGoal) : null };
          } catch (error) {
            console.warn('Unable to fetch goal for fan membership', goalId, error);
            return { goalId, goal: null };
          }
        })
      );

      const goalMap = new Map(goalResults.map(entry => [entry.goalId, entry.goal]));
      const entries: FanMissionContext[] = [];
      for (const membership of memberships) {
        const goal = goalMap.get(membership.goalId) ?? null;
        if (!goal) {
          void this.cleanupStaleFanMembership(membership);
          continue;
        }
        if (profile?.userId && goal.userId === profile.userId) {
          continue;
        }
        entries.push({
          fan: membership,
          goal
        });
      }

      this.fanMemberships.set(entries);
    } catch (error) {
      console.error('Error loading fan memberships:', error);
      this.fanMemberships.set([]);
    } finally {
      this.fanMembershipsLoading.set(false);
    }
  }

  getGoalTitle(goal: RocketGoal): string {
    const answers = goal?.answers ?? {};
    return answers['goal_title_label'] || answers['custom_goal_title'] || goal.primaryGoal || 'Untitled Goal';
  }

  isMyOneThing(goal: RocketGoal): boolean {
    const selected = this.myOneThingGoalId();
    if (selected) return selected === goal.id;
    const firstGoal = this.goals()[0];
    return !!firstGoal && firstGoal.id === goal.id;
  }

  getMyOneThingTitle(): string {
    const selectedId = this.myOneThingGoalId();
    const goals = this.goals();
    const selectedGoal = selectedId ? goals.find(goal => goal.id === selectedId) : null;
    const fallbackGoal = goals[0];
    return selectedGoal ? this.getGoalTitle(selectedGoal) : (fallbackGoal ? this.getGoalTitle(fallbackGoal) : 'your goal');
  }

  async setMyOneThing(goal: RocketGoal) {
    if (this.isUpdatingMyOneThing()) return;
    const profile = this.authService.profile();
    if (!profile?.userId) {
      this.error.set('Please log in to update your One Thing.');
      setTimeout(() => this.error.set(null), 5000);
      return;
    }
    if (this.myOneThingGoalId() === goal.id) {
      return;
    }
    this.isUpdatingMyOneThing.set(true);
    this.error.set(null);
    try {
      await this.authService.updateUserProfile({ myOneThingGoalId: goal.id });
      this.myOneThingGoalId.set(goal.id);
      this.success.set('✅ My One THING updated.');
    } catch (error: any) {
      console.error('Failed to update My One THING:', error);
      this.error.set('Failed to update My One THING. Please try again.');
    } finally {
      this.isUpdatingMyOneThing.set(false);
      setTimeout(() => {
        this.success.set(null);
        this.error.set(null);
      }, 4000);
    }
  }

  getFanGoalTitle(goal: RocketGoal | null, goalId: string): string {
    if (goal) {
      return this.getGoalTitle(goal);
    }
    const shortId = goalId ? goalId.substring(0, 6) : 'mission';
    return `Mission ${shortId}…`;
  }

  getFanGoalOwner(goal: RocketGoal | null): string {
    if (!goal) return 'Mission Commander';
    const participantName = [goal.participant?.firstName, goal.participant?.lastName].filter(Boolean).join(' ').trim();
    if (participantName) return participantName;
    return 'Mission Commander';
  }

  scrollToFanMissions() {
    const section = document.getElementById('fan-missions-section');
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  getGoalTheme(goal: RocketGoal): string {
    return goal?.answers?.['goal_theme_label'] || 'Personal Growth';
  }

  getGoalStatus(goal: RocketGoal): string {
    return goal.status || 'active';
  }

  getTeamMemberCount(team: Team): number {
    if (Array.isArray(team.members) && team.members.length > 0) {
      return team.members.length;
    }
    return Array.isArray(team.memberIds) ? team.memberIds.length : 0;
  }

  getPendingTeamInviteCount(): number {
    return this.pendingTeamInvites().length;
  }

  getPendingTeamInviteTeamName(entry: PendingTeamInviteContext): string {
    return entry.invite.teamName || 'Team invitation';
  }

  getPendingTeamInviteDescription(entry: PendingTeamInviteContext): string {
    return entry.invite.teamDescription || 'Join this team to collaborate, stay accountable, and move the mission together.';
  }

  getPendingTeamInviteCover(entry: PendingTeamInviteContext): string {
    return entry.invite.teamCoverImageUrl || '/assets/team-rocket.jpg';
  }

  getPendingTeamInviteInviter(entry: PendingTeamInviteContext): string {
    return entry.invite.invitedByName || 'A Rocket Goals leader';
  }

  isTeamInviteProcessing(inviteId: string): boolean {
    return !!this.teamInviteActionState()[inviteId];
  }

  async acceptTeamInvite(entry: PendingTeamInviteContext): Promise<void> {
    const profile = this.authService.profile();
    if (!profile?.userId) {
      this.error.set('Please log in before accepting a team invite.');
      return;
    }

    this.teamInviteActionState.update(state => ({ ...state, [entry.invite.id]: 'accepting' }));
    this.error.set(null);
    this.success.set(null);

    try {
      await this.teamService.acceptTeamInvite(entry.invite.id, {
        userId: profile.userId,
        firstName: profile.firstName || '',
        lastName: profile.lastName || '',
        email: (profile.email || '').trim().toLowerCase(),
        profilePictureUrl: profile.profilePictureUrl,
        role: 'member',
        joinedAt: Date.now()
      });

      this.success.set(`You joined ${entry.invite.teamName}.`);
      await this.loadGoals();
    } catch (error: any) {
      console.error('Failed to accept team invite:', error);
      this.error.set(error?.message || 'Could not accept this team invite right now.');
    } finally {
      this.teamInviteActionState.update(state => {
        const next = { ...state };
        delete next[entry.invite.id];
        return next;
      });
    }
  }

  async declineTeamInvite(entry: PendingTeamInviteContext): Promise<void> {
    const profile = this.authService.profile();
    this.teamInviteActionState.update(state => ({ ...state, [entry.invite.id]: 'declining' }));
    this.error.set(null);
    this.success.set(null);

    try {
      await this.teamService.declineTeamInvite(entry.invite.id, profile?.userId);
      this.pendingTeamInvites.update(invites => invites.filter(item => item.invite.id !== entry.invite.id));
      this.success.set(`Declined the invite to ${entry.invite.teamName}.`);
    } catch (error: any) {
      console.error('Failed to decline team invite:', error);
      this.error.set(error?.message || 'Could not decline this team invite right now.');
    } finally {
      this.teamInviteActionState.update(state => {
        const next = { ...state };
        delete next[entry.invite.id];
        return next;
      });
    }
  }

  isTeamAdmin(team: Team): boolean {
    const profile = this.authService.profile();
    if (!profile?.userId) return false;
    return team.adminId === profile.userId;
  }

  getTeamCoverImage(team: Team): string {
    return team.coverImageUrl || '/assets/team-rocket.jpg';
  }

  onTeamCoverError(event: Event): void {
    const img = event.target as HTMLImageElement | null;
    if (!img) return;
    img.src = '/assets/team-rocket.jpg';
  }

  getUserFirstName(): string {
    const profile = this.authService.profile();
    return profile?.firstName || 'Commander';
  }

  getUserDisplayName(): string {
    const profile = this.authService.profile();
    if (!profile) return 'User';
    return [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'User';
  }

  getUserEmail(): string {
    const profile = this.authService.profile();
    return profile?.email || '';
  }

  toggleAvatarDropdown() {
    this.showAvatarDropdown.set(!this.showAvatarDropdown());
  }

  closeAvatarDropdown() {
    this.showAvatarDropdown.set(false);
  }

  toggleDarkMode() {
    this.theme.toggleDarkMode();
  }

  toggleMobileNav(): void {
    this.mobileNavOpen.set(!this.mobileNavOpen());
  }

  closeMobileNav(): void {
    this.mobileNavOpen.set(false);
  }

  toggleGoalMenu(goalId: string, event?: Event) {
    event?.stopPropagation();
    const current = this.activeGoalMenuId();
    this.activeGoalMenuId.set(current === goalId ? null : goalId);
  }

  closeGoalMenu() {
    this.activeGoalMenuId.set(null);
  }

  isGoalMenuOpen(goalId: string): boolean {
    return this.activeGoalMenuId() === goalId;
  }

  toggleTeamMenu(teamId: string, event?: Event) {
    event?.stopPropagation();
    const current = this.activeTeamMenuId();
    this.activeTeamMenuId.set(current === teamId ? null : teamId);
  }

  closeTeamMenu() {
    this.activeTeamMenuId.set(null);
  }

  isTeamMenuOpen(teamId: string): boolean {
    return this.activeTeamMenuId() === teamId;
  }

  navigateToGoal(goalId: string) {
    this.router.navigateByUrl(`/rocketgoal/${goalId}`);
    this.closeAvatarDropdown();
  }

  navigateToTeam(teamId: string) {
    this.router.navigateByUrl(`/team/${teamId}`);
    this.closeAvatarDropdown();
  }

  navigateToProfile() {
    this.router.navigateByUrl('/profile');
    this.closeAvatarDropdown();
  }

  navigateToHome() {
    this.router.navigateByUrl('/goals');
    this.closeAvatarDropdown();
  }

  navigateToAI() {
    this.router.navigateByUrl('/ai');
    this.closeAvatarDropdown();
  }

  navigateToAdmin() {
    this.router.navigateByUrl('/admin');
    this.closeAvatarDropdown();
  }

  isAdmin(): boolean {
    const profile = this.authService.profile();
    return profile?.role === 'admin' || profile?.admin === true;
  }

  onImageError(event: Event) {
    const img = event.target as HTMLImageElement;
    if (img) {
      img.style.display = 'none';
      const fallback = img.nextElementSibling as HTMLElement;
      if (fallback) {
        fallback.style.display = 'flex';
      }
    }
  }

  async handleLogout() {
    try {
      await this.authService.signOut();
      this.router.navigateByUrl('/');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  }

  startEditingTitle() {
    this.editingTitleValue.set(this.dashboardTitle());
    this.isEditingTitle.set(true);
    setTimeout(() => {
      const input = document.querySelector('input[type="text"][ngModel]') as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }, 0);
  }

  saveTitle() {
    const newTitle = this.editingTitleValue().trim() || 'MISSION CONTROL';
    this.dashboardTitle.set(newTitle);
    localStorage.setItem('dashboardTitle', newTitle);
    this.isEditingTitle.set(false);
  }

  cancelEditingTitle() {
    this.isEditingTitle.set(false);
    this.editingTitleValue.set('');
  }

  startEditingWorkOnTitle() {
    this.editingWorkOnTitleValue.set(this.workOnTitle());
    this.isEditingWorkOnTitle.set(true);
    setTimeout(() => {
      const input = document.querySelector('input.work-on-title-input') as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }, 0);
  }

  saveWorkOnTitle() {
    const newTitle = this.editingWorkOnTitleValue().trim() || 'Work on Life Balance';
    this.workOnTitle.set(newTitle);
    localStorage.setItem('workOnTitle', newTitle);
    this.isEditingWorkOnTitle.set(false);
    this.editingWorkOnTitleValue.set('');
  }

  cancelEditingWorkOnTitle() {
    this.isEditingWorkOnTitle.set(false);
    this.editingWorkOnTitleValue.set('');
  }

  goHome() {
    this.router.navigateByUrl('/goals');
  }

  private resetTeamCoachDraft(): void {
    this.teamCoachBrowseMode.set('prebuilt');
    this.teamCoachSelectionSource.set(null);
    this.selectedPrebuiltCoachId.set(null);
    this.selectedCommunityCoachId.set(null);
    this.teamCoachError.set(null);
    this.customTeamCoachName.set('');
    this.customTeamCoachPersonality.set('');
    this.customTeamCoachCategory.set('Custom');
    this.customTeamCoachAvatarPreview.set(null);
    this.customTeamCoachGeneratingAvatar.set(false);
    this.customTeamCoachRefining.set(false);
    this.customTeamCoachAvatarLightboxOpen.set(false);
    this.customTeamCoachAvatarFile = null;
  }

  private resetCreateTeamDraft(): void {
    this.newTeamName = '';
    this.newCoachTeamLeadName = '';
    this.newTeamDescription = '';
    this.refiningTeamDescription.set(false);
    this.inviteEmail = '';
    this.inviteEmails.set([]);
    this.creatingTeam.set(false);
    this.resetTeamCoachDraft();
  }

  private async loadTeamCoachOptions(): Promise<void> {
    this.teamCoachLibraryLoading.set(true);
    try {
      const profile = this.authService.profile();
      const [prebuilt, community] = await Promise.all([
        this.coachCatalogService.getPrebuiltTemplates(),
        this.coachCatalogService.getAvailableCommunityCoaches(profile?.userId)
      ]);
      this.prebuiltTeamCoaches.set(prebuilt);
      this.communityTeamCoaches.set(community);
    } catch (error) {
      console.error('Failed to load team coach options:', error);
      this.teamCoachError.set('Coach library is temporarily unavailable. Try again in a moment.');
    } finally {
      this.teamCoachLibraryLoading.set(false);
    }
  }

  protected openCreateTeamModal(): void {
    this.showCreateTeamModal.set(true);
    this.resetCreateTeamDraft();
    void this.loadTeamCoachOptions();
  }

  protected closeCreateTeamModal(): void {
    this.showCreateTeamModal.set(false);
    this.resetCreateTeamDraft();
  }

  protected async refineTeamDescription(): Promise<void> {
    const seed = this.newTeamDescription.trim();
    if (!seed) {
      return;
    }

    this.refiningTeamDescription.set(true);

    try {
      const response = await this.aiService.callAISilent(
        buildTeamDescriptionRefinementPrompt({
          seed,
          teamName: this.newTeamName,
          coachTeamLeadName: this.newCoachTeamLeadName
        })
      );
      this.newTeamDescription = normalizeTeamDescription(response);
    } catch (error) {
      console.warn('Failed to refine team description:', error);
      this.newTeamDescription = buildFallbackTeamDescription(seed);
    } finally {
      this.refiningTeamDescription.set(false);
    }
  }

  protected addInviteEmail(): void {
    const email = this.inviteEmail.trim().toLowerCase();
    if (email && email.includes('@') && !this.inviteEmails().includes(email)) {
      this.inviteEmails.update(list => [...list, email]);
      this.inviteEmail = '';
    }
  }

  protected removeInviteEmail(email: string): void {
    this.inviteEmails.update(list => list.filter(candidate => candidate !== email));
  }

  protected setTeamCoachBrowseMode(mode: TeamCoachSource): void {
    this.teamCoachBrowseMode.set(mode);
    if (mode === 'custom') {
      this.teamCoachSelectionSource.set('custom');
      this.teamCoachError.set(null);
    }
  }

  protected selectPrebuiltCoach(template: PrebuiltTemplate): void {
    this.teamCoachBrowseMode.set('prebuilt');
    this.teamCoachSelectionSource.set('prebuilt');
    this.selectedPrebuiltCoachId.set(template.id);
    this.selectedCommunityCoachId.set(null);
    this.teamCoachError.set(null);
  }

  protected selectCommunityCoach(coach: CommunityCoach): void {
    this.teamCoachBrowseMode.set('community');
    this.teamCoachSelectionSource.set('community');
    this.selectedCommunityCoachId.set(coach.id);
    this.selectedPrebuiltCoachId.set(null);
    this.teamCoachError.set(null);
  }

  protected activateCustomCoachSelection(): void {
    this.teamCoachBrowseMode.set('custom');
    this.teamCoachSelectionSource.set('custom');
    this.selectedPrebuiltCoachId.set(null);
    this.selectedCommunityCoachId.set(null);
    this.teamCoachError.set(null);
  }

  protected updateCustomTeamCoachName(value: string): void {
    this.customTeamCoachName.set(value);
    this.activateCustomCoachSelection();
  }

  protected updateCustomTeamCoachPersonality(value: string): void {
    this.customTeamCoachPersonality.set(value);
    this.activateCustomCoachSelection();
  }

  protected updateCustomTeamCoachCategory(value: string): void {
    this.customTeamCoachCategory.set(value);
    this.activateCustomCoachSelection();
  }

  protected clearCustomTeamCoachAvatar(): void {
    this.customTeamCoachAvatarFile = null;
    this.customTeamCoachAvatarPreview.set(null);
    this.activateCustomCoachSelection();
  }

  private hasPartialCustomTeamCoachDraft(): boolean {
    return !!this.customTeamCoachName().trim()
      || !!this.customTeamCoachPersonality().trim()
      || !!this.customTeamCoachAvatarPreview()
      || !!this.customTeamCoachAvatarFile
      || this.customTeamCoachCategory() !== 'Custom';
  }

  protected onCustomTeamCoachAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.teamCoachError.set('Please select an image file for your coach avatar.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.teamCoachError.set('Coach avatar image should stay under 10 MB.');
      return;
    }

    this.teamCoachError.set(null);
    this.customTeamCoachAvatarFile = file;
    this.activateCustomCoachSelection();

    const reader = new FileReader();
    reader.onload = () => {
      this.customTeamCoachAvatarPreview.set(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  protected async generateCustomTeamCoachAvatar(): Promise<void> {
    const coachName = this.customTeamCoachName().trim();
    const coachDescription = this.customTeamCoachPersonality().trim();

    if (!coachName) {
      this.teamCoachError.set('Give your coach a name before generating an avatar.');
      return;
    }
    if (!coachDescription) {
      this.teamCoachError.set('Describe your coach before generating an avatar.');
      return;
    }

    this.customTeamCoachGeneratingAvatar.set(true);
    this.teamCoachError.set(null);
    this.activateCustomCoachSelection();

    try {
      const result = await this.communityCoachService.generateAvatar({
        coachName,
        coachDescription,
        category: this.customTeamCoachCategory()
      });

      if (result.success && result.imageUrl) {
        this.customTeamCoachAvatarFile = null;
        this.customTeamCoachAvatarPreview.set(result.imageUrl);
      } else {
        this.teamCoachError.set('Could not generate an avatar right now. Upload one instead.');
      }
    } catch (error) {
      console.error('Failed to generate custom team coach avatar:', error);
      this.teamCoachError.set('Could not generate an avatar right now. Upload one instead.');
    } finally {
      this.customTeamCoachGeneratingAvatar.set(false);
    }
  }

  protected async refineCustomTeamCoachPersonality(): Promise<void> {
    const seed = this.customTeamCoachPersonality().trim();
    if (!seed) {
      this.teamCoachError.set('Start with a short coach description first.');
      return;
    }

    this.customTeamCoachRefining.set(true);
    this.teamCoachError.set(null);
    this.activateCustomCoachSelection();

    try {
      const response = await this.aiService.callAISilent(
        buildCoachPersonalityRefinementPrompt({
          category: this.customTeamCoachCategory(),
          coachName: this.customTeamCoachName().trim(),
          philosophy: this.teamCoachPhilosophyBlurb(),
          seed
        })
      );
      this.customTeamCoachPersonality.set(normalizeCoachPersonality(response));
    } catch (error) {
      console.warn('Failed to refine custom team coach personality:', error);
      this.customTeamCoachPersonality.set(
        buildFallbackCoachPersonality({
          seed,
          category: this.customTeamCoachCategory(),
          coachName: this.customTeamCoachName().trim()
        })
      );
    } finally {
      this.customTeamCoachRefining.set(false);
    }
  }

  private getSelectedPrebuiltCoach(): PrebuiltTemplate | null {
    const id = this.selectedPrebuiltCoachId();
    if (!id) {
      return null;
    }
    return this.prebuiltTeamCoaches().find(template => template.id === id) || null;
  }

  private getSelectedCommunityCoach(): CommunityCoach | null {
    const id = this.selectedCommunityCoachId();
    if (!id) {
      return null;
    }
    return this.communityTeamCoaches().find(coach => coach.id === id) || null;
  }

  private resolveSelectedTeamCoach(): ResolvedTeamCoachSelection | null {
    const source = this.teamCoachSelectionSource();

    if (source === 'prebuilt') {
      const template = this.getSelectedPrebuiltCoach();
      if (!template) {
        return null;
      }

      return {
        source,
        title: template.name,
        subtitle: `AI Coach: ${template.coPilotName}`,
        description: template.tagline,
        settings: {
          displayName: template.coPilotName,
          avatarUrl: template.coPilotAvatar,
          personality: `${template.coPilotName} is the dedicated AI coach for ${template.name}. ${template.description}`
        },
        previewAvatarUrl: template.coPilotAvatar
      };
    }

    if (source === 'community') {
      const coach = this.getSelectedCommunityCoach();
      if (!coach) {
        return null;
      }

      return {
        source,
        title: coach.appName,
        subtitle: `AI Coach: ${coach.coachName}`,
        description: coach.tagline || coach.description,
        settings: {
          displayName: coach.coachName,
          ...(coach.avatar ? { avatarUrl: coach.avatar } : {}),
          personality: (coach.soulFilet || coach.description || coach.tagline || '').trim()
        },
        previewAvatarUrl: coach.avatar || undefined
      };
    }

    if (source === 'custom') {
      const displayName = this.customTeamCoachName().trim();
      const personality = this.customTeamCoachPersonality().trim();
      const previewAvatarUrl = this.customTeamCoachAvatarPreview() || undefined;

      if (!displayName || !personality) {
        return null;
      }

      const settings: NonNullable<Team['aiSettings']> = {
        displayName,
        personality
      };
      if (previewAvatarUrl && !this.customTeamCoachAvatarFile) {
        settings.avatarUrl = previewAvatarUrl;
      }

      return {
        source,
        title: displayName,
        subtitle: `${this.customTeamCoachCategory()} coach`,
        description: personality,
        settings,
        previewAvatarUrl,
        uploadFile: this.customTeamCoachAvatarFile
      };
    }

    return null;
  }

  protected selectedTeamCoach(): ResolvedTeamCoachSelection | null {
    return this.resolveSelectedTeamCoach();
  }

  protected isPrebuiltCoachSelected(templateId: string): boolean {
    return this.teamCoachSelectionSource() === 'prebuilt' && this.selectedPrebuiltCoachId() === templateId;
  }

  protected isCommunityCoachSelected(coachId: string): boolean {
    return this.teamCoachSelectionSource() === 'community' && this.selectedCommunityCoachId() === coachId;
  }

  protected isCustomCoachSelected(): boolean {
    return this.teamCoachSelectionSource() === 'custom';
  }

  protected teamCoachSelectionLabel(source: TeamCoachSource): string {
    if (source === 'prebuilt') {
      return 'Rocket Coach';
    }
    if (source === 'community') {
      return 'Community coach';
    }
    return 'Custom coach';
  }

  private getTeamCoachValidationError(): string | null {
    const source = this.teamCoachSelectionSource();
    if (!source) {
      return null;
    }

    if (source === 'prebuilt' && !this.getSelectedPrebuiltCoach()) {
      return null;
    }

    if (source === 'community' && !this.getSelectedCommunityCoach()) {
      return null;
    }

    if (source === 'custom') {
      const coachName = this.customTeamCoachName().trim();
      const personality = this.customTeamCoachPersonality().trim();
      if (!coachName && !personality && !this.customTeamCoachAvatarPreview() && !this.customTeamCoachAvatarFile && this.customTeamCoachCategory() === 'Custom') {
        return null;
      }
      if (!coachName) {
        return 'Give your custom coach a name.';
      }
      if (coachName.length > 60) {
        return 'Coach name should stay under 60 characters.';
      }
      if (!personality) {
        return 'Describe how your coach should guide and hold the team accountable.';
      }
      if (personality.length > 12000) {
        return 'Coach personality should stay under 12,000 characters.';
      }
    }

    return null;
  }

  protected canCreateTeam(): boolean {
    return !!this.newTeamName.trim()
      && !this.creatingTeam()
      && !this.getTeamCoachValidationError();
  }

  protected async createTeamFromGoalsPage(): Promise<void> {
    const teamName = this.newTeamName.trim();
    if (!teamName || this.creatingTeam()) {
      return;
    }

    const profile = this.authService.profile();
    if (!profile?.userId) {
      this.error.set('Please log in to create a team.');
      setTimeout(() => this.error.set(null), 4000);
      return;
    }

    this.creatingTeam.set(true);
    this.error.set(null);
    this.teamCoachError.set(null);

    try {
      const coachValidationError = this.getTeamCoachValidationError();
      if (coachValidationError) {
        this.teamCoachError.set(coachValidationError);
        this.creatingTeam.set(false);
        return;
      }

      const selectedCoach = this.resolveSelectedTeamCoach();

      const description = this.newTeamDescription.trim();
      const coachTeamLeadName = this.newCoachTeamLeadName.trim();
      const adminMember: TeamMember = {
        userId: profile.userId,
        firstName: profile.firstName || '',
        lastName: profile.lastName || '',
        email: (profile.email || '').trim().toLowerCase(),
        role: 'admin',
        joinedAt: Date.now(),
        ...(profile.profilePictureUrl ? { profilePictureUrl: profile.profilePictureUrl } : {})
      };

      const teamId = await this.teamService.createTeam({
        name: teamName,
        ...(coachTeamLeadName ? { coachTeamLeadName } : {}),
        ...(description ? { description } : {}),
        adminId: profile.userId,
        members: [adminMember],
        memberIds: [profile.userId],
        aiCoachEnabled: !!selectedCoach,
        ...(selectedCoach ? { aiSettings: selectedCoach.settings } : {})
      });

      if (selectedCoach?.uploadFile) {
        const uploadFile = selectedCoach.uploadFile;
        try {
          const uploadedAvatarUrl = await this.teamService.uploadTeamAiAvatar(teamId, uploadFile);
          await this.teamService.updateTeam(teamId, {
            aiSettings: {
              ...selectedCoach.settings,
              avatarUrl: uploadedAvatarUrl
            }
          } as Partial<Team>);
        } catch (avatarError) {
          console.error('Failed to upload team coach avatar during creation:', avatarError);
        }
      }

      try {
        await this.teamService.ensureTeamRocketGoal(teamId);
      } catch (goalError) {
        console.warn('Unable to ensure team rocket goal during team creation:', goalError);
      }

      const emails = this.inviteEmails();
      for (const email of emails) {
        try {
          const user = await this.teamService.findUserByEmail(email);
          if (!user) {
            continue;
          }
          await this.teamService.addMemberToTeam(teamId, {
            userId: user.userId,
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            profilePictureUrl: user.profilePictureUrl,
            role: 'member',
            joinedAt: Date.now()
          });
        } catch (inviteError) {
          console.error(`Failed to add invited member ${email}:`, inviteError);
        }
      }

      await this.loadGoals();
      this.closeCreateTeamModal();
    } catch (err) {
      console.error('Failed to create team from goals page:', err);
      this.error.set('Failed to create team. Please try again.');
      setTimeout(() => this.error.set(null), 5000);
    } finally {
      this.creatingTeam.set(false);
    }
  }

  // Goal creation modal methods (Launch Your GOAL wizard)
  protected async openGoalModal(): Promise<void> {
    // Always open modal - auth check happens at the end
    this.showGoalModal.set(true);
    this.goalModalStep.set(1);
    this.showAuthPrompt.set(false);
    this.refiningGoalDescription.set(false);
    this.goalCreationError.set(null);
    this.quizAnswers.set({
      goalDescription: '',
      timeframe: null,
      customDeadline: '',
      futureSelfClarity: 5,
      dailyTimeForGoal: '',
      challengePerception: '',
      emotionalResilience: '',
      dailyConsistency: '',
      hasAccountabilitySupport: '',
      additionalNotes: '',
      userPhotoBase64: null
    });
    
    // Small delay to ensure modal is rendered, then prefill photo from profile if available
    setTimeout(async () => {
      await this.prefillPhotoFromProfile();
    }, 100);
  }

  /**
   * Prefill photo from user profile if available
   */
  private async prefillPhotoFromProfile(): Promise<void> {
    try {
      // Show loading indicator while fetching
      this.isLoadingPrefill.set(true);

      // Refresh profile to ensure we have the latest data
      const refreshedProfile = await this.authService.refreshProfile();
      const profile = refreshedProfile || this.authService.profile();

      console.log('Prefilling photo - profile:', profile ? 'found' : 'not found');
      console.log('Profile rocketGoalPhotoUrl:', profile?.rocketGoalPhotoUrl);

      if (!profile?.rocketGoalPhotoUrl) {
        console.log('No rocketGoalPhotoUrl in profile, skipping prefill');
        this.isLoadingPrefill.set(false);
        return; // No profile photo to prefill
      }

      console.log('Converting photo URL to base64:', profile.rocketGoalPhotoUrl);
      // Convert profile photo URL to base64
      const photoBase64 = await this.imageUrlToBase64(profile.rocketGoalPhotoUrl);

      console.log('Photo converted successfully, setting in quiz answers');
      // Set in quiz answers and captured photo signal
      this.updateQuizAnswer('userPhotoBase64', photoBase64);
      this.capturedPhoto.set(photoBase64);
      this.isPhotoPrefilled.set(true); // Mark as prefilled so UI can show appropriate messaging

      console.log('Photo prefilled from profile successfully');
    } catch (error) {
      console.error('Failed to prefill photo from profile:', error);
      // Continue without prefilling - user can still add photo manually
    } finally {
      this.isLoadingPrefill.set(false);
    }
  }

  protected closeGoalModal(): void {
    this.stopCamera();
    this.showGoalModal.set(false);
    this.goalModalStep.set(1);
    this.showAuthPrompt.set(false);
    this.refiningGoalDescription.set(false);
    this.goalCreationError.set(null);
    this.isCreatingGoal.set(false);
    this.capturedPhoto.set(null);
    this.cameraError.set(null);
    this.isPhotoPrefilled.set(false);
    this.isSkippingPhoto.set(false);
    this.isLoadingPrefill.set(false);
  }

  protected updateQuizAnswer<K extends keyof RocketQuizAnswers>(key: K, value: RocketQuizAnswers[K]): void {
    this.quizAnswers.update(current => ({ ...current, [key]: value }));
  }

  protected async refineGoalDescription(): Promise<void> {
    const seed = this.quizAnswers().goalDescription.trim();
    if (!seed) {
      this.goalCreationError.set('Start with a short goal description first.');
      return;
    }

    this.refiningGoalDescription.set(true);
    this.goalCreationError.set(null);

    try {
      const response = await this.aiService.callAISilent(
        buildGoalDescriptionRefinementPrompt(seed)
      );
      this.updateQuizAnswer('goalDescription', normalizeGoalDescription(response));
    } catch (error) {
      console.warn('Failed to refine goal description:', error);
      this.updateQuizAnswer('goalDescription', buildFallbackGoalDescription(seed));
    } finally {
      this.refiningGoalDescription.set(false);
    }
  }

  protected selectTimeframe(value: GoalTimeframe): void {
    this.quizAnswers.update(current => ({
      ...current,
      timeframe: value,
      customDeadline: value === 'custom' ? current.customDeadline : ''
    }));
  }

  protected updateCustomDeadline(value: string): void {
    this.quizAnswers.update(current => ({
      ...current,
      timeframe: 'custom',
      customDeadline: value
    }));
  }

  protected getMinimumCustomDeadline(): string {
    const tomorrow = new Date();
    tomorrow.setHours(0, 0, 0, 0);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return this.formatDateInputValue(tomorrow);
  }

  protected canProceedToNextStep(): boolean {
    const step = this.goalModalStep();
    const answers = this.quizAnswers();

    switch (step) {
      case 1: return !!answers.goalDescription.trim();
      case 2: return !!answers.timeframe && (answers.timeframe !== 'custom' || this.isCustomDeadlineValid(answers.customDeadline));
      case 3: return answers.futureSelfClarity >= 1 && answers.futureSelfClarity <= 10;
      case 4: return !!answers.dailyTimeForGoal;
      case 5: return !!answers.challengePerception;
      case 6: return !!answers.emotionalResilience;
      case 7: return !!answers.dailyConsistency;
      case 8: return !!answers.hasAccountabilitySupport;
      case 9: return true; // Additional notes is optional
      case 10: return true; // Photo capture is optional (can skip or use photo)
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
    if (currentStep < this.totalSteps) {
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
    if (currentStep > 1) {
      this.goalModalStep.set(currentStep - 1);
    }
  }

  protected handleFinalStep(): void {
    // Don't clear photo loading state here - keep it until goal creation completes
    // This prevents multiple clicks and goal creation

    if (!this.isLoggedIn()) {
      // Clear loading states if showing auth prompt
      this.isUsingPhoto.set(false);
      this.isSkippingPhoto.set(false);
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

  // Camera/Photo capture methods
  protected async startCamera(): Promise<void> {
    this.cameraError.set(null);
    this.isCameraLoading.set(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
      });
      this.videoStream = stream;
      this.isCameraActive.set(true);

      // Wait for the video element to be ready and attach the stream
      setTimeout(() => {
        const videoElement = document.getElementById('photo-capture-video') as HTMLVideoElement;
        if (videoElement) {
          videoElement.srcObject = stream;
          videoElement.play();
        }
      }, 100);
    } catch (error: any) {
      console.error('Camera access error:', error);
      if (error.name === 'NotAllowedError') {
        this.cameraError.set('Camera access denied. Please allow camera access in your browser settings.');
      } else if (error.name === 'NotFoundError') {
        this.cameraError.set('No camera found. Please connect a camera and try again.');
      } else {
        this.cameraError.set('Unable to access camera. Please try again.');
      }
    } finally {
      this.isCameraLoading.set(false);
    }
  }

  protected stopCamera(): void {
    if (this.videoStream) {
      this.videoStream.getTracks().forEach(track => track.stop());
      this.videoStream = null;
    }
    this.isCameraActive.set(false);
  }

  protected capturePhoto(): void {
    const videoElement = document.getElementById('photo-capture-video') as HTMLVideoElement;
    if (!videoElement) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Flip horizontally for mirror effect
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(videoElement, 0, 0);

      const photoBase64 = canvas.toDataURL('image/jpeg', 0.8);
      this.capturedPhoto.set(photoBase64);
      this.updateQuizAnswer('userPhotoBase64', photoBase64);
      this.stopCamera();
    }
  }

  protected retakePhoto(): void {
    this.capturedPhoto.set(null);
    this.updateQuizAnswer('userPhotoBase64', null);
    this.isPhotoPrefilled.set(false); // Clear prefilled state when user retakes
    this.startCamera();
  }

  protected onPhotoFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const file = input.files[0];
    if (!file.type.startsWith('image/')) {
      this.cameraError.set('Please select an image file.');
      return;
    }

    // Max file size: 5MB
    if (file.size > 5 * 1024 * 1024) {
      this.cameraError.set('Image is too large. Please select an image under 5MB.');
      return;
    }

    this.cameraError.set(null);

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      this.capturedPhoto.set(base64);
      this.updateQuizAnswer('userPhotoBase64', base64);
    };
    reader.onerror = () => {
      this.cameraError.set('Failed to read the image. Please try again.');
    };
    reader.readAsDataURL(file);

    // Reset the input so the same file can be selected again
    input.value = '';
  }

  protected async skipPhoto(): Promise<void> {
    // Prevent multiple clicks - if already processing, do nothing
    if (this.isUsingPhoto() || this.isCreatingGoal() || this.isSkippingPhoto()) {
      return;
    }

    // Show loading state immediately
    this.isSkippingPhoto.set(true);

    this.stopCamera();
    this.capturedPhoto.set(null);
    this.updateQuizAnswer('userPhotoBase64', null);

    // Move to final step (auth check or goal creation)
    // handleFinalStep will set isCreatingGoal which continues showing loading
    this.handleFinalStep();
  }

  protected async usePhoto(): Promise<void> {
    // Prevent multiple clicks - if already processing, do nothing
    if (this.isUsingPhoto() || this.isCreatingGoal()) {
      return;
    }
    
    // Show loading state
    this.isUsingPhoto.set(true);
    
    try {
      // Small delay to show loading state (photo is already saved in quizAnswers)
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Proceed to final step
      this.handleFinalStep();
    } catch (error) {
      // Clear loading state on error
      this.isUsingPhoto.set(false);
      throw error;
    }
    // Keep loading state until handleFinalStep completes (it will show its own loading)
    // The loading will be cleared when createGoalFromQuiz completes or auth prompt shows
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
      const timeframeDays = this.resolveTimeframeDays(answers, now);
      const deadlineDate = this.resolveDeadlineTimestamp(answers.customDeadline);
      const timeframeLabel = this.getExternalTimeframeLabel(answers);

      // Create the goal with all quiz data points
      const goalId = await this.rocketGoalsService.createRocketGoal({
        userId: profile.userId,
        primaryGoal: answers.goalDescription,
        answers: {
          goal_title_label: answers.goalDescription,
          timeframe: answers.timeframe,
          timeframe_days: timeframeDays,
          ...(deadlineDate ? { deadlineDate } : {}),
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
        // Get user photo - prioritize quiz photo (from step 10), fallback to profile photo
        let userPhotoBase64: string | null = null;
        
        // If user added a photo in step 10, use it and save to profile
        if (answers.userPhotoBase64) {
          userPhotoBase64 = answers.userPhotoBase64;
          
          // Save the photo to profile for future goals
          try {
            await this.savePhotoToProfile(answers.userPhotoBase64);
          } catch (error) {
            console.warn('Failed to save photo to profile:', error);
            // Continue even if profile save fails
          }
        } else if (profile.rocketGoalPhotoUrl) {
          // Fallback to profile photo if no quiz photo
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
          timeframe: timeframeLabel,
          userEmail: profile.email || '',
          userName: profile.firstName || 'Achiever',
          imageUrl: visualizationImageUrl
        });
      } catch (emailError) {
        console.warn('Failed to send goal creation email:', emailError);
      }

      // Close modal and navigate to the new goal
      this.closeGoalModal();
      await this.loadGoals(); // Reload goals list
      
      // Clear loading states before navigation
      this.isUsingPhoto.set(false);
      this.isSkippingPhoto.set(false);
      this.isCreatingGoal.set(false);

      this.router.navigate(['/rocketgoal', goalId]);
    } catch (error: any) {
      console.error('Failed to create goal:', error);
      this.goalCreationError.set(error?.message || 'Failed to create goal. Please try again.');
      // Clear loading states on error so user can try again
      this.isUsingPhoto.set(false);
      this.isSkippingPhoto.set(false);
      this.isCreatingGoal.set(false);
    }
  }

  /**
   * Convert image URL to base64 data URL for visualization
   * Uses Image element approach which handles CORS better for Firebase Storage
   */
  private async imageUrlToBase64(imageUrl: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous'; // Required for canvas to work with external images

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Could not get canvas context'));
            return;
          }

          ctx.drawImage(img, 0, 0);
          const base64 = canvas.toDataURL('image/jpeg', 0.9);
          console.log('Image converted to base64 successfully');
          resolve(base64);
        } catch (canvasError) {
          console.error('Canvas conversion error:', canvasError);
          reject(canvasError);
        }
      };

      img.onerror = (error) => {
        console.error('Image load error for URL:', imageUrl, error);
        reject(new Error('Failed to load image'));
      };

      // Add cache buster to avoid CORS cache issues
      const separator = imageUrl.includes('?') ? '&' : '?';
      img.src = `${imageUrl}${separator}t=${Date.now()}`;
    });
  }

  /**
   * Save base64 photo to user profile for future goals
   */
  private async savePhotoToProfile(photoBase64: string): Promise<void> {
    try {
      const profile = this.authService.profile();
      if (!profile?.userId) {
        return;
      }

      // Convert base64 to blob
      const response = await fetch(photoBase64);
      const blob = await response.blob();

      // Initialize storage if needed
      if (!this.storage) {
        const appModule = await import('firebase/app');
        const storageModule = await import('firebase/storage');
        const { firebaseConfig } = await import('../../environments/environment');
        
        const app = appModule.getApps().length === 0
          ? appModule.initializeApp(firebaseConfig)
          : appModule.getApp();
        
        this.storage = storageModule.getStorage(app);
      }

      // Upload to Firebase Storage
      const storageModule = await import('firebase/storage');
      const fileExtension = 'jpg'; // Default to jpg for base64 images
      const fileName = `rocket-goal-photo-${Date.now()}.${fileExtension}`;
      const storageRef = storageModule.ref(this.storage, `userProfiles/${profile.userId}/${fileName}`);
      
      await storageModule.uploadBytes(storageRef, blob);
      const downloadURL = await storageModule.getDownloadURL(storageRef);
      
      // Update profile
      await this.authService.updateUserProfile({ rocketGoalPhotoUrl: downloadURL });
      
      console.log('Photo saved to profile successfully');
    } catch (error) {
      console.error('Error saving photo to profile:', error);
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

  async deleteGoal(goalId: string) {
    if (!confirm('Are you sure you want to delete this goal? This action cannot be undone.')) {
      return;
    }

    try {
      await this.rocketGoalsService.deleteRocketGoal(goalId);
      // Reload goals after deletion
      await this.loadGoals();
    } catch (error) {
      console.error('Error deleting goal:', error);
      alert('Failed to delete goal. Please try again.');
    }
  }

  async deleteTeamFromGoalsPage(teamId: string) {
    if (!confirm('Are you sure you want to delete this team? This action cannot be undone.')) {
      return;
    }

    try {
      await this.teamService.deleteTeam(teamId);
      await this.loadGoals();
    } catch (error) {
      console.error('Error deleting team:', error);
      alert('Failed to delete team. Please try again.');
    }
  }

  startEditingGoalTitle(goal: RocketGoal) {
    const currentTitle = this.getGoalTitle(goal);
    this.editingGoalTitleValue.set(currentTitle);
    this.editingGoalId.set(goal.id);
    // Focus the input after a short delay to ensure it's rendered
    setTimeout(() => {
      const input = document.querySelector(`input.goal-title-edit-input`) as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }, 0);
  }

  async saveGoalTitle(goal: RocketGoal) {
    const newTitle = this.editingGoalTitleValue().trim();
    if (!newTitle) {
      this.cancelEditingGoalTitle();
      return;
    }

    try {
      // Update the goal in Firestore
      const updates: any = {
        primaryGoal: newTitle
      };

      // Also update the custom_goal_title in answers if it exists, or set it
      const currentAnswers = { ...(goal.answers || {}) };
      if (currentAnswers['custom_goal_title']) {
        currentAnswers['custom_goal_title'] = newTitle;
        currentAnswers['goal_title_label'] = newTitle;
      } else {
        // If no custom title was set, create one
        currentAnswers['custom_goal_title'] = newTitle;
        currentAnswers['goal_title_label'] = newTitle;
      }
      updates.answers = currentAnswers;

      await this.rocketGoalsService.updateRocketGoal(goal.id, updates);

      // Update local state
      this.goals.update(goals =>
        goals.map(g => g.id === goal.id ? { ...g, primaryGoal: newTitle, answers: currentAnswers } : g)
      );

      this.cancelEditingGoalTitle();
    } catch (error) {
      console.error('Error updating goal title:', error);
      alert('Failed to update goal title. Please try again.');
    }
  }

  cancelEditingGoalTitle() {
    this.editingGoalId.set(null);
    this.editingGoalTitleValue.set('');
  }

  isEditingGoal(goalId: string): boolean {
    return this.editingGoalId() === goalId;
  }

  startEditingTeamTitle(team: Team) {
    this.editingTeamTitleValue.set(team.name || '');
    this.editingTeamId.set(team.id);
    setTimeout(() => {
      const input = document.querySelector('input.team-title-edit-input') as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }, 0);
  }

  async saveTeamTitle(team: Team) {
    const newTitle = this.editingTeamTitleValue().trim();
    if (!newTitle) {
      this.cancelEditingTeamTitle();
      return;
    }

    try {
      await this.teamService.updateTeam(team.id, { name: newTitle } as Partial<Team>);
      this.teams.update(teams => teams.map(item => (
        item.id === team.id ? { ...item, name: newTitle } : item
      )));
      this.cancelEditingTeamTitle();
    } catch (error) {
      console.error('Error updating team title:', error);
      alert('Failed to update team title. Please try again.');
    }
  }

  cancelEditingTeamTitle() {
    this.editingTeamId.set(null);
    this.editingTeamTitleValue.set('');
  }

  isEditingTeam(teamId: string): boolean {
    return this.editingTeamId() === teamId;
  }

  getVisualizationImageUrl(goal: RocketGoal): string | null {
    return goal.visualizationImageUrl || null;
  }

  hasVisualization(goal: RocketGoal): boolean {
    return !!this.getVisualizationImageUrl(goal);
  }

  isFanLeaving(fanId: string): boolean {
    return !!this.leavingFanIds()[fanId];
  }

  private setFanLeavingState(fanId: string, isLeaving: boolean) {
    const current = { ...this.leavingFanIds() };
    if (isLeaving) {
      current[fanId] = true;
    } else {
      delete current[fanId];
    }
    this.leavingFanIds.set(current);
  }

  private async cleanupStaleFanMembership(membership: Fan) {
    if (!membership.goalId || !membership.id) {
      return;
    }
    try {
      await this.fansService.removeFan(membership.goalId, membership.id);
    } catch (error) {
      console.warn('Unable to clean up stale fan membership', membership.goalId, membership.id, error);
    }
  }

  async leaveFanMission(fan: Fan) {
    if (!fan.goalId || !fan.id) {
      return;
    }
    const confirmed = confirm('Stop being a fan of this mission?');
    if (!confirmed) {
      return;
    }

    this.setFanLeavingState(fan.id, true);
    try {
      await this.fansService.removeFan(fan.goalId, fan.id);
      this.fanMemberships.set(this.fanMemberships().filter(entry => entry.fan.id !== fan.id));
    } catch (error) {
      console.error('Error leaving fan mission:', error);
      alert('Failed to leave the mission. Please try again.');
    } finally {
      this.setFanLeavingState(fan.id, false);
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.avatar-dropdown-container')) {
      this.closeAvatarDropdown();
    }
    if (!target.closest('.goal-action-menu')) {
      this.closeGoalMenu();
    }
  }

  private isCustomDeadlineValid(value: string): boolean {
    const deadline = this.resolveDeadlineTimestamp(value);
    return deadline !== null && deadline > Date.now();
  }

  private resolveDeadlineTimestamp(value: string): number | null {
    const trimmed = String(value || '').trim();
    if (!trimmed) return null;

    const [year, month, day] = trimmed.split('-').map(part => Number(part));
    if (!year || !month || !day) return null;

    const deadline = new Date(year, month - 1, day, 23, 59, 59, 999);
    return Number.isNaN(deadline.getTime()) ? null : deadline.getTime();
  }

  private resolveTimeframeDays(answers: RocketQuizAnswers, startTimeMs: number): number {
    if (answers.timeframe === 'custom') {
      const deadline = this.resolveDeadlineTimestamp(answers.customDeadline);
      if (deadline) {
        return Math.max(1, Math.ceil((deadline - startTimeMs) / (1000 * 60 * 60 * 24)));
      }
    }

    if (answers.timeframe === 'week') return 7;
    if (answers.timeframe === 'month') return 30;
    return 90;
  }

  private getExternalTimeframeLabel(answers: RocketQuizAnswers): string {
    if (answers.timeframe === 'custom') {
      const deadline = this.resolveDeadlineTimestamp(answers.customDeadline);
      if (deadline) {
        return `by ${new Date(deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
      }
      return 'custom deadline';
    }

    const match = this.timeframeOptions.find(option => option.value === answers.timeframe);
    return match?.label || 'Within a month';
  }

  private formatDateInputValue(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

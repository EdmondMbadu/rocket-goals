import { Component, computed, effect, ElementRef, inject, OnDestroy, OnInit, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TeamService } from './team.service';
import { AuthService } from './auth.service';
import { ThemeService } from './theme.service';
import { RocketGoalsService } from './rocket-goals.service';
import type {
  Team,
  TeamDirectMessage,
  TeamMember,
  TeamMissionControlCard,
  TeamMissionControlCardStyle,
  TeamMissionControlMetricKey,
  TeamMemberActivitySnapshot,
  TeamMemberConversationPreview,
  TeamMessage
} from './models/team';
import type { RocketGoal } from './models/rocket-goal';
import { AvatarDropdownComponent } from './avatar-dropdown.component';
import QRCode from 'qrcode';

type InviteUserSuggestion = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  profilePictureUrl?: string;
};

type MissionControlCardDisplay = TeamMissionControlCard & {
  valueText: string;
  subtitle: string;
  percent: number;
  percentText: string;
  progressText: string;
  footnote: string;
  tone: 'participants' | 'milestones' | 'today' | 'engagement' | 'active';
};

type TeamMissionSummary = {
  totalParticipants: number;
  goalsStarted: number;
  totalMilestones: number;
  completedMilestones: number;
  totalToday: number;
  completedToday: number;
  activeTodayCount: number;
  completionPercent: number;
  todayPercent: number;
};

const DEFAULT_MISSION_CONTROL_CARDS: TeamMissionControlCard[] = [
  { id: 'mc-total-members', name: 'Total Members', style: 'circular', metricKey: 'total_members' },
  { id: 'mc-milestones-done', name: 'Milestones Done', style: 'circular', metricKey: 'milestones_done' },
  { id: 'mc-today-execution', name: "Today's Execution", style: 'circular', metricKey: 'today_execution' },
  { id: 'mc-active-today', name: 'Active Today', style: 'circular', metricKey: 'active_today' },
  { id: 'mc-overall-progress', name: 'Overall Milestone Progress', style: 'histogram', metricKey: 'overall_milestone_progress' },
  { id: 'mc-today-rate', name: "Today's Execution Rate", style: 'histogram', metricKey: 'today_execution_rate' },
  { id: 'mc-engagement-rate', name: 'Team Engagement', style: 'histogram', metricKey: 'team_engagement_rate' }
];

const MISSION_CONTROL_METRIC_OPTIONS: Array<{ key: TeamMissionControlMetricKey; label: string }> = [
  { key: 'total_members', label: 'Total Members' },
  { key: 'milestones_done', label: 'Milestones Done' },
  { key: 'today_execution', label: "Today's Execution" },
  { key: 'active_today', label: 'Active Today' },
  { key: 'overall_milestone_progress', label: 'Overall Milestone Progress' },
  { key: 'today_execution_rate', label: "Today's Execution Rate" },
  { key: 'team_engagement_rate', label: 'Team Engagement Rate' }
];

const MISSION_CONTROL_STYLE_OPTIONS: Array<{ key: TeamMissionControlCardStyle; label: string }> = [
  { key: 'circular', label: 'Circular Graph' },
  { key: 'histogram', label: 'Histogram' }
];

@Component({
  selector: 'app-team-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, AvatarDropdownComponent],
  templateUrl: './team-detail.component.html',
  styleUrl: './team-detail.component.css'
})
export class TeamDetailComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private teamService = inject(TeamService);
  private rocketGoalsService = inject(RocketGoalsService);
  authService = inject(AuthService);
  protected theme = inject(ThemeService);

  @ViewChild('messagesContainer') messagesContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('directMessagesContainer') directMessagesContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('coverInput') coverInput?: ElementRef<HTMLInputElement>;
  @ViewChild('aiAvatarInput') aiAvatarInput?: ElementRef<HTMLInputElement>;

  teamId = signal<string | null>(null);
  team = signal<Team | null>(null);
  teamRocketGoalId = signal<string | null>(null);
  memberTeamRocketGoalId = signal<string | null>(null);
  teamGoal = signal<RocketGoal | null>(null);
  loading = signal(true);
  preparingTeamGoal = signal(false);
  teamGoalError = signal<string | null>(null);
  teamCountdownDays = signal(0);
  teamCountdownHours = signal(0);
  teamCountdownMinutes = signal(0);
  teamCountdownSeconds = signal(0);
  teamDeadlineEditing = signal(false);
  teamDeadlineInputValue = signal('');
  teamDeadlineError = signal<string | null>(null);
  savingTeamDeadline = signal(false);
  teamWelcomeEditing = signal(false);
  teamWelcomeDraft = signal('');
  teamWelcomeError = signal<string | null>(null);
  savingTeamWelcome = signal(false);
  activeTab = signal<'members' | 'chat' | 'direct'>('members');
  messages = signal<TeamMessage[]>([]);
  directMessages = signal<TeamDirectMessage[]>([]);
  directConversationPreviews = signal<TeamMemberConversationPreview[]>([]);
  selectedDirectMemberUserId = signal<string | null>(null);
  selectedDirectMemberActivity = signal<TeamMemberActivitySnapshot | null>(null);
  participantActivityMap = signal<Record<string, TeamMemberActivitySnapshot>>({});
  loadingDirectConversations = signal(false);
  loadingDirectMessages = signal(false);
  loadingDirectActivity = signal(false);
  loadingParticipantSummaries = signal(false);
  sendingDirectMessage = signal(false);
  directError = signal<string | null>(null);
  participantSummaryError = signal<string | null>(null);
  directSendError = signal<string | null>(null);
  showInviteModal = signal(false);
  sendingMessage = signal(false);
  inviteLoading = signal(false);
  inviteError = signal<string | null>(null);
  inviteSuccess = signal<string | null>(null);
  inviteSuggestions = signal<InviteUserSuggestion[]>([]);
  inviteSearchLoading = signal(false);
  selectedInviteCandidate = signal<InviteUserSuggestion | null>(null);

  // Invite onboarding and sharing state
  onboardingMode = signal<'signup' | 'login'>('signup');
  showJoinModal = signal(false);
  private joinModalDismissed = signal(false);
  authActionLoading = signal(false);
  joiningTeam = signal(false);
  verificationPending = signal(false);
  verificationEmail = signal('');
  leadUpdatingUserId = signal<string | null>(null);
  leadActionError = signal<string | null>(null);
  leadActionSuccess = signal<string | null>(null);
  openMemberMenuUserId = signal<string | null>(null);
  memberPendingRemoval = signal<TeamMember | null>(null);
  removingMemberUserId = signal<string | null>(null);
  leaveTeamPromptOpen = signal(false);
  leavingTeam = signal(false);
  joinError = signal<string | null>(null);
  joinSuccess = signal<string | null>(null);
  verificationNotice = signal<string | null>(null);
  shareNotice = signal<string | null>(null);
  shareError = signal<string | null>(null);
  creatingMeetingRoom = signal(false);
  meetingRoomError = signal<string | null>(null);
  meetingRoomNotice = signal<string | null>(null);

  signupName = '';
  signupEmail = '';
  signupPassword = '';

  loginEmail = '';
  loginPassword = '';

  // Cover image
  coverImagePreview = signal<string | null>(null);
  uploadingCover = signal(false);
  private coverImageFile: File | null = null;

  // Team AI settings (admin-only for now)
  aiSettingsEditing = signal(false);
  savingAiSettings = signal(false);
  aiSettingsError = signal<string | null>(null);
  aiSettingsSuccess = signal<string | null>(null);
  aiDisplayNameDraft = '';
  aiAvatarUrlDraft = '';
  aiPersonalityDraft = '';
  aiAvatarPreview = signal<string | null>(null);
  private aiAvatarFile: File | null = null;

  // Telegram group
  connectingTelegram = signal(false);
  telegramConnectError = signal<string | null>(null);
  telegramConnectSuccess = signal<string | null>(null);
  telegramQrDataUrl = signal<string | null>(null);
  showTelegramBanner = signal(true);

  newMessage = '';
  directMessage = '';
  inviteEmailField = '';
  newMissionControlCardName = '';
  newMissionControlCardMetric: TeamMissionControlMetricKey = 'overall_milestone_progress';
  newMissionControlCardStyle: TeamMissionControlCardStyle = 'histogram';

  private messagesLoadedForTeamId: string | null = null;
  private directConversationLoadedForTeamId: string | null = null;
  private participantSummaryLoadedKey: string | null = null;
  private inviteSearchTimeout: ReturnType<typeof setTimeout> | null = null;
  private inviteSearchRequestId = 0;
  private linkedTeamGoalProfileKey: string | null = null;
  private directConversationPollInterval: ReturnType<typeof setInterval> | null = null;
  private teamCountdownInterval: ReturnType<typeof setInterval> | null = null;
  missionControlCardsSaving = signal(false);
  missionControlCardsError = signal<string | null>(null);
  missionControlCardsSuccess = signal<string | null>(null);
  missionControlCardsEditing = signal(false);
  showAddMissionControlCardForm = signal(false);
  missionControlDraftCards = signal<TeamMissionControlCard[]>([]);
  draggingMissionControlCardId = signal<string | null>(null);
  dragOverMissionControlCardId = signal<string | null>(null);
  dragOverMissionControlCardPosition = signal<'before' | 'after' | null>(null);

  currentUserId = computed(() => this.authService.profile()?.userId || '');
  currentUserName = computed(() => {
    const profile = this.authService.profile();
    if (!profile) return '';
    return `${profile.firstName} ${profile.lastName}`.trim() || profile.email;
  });
  currentTeamLead = computed(() => this.team()?.members.find(m => m.role === 'team-lead') || null);

  isCurrentUserMember = computed(() => {
    const team = this.team();
    if (!team) return false;
    return !!this.findCurrentUserTeamMember(team);
  });

  isAdmin = computed(() => this.team()?.adminId === this.currentUserId());
  currentUserTeamMember = computed(() => this.findCurrentUserTeamMember(this.team()));
  isCurrentUserTeamLead = computed(() => {
    const team = this.team();
    if (!team) {
      return false;
    }
    return this.findCurrentUserTeamMember(team)?.role === 'team-lead';
  });
  canManageTeamInvites = computed(() => {
    if (this.isAdmin()) {
      return true;
    }
    const role = this.currentUserTeamMember()?.role;
    return role === 'coach' || role === 'captain' || role === 'team-lead';
  });
  canEditTeamWelcome = computed(() => this.canManageTeamInvites());
  canEditTeamDeadline = computed(() => this.canManageTeamInvites() && !!this.teamGoal()?.id);
  canAccessDirectConversations = computed(() => this.isAdmin() || this.isCurrentUserTeamLead());
  canManageParticipantConversations = computed(() => this.isAdmin() || this.isCurrentUserTeamLead());
  canManageMissionControlCards = computed(() => this.isAdmin() || this.isCurrentUserTeamLead());
  canLeaveTeam = computed(() => this.isCurrentUserMember() && !this.isAdmin());
  readonly missionControlMetricOptions = MISSION_CONTROL_METRIC_OPTIONS;
  readonly missionControlStyleOptions = MISSION_CONTROL_STYLE_OPTIONS;
  summaryMembers = computed(() => {
    return (this.team()?.members || []).filter(member => member.role !== 'admin' && member.role !== 'coach');
  });
  participantMembers = computed(() => {
    const currentUserId = this.currentUserId();
    return (this.team()?.members || [])
      .filter(member => member.userId !== currentUserId)
      .filter(member => member.role !== 'admin' && member.role !== 'coach');
  });
  activeDirectParticipantUserId = computed(() => {
    if (!this.canAccessDirectConversations()) {
      return null;
    }
    if (this.canManageParticipantConversations()) {
      return this.selectedDirectMemberUserId();
    }
    const currentTeamMemberUserId = this.findCurrentUserTeamMember(this.team())?.userId;
    return currentTeamMemberUserId || this.currentUserId() || null;
  });
  activeDirectParticipant = computed(() => {
    const participantUserId = this.activeDirectParticipantUserId();
    if (!participantUserId) {
      return null;
    }
    return (this.team()?.members || []).find(member => member.userId === participantUserId) || null;
  });
  participantSummaryRows = computed(() => {
    const activityMap = this.participantActivityMap();
    return this.summaryMembers().map(member => ({
      member,
      activity: activityMap[member.userId] || null
    }));
  });
  teamDirectSummary = computed<TeamMissionSummary>(() => {
    const rows = this.participantSummaryRows();
    const totalParticipants = this.team()?.members.length || rows.length;
    const goalsStarted = rows.filter(row => !!row.activity?.goalId || !!row.activity?.primaryGoal).length;
    const totalMilestones = rows.reduce((sum, row) => sum + (row.activity?.totalMilestones || 0), 0);
    const completedMilestones = rows.reduce((sum, row) => sum + (row.activity?.completedMilestones || 0), 0);
    const totalToday = rows.reduce((sum, row) => sum + (row.activity?.totalToday || 0), 0);
    const completedToday = rows.reduce((sum, row) => sum + (row.activity?.completedToday || 0), 0);
    const activeTodayCount = rows.filter(row => (row.activity?.totalToday || 0) > 0).length;
    const completionPercent = totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;
    const todayPercent = totalToday > 0 ? Math.round((completedToday / totalToday) * 100) : 0;
    return {
      totalParticipants,
      goalsStarted,
      totalMilestones,
      completedMilestones,
      totalToday,
      completedToday,
      activeTodayCount,
      completionPercent: Math.max(0, Math.min(100, completionPercent)),
      todayPercent: Math.max(0, Math.min(100, todayPercent))
    };
  });
  missionControlCards = computed(() => this.resolveMissionControlCards(this.team()?.missionControlCards));
  renderedMissionControlCards = computed(() => {
    return this.missionControlCardsEditing()
      ? this.missionControlDraftCards()
      : this.missionControlCards();
  });
  missionControlCardViews = computed<MissionControlCardDisplay[]>(() => {
    const summary = this.teamDirectSummary();
    return this.renderedMissionControlCards().map(card => this.buildMissionControlCardView(card, summary));
  });
  selectedConversationOverview = computed(() => {
    const member = this.activeDirectParticipant();
    const activity = this.selectedDirectMemberActivity();
    if (!member) {
      return null;
    }
    const completionPercent = this.getParticipantCompletionPercent(activity);
    const todayPercent = this.getParticipantTodayPercent(activity);
    return {
      member,
      activity,
      completionPercent,
      todayPercent,
      hasGoal: !!activity?.goalId || !!activity?.primaryGoal
    };
  });

  coverImageSrc = computed(() => {
    return this.coverImagePreview() || this.team()?.coverImageUrl || '/assets/team-rocket.jpg';
  });
  teamAiDisplayName = computed(() => {
    const name = String(this.team()?.aiSettings?.displayName || '').trim();
    return name || 'Rocket AI';
  });
  teamAiAvatarUrl = computed(() => {
    const avatarUrl = String(this.team()?.aiSettings?.avatarUrl || '').trim();
    return avatarUrl || '/assets/rocket-goals.png';
  });
  teamAiAvatarPreviewSrc = computed(() => {
    return this.aiAvatarPreview() || this.teamAiAvatarUrl();
  });
  teamAiPersonality = computed(() => {
    return String(this.team()?.aiSettings?.personality || '').trim();
  });

  showJoinOnboarding = computed(() => {
    return !!this.team() && !this.isCurrentUserMember();
  });

  canShareTeamLink = computed(() => {
    return !!this.team()?.id && this.canManageTeamInvites();
  });

  isBusyJoining = computed(() => this.authActionLoading() || this.joiningTeam());

  readonly teamPageUrl = computed(() => this.buildTeamPageUrl(this.team()?.id || undefined));
  canOpenTeamRocketGoal = computed(() => this.isCurrentUserMember() && !this.preparingTeamGoal());
  canCreateMeetingRoom = computed(() => this.isCurrentUserMember());
  meetingRoomLink = computed(() => {
    const raw = String(this.team()?.meetingRoomLink || '').trim();
    return raw || null;
  });
  hasTelegramGroup = computed(() => !!this.team()?.telegramGroupId);
  telegramInviteLink = computed(() => this.team()?.telegramGroupInviteLink || null);

  constructor() {
    effect(() => {
      const team = this.team();
      const isMember = this.isCurrentUserMember();
      const canAccessDirectConversations = this.canAccessDirectConversations();
      const canManageParticipantConversations = this.canManageParticipantConversations();

      if (!isMember && this.activeTab() !== 'members') {
        this.activeTab.set('members');
      }
      if (!canAccessDirectConversations && this.activeTab() === 'direct') {
        this.activeTab.set('members');
      }

      if (!team || !this.showJoinOnboarding()) {
        this.showJoinModal.set(false);
        this.joinModalDismissed.set(false);
      } else if (!this.showJoinModal() && !this.joinModalDismissed()) {
        this.showJoinModal.set(true);
      }

        if (team?.id && isMember && this.messagesLoadedForTeamId !== team.id) {
          void this.loadMessages(team.id);
        }

        const profile = this.authService.profile();
        if (team?.id && isMember && profile?.userId && this.shouldLinkCurrentUserTeamGoal(team)) {
          const teamGoalId = (this.teamRocketGoalId() || team.rocketGoalId || '').trim();
          const memberGoalId = (this.memberTeamRocketGoalId() || '').trim();
          const linkedGoalId = (profile.myOneThingGoalId || '').trim();
          const profileKey = `${team.id}|${profile.userId}|${teamGoalId}|${memberGoalId}|${linkedGoalId}`;
          if (this.linkedTeamGoalProfileKey !== profileKey) {
            this.linkedTeamGoalProfileKey = profileKey;
            void this.linkCurrentUserToTeamGoal(team.id);
          }
        } else {
          this.linkedTeamGoalProfileKey = null;
          this.memberTeamRocketGoalId.set(null);
        }

      // Generate QR code when telegram group is connected
      if (team?.telegramGroupInviteLink) {
        void this.generateTelegramQr(team.telegramGroupInviteLink);
      }

      if (team?.id && isMember) {
        const summaryMembers = this.summaryMembers();
        const summaryKey = `${team.id}|${summaryMembers.map(member => member.userId).join(',')}`;
        if (summaryKey !== this.participantSummaryLoadedKey) {
          this.participantSummaryLoadedKey = summaryKey;
          void this.loadParticipantActivitySummaries(team.id, summaryMembers);
        }

        if (canAccessDirectConversations && canManageParticipantConversations) {
          const participants = this.participantMembers();
          const selectedMemberId = this.selectedDirectMemberUserId();
          if (!participants.some(member => member.userId === selectedMemberId)) {
            this.selectedDirectMemberUserId.set(participants[0]?.userId || null);
          }
        } else {
          this.selectedDirectMemberUserId.set(null);
          this.selectedDirectMemberActivity.set(null);
          this.directMessages.set([]);
          this.directConversationPreviews.set([]);
          this.directConversationLoadedForTeamId = null;
          this.loadingDirectMessages.set(false);
          this.loadingDirectActivity.set(false);
          this.loadingDirectConversations.set(false);
          this.directError.set(null);
          this.directSendError.set(null);
          this.directMessage = '';
        }
      } else {
        this.selectedDirectMemberUserId.set(null);
        this.selectedDirectMemberActivity.set(null);
        this.directMessages.set([]);
        this.directConversationPreviews.set([]);
        this.directConversationLoadedForTeamId = null;
        this.participantActivityMap.set({});
        this.participantSummaryLoadedKey = null;
        this.loadingParticipantSummaries.set(false);
        this.participantSummaryError.set(null);
      }
    });

    effect(() => {
      const isChatTab = this.activeTab() === 'chat';
      const messageCount = this.messages().length;
      if (!isChatTab || !this.isCurrentUserMember()) {
        return;
      }
      if (messageCount === 0) {
        return;
      }

      this.scrollToBottom();
    });

    effect(() => {
      const isDirectTab = this.activeTab() === 'direct';
      const canAccessDirectConversations = this.canAccessDirectConversations();
      const teamId = this.team()?.id;
      const participantUserId = this.activeDirectParticipantUserId();
      if (!isDirectTab || !canAccessDirectConversations || !teamId || !participantUserId) {
        this.stopDirectConversationPolling();
        return;
      }
      void this.loadSelectedParticipantConversation();
      this.startDirectConversationPolling();
    });

    effect(() => {
      const isDirectTab = this.activeTab() === 'direct';
      const messageCount = this.directMessages().length;
      if (!isDirectTab || !this.canAccessDirectConversations()) {
        return;
      }
      if (messageCount === 0) {
        return;
      }
      this.scrollDirectToBottom();
    });
  }

  async ngOnInit() {
    const teamId = this.route.snapshot.paramMap.get('id');
    if (!teamId) {
      this.loading.set(false);
      return;
    }

    this.teamId.set(teamId);

    await this.loadTeam(teamId);
    await this.prepareTeamRocketGoal(teamId);

    const verified = this.route.snapshot.queryParamMap.get('verified');
    if (verified === '1' || verified === 'true') {
      await this.completeEmailVerificationAndJoin(true);
    }
  }

  ngOnDestroy(): void {
    this.stopDirectConversationPolling();
    this.stopTelegramLinkPolling();
    this.stopTeamCountdown();
  }

  private async loadTeam(teamId: string) {
    this.loading.set(true);
    this.memberTeamRocketGoalId.set(null);
    try {
      const team = await this.teamService.getTeamById(teamId);
      this.team.set(team);
      const resolvedGoalId = (team?.rocketGoalId || '').trim() || null;
      this.teamRocketGoalId.set(resolvedGoalId);
      void this.loadTeamGoal(resolvedGoalId);
      this.teamWelcomeEditing.set(false);
      this.teamWelcomeError.set(null);
      this.creatingMeetingRoom.set(false);
      this.meetingRoomError.set(null);
      this.meetingRoomNotice.set(null);
      this.directConversationLoadedForTeamId = null;
      this.participantSummaryLoadedKey = null;
      this.participantActivityMap.set({});
      this.participantSummaryError.set(null);
      this.missionControlCardsEditing.set(false);
      this.showAddMissionControlCardForm.set(false);
      this.missionControlDraftCards.set([]);
      this.missionControlCardsError.set(null);
      this.draggingMissionControlCardId.set(null);
      this.dragOverMissionControlCardId.set(null);
      this.dragOverMissionControlCardPosition.set(null);
      this.aiSettingsEditing.set(false);
      this.savingAiSettings.set(false);
      this.aiSettingsError.set(null);
      this.aiSettingsSuccess.set(null);
      this.resetAiAvatarUploadState();
    } catch (err) {
      console.error('Failed to load team:', err);
      this.joinError.set('Unable to load this team right now. Please refresh and try again.');
      this.memberTeamRocketGoalId.set(null);
      this.teamGoal.set(null);
      this.teamDeadlineEditing.set(false);
      this.teamDeadlineError.set(null);
      this.teamWelcomeEditing.set(false);
      this.teamWelcomeError.set(null);
      this.creatingMeetingRoom.set(false);
      this.meetingRoomError.set(null);
      this.meetingRoomNotice.set(null);
      this.aiSettingsEditing.set(false);
      this.savingAiSettings.set(false);
      this.aiSettingsError.set(null);
      this.aiSettingsSuccess.set(null);
      this.resetAiAvatarUploadState();
      this.stopTeamCountdown();
      this.setTeamCountdownValues(0, 0, 0, 0);
    } finally {
      this.loading.set(false);
    }
  }

  private async prepareTeamRocketGoal(teamId: string) {
    const currentTeam = this.team();
    if (currentTeam?.rocketGoalId) {
      const resolvedGoalId = currentTeam.rocketGoalId.trim();
      this.teamRocketGoalId.set(resolvedGoalId);
      void this.loadTeamGoal(resolvedGoalId);
      return;
    }

    this.preparingTeamGoal.set(true);
    this.teamGoalError.set(null);
    try {
      const goalId = await this.teamService.ensureTeamRocketGoal(teamId);
      this.teamRocketGoalId.set(goalId);
      this.team.update(current => (current ? { ...current, rocketGoalId: goalId } : current));
      void this.loadTeamGoal(goalId);
    } catch (err) {
      console.error('Failed to prepare team rocket goal:', err);
      this.teamGoalError.set('Unable to open Individual View right now. Please try again.');
    } finally {
      this.preparingTeamGoal.set(false);
    }
  }

  openTeamRocketGoalView() {
    const teamId = this.team()?.id || this.teamId();
    if (!teamId || !this.isCurrentUserMember()) {
      return;
    }

    const openWithGoal = (goalId: string) => {
      this.router.navigate(['/rocketgoal', goalId], {
        queryParams: { teamId }
      });
    };

    const existingGoalId = (this.memberTeamRocketGoalId() || '').trim();
    if (existingGoalId) {
      openWithGoal(existingGoalId);
      return;
    }

    if (this.preparingTeamGoal()) {
      return;
    }

    this.preparingTeamGoal.set(true);
    void this.linkCurrentUserToTeamGoal(teamId)
      .then(() => {
        const resolvedGoalId = (this.memberTeamRocketGoalId() || '').trim();
        if (resolvedGoalId) {
          openWithGoal(resolvedGoalId);
        }
      })
      .finally(() => {
        this.preparingTeamGoal.set(false);
      });
  }

  private async loadTeamGoal(goalId: string | null): Promise<void> {
    const normalizedGoalId = (goalId || '').trim();
    if (!normalizedGoalId) {
      this.teamGoal.set(null);
      this.teamDeadlineEditing.set(false);
      this.teamDeadlineError.set(null);
      this.stopTeamCountdown();
      this.setTeamCountdownValues(0, 0, 0, 0);
      return;
    }

    try {
      const goal = await this.rocketGoalsService.getRocketGoalById(normalizedGoalId);
      this.teamGoal.set((goal as RocketGoal | null) || null);
      this.teamDeadlineEditing.set(false);
      this.teamDeadlineError.set(null);
      this.startTeamCountdown();
    } catch (err) {
      console.error('Failed to load team rocket goal:', err);
      this.teamGoal.set(null);
      this.teamDeadlineEditing.set(false);
      this.teamDeadlineError.set('Unable to load mission deadline right now.');
      this.stopTeamCountdown();
      this.setTeamCountdownValues(0, 0, 0, 0);
    }
  }

  private stopTeamCountdown(): void {
    if (this.teamCountdownInterval) {
      clearInterval(this.teamCountdownInterval);
      this.teamCountdownInterval = null;
    }
  }

  private setTeamCountdownValues(days: number, hours: number, minutes: number, seconds: number): void {
    this.teamCountdownDays.set(days);
    this.teamCountdownHours.set(hours);
    this.teamCountdownMinutes.set(minutes);
    this.teamCountdownSeconds.set(seconds);
  }

  private startTeamCountdown(): void {
    this.stopTeamCountdown();
    const goal = this.teamGoal();
    if (!goal) {
      this.setTeamCountdownValues(0, 0, 0, 0);
      return;
    }

    const endTime = this.getTeamGoalEndTime(goal);
    if (!endTime) {
      this.setTeamCountdownValues(0, 0, 0, 0);
      return;
    }

    const tick = () => {
      const remaining = endTime - Date.now();
      if (remaining <= 0) {
        this.setTeamCountdownValues(0, 0, 0, 0);
        return;
      }

      const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
      const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
      const seconds = Math.floor((remaining % (60 * 1000)) / 1000);
      this.setTeamCountdownValues(days, hours, minutes, seconds);
    };

    tick();
    this.teamCountdownInterval = setInterval(tick, 1000);
  }

  private getTeamGoalStartTime(goal: RocketGoal | null = this.teamGoal()): number {
    return Number(goal?.startTime || Date.now());
  }

  private getTeamGoalDeadlineTimestamp(goal: RocketGoal | null = this.teamGoal()): number | null {
    const deadlineValue = goal?.answers?.['deadlineDate'];
    if (!deadlineValue) return null;
    if (typeof deadlineValue === 'number') return deadlineValue;
    if (typeof deadlineValue === 'string') {
      const parsed = Date.parse(deadlineValue);
      return Number.isNaN(parsed) ? null : parsed;
    }
    if (typeof deadlineValue?.toMillis === 'function') {
      try {
        return deadlineValue.toMillis();
      } catch {
        return null;
      }
    }
    return null;
  }

  private getTeamGoalTimeframeDays(goal: RocketGoal | null = this.teamGoal()): number {
    const fromAnswers = Number(goal?.answers?.['timeframe_days']);
    if (Number.isFinite(fromAnswers) && fromAnswers > 0) {
      return Math.max(1, Math.round(fromAnswers));
    }
    const timeframe = String(goal?.answers?.['timeframe'] || '').trim();
    if (timeframe === 'week') return 7;
    if (timeframe === 'month') return 30;
    if (timeframe === '3months') return 90;
    if (timeframe === '6months') return 180;
    return 30;
  }

  private getTeamGoalEndTime(goal: RocketGoal | null = this.teamGoal()): number | null {
    if (!goal) return null;
    const deadlineTimestamp = this.getTeamGoalDeadlineTimestamp(goal);
    if (deadlineTimestamp) {
      return deadlineTimestamp;
    }
    const startTime = this.getTeamGoalStartTime(goal);
    return startTime + (this.getTeamGoalTimeframeDays(goal) * 24 * 60 * 60 * 1000);
  }

  getTeamDeadlineDateDisplay(): string {
    const goal = this.teamGoal();
    const endTime = this.getTeamGoalEndTime(goal);
    if (!endTime) return '';
    return new Date(endTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  getTeamCountdownProgress(): number {
    const goal = this.teamGoal();
    if (!goal) return 0;
    const startTime = this.getTeamGoalStartTime(goal);
    const endTime = this.getTeamGoalEndTime(goal);
    if (!endTime || endTime <= startTime) return 0;
    const total = endTime - startTime;
    const elapsed = Math.min(Math.max(Date.now() - startTime, 0), total);
    return Math.max(0, Math.min(100, Math.round((elapsed / total) * 100)));
  }

  private formatDateInputValue(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  getTeamMinDeadlineDate(): string {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return this.formatDateInputValue(tomorrow);
  }

  startEditingTeamDeadline(): void {
    if (!this.canEditTeamDeadline()) {
      return;
    }
    const goal = this.teamGoal();
    if (!goal) {
      return;
    }

    const deadlineTimestamp = this.getTeamGoalDeadlineTimestamp(goal);
    const fallbackEndTime = this.getTeamGoalEndTime(goal);
    const initialDate = new Date(deadlineTimestamp || fallbackEndTime || Date.now());
    this.teamDeadlineInputValue.set(this.formatDateInputValue(initialDate));
    this.teamDeadlineError.set(null);
    this.teamDeadlineEditing.set(true);
  }

  cancelEditingTeamDeadline(): void {
    this.teamDeadlineEditing.set(false);
    this.teamDeadlineError.set(null);
  }

  private getTimeframeDaysFromDeadline(deadlineTimestamp: number, startTime: number): number {
    const dayMs = 24 * 60 * 60 * 1000;
    const diffDays = Math.ceil((deadlineTimestamp - startTime) / dayMs);
    return Math.max(1, diffDays);
  }

  startEditingTeamWelcome(): void {
    if (!this.canEditTeamWelcome()) {
      return;
    }
    const team = this.team();
    if (!team?.id) {
      return;
    }
    this.teamWelcomeDraft.set(String(team.welcomeMessage || ''));
    this.teamWelcomeError.set(null);
    this.teamWelcomeEditing.set(true);
  }

  cancelEditingTeamWelcome(): void {
    this.teamWelcomeEditing.set(false);
    this.teamWelcomeError.set(null);
  }

  startEditingTeamAiSettings(): void {
    if (!this.isAdmin()) {
      return;
    }
    const team = this.team();
    if (!team?.id) {
      return;
    }

    const currentSettings = team.aiSettings || {};
    this.aiDisplayNameDraft = String(currentSettings.displayName || '').trim();
    this.aiAvatarUrlDraft = String(currentSettings.avatarUrl || '').trim();
    this.aiPersonalityDraft = String(currentSettings.personality || '').trim();
    this.resetAiAvatarUploadState();
    this.aiSettingsError.set(null);
    this.aiSettingsSuccess.set(null);
    this.aiSettingsEditing.set(true);
  }

  cancelEditingTeamAiSettings(): void {
    this.aiSettingsEditing.set(false);
    this.aiSettingsError.set(null);
    this.resetAiAvatarUploadState();
  }

  onAiAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.aiSettingsError.set('Please select an image file.');
      this.resetAiAvatarUploadState();
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      this.aiSettingsError.set('AI avatar image should be smaller than 10MB.');
      this.resetAiAvatarUploadState();
      return;
    }

    this.aiSettingsError.set(null);
    this.aiAvatarFile = file;
    const reader = new FileReader();
    reader.onload = () => {
      this.aiAvatarPreview.set(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  clearAiAvatarSelection(): void {
    this.resetAiAvatarUploadState();
  }

  private resetAiAvatarUploadState(): void {
    this.aiAvatarFile = null;
    this.aiAvatarPreview.set(null);
    if (this.aiAvatarInput?.nativeElement) {
      this.aiAvatarInput.nativeElement.value = '';
    }
  }

  private isValidAiAvatarUrl(value: string): boolean {
    if (!value) {
      return true;
    }
    if (value.startsWith('/')) {
      return true;
    }
    return value.startsWith('http://') || value.startsWith('https://');
  }

  async saveTeamAiSettings(): Promise<void> {
    if (!this.isAdmin() || this.savingAiSettings()) {
      return;
    }

    const team = this.team();
    if (!team?.id) {
      return;
    }

    const displayName = this.aiDisplayNameDraft.trim();
    const avatarUrlFromField = this.aiAvatarUrlDraft.trim();
    const personality = this.aiPersonalityDraft.trim();

    if (displayName.length > 60) {
      this.aiSettingsError.set('AI display name should stay under 60 characters.');
      return;
    }
    if (!this.aiAvatarFile && !this.isValidAiAvatarUrl(avatarUrlFromField)) {
      this.aiSettingsError.set('Avatar URL should start with https://, http://, or /.');
      return;
    }
    if (personality.length > 12000) {
      this.aiSettingsError.set('Personality text should stay under 12,000 characters.');
      return;
    }

    this.savingAiSettings.set(true);
    this.aiSettingsError.set(null);
    this.aiSettingsSuccess.set(null);
    try {
      let resolvedAvatarUrl = avatarUrlFromField;
      if (this.aiAvatarFile) {
        resolvedAvatarUrl = await this.teamService.uploadTeamAiAvatar(team.id, this.aiAvatarFile);
      }

      const nextAiSettings: Team['aiSettings'] = {};
      if (displayName) {
        nextAiSettings.displayName = displayName;
      }
      if (resolvedAvatarUrl) {
        nextAiSettings.avatarUrl = resolvedAvatarUrl;
      }
      if (personality) {
        nextAiSettings.personality = personality;
      }

      await this.teamService.updateTeam(team.id, { aiSettings: nextAiSettings } as Partial<Team>);
      this.team.update(current => (current ? { ...current, aiSettings: nextAiSettings } : current));
      this.aiSettingsEditing.set(false);
      this.aiSettingsSuccess.set('AI settings saved.');
      this.resetAiAvatarUploadState();
    } catch (error) {
      console.error('Failed to save team AI settings:', error);
      this.aiSettingsError.set('Could not save AI settings right now.');
    } finally {
      this.savingAiSettings.set(false);
    }
  }

  async saveTeamWelcome(): Promise<void> {
    if (!this.canEditTeamWelcome()) {
      return;
    }
    const team = this.team();
    if (!team?.id) {
      return;
    }

    const nextMessage = this.teamWelcomeDraft().trim();
    if (nextMessage.length > 320) {
      this.teamWelcomeError.set('Welcome message should stay under 320 characters.');
      return;
    }

    this.savingTeamWelcome.set(true);
    this.teamWelcomeError.set(null);
    try {
      await this.teamService.updateTeam(team.id, { welcomeMessage: nextMessage } as Partial<Team>);
      this.team.update(current => (current ? { ...current, welcomeMessage: nextMessage } : current));
      this.teamWelcomeEditing.set(false);
    } catch (error) {
      console.error('Failed to save welcome message:', error);
      this.teamWelcomeError.set('Could not save welcome message right now.');
    } finally {
      this.savingTeamWelcome.set(false);
    }
  }

  async saveTeamDeadline(): Promise<void> {
    if (!this.canEditTeamDeadline()) {
      return;
    }
    const goal = this.teamGoal();
    if (!goal?.id) {
      return;
    }

    const inputValue = this.teamDeadlineInputValue().trim();
    if (!inputValue) {
      this.teamDeadlineError.set('Pick a deadline date to continue.');
      return;
    }

    const [year, month, day] = inputValue.split('-').map(value => Number(value));
    if (!year || !month || !day) {
      this.teamDeadlineError.set('Pick a valid deadline date.');
      return;
    }

    const deadline = new Date(year, month - 1, day, 23, 59, 59, 999);
    if (Number.isNaN(deadline.getTime())) {
      this.teamDeadlineError.set('Pick a valid deadline date.');
      return;
    }

    this.savingTeamDeadline.set(true);
    this.teamDeadlineError.set(null);

    try {
      const startTime = this.getTeamGoalStartTime(goal);
      const updatedAnswers = {
        ...(goal.answers || {}),
        deadlineDate: deadline.getTime(),
        timeframe_days: this.getTimeframeDaysFromDeadline(deadline.getTime(), startTime)
      };

      await this.rocketGoalsService.updateRocketGoal(goal.id, { answers: updatedAnswers });
      this.teamGoal.set({ ...goal, answers: updatedAnswers });
      this.teamDeadlineEditing.set(false);
      this.startTeamCountdown();
    } catch (error) {
      console.error('Failed to save team deadline:', error);
      this.teamDeadlineError.set('Could not save deadline. Please try again.');
    } finally {
      this.savingTeamDeadline.set(false);
    }
  }

  private async loadMessages(teamId: string) {
    try {
      const msgs = await this.teamService.getMessages(teamId);
      this.messages.set(msgs);
      this.messagesLoadedForTeamId = teamId;
      this.scrollToBottom();
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  }

  openDirectConversationsTab() {
    if (!this.canAccessDirectConversations()) {
      return;
    }
    this.activeTab.set('direct');
    if (this.canManageParticipantConversations()) {
      const selectedMember = this.selectedDirectMemberUserId();
      const participants = this.participantMembers();
      if (!selectedMember && participants.length) {
        this.selectedDirectMemberUserId.set(participants[0].userId);
      }
    } else {
      const ownParticipantId = this.findCurrentUserTeamMember(this.team())?.userId || this.currentUserId() || null;
      this.selectedDirectMemberUserId.set(ownParticipantId);
    }
  }

  selectParticipantConversation(member: TeamMember) {
    if (!this.canManageParticipantConversations()) {
      return;
    }
    if (this.selectedDirectMemberUserId() === member.userId) {
      return;
    }
    this.selectedDirectMemberUserId.set(member.userId);
  }

  openMemberProfile(member: TeamMember, event?: Event) {
    event?.stopPropagation();
    const userId = (member.userId || '').trim();
    if (!userId) {
      return;
    }
    this.router.navigate(['/profile', userId]);
  }

  getConversationPreview(memberUserId: string): TeamMemberConversationPreview | null {
    return this.directConversationPreviews().find(item => item.memberUserId === memberUserId) || null;
  }

  getConversationPreviewText(memberUserId: string): string {
    const preview = this.getConversationPreview(memberUserId);
    if (!preview?.lastMessage?.content) {
      return 'No direct messages yet';
    }
    const message = preview.lastMessage.content.trim();
    if (!message) {
      return 'No direct messages yet';
    }
    if (message.length <= 72) {
      return message;
    }
    return `${message.slice(0, 72)}...`;
  }

  getParticipantCompletionPercent(activity: TeamMemberActivitySnapshot | null): number {
    if (!activity?.totalMilestones) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round((activity.completedMilestones / activity.totalMilestones) * 100)));
  }

  getParticipantTodayPercent(activity: TeamMemberActivitySnapshot | null): number {
    if (!activity?.totalToday) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round((activity.completedToday / activity.totalToday) * 100)));
  }

  getParticipantActivity(memberUserId: string): TeamMemberActivitySnapshot | null {
    return this.participantActivityMap()[memberUserId] || null;
  }

  openMissionControlEditor() {
    if (!this.canManageMissionControlCards()) {
      return;
    }
    this.missionControlCardsError.set(null);
    this.missionControlCardsSuccess.set(null);
    this.showAddMissionControlCardForm.set(false);
    this.newMissionControlCardName = '';
    this.newMissionControlCardMetric = 'overall_milestone_progress';
    this.newMissionControlCardStyle = 'histogram';
    this.missionControlDraftCards.set(this.missionControlCards().map(card => ({ ...card })));
    this.missionControlCardsEditing.set(true);
    this.draggingMissionControlCardId.set(null);
    this.dragOverMissionControlCardId.set(null);
    this.dragOverMissionControlCardPosition.set(null);
  }

  cancelMissionControlEditor() {
    this.missionControlCardsEditing.set(false);
    this.showAddMissionControlCardForm.set(false);
    this.missionControlDraftCards.set([]);
    this.newMissionControlCardName = '';
    this.draggingMissionControlCardId.set(null);
    this.dragOverMissionControlCardId.set(null);
    this.dragOverMissionControlCardPosition.set(null);
  }

  showAddMissionControlCard() {
    if (!this.canManageMissionControlCards() || !this.missionControlCardsEditing()) {
      return;
    }
    this.showAddMissionControlCardForm.set(true);
    this.newMissionControlCardName = '';
    this.newMissionControlCardMetric = 'overall_milestone_progress';
    this.newMissionControlCardStyle = 'histogram';
  }

  cancelAddMissionControlCard() {
    this.showAddMissionControlCardForm.set(false);
    this.newMissionControlCardName = '';
  }

  addMissionControlCardToDraft() {
    if (!this.missionControlCardsEditing()) {
      return;
    }
    const fallbackLabel = this.getMissionControlMetricLabel(this.newMissionControlCardMetric);
    const name = this.newMissionControlCardName.trim() || fallbackLabel;
    const newCard: TeamMissionControlCard = {
      id: this.createMissionControlCardId(),
      name,
      style: this.newMissionControlCardStyle,
      metricKey: this.newMissionControlCardMetric
    };
    this.missionControlDraftCards.update(cards => [...cards, newCard]);
    this.showAddMissionControlCardForm.set(false);
    this.newMissionControlCardName = '';
  }

  updateMissionControlDraftCardName(cardId: string, name: string) {
    this.missionControlDraftCards.update(cards => cards.map(card => (
      card.id === cardId
        ? { ...card, name }
        : card
    )));
  }

  updateMissionControlDraftCardMetric(cardId: string, metricKey: TeamMissionControlMetricKey) {
    this.missionControlDraftCards.update(cards => cards.map(card => (
      card.id === cardId ? { ...card, metricKey } : card
    )));
  }

  updateMissionControlDraftCardStyle(cardId: string, style: TeamMissionControlCardStyle) {
    this.missionControlDraftCards.update(cards => cards.map(card => (
      card.id === cardId ? { ...card, style } : card
    )));
  }

  removeMissionControlDraftCard(cardId: string) {
    this.missionControlDraftCards.update(cards => cards.filter(card => card.id !== cardId));
    if (this.draggingMissionControlCardId() === cardId) {
      this.draggingMissionControlCardId.set(null);
    }
    if (this.dragOverMissionControlCardId() === cardId) {
      this.dragOverMissionControlCardId.set(null);
      this.dragOverMissionControlCardPosition.set(null);
    }
  }

  onMissionControlCardDragStart(cardId: string, event: DragEvent) {
    if (!this.missionControlCardsEditing()) {
      return;
    }
    this.draggingMissionControlCardId.set(cardId);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', cardId);
    }
  }

  onMissionControlCardDragOver(targetCardId: string, event: DragEvent) {
    if (!this.missionControlCardsEditing()) {
      return;
    }
    const draggingId = this.draggingMissionControlCardId();
    if (!draggingId || draggingId === targetCardId) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }

    const targetEl = event.currentTarget as HTMLElement | null;
    let position: 'before' | 'after' = 'before';
    if (targetEl) {
      const rect = targetEl.getBoundingClientRect();
      position = event.clientY >= rect.top + rect.height / 2 ? 'after' : 'before';
    }
    this.dragOverMissionControlCardId.set(targetCardId);
    this.dragOverMissionControlCardPosition.set(position);
  }

  onMissionControlCardDrop(targetCardId: string, event: DragEvent) {
    if (!this.missionControlCardsEditing()) {
      return;
    }
    event.preventDefault();
    const sourceCardId = this.draggingMissionControlCardId()
      || event.dataTransfer?.getData('text/plain')
      || null;

    const position = this.dragOverMissionControlCardPosition() || 'before';
    this.reorderMissionControlDraftCards(sourceCardId, targetCardId, position);
    this.draggingMissionControlCardId.set(null);
    this.dragOverMissionControlCardId.set(null);
    this.dragOverMissionControlCardPosition.set(null);
  }

  onMissionControlCardDragEnd() {
    this.draggingMissionControlCardId.set(null);
    this.dragOverMissionControlCardId.set(null);
    this.dragOverMissionControlCardPosition.set(null);
  }

  private reorderMissionControlDraftCards(
    sourceCardId: string | null,
    targetCardId: string,
    position: 'before' | 'after'
  ) {
    if (!sourceCardId || sourceCardId === targetCardId) {
      return;
    }
    this.missionControlDraftCards.update(cards => {
      const sourceIndex = cards.findIndex(card => card.id === sourceCardId);
      const targetIndex = cards.findIndex(card => card.id === targetCardId);
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
        return cards;
      }

      const next = [...cards];
      const [moved] = next.splice(sourceIndex, 1);
      let insertIndex = targetIndex;
      if (sourceIndex < targetIndex) {
        insertIndex -= 1;
      }
      if (position === 'after') {
        insertIndex += 1;
      }
      insertIndex = Math.max(0, Math.min(next.length, insertIndex));
      next.splice(insertIndex, 0, moved);
      return next;
    });
  }

  async saveMissionControlCards() {
    if (!this.canManageMissionControlCards() || this.missionControlCardsSaving()) {
      return;
    }
    const team = this.team();
    if (!team?.id) {
      return;
    }
    const normalizedCards = this.normalizeMissionControlCards(this.missionControlDraftCards());
    if (!normalizedCards.length) {
      this.missionControlCardsError.set('Add at least one card before saving.');
      return;
    }
    this.missionControlCardsSaving.set(true);
    this.missionControlCardsError.set(null);
    this.missionControlCardsSuccess.set(null);
    try {
      await this.teamService.updateTeam(team.id, { missionControlCards: normalizedCards });
      this.team.update(current => current ? { ...current, missionControlCards: normalizedCards } : current);
      this.missionControlCardsEditing.set(false);
      this.showAddMissionControlCardForm.set(false);
      this.missionControlDraftCards.set([]);
      this.missionControlCardsSuccess.set('Mission Control cards updated.');
      this.draggingMissionControlCardId.set(null);
      this.dragOverMissionControlCardId.set(null);
      this.dragOverMissionControlCardPosition.set(null);
    } catch (error) {
      console.error('Failed to save Mission Control cards:', error);
      this.missionControlCardsError.set('Unable to save Mission Control cards right now.');
    } finally {
      this.missionControlCardsSaving.set(false);
    }
  }

  getMissionControlMetricLabel(metricKey: TeamMissionControlMetricKey): string {
    return this.missionControlMetricOptions.find(option => option.key === metricKey)?.label || 'Custom Data Point';
  }

  private resolveMissionControlCards(cards: TeamMissionControlCard[] | undefined): TeamMissionControlCard[] {
    if (!Array.isArray(cards) || cards.length === 0) {
      return DEFAULT_MISSION_CONTROL_CARDS.map(card => ({ ...card }));
    }
    return this.normalizeMissionControlCards(cards);
  }

  private normalizeMissionControlCards(cards: TeamMissionControlCard[]): TeamMissionControlCard[] {
    const allowedStyles = new Set<TeamMissionControlCardStyle>(['circular', 'histogram']);
    const allowedMetrics = new Set<TeamMissionControlMetricKey>([
      'total_members',
      'milestones_done',
      'today_execution',
      'active_today',
      'overall_milestone_progress',
      'today_execution_rate',
      'team_engagement_rate'
    ]);

    return cards
      .map((card, index) => {
        const fallback = DEFAULT_MISSION_CONTROL_CARDS[index % DEFAULT_MISSION_CONTROL_CARDS.length];
        const metricKey = allowedMetrics.has(card.metricKey) ? card.metricKey : fallback.metricKey;
        const style = allowedStyles.has(card.style) ? card.style : fallback.style;
        const name = String(card.name || '').trim() || this.getMissionControlMetricLabel(metricKey);
        const id = String(card.id || '').trim() || `mc-${Date.now()}-${index}`;
        return { id, name, style, metricKey } as TeamMissionControlCard;
      })
      .filter(card => !!card.id);
  }

  private createMissionControlCardId(): string {
    return `mc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private buildMissionControlCardView(
    card: TeamMissionControlCard,
    summary: TeamMissionSummary
  ): MissionControlCardDisplay {
    const totalMembers = summary.totalParticipants;
    const engagementPercent = totalMembers > 0
      ? Math.round((summary.goalsStarted / totalMembers) * 100)
      : 0;
    const activeTodayPercent = totalMembers > 0
      ? Math.round((summary.activeTodayCount / totalMembers) * 100)
      : 0;

    switch (card.metricKey) {
      case 'total_members':
        return {
          ...card,
          tone: 'participants',
          valueText: `${summary.totalParticipants}`,
          subtitle: `${summary.goalsStarted} with active goals`,
          percent: this.clampPercent(engagementPercent),
          percentText: `${this.clampPercent(engagementPercent)}%`,
          progressText: `${summary.goalsStarted} active`,
          footnote: `${summary.goalsStarted} of ${summary.totalParticipants} members have started their goals`
        };
      case 'milestones_done':
        return {
          ...card,
          tone: 'milestones',
          valueText: `${summary.completedMilestones} / ${summary.totalMilestones}`,
          subtitle: `${summary.completionPercent}% completion rate`,
          percent: this.clampPercent(summary.completionPercent),
          percentText: `${this.clampPercent(summary.completionPercent)}%`,
          progressText: `${summary.completedMilestones} done`,
          footnote: `${summary.completedMilestones} of ${summary.totalMilestones} milestones completed across all members`
        };
      case 'today_execution':
        return {
          ...card,
          tone: 'today',
          valueText: `${summary.completedToday} / ${summary.totalToday}`,
          subtitle: `${summary.todayPercent}% done today`,
          percent: this.clampPercent(summary.todayPercent),
          percentText: `${this.clampPercent(summary.todayPercent)}%`,
          progressText: `${summary.completedToday} done`,
          footnote: `${summary.completedToday} of ${summary.totalToday} tasks completed today`
        };
      case 'active_today':
        return {
          ...card,
          tone: 'active',
          valueText: `${summary.activeTodayCount}`,
          subtitle: 'members with tasks today',
          percent: this.clampPercent(activeTodayPercent),
          percentText: `${this.clampPercent(activeTodayPercent)}%`,
          progressText: `${summary.activeTodayCount} members`,
          footnote: `${summary.activeTodayCount} of ${summary.totalParticipants} members have tasks scheduled today`
        };
      case 'overall_milestone_progress':
        return {
          ...card,
          tone: 'milestones',
          valueText: `${summary.completionPercent}%`,
          subtitle: `${summary.completedMilestones}/${summary.totalMilestones} milestones`,
          percent: this.clampPercent(summary.completionPercent),
          percentText: `${this.clampPercent(summary.completionPercent)}%`,
          progressText: `${summary.completedMilestones} done`,
          footnote: `${summary.completedMilestones} of ${summary.totalMilestones} milestones completed across all members`
        };
      case 'today_execution_rate':
        return {
          ...card,
          tone: 'today',
          valueText: `${summary.todayPercent}%`,
          subtitle: `${summary.completedToday}/${summary.totalToday} tasks today`,
          percent: this.clampPercent(summary.todayPercent),
          percentText: `${this.clampPercent(summary.todayPercent)}%`,
          progressText: `${summary.completedToday} done`,
          footnote: `${summary.completedToday} of ${summary.totalToday} tasks completed today`
        };
      case 'team_engagement_rate':
        return {
          ...card,
          tone: 'engagement',
          valueText: `${this.clampPercent(engagementPercent)}%`,
          subtitle: `${summary.goalsStarted}/${summary.totalParticipants} started`,
          percent: this.clampPercent(engagementPercent),
          percentText: `${this.clampPercent(engagementPercent)}%`,
          progressText: `${summary.goalsStarted} active`,
          footnote: `${summary.goalsStarted} of ${summary.totalParticipants} members have started their goals`
        };
      default:
        return {
          ...card,
          tone: 'participants',
          valueText: '0',
          subtitle: 'No data',
          percent: 0,
          percentText: '0%',
          progressText: '0',
          footnote: 'No data'
        };
    }
  }

  private clampPercent(value: number): number {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  private async loadParticipantActivitySummaries(teamId: string, members: TeamMember[]) {
    const memberIds = members.map(member => member.userId).filter(Boolean);
    if (!memberIds.length) {
      this.participantActivityMap.set({});
      this.loadingParticipantSummaries.set(false);
      this.participantSummaryError.set(null);
      return;
    }

    this.loadingParticipantSummaries.set(true);
    this.participantSummaryError.set(null);
    try {
      const snapshots = await Promise.all(
        members.map(async member => {
          const activity = await this.teamService.getMemberActivitySnapshot(teamId, member.userId);
          return { memberUserId: member.userId, activity };
        })
      );
      const nextMap: Record<string, TeamMemberActivitySnapshot> = {};
      for (const item of snapshots) {
        nextMap[item.memberUserId] = item.activity;
      }
      this.participantActivityMap.set(nextMap);
    } catch (error) {
      console.error('Failed to load participant activity summaries:', error);
      this.participantSummaryError.set('Unable to load team execution summary right now.');
      this.participantActivityMap.set({});
    } finally {
      this.loadingParticipantSummaries.set(false);
    }
  }

  private async loadDirectConversationPreviews(teamId: string, memberUserIds: string[]) {
    if (!memberUserIds.length) {
      this.directConversationPreviews.set([]);
      this.directConversationLoadedForTeamId = teamId;
      return;
    }

    this.loadingDirectConversations.set(true);
    this.directError.set(null);
    try {
      const previews = await this.teamService.getMemberConversationPreviews(teamId, memberUserIds);
      this.directConversationPreviews.set(previews);
      this.directConversationLoadedForTeamId = teamId;
    } catch (err) {
      console.error('Failed to load direct conversation previews:', err);
      this.directError.set('Unable to load participant conversations right now.');
    } finally {
      this.loadingDirectConversations.set(false);
    }
  }

  private startDirectConversationPolling() {
    if (this.directConversationPollInterval) {
      return;
    }

    this.directConversationPollInterval = setInterval(() => {
      if (this.activeTab() !== 'direct' || !this.canAccessDirectConversations()) {
        this.stopDirectConversationPolling();
        return;
      }
      void this.refreshActiveDirectConversation(false);
    }, 4000);
  }

  private stopDirectConversationPolling() {
    if (this.directConversationPollInterval) {
      clearInterval(this.directConversationPollInterval);
      this.directConversationPollInterval = null;
    }
  }

  private async refreshActiveDirectConversation(showLoading: boolean): Promise<void> {
    const teamId = this.team()?.id;
    const participantUserId = this.activeDirectParticipantUserId();
    const canManageParticipantConversations = this.canManageParticipantConversations();
    if (!teamId || !participantUserId || !this.canAccessDirectConversations()) {
      return;
    }
    if (showLoading) {
      this.loadingDirectMessages.set(true);
      this.loadingDirectActivity.set(true);
      this.directError.set(null);
    }

    try {
      if (canManageParticipantConversations) {
        const participantIds = this.participantMembers().map(member => member.userId);
        if (this.directConversationLoadedForTeamId !== teamId) {
          await this.loadDirectConversationPreviews(teamId, participantIds);
        }
      }

      const [messages, activity] = await Promise.all([
        this.teamService.getDirectMessages(teamId, participantUserId),
        this.teamService.getMemberActivitySnapshot(teamId, participantUserId)
      ]);
      this.directMessages.set(messages);
      this.selectedDirectMemberActivity.set(activity);
      this.participantActivityMap.update(current => ({
        ...current,
        [participantUserId]: activity
      }));
      this.scrollDirectToBottom();
    } catch (err) {
      console.error('Failed to load participant conversation:', err);
      if (showLoading) {
        this.directError.set('Unable to load this participant conversation right now.');
        this.directMessages.set([]);
        this.selectedDirectMemberActivity.set(null);
      }
    } finally {
      if (showLoading) {
        this.loadingDirectMessages.set(false);
        this.loadingDirectActivity.set(false);
      }
    }
  }

  private async loadSelectedParticipantConversation() {
    await this.refreshActiveDirectConversation(true);
  }

  async sendDirectMessage() {
    const content = this.directMessage.trim();
    const teamId = this.team()?.id;
    const participantUserId = this.activeDirectParticipantUserId();
    const profile = this.authService.profile();
    if (!content || !teamId || !participantUserId || !profile || !this.canAccessDirectConversations()) {
      return;
    }

    const canManageParticipantConversations = this.canManageParticipantConversations();
    this.sendingDirectMessage.set(true);
    this.directSendError.set(null);
    this.directMessage = '';
    try {
      await this.teamService.sendDirectMessage(teamId, participantUserId, {
        senderId: profile.userId,
        senderName: `${profile.firstName} ${profile.lastName}`.trim() || profile.email,
        senderAvatarUrl: profile.profilePictureUrl,
        content,
        type: 'text',
        source: 'web'
      });
      await this.refreshActiveDirectConversation(false);
      if (canManageParticipantConversations) {
        await this.loadDirectConversationPreviews(teamId, this.participantMembers().map(member => member.userId));
      }
    } catch (err) {
      console.error('Failed to send direct message:', err);
      this.directSendError.set('Unable to send message right now.');
      this.directMessage = content;
    } finally {
      this.sendingDirectMessage.set(false);
    }
  }

  getAdmins(): TeamMember[] {
    return this.team()?.members.filter(m => m.role === 'admin' || m.role === 'coach') || [];
  }

  getMembers(): TeamMember[] {
    return this.team()?.members.filter(m => m.role === 'member') || [];
  }

  getAllMembers(): TeamMember[] {
    return this.sortMembersByRole(this.team()?.members || []);
  }

  getCoachesAndCaptains(): TeamMember[] {
    const members = (this.team()?.members || []).filter(member => member.role === 'coach' || member.role === 'captain');
    return this.sortMembersByRole(members);
  }

  getRegularMembers(): TeamMember[] {
    const members = (this.team()?.members || []).filter(member => member.role !== 'coach' && member.role !== 'captain');
    return this.sortMembersByRole(members);
  }

  isCoachOrCaptain(member: TeamMember): boolean {
    return member.role === 'coach' || member.role === 'captain';
  }

  getMemberRoleLabel(member: TeamMember): string {
    switch (member.role) {
      case 'team-lead':
        return 'Team Lead';
      case 'coach':
        return 'Coach';
      case 'captain':
        return 'Captain';
      case 'admin':
        return 'Admin';
      default:
        return 'Member';
    }
  }

  private sortMembersByRole(members: TeamMember[]): TeamMember[] {
    return [...members].sort((a, b) => {
      const rank = (role: TeamMember['role']) => {
        if (role === 'admin') return 0;
        if (role === 'coach') return 1;
        if (role === 'captain') return 2;
        if (role === 'team-lead') return 3;
        return 4;
      };
      return rank(a.role) - rank(b.role);
    });
  }

  canManageMemberActions(member: TeamMember): boolean {
    if (!this.isAdmin()) return false;
    if (member.userId === this.currentUserId()) return false;
    return member.role !== 'admin';
  }

  toggleMemberMenu(member: TeamMember, event?: Event) {
    event?.stopPropagation();
    if (!this.canManageMemberActions(member)) {
      return;
    }

    this.openMemberMenuUserId.update(current => current === member.userId ? null : member.userId);
  }

  closeMemberMenu() {
    this.openMemberMenuUserId.set(null);
  }

  async makeTeamLead(member: TeamMember) {
    const team = this.team();
    if (!team?.id || !this.isAdmin() || member.userId === this.currentUserId()) {
      return;
    }

    if (member.role === 'admin' || member.role === 'coach') {
      this.leadActionError.set('Only members or captains can be assigned as Team Lead.');
      return;
    }

    this.leadUpdatingUserId.set(member.userId);
    this.leadActionError.set(null);
    this.leadActionSuccess.set(null);
    this.closeMemberMenu();

    try {
      await this.teamService.assignTeamLead(team.id, member.userId);
      await this.loadTeam(team.id);
      const displayName = `${member.firstName} ${member.lastName}`.trim() || member.email;
      this.leadActionSuccess.set(`${displayName} is now Team Lead.`);
    } catch (error: any) {
      console.error('Failed to assign Team Lead:', error);
      this.leadActionError.set(error?.message || 'Unable to assign Team Lead right now.');
    } finally {
      this.leadUpdatingUserId.set(null);
    }
  }

  async clearTeamLead(member: TeamMember) {
    const team = this.team();
    if (!team?.id || !this.isAdmin() || member.role !== 'team-lead') {
      return;
    }

    this.leadUpdatingUserId.set(member.userId);
    this.leadActionError.set(null);
    this.leadActionSuccess.set(null);
    this.closeMemberMenu();

    try {
      await this.teamService.assignTeamLead(team.id, null);
      await this.loadTeam(team.id);
      this.leadActionSuccess.set('Team Lead role removed.');
    } catch (error: any) {
      console.error('Failed to clear Team Lead:', error);
      this.leadActionError.set(error?.message || 'Unable to remove Team Lead right now.');
    } finally {
      this.leadUpdatingUserId.set(null);
    }
  }

  async makeCoach(member: TeamMember) {
    await this.updateMemberRole(member, 'coach', `${this.getMemberDisplayName(member)} is now a Coach.`);
  }

  async clearCoach(member: TeamMember) {
    if (member.role !== 'coach') {
      return;
    }
    await this.updateMemberRole(member, 'member', `${this.getMemberDisplayName(member)} is no longer a Coach.`);
  }

  async makeCaptain(member: TeamMember) {
    await this.updateMemberRole(member, 'captain', `${this.getMemberDisplayName(member)} is now a Captain.`);
  }

  async clearCaptain(member: TeamMember) {
    if (member.role !== 'captain') {
      return;
    }
    await this.updateMemberRole(member, 'member', `${this.getMemberDisplayName(member)} is no longer a Captain.`);
  }

  private async updateMemberRole(
    member: TeamMember,
    role: 'member' | 'coach' | 'captain',
    successMessage: string
  ): Promise<void> {
    const team = this.team();
    if (!team?.id || !this.isAdmin() || member.userId === this.currentUserId()) {
      return;
    }
    if (member.role === 'admin') {
      this.leadActionError.set('Admin role cannot be changed.');
      return;
    }

    this.leadUpdatingUserId.set(member.userId);
    this.leadActionError.set(null);
    this.leadActionSuccess.set(null);
    this.closeMemberMenu();

    try {
      await this.teamService.assignMemberRole(team.id, member.userId, role);
      await this.loadTeam(team.id);
      this.leadActionSuccess.set(successMessage);
    } catch (error: any) {
      console.error('Failed to update member role:', error);
      this.leadActionError.set(error?.message || 'Unable to update this role right now.');
    } finally {
      this.leadUpdatingUserId.set(null);
    }
  }

  private getMemberDisplayName(member: TeamMember): string {
    return `${member.firstName} ${member.lastName}`.trim() || member.email;
  }

  promptRemoveMember(member: TeamMember) {
    if (!this.canManageMemberActions(member)) {
      return;
    }
    this.memberPendingRemoval.set(member);
    this.closeMemberMenu();
  }

  cancelRemoveMemberPrompt() {
    this.memberPendingRemoval.set(null);
    this.removingMemberUserId.set(null);
  }

  async confirmRemoveMember() {
    const teamId = this.team()?.id;
    const member = this.memberPendingRemoval();
    if (!teamId || !member || !this.isAdmin()) {
      return;
    }

    this.removingMemberUserId.set(member.userId);
    this.leadActionError.set(null);
    this.leadActionSuccess.set(null);

    try {
      await this.teamService.removeMemberFromTeam(teamId, member.userId);
      await this.loadTeam(teamId);
      const name = `${member.firstName} ${member.lastName}`.trim() || member.email;
      this.leadActionSuccess.set(`${name} was removed from the team.`);
      this.memberPendingRemoval.set(null);
    } catch (err: any) {
      console.error('Failed to remove member:', err);
      this.leadActionError.set(err?.message || 'Unable to remove this member right now.');
    } finally {
      this.removingMemberUserId.set(null);
    }
  }

  async shareTeamLink() {
    const team = this.team();
    const pageUrl = this.teamPageUrl();
    if (!team?.id || !pageUrl || !this.canShareTeamLink()) {
      return;
    }

    this.shareNotice.set(null);
    this.shareError.set(null);

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(pageUrl);
        this.shareNotice.set('Share link copied to clipboard.');
        return;
      }

      this.shareError.set('Copy is not available on this device right now.');
    } catch (err) {
      console.error('Failed to copy team URL:', err);
      this.shareError.set('Unable to copy the share link right now. Please try again.');
    }
  }

  async createMeetingRoom() {
    const team = this.team();
    if (!team?.id || !this.canCreateMeetingRoom() || this.creatingMeetingRoom()) {
      return;
    }

    const existingLink = this.meetingRoomLink();
    if (existingLink) {
      this.openMeetingRoom(existingLink);
      return;
    }

    this.creatingMeetingRoom.set(true);
    this.meetingRoomError.set(null);
    this.meetingRoomNotice.set(null);

    try {
      const result = await this.teamService.createTeamMeetingRoom(team.id);
      const meetingRoomLink = String(result.meetingRoomLink || '').trim();
      if (!meetingRoomLink) {
        throw new Error('Meeting room link was not returned.');
      }

      this.team.update(current => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          meetingRoomLink,
          meetingRoomEventId: result.meetingRoomEventId || current.meetingRoomEventId,
          meetingRoomProvider: (result.meetingRoomProvider as Team['meetingRoomProvider']) || 'google-meet'
        };
      });

      this.meetingRoomNotice.set(result.created ? 'Meeting room created for this team.' : 'Existing meeting room loaded.');
      this.openMeetingRoom(meetingRoomLink);
    } catch (err: any) {
      console.error('Failed to create meeting room:', err);
      const code = String(err?.code || '');
      if (code.includes('failed-precondition')) {
        this.meetingRoomError.set('Google Workspace meeting setup is not configured yet.');
      } else if (code.includes('permission-denied')) {
        this.meetingRoomError.set('Only team members can create this meeting room.');
      } else {
        this.meetingRoomError.set(err?.message || 'Unable to create a meeting room right now.');
      }
    } finally {
      this.creatingMeetingRoom.set(false);
    }
  }

  openMeetingRoom(link?: string | null) {
    const meetingRoomLink = String(link || this.meetingRoomLink() || '').trim();
    if (!meetingRoomLink) {
      return;
    }
    if (typeof window !== 'undefined') {
      window.open(meetingRoomLink, '_blank', 'noopener,noreferrer');
    }
  }

  async copyMeetingRoomLink() {
    const meetingRoomLink = this.meetingRoomLink();
    if (!meetingRoomLink) {
      return;
    }

    this.meetingRoomError.set(null);
    this.meetingRoomNotice.set(null);

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(meetingRoomLink);
        this.meetingRoomNotice.set('Meeting room link copied to clipboard.');
        return;
      }
      this.meetingRoomError.set('Copy is not available on this device right now.');
    } catch (err) {
      console.error('Failed to copy meeting room link:', err);
      this.meetingRoomError.set('Unable to copy the meeting room link right now.');
    }
  }

  promptLeaveTeam() {
    if (!this.canLeaveTeam()) {
      return;
    }
    this.leaveTeamPromptOpen.set(true);
  }

  cancelLeaveTeamPrompt() {
    if (this.leavingTeam()) {
      return;
    }
    this.leaveTeamPromptOpen.set(false);
  }

  async confirmLeaveTeam() {
    const team = this.team();
    const userId = this.currentUserId();
    if (!team?.id || !userId) {
      this.joinError.set('Unable to leave this team right now.');
      return;
    }

    if (this.isAdmin()) {
      this.joinError.set('Team admin cannot leave this team.');
      this.leaveTeamPromptOpen.set(false);
      return;
    }

    this.leavingTeam.set(true);
    this.joinError.set(null);
    this.joinSuccess.set(null);
    this.joinModalDismissed.set(true);
    this.showJoinModal.set(false);

    const teamName = team.name;
    try {
      await this.teamService.removeMemberFromTeam(team.id, userId);
      await this.authService.refreshProfile().catch(() => null);
      this.messages.set([]);
      this.messagesLoadedForTeamId = null;
      await this.loadTeam(team.id);
      this.joinSuccess.set(`You left ${teamName}.`);
      this.leaveTeamPromptOpen.set(false);
      this.activeTab.set('members');
      this.closeMemberMenu();
    } catch (err: any) {
      console.error('Failed to leave team:', err);
      this.joinError.set(err?.message || 'Unable to leave this team right now.');
    } finally {
      this.leavingTeam.set(false);
    }
  }

  async handleSignupAndJoin() {
    if (this.isBusyJoining()) {
      return;
    }

    const name = this.signupName.trim();
    const email = this.normalizeEmail(this.signupEmail);
    const password = this.signupPassword;

    if (name.length < 2) {
      this.joinError.set('Enter your name to continue.');
      return;
    }
    if (!this.isValidEmail(email)) {
      this.joinError.set('Enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      this.joinError.set('Password must be at least 6 characters.');
      return;
    }

    this.joinError.set(null);
    this.joinSuccess.set(null);
    this.authActionLoading.set(true);

    try {
      const { firstName, lastName } = this.splitName(name);
      await this.authService.signUpWithEmail({
        firstName,
        lastName,
        email,
        password
      });

      const verificationRedirect = this.buildTeamVerificationUrl();
      try {
        await this.authService.sendEmailVerification(verificationRedirect || undefined);
        this.verificationPending.set(true);
        this.verificationEmail.set(email);
        this.verificationNotice.set('Please verify your email first. After you verify, this page will add you to the team automatically.');
      } catch {
        this.verificationNotice.set('Account created. We could not send a verification email right now. Try resending.');
      }

      this.authService.sendWelcomeEmail().catch(() => {});
      this.joinSuccess.set(null);
      this.signupPassword = '';
    } catch (err: any) {
      console.error('Signup + join failed:', err);
      this.joinError.set(this.authService.authError() || err?.message || 'Unable to create your account right now.');
    } finally {
      this.authActionLoading.set(false);
    }
  }

  async handleLoginAndJoin() {
    if (this.isBusyJoining()) {
      return;
    }

    const email = this.normalizeEmail(this.loginEmail);
    const password = this.loginPassword;

    if (!this.isValidEmail(email)) {
      this.joinError.set('Enter a valid email address.');
      return;
    }
    if (!password) {
      this.joinError.set('Enter your password.');
      return;
    }

    this.joinError.set(null);
    this.joinSuccess.set(null);
    this.authActionLoading.set(true);

    try {
      await this.authService.signInWithEmail(email, password);
      const joined = await this.joinCurrentUserToTeam(false);
      if (!joined) {
        return;
      }
      this.joinSuccess.set(`You joined ${this.team()?.name || 'the team'}.`);
      this.loginPassword = '';
    } catch (err: any) {
      console.error('Login + join failed:', err);
      this.joinError.set(this.authService.authError() || err?.message || 'Unable to log in right now.');
    } finally {
      this.authActionLoading.set(false);
    }
  }

  async joinWithCurrentAccount() {
    if (this.joiningTeam()) {
      return;
    }

    this.joinError.set(null);
    this.joinSuccess.set(null);
    await this.joinCurrentUserToTeam(true);
  }

  async resendVerificationForTeam() {
    if (this.authActionLoading()) {
      return;
    }

    this.authActionLoading.set(true);
    this.joinError.set(null);
    try {
      const verificationRedirect = this.buildTeamVerificationUrl();
      await this.authService.sendEmailVerification(verificationRedirect || undefined);
      this.verificationNotice.set(`Verification email sent to ${this.verificationEmail() || 'your inbox'}.`);
    } catch {
      this.joinError.set('Unable to resend verification email right now.');
    } finally {
      this.authActionLoading.set(false);
    }
  }

  async completeEmailVerificationAndJoin(fromRedirect = false) {
    if (this.isBusyJoining()) {
      return;
    }

    this.authActionLoading.set(true);
    this.joinError.set(null);

    try {
      const user = await this.authService.reloadCurrentUser();
      if (!user) {
        this.verificationNotice.set('Email verified. Log in to continue to this team.');
        this.verificationPending.set(false);
        return;
      }

      if (!user.emailVerified) {
        this.verificationPending.set(true);
        this.verificationEmail.set(this.normalizeEmail(user.email || this.verificationEmail()));
        this.joinError.set('Email is not verified yet. Open the verification email and click the link.');
        return;
      }

      this.verificationPending.set(false);
      const joined = await this.joinCurrentUserToTeam(false);
      if (joined) {
        this.joinSuccess.set(`Welcome to ${this.team()?.name || 'the team'}!`);
        if (fromRedirect) {
          this.verificationNotice.set('Email verified and team access unlocked.');
        } else {
          this.verificationNotice.set('Email verified. You are now in the team.');
        }
      }
    } catch (error) {
      console.error('Failed to complete verification join:', error);
      this.joinError.set('Unable to confirm verification right now.');
    } finally {
      this.authActionLoading.set(false);
    }
  }

  openJoinModal() {
    if (!this.showJoinOnboarding()) {
      return;
    }
    this.joinModalDismissed.set(false);
    this.showJoinModal.set(true);
  }

  closeJoinModal() {
    this.showJoinModal.set(false);
    this.joinModalDismissed.set(true);
  }

  private async joinCurrentUserToTeam(showMessage: boolean): Promise<boolean> {
    const team = this.team();
    if (!team?.id) {
      this.joinError.set('Log in or create an account to join this team.');
      return false;
    }

    const currentAuthUser = await this.authService.reloadCurrentUser();
    const profile = await this.waitForProfile();
    if (!profile) {
      this.joinError.set('Log in or create an account to join this team.');
      return false;
    }

    if (!currentAuthUser?.emailVerified) {
      this.verificationPending.set(true);
      this.verificationEmail.set(this.normalizeEmail(currentAuthUser?.email || profile.email));
      this.joinError.set('Please verify your email first. Then click "I verified my email" to join the team.');
      return false;
    }

    if (this.isCurrentUserMember()) {
      if (this.shouldLinkCurrentUserTeamGoal(team)) {
        await this.linkCurrentUserToTeamGoal(team.id);
      }
      if (showMessage) {
        this.joinSuccess.set(`You are already in ${team.name}.`);
      }
      return true;
    }

    this.joiningTeam.set(true);
    this.joinError.set(null);

    try {
      await this.teamService.addMemberToTeam(team.id, {
        userId: profile.userId,
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: this.normalizeEmail(profile.email),
        profilePictureUrl: profile.profilePictureUrl,
        role: 'member',
        joinedAt: Date.now()
      });

      await this.loadTeam(team.id);
      await this.linkCurrentUserToTeamGoal(team.id);
      if (showMessage) {
        this.joinSuccess.set(`You are in. Welcome to ${this.team()?.name || 'the team'}!`);
      }
      return true;
    } catch (err: any) {
      console.error('Failed to join team:', err);
      this.joinError.set(err?.message || 'Unable to join this team right now.');
      return false;
    } finally {
      this.joiningTeam.set(false);
    }
  }

  private async linkCurrentUserToTeamGoal(teamId: string): Promise<void> {
    const profile = this.authService.profile();
    if (!profile?.userId) {
      this.memberTeamRocketGoalId.set(null);
      return;
    }

    let goalId = '';
    try {
      goalId = (await this.teamService.ensureMemberTeamRocketGoal(teamId, {
        userId: profile.userId,
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: profile.email
      })).trim();
      this.memberTeamRocketGoalId.set(goalId || null);
    } catch (error) {
      this.memberTeamRocketGoalId.set(null);
      console.warn('Unable to ensure member team goal while linking profile:', error);
      return;
    }

    const currentMyOneThingGoalId = (profile.myOneThingGoalId || '').trim();
    if (!goalId || currentMyOneThingGoalId || currentMyOneThingGoalId === goalId) {
      return;
    }

    try {
      await this.authService.updateUserProfile({ myOneThingGoalId: goalId });
    } catch (error) {
      console.warn('Unable to link member profile to personal team goal:', error);
    }
  }

  onCoverImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      return;
    }

    this.coverImageFile = file;
    const reader = new FileReader();
    reader.onload = () => {
      this.coverImagePreview.set(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  async uploadCoverImage() {
    const teamId = this.team()?.id;
    if (!teamId || !this.coverImageFile || this.uploadingCover() || !this.isAdmin()) return;

    this.uploadingCover.set(true);
    try {
      const url = await this.teamService.uploadTeamCoverImage(teamId, this.coverImageFile);
      this.team.update(t => t ? { ...t, coverImageUrl: url } : t);
      this.coverImageFile = null;
      this.coverImagePreview.set(null);
      if (this.coverInput?.nativeElement) {
        this.coverInput.nativeElement.value = '';
      }
    } catch (err) {
      console.error('Failed to upload cover image:', err);
    } finally {
      this.uploadingCover.set(false);
    }
  }

  cancelCoverUpload() {
    this.coverImageFile = null;
    this.coverImagePreview.set(null);
    if (this.coverInput?.nativeElement) {
      this.coverInput.nativeElement.value = '';
    }
  }

  async sendMessage() {
    const content = this.newMessage.trim();
    const teamId = this.team()?.id;
    const profile = this.authService.profile();
    if (!content || !teamId || !profile || !this.isCurrentUserMember()) return;

    this.sendingMessage.set(true);
    this.newMessage = '';

    try {
      await this.teamService.sendMessage(teamId, {
        teamId,
        senderId: profile.userId,
        senderName: `${profile.firstName} ${profile.lastName}`.trim(),
        senderAvatarUrl: profile.profilePictureUrl,
        content,
        type: 'text',
        source: 'web'
      });
      await this.loadMessages(teamId);
    } catch (err) {
      console.error('Failed to send message:', err);
      this.newMessage = content;
    } finally {
      this.sendingMessage.set(false);
    }
  }

  openInviteModal() {
    if (!this.canManageTeamInvites()) {
      return;
    }
    this.inviteError.set(null);
    this.inviteSuccess.set(null);
    this.showInviteModal.set(true);
  }

  closeInviteModal() {
    this.showInviteModal.set(false);
    this.inviteEmailField = '';
    this.inviteError.set(null);
    this.inviteSuccess.set(null);
    this.resetInviteSearchState();
  }

  onInviteEmailInputChange(value: string) {
    this.inviteEmailField = value;
    this.inviteError.set(null);
    this.inviteSuccess.set(null);

    const normalizedEmail = this.normalizeEmail(value);
    const selected = this.selectedInviteCandidate();
    if (selected && this.normalizeEmail(selected.email) !== normalizedEmail) {
      this.selectedInviteCandidate.set(null);
    }

    if (this.inviteSearchTimeout) {
      clearTimeout(this.inviteSearchTimeout);
      this.inviteSearchTimeout = null;
    }

    this.inviteSearchRequestId += 1;
    const requestId = this.inviteSearchRequestId;

    if (normalizedEmail.length < 2) {
      this.inviteSearchLoading.set(false);
      this.inviteSuggestions.set([]);
      return;
    }

    this.inviteSearchLoading.set(true);
    this.inviteSearchTimeout = setTimeout(async () => {
      try {
        const matches = await this.teamService.searchUsersByEmailPrefix(normalizedEmail);
        if (requestId !== this.inviteSearchRequestId) {
          return;
        }

        const existingEmails = new Set(
          (this.team()?.members || []).map(member => this.normalizeEmail(member.email))
        );
        const dedupedEmails = new Set<string>();
        const suggestions = matches.filter(match => {
          const email = this.normalizeEmail(match.email);
          if (!email || existingEmails.has(email) || dedupedEmails.has(email)) {
            return false;
          }
          dedupedEmails.add(email);
          return true;
        });

        this.inviteSuggestions.set(suggestions);
      } catch (error) {
        console.error('Failed to load invite suggestions:', error);
        if (requestId === this.inviteSearchRequestId) {
          this.inviteSuggestions.set([]);
        }
      } finally {
        if (requestId === this.inviteSearchRequestId) {
          this.inviteSearchLoading.set(false);
        }
      }
    }, 250);
  }

  applyInviteSuggestion(suggestion: InviteUserSuggestion) {
    this.inviteEmailField = suggestion.email;
    this.selectedInviteCandidate.set(suggestion);
    this.inviteSuggestions.set([]);
    this.inviteSearchLoading.set(false);
    if (this.inviteSearchTimeout) {
      clearTimeout(this.inviteSearchTimeout);
      this.inviteSearchTimeout = null;
    }
    this.inviteSearchRequestId += 1;
  }

  async inviteMember() {
    const email = this.normalizeEmail(this.inviteEmailField);
    if (!email || !this.isValidEmail(email)) {
      this.inviteError.set('Enter a valid email address to send an invite.');
      return;
    }

    const teamData = this.team();
    if (!teamData?.id || !this.canManageTeamInvites()) return;

    if (teamData.members.some(m => this.normalizeEmail(m.email) === email)) {
      this.inviteError.set('This person is already a member of the team.');
      return;
    }

    this.inviteLoading.set(true);
    this.inviteError.set(null);
    this.inviteSuccess.set(null);

    try {
      const selected = this.selectedInviteCandidate();
      const inviteeName = selected && this.normalizeEmail(selected.email) === email
        ? `${selected.firstName} ${selected.lastName}`.trim() || undefined
        : undefined;

      await this.teamService.sendTeamInviteEmail({
        teamId: teamData.id,
        inviteeEmail: email,
        inviteeName,
        teamName: teamData.name,
        teamUrl: this.teamPageUrl()
      });
      this.inviteEmailField = '';
      this.resetInviteSearchState();
      this.inviteSuccess.set(`Invite sent to ${email}. They can use the link to join ${teamData.name}.`);
    } catch (err: any) {
      console.error('Failed to send invite:', err);
      const code = String(err?.code || '');
      if (code.includes('permission-denied')) {
        this.inviteError.set('Only team admin, team lead, coach, or captain can send invites.');
      } else if (code.includes('invalid-argument')) {
        this.inviteError.set('Enter a valid email address to send an invite.');
      } else if (code.includes('already-exists')) {
        this.inviteError.set('This person is already a member of the team.');
      } else {
        this.inviteError.set(err?.message || 'Failed to send invite. Please try again.');
      }
    } finally {
      this.inviteLoading.set(false);
    }
  }

  telegramDeepLink = signal<string | null>(null);
  waitingForTelegramLink = signal(false);
  private telegramPollInterval: ReturnType<typeof setInterval> | null = null;

  async connectTelegramGroup() {
    const teamId = this.team()?.id;
    if (!teamId || !this.isAdmin() || this.connectingTelegram()) return;

    this.connectingTelegram.set(true);
    this.telegramConnectError.set(null);
    this.telegramConnectSuccess.set(null);

    try {
      const result = await this.teamService.setupTeamTelegramGroup(teamId);

      if (result.success && result.needsGroupCreation && result.deepLink) {
        // Open Telegram deep link - user picks/creates a group
        this.telegramDeepLink.set(result.deepLink);
        window.open(result.deepLink, '_blank');
        this.waitingForTelegramLink.set(true);
        this.connectingTelegram.set(false);

        // Poll for the group to be linked (auto-detected by webhook)
        this.startTelegramLinkPolling(teamId);
      } else if (result.success) {
        // Group was linked immediately (from pending groups or already connected)
        this.telegramConnectSuccess.set(
          `Connected to Telegram group "${result.telegramGroupTitle || 'group'}"!`
        );
        await this.loadTeam(teamId);
        this.connectingTelegram.set(false);
      }
    } catch (err: any) {
      console.error('Failed to connect Telegram group:', err);
      this.telegramConnectError.set(
        'Unable to connect Telegram group right now. Please try again.'
      );
      this.connectingTelegram.set(false);
    }
  }

  private startTelegramLinkPolling(teamId: string) {
    this.stopTelegramLinkPolling();
    let pollCount = 0;

    this.telegramPollInterval = setInterval(async () => {
      pollCount++;
      try {
        const team = await this.teamService.getTeamById(teamId);
        if (team?.telegramGroupId) {
          this.stopTelegramLinkPolling();
          this.waitingForTelegramLink.set(false);
          this.telegramDeepLink.set(null);
          this.telegramConnectSuccess.set(
            `Connected to Telegram group "${team.telegramGroupTitle || 'group'}"!`
          );
          this.team.set(team);
        }
      } catch {
        // Ignore polling errors
      }

      // Stop polling after 2 minutes
      if (pollCount >= 40) {
        this.stopTelegramLinkPolling();
        this.waitingForTelegramLink.set(false);
      }
    }, 3000);
  }

  private stopTelegramLinkPolling() {
    if (this.telegramPollInterval) {
      clearInterval(this.telegramPollInterval);
      this.telegramPollInterval = null;
    }
  }

  private async generateTelegramQr(inviteLink: string) {
    try {
      const dataUrl = await QRCode.toDataURL(inviteLink, {
        width: 200,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' }
      });
      this.telegramQrDataUrl.set(dataUrl);
    } catch (err) {
      console.error('Failed to generate QR code:', err);
    }
  }

  dismissTelegramBanner() {
    this.showTelegramBanner.set(false);
  }

  toggleTheme(): void {
    this.theme.toggleDarkMode();
  }

  onEnterKey(event: Event) {
    const ke = event as KeyboardEvent;
    if (!ke.shiftKey) {
      ke.preventDefault();
      this.sendMessage();
    }
  }

  onDirectEnterKey(event: Event) {
    const ke = event as KeyboardEvent;
    if (!ke.shiftKey) {
      ke.preventDefault();
      void this.sendDirectMessage();
    }
  }

  formatTime(timestamp: any): string {
    if (!timestamp) return '';
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
      ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  formatRelativeTime(timestamp: any): string {
    const millis = this.getTimestampMillis(timestamp);
    if (millis === null) {
      return 'No recent activity';
    }

    const diff = Date.now() - millis;
    if (diff < 60_000) {
      return 'Just now';
    }
    if (diff < 3_600_000) {
      const minutes = Math.max(1, Math.floor(diff / 60_000));
      return `${minutes}m ago`;
    }
    if (diff < 86_400_000) {
      const hours = Math.max(1, Math.floor(diff / 3_600_000));
      return `${hours}h ago`;
    }
    if (diff < 604_800_000) {
      const days = Math.max(1, Math.floor(diff / 86_400_000));
      return `${days}d ago`;
    }
    return this.formatTime(millis);
  }

  private scrollToBottom(attempt = 0) {
    const delay = attempt === 0 ? 0 : 60;
    setTimeout(() => {
      const el = this.messagesContainer?.nativeElement;
      if (el) {
        el.scrollTop = el.scrollHeight;
        if (attempt < 2) {
          this.scrollToBottom(attempt + 1);
        }
        return;
      }

      if (attempt < 8) {
        this.scrollToBottom(attempt + 1);
      }
    }, delay);
  }

  private scrollDirectToBottom(attempt = 0) {
    const delay = attempt === 0 ? 0 : 60;
    setTimeout(() => {
      const el = this.directMessagesContainer?.nativeElement;
      if (el) {
        el.scrollTop = el.scrollHeight;
        if (attempt < 2) {
          this.scrollDirectToBottom(attempt + 1);
        }
        return;
      }

      if (attempt < 8) {
        this.scrollDirectToBottom(attempt + 1);
      }
    }, delay);
  }

  private getTimestampMillis(value: any): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    if (value instanceof Date) {
      return value.getTime();
    }
    if (typeof value?.toMillis === 'function') {
      try {
        return value.toMillis();
      } catch {
        return null;
      }
    }
    if (typeof value?.toDate === 'function') {
      try {
        const date = value.toDate();
        return date instanceof Date ? date.getTime() : null;
      } catch {
        return null;
      }
    }
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : null;
  }

  private normalizeEmail(email: string | null | undefined): string {
    return (email || '').trim().toLowerCase();
  }

  private shouldLinkCurrentUserTeamGoal(team: Team | null): boolean {
    if (!team) {
      return false;
    }
    const matchingMember = this.findCurrentUserTeamMember(team);
    return !!matchingMember;
  }

  private findCurrentUserTeamMember(team: Team | null): TeamMember | null {
    const profile = this.authService.profile();
    if (!team || !profile) {
      return null;
    }
    const normalizedEmail = this.normalizeEmail(profile.email);
    return (team.members || []).find(member => {
      if (!!profile.userId && member.userId === profile.userId) {
        return true;
      }
      if (!normalizedEmail) {
        return false;
      }
      return this.normalizeEmail(member.email) === normalizedEmail;
    }) || null;
  }

  private resetInviteSearchState() {
    if (this.inviteSearchTimeout) {
      clearTimeout(this.inviteSearchTimeout);
      this.inviteSearchTimeout = null;
    }
    this.inviteSearchRequestId += 1;
    this.inviteSearchLoading.set(false);
    this.inviteSuggestions.set([]);
    this.selectedInviteCandidate.set(null);
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private splitName(name: string): { firstName: string; lastName: string } {
    const cleaned = name.trim().replace(/\s+/g, ' ');
    const [firstName, ...rest] = cleaned.split(' ');
    return {
      firstName: firstName || 'Rocketeer',
      lastName: rest.join(' ')
    };
  }

  private buildTeamPageUrl(teamId?: string): string {
    const id = teamId || this.teamId();
    if (!id) {
      return '';
    }

    const baseOrigin = typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://www.rocketgoals.com';

    return `${baseOrigin}/team/${id}`;
  }

  private buildTeamVerificationUrl(): string | null {
    const pageUrl = this.buildTeamPageUrl();
    if (!pageUrl) {
      return null;
    }

    try {
      const url = new URL(pageUrl);
      url.searchParams.set('verified', '1');
      return url.toString();
    } catch {
      return null;
    }
  }

  private async waitForProfile(maxAttempts = 10): Promise<NonNullable<ReturnType<AuthService['profile']>> | null> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const profile = this.authService.profile();
      if (profile) {
        return profile;
      }
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    return this.authService.profile();
  }
}

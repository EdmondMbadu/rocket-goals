import { Component, inject, OnInit, OnDestroy, signal, HostListener, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { RocketGoalsService } from './rocket-goals.service';
import { AuthService } from './auth.service';
import { AvatarDropdownComponent } from './avatar-dropdown.component';
import { RocketGoalsAIComponent } from './rocket-goals-ai.component';
import { MissionCalendarComponent } from './mission-calendar.component';
import { EventModalComponent } from './event-modal.component';
import { CalendarEventsService } from './calendar-events.service';
import { ActionItemsService, ActionItem } from './action-items.service';
import { CheckInsService } from './check-ins.service';
import { TelegramQrModalComponent } from './telegram-qr-modal.component';
import type { RocketGoal, CareerQuestMetrics } from './models/rocket-goal';
import type {
  DailyIgnition,
  IgnitionConfidence,
  IgnitionOneThingChoice,
  IgnitionTimeOfDay,
  MissionActionTaken,
  MissionChallengeLevel,
  MissionFeeling,
  MissionFocusLevel,
  MissionLog,
  JourneyPhoto,
  JourneyPhotoSource,
  MissionLogCoaching,
  MissionTeamConnection,
  WeeklyResetSummary
} from './models/check-ins';

type CheckinDaySummary = {
  label: string;
  dateKey: string;
  ignitionCount: number;
  missionLogCount: number;
};

type CheckinDashboardStats = {
  ignitionCompletionRate: number;
  missionLogCompletionRate: number;
  streakDays: number;
  oneThingCompletionRatio: number;
  focusDistribution: Record<string, number>;
  feelingDistribution: Record<string, number>;
  actionDistribution: Record<string, number>;
};
import type { CalendarEvent } from './mission-calendar.component';
import type { CalendarEventData } from './calendar-events.service';
import { ThemeService } from './theme.service';
import { FansService, Fan, FanComment, FAN_AVATAR_IDS } from './fans.service';
import { VisualizationService } from './visualization.service';
import { RocketGoalsAIService } from './rocket-goals-ai.service';
import { MilestoneCompleteModalComponent, MilestoneCompletionData } from './milestone-complete-modal.component';
import { LAUNCHPAD_TEMPLATES, DashboardConfig } from './launchpad/launchpad.types';

@Component({
  selector: 'app-rocket-goal-view',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, AvatarDropdownComponent, RocketGoalsAIComponent, MissionCalendarComponent, EventModalComponent, MilestoneCompleteModalComponent, TelegramQrModalComponent],
  templateUrl: './rocket-goal-view.component.html',
  styleUrl: './rocket-goal-view.component.css'
})
export class RocketGoalViewComponent implements OnInit, OnDestroy, AfterViewInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private rocketGoalsService = inject(RocketGoalsService);
  private calendarEventsService = inject(CalendarEventsService);
  private actionItemsService = inject(ActionItemsService);
  private checkInsService = inject(CheckInsService);
  private fansService = inject(FansService);
  private visualizationService = inject(VisualizationService);
  private rocketGoalsAIService = inject(RocketGoalsAIService);
  authService = inject(AuthService); // Make public for template access
  private themeService = inject(ThemeService);
  protected readonly isDarkMode = this.themeService.isDarkMode;

  @ViewChild('titleInput') titleInputRef?: ElementRef<HTMLInputElement>;
  @ViewChild('goalTitleInput') goalTitleInputRef?: ElementRef<HTMLInputElement>;

  goal = signal<RocketGoal | null>(null);
  loading = signal(true);
  error = signal<string | null>(null);
  dashboardTitle = signal<string>('MISSION CONTROL');
  isEditingTitle = signal(false);
  editingTitleValue = signal<string>('');
  isEditingGoalTitle = signal(false);
  editingGoalTitleValue = signal<string>('');
  showAvatarDropdown = signal(false);
  showShareDropdown = signal(false);
  userGoals = signal<any[]>([]);
  loadingGoals = signal(false);
  countdown = signal('23:59:59');
  // Individual countdown parts for the redesigned UI
  countdownDays = signal(0);
  countdownHours = signal(0);
  countdownMinutes = signal(0);
  countdownSeconds = signal(0);
  // Timeline viewport offset for infinite scrolling (number of days offset from current view)
  timelineViewOffset = signal(0);
  // Expanded day on the daily progression timeline (to show milestones for that day)
  expandedTimelineDay = signal<number | null>(null);
  // Timeline view mode: 'daily' for day-by-day navigation, 'goal' for full timeline snapshot
  timelineViewMode = signal<'daily' | 'goal'>('daily');
  copyLinkSuccess = signal(false);
  emailShareSuccess = signal(false);
  calendarEvents = signal<CalendarEvent[]>([]);
  visualizationLoading = signal(false);
  showVisualizationModal = signal(false);
  isVisionBoardPreviewVisible = signal(false);
  visionBoardPreviewSecondsLeft = signal(0);
  selectedEvent = signal<CalendarEvent | null>(null);
  showEventModal = signal(false);
  eventModalDate = signal<Date>(new Date());
  private countdownInterval: any;
  private fanInviteSearchTimeout?: any;
  private visualizationPollInterval?: any;
  private visionBoardPreviewTimeout?: any;
  private visionBoardPreviewCountdownInterval?: any;
  private ignitionCountdownInterval?: any;
  private ignitionBurnTimerInterval?: any;
  private storage: any = null;
  visualizationImageFile: File | null = null;
  uploadingVisualization = signal(false);
  activePrimaryTab = signal<'dashboard' | 'fans' | 'tasks' | 'calendar' | 'checkins'>('tasks');
  currentFanInviteEmail = signal('');
  currentFanInviteName = signal('');
  fanInviteSuggestions = signal<{ email: string; name: string }[]>([]);
  fanInviteLoading = signal(false);
  fanInviteError = signal<string | null>(null);
  fans = signal<Fan[]>([]);
  fanComments = signal<FanComment[]>([]);
  fanReactions = signal<{ emoji: string; count: number }[]>([]);
  commentsLoading = signal(false);
  fansLoading = signal(false);
  reactionsLoading = signal(false);
  fanCommentInput = signal('');
  fanCommentEmoji = signal('');
  fanCommentError = signal<string | null>(null);
  fanCommentSubmitting = signal(false);
  readonly fanReactionPalette = ['🚀', '🔥', '👏', '💯', '❤️', '🌟'];
  fanCommentsExpanded = signal(false);
  customReactionEmoji = signal('');
  private readonly fanSectionId = 'fan-mission-panel';
  isEditingDeadline = signal(false);
  deadlineInputValue = signal('');
  deadlineError = signal<string | null>(null);
  savingDeadline = signal(false);

  // Intro video modal
  showIntroVideoModal = signal(false);

  // Action Items (Milestones) state
  actionItems = signal<ActionItem[]>([]);
  loadingActionItems = signal(false);
  editingActionItemId = signal<string | null>(null);
  editingActionItemTitle = signal('');
  newActionItemTitle = signal('');
  newActionItemNotes = signal('');
  newActionItemCompleted = signal(false);
  showTaskModal = signal(false);
  selectedDayForNewTask = signal<number>(1);
  deletingAllMilestones = signal(false);
  showDeleteAllConfirm = signal(false);
  expandedNoteItemId = signal<string | null>(null);
  editingNoteItemId = signal<string | null>(null);
  editingNoteValue = signal('');
  viewAllTasks = signal(true);
  savingTask = signal(false);
  expandedTimelineTaskId = signal<string | null>(null);
  private autoOpenedMilestoneId = signal<string | null>(null);
  taskModalEditingItem = signal<ActionItem | null>(null);
  showCelebration = signal(false);
  private celebrationTimeout?: any;
  readonly celebrationParticles = Array.from({ length: 70 }, (_value, index) => ({
    left: (index * 100) / 70,
    delay: (index % 10) * 0.08,
    duration: 2.4 + (index % 7) * 0.2,
    size: 5 + (index % 5) * 2,
    hue: (index * 19) % 360,
    drift: ((index % 12) - 6) * 12,
    rotation: (index * 37) % 360
  }));
  showMilestoneLandingModal = signal(false);
  landingMilestoneAction = signal<'today' | 'remaining' | null>(null);
  showDeadlineOverdueModal = signal(false);
  private landingFlowHandled = false;
  private pendingLandingAfterDeadline = false;

  // Check-ins state
  activeCheckinTab = signal<'ignition' | 'mission_log'>('ignition');
  checkinModalType = signal<'ignition' | 'mission_log'>('ignition');
  suppressMilestoneLanding = false;
  checkinsLoading = signal(false);
  checkinsError = signal<string | null>(null);
  checkinsNotice = signal<string | null>(null);
  latestDailyIgnition = signal<DailyIgnition | null>(null);
  latestMissionLog = signal<MissionLog | null>(null);
  recentIgnitions = signal<DailyIgnition[]>([]);
  recentMissionLogs = signal<MissionLog[]>([]);
  journeyPhotos = signal<JourneyPhoto[]>([]);
  checkinDashboardStats = signal<CheckinDashboardStats | null>(null);
  last7DaysCheckins = signal<CheckinDaySummary[]>([]);
  last30DaysCheckins = signal<CheckinDaySummary[]>([]);
  showCheckinModal = signal(false);
  weeklyResets = signal<WeeklyResetSummary[]>([]);
  weeklyResetNotice = signal<string | null>(null);
  private pendingWeeklyScroll = false;

  ignitionOneThingChoice = signal<IgnitionOneThingChoice>('suggested');
  ignitionOneThingText = signal('');
  ignitionTimeOfDay = signal<IgnitionTimeOfDay>('morning');
  ignitionConfidence = signal<IgnitionConfidence>('medium');
  ignitionSequenceStep = signal<1 | 2 | 3>(1);
  ignitionWizardStep = signal<1 | 2 | 3>(1);
  ignitionBreathsComplete = signal(false);
  ignitionIdentityStatementComplete = signal(false);
  ignitionEnvironmentalCue = signal('');
  ignitionSequenceStarted = signal(false);
  ignitionCountdownSeconds = signal(45);
  ignitionCountdownActive = signal(false);
  ignitionAccountabilityPartner = signal('');
  ignitionCommitmentMessageSent = signal(false);
  ignitionBurnTimerActive = signal(false);
  ignitionBurnElapsedSeconds = signal(0);
  ignitionBurnCompleted = signal(false);
  ignitionExecutionActionTaken = signal<MissionActionTaken>('yes');
  ignitionExecutionFocusLevel = signal<MissionFocusLevel>('full_focus');
  ignitionExecutionChallengeLevel = signal<MissionChallengeLevel>('average');
  ignitionExecutionFeeling = signal<MissionFeeling>('positive');
  ignitionExecutionTeamConnection = signal<MissionTeamConnection>('yes');
  savingIgnition = signal(false);

  missionActionTaken = signal<MissionActionTaken>('yes');
  missionFocusLevel = signal<MissionFocusLevel>('full_focus');
  missionChallengeLevel = signal<MissionChallengeLevel>('average');
  missionFeeling = signal<MissionFeeling>('positive');
  missionTeamConnection = signal<MissionTeamConnection>('yes');
  missionWizardStep = signal<1 | 2 | 3>(1);
  missionNote = signal('');
  missionIntendedOneThing = signal('');
  missionTomorrowEditingId = signal<string | null>(null);
  missionTomorrowDraftTitle = signal('');
  missionTomorrowSavingId = signal<string | null>(null);
  missionTomorrowAcceptedIds = signal<string[]>([]);
  missionCoaching = signal<MissionLogCoaching | null>(null);
  savingMissionLog = signal(false);

  // Coach interaction signals
  ignitionCoachResponse = signal('');
  missionCoachResponse = signal('');
  showMissionCoachFollowUp = signal(false);
  checkinModalError = signal<string | null>(null);

  // Journey photo state
  journeyPhotoFile = signal<File | null>(null);
  journeyPhotoPreview = signal<string | null>(null);
  journeyPhotoCaption = signal('');
  uploadingJourneyPhoto = signal(false);
  journeyPhotoViewerOpen = signal(false);
  journeyPhotoViewerPhoto = signal<JourneyPhoto | null>(null);

  // Milestone Generation state
  showGenerateMilestonesModal = signal(false);
  generatingMilestones = signal(false);
  generatedMilestones = signal<Array<{ title: string; date: string; dayNumber: number; selected: boolean }>>([]);
  milestoneGenerationError = signal<string | null>(null);
  addingGeneratedMilestones = signal(false);

  // Milestone Completion Modal state (for CareerQuest dashboard)
  showMilestoneCompleteModal = signal(false);
  milestoneToComplete = signal<ActionItem | null>(null);

  // Add Milestone modal - date selection
  selectedDateForNewTask = signal<string>(''); // ISO date string YYYY-MM-DD

  // Fan Join Modal state
  showFanJoinModal = signal(false);
  fanJoinNotificationPreference = signal<'occasional' | 'frequent'>('occasional');
  joiningFanbase = signal(false);
  fanJoinError = signal<string | null>(null);
  showFanWelcomePrompt = signal(false);
  private currentUserFan = signal<Fan | null>(null);
  activeAvatarPickerFanId = signal<string | null>(null);
  updatingFanAvatarId = signal<string | null>(null);
  readonly fanAvatarIds = FAN_AVATAR_IDS;

  // Telegram connection state
  telegramLinked = signal(false);
  telegramLoading = signal(false);
  telegramConnecting = signal(false);
  showTelegramBanner = signal(true);
  showTelegramQrModal = signal(false);
  telegramDeepLink = signal<string | null>(null);
  telegramError = signal<string | null>(null);

  async ngOnInit() {
    // Load custom dashboard title from localStorage
    const savedTitle = localStorage.getItem('dashboardTitle');
    if (savedTitle) {
      this.dashboardTitle.set(savedTitle);
    }

    // Initialize Firebase Storage
    try {
      const { getStorage } = await import('firebase/storage');
      const { getApp } = await import('firebase/app');
      const app = getApp();
      this.storage = getStorage(app);
    } catch (error) {
      console.error('Failed to initialize storage', error);
    }

    const checkinParam = this.route.snapshot.queryParamMap.get('checkin');
    if (checkinParam === 'ignition' || checkinParam === 'mission_log') {
      this.suppressMilestoneLanding = true;
    }

    const goalId = this.route.snapshot.paramMap.get('id');
    if (goalId) {
      await this.loadGoal(goalId);

      // Set default tab based on dashboard availability (if no query param override)
      this.setDefaultTab();
      this.applyTabFromQuery();

      // Check for pending fan join from sessionStorage (after login redirect)
      await this.checkPendingFanJoin();

      // Check if this is a fan invite link
      await this.checkFanInviteFlow();
    } else {
      this.error.set('Goal ID not found');
      this.loading.set(false);
    }
  }

  /**
   * Set the default tab based on goal configuration
   */
  private setDefaultTab() {
    // If goal has dashboard enabled, default to dashboard tab
    if (this.hasDashboard()) {
      this.activePrimaryTab.set('dashboard');
    } else {
      this.activePrimaryTab.set('tasks');
    }
  }

  ngAfterViewInit() {
    // This lifecycle hook ensures ViewChild is available
  }

  ngOnDestroy() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
    this.clearIgnitionSequenceTimers();
    if (this.fanInviteSearchTimeout) {
      clearTimeout(this.fanInviteSearchTimeout);
    }
    if (this.visualizationPollInterval) {
      clearInterval(this.visualizationPollInterval);
    }
    this.clearVisionBoardPreviewTimers();
  }

  // Get the timeframe duration in days from the goal
  getTimeframeDays(): number {
    const goal = this.goal();
    if (!goal) return 7;

    const deadlineTimestamp = this.getDeadlineTimestamp();
    if (deadlineTimestamp) {
      return this.getTimeframeDaysFromDeadline(deadlineTimestamp);
    }

    // Check for timeframe in answers (from AI chat created goals)
    const timeframeDays = goal.answers?.['timeframe_days'];
    if (timeframeDays) return timeframeDays;

    const timeframe = goal.answers?.['timeframe'];
    if (timeframe === 'week') return 7;
    if (timeframe === 'month') return 30;
    if (timeframe === '3months') return 90;
    if (timeframe === '6months') return 180; // Legacy support

    return 7; // Default to 7 days
  }

  // Get timeline markers based on timeframe
  getTimelineMarkers(): { label: string; day: number }[] {
    const days = this.getTimeframeDays();

    if (this.hasCustomDeadline()) {
      return this.getCustomTimelineMarkers(days);
    }

    if (days <= 7) {
      // 7-day sprint: show all 7 days
      return [1, 2, 3, 4, 5, 6, 7].map(d => ({ label: `DAY ${d}`, day: d }));
    } else if (days <= 30) {
      // 30-day journey: show weeks
      return [
        { label: 'WEEK 1', day: 1 },
        { label: 'WEEK 2', day: 8 },
        { label: 'WEEK 3', day: 15 },
        { label: 'WEEK 4', day: 22 },
        { label: 'FINISH', day: 30 }
      ];
    } else if (days <= 90) {
      // 3-month transformation: show months
      return [
        { label: 'MONTH 1', day: 1 },
        { label: 'MONTH 2', day: 31 },
        { label: 'MONTH 3', day: 61 },
        { label: 'FINISH', day: 90 }
      ];
    } else {
      // 6-month transformation (legacy): show months
      return [
        { label: 'MONTH 1', day: 1 },
        { label: 'MONTH 2', day: 31 },
        { label: 'MONTH 3', day: 61 },
        { label: 'MONTH 4', day: 91 },
        { label: 'MONTH 5', day: 121 },
        { label: 'MONTH 6', day: 151 },
        { label: 'FINISH', day: 180 }
      ];
    }
  }

  // Get the current day in the mission
  getCurrentMissionDay(): number {
    const goal = this.goal();
    if (!goal) return 1;

    const startTime = goal.startTime || Date.now();
    const startDate = new Date(startTime);
    const nowDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    nowDate.setHours(0, 0, 0, 0);
    const elapsed = nowDate.getTime() - startDate.getTime();
    const daysPassed = Math.floor(elapsed / (24 * 60 * 60 * 1000)) + 1;

    return Math.min(Math.max(1, daysPassed), this.getTimeframeDays());
  }

  // Get progress percentage for the timeline
  getTimelineProgress(): number {
    const currentDay = this.getCurrentMissionDay();
    const totalDays = this.getTimeframeDays();
    return Math.min((currentDay / totalDays) * 100, 100);
  }

  // Get timeframe display text
  getTimeframeDisplay(): string {
    if (this.hasCustomDeadline()) return 'TARGET DATE';
    const days = this.getTimeframeDays();
    if (days <= 7) return '7-DAY SPRINT';
    if (days <= 30) return '30-DAY JOURNEY';
    return '6-MONTH TRANSFORMATION';
  }

  // Timeline navigation methods for infinite scrolling
  navigateTimelineForward(): void {
    this.timelineViewOffset.update(v => v + 1);
  }

  navigateTimelineBackward(): void {
    this.timelineViewOffset.update(v => v - 1);
  }

  resetTimelineView(): void {
    this.timelineViewOffset.set(0);
  }

  // Get the visible timeline days based on the current offset
  getVisibleTimelineDays(): { day: number; date: Date; label: string; isToday: boolean; isPast: boolean; isFuture: boolean; isFinalDay: boolean }[] {
    const goal = this.goal();
    if (!goal) return [];

    const startTime = goal.startTime || Date.now();
    const currentDay = this.getCurrentMissionDay();
    const totalDays = this.getTimeframeDays();
    const offset = this.timelineViewOffset();
    
    // Show 7 days centered around the current view position
    const visibleDays: { day: number; date: Date; label: string; isToday: boolean; isPast: boolean; isFuture: boolean; isFinalDay: boolean }[] = [];
    const centerDay = currentDay + offset;
    
    for (let i = -3; i <= 3; i++) {
      const dayNumber = centerDay + i;
      const dayDate = new Date(startTime + (dayNumber - 1) * 24 * 60 * 60 * 1000);
      
      visibleDays.push({
        day: dayNumber,
        date: dayDate,
        label: dayDate.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
        isToday: dayNumber === currentDay,
        isPast: dayNumber < currentDay,
        isFuture: dayNumber > currentDay,
        isFinalDay: dayNumber === totalDays
      });
    }
    
    return visibleDays;
  }

  // Get milestones for a specific day
  getMilestonesForDay(day: number): ActionItem[] {
    return this.actionItems().filter(item => item.dayNumber === day);
  }

  // Toggle expanded day on the timeline to show/hide milestones
  toggleExpandedTimelineDay(day: number): void {
    if (this.expandedTimelineDay() === day) {
      this.expandedTimelineDay.set(null);
    } else {
      this.expandedTimelineDay.set(day);
    }
  }

  // Handle click on a timeline day - show milestones or add new task
  onTimelineDayClick(day: number): void {
    const milestones = this.getMilestonesForDay(day);
    if (milestones.length > 0) {
      // If there are milestones, toggle the expanded view
      this.toggleExpandedTimelineDay(day);
    } else {
      // If no milestones, open the add task modal for that day
      this.addTaskToDay(day);
    }
  }

  // Toggle between daily and goal view
  toggleTimelineViewMode(): void {
    this.timelineViewMode.update(mode => mode === 'daily' ? 'goal' : 'daily');
    this.expandedTimelineDay.set(null); // Reset expanded day when switching views
  }

  // Get all days from start to finish for the goal view
  getGoalTimelineDays(): { day: number; date: Date; isToday: boolean; isPast: boolean; isFuture: boolean; isFinalDay: boolean; hasCompletedMilestones: boolean; hasPendingMilestones: boolean; milestoneCount: number }[] {
    const goal = this.goal();
    if (!goal) return [];

    const startTime = goal.startTime || Date.now();
    const currentDay = this.getCurrentMissionDay();
    const totalDays = this.getTimeframeDays();
    
    const allDays: { day: number; date: Date; isToday: boolean; isPast: boolean; isFuture: boolean; isFinalDay: boolean; hasCompletedMilestones: boolean; hasPendingMilestones: boolean; milestoneCount: number }[] = [];
    
    for (let dayNumber = 1; dayNumber <= totalDays; dayNumber++) {
      const dayDate = new Date(startTime + (dayNumber - 1) * 24 * 60 * 60 * 1000);
      const dayMilestones = this.getMilestonesForDay(dayNumber);
      const completedCount = dayMilestones.filter(m => m.completed).length;
      
      allDays.push({
        day: dayNumber,
        date: dayDate,
        isToday: dayNumber === currentDay,
        isPast: dayNumber < currentDay,
        isFuture: dayNumber > currentDay,
        isFinalDay: dayNumber === totalDays,
        hasCompletedMilestones: completedCount > 0,
        hasPendingMilestones: dayMilestones.length > completedCount,
        milestoneCount: dayMilestones.length
      });
    }
    
    return allDays;
  }

  // Get completion percentage
  getCompletionPercentage(): number {
    const total = this.actionItems().length;
    if (total === 0) return 0;
    const completed = this.actionItems().filter(item => item.completed).length;
    return Math.round((completed / total) * 100);
  }

  // Get goal description/motivation text
  getGoalDescription(): string {
    const goal = this.goal();
    if (!goal) return '';
    return goal.answers?.['motivation'] || goal.answers?.['future_result'] || goal.answers?.['daily_effort'] || '';
  }

  // Get the target metric display for app-suite goals (e.g., "Target Weight: 180 lbs")
  getTargetMetricDisplay(): { label: string; value: string; formattedValue: string; unit: string } | null {
    const goal = this.goal();
    if (!goal) return null;

    const metric = goal.answers?.['onboarding_one_thing_metric'];
    const label = goal.answers?.['onboarding_one_thing_label'];
    const unit = goal.answers?.['onboarding_one_thing_unit'] || '';

    if (!metric || !label) return null;

    // Format the value - add commas for numbers
    let formattedValue = metric;
    const numericValue = parseFloat(metric.toString().replace(/[^0-9.-]/g, ''));
    if (!isNaN(numericValue)) {
      formattedValue = numericValue.toLocaleString('en-US');
    }

    return { label, value: metric, formattedValue, unit };
  }

  // Get formatted date for timeline display
  getTimelineDateDisplay(date: Date): { month: string; day: number; weekday: string } {
    return {
      month: date.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
      day: date.getDate(),
      weekday: date.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
    };
  }

  startCountdown() {
    if (this.countdownInterval) clearInterval(this.countdownInterval);

    const goal = this.goal();
    if (!goal) return;

    // Use startTime from goal, or default to now if not set
    const startTime = goal.startTime || Date.now();
    const deadlineTimestamp = this.getDeadlineTimestamp();
    const endTime = deadlineTimestamp
      ? deadlineTimestamp
      : startTime + (this.getTimeframeDays() * 24 * 60 * 60 * 1000);

    const updateCountdown = () => {
      const now = Date.now();
      const remaining = endTime - now;

      if (remaining <= 0) {
        // Challenge completed
        this.countdown.set('00:00:00:00');
        return;
      }

      const days = Math.floor(remaining / (24 * 60 * 60 * 1000));
      const hours = Math.floor((remaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      const minutes = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
      const seconds = Math.floor((remaining % (60 * 1000)) / 1000);

      // Update individual countdown signals for the redesigned UI
      this.countdownDays.set(days);
      this.countdownHours.set(hours);
      this.countdownMinutes.set(minutes);
      this.countdownSeconds.set(seconds);

      this.countdown.set(
        `${days.toString().padStart(2, '0')}:${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    };

    // Update immediately
    updateCountdown();

    // Update every second
    this.countdownInterval = setInterval(updateCountdown, 1000);
  }

  getDeadlineDateDisplay(): string {
    const deadlineTimestamp = this.getDeadlineTimestamp();
    if (!deadlineTimestamp) return '';
    const deadline = new Date(deadlineTimestamp);
    return deadline.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  hasCustomDeadline(): boolean {
    return !!this.getDeadlineTimestamp();
  }

  startEditingDeadline(): void {
    const goal = this.goal();
    if (!goal || !this.isGoalOwner()) return;
    const deadlineTimestamp = this.getDeadlineTimestamp();
    const fallbackEndTime = (goal.startTime || Date.now()) + (this.getTimeframeDays() * 24 * 60 * 60 * 1000);
    const initialDate = new Date(deadlineTimestamp ?? fallbackEndTime);
    this.deadlineInputValue.set(this.formatDateInputValue(initialDate));
    this.deadlineError.set(null);
    this.isEditingDeadline.set(true);
  }

  cancelEditingDeadline(): void {
    this.isEditingDeadline.set(false);
    this.deadlineError.set(null);
    this.pendingLandingAfterDeadline = false;
  }

  async saveDeadline(): Promise<void> {
    const goal = this.goal();
    if (!goal || !this.isGoalOwner()) return;

    const inputValue = this.deadlineInputValue().trim();
    if (!inputValue) {
      this.deadlineError.set('Pick a deadline date to continue.');
      return;
    }

    const [year, month, day] = inputValue.split('-').map(value => Number(value));
    if (!year || !month || !day) {
      this.deadlineError.set('Pick a valid deadline date.');
      return;
    }

    const deadline = new Date(year, month - 1, day, 23, 59, 59, 999);
    if (Number.isNaN(deadline.getTime())) {
      this.deadlineError.set('Pick a valid deadline date.');
      return;
    }

    this.savingDeadline.set(true);
    this.deadlineError.set(null);

    try {
      const startTime = goal.startTime || Date.now();
      const updatedAnswers = {
        ...(goal.answers || {}),
        deadlineDate: deadline.getTime(),
        timeframe_days: this.getTimeframeDaysFromDeadline(deadline.getTime(), startTime)
      };

      await this.rocketGoalsService.updateRocketGoal(goal.id, { answers: updatedAnswers });
      this.goal.set({ ...goal, answers: updatedAnswers });
      this.isEditingDeadline.set(false);
      this.startCountdown();
      if (this.pendingLandingAfterDeadline) {
        this.pendingLandingAfterDeadline = false;
        this.handleLandingMilestonesFlow(true);
      }
    } catch (error) {
      console.error('Error saving deadline:', error);
      this.deadlineError.set('Could not save deadline. Please try again.');
    } finally {
      this.savingDeadline.set(false);
    }
  }

  private getDeadlineTimestamp(): number | null {
    const goal = this.goal();
    const deadlineValue = goal?.answers?.['deadlineDate'];
    if (!deadlineValue) return null;
    if (typeof deadlineValue === 'number') return deadlineValue;
    if (typeof deadlineValue === 'string') {
      const parsed = Date.parse(deadlineValue);
      return Number.isNaN(parsed) ? null : parsed;
    }
    if (typeof deadlineValue?.toMillis === 'function') return deadlineValue.toMillis();
    return null;
  }

  private getTimeframeDaysFromDeadline(deadlineTimestamp: number, startTimeOverride?: number): number {
    const startTime = startTimeOverride ?? (this.goal()?.startTime || Date.now());
    const dayMs = 24 * 60 * 60 * 1000;
    const diffDays = Math.ceil((deadlineTimestamp - startTime) / dayMs);
    return Math.max(1, diffDays);
  }

  private formatDateInputValue(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  getMinDeadlineDate(): string {
    // Minimum deadline is tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return this.formatDateInputValue(tomorrow);
  }

  private getCustomTimelineMarkers(totalDays: number): { label: string; day: number }[] {
    if (totalDays <= 7) {
      return Array.from({ length: totalDays }, (_value, index) => ({
        label: `DAY ${index + 1}`,
        day: index + 1
      }));
    }

    if (totalDays <= 30) {
      const markers = [1, 8, 15, 22, totalDays];
      const uniqueDays = Array.from(new Set(markers.filter(day => day <= totalDays)));
      return uniqueDays.map((day, index) => ({
        label: day === totalDays ? 'FINISH' : `WEEK ${index + 1}`,
        day
      }));
    }

    const segments = totalDays <= 90 ? 3 : 6;
    const step = Math.ceil(totalDays / segments);
    const markers = Array.from({ length: segments + 1 }, (_value, index) => {
      if (index === segments) return totalDays;
      return Math.min(1 + (index * step), totalDays);
    });
    const uniqueMarkers = Array.from(new Set(markers));
    return uniqueMarkers.map((day, index) => ({
      label: day === totalDays ? 'FINISH' : `PHASE ${index + 1}`,
      day
    }));
  }

  async loadGoal(goalId: string) {
    this.loading.set(true);
    this.error.set(null);
    this.landingFlowHandled = false;
    try {
      const goal = await this.rocketGoalsService.getRocketGoalById(goalId);
      if (goal) {
        // Initialize startTime if it doesn't exist (for old goals created before this feature)
        if (!goal.startTime) {
          // Set startTime to now for existing goals without it
          await this.rocketGoalsService.updateRocketGoal(goalId, {
            startTime: Date.now()
          });
          // Reload goal to get updated startTime
          const updatedGoal = await this.rocketGoalsService.getRocketGoalById(goalId);
          if (updatedGoal) {
            this.goal.set(updatedGoal as RocketGoal);
            // Start countdown timer with updated goal's startTime
            this.startCountdown();
          }
        } else {
          this.goal.set(goal as RocketGoal);
        // Start countdown timer with goal's existing startTime
        this.startCountdown();
      }
      
      // Load user goals for dropdown only if user is logged in and it's their goal
      const currentGoal = this.goal();
      const currentUser = this.authService.profile();
      if (currentGoal?.userId && currentUser?.userId && currentGoal.userId === currentUser.userId) {
        this.loadUserGoals(currentGoal.userId);
        // Load Telegram status for owner (to show connect banner if not connected)
        this.checkTelegramBannerDismissed();
        this.loadTelegramStatus();
      }
      
      // Load calendar events and action items
      if (currentGoal?.id) {
        await this.loadCalendarEvents(currentGoal.id);
        await this.loadActionItems(currentGoal.id);
        // Sync milestone colors after both are loaded
        this.syncMilestoneCalendarColors();
        await this.loadCheckIns(currentGoal.id);
        this.handleLandingMilestonesFlow();
        await this.loadFans(currentGoal.id);
        await this.loadFanComments(currentGoal.id);
        await this.loadFanReactions(currentGoal.id);
        if (!this.isGoalOwner()) {
          this.scrollFansIntoView();
        }

        // Start polling for visualization if goal is new and doesn't have one yet
        this.startVisualizationPolling(currentGoal);
      }
      } else {
        this.error.set('Goal not found');
      }
    } catch (err) {
      console.error('Error loading goal:', err);
      this.error.set('Failed to load goal');
    } finally {
      this.loading.set(false);
    }
  }

  async loadUserGoals(userId: string) {
    this.loadingGoals.set(true);
    try {
      const goals = await this.rocketGoalsService.getRocketGoalsByUserId(userId);
      this.userGoals.set(goals);
    } catch (err) {
      console.error('Error loading user goals:', err);
    } finally {
      this.loadingGoals.set(false);
    }
  }

  toggleAvatarDropdown() {
    this.showAvatarDropdown.set(!this.showAvatarDropdown());
  }

  closeAvatarDropdown() {
    this.showAvatarDropdown.set(false);
  }

  navigateToGoal(goalId: string) {
    this.router.navigateByUrl(`/rocketgoal/${goalId}`);
    this.closeAvatarDropdown();
  }

  navigateToProfile() {
    this.router.navigateByUrl('/profile');
    this.closeAvatarDropdown();
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

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.share-dropdown-container')) {
      this.closeShareDropdown();
    }
  }

  getGoalTitleDisplay(): string {
    const goal = this.goal();
    if (!goal) return '';
    const rawTitle = goal.answers['goal_title_label'] || goal.answers['custom_goal_title'] || goal.primaryGoal || 'Your 7-Day Mission';
    return typeof rawTitle === 'string' ? rawTitle.replace(/^#+\s*/, '').trim() : rawTitle;
  }

  getGoalThemeDisplay(): string {
    const goal = this.goal();
    if (!goal) return '';
    return goal.answers['goal_theme_label'] || 'Personal Growth';
  }

  getSupportDisplay(): string {
    const goal = this.goal();
    if (!goal) return '';
    return goal.answers['goal_support_label'] || 'Self';
  }

  formatNumberWithCommas(value: any): string {
    if (value == null) return '';
    const num = typeof value === 'string' ? parseFloat(value.replace(/,/g, '')) : value;
    if (isNaN(num)) return String(value);
    return num.toLocaleString('en-US');
  }

  getUserFirstName(): string {
    const goal = this.goal();
    if (!goal) return 'Commander';
    return goal.participant?.firstName || 'Commander';
  }

  getGoalOwnerName(): string {
    const goal = this.goal();
    if (!goal) return '';
    const firstName = goal.participant?.firstName || '';
    const lastName = goal.participant?.lastName || '';
    const fullName = `${firstName} ${lastName}`.trim();
    return fullName || 'Commander';
  }

  getGoalOwnerDisplayTitle(): string {
    const ownerName = this.getGoalOwnerName();
    return `${ownerName}'s Goal`;
  }

  getGoalOwnerInitials(): string {
    const goal = this.goal();
    if (!goal) return '?';
    const firstName = goal.participant?.firstName || '';
    const lastName = goal.participant?.lastName || '';
    if (firstName && lastName) {
      return `${firstName[0]}${lastName[0]}`.toUpperCase();
    }
    if (firstName) {
      return firstName.slice(0, 2).toUpperCase();
    }
    return 'RG';
  }

  async deleteGoal() {
    const goal = this.goal();
    if (!goal) return;
    if (!confirm('Are you sure you want to delete this goal? This action cannot be undone.')) {
      return;
    }
    try {
      await this.rocketGoalsService.deleteRocketGoal(goal.id);
      this.router.navigateByUrl('/goals');
    } catch (error) {
      console.error('Error deleting goal:', error);
      alert('Failed to delete goal. Please try again.');
    }
  }

  getGoalOwnerAvatarUrl(): string | null {
    // If the current user is the goal owner, use their profile picture
    if (this.isGoalOwner()) {
      const profile = this.authService.profile();
      return profile?.profilePictureUrl || null;
    }
    // For fans viewing, we don't have the owner's photo readily available
    // Could be extended to fetch from userProfiles collection if needed
    return null;
  }

  hasOwnerAvatar(): boolean {
    return !!this.getGoalOwnerAvatarUrl();
  }

  toggleShareDropdown() {
    this.showShareDropdown.set(!this.showShareDropdown());
  }

  closeShareDropdown() {
    this.showShareDropdown.set(false);
  }

  openIntroVideo() {
    this.showIntroVideoModal.set(true);
  }

  closeIntroVideo() {
    this.showIntroVideoModal.set(false);
  }

  async copyLink() {
    const url = this.getGoalUrl();
    try {
      await navigator.clipboard.writeText(url);
      this.copyLinkSuccess.set(true);
      setTimeout(() => {
        this.copyLinkSuccess.set(false);
        this.closeShareDropdown();
      }, 2000);
    } catch (err) {
      console.error('Failed to copy URL:', err);
      alert('Failed to copy URL. Please copy it manually: ' + url);
    }
  }

  getGoalUrl(): string {
    const goal = this.goal();
    if (goal?.id) {
      // Build absolute URL with the goal ID and fan invite parameter
      const baseUrl = window.location.origin;
      return `${baseUrl}/rocketgoal/${goal.id}?fan=invite`;
    }
    return window.location.href;
  }

  getShareMessage(): string {
    const title = this.getGoalTitleDisplay();
    const url = this.getGoalUrl();
    return `Hi - I'm setting a ROCKET Goal to ${title}

I'd love for you to join my support CREW. Click below to join my CREW for free.
You can send me emojis, DMs and track my progress over the coming months.
Your support will mean a lot.
Thanks in advance!

${url}`;
  }

  getShareMessageShort(): string {
    const title = this.getGoalTitleDisplay();
    const url = this.getGoalUrl();
    return `Hi - I'm setting a ROCKET Goal to ${title}. Join my support CREW for free! Send emojis, DMs & track my progress. Your support means a lot! ${url}`;
  }

  shareOnTwitter() {
    const goal = this.goal();
    if (!goal) return;

    // Twitter/X has character limits, use shorter message
    const text = encodeURIComponent(this.getShareMessageShort());
    const twitterUrl = `https://twitter.com/intent/tweet?text=${text}`;
    window.open(twitterUrl, '_blank', 'width=550,height=420');
    this.closeShareDropdown();
  }

  async shareOnFacebook() {
    const goal = this.goal();
    if (!goal) return;

    // Copy message to clipboard so user can paste it
    const message = this.getShareMessage();
    try {
      await navigator.clipboard.writeText(message);
    } catch (err) {
      console.error('Failed to copy message to clipboard:', err);
    }

    const url = encodeURIComponent(this.getGoalUrl());
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}`;
    window.open(facebookUrl, '_blank', 'width=550,height=420');

    // Show a brief alert to let user know message is copied
    alert('Your message has been copied to clipboard! Paste it in your Facebook post.');
    this.closeShareDropdown();
  }

  async shareOnLinkedIn() {
    const goal = this.goal();
    if (!goal) return;

    // Copy message to clipboard so user can paste it
    const message = this.getShareMessage();
    try {
      await navigator.clipboard.writeText(message);
    } catch (err) {
      console.error('Failed to copy message to clipboard:', err);
    }

    const url = encodeURIComponent(this.getGoalUrl());
    const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${url}`;
    window.open(linkedInUrl, '_blank', 'width=550,height=420');

    // Show a brief alert to let user know message is copied
    alert('Your message has been copied to clipboard! Paste it in your LinkedIn post.');
    this.closeShareDropdown();
  }

  shareOnWhatsApp() {
    const goal = this.goal();
    if (!goal) return;

    const text = encodeURIComponent(this.getShareMessage());
    const whatsappUrl = `https://wa.me/?text=${text}`;
    window.open(whatsappUrl, '_blank');
    this.closeShareDropdown();
  }

  shareViaEmail() {
    const goal = this.goal();
    if (!goal) return;

    const title = this.getGoalTitleDisplay();
    const subject = encodeURIComponent(`Join my ROCKET Goal CREW: ${title}`);
    const body = encodeURIComponent(this.getShareMessage());
    const mailtoUrl = `mailto:?subject=${subject}&body=${body}`;
    window.location.href = mailtoUrl;
    this.emailShareSuccess.set(true);
    setTimeout(() => {
      this.emailShareSuccess.set(false);
      this.closeShareDropdown();
    }, 2000);
  }

  startEditingTitle() {
    this.editingTitleValue.set(this.dashboardTitle());
    this.isEditingTitle.set(true);
    setTimeout(() => {
      // Use ViewChild reference if available, otherwise fall back to querySelector
      const input = this.titleInputRef?.nativeElement || 
        document.querySelector('input[type="text"][ngModel].dashboard-title-input') as HTMLInputElement;
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

  goHome() {
    this.router.navigateByUrl('/goals');
  }

  toggleDarkMode() {
    this.themeService.toggleDarkMode();
  }

  startEditingGoalTitle() {
    const currentTitle = this.getGoalTitleDisplay();
    this.editingGoalTitleValue.set(currentTitle);
    this.isEditingGoalTitle.set(true);
    setTimeout(() => {
      // Use ViewChild reference if available, otherwise fall back to querySelector
      const input = this.goalTitleInputRef?.nativeElement || 
        document.querySelector('input.goal-title-input') as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }, 0);
  }

  async saveGoalTitle() {
    const goal = this.goal();
    if (!goal) return;

    const newTitle = this.editingGoalTitleValue().trim();
    if (!newTitle) {
      // Don't save empty title
      this.cancelEditingGoalTitle();
      return;
    }

    try {
      // Update the goal in Firestore
      // We'll update both primaryGoal and the answers to keep them in sync
      const updates: any = {
        primaryGoal: newTitle
      };

      // Also update the custom_goal_title in answers if it exists, or set it
      const currentAnswers = { ...goal.answers };
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
      const updatedGoal = { ...goal, primaryGoal: newTitle, answers: currentAnswers };
      this.goal.set(updatedGoal as RocketGoal);

      this.isEditingGoalTitle.set(false);
      this.editingGoalTitleValue.set('');
    } catch (error) {
      console.error('Error updating goal title:', error);
      this.error.set('Failed to update goal title. Please try again.');
    }
  }

  cancelEditingGoalTitle() {
    this.isEditingGoalTitle.set(false);
    this.editingGoalTitleValue.set('');
  }

  async loadCalendarEvents(goalId: string) {
    try {
      console.log('Loading calendar events for goal:', goalId);
      const eventsData = await this.calendarEventsService.getEventsByGoalId(goalId);
      console.log('Loaded events data:', eventsData.length, 'events');
      const events = eventsData.map(eventData => {
        const event = this.calendarEventsService.toCalendarEvent(eventData);
        // For milestone events, ensure color reflects completion status (green=done, red=todo)
        if (event.title.startsWith('🎯')) {
          event.color = event.completed ? '#22c55e' : '#ef4444';
        }
        return event;
      });
      this.calendarEvents.set(events);
      console.log('Calendar events set:', events.length, 'events');
    } catch (error) {
      console.error('Error loading calendar events:', error);
    }
  }

  onCalendarDateSelected(date: Date) {
    this.eventModalDate.set(new Date(date)); // Create new date object to trigger change detection
    this.selectedEvent.set(null);
    this.showEventModal.set(true);
  }

  onCalendarEventClicked(event: CalendarEvent) {
    this.selectedEvent.set({ ...event }); // Create new object to trigger change detection
    this.eventModalDate.set(new Date(event.date));
    this.showEventModal.set(true);
  }

  onCalendarCreateEvent(date: Date) {
    this.eventModalDate.set(new Date(date)); // Create new date object to trigger change detection
    this.selectedEvent.set(null);
    this.showEventModal.set(true);
  }

  async onEventSave(eventData: Partial<CalendarEventData>) {
    const goal = this.goal();
    if (!goal?.id) return;

    try {
      if (this.selectedEvent()) {
        // Update existing event
        await this.calendarEventsService.updateEvent(goal.id, this.selectedEvent()!.id, eventData);
      } else {
        // Create new event
        await this.calendarEventsService.createEvent(goal.id, eventData as any);
      }
      
      // Reload events
      await this.loadCalendarEvents(goal.id);
      this.showEventModal.set(false);
      this.selectedEvent.set(null);
    } catch (error) {
      console.error('Error saving event:', error);
      alert('Failed to save event. Please try again.');
    }
  }

  async onEventDelete(eventId: string) {
    const goal = this.goal();
    if (!goal?.id) return;

    try {
      await this.calendarEventsService.deleteEvent(goal.id, eventId);
      
      // Reload events
      await this.loadCalendarEvents(goal.id);
      this.showEventModal.set(false);
      this.selectedEvent.set(null);
    } catch (error) {
      console.error('Error deleting event:', error);
      alert('Failed to delete event. Please try again.');
    }
  }

  onEventModalClose() {
    this.showEventModal.set(false);
    this.selectedEvent.set(null);
  }

  connectAppleCalendar() {
    const calendarName = this.getGoalTitleDisplay() || 'Rocket Goals';
    const events = this.calendarEvents();
    if (events.length === 0) {
      alert('No calendar events to sync yet. Add a milestone or event first.');
      return;
    }
    this.downloadCalendarIcs(calendarName);
  }

  private downloadCalendarIcs(calendarName: string) {
    const goalId = this.goal()?.id || 'rocket-goals';
    const fileName = `${this.sanitizeFileName(calendarName)}.ics`;
    const icsContent = this.buildCalendarIcs(this.calendarEvents(), calendarName, goalId);
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }


  private buildCalendarIcs(events: CalendarEvent[], calendarName: string, goalId: string): string {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'CALSCALE:GREGORIAN',
      'PRODID:-//RocketGoals//Mission Calendar//EN',
      `X-WR-CALNAME:${this.escapeIcsText(calendarName)}`
    ];
    if (timeZone) {
      lines.push(`X-WR-TIMEZONE:${this.escapeIcsText(timeZone)}`);
    }

    const dtStamp = this.formatIcsDateTime(new Date());
    events.forEach(event => {
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:rg-${goalId}-${event.id}@rocketgoals`);
      lines.push(`DTSTAMP:${dtStamp}`);
      lines.push(`SUMMARY:${this.escapeIcsText(event.title)}`);
      if (event.description) {
        lines.push(`DESCRIPTION:${this.escapeIcsText(event.description)}`);
      }

      if (event.time) {
        const start = event.date;
        const durationMinutes = event.duration ?? 60;
        const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
        lines.push(`DTSTART:${this.formatIcsDateTime(start)}`);
        lines.push(`DTEND:${this.formatIcsDateTime(end)}`);
      } else {
        const startDate = this.formatIcsDate(event.date);
        const endDate = this.formatIcsDate(this.addDays(event.date, 1));
        lines.push(`DTSTART;VALUE=DATE:${startDate}`);
        lines.push(`DTEND;VALUE=DATE:${endDate}`);
      }

      lines.push('END:VEVENT');
    });

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  private formatIcsDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  private formatIcsDateTime(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}${month}${day}T${hours}${minutes}${seconds}`;
  }

  private addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  private escapeIcsText(value: string): string {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/,/g, '\\,')
      .replace(/;/g, '\\;');
  }

  private sanitizeFileName(value: string): string {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'rocket-goals-calendar';
  }

  async onAICalendarAction() {
    // Refresh calendar events when AI performs an action
    console.log('Refreshing calendar after AI action...');
    const goal = this.goal();
    if (goal?.id) {
      // Add a small delay to ensure Firestore has propagated the changes
      await new Promise(resolve => setTimeout(resolve, 300));
      await this.loadCalendarEvents(goal.id);
      console.log('Calendar refreshed');
    }
  }

  // Fans + Community Methods
  isGoalOwner(): boolean {
    const goal = this.goal();
    const profile = this.authService.profile();
    return !!goal?.userId && !!profile?.userId && goal.userId === profile.userId;
  }

  private getFeedbackIdentity(): { email: string; name: string } | null {
    const profile = this.authService.profile();
    if (profile?.email) {
      const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
      return {
        email: profile.email,
        name: fullName || profile.email
      };
    }

    const goal = this.goal();
    if (goal && this.isGoalOwner() && goal.participant?.email) {
      const participantName = `${goal.participant.firstName || ''} ${goal.participant.lastName || ''}`.trim();
      return {
        email: goal.participant.email,
        name: participantName || goal.participant.email
      };
    }

    return null;
  }

  selectPrimaryTab(tab: 'dashboard' | 'fans' | 'tasks' | 'calendar' | 'checkins', scrollToSection = false) {
    this.activePrimaryTab.set(tab);
    if (tab === 'tasks') {
      if (scrollToSection) {
        this.scrollToMilestonesSectionThenToday();
      } else {
        this.scheduleTodayMilestoneScroll();
      }
    }
  }

  private scrollToMilestonesSectionThenToday() {
    setTimeout(() => {
      const section = document.getElementById('fan-mission-panel');
      if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // After scrolling to section, scroll to today's milestone
        setTimeout(() => {
          this.scheduleTodayMilestoneScroll();
        }, 400);
      }
    }, 100);
  }

  private applyTabFromQuery(): void {
    const tabParam = this.route.snapshot.queryParamMap.get('tab') || this.route.snapshot.queryParamMap.get('section');
    const checkinParam = this.route.snapshot.queryParamMap.get('checkin');
    const sectionParam = this.route.snapshot.queryParamMap.get('section');
    if (tabParam === 'milestones' || tabParam === 'tasks' || tabParam === 'milestone') {
      this.activePrimaryTab.set('tasks');
      return;
    }
    if (sectionParam === 'weekly') {
      this.activePrimaryTab.set('checkins');
      this.pendingWeeklyScroll = true;
    }
    if (tabParam === 'checkins' || checkinParam) {
      this.activePrimaryTab.set('checkins');
      if (checkinParam === 'ignition' || checkinParam === 'mission_log') {
        if (!this.ensureCheckinLogin(checkinParam, this.router.url)) {
          return;
        }
        this.activeCheckinTab.set(checkinParam);
        this.checkinModalType.set(checkinParam);
        this.showCheckinModal.set(true);
        this.suppressMilestoneLanding = true;
        this.showMilestoneLandingModal.set(false);
        this.showTaskModal.set(false);
      }
      if (sectionParam === 'weekly') {
        this.pendingWeeklyScroll = true;
      }
    }
  }

  onFanInviteEmailChange(value: string) {
    this.currentFanInviteEmail.set(value);
    this.fanInviteError.set(null);
    if (this.fanInviteSearchTimeout) {
      clearTimeout(this.fanInviteSearchTimeout);
    }
    const trimmed = value.trim();
    if (trimmed.length < 3) {
      this.fanInviteSuggestions.set([]);
      return;
    }

    this.fanInviteSearchTimeout = setTimeout(async () => {
      try {
        const suggestions = await this.fansService.searchUsersByEmail(trimmed);
        this.fanInviteSuggestions.set(suggestions);
        if (suggestions.length === 1 && !this.currentFanInviteName().trim()) {
          this.currentFanInviteName.set(suggestions[0].name);
        }
      } catch (error) {
        console.error('Error fetching fan suggestions:', error);
        this.fanInviteSuggestions.set([]);
      }
    }, 250);
  }

  applyFanSuggestion(suggestion: { email: string; name: string }) {
    this.currentFanInviteEmail.set(suggestion.email);
    this.currentFanInviteName.set(suggestion.name);
    this.fanInviteSuggestions.set([]);
  }

  async inviteFan() {
    const goal = this.goal();
    if (!goal?.id) {
      this.fanInviteError.set('Select a goal before inviting fans.');
      return;
    }

    if (!this.isGoalOwner()) {
      this.fanInviteError.set('Only the goal owner can invite fans.');
      return;
    }

    const email = this.currentFanInviteEmail().trim().toLowerCase();
    const name = this.currentFanInviteName().trim();
    if (!email) {
      this.fanInviteError.set('Enter an email to send an invite.');
      return;
    }

    this.fanInviteLoading.set(true);
    this.fanInviteError.set(null);

    try {
      // Add the fan to Firestore
      await this.fansService.inviteFan(goal.id, email, name || undefined);
      
      // Get owner information for email
      const profile = this.authService.profile();
      if (profile?.email) {
        const ownerName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || profile.email;
        const ownerEmail = profile.email;

        // Send invitation email (don't fail if email fails, fan is already added)
        try {
          const { getApp } = await import('firebase/app');
          const { getFunctions, httpsCallable } = await import('firebase/functions');
          const app = getApp();
          const functions = getFunctions(app, 'us-central1');
          const sendFanInviteEmail = httpsCallable<{
            goalId: string;
            fanEmail: string;
            fanName?: string;
            ownerEmail: string;
            ownerName: string;
          }, { success: boolean }>(functions, 'sendFanInviteEmail');

          await sendFanInviteEmail({
            goalId: goal.id,
            fanEmail: email,
            fanName: name || undefined,
            ownerEmail,
            ownerName
          });
        } catch (emailError) {
          // Log but don't fail - fan is already added
          console.error('Error sending fan invitation email:', emailError);
        }
      }

      this.currentFanInviteEmail.set('');
      this.currentFanInviteName.set('');
      this.fanInviteSuggestions.set([]);
      await this.loadFans(goal.id);
    } catch (error: any) {
      console.error('Error inviting fan:', error);
      this.fanInviteError.set(error?.message || 'Unable to send invite right now.');
    } finally {
      this.fanInviteLoading.set(false);
    }
  }

  async loadFans(goalId: string) {
    this.fansLoading.set(true);
    try {
      const fans = await this.fansService.getFansByGoalId(goalId);
      const fansWithAvatars = await this.ensureFanAvatars(goalId, fans);
      this.fans.set(fansWithAvatars);
      this.syncCurrentUserFan(fansWithAvatars);
    } catch (error) {
      console.error('Error loading fans:', error);
    } finally {
      this.fansLoading.set(false);
    }
  }

  async loadFanComments(goalId: string) {
    this.commentsLoading.set(true);
    try {
      const comments = await this.fansService.getCommentsByGoalId(goalId);
      this.fanComments.set(comments);
    } catch (error) {
      console.error('Error loading fan comments:', error);
    } finally {
      this.commentsLoading.set(false);
    }
  }

  async loadFanReactions(goalId: string) {
    this.reactionsLoading.set(true);
    try {
      const counts = await this.fansService.getReactionCounts(goalId);
      const summary = Array.from(counts.entries()).map(([emoji, count]) => ({ emoji, count }));
      summary.sort((a, b) => b.count - a.count);
      this.fanReactions.set(summary);
    } catch (error) {
      console.error('Error loading fan reactions:', error);
    } finally {
      this.reactionsLoading.set(false);
    }
  }

  getReactionCount(emoji: string): number {
    return this.fanReactions().find(reaction => reaction.emoji === emoji)?.count || 0;
  }

  async submitFanComment() {
    const goal = this.goal();
    if (!goal?.id) {
      return;
    }

    // Check if user is logged in, if not redirect to login
    const identity = this.getFeedbackIdentity();
    if (!identity?.email) {
      const currentUrl = this.router.url;
      this.router.navigate(['/login'], { queryParams: { redirectTo: currentUrl } });
      return;
    }

    const content = this.fanCommentInput().trim();
    if (!content) {
      this.fanCommentError.set('Add a short note before posting.');
      return;
    }

    this.fanCommentSubmitting.set(true);
    this.fanCommentError.set(null);

    try {
      const emoji = this.fanCommentEmoji().trim() || undefined;
      await this.fansService.addComment(goal.id, identity.email, content, identity.name, emoji);
      this.fanCommentInput.set('');
      this.fanCommentEmoji.set('');
      await this.loadFanComments(goal.id);
    } catch (error: any) {
      console.error('Error submitting fan comment:', error);
      this.fanCommentError.set(error?.message || 'Unable to post your update right now.');
    } finally {
      this.fanCommentSubmitting.set(false);
    }
  }

  async toggleFanReaction(emoji: string) {
    const goal = this.goal();
    if (!goal?.id) {
      return;
    }

    // Check if user is logged in, if not redirect to login
    const identity = this.getFeedbackIdentity();
    if (!identity?.email) {
      const currentUrl = this.router.url;
      this.router.navigate(['/login'], { queryParams: { redirectTo: currentUrl } });
      return;
    }

    try {
      await this.fansService.addReaction(goal.id, identity.email, emoji, identity.name);
      await this.loadFanReactions(goal.id);
    } catch (error) {
      console.error('Error toggling fan reaction:', error);
    }
  }

  async submitCustomReaction() {
    const emoji = this.customReactionEmoji().trim();
    if (!emoji) return;

    await this.toggleFanReaction(emoji);
    this.customReactionEmoji.set('');
  }

  canCurrentUserLeaveFeedback(): boolean {
    return !!this.getFeedbackIdentity();
  }

  getFanStatusLabel(status: Fan['status']) {
    if (status === 'accepted') return 'Active';
    return 'Invited';
  }

  getFanDisplayName(name?: string, email?: string): string {
    if (name) return name;
    if (email) return email.split('@')[0];
    return 'Supporter';
  }

  getFanInitials(name?: string, email?: string): string {
    const displayName = name || email || 'Fan';
    const parts = displayName.trim().split(' ').filter(Boolean);
    if (parts.length === 0) return displayName.slice(0, 2).toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }

  getFanAvatarUrl(avatarId?: string): string {
    return `assets/${this.resolveAvatarId(avatarId)}.jpg`;
  }

  canEditFanAvatar(fan: Fan): boolean {
    const profile = this.authService.profile();
    if (!profile?.email) return false;
    return profile.email.toLowerCase() === fan.email.toLowerCase();
  }

  toggleFanAvatarPicker(fan: Fan): void {
    if (!this.canEditFanAvatar(fan)) return;
    const current = this.activeAvatarPickerFanId();
    this.activeAvatarPickerFanId.set(current === fan.id ? null : fan.id);
  }

  async selectFanAvatar(fan: Fan, avatarId: string): Promise<void> {
    if (!this.canEditFanAvatar(fan) || fan.avatar === avatarId) {
      this.activeAvatarPickerFanId.set(null);
      return;
    }

    this.updatingFanAvatarId.set(fan.id);
    try {
      await this.fansService.updateFanAvatar(fan.goalId, fan.id, avatarId);
      this.fans.update(entries =>
        entries.map(entry => entry.id === fan.id ? { ...entry, avatar: avatarId } : entry)
      );
      if (this.currentUserFan()?.id === fan.id) {
        this.currentUserFan.set({ ...fan, avatar: avatarId });
      }
    } catch (error) {
      console.error('Error updating fan avatar:', error);
    } finally {
      this.updatingFanAvatarId.set(null);
      this.activeAvatarPickerFanId.set(null);
    }
  }

  formatFanTimestamp(raw: unknown): string {
    if (!raw) return 'Just now';
    try {
      if (raw instanceof Date) {
        return raw.toLocaleString();
      }
      if (typeof raw === 'number') {
        return new Date(raw).toLocaleString();
      }
      if (typeof raw === 'object' && raw !== null && 'toDate' in raw && typeof (raw as any).toDate === 'function') {
        return (raw as any).toDate().toLocaleString();
      }
    } catch {
      return 'Just now';
    }
    return 'Just now';
  }

  private resolveAvatarId(avatarId?: string): string {
    if (avatarId && this.fanAvatarIds.includes(avatarId)) {
      return avatarId;
    }
    return this.fanAvatarIds[0];
  }

  private pickRandomAvatarId(): string {
    const index = Math.floor(Math.random() * this.fanAvatarIds.length);
    return this.fanAvatarIds[index];
  }

  private syncCurrentUserFan(fans: Fan[]): void {
    const profile = this.authService.profile();
    if (!profile?.email) {
      this.currentUserFan.set(null);
      return;
    }
    const match = fans.find(fan => fan.email.toLowerCase() === profile.email.toLowerCase()) || null;
    this.currentUserFan.set(match);
  }

  private async ensureFanAvatars(goalId: string, fans: Fan[]): Promise<Fan[]> {
    const missing = fans.filter(fan => !fan.avatar);
    if (!missing.length) return fans;

    const updates = await Promise.all(
      missing.map(async fan => {
        const avatarId = this.pickRandomAvatarId();
        try {
          await this.fansService.updateFanAvatar(goalId, fan.id, avatarId);
          return { ...fan, avatar: avatarId };
        } catch (error) {
          console.error('Error assigning fan avatar:', error);
          return fan;
        }
      })
    );

    const updatesById = new Map(updates.map(entry => [entry.id, entry]));
    return fans.map(fan => updatesById.get(fan.id) ?? fan);
  }

  // Fan Join Modal Methods
  async checkFanInviteFlow(): Promise<void> {
    const fanParam = this.route.snapshot.queryParamMap.get('fan');
    if (fanParam !== 'invite') return;

    const goal = this.goal();
    if (!goal) return;

    // Don't show modal to goal owner
    if (this.isGoalOwner()) return;

    // Check if user is already an accepted fan
    const profile = this.authService.profile();
    if (profile?.email) {
      const existingFan = await this.fansService.getFanByEmail(goal.id, profile.email);
      this.currentUserFan.set(existingFan);

      // If already accepted, don't show modal
      if (existingFan?.status === 'accepted') {
        return;
      }
    }

    // Show the join modal
    this.showFanJoinModal.set(true);
  }

  async checkPendingFanJoin(): Promise<void> {
    const pendingJoinData = sessionStorage.getItem('pendingFanJoin');
    if (!pendingJoinData) return;

    const profile = this.authService.profile();
    if (!profile?.email || !profile?.userId) return;

    const goal = this.goal();
    if (!goal) return;

    try {
      const { goalId, notificationPreference } = JSON.parse(pendingJoinData);

      // Verify this is the same goal
      if (goalId !== goal.id) return;

      // Complete the fan join
      const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
      await this.fansService.createFanFromVisitor(
        goal.id,
        profile.email,
        fullName,
        profile.userId,
        notificationPreference
      );

      // Clear pending data
      sessionStorage.removeItem('pendingFanJoin');

      // Reload fans and show welcome
      await this.loadFans(goal.id);
      this.showFanWelcomePrompt.set(true);
      this.activePrimaryTab.set('fans');

      // Scroll to fans section after a brief delay
      setTimeout(() => this.scrollFansIntoView(), 300);

      // Hide welcome prompt after 8 seconds
      setTimeout(() => this.showFanWelcomePrompt.set(false), 8000);
    } catch (error) {
      console.error('Error completing pending fan join:', error);
      sessionStorage.removeItem('pendingFanJoin');
    }
  }

  closeFanJoinModal(): void {
    this.showFanJoinModal.set(false);
    this.fanJoinError.set(null);
  }

  setFanNotificationPreference(preference: 'occasional' | 'frequent'): void {
    this.fanJoinNotificationPreference.set(preference);
  }

  async joinFanbase(): Promise<void> {
    const goal = this.goal();
    if (!goal) return;

    const profile = this.authService.profile();
    const preference = this.fanJoinNotificationPreference();

    // If not logged in, save to sessionStorage and redirect to login
    if (!profile?.email || !profile?.userId) {
      sessionStorage.setItem('pendingFanJoin', JSON.stringify({
        goalId: goal.id,
        notificationPreference: preference
      }));

      const currentUrl = `/rocketgoal/${goal.id}?fan=invite`;
      this.router.navigate(['/login'], { queryParams: { redirectTo: currentUrl } });
      return;
    }

    this.joiningFanbase.set(true);
    this.fanJoinError.set(null);

    try {
      const fullName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
      const existingFan = this.currentUserFan();

      if (existingFan) {
        // Update existing pending fan to accepted
        await this.fansService.acceptFanInvite(
          goal.id,
          existingFan.id,
          preference,
          profile.userId,
          fullName
        );
      } else {
        // Create new fan record
        await this.fansService.createFanFromVisitor(
          goal.id,
          profile.email,
          fullName,
          profile.userId,
          preference
        );
      }

      // Close modal and show success
      this.showFanJoinModal.set(false);
      await this.loadFans(goal.id);

      // Show welcome prompt and switch to fans tab
      this.showFanWelcomePrompt.set(true);
      this.activePrimaryTab.set('fans');

      // Scroll to fans section
      setTimeout(() => this.scrollFansIntoView(), 300);

      // Hide welcome prompt after 8 seconds
      setTimeout(() => this.showFanWelcomePrompt.set(false), 8000);
    } catch (error: any) {
      console.error('Error joining fanbase:', error);
      this.fanJoinError.set(error?.message || 'Unable to join fanbase. Please try again.');
    } finally {
      this.joiningFanbase.set(false);
    }
  }

  dismissFanWelcomePrompt(): void {
    this.showFanWelcomePrompt.set(false);
  }

  // Action Items Methods
  async loadActionItems(goalId: string) {
    this.loadingActionItems.set(true);
    try {
      const items = await this.actionItemsService.getActionItemsByGoalId(goalId);
      this.actionItems.set(items);
      this.scheduleTodayMilestoneScroll();
    } catch (error) {
      console.error('Error loading action items:', error);
    } finally {
      this.loadingActionItems.set(false);
    }
  }

  // Sync milestone completion status with calendar event colors
  private syncMilestoneCalendarColors() {
    const goal = this.goal();
    if (!goal?.id) return;

    const milestones = this.actionItems();
    const calendarEvents = this.calendarEvents();

    // Update local calendar event colors to match milestone completion status
    const updatedEvents = calendarEvents.map(event => {
      // Check if this is a milestone event
      if (event.title.startsWith('🎯')) {
        const milestoneTitle = event.title.replace('🎯 ', '');
        const matchingMilestone = milestones.find(m =>
          m.title === milestoneTitle || event.title.includes(m.title)
        );

        if (matchingMilestone) {
          const correctColor = matchingMilestone.completed ? '#22c55e' : '#ef4444';
          // Only update if color is different
          if (event.color !== correctColor) {
            // Update in Firestore (fire and forget)
            this.calendarEventsService.updateEvent(goal.id, event.id, {
              color: correctColor,
              completed: matchingMilestone.completed
            }).catch(err => console.error('Error syncing calendar event color:', err));

            return { ...event, color: correctColor, completed: matchingMilestone.completed };
          }
        }
      }
      return event;
    });

    this.calendarEvents.set(updatedEvents);
  }

  async loadCheckIns(goalId: string) {
    this.checkinsLoading.set(true);
    this.checkinsError.set(null);
    try {
      const [ignition, missionLog, recentIgnitions, recentMissionLogs, journeyPhotos] = await Promise.all([
        this.checkInsService.getLatestDailyIgnition(goalId),
        this.checkInsService.getLatestMissionLog(goalId),
        this.checkInsService.getRecentDailyIgnitions(goalId, 60),
        this.checkInsService.getRecentMissionLogs(goalId, 60),
        this.checkInsService.getJourneyPhotos(goalId, 50)
      ]);
      this.latestDailyIgnition.set(ignition);
      this.latestMissionLog.set(missionLog);
      this.recentIgnitions.set(recentIgnitions);
      this.recentMissionLogs.set(recentMissionLogs);
      this.journeyPhotos.set(journeyPhotos);
      this.missionCoaching.set(missionLog?.aiCoaching ?? null);
      this.refreshCheckinDashboard();
      await this.loadWeeklyResets(goalId);
      if (this.pendingWeeklyScroll) {
        this.pendingWeeklyScroll = false;
        setTimeout(() => {
          const section = document.getElementById('weekly-reset-section');
          if (section) {
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 400);
      }
    } catch (error: any) {
      console.error('Error loading check-ins:', error);
      this.checkinsError.set(error?.message || 'Failed to load check-ins');
    } finally {
      this.checkinsLoading.set(false);
    }
  }

  selectCheckinTab(tab: 'ignition' | 'mission_log') {
    this.activeCheckinTab.set(tab);
  }

  private ensureCheckinLogin(type: 'ignition' | 'mission_log', redirectUrl?: string): boolean {
    const profile = this.authService.profile();
    if (profile?.userId) {
      return true;
    }
    const goal = this.goal();
    const fallbackUrl = goal?.id
      ? `/rocketgoal/${goal.id}?tab=checkins&checkin=${type}`
      : this.router.url;
    this.router.navigate(['/login'], { queryParams: { redirectTo: redirectUrl || fallbackUrl } });
    return false;
  }

  private ensureMilestoneLogin(redirectUrl?: string, silent = false): boolean {
    const profile = this.authService.profile();
    if (profile?.userId && this.isGoalOwner()) {
      return true;
    }
    if (profile?.userId && !this.isGoalOwner()) {
      return false;
    }
    if (silent) {
      return false;
    }
    const goal = this.goal();
    const fallbackUrl = goal?.id
      ? `/rocketgoal/${goal.id}?tab=tasks`
      : this.router.url;
    this.router.navigate(['/login'], { queryParams: { redirectTo: redirectUrl || fallbackUrl } });
    return false;
  }

  async loadWeeklyResets(goalId: string) {
    try {
      const resets = await this.checkInsService.getWeeklyResets(goalId, 8);
      this.weeklyResets.set(resets);
    } catch (error: any) {
      console.error('Error loading weekly resets:', error);
      this.weeklyResetNotice.set(error?.message || 'Weekly resets unavailable.');
    }
  }

  formatWeekRange(summary: WeeklyResetSummary): string {
    const start = new Date(summary.weekStartMs);
    const end = new Date(summary.weekEndMs);
    return `${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
  }

  openCheckinModal(type: 'ignition' | 'mission_log') {
    if (!this.ensureCheckinLogin(type)) {
      return;
    }
    this.checkinModalType.set(type);
    if (type === 'ignition') {
      this.resetIgnitionSequence();
    } else {
      this.missionWizardStep.set(1);
      this.missionTomorrowAcceptedIds.set([]);
    }
    // Reset coach response signals and error
    this.ignitionCoachResponse.set('');
    this.missionCoachResponse.set('');
    this.missionNote.set('');
    this.checkinModalError.set(null);
    this.showCheckinModal.set(true);
  }

  isMissionReflectionComplete(): boolean {
    return this.missionNote().trim().length > 0 && this.missionCoachResponse().trim().length > 0;
  }

  canMoveToMissionWizardStep(step: 1 | 2 | 3): boolean {
    if (step === 1) return true;
    if (step === 2) return this.isMissionReflectionComplete();
    return this.isMissionReflectionComplete() && this.isMissionTomorrowPlanAccepted();
  }

  goToMissionWizardStep(step: 1 | 2 | 3) {
    if (this.canMoveToMissionWizardStep(step)) {
      this.missionWizardStep.set(step);
      this.checkinModalError.set(null);
      return;
    }
    if (step === 3 && !this.isMissionTomorrowPlanAccepted()) {
      this.checkinModalError.set('Give each tomorrow milestone a thumbs up before continuing.');
      return;
    }
    this.checkinModalError.set('Please answer both reflection questions before continuing.');
  }

  canGoToNextMissionWizardStep(): boolean {
    if (this.missionWizardStep() === 1) return this.canMoveToMissionWizardStep(2);
    if (this.missionWizardStep() === 2) return this.canMoveToMissionWizardStep(3);
    return false;
  }

  goToNextMissionWizardStep() {
    const currentStep = this.missionWizardStep();
    if (currentStep === 1) {
      this.goToMissionWizardStep(2);
      return;
    }
    if (currentStep === 2) {
      this.goToMissionWizardStep(3);
    }
  }

  goToPreviousMissionWizardStep() {
    const currentStep = this.missionWizardStep();
    if (currentStep === 3) {
      this.missionWizardStep.set(2);
      return;
    }
    if (currentStep === 2) {
      this.missionWizardStep.set(1);
    }
  }

  closeCheckinModal() {
    this.clearIgnitionSequenceTimers();
    this.showCheckinModal.set(false);
  }

  getIgnitionSelectedTask(): string {
    const choice = this.ignitionOneThingChoice();
    if (choice === 'other') {
      return this.ignitionOneThingText().trim() || this.getActiveMilestoneTitle();
    }
    if (choice === 'suggested') {
      return this.getSuggestedOneThing();
    }
    return this.getActiveMilestoneTitle();
  }

  getIgnitionCommitmentMessage(): string {
    const partner = this.ignitionAccountabilityPartner().trim() || 'my accountability partner';
    const task = this.getIgnitionSelectedTask();
    const time = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return `Starting my 45-min burn on ${task} at ${time}. Hold me to it. (${partner})`;
  }

  getIgnitionCountdownLabel(): string {
    return `${this.ignitionCountdownSeconds()}s`;
  }

  getIgnitionBurnElapsedLabel(): string {
    const totalSeconds = this.ignitionBurnElapsedSeconds();
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  canStartIgnitionSequence(): boolean {
    return this.ignitionBreathsComplete()
      && this.ignitionIdentityStatementComplete()
      && this.ignitionEnvironmentalCue().trim().length > 0
      && !this.ignitionCountdownActive();
  }

  startIgnitionSequence() {
    if (!this.canStartIgnitionSequence()) return;
    this.clearIgnitionSequenceTimers();
    this.ignitionSequenceStarted.set(true);
    this.ignitionCountdownActive.set(true);
    this.ignitionCountdownSeconds.set(45);

    this.ignitionCountdownInterval = setInterval(() => {
      const next = this.ignitionCountdownSeconds() - 1;
      this.ignitionCountdownSeconds.set(next);
      if (next <= 0) {
        this.clearIgnitionCountdownTimer();
        this.ignitionSequenceStep.set(2);
        this.ignitionWizardStep.set(2);
      }
    }, 1000);
  }

  async sendIgnitionCommitmentMessage() {
    const message = this.getIgnitionCommitmentMessage();
    try {
      // Prefer opening the native messaging composer on mobile.
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        const smsUrl = `sms:?body=${encodeURIComponent(message)}`;
        window.location.href = smsUrl;
        this.ignitionCommitmentMessageSent.set(true);
        this.checkinModalError.set(null);
        return;
      }

      // Fallback for desktop: use share sheet if available, otherwise copy.
      if (navigator.share) {
        await navigator.share({ text: message });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(message);
      }
      this.ignitionCommitmentMessageSent.set(true);
      this.checkinModalError.set(null);
    } catch (error) {
      console.warn('Unable to send/share commitment message', error);
      this.ignitionCommitmentMessageSent.set(false);
      this.checkinModalError.set('Could not open share/copy flow. Please send the message manually, then click "I sent it manually."');
    }
  }

  confirmIgnitionManualMessageSent() {
    this.ignitionCommitmentMessageSent.set(true);
    this.checkinModalError.set(null);
  }

  startIgnitionBurnWindow() {
    if (this.ignitionBurnTimerActive()) return;
    this.checkinModalError.set(null);
    this.ignitionBurnTimerActive.set(true);
    this.ignitionBurnElapsedSeconds.set(0);
    this.ignitionBurnTimerInterval = setInterval(() => {
      this.ignitionBurnElapsedSeconds.update(value => value + 1);
    }, 1000);
  }

  completeIgnitionBurnWindow() {
    if (!this.ignitionBurnTimerActive()) return;
    this.clearIgnitionBurnTimer();
    this.ignitionBurnCompleted.set(true);
    this.ignitionSequenceStep.set(3);
    this.ignitionWizardStep.set(3);
  }

  resetIgnitionSequence() {
    this.clearIgnitionSequenceTimers();
    this.ignitionOneThingChoice.set('suggested');
    this.ignitionOneThingText.set('');
    this.ignitionTimeOfDay.set('morning');
    this.ignitionConfidence.set('medium');
    this.ignitionSequenceStep.set(1);
    this.ignitionWizardStep.set(1);
    this.ignitionBreathsComplete.set(false);
    this.ignitionIdentityStatementComplete.set(false);
    this.ignitionEnvironmentalCue.set('');
    this.ignitionSequenceStarted.set(false);
    this.ignitionCountdownSeconds.set(45);
    this.ignitionCountdownActive.set(false);
    this.ignitionAccountabilityPartner.set('');
    this.ignitionCommitmentMessageSent.set(false);
    this.ignitionBurnTimerActive.set(false);
    this.ignitionBurnElapsedSeconds.set(0);
    this.ignitionBurnCompleted.set(false);
    this.ignitionExecutionActionTaken.set('yes');
    this.ignitionExecutionFocusLevel.set('full_focus');
    this.ignitionExecutionChallengeLevel.set('average');
    this.ignitionExecutionFeeling.set('positive');
    this.ignitionExecutionTeamConnection.set('yes');
  }

  canMoveToIgnitionWizardStep(step: 1 | 2 | 3): boolean {
    if (step === 1) return true;
    if (step === 2) return this.ignitionSequenceStep() >= 2;
    return this.ignitionBurnCompleted();
  }

  goToIgnitionWizardStep(step: 1 | 2 | 3) {
    if (this.canMoveToIgnitionWizardStep(step)) {
      this.ignitionWizardStep.set(step);
      this.checkinModalError.set(null);
      return;
    }
    if (step === 2) {
      this.checkinModalError.set('Finish Step 1 to unlock Step 2.');
      return;
    }
    this.checkinModalError.set('Complete Steps 1 and 2 before Step 3.');
  }

  canGoToNextIgnitionWizardStep(): boolean {
    if (this.ignitionWizardStep() === 1) return this.canMoveToIgnitionWizardStep(2);
    if (this.ignitionWizardStep() === 2) return this.canMoveToIgnitionWizardStep(3);
    return false;
  }

  goToNextIgnitionWizardStep() {
    const currentStep = this.ignitionWizardStep();
    if (currentStep === 1) {
      this.goToIgnitionWizardStep(2);
      return;
    }
    if (currentStep === 2) {
      this.goToIgnitionWizardStep(3);
    }
  }

  goToPreviousIgnitionWizardStep() {
    const currentStep = this.ignitionWizardStep();
    if (currentStep === 3) {
      this.ignitionWizardStep.set(2);
      return;
    }
    if (currentStep === 2) {
      this.ignitionWizardStep.set(1);
    }
  }

  private clearIgnitionCountdownTimer() {
    if (this.ignitionCountdownInterval) {
      clearInterval(this.ignitionCountdownInterval);
      this.ignitionCountdownInterval = null;
    }
    this.ignitionCountdownActive.set(false);
  }

  private clearIgnitionBurnTimer() {
    if (this.ignitionBurnTimerInterval) {
      clearInterval(this.ignitionBurnTimerInterval);
      this.ignitionBurnTimerInterval = null;
    }
    this.ignitionBurnTimerActive.set(false);
  }

  private clearIgnitionSequenceTimers() {
    this.clearIgnitionCountdownTimer();
    this.clearIgnitionBurnTimer();
  }

  getActiveMilestoneTitle(): string {
    const items = this.actionItems().filter(item => !item.completed);
    if (!items.length) return 'No active milestones yet';
    const sorted = [...items].sort((a, b) => {
      if (a.dayNumber !== b.dayNumber) return a.dayNumber - b.dayNumber;
      return a.order - b.order;
    });
    return sorted[0]?.title || 'Untitled milestone';
  }

  private getPrimaryTodayMilestone(): ActionItem | null {
    const currentDay = this.getCurrentMissionDay();
    const todayItems = this.actionItems()
      .filter(item => item.dayNumber === currentDay)
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return a.order - b.order;
      });
    return todayItems[0] || null;
  }

  private async syncOneThingToTodayMilestone(oneThingText: string) {
    const goal = this.goal();
    if (!goal?.id) return;

    const trimmed = oneThingText.trim();
    if (!trimmed) return;

    const todayMilestone = this.getPrimaryTodayMilestone();
    if (!todayMilestone) {
      const currentDay = this.getCurrentMissionDay();
      const existingToday = this.getActionItemsForDay(currentDay);
      const nextOrder = existingToday.length > 0 ? Math.max(...existingToday.map(i => i.order)) + 1 : 0;

      const id = await this.actionItemsService.createActionItem({
        goalId: goal.id,
        title: trimmed,
        dayNumber: currentDay,
        completed: false,
        order: nextOrder
      });

      this.actionItems.update(items => [
        ...items,
        {
          id,
          goalId: goal.id,
          title: trimmed,
          dayNumber: currentDay,
          completed: false,
          order: nextOrder,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      ]);
      await this.createCalendarEventForMilestone(goal.id, trimmed, this.getDateFromDayNumber(currentDay));
      return;
    }
    if (todayMilestone.title === trimmed) return;

    const updates = {
      title: trimmed,
      dayNumber: todayMilestone.dayNumber,
      notes: todayMilestone.notes,
      completed: todayMilestone.completed
    };

    await this.actionItemsService.updateActionItem(goal.id, todayMilestone.id, { title: trimmed });
    this.actionItems.update(items =>
      items.map(item => item.id === todayMilestone.id ? { ...item, title: trimmed } : item)
    );
    await this.updateCalendarEventForMilestone(goal.id, todayMilestone, updates);
  }

  private async markTodayMilestoneCompletedAfterIgnition() {
    const goal = this.goal();
    if (!goal?.id) return;

    const currentDay = this.getCurrentMissionDay();
    const todayPending = this.actionItems()
      .filter(item => item.dayNumber === currentDay && !item.completed)
      .sort((a, b) => a.order - b.order)[0];

    if (!todayPending) return;

    await this.actionItemsService.updateActionItem(goal.id, todayPending.id, { completed: true });
    this.actionItems.update(items =>
      items.map(item => item.id === todayPending.id ? { ...item, completed: true } : item)
    );
    this.updateCalendarEventColorForMilestone(todayPending.title, true);
  }

  getSuggestedOneThing(): string {
    const latest = this.latestDailyIgnition();
    if (latest?.oneThingText) return latest.oneThingText;
    return this.getActiveMilestoneTitle();
  }

  getLastMissionLogSummary(): string {
    const log = this.latestMissionLog();
    if (!log) return 'No mission log yet.';
    const parts: string[] = [];
    if (log.actionTaken) parts.push(`Action: ${this.formatMissionValue(log.actionTaken)}`);
    if (log.focusLevel) parts.push(`Focus: ${this.formatMissionValue(log.focusLevel)}`);
    if (log.feeling) parts.push(`Feeling: ${this.formatMissionValue(log.feeling)}`);
    return parts.join(' • ') || 'No mission log yet.';
  }

  formatMissionValue(value: string): string {
    const map: Record<string, string> = {
      yes: 'Yes',
      barely: 'Barely',
      no: 'No',
      full_focus: 'Full Focus',
      distracted: 'Distracted',
      low_energy: 'Low Energy',
      tough_day: 'Tough Day',
      average: 'Average',
      easy: 'Easy',
      positive: 'Positive',
      neutral: 'Neutral',
      frustrated: 'Frustrated',
      solo: 'Solo Effort'
    };
    return map[value] || value;
  }

  private getDateFromValue(value: unknown): Date | null {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'object' && value !== null && 'seconds' in value) {
      const ts = value as { seconds: number };
      return new Date(ts.seconds * 1000);
    }
    if (typeof value === 'number' || typeof value === 'string') {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return null;
  }

  private isToday(value: unknown): boolean {
    const date = this.getDateFromValue(value);
    if (!date) return false;
    const today = new Date();
    return date.getFullYear() === today.getFullYear()
      && date.getMonth() === today.getMonth()
      && date.getDate() === today.getDate();
  }

  shouldAskIntendedOneThing(): boolean {
    const ignition = this.latestDailyIgnition();
    return !ignition || !this.isToday(ignition.createdAt);
  }

  getIgnitionCue(): string {
    const confidence = this.ignitionConfidence();
    const timeOfDay = this.ignitionTimeOfDay();
    const choice = this.ignitionOneThingChoice();
    const oneThing = choice === 'suggested'
      ? this.getSuggestedOneThing()
      : (choice === 'other' ? this.ignitionOneThingText() : null);
    const goalTitle = this.goal()?.primaryGoal || this.goal()?.answers?.['goal_title_label'] || 'your goal';
    const completionPct = this.getCompletionPercentage();

    // Build a dynamic, contextual message
    let cue = '';

    // Opening based on confidence
    if (confidence === 'high') {
      cue = `You're feeling confident — that's powerful. `;
    } else if (confidence === 'low') {
      cue = `Low confidence? That's honest, and honesty is the first step. `;
    } else {
      cue = `Solid energy today. `;
    }

    // Add context about the ONE Thing
    if (oneThing && choice !== 'unsure') {
      cue += `Your ONE Thing: "${oneThing}". `;
    } else if (choice === 'unsure') {
      cue += `Not sure what to focus on? Pick the smallest action that moves you toward "${goalTitle}". `;
    }

    // Add progress context
    if (completionPct > 0 && completionPct < 100) {
      cue += `You're ${completionPct}% through your mission. `;
    }

    // Time-based tactical advice
    if (timeOfDay === 'morning') {
      cue += `Block 60-90 minutes this morning before distractions pile up.`;
    } else if (timeOfDay === 'afternoon') {
      cue += `Claim a focused afternoon window — energy dips are normal, push through.`;
    } else {
      cue += `Evening work requires discipline. Protect a quiet block and minimize screens after.`;
    }

    return cue;
  }

  getIgnitionTimeBlock(): string {
    const timeOfDay = this.ignitionTimeOfDay();
    const confidence = this.ignitionConfidence();

    // More specific tactical advice based on time + confidence
    if (timeOfDay === 'morning') {
      if (confidence === 'high') return '💡 Pro tip: Start immediately. High confidence fades if you wait.';
      if (confidence === 'low') return '💡 Pro tip: Just start for 5 minutes. Momentum builds confidence.';
      return '💡 Pro tip: Do the hardest part first while your willpower is fresh.';
    } else if (timeOfDay === 'afternoon') {
      if (confidence === 'high') return '💡 Pro tip: Ride the wave — knock out the core work before 4pm.';
      if (confidence === 'low') return '💡 Pro tip: Take a short walk, then attack one small piece.';
      return '💡 Pro tip: Avoid meetings if possible. Guard your focus time.';
    } else {
      if (confidence === 'high') return '💡 Pro tip: Set a hard stop time so you rest well for tomorrow.';
      if (confidence === 'low') return '💡 Pro tip: Even 20 minutes of progress counts. Don\'t aim for perfect.';
      return '💡 Pro tip: Prep your environment — quiet space, phone away, clear desk.';
    }
  }

  // Coach helper methods
  getCoachName(): string {
    return this.goal()?.copilot?.name || 'Your Coach';
  }

  getCoachAvatar(): string | null {
    return this.goal()?.copilot?.avatar || null;
  }

  getIgnitionCoachQuestion(): string {
    const goal = this.goal();
    const goalTitle = goal?.primaryGoal || goal?.answers?.['goal_title_label'] || 'your goal';
    const activeMilestone = this.getActiveMilestoneTitle();
    const completionPct = this.getCompletionPercentage();

    // Generate contextual morning question based on progress
    if (completionPct === 0) {
      return `Good morning! Ready to kick off your journey toward "${goalTitle}"? Your first milestone is "${activeMilestone}" — what's one small action you can take today to build momentum?`;
    } else if (completionPct < 30) {
      return `Morning! You're ${completionPct}% into your mission. Today's focus: "${activeMilestone}". What's the ONE thing that would move you forward the most?`;
    } else if (completionPct < 70) {
      return `You're making solid progress at ${completionPct}%! Looking at "${activeMilestone}" — are you feeling confident about tackling it today?`;
    } else {
      return `Amazing — ${completionPct}% complete! You're in the home stretch. For "${activeMilestone}", what would finishing strong look like today?`;
    }
  }

  getMissionCoachQuestion(): string {
    const actionTaken = this.missionActionTaken();
    const feeling = this.missionFeeling();
    const focusLevel = this.missionFocusLevel();

    // Generate contextual evening question based on responses
    if (actionTaken === 'no') {
      if (feeling === 'frustrated') {
        return `I see today was tough. No judgment — everyone has off days. What got in the way? Understanding that helps us plan better for tomorrow.`;
      }
      return `Looks like today didn't go as planned. That's okay — what was the biggest blocker? Let's figure out how to clear it.`;
    } else if (actionTaken === 'barely') {
      if (focusLevel === 'distracted') {
        return `You showed up, and that counts. Distractions happen. What pulled your focus today, and how might we guard against it tomorrow?`;
      }
      return `Some progress is still progress. What would have helped you push a bit further today?`;
    } else {
      if (feeling === 'positive') {
        return `Great work today! What clicked for you? Knowing what works helps us repeat it.`;
      }
      return `You got it done — nice. Anything you'd do differently, or are you feeling good about the approach?`;
    }
  }

  getMissionCoachFollowUp(): string {
    const actionTaken = this.missionActionTaken();
    const coachResponse = this.missionCoachResponse();

    if (!coachResponse.trim()) return '';

    if (actionTaken === 'no' || actionTaken === 'barely') {
      return `Thanks for sharing. Tomorrow is a fresh start. Let's make sure your ONE Thing is crystal clear and achievable. Rest up!`;
    }
    return `Love the reflection. Keep building on that momentum. See you tomorrow morning!`;
  }

  private getDateKey(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private buildDaySummaries(days: number): CheckinDaySummary[] {
    const ignitionMap = new Map<string, number>();
    const missionMap = new Map<string, number>();

    this.recentIgnitions().forEach(item => {
      const date = this.getDateFromValue(item.createdAtMs || item.createdAt);
      if (!date) return;
      const key = this.getDateKey(date);
      ignitionMap.set(key, (ignitionMap.get(key) || 0) + 1);
    });

    this.recentMissionLogs().forEach(item => {
      const date = this.getDateFromValue(item.createdAtMs || item.createdAt);
      if (!date) return;
      const key = this.getDateKey(date);
      missionMap.set(key, (missionMap.get(key) || 0) + 1);
    });

    const summaries: CheckinDaySummary[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const key = this.getDateKey(date);
      const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      summaries.push({
        dateKey: key,
        label,
        ignitionCount: ignitionMap.get(key) || 0,
        missionLogCount: missionMap.get(key) || 0
      });
    }
    return summaries;
  }

  private calculateStreak(dateKeys: Set<string>): number {
    let streak = 0;
    for (let i = 0; i < 365; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const key = this.getDateKey(date);
      if (dateKeys.has(key)) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  }

  private refreshCheckinDashboard() {
    const last7 = this.buildDaySummaries(7);
    const last30 = this.buildDaySummaries(30);
    this.last7DaysCheckins.set(last7);
    this.last30DaysCheckins.set(last30);

    const ignitionDays = last30.filter(day => day.ignitionCount > 0).length;
    const missionDays = last30.filter(day => day.missionLogCount > 0).length;
    const ignitionCompletionRate = Math.round((ignitionDays / last30.length) * 100);
    const missionLogCompletionRate = Math.round((missionDays / last30.length) * 100);

    const missionLogDateKeys = new Set(
      this.recentMissionLogs()
        .map(item => this.getDateFromValue(item.createdAtMs || item.createdAt))
        .filter((date): date is Date => !!date)
        .map(date => this.getDateKey(date))
    );
    const streakDays = this.calculateStreak(missionLogDateKeys);

    const actionDistribution: Record<string, number> = { Yes: 0, Barely: 0, No: 0 };
    const focusDistribution: Record<string, number> = { 'Full Focus': 0, Distracted: 0, 'Low Energy': 0 };
    const feelingDistribution: Record<string, number> = { Positive: 0, Neutral: 0, Frustrated: 0 };

    let actionTotal = 0;
    let actionYes = 0;
    this.recentMissionLogs().forEach(log => {
      if (log.actionTaken) {
        actionTotal += 1;
        if (log.actionTaken === 'yes') actionYes += 1;
        actionDistribution[this.formatMissionValue(log.actionTaken)] =
          (actionDistribution[this.formatMissionValue(log.actionTaken)] || 0) + 1;
      }
      if (log.focusLevel) {
        focusDistribution[this.formatMissionValue(log.focusLevel)] =
          (focusDistribution[this.formatMissionValue(log.focusLevel)] || 0) + 1;
      }
      if (log.feeling) {
        feelingDistribution[this.formatMissionValue(log.feeling)] =
          (feelingDistribution[this.formatMissionValue(log.feeling)] || 0) + 1;
      }
    });

    const oneThingCompletionRatio = actionTotal > 0 ? Math.round((actionYes / actionTotal) * 100) : 0;

    this.checkinDashboardStats.set({
      ignitionCompletionRate,
      missionLogCompletionRate,
      streakDays,
      oneThingCompletionRatio,
      focusDistribution,
      feelingDistribution,
      actionDistribution
    });
  }

  getDistributionEntries(distribution: Record<string, number>): Array<{ label: string; value: number }> {
    return Object.entries(distribution)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value);
  }

  getDistributionTotal(distribution: Record<string, number>): number {
    return Object.values(distribution).reduce((sum, value) => sum + value, 0);
  }

  getDistributionPercent(value: number, total: number): number {
    if (!total) return 0;
    return Math.round((value / total) * 100);
  }

  getMaxCheckinCount(rows: CheckinDaySummary[]): number {
    return rows.reduce((max, row) => Math.max(max, row.ignitionCount, row.missionLogCount), 0);
  }

  getBarHeight(count: number, max: number): number {
    if (max <= 0) return 0;
    return Math.round((count / max) * 100);
  }

  formatCheckinDate(value: unknown): string {
    const date = this.getDateFromValue(value);
    if (!date) return 'Unknown';
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  getTodayFormatted(): string {
    const today = new Date();
    return today.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  }

  getRecentIgnitionHistory(): DailyIgnition[] {
    return this.recentIgnitions().slice(0, 10);
  }

  getRecentMissionLogHistory(): MissionLog[] {
    return this.recentMissionLogs().slice(0, 10);
  }

  getTomorrowMilestonesPreview(): ActionItem[] {
    const tomorrowDay = this.getCurrentMissionDay() + 1;
    return this.actionItems()
      .filter(item => item.dayNumber === tomorrowDay)
      .sort((a, b) => a.order - b.order)
      .slice(0, 6);
  }

  getTomorrowMilestonesDateLabel(): string {
    const tomorrow = this.getDateFromDayNumber(this.getCurrentMissionDay() + 1);
    return tomorrow.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  }

  isMissionTomorrowAccepted(itemId: string): boolean {
    return this.missionTomorrowAcceptedIds().includes(itemId);
  }

  toggleMissionTomorrowAccepted(itemId: string) {
    const accepted = this.isMissionTomorrowAccepted(itemId);
    if (accepted) {
      this.missionTomorrowAcceptedIds.update(ids => ids.filter(id => id !== itemId));
      return;
    }
    this.missionTomorrowAcceptedIds.update(ids => [...ids, itemId]);
  }

  private isMissionTomorrowPlanAccepted(): boolean {
    const items = this.getTomorrowMilestonesPreview();
    if (items.length === 0) return true;
    const accepted = this.missionTomorrowAcceptedIds();
    return items.every(item => accepted.includes(item.id));
  }

  getMissionTomorrowAcceptedCount(): number {
    const tomorrowIds = new Set(this.getTomorrowMilestonesPreview().map(item => item.id));
    return this.missionTomorrowAcceptedIds().filter(id => tomorrowIds.has(id)).length;
  }

  getMissionTomorrowTotalCount(): number {
    return this.getTomorrowMilestonesPreview().length;
  }

  startEditingTomorrowMilestone(item: ActionItem) {
    this.missionTomorrowEditingId.set(item.id);
    this.missionTomorrowDraftTitle.set(item.title);
    this.missionTomorrowAcceptedIds.update(ids => ids.filter(id => id !== item.id));
  }

  cancelEditingTomorrowMilestone() {
    this.missionTomorrowEditingId.set(null);
    this.missionTomorrowDraftTitle.set('');
  }

  async saveTomorrowMilestoneEdit(item: ActionItem) {
    const goal = this.goal();
    if (!goal?.id) return;

    const nextTitle = this.missionTomorrowDraftTitle().trim();
    if (!nextTitle) {
      this.checkinModalError.set('Milestone title cannot be empty.');
      return;
    }
    if (nextTitle === item.title) {
      this.cancelEditingTomorrowMilestone();
      return;
    }

    this.missionTomorrowSavingId.set(item.id);
    this.checkinModalError.set(null);
    try {
      await this.actionItemsService.updateActionItem(goal.id, item.id, { title: nextTitle });
      this.actionItems.update(items =>
        items.map(existing => existing.id === item.id ? { ...existing, title: nextTitle } : existing)
      );
      await this.updateCalendarEventForMilestone(goal.id, item, {
        title: nextTitle,
        dayNumber: item.dayNumber,
        notes: item.notes,
        completed: item.completed
      });
      this.missionTomorrowAcceptedIds.update(ids => ids.includes(item.id) ? ids : [...ids, item.id]);
      this.cancelEditingTomorrowMilestone();
    } catch (error) {
      console.error('Error updating tomorrow milestone:', error);
      this.checkinModalError.set('Could not update tomorrow milestone. Please try again.');
    } finally {
      this.missionTomorrowSavingId.set(null);
    }
  }

  private buildMissionLogCoaching(): MissionLogCoaching {
    const actionTaken = this.missionActionTaken();
    const focus = this.missionFocusLevel();
    const reinstruction = actionTaken === 'no'
      ? 'Reset to the smallest next action for tomorrow. Make it unmistakably doable.'
      : 'Protect the ONE Thing first. Everything else gets scheduled around it.';
    const demonstration = focus === 'distracted'
      ? 'Block 25 minutes, silence notifications, and start with a 2-minute warmup.'
      : 'Pick the first concrete step and finish it before anything else.';
    const hustle = actionTaken === 'barely'
      ? 'You showed up. Tomorrow, raise the bar by one notch.'
      : 'Keep the streak alive. Your future self is counting on today’s reps.';
    return { reinstruction, demonstration, hustle };
  }

  async submitDailyIgnition() {
    const goal = this.goal();
    if (!goal?.id) return;
    if (!this.ensureCheckinLogin('ignition')) {
      return;
    }
    const choice = this.ignitionOneThingChoice();
    let oneThingText = this.ignitionOneThingText().trim();

    if (choice === 'suggested') {
      oneThingText = this.getSuggestedOneThing();
    }

    if (choice === 'other' && !oneThingText) {
      this.checkinModalError.set('Please enter your ONE Thing or choose the suggested option.');
      return;
    }
    if (this.ignitionSequenceStep() !== 3 || !this.ignitionBurnCompleted()) {
      this.checkinModalError.set('Complete Steps 1 and 2 before logging execution.');
      return;
    }

    this.savingIgnition.set(true);
    this.checkinModalError.set(null);
    this.checkinsError.set(null);
    this.checkinsNotice.set(null);
    try {
      if (choice === 'other' && oneThingText) {
        await this.syncOneThingToTodayMilestone(oneThingText);
      }

      await this.checkInsService.upsertDailyIgnition({
        goalId: goal.id,
        oneThingChoice: choice,
        oneThingText: oneThingText || undefined,
        timeOfDay: this.ignitionTimeOfDay(),
        confidence: this.ignitionConfidence(),
        activationRitual: {
          breathsComplete: this.ignitionBreathsComplete(),
          identityStatementComplete: this.ignitionIdentityStatementComplete(),
          environmentalCue: this.ignitionEnvironmentalCue().trim()
        },
        commitment: {
          task: this.getIgnitionSelectedTask(),
          accountabilityPartner: this.ignitionAccountabilityPartner().trim() || undefined,
          messageSent: this.ignitionCommitmentMessageSent(),
          burnDurationSeconds: this.ignitionBurnElapsedSeconds()
        },
        execution: {
          actionTaken: this.ignitionExecutionActionTaken(),
          focusLevel: this.ignitionExecutionFocusLevel(),
          challengeLevel: this.ignitionExecutionChallengeLevel(),
          feeling: this.ignitionExecutionFeeling(),
          teamConnection: this.ignitionExecutionTeamConnection()
        }
      });
      await this.markTodayMilestoneCompletedAfterIgnition();
      if (this.journeyPhotoFile()) {
        await this.uploadJourneyPhoto('ignition');
      }
      await this.loadCheckIns(goal.id);
      this.checkinsNotice.set('Daily Ignition saved.');
      if (this.showCheckinModal()) {
        this.closeCheckinModal();
      }
      this.scrollToCheckinsSection();
      // Add coach Q&A to chat history if user responded
      const coachResponse = this.ignitionCoachResponse().trim();
      if (coachResponse && goal.id) {
        const coachQuestion = `**Morning Check-in**\n\n${this.getIgnitionCoachQuestion()}`;
        const coachFollowUp = `Thanks for sharing! Let's make today count. 🚀`;
        await this.rocketGoalsAIService.addCheckinConversation(coachQuestion, coachResponse, coachFollowUp, goal.id);
      }
    } catch (error: any) {
      console.error('Error saving daily ignition:', error);
      this.checkinModalError.set(error?.message || 'Failed to save Daily Ignition.');
    } finally {
      this.savingIgnition.set(false);
    }
  }

  async submitMissionLog() {
    const goal = this.goal();
    if (!goal?.id) return;
    if (!this.ensureCheckinLogin('mission_log')) {
      return;
    }
    const workReflection = this.missionNote().trim();
    const tomorrowChange = this.missionCoachResponse().trim();
    if (!workReflection || !tomorrowChange) {
      this.checkinModalError.set('Please answer both reflection questions before submitting.');
      return;
    }

    this.savingMissionLog.set(true);
    this.checkinModalError.set(null);
    this.checkinsError.set(null);
    this.checkinsNotice.set(null);
    const coaching = this.buildMissionLogCoaching();
    const reflectionNote = `How I felt about today's work: ${workReflection}\nWhat I will change tomorrow: ${tomorrowChange}`;
    try {
      await this.checkInsService.upsertMissionLog({
        goalId: goal.id,
        actionTaken: this.missionActionTaken(),
        focusLevel: this.missionFocusLevel(),
        challengeLevel: this.missionChallengeLevel(),
        feeling: this.missionFeeling(),
        teamConnection: this.missionTeamConnection(),
        note: reflectionNote,
        aiCoaching: coaching
      });
      if (this.journeyPhotoFile()) {
        await this.uploadJourneyPhoto('mission_log');
      }
      this.missionCoaching.set(coaching);

      // Add coach Q&A to chat history if user responded
      const coachResponse = this.missionCoachResponse().trim();
      if ((workReflection || coachResponse) && goal.id) {
        const coachQuestion = `**End of Day Check-in**\n\nHow did you feel about today's work?\n\nAnything you will change to make tomorrow better?`;
        const combinedResponse = `How I felt: ${workReflection}\nWhat I will change: ${coachResponse}`;
        const coachFollowUp = `Great reflection. Bring that adjustment into tomorrow's first work block.`;
        await this.rocketGoalsAIService.addCheckinConversation(coachQuestion, combinedResponse, coachFollowUp, goal.id);
      }

      await this.loadCheckIns(goal.id);
      this.checkinsNotice.set('Mission Log submitted.');
      if (this.showCheckinModal()) {
        this.closeCheckinModal();
      }
      this.scrollToCheckinsSection();
    } catch (error: any) {
      console.error('Error saving mission log:', error);
      this.checkinModalError.set(error?.message || 'Failed to submit Mission Log.');
    } finally {
      this.savingMissionLog.set(false);
    }
  }

  onJourneyPhotoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.checkinsError.set('Please select an image file.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      this.checkinsError.set('Image must be under 5MB.');
      return;
    }

    this.journeyPhotoFile.set(file);

    const reader = new FileReader();
    reader.onload = () => {
      this.journeyPhotoPreview.set(reader.result as string);
    };
    reader.readAsDataURL(file);

    input.value = '';
  }

  clearJourneyPhoto() {
    this.journeyPhotoFile.set(null);
    this.journeyPhotoPreview.set(null);
    this.journeyPhotoCaption.set('');
  }

  async uploadJourneyPhoto(source: JourneyPhotoSource) {
    const goal = this.goal();
    const file = this.journeyPhotoFile();
    if (!goal?.id || !file) return;

    this.uploadingJourneyPhoto.set(true);
    try {
      await this.checkInsService.uploadJourneyPhoto(
        goal.id,
        file,
        source,
        this.journeyPhotoCaption().trim() || undefined
      );
      this.clearJourneyPhoto();
      const photos = await this.checkInsService.getJourneyPhotos(goal.id, 50);
      this.journeyPhotos.set(photos);
    } catch (error: any) {
      console.error('Error uploading journey photo:', error);
      this.checkinsError.set(error?.message || 'Failed to upload photo.');
    } finally {
      this.uploadingJourneyPhoto.set(false);
    }
  }

  getJourneyPhotosByDate(): { dateId: string; dateLabel: string; photos: JourneyPhoto[] }[] {
    const photos = this.journeyPhotos();
    const grouped = new Map<string, JourneyPhoto[]>();

    photos.forEach(photo => {
      const existing = grouped.get(photo.dateId) || [];
      existing.push(photo);
      grouped.set(photo.dateId, existing);
    });

    const result: { dateId: string; dateLabel: string; photos: JourneyPhoto[] }[] = [];
    grouped.forEach((photos, dateId) => {
      const date = new Date(dateId + 'T12:00:00');
      const dateLabel = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      result.push({ dateId, dateLabel, photos });
    });

    return result.sort((a, b) => b.dateId.localeCompare(a.dateId));
  }

  async deleteJourneyPhoto(photo: JourneyPhoto) {
    const goal = this.goal();
    if (!goal?.id) return;

    if (!confirm('Delete this photo from your journey?')) return;

    try {
      await this.checkInsService.deleteJourneyPhoto(goal.id, photo.id, photo.imageUrl);
      this.journeyPhotos.update(photos => photos.filter(p => p.id !== photo.id));
      this.checkinsNotice.set('Photo deleted.');
    } catch (error: any) {
      console.error('Error deleting journey photo:', error);
      this.checkinsError.set(error?.message || 'Failed to delete photo.');
    }
  }

  openJourneyPhotoViewer(photo: JourneyPhoto) {
    this.journeyPhotoViewerPhoto.set(photo);
    this.journeyPhotoViewerOpen.set(true);
  }

  closeJourneyPhotoViewer() {
    this.journeyPhotoViewerOpen.set(false);
    this.journeyPhotoViewerPhoto.set(null);
  }

  getActionItemsForCurrentDay(): ActionItem[] {
    const currentDay = this.getCurrentMissionDay();
    return this.actionItems().filter(item => item.dayNumber === currentDay);
  }

  getCompletedItemsCount(): number {
    return this.actionItems().filter(item => item.completed).length;
  }

  getTotalItemsCount(): number {
    return this.actionItems().length;
  }

  async toggleActionItemComplete(item: ActionItem) {
    const goal = this.goal();
    if (!goal?.id) return;

    const wasCompleted = item.completed;

    // If completing (not uncompleting) and this goal has dashboard config, show completion modal
    const dashboardConfig = this.getDashboardConfig();
    if (!wasCompleted && dashboardConfig?.enabled && dashboardConfig?.trackMetricsOnCompletion) {
      if (!this.ensureMilestoneLogin()) {
        return;
      }
      this.milestoneToComplete.set(item);
      this.showMilestoneCompleteModal.set(true);
      return;
    }

    try {
      const newCompletedStatus = !item.completed;
      await this.actionItemsService.toggleActionItemComplete(goal.id, item.id, newCompletedStatus);
      // Update local state
      this.actionItems.update(items =>
        items.map(i => i.id === item.id ? { ...i, completed: newCompletedStatus } : i)
      );

      // Update calendar event color based on completion status
      this.updateCalendarEventColorForMilestone(item.title, newCompletedStatus);

      if (!wasCompleted) {
        this.triggerCelebration();
      }
    } catch (error) {
      console.error('Error toggling action item:', error);
    }
  }

  startEditingActionItem(item: ActionItem) {
    this.editingActionItemId.set(item.id);
    this.editingActionItemTitle.set(item.title);
  }

  async saveEditingActionItem() {
    const goal = this.goal();
    const itemId = this.editingActionItemId();
    if (!goal?.id || !itemId) return;

    const newTitle = this.editingActionItemTitle().trim();
    if (!newTitle) {
      this.cancelEditingActionItem();
      return;
    }

    try {
      await this.actionItemsService.updateActionItem(goal.id, itemId, { title: newTitle });
      // Update local state
      this.actionItems.update(items =>
        items.map(i => i.id === itemId ? { ...i, title: newTitle } : i)
      );
      this.cancelEditingActionItem();
    } catch (error) {
      console.error('Error updating action item:', error);
    }
  }

  cancelEditingActionItem() {
    this.editingActionItemId.set(null);
    this.editingActionItemTitle.set('');
  }

  async deleteActionItem(item: ActionItem) {
    const goal = this.goal();
    if (!goal?.id) return;

    try {
      await this.actionItemsService.deleteActionItem(goal.id, item.id);
      // Update local state
      this.actionItems.update(items => items.filter(i => i.id !== item.id));

      // Also delete the corresponding calendar event (if it exists)
      await this.deleteCalendarEventForMilestone(goal.id, item.title);
    } catch (error) {
      console.error('Error deleting action item:', error);
    }
  }

  // Helper to delete a calendar event that matches a milestone title
  private async deleteCalendarEventForMilestone(goalId: string, milestoneTitle: string) {
    try {
      // Find the calendar event with matching title (with 🎯 prefix)
      const eventTitle = `🎯 ${milestoneTitle}`;
      const matchingEvent = this.calendarEvents().find(e => e.title === eventTitle);

      if (matchingEvent) {
        await this.calendarEventsService.deleteEvent(goalId, matchingEvent.id);
        // Update local calendar events state
        this.calendarEvents.update(events => events.filter(e => e.id !== matchingEvent.id));
      }
    } catch (error) {
      console.error('Error deleting calendar event for milestone:', error);
      // Don't throw - milestone was still deleted successfully
    }
  }

  // Delete all milestones and their calendar events
  async deleteAllMilestones() {
    const goal = this.goal();
    if (!goal?.id) return;

    const items = this.actionItems();
    if (items.length === 0) {
      this.showDeleteAllConfirm.set(false);
      return;
    }

    this.deletingAllMilestones.set(true);

    try {
      // Delete all action items and their calendar events
      for (const item of items) {
        await this.actionItemsService.deleteActionItem(goal.id, item.id);
        await this.deleteCalendarEventForMilestone(goal.id, item.title);
      }

      // Clear local state
      this.actionItems.set([]);
      this.showDeleteAllConfirm.set(false);
    } catch (error) {
      console.error('Error deleting all milestones:', error);
    } finally {
      this.deletingAllMilestones.set(false);
    }
  }

  openAddActionItem() {
    if (!this.ensureMilestoneLogin()) {
      return;
    }
    this.showTaskModal.set(true);
    this.newActionItemTitle.set('');
    this.newActionItemNotes.set('');
    this.newActionItemCompleted.set(false);
    this.taskModalEditingItem.set(null);
    // Set default date to today or current mission day
    const currentDayDate = this.getDateFromDayNumber(this.getCurrentMissionDay());
    this.selectedDateForNewTask.set(this.formatDateISO(currentDayDate));
    this.selectedDayForNewTask.set(this.getCurrentMissionDay());
  }

  closeTaskModal() {
    this.showTaskModal.set(false);
    this.newActionItemTitle.set('');
    this.newActionItemNotes.set('');
    this.newActionItemCompleted.set(false);
    this.taskModalEditingItem.set(null);
    this.selectedDateForNewTask.set('');
  }

  onMilestoneDateChange(dateStr: string) {
    this.selectedDateForNewTask.set(dateStr);
    // Update the day number based on the selected date
    const goal = this.goal();
    if (goal?.startTime && dateStr) {
      const dayNumber = this.calculateDayNumberFromDate(dateStr, goal.startTime);
      this.selectedDayForNewTask.set(Math.max(1, dayNumber));
    }
  }

  // Get min date for milestone date picker (start date)
  getMinMilestoneDate(): string {
    const goal = this.goal();
    const startTime = goal?.startTime || Date.now();
    return this.formatDateISO(new Date(startTime));
  }

  // Get max date for milestone date picker (deadline)
  getMaxMilestoneDate(): string {
    const goal = this.goal();
    const startTime = goal?.startTime || Date.now();
    const deadlineTimestamp = this.getDeadlineTimestamp();
    if (deadlineTimestamp) {
      return this.formatDateISO(new Date(deadlineTimestamp));
    }
    const totalDays = this.getTimeframeDays();
    const endDate = new Date(startTime + (totalDays * 24 * 60 * 60 * 1000));
    return this.formatDateISO(endDate);
  }

  async addNewActionItem() {
    const goal = this.goal();
    if (!goal?.id) return;

    const title = this.newActionItemTitle().trim();
    if (!title) return;

    this.savingTask.set(true);

    const selectedDay = this.selectedDayForNewTask();
    const notes = this.newActionItemNotes().trim();
    const completed = this.newActionItemCompleted();
    const editingItem = this.taskModalEditingItem();
    const existingItems = this.getActionItemsForDay(selectedDay);
    const nextOrder = existingItems.length > 0 ? Math.max(...existingItems.map(i => i.order)) + 1 : 0;

    try {
      if (editingItem) {
        const wasCompleted = editingItem.completed;
        const updates: { title: string; dayNumber: number; completed: boolean; notes?: string } = {
          title,
          dayNumber: selectedDay,
          completed
        };
        if (notes) {
          updates.notes = notes;
        }

        await this.actionItemsService.updateActionItem(goal.id, editingItem.id, updates);
        this.actionItems.update(items =>
          items.map(i => i.id === editingItem.id ? { ...i, ...updates } : i)
        );

        await this.updateCalendarEventForMilestone(goal.id, editingItem, {
          title,
          dayNumber: selectedDay,
          notes: notes || undefined,
          completed
        });

        if (!wasCompleted && completed) {
          this.triggerCelebration();
        }
        this.closeTaskModal();
        return;
      }

      // Build the item data - only include notes if it has content
      const itemData: any = {
        goalId: goal.id,
        title,
        dayNumber: selectedDay,
        completed,
        order: nextOrder
      };
      if (notes) {
        itemData.notes = notes;
      }

      const newId = await this.actionItemsService.createActionItem(itemData);

      // Update local state for action items
      const newItem: ActionItem = {
        id: newId,
        goalId: goal.id,
        title,
        dayNumber: selectedDay,
        completed,
        order: nextOrder,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      if (notes) {
        newItem.notes = notes;
      }
      this.actionItems.update(items => [...items, newItem]);

      // Also create a calendar event for this milestone
      const milestoneDate = this.getDateFromDayNumber(selectedDay);
      await this.createCalendarEventForMilestone(goal.id, title, milestoneDate, notes, completed);

      if (completed) {
        this.triggerCelebration();
      }
      this.closeTaskModal();
    } catch (error) {
      console.error('Error adding action item:', error);
    } finally {
      this.savingTask.set(false);
    }
  }

  // Helper to create a calendar event for a milestone
  private async createCalendarEventForMilestone(goalId: string, title: string, date: Date, description?: string, completed: boolean = false) {
    try {
      // Use green for completed, red for incomplete
      const milestoneColor = completed ? '#22c55e' : '#ef4444';
      const eventData: any = {
        title: `🎯 ${title}`,
        date,
        color: milestoneColor,
        completed
      };
      if (description) {
        eventData.description = description;
      }

      const eventId = await this.calendarEventsService.createEvent(goalId, eventData);

      // Update local calendar events state
      const newEvent: CalendarEvent = {
        id: eventId,
        title: eventData.title,
        date,
        color: eventData.color,
        completed,
        description: eventData.description
      };
      this.calendarEvents.update(events => [...events, newEvent]);
    } catch (error) {
      console.error('Error creating calendar event for milestone:', error);
      // Don't throw - milestone was still created successfully
    }
  }

  private async updateCalendarEventForMilestone(
    goalId: string,
    originalItem: ActionItem,
    updates: { title: string; dayNumber: number; notes?: string; completed: boolean }
  ) {
    try {
      const originalTitle = `🎯 ${originalItem.title}`;
      const matchingEvent = this.calendarEvents().find(e => e.title === originalTitle);
      if (!matchingEvent) return;

      // Use green for completed, red for incomplete
      const milestoneColor = updates.completed ? '#22c55e' : '#ef4444';
      const eventUpdates: any = {
        title: `🎯 ${updates.title}`,
        date: this.getDateFromDayNumber(updates.dayNumber),
        completed: updates.completed,
        color: milestoneColor
      };
      if (updates.notes !== undefined) {
        eventUpdates.description = updates.notes;
      }

      await this.calendarEventsService.updateEvent(goalId, matchingEvent.id, eventUpdates);
      this.calendarEvents.update(events =>
        events.map(e => e.id === matchingEvent.id ? { ...e, ...eventUpdates } : e)
      );
    } catch (error) {
      console.error('Error updating calendar event for milestone:', error);
    }
  }

  // Helper to update only the color of a milestone's calendar event
  private updateCalendarEventColorForMilestone(milestoneTitle: string, completed: boolean) {
    const goal = this.goal();
    if (!goal?.id) return;

    // Try to find the calendar event - check both with and without emoji prefix
    const eventTitleWithEmoji = `🎯 ${milestoneTitle}`;
    let matchingEvent = this.calendarEvents().find(e =>
      e.title === eventTitleWithEmoji ||
      e.title === milestoneTitle ||
      e.title.includes(milestoneTitle)
    );

    if (!matchingEvent) {
      console.log('No matching calendar event found for milestone:', milestoneTitle);
      console.log('Available calendar events:', this.calendarEvents().map(e => e.title));
      return;
    }

    const milestoneColor = completed ? '#22c55e' : '#ef4444';
    console.log('Updating calendar event color:', matchingEvent.title, 'to', milestoneColor);

    // Update in Firestore
    this.calendarEventsService.updateEvent(goal.id, matchingEvent.id, {
      color: milestoneColor,
      completed
    }).catch(error => {
      console.error('Error updating calendar event color:', error);
    });

    // Update local state
    this.calendarEvents.update(events =>
      events.map(e => e.id === matchingEvent!.id ? { ...e, color: milestoneColor, completed } : e)
    );
  }

  // Get action items for a specific day
  getActionItemsForDay(day: number): ActionItem[] {
    return this.actionItems().filter(item => item.dayNumber === day);
  }

  // Get task count for a specific day (for timeline indicators)
  getTaskCountForDay(day: number): number {
    return this.getActionItemsForDay(day).length;
  }

  // Get completed task count for a specific day
  getCompletedTaskCountForDay(day: number): number {
    return this.getActionItemsForDay(day).filter(item => item.completed).length;
  }

  // Check if all tasks for a day are completed
  isAllTasksCompletedForDay(day: number): boolean {
    const tasks = this.getActionItemsForDay(day);
    return tasks.length > 0 && tasks.every(item => item.completed);
  }

  // Toggle viewing all tasks vs current day only
  toggleViewAllTasks() {
    this.viewAllTasks.update(v => !v);
    this.scheduleTodayMilestoneScroll();
  }

  // Milestone Generation Methods
  openGenerateMilestonesModal() {
    if (!this.ensureMilestoneLogin()) {
      return;
    }
    this.showGenerateMilestonesModal.set(true);
    this.generatedMilestones.set([]);
    this.milestoneGenerationError.set(null);
    this.generateMilestones();
  }

  closeGenerateMilestonesModal() {
    this.showGenerateMilestonesModal.set(false);
    this.generatedMilestones.set([]);
    this.milestoneGenerationError.set(null);
  }

  async generateMilestonesForRange(startDay: number, endDay: number) {
    const goal = this.goal();
    if (!goal) {
      throw new Error('No goal context available');
    }

    const totalDays = this.getTimeframeDays();
    const clampedStart = Math.min(Math.max(1, startDay), totalDays);
    const clampedEnd = Math.min(Math.max(clampedStart, endDay), totalDays);
    const rangeDays = clampedEnd - clampedStart + 1;

    const goalTitle = goal.answers?.['goal_title_label'] || goal.answers?.['custom_goal_title'] || goal.primaryGoal || 'my goal';
    const futureResult = goal.answers?.['future_result'] || '';
    const dailyEffort = goal.answers?.['daily_effort'] || '';
    const obstacles = goal.answers?.['obstacles'] || '';
    const motivation = goal.answers?.['motivation'] || '';

    const startTime = goal.startTime || Date.now();
    const startDate = new Date(startTime);
    const deadlineTimestamp = this.getDeadlineTimestamp();
    const endDate = deadlineTimestamp
      ? new Date(deadlineTimestamp)
      : new Date(startTime + (totalDays * 24 * 60 * 60 * 1000));

    const startDateStr = startDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const endDateStr = endDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    let contextSection = '';
    if (futureResult) contextSection += `\nDesired outcome: ${futureResult}`;
    if (dailyEffort) contextSection += `\nDaily commitment: ${dailyEffort}`;
    if (obstacles) contextSection += `\nPotential obstacles to address: ${obstacles}`;
    if (motivation) contextSection += `\nCore motivation: ${motivation}`;

    const milestoneCount = rangeDays;
    const milestoneType = 'daily';

    const prompt = `Create ${milestoneCount} ${milestoneType} milestones for achieving: "${goalTitle}"

TIMELINE: ${startDateStr} to ${endDateStr} (${totalDays} days total)
FOCUS RANGE: Day ${clampedStart} to Day ${clampedEnd} (${rangeDays} days)
${contextSection}

REQUIREMENTS:
1. Return milestones ONLY for day numbers in the range ${clampedStart} to ${clampedEnd}
2. Generate EXACTLY ${milestoneCount} milestones (ONE per day)
3. Each milestone must be specific, actionable, and measurable
4. Build progressive momentum and keep effort realistic for this period

IMPORTANT: Return ONLY a valid JSON array. Each object must have:
- "title": Specific action (keep it concise, under 100 characters)
- "dayNumber": The day number (${clampedStart} to ${clampedEnd})

Generate the milestones now (JSON array only, no other text):`;

    // Call AI silently - milestone generation shouldn't appear in chat history
    const response = await this.rocketGoalsAIService.callAISilent(prompt, goal);
    return this.parseMilestonesResponse(response, totalDays, startTime)
      .filter(m => m.dayNumber >= clampedStart && m.dayNumber <= clampedEnd);
  }

  async generateMilestones() {
    const goal = this.goal();
    if (!goal) {
      this.milestoneGenerationError.set('No goal context available');
      return;
    }

    this.generatingMilestones.set(true);
    this.milestoneGenerationError.set(null);

    try {
      const currentDay = this.getCurrentMissionDay();
      const totalDays = this.getTimeframeDays();
      const milestones = await this.generateMilestonesForRange(currentDay, totalDays);
      this.generatedMilestones.set(milestones.map(m => ({ ...m, selected: true })));
    } catch (error: any) {
      console.error('Error generating milestones:', error);
      this.milestoneGenerationError.set(error?.message || 'Failed to generate milestones. Please try again.');
    } finally {
      this.generatingMilestones.set(false);
    }
  }

  private parseMilestonesResponse(response: string, totalDays: number, startTime: number): Array<{ title: string; date: string; dayNumber: number }> {
    let milestones: any[] = [];

    // Use greedy match to capture as much of the array as possible
    const jsonMatch = response.match(/\[[\s\S]*/);
    if (jsonMatch) {
      let jsonStr = jsonMatch[0];

      // Try parsing as-is first
      try {
        milestones = JSON.parse(jsonStr);
      } catch {
        // Try to recover from truncated JSON by extracting complete objects
        milestones = this.extractCompleteMilestones(jsonStr);

        // If extraction failed, try cleaning and parsing again
        if (milestones.length === 0) {
          const cleanedJson = jsonStr
            .replace(/,\s*\]/g, ']')
            .replace(/'/g, '"')
            .replace(/(\w+):/g, '"$1":');
          try {
            milestones = JSON.parse(cleanedJson);
          } catch {
            // Try extraction on cleaned version
            milestones = this.extractCompleteMilestones(cleanedJson);
          }
        }
      }
    }

    if (!Array.isArray(milestones) || milestones.length === 0) {
      console.error('Could not parse milestones. Response:', response);
      throw new Error('Could not parse milestones from AI response. Please try again.');
    }

    return milestones.map((m: any, index: number) => {
      let dayNumber = m.dayNumber || m.day || (index + 1);
      if (typeof dayNumber === 'string') {
        dayNumber = parseInt(dayNumber, 10) || (index + 1);
      }

      dayNumber = Math.min(Math.max(1, dayNumber), totalDays);

      const milestoneDate = new Date(startTime + ((dayNumber - 1) * 24 * 60 * 60 * 1000));
      const dateStr = this.formatDateISO(milestoneDate);

      return {
        title: (m.title || m.milestone || '').trim(),
        date: dateStr,
        dayNumber
      };
    }).filter(m => m.title);
  }

  // Extract complete milestone objects from potentially truncated JSON
  private extractCompleteMilestones(jsonStr: string): any[] {
    const milestones: any[] = [];

    // Find all complete JSON objects within the array
    // Match objects that have both title and dayNumber fields
    const objectPattern = /\{\s*"title"\s*:\s*"([^"]+)"\s*,\s*"dayNumber"\s*:\s*(\d+)\s*\}|\{\s*"dayNumber"\s*:\s*(\d+)\s*,\s*"title"\s*:\s*"([^"]+)"\s*\}/g;

    let match;
    while ((match = objectPattern.exec(jsonStr)) !== null) {
      // Handle both orderings of title/dayNumber
      const title = match[1] || match[4];
      const dayNumber = parseInt(match[2] || match[3], 10);

      if (title && !isNaN(dayNumber)) {
        milestones.push({ title, dayNumber });
      }
    }

    return milestones;
  }

  // Helper to format date as ISO string (YYYY-MM-DD)
  formatDateISO(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Helper to calculate day number from a date string
  private calculateDayNumberFromDate(dateStr: string, startTime: number): number {
    const targetDate = new Date(dateStr);
    const startDate = new Date(startTime);
    startDate.setHours(0, 0, 0, 0);
    targetDate.setHours(0, 0, 0, 0);
    const diffMs = targetDate.getTime() - startDate.getTime();
    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;
    return diffDays;
  }

  // Helper to calculate date from day number
  getDateFromDayNumber(dayNumber: number): Date {
    const goal = this.goal();
    const startTime = goal?.startTime || Date.now();
    const date = new Date(startTime);
    date.setDate(date.getDate() + dayNumber - 1);
    return date;
  }

  // Get formatted date string from day number
  getFormattedDateFromDayNumber(dayNumber: number): string {
    const date = this.getDateFromDayNumber(dayNumber);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  private isChallengePastDeadline(): boolean {
    const goal = this.goal();
    if (!goal) return false;
    const startTime = goal.startTime || Date.now();
    const deadlineTimestamp = this.getDeadlineTimestamp();
    const endTime = deadlineTimestamp
      ? deadlineTimestamp
      : startTime + (this.getTimeframeDays() * 24 * 60 * 60 * 1000);
    return Date.now() > endTime;
  }

  private handleLandingMilestonesFlow(force = false) {
    if (this.landingFlowHandled && !force) return;
    if (this.suppressMilestoneLanding || this.showCheckinModal()) {
      this.landingFlowHandled = true;
      return;
    }
    const goal = this.goal();
    if (!goal || !this.isGoalOwner() || goal.status === 'completed') {
      this.landingFlowHandled = true;
      return;
    }

    if (this.isChallengePastDeadline()) {
      this.selectPrimaryTab('tasks');
      this.viewAllTasks.set(true);
      this.showDeadlineOverdueModal.set(true);
      this.landingFlowHandled = true;
      return;
    }

    const currentDay = this.getCurrentMissionDay();
    const todayItems = this.actionItems().filter(item => item.dayNumber === currentDay);

    if (todayItems.length === 0) {
      this.selectPrimaryTab('tasks');
      this.viewAllTasks.set(true);
      this.showMilestoneLandingModal.set(true);
      this.landingFlowHandled = true;
      return;
    }

    const todayMilestone = this.getFirstIncompleteTodayMilestone(currentDay);
    if (todayMilestone) {
      this.selectPrimaryTab('tasks');
      this.viewAllTasks.set(true);
      this.scrollTodayMilestoneIntoView(currentDay);
      this.openEditActionItemModal(todayMilestone, true);
      this.landingFlowHandled = true;
      return;
    }

    this.landingFlowHandled = true;
  }

  private scheduleTodayMilestoneScroll() {
    if (this.activePrimaryTab() !== 'tasks') return;
    const currentDay = this.getCurrentMissionDay();
    const todayItems = this.actionItems().filter(item => item.dayNumber === currentDay);
    if (todayItems.length === 0) return;
    const todayMilestone = this.getFirstIncompleteTodayMilestone(currentDay);
    setTimeout(() => {
      if (this.viewAllTasks()) {
        this.scrollTodayMilestoneIntoView(currentDay);
      }
      if (todayMilestone && this.autoOpenedMilestoneId() !== todayMilestone.id && !this.showTaskModal()) {
        this.openEditActionItemModal(todayMilestone, true);
      }
    }, 150);
  }

  private scrollTodayMilestoneIntoView(dayNumber: number) {
    // Try kanban card first, then fall back to task-card
    const target = document.querySelector(`.kanban-card[data-day="${dayNumber}"]`) as HTMLElement | null
      || document.querySelector(`.task-card[data-day="${dayNumber}"]`) as HTMLElement | null;
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  private getFirstIncompleteTodayMilestone(dayNumber: number): ActionItem | null {
    const items = this.actionItems()
      .filter(item => item.dayNumber === dayNumber && !item.completed)
      .sort((a, b) => a.order - b.order);
    return items[0] ?? null;
  }

  openEditActionItemModal(item: ActionItem, autoOpened = false) {
    if (!this.ensureMilestoneLogin(undefined, autoOpened)) {
      return;
    }
    this.taskModalEditingItem.set(item);
    this.showTaskModal.set(true);
    this.newActionItemTitle.set(item.title);
    this.newActionItemNotes.set(item.notes || '');
    this.newActionItemCompleted.set(item.completed);
    this.selectedDayForNewTask.set(item.dayNumber);
    this.selectedDateForNewTask.set(this.formatDateISO(this.getDateFromDayNumber(item.dayNumber)));
    if (autoOpened) {
      this.autoOpenedMilestoneId.set(item.id);
    }
  }

  async markTaskModalComplete() {
    if (!this.taskModalEditingItem()) return;
    this.newActionItemCompleted.set(true);
    await this.addNewActionItem();
  }

  async generateLandingMilestoneToday() {
    if (!this.ensureMilestoneLogin()) {
      return;
    }
    if (this.landingMilestoneAction()) return;
    this.landingMilestoneAction.set('today');
    try {
      const currentDay = this.getCurrentMissionDay();
      const milestones = await this.generateMilestonesForRange(currentDay, currentDay);
      await this.addGeneratedMilestones(milestones.map(m => ({ title: m.title, dayNumber: currentDay })));
      this.showMilestoneLandingModal.set(false);
      const created = this.getFirstIncompleteTodayMilestone(currentDay);
      if (created) {
        this.openEditActionItemModal(created, true);
      }
    } catch (error) {
      console.error('Error generating today milestone:', error);
    } finally {
      this.landingMilestoneAction.set(null);
    }
  }

  async generateLandingMilestonesRemaining() {
    if (!this.ensureMilestoneLogin()) {
      return;
    }
    if (this.landingMilestoneAction()) return;
    this.landingMilestoneAction.set('remaining');
    try {
      const currentDay = this.getCurrentMissionDay();
      const totalDays = this.getTimeframeDays();
      const milestones = await this.generateMilestonesForRange(currentDay, totalDays);
      await this.addGeneratedMilestones(milestones.map(m => ({ title: m.title, dayNumber: m.dayNumber })));
      this.showMilestoneLandingModal.set(false);
      this.scheduleTodayMilestoneScroll();
    } catch (error) {
      console.error('Error generating remaining milestones:', error);
    } finally {
      this.landingMilestoneAction.set(null);
    }
  }

  openLandingAddMilestone() {
    if (!this.ensureMilestoneLogin()) {
      return;
    }
    this.showMilestoneLandingModal.set(false);
    this.openAddActionItem();
  }

  async markGoalCompleteFromDeadline() {
    const goal = this.goal();
    if (!goal?.id) return;
    try {
      await this.rocketGoalsService.updateRocketGoal(goal.id, { status: 'completed' });
      this.goal.set({ ...goal, status: 'completed' });
      this.showDeadlineOverdueModal.set(false);
    } catch (error) {
      console.error('Error marking goal complete:', error);
    }
  }

  startDeadlineUpdateFromModal() {
    this.showDeadlineOverdueModal.set(false);
    this.pendingLandingAfterDeadline = true;
    this.startEditingDeadline();
  }

  private triggerCelebration() {
    this.showCelebration.set(true);
    if (this.celebrationTimeout) {
      clearTimeout(this.celebrationTimeout);
    }
    this.celebrationTimeout = setTimeout(() => {
      this.showCelebration.set(false);
    }, 2800);
  }

  toggleMilestoneSelection(index: number) {
    this.generatedMilestones.update(milestones =>
      milestones.map((m, i) => i === index ? { ...m, selected: !m.selected } : m)
    );
  }

  selectAllMilestones() {
    this.generatedMilestones.update(milestones =>
      milestones.map(m => ({ ...m, selected: true }))
    );
  }

  deselectAllMilestones() {
    this.generatedMilestones.update(milestones =>
      milestones.map(m => ({ ...m, selected: false }))
    );
  }

  getSelectedMilestonesCount(): number {
    return this.generatedMilestones().filter(m => m.selected).length;
  }

  hasSelectedMilestones(): boolean {
    return this.getSelectedMilestonesCount() > 0;
  }

  async addSelectedMilestones() {
    const goal = this.goal();
    if (!goal?.id) return;

    const selectedMilestones = this.generatedMilestones().filter(m => m.selected);
    if (selectedMilestones.length === 0) return;

    this.addingGeneratedMilestones.set(true);

    try {
      for (const milestone of selectedMilestones) {
        const existingItems = this.getActionItemsForDay(milestone.dayNumber);
        const nextOrder = existingItems.length > 0 ? Math.max(...existingItems.map(i => i.order)) + 1 : 0;

        const newId = await this.actionItemsService.createActionItem({
          goalId: goal.id,
          title: milestone.title,
          dayNumber: milestone.dayNumber,
          completed: false,
          order: nextOrder
        });

        // Update local action items state
        const newItem: ActionItem = {
          id: newId,
          goalId: goal.id,
          title: milestone.title,
          dayNumber: milestone.dayNumber,
          completed: false,
          order: nextOrder,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        this.actionItems.update(items => [...items, newItem]);

        // Also create a calendar event for this milestone
        const milestoneDate = this.getDateFromDayNumber(milestone.dayNumber);
        await this.createCalendarEventForMilestone(goal.id, milestone.title, milestoneDate);
      }

      this.closeGenerateMilestonesModal();
    } catch (error) {
      console.error('Error adding milestones:', error);
      this.milestoneGenerationError.set('Failed to add some milestones. Please try again.');
    } finally {
      this.addingGeneratedMilestones.set(false);
    }
  }

  private async addGeneratedMilestones(items: Array<{ title: string; dayNumber: number }>) {
    const goal = this.goal();
    if (!goal?.id) return;

    const orderByDay = new Map<number, number>();

    for (const milestone of items) {
      const title = milestone.title.trim();
      if (!title) continue;

      const existingItems = this.getActionItemsForDay(milestone.dayNumber);
      const duplicate = existingItems.some(item => item.title.trim().toLowerCase() === title.toLowerCase());
      if (duplicate) continue;

      const nextOrder = orderByDay.get(milestone.dayNumber)
        ?? (existingItems.length > 0 ? Math.max(...existingItems.map(i => i.order)) + 1 : 0);

      const itemData: any = {
        goalId: goal.id,
        title,
        dayNumber: milestone.dayNumber,
        completed: false,
        order: nextOrder
      };

      const newId = await this.actionItemsService.createActionItem(itemData);
      const newItem: ActionItem = {
        id: newId,
        goalId: goal.id,
        title,
        dayNumber: milestone.dayNumber,
        completed: false,
        order: nextOrder,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      this.actionItems.update(items => [...items, newItem]);
      const milestoneDate = this.getDateFromDayNumber(milestone.dayNumber);
      await this.createCalendarEventForMilestone(goal.id, title, milestoneDate);

      orderByDay.set(milestone.dayNumber, nextOrder + 1);
    }
  }

  // Get tasks to display based on view mode
  getDisplayedTasks(): ActionItem[] {
    if (this.viewAllTasks()) {
      return this.actionItems();
    }
    return this.getActionItemsForCurrentDay();
  }

  // Kanban board - get milestones for each column (sorted by day number, then order)
  getPendingMilestones(): ActionItem[] {
    const items = this.viewAllTasks() ? this.actionItems() : this.getActionItemsForCurrentDay();
    return items
      .filter(item => !item.completed && !item.postponed)
      .sort((a, b) => a.dayNumber - b.dayNumber || a.order - b.order);
  }

  getPostponedMilestones(): ActionItem[] {
    const items = this.viewAllTasks() ? this.actionItems() : this.getActionItemsForCurrentDay();
    return items
      .filter(item => !item.completed && item.postponed)
      .sort((a, b) => a.dayNumber - b.dayNumber || a.order - b.order);
  }

  getCompletedMilestones(): ActionItem[] {
    const items = this.viewAllTasks() ? this.actionItems() : this.getActionItemsForCurrentDay();
    return items
      .filter(item => item.completed)
      .sort((a, b) => a.dayNumber - b.dayNumber || a.order - b.order);
  }

  // Kanban - move milestone to a different column
  async moveMilestoneToColumn(item: ActionItem, column: 'pending' | 'postponed' | 'completed') {
    const goal = this.goal();
    if (!goal?.id) return;

    let updates: { completed?: boolean; postponed?: boolean } = {};

    switch (column) {
      case 'pending':
        updates = { completed: false, postponed: false };
        break;
      case 'postponed':
        updates = { completed: false, postponed: true };
        break;
      case 'completed':
        updates = { completed: true, postponed: false };
        break;
    }

    try {
      await this.actionItemsService.updateActionItem(goal.id, item.id, updates);
      this.actionItems.update(items =>
        items.map(i => i.id === item.id ? { ...i, ...updates } : i)
      );
      // Trigger celebration when moving to completed
      if (column === 'completed' && !item.completed) {
        this.triggerCelebration();
      }
    } catch (error) {
      console.error('Error moving milestone:', error);
    }
  }

  // Drag and drop handlers for Kanban
  onDragStart(event: DragEvent, item: ActionItem) {
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', item.id);
      event.dataTransfer.effectAllowed = 'move';
    }
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  }

  onDragEnter(event: DragEvent, column: string) {
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    target.classList.add('drag-over');
  }

  onDragLeave(event: DragEvent) {
    const target = event.currentTarget as HTMLElement;
    target.classList.remove('drag-over');
  }

  async onDrop(event: DragEvent, column: 'pending' | 'postponed' | 'completed') {
    event.preventDefault();
    const target = event.currentTarget as HTMLElement;
    target.classList.remove('drag-over');

    const itemId = event.dataTransfer?.getData('text/plain');
    if (!itemId) return;

    const item = this.actionItems().find(i => i.id === itemId);
    if (!item) return;

    await this.moveMilestoneToColumn(item, column);
  }

  // Notes functionality
  toggleNoteExpanded(itemId: string) {
    if (this.expandedNoteItemId() === itemId) {
      this.expandedNoteItemId.set(null);
    } else {
      this.expandedNoteItemId.set(itemId);
    }
  }

  startEditingNote(item: ActionItem) {
    this.editingNoteItemId.set(item.id);
    this.editingNoteValue.set(item.notes || '');
  }

  cancelEditingNote() {
    this.editingNoteItemId.set(null);
    this.editingNoteValue.set('');
  }

  async saveNote() {
    const goal = this.goal();
    const itemId = this.editingNoteItemId();
    if (!goal?.id || !itemId) return;

    const notes = this.editingNoteValue().trim();

    try {
      await this.actionItemsService.updateActionItem(goal.id, itemId, { notes: notes || undefined });
      // Update local state
      this.actionItems.update(items =>
        items.map(i => i.id === itemId ? { ...i, notes: notes || undefined } : i)
      );
      this.cancelEditingNote();
    } catch (error) {
      console.error('Error saving note:', error);
    }
  }

  // Add task directly to a timeline day (when clicking on timeline)
  addTaskToDay(day: number) {
    if (!this.ensureMilestoneLogin()) {
      return;
    }
    this.selectedDayForNewTask.set(day);
    this.showTaskModal.set(true);
    this.newActionItemTitle.set('');
    this.newActionItemNotes.set('');
    this.newActionItemCompleted.set(false);
    this.taskModalEditingItem.set(null);
  }

  // Get tasks positioned between timeline markers
  getTasksBetweenMarkers(): Array<{ item: ActionItem; positionPercent: number }> {
    const markers = this.getTimelineMarkers();
    const allTasks = this.actionItems();
    const result: Array<{ item: ActionItem; positionPercent: number }> = [];

    if (markers.length < 2 || allTasks.length === 0) return result;

    // Group tasks by segment first
    const tasksBySegment = new Map<number, ActionItem[]>();
    
    // For each task, find which segment it belongs to
    for (const task of allTasks) {
      const taskDay = task.dayNumber;
      
      for (let i = 0; i < markers.length - 1; i++) {
        const startMarker = markers[i];
        const endMarker = markers[i + 1];
        const isLastSegment = i === markers.length - 2;
        
        if (taskDay >= startMarker.day && (isLastSegment ? taskDay <= endMarker.day : taskDay < endMarker.day)) {
          if (!tasksBySegment.has(i)) {
            tasksBySegment.set(i, []);
          }
          tasksBySegment.get(i)!.push(task);
          break;
        }
      }
    }

    // Now position tasks within each segment, distributing multiple tasks on same day
    for (const [segmentIndex, segmentTasks] of tasksBySegment.entries()) {
      const startMarker = markers[segmentIndex];
      const endMarker = markers[segmentIndex + 1];
      const segmentStart = startMarker.day;
      const segmentEnd = endMarker.day;
      const segmentLength = segmentEnd - segmentStart;
      
      // Calculate segment boundaries in percentage
      const segmentStartPercent = (segmentIndex / (markers.length - 1)) * 100;
      const segmentEndPercent = ((segmentIndex + 1) / (markers.length - 1)) * 100;
      const segmentWidth = segmentEndPercent - segmentStartPercent;
      
      // Group tasks by day within this segment
      const tasksByDay = new Map<number, ActionItem[]>();
      for (const task of segmentTasks) {
        if (!tasksByDay.has(task.dayNumber)) {
          tasksByDay.set(task.dayNumber, []);
        }
        tasksByDay.get(task.dayNumber)!.push(task);
      }
      
      // Position each task
      for (const [day, dayTasks] of tasksByDay.entries()) {
        // Sort tasks for the day by order
        const sortedDayTasks = dayTasks.sort((a, b) => (a.order || 0) - (b.order || 0));
        
        // Calculate base position for this day
        let basePositionInSegment = 0;
        if (segmentLength > 0) {
          const dayPosition = (day - segmentStart) / segmentLength;
          // Avoid placing rockets too close to markers (reserve 15% on each side)
          basePositionInSegment = 0.15 + (dayPosition * 0.70);
        } else {
          basePositionInSegment = 0.5;
        }
        
        // If multiple tasks on same day, distribute them horizontally
        const taskCount = sortedDayTasks.length;
        const spacing = taskCount > 1 ? Math.min(0.08, 0.70 / taskCount) : 0; // Max 8% spacing or distribute evenly
        
        sortedDayTasks.forEach((task, taskIndex) => {
          let positionInSegment = basePositionInSegment;
          
          // Distribute multiple tasks on same day horizontally
          if (taskCount > 1) {
            const offset = (taskIndex - (taskCount - 1) / 2) * spacing;
            positionInSegment = basePositionInSegment + offset;
            // Clamp to segment bounds
            positionInSegment = Math.max(0.15, Math.min(0.85, positionInSegment));
          }
          
          const positionPercent = segmentStartPercent + (positionInSegment * segmentWidth);
          result.push({ item: task, positionPercent: Math.max(2, Math.min(98, positionPercent)) });
        });
      }
    }

    // Sort by position
    return result.sort((a, b) => {
      if (Math.abs(a.positionPercent - b.positionPercent) < 0.5) {
        // If rockets are very close, sort by day number then order
        if (a.item.dayNumber !== b.item.dayNumber) {
          return a.item.dayNumber - b.item.dayNumber;
        }
        return (a.item.order || 0) - (b.item.order || 0);
      }
      return a.positionPercent - b.positionPercent;
    });
  }

  // Toggle expanded state for timeline task rocket
  toggleTimelineTaskExpanded(taskId: string) {
    if (this.expandedTimelineTaskId() === taskId) {
      this.expandedTimelineTaskId.set(null);
    } else {
      this.expandedTimelineTaskId.set(taskId);
    }
  }

  // Get vertical offset for overlapping rockets (returns pixel value)
  // Get horizontal offset to position rockets slightly to the right of markers
  getRocketHorizontalOffset(taskData: { item: ActionItem; positionPercent: number }, index: number): number {
    const markers = this.getTimelineMarkers();
    const allTasks = this.getTasksBetweenMarkers();
    const currentPos = taskData.positionPercent;
    
    // Check if rocket is too close to any marker (within 8% of marker position)
    for (const marker of markers) {
      const markerPercent = this.getMarkerPositionPercent(marker.day);
      if (Math.abs(currentPos - markerPercent) < 8) {
        // Position rocket to the right of the marker with more spacing for clickability
        return 24; // 24px to the right - enough space to click
      }
    }
    
    // Check for overlapping rockets at similar positions
    let offsetIndex = 0;
    for (let i = 0; i < index; i++) {
      const otherPos = allTasks[i].positionPercent;
      if (Math.abs(currentPos - otherPos) < 2) {
        offsetIndex++;
      }
    }
    
    // Small horizontal offset for overlapping rockets
    return offsetIndex * 8; // 8px spacing for each overlapping rocket
  }

  // Get marker position as percentage
  getMarkerPositionPercent(markerDay: number): number {
    const markers = this.getTimelineMarkers();
    if (markers.length < 2) return 0;
    
    for (let i = 0; i < markers.length; i++) {
      if (markers[i].day === markerDay) {
        return (i / (markers.length - 1)) * 100;
      }
    }
    return 0;
  }

  // Get transform style for rocket positioning - on the timeline line
  getRocketTransform(taskData: { item: ActionItem; positionPercent: number }, index: number): string {
    const horizontalOffset = this.getRocketHorizontalOffset(taskData, index);
    return `translateX(calc(-50% + ${horizontalOffset}px)) translateY(-50%)`;
  }

  private scrollFansIntoView() {
    const section = document.getElementById(this.fanSectionId);
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  private scrollToCheckinsSection() {
    // Switch to checkins tab first
    this.activePrimaryTab.set('checkins');
    // Wait for DOM update then scroll
    setTimeout(() => {
      const section = document.getElementById('checkins-dashboard-section');
      if (section) {
        section.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100);
  }

  // Visualization methods
  getVisualizationImageUrl(): string | null {
    const goal = this.goal();
    return goal?.visualizationImageUrl || null;
  }

  hasVisualization(): boolean {
    return !!this.getVisualizationImageUrl();
  }

  openVisualizationModal(): void {
    if (this.hasVisualization()) {
      this.showVisualizationModal.set(true);
    }
  }

  closeVisualizationModal(): void {
    this.showVisualizationModal.set(false);
  }

  toggleVisionBoardPreview(): void {
    if (!this.hasVisualization()) {
      return;
    }

    if (this.isVisionBoardPreviewVisible()) {
      this.hideVisionBoardPreview();
      return;
    }

    const previewDurationSeconds = 60;
    this.clearVisionBoardPreviewTimers();
    this.isVisionBoardPreviewVisible.set(true);
    this.visionBoardPreviewSecondsLeft.set(previewDurationSeconds);

    this.visionBoardPreviewTimeout = setTimeout(() => {
      this.hideVisionBoardPreview();
    }, previewDurationSeconds * 1000);

    this.visionBoardPreviewCountdownInterval = setInterval(() => {
      const nextSeconds = this.visionBoardPreviewSecondsLeft() - 1;
      if (nextSeconds <= 0) {
        this.hideVisionBoardPreview();
        return;
      }
      this.visionBoardPreviewSecondsLeft.set(nextSeconds);
    }, 1000);
  }

  hideVisionBoardPreview(): void {
    this.clearVisionBoardPreviewTimers();
    this.isVisionBoardPreviewVisible.set(false);
    this.visionBoardPreviewSecondsLeft.set(0);
  }

  private clearVisionBoardPreviewTimers(): void {
    if (this.visionBoardPreviewTimeout) {
      clearTimeout(this.visionBoardPreviewTimeout);
      this.visionBoardPreviewTimeout = undefined;
    }

    if (this.visionBoardPreviewCountdownInterval) {
      clearInterval(this.visionBoardPreviewCountdownInterval);
      this.visionBoardPreviewCountdownInterval = undefined;
    }
  }

  // Check if goal is newly created (within last 2 minutes) and doesn't have visualization
  isVisualizationPending(): boolean {
    const goal = this.goal();
    if (!goal || this.hasVisualization()) return false;

    // Check if goal was created recently (within 2 minutes)
    const startTime = goal.startTime || 0;
    const twoMinutesAgo = Date.now() - 2 * 60 * 1000;
    return startTime > twoMinutesAgo;
  }

  // Start polling for visualization if goal is new
  startVisualizationPolling(goal: RocketGoal): void {
    // Clear any existing polling
    if (this.visualizationPollInterval) {
      clearInterval(this.visualizationPollInterval);
      this.visualizationPollInterval = undefined;
    }

    // If goal already has visualization or is old, don't poll
    if (goal.visualizationImageUrl) return;

    // Check if goal is recent (created within last 2 minutes)
    const startTime = goal.startTime || 0;
    const twoMinutesAgo = Date.now() - 2 * 60 * 1000;
    if (startTime <= twoMinutesAgo) return;

    // Show loading state for new goals
    this.visualizationLoading.set(true);
    console.log('Starting visualization polling for new goal...');

    let pollCount = 0;
    const maxPolls = 24; // Poll for max 2 minutes (every 5 seconds)

    this.visualizationPollInterval = setInterval(async () => {
      pollCount++;
      console.log(`Polling for visualization (${pollCount}/${maxPolls})...`);

      try {
        // Fetch the latest goal data
        const updatedGoal = await this.rocketGoalsService.getRocketGoalById(goal.id);

        if (updatedGoal?.visualizationImageUrl) {
          // Visualization is ready!
          console.log('Visualization ready:', updatedGoal.visualizationImageUrl);
          this.goal.set(updatedGoal as RocketGoal);
          this.visualizationLoading.set(false);

          // Stop polling
          if (this.visualizationPollInterval) {
            clearInterval(this.visualizationPollInterval);
            this.visualizationPollInterval = undefined;
          }
        } else if (pollCount >= maxPolls) {
          // Max polls reached, stop polling
          console.log('Max polls reached, stopping visualization polling');
          this.visualizationLoading.set(false);

          if (this.visualizationPollInterval) {
            clearInterval(this.visualizationPollInterval);
            this.visualizationPollInterval = undefined;
          }
        }
      } catch (error) {
        console.error('Error polling for visualization:', error);
      }
    }, 5000); // Poll every 5 seconds
  }

  // Generate visualization for this goal
  async generateVisualization(): Promise<void> {
    const goal = this.goal();
    if (!goal || this.visualizationLoading()) return;

    this.visualizationLoading.set(true);

    try {
      const result = await this.visualizationService.generateVisualization({
        goalId: goal.id,
        goalDescription: goal.primaryGoal || goal.answers?.['goal_title_label'] || 'Achieve my goal',
        timeframe: goal.answers?.['timeframe'] || 'month',
        hasAccountabilitySupport: goal.answers?.['rocket_quiz']?.hasAccountabilitySupport || 'no'
      });

      if (result.success && result.imageUrl) {
        // Reload the goal to get the updated visualization URL
        await this.loadGoal(goal.id);
        console.log('Visualization generated successfully:', result.imageUrl);
      } else {
        console.error('Failed to generate visualization:', result.message);
        alert('Failed to generate visualization. Please try again.');
      }
    } catch (error) {
      console.error('Error generating visualization:', error);
      alert('An error occurred while generating the visualization.');
    } finally {
      this.visualizationLoading.set(false);
    }
  }

  // Check if current user can generate visualization (owner only)
  canGenerateVisualization(): boolean {
    const goal = this.goal();
    const profile = this.authService.profile();
    // Don't show generate button if visualization is loading/pending
    if (this.visualizationLoading()) return false;
    return !!(goal && profile && goal.userId === profile.userId && !this.hasVisualization());
  }

  // Check if current user can upload visualization (owner only)
  canUploadVisualization(): boolean {
    const goal = this.goal();
    const profile = this.authService.profile();
    return !!(goal && profile && goal.userId === profile.userId && !this.uploadingVisualization());
  }

  // Handle file selection for visualization upload
  onVisualizationImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) {
      return;
    }

    const file = input.files[0];
    
    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image size must be less than 5MB.');
      return;
    }

    this.visualizationImageFile = file;
    this.uploadVisualizationImage();
  }

  // Upload visualization image to Firebase Storage
  async uploadVisualizationImage(): Promise<void> {
    if (!this.visualizationImageFile || !this.storage || !this.goal()) {
      return;
    }

    const goal = this.goal()!;
    const profile = this.authService.profile();
    if (!profile?.userId || goal.userId !== profile.userId) {
      alert('Only the goal owner can upload images.');
      return;
    }

    this.uploadingVisualization.set(true);

    try {
      const storageModule = await import('firebase/storage');
      const fileExtension = this.visualizationImageFile.name.split('.').pop();
      const fileName = `visualization_${Date.now()}.${fileExtension}`;
      const storageRef = storageModule.ref(this.storage, `goal-visualizations/${goal.id}/${fileName}`);
      
      await storageModule.uploadBytes(storageRef, this.visualizationImageFile);
      const downloadURL = await storageModule.getDownloadURL(storageRef);
      
      // Update goal in Firestore
      await this.rocketGoalsService.updateRocketGoal(goal.id, {
        visualizationImageUrl: downloadURL
      });
      
      // Reload goal to get updated data
      await this.loadGoal(goal.id);
      
      // Clear the file reference
      this.visualizationImageFile = null;
      
      console.log('Visualization image uploaded successfully:', downloadURL);
    } catch (error: any) {
      console.error('Error uploading visualization image', error);
      alert('Failed to upload image. Please try again.');
    } finally {
      this.uploadingVisualization.set(false);
    }
  }

  // ============================================
  // Dashboard & Milestone Completion Methods
  // ============================================

  /**
   * Get the dashboard configuration for the current goal's template
   */
  getDashboardConfig(): DashboardConfig | null {
    const goal = this.goal();
    if (!goal) return null;

    // Check if this goal was created from a launchpad template
    const templateId = goal.answers?.['launchpad_template_id'];
    if (!templateId) return null;

    const template = LAUNCHPAD_TEMPLATES[templateId];
    return template?.dashboardConfig || null;
  }

  /**
   * Check if the current goal has dashboard enabled
   */
  hasDashboard(): boolean {
    const config = this.getDashboardConfig();
    return config?.enabled === true;
  }

  /**
   * Get CareerQuest metrics from the goal
   */
  getCareerQuestMetrics(): CareerQuestMetrics {
    const goal = this.goal();
    const defaults: CareerQuestMetrics = {
      applications: 0,
      responses: 0,
      interviews: 0,
      offers: 0,
      networkingContacts: 0,
      followUps: 0
    };

    if (!goal?.dashboardMetrics?.careerQuest) {
      return defaults;
    }

    return { ...defaults, ...goal.dashboardMetrics.careerQuest };
  }

  /**
   * Get a specific metric value by key (for template use)
   */
  getMetricValue(metricKey: string): number {
    const metrics = this.getCareerQuestMetrics();
    return (metrics as unknown as Record<string, number>)[metricKey] || 0;
  }

  /**
   * Calculate response rate percentage
   */
  getResponseRate(): number {
    const metrics = this.getCareerQuestMetrics();
    if (metrics.applications === 0) return 0;
    return Math.round((metrics.responses / metrics.applications) * 100);
  }

  /**
   * Calculate interview rate (interviews from responses)
   */
  getInterviewRate(): number {
    const metrics = this.getCareerQuestMetrics();
    if (metrics.responses === 0) return 0;
    return Math.round((metrics.interviews / metrics.responses) * 100);
  }

  /**
   * Calculate offer rate (offers from interviews)
   */
  getOfferRate(): number {
    const metrics = this.getCareerQuestMetrics();
    if (metrics.interviews === 0) return 0;
    return Math.round((metrics.offers / metrics.interviews) * 100);
  }

  /**
   * Get pipeline data for visualization
   */
  getPipelineData(): Array<{ stage: string; count: number; percentage: number; color: string; icon: string }> {
    const config = this.getDashboardConfig();
    if (!config?.pipelineStages) return [];

    const metrics = this.getCareerQuestMetrics();
    const maxValue = Math.max(
      metrics.applications,
      metrics.responses,
      metrics.interviews,
      metrics.offers,
      1
    );

    return config.pipelineStages.map(stage => {
      const count = (metrics as unknown as Record<string, number>)[stage.key] || 0;
      return {
        stage: stage.label,
        count,
        percentage: Math.round((count / maxValue) * 100),
        color: stage.color,
        icon: stage.icon
      };
    });
  }

  /**
   * Close the milestone completion modal
   */
  closeMilestoneCompleteModal() {
    this.showMilestoneCompleteModal.set(false);
    this.milestoneToComplete.set(null);
  }

  /**
   * Handle milestone completion with outcome data
   */
  async handleMilestoneComplete(data: MilestoneCompletionData) {
    const goal = this.goal();
    const item = this.milestoneToComplete();
    if (!goal?.id || !item) return;

    try {
      // Update the action item with outcome data
      await this.actionItemsService.updateActionItem(goal.id, item.id, {
        completed: true,
        outcome: data.outcome,
        outcomeNotes: data.outcomeNotes || undefined,
        metricType: data.metricType,
        metricValue: data.metricValue
      });

      // Update local state
      this.actionItems.update(items =>
        items.map(i => i.id === item.id ? {
          ...i,
          completed: true,
          outcome: data.outcome,
          outcomeNotes: data.outcomeNotes || undefined,
          metricType: data.metricType,
          metricValue: data.metricValue
        } : i)
      );

      // Update dashboard metrics if a metric was tracked
      if (data.metricType && data.metricValue) {
        await this.updateDashboardMetric(data.metricType, data.metricValue);
      }

      // Update calendar event color to green
      this.updateCalendarEventColorForMilestone(item.title, true);

      this.triggerCelebration();
      this.closeMilestoneCompleteModal();
    } catch (error) {
      console.error('Error completing milestone with outcome:', error);
    }
  }

  /**
   * Handle skip and complete (no outcome tracking)
   */
  async handleMilestoneSkipComplete() {
    const goal = this.goal();
    const item = this.milestoneToComplete();
    if (!goal?.id || !item) return;

    try {
      await this.actionItemsService.toggleActionItemComplete(goal.id, item.id, true);
      this.actionItems.update(items =>
        items.map(i => i.id === item.id ? { ...i, completed: true } : i)
      );

      // Update calendar event color to green
      this.updateCalendarEventColorForMilestone(item.title, true);

      this.triggerCelebration();
      this.closeMilestoneCompleteModal();
    } catch (error) {
      console.error('Error skipping milestone completion:', error);
    }
  }

  /**
   * Update a specific dashboard metric
   */
  async updateDashboardMetric(metricKey: string, incrementValue: number) {
    const goal = this.goal();
    if (!goal?.id) return;

    const currentMetrics = this.getCareerQuestMetrics();
    const currentValue = (currentMetrics as unknown as Record<string, number>)[metricKey] || 0;
    const newMetrics: CareerQuestMetrics = {
      ...currentMetrics,
      [metricKey]: currentValue + incrementValue
    };

    try {
      await this.rocketGoalsService.updateRocketGoal(goal.id, {
        dashboardMetrics: {
          careerQuest: newMetrics
        }
      });

      // Update local goal state
      this.goal.update(g => g ? {
        ...g,
        dashboardMetrics: {
          ...g.dashboardMetrics,
          careerQuest: newMetrics
        }
      } : g);
    } catch (error) {
      console.error('Error updating dashboard metric:', error);
    }
  }

  /**
   * Manually increment a metric from the dashboard
   */
  async incrementMetric(metricKey: string) {
    await this.updateDashboardMetric(metricKey, 1);
  }

  /**
   * Manually decrement a metric from the dashboard (minimum 0)
   */
  async decrementMetric(metricKey: string) {
    const currentValue = this.getMetricValue(metricKey);
    if (currentValue > 0) {
      await this.updateDashboardMetric(metricKey, -1);
    }
  }

  /**
   * Get the total activities count
   */
  getTotalActivities(): number {
    const metrics = this.getCareerQuestMetrics();
    return metrics.applications + metrics.interviews + metrics.networkingContacts + metrics.followUps;
  }

  /**
   * Get success score (weighted calculation)
   */
  getSuccessScore(): number {
    const metrics = this.getCareerQuestMetrics();
    // Weighted score: offers are worth most, then interviews, then responses
    const score = (metrics.offers * 100) + (metrics.interviews * 25) + (metrics.responses * 10) + (metrics.applications * 2);
    return Math.min(score, 1000); // Cap at 1000
  }

  /**
   * Get funnel conversion data for visualization
   */
  getFunnelData(): Array<{ label: string; value: number; percentage: number; color: string }> {
    const metrics = this.getCareerQuestMetrics();
    const stages = [
      { label: 'Applications', value: metrics.applications, color: '#3b82f6' },
      { label: 'Responses', value: metrics.responses, color: '#8b5cf6' },
      { label: 'Interviews', value: metrics.interviews, color: '#f59e0b' },
      { label: 'Offers', value: metrics.offers, color: '#22c55e' }
    ];

    const maxValue = Math.max(...stages.map(s => s.value), 1);
    return stages.map(stage => ({
      ...stage,
      percentage: Math.round((stage.value / maxValue) * 100)
    }));
  }

  /**
   * Get milestone outcome statistics
   */
  getMilestoneOutcomeStats(): { total: number; success: number; partial: number; needsImprovement: number; skipped: number; noOutcome: number } {
    const items = this.actionItems().filter(i => i.completed);
    return {
      total: items.length,
      success: items.filter(i => i.outcome === 'success').length,
      partial: items.filter(i => i.outcome === 'partial').length,
      needsImprovement: items.filter(i => i.outcome === 'needs_improvement').length,
      skipped: items.filter(i => i.outcome === 'skipped').length,
      noOutcome: items.filter(i => !i.outcome).length
    };
  }

  /**
   * Get the default tab based on whether dashboard is available
   */
  getDefaultTab(): 'dashboard' | 'tasks' {
    return this.hasDashboard() ? 'dashboard' : 'tasks';
  }

  // ─────────────────────────────────────────────────────────────────────
  // Telegram Integration
  // ─────────────────────────────────────────────────────────────────────

  /** Generate a deep link and open Telegram for instant connection. */
  async connectTelegram(): Promise<void> {
    this.telegramConnecting.set(true);
    this.telegramError.set(null);
    this.telegramDeepLink.set(null);
    const isMobile = this.isMobileDevice();
    if (!isMobile) {
      this.showTelegramQrModal.set(true);
    }
    try {
      const appModule = await import('firebase/app');
      const functionsModule = await import('firebase/functions');
      const { firebaseConfig } = await import('../../environments/environment');

      const app =
        appModule.getApps().length === 0
          ? appModule.initializeApp(firebaseConfig)
          : appModule.getApp();

      const functions = functionsModule.getFunctions(app, 'us-central1');
      const generateTelegramDeepLink = functionsModule.httpsCallable(functions, 'generateTelegramDeepLink');
      const result = await generateTelegramDeepLink({});
      const data = result.data as { alreadyLinked: boolean; deepLink: string | null };

      if (data.alreadyLinked) {
        this.telegramLinked.set(true);
      }

      const deepLink = data.deepLink || "https://t.me/RocketGoalsBot";
      if (deepLink) {
        this.telegramDeepLink.set(deepLink);
        if (isMobile && data.deepLink) {
          window.location.href = deepLink;
        }
      } else {
        this.telegramError.set('Could not generate Telegram link. Please try again.');
      }
    } catch (err) {
      console.error('Error generating Telegram deep link:', err);
      this.telegramError.set('Could not generate Telegram link. Please try again.');
    } finally {
      this.telegramConnecting.set(false);
    }
  }

  closeTelegramQrModal(): void {
    this.showTelegramQrModal.set(false);
  }

  retryTelegramConnect(): void {
    void this.connectTelegram();
  }

  private isMobileDevice(): boolean {
    const ua = navigator.userAgent || '';
    return /android|iphone|ipad|ipod/i.test(ua);
  }

  /** Check if user has Telegram connected. */
  async loadTelegramStatus(): Promise<void> {
    const profile = this.authService.profile();
    if (!profile?.userId) return;

    // Check from profile first (cached)
    if (profile.telegramId) {
      this.telegramLinked.set(true);
      return;
    }

    this.telegramLoading.set(true);
    try {
      const appModule = await import('firebase/app');
      const functionsModule = await import('firebase/functions');
      const { firebaseConfig } = await import('../../environments/environment');

      const app =
        appModule.getApps().length === 0
          ? appModule.initializeApp(firebaseConfig)
          : appModule.getApp();

      const functions = functionsModule.getFunctions(app, 'us-central1');
      const getTelegramLinkStatus = functionsModule.httpsCallable(functions, 'getTelegramLinkStatus');
      const result = await getTelegramLinkStatus({});
      const data = result.data as { linked: boolean };

      this.telegramLinked.set(!!data?.linked);
    } catch (err) {
      console.error('Error loading Telegram status:', err);
    } finally {
      this.telegramLoading.set(false);
    }
  }

  /** Dismiss the Telegram connect banner. */
  dismissTelegramBanner(): void {
    this.showTelegramBanner.set(false);
    // Remember dismissal for this session
    sessionStorage.setItem('telegramBannerDismissed', 'true');
  }

  /** Check if banner was previously dismissed this session. */
  private checkTelegramBannerDismissed(): void {
    if (sessionStorage.getItem('telegramBannerDismissed') === 'true') {
      this.showTelegramBanner.set(false);
    }
  }
}

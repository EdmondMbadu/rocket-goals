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
import type { RocketGoal } from './models/rocket-goal';
import type { CalendarEvent } from './mission-calendar.component';
import type { CalendarEventData } from './calendar-events.service';
import { ThemeService } from './theme.service';
import { FansService, Fan, FanComment } from './fans.service';
import { VisualizationService } from './visualization.service';

@Component({
  selector: 'app-rocket-goal-view',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, AvatarDropdownComponent, RocketGoalsAIComponent, MissionCalendarComponent, EventModalComponent],
  templateUrl: './rocket-goal-view.component.html',
  styleUrl: './rocket-goal-view.component.css'
})
export class RocketGoalViewComponent implements OnInit, OnDestroy, AfterViewInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private rocketGoalsService = inject(RocketGoalsService);
  private calendarEventsService = inject(CalendarEventsService);
  private actionItemsService = inject(ActionItemsService);
  private fansService = inject(FansService);
  private visualizationService = inject(VisualizationService);
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
  copyLinkSuccess = signal(false);
  emailShareSuccess = signal(false);
  calendarEvents = signal<CalendarEvent[]>([]);
  visualizationLoading = signal(false);
  showVisualizationModal = signal(false);
  selectedEvent = signal<CalendarEvent | null>(null);
  showEventModal = signal(false);
  eventModalDate = signal<Date>(new Date());
  private countdownInterval: any;
  private fanInviteSearchTimeout?: any;
  private visualizationPollInterval?: any;
  private storage: any = null;
  visualizationImageFile: File | null = null;
  uploadingVisualization = signal(false);
  activePrimaryTab = signal<'fans' | 'tasks' | 'calendar'>('fans');
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

  // Action Items state
  actionItems = signal<ActionItem[]>([]);
  loadingActionItems = signal(false);
  editingActionItemId = signal<string | null>(null);
  editingActionItemTitle = signal('');
  newActionItemTitle = signal('');
  newActionItemNotes = signal('');
  showTaskModal = signal(false);
  selectedDayForNewTask = signal<number>(1);
  expandedNoteItemId = signal<string | null>(null);
  editingNoteItemId = signal<string | null>(null);
  editingNoteValue = signal('');
  viewAllTasks = signal(false);
  savingTask = signal(false);
  expandedTimelineTaskId = signal<string | null>(null);

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

    const goalId = this.route.snapshot.paramMap.get('id');
    if (goalId) {
      this.loadGoal(goalId);
    } else {
      this.error.set('Goal ID not found');
      this.loading.set(false);
    }
  }

  ngAfterViewInit() {
    // This lifecycle hook ensures ViewChild is available
  }

  ngOnDestroy() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
    if (this.fanInviteSearchTimeout) {
      clearTimeout(this.fanInviteSearchTimeout);
    }
    if (this.visualizationPollInterval) {
      clearInterval(this.visualizationPollInterval);
    }
  }

  // Get the timeframe duration in days from the goal
  getTimeframeDays(): number {
    const goal = this.goal();
    if (!goal) return 7;

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
    const now = Date.now();
    const elapsed = now - startTime;
    const daysPassed = Math.floor(elapsed / (24 * 60 * 60 * 1000)) + 1;

    return Math.min(daysPassed, this.getTimeframeDays());
  }

  // Get progress percentage for the timeline
  getTimelineProgress(): number {
    const currentDay = this.getCurrentMissionDay();
    const totalDays = this.getTimeframeDays();
    return Math.min((currentDay / totalDays) * 100, 100);
  }

  // Get timeframe display text
  getTimeframeDisplay(): string {
    const days = this.getTimeframeDays();
    if (days <= 7) return '7-DAY SPRINT';
    if (days <= 30) return '30-DAY JOURNEY';
    return '6-MONTH TRANSFORMATION';
  }

  startCountdown() {
    if (this.countdownInterval) clearInterval(this.countdownInterval);

    const goal = this.goal();
    if (!goal) return;

    // Use startTime from goal, or default to now if not set
    const startTime = goal.startTime || Date.now();
    const timeframeDays = this.getTimeframeDays();
    const challengeDuration = timeframeDays * 24 * 60 * 60 * 1000; // Duration in milliseconds
    const endTime = startTime + challengeDuration;

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

      this.countdown.set(
        `${days.toString().padStart(2, '0')}:${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    };

    // Update immediately
    updateCountdown();

    // Update every second
    this.countdownInterval = setInterval(updateCountdown, 1000);
  }

  async loadGoal(goalId: string) {
    this.loading.set(true);
    this.error.set(null);
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
      }
      
      // Load calendar events and action items
      if (currentGoal?.id) {
        await this.loadCalendarEvents(currentGoal.id);
        await this.loadActionItems(currentGoal.id);
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
    return goal.answers['goal_title_label'] || goal.answers['custom_goal_title'] || goal.primaryGoal || 'Your 7-Day Mission';
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

  toggleShareDropdown() {
    this.showShareDropdown.set(!this.showShareDropdown());
  }

  closeShareDropdown() {
    this.showShareDropdown.set(false);
  }

  async copyLink() {
    const url = window.location.href;
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
      // Build absolute URL with the goal ID
      const baseUrl = window.location.origin;
      return `${baseUrl}/rocketgoal/${goal.id}`;
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
      const events = eventsData.map(eventData => this.calendarEventsService.toCalendarEvent(eventData));
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

  selectPrimaryTab(tab: 'fans' | 'tasks' | 'calendar') {
    this.activePrimaryTab.set(tab);
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
      this.fans.set(fans);
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

  // Action Items Methods
  async loadActionItems(goalId: string) {
    this.loadingActionItems.set(true);
    try {
      const items = await this.actionItemsService.getActionItemsByGoalId(goalId);
      this.actionItems.set(items);
    } catch (error) {
      console.error('Error loading action items:', error);
    } finally {
      this.loadingActionItems.set(false);
    }
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

    try {
      await this.actionItemsService.toggleActionItemComplete(goal.id, item.id, !item.completed);
      // Update local state
      this.actionItems.update(items =>
        items.map(i => i.id === item.id ? { ...i, completed: !i.completed } : i)
      );
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
    } catch (error) {
      console.error('Error deleting action item:', error);
    }
  }

  openAddActionItem() {
    this.showTaskModal.set(true);
    this.newActionItemTitle.set('');
    this.newActionItemNotes.set('');
    this.selectedDayForNewTask.set(this.getCurrentMissionDay());
  }

  closeTaskModal() {
    this.showTaskModal.set(false);
    this.newActionItemTitle.set('');
    this.newActionItemNotes.set('');
  }

  async addNewActionItem() {
    const goal = this.goal();
    if (!goal?.id) return;

    const title = this.newActionItemTitle().trim();
    if (!title) return;

    this.savingTask.set(true);

    const selectedDay = this.selectedDayForNewTask();
    const notes = this.newActionItemNotes().trim();
    const existingItems = this.getActionItemsForDay(selectedDay);
    const nextOrder = existingItems.length > 0 ? Math.max(...existingItems.map(i => i.order)) + 1 : 0;

    try {
      const newId = await this.actionItemsService.createActionItem({
        goalId: goal.id,
        title,
        notes: notes || undefined,
        dayNumber: selectedDay,
        completed: false,
        order: nextOrder
      });

      // Update local state
      const newItem: ActionItem = {
        id: newId,
        goalId: goal.id,
        title,
        notes: notes || undefined,
        dayNumber: selectedDay,
        completed: false,
        order: nextOrder,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      this.actionItems.update(items => [...items, newItem]);
      this.closeTaskModal();
    } catch (error) {
      console.error('Error adding action item:', error);
    } finally {
      this.savingTask.set(false);
    }
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
  }

  // Get tasks to display based on view mode
  getDisplayedTasks(): ActionItem[] {
    if (this.viewAllTasks()) {
      return this.actionItems();
    }
    return this.getActionItemsForCurrentDay();
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
    this.selectedDayForNewTask.set(day);
    this.showTaskModal.set(true);
    this.newActionItemTitle.set('');
    this.newActionItemNotes.set('');
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
}

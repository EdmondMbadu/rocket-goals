import { Component, inject, OnInit, OnDestroy, signal, HostListener, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { RocketGoalsService } from './rocket-goals.service';
import { AuthService } from './auth.service';
import { AvatarDropdownComponent } from './avatar-dropdown.component';
import { RocketGoalsAIComponent } from './rocket-goals-ai.component';
import type { RocketGoal } from './models/rocket-goal';

@Component({
  selector: 'app-rocket-goal-view',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, AvatarDropdownComponent, RocketGoalsAIComponent],
  templateUrl: './rocket-goal-view.component.html',
  styleUrl: './rocket-goal-view.component.css'
})
export class RocketGoalViewComponent implements OnInit, OnDestroy, AfterViewInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private rocketGoalsService = inject(RocketGoalsService);
  authService = inject(AuthService); // Make public for template access

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
  private countdownInterval: any;

  ngOnInit() {
    // Load custom dashboard title from localStorage
    const savedTitle = localStorage.getItem('dashboardTitle');
    if (savedTitle) {
      this.dashboardTitle.set(savedTitle);
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
  }

  startCountdown() {
    if (this.countdownInterval) clearInterval(this.countdownInterval);

    const goal = this.goal();
    if (!goal) return;

    // Use startTime from goal, or default to now if not set
    const startTime = goal.startTime || Date.now();
    const challengeDuration = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
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

  shareOnTwitter() {
    const goal = this.goal();
    if (!goal) return;
    
    const url = encodeURIComponent(window.location.href);
    const title = encodeURIComponent(this.getGoalTitleDisplay());
    const text = encodeURIComponent(`Check out my Rocket Goal: ${title}`);
    const twitterUrl = `https://twitter.com/intent/tweet?url=${url}&text=${text}`;
    window.open(twitterUrl, '_blank', 'width=550,height=420');
    this.closeShareDropdown();
  }

  shareOnFacebook() {
    const url = encodeURIComponent(window.location.href);
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}`;
    window.open(facebookUrl, '_blank', 'width=550,height=420');
    this.closeShareDropdown();
  }

  shareOnLinkedIn() {
    const url = encodeURIComponent(window.location.href);
    const title = encodeURIComponent(this.getGoalTitleDisplay());
    const summary = encodeURIComponent(`Check out my Rocket Goal: ${title}`);
    const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${url}`;
    window.open(linkedInUrl, '_blank', 'width=550,height=420');
    this.closeShareDropdown();
  }

  shareOnWhatsApp() {
    const url = encodeURIComponent(window.location.href);
    const text = encodeURIComponent(`Check out my Rocket Goal: ${this.getGoalTitleDisplay()}`);
    const whatsappUrl = `https://wa.me/?text=${text}%20${url}`;
    window.open(whatsappUrl, '_blank');
    this.closeShareDropdown();
  }

  shareViaEmail() {
    const goal = this.goal();
    if (!goal) return;
    
    const url = window.location.href;
    const title = this.getGoalTitleDisplay();
    const subject = encodeURIComponent(`Check out my Rocket Goal: ${title}`);
    const body = encodeURIComponent(`I wanted to share my Rocket Goal with you:\n\n${title}\n\nView it here: ${url}`);
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
}


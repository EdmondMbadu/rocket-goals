import { Component, inject, OnInit, OnDestroy, signal, HostListener, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { RocketGoalsService } from './rocket-goals.service';
import { AuthService } from './auth.service';
import type { RocketGoal } from './models/rocket-goal';

@Component({
  selector: 'app-rocket-goal-view',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './rocket-goal-view.component.html',
  styleUrl: './rocket-goal-view.component.css'
})
export class RocketGoalViewComponent implements OnInit, OnDestroy, AfterViewInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private rocketGoalsService = inject(RocketGoalsService);
  private authService = inject(AuthService);

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
  userGoals = signal<any[]>([]);
  loadingGoals = signal(false);
  countdown = signal('23:59:59');
  private countdownInterval: any;

  ngOnInit() {
    // Load custom dashboard title from localStorage
    const savedTitle = localStorage.getItem('dashboardTitle');
    if (savedTitle) {
      this.dashboardTitle.set(savedTitle);
    }

    // Start countdown timer
    this.startCountdown();

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

    // Set target time to 24 hours from now (or just a fixed countdown)
    let totalSeconds = 24 * 60 * 60; // 24 hours

    this.countdownInterval = setInterval(() => {
      totalSeconds--;
      if (totalSeconds < 0) totalSeconds = 24 * 60 * 60;

      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      this.countdown.set(
        `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
      );
    }, 1000);
  }

  async loadGoal(goalId: string) {
    this.loading.set(true);
    this.error.set(null);
    try {
      const goal = await this.rocketGoalsService.getRocketGoalById(goalId);
      if (goal) {
        this.goal.set(goal as RocketGoal);
        // Load user goals for dropdown
        if (goal.userId) {
          this.loadUserGoals(goal.userId);
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
    // TODO: Navigate to profile page when created
    this.closeAvatarDropdown();
  }

  async handleLogout() {
    try {
      await this.authService.signOut();
      this.router.navigateByUrl('/login');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.avatar-dropdown-container')) {
      this.closeAvatarDropdown();
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
    return goal.participant.firstName || 'Commander';
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


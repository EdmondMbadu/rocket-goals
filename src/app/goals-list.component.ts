import { Component, inject, OnInit, signal, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { RocketGoalsService } from './rocket-goals.service';
import { AuthService } from './auth.service';
import type { RocketGoal } from './models/rocket-goal';

@Component({
  selector: 'app-goals-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './goals-list.component.html',
  styleUrl: './goals-list.component.css'
})
export class GoalsListComponent implements OnInit {
  private router = inject(Router);
  private rocketGoalsService = inject(RocketGoalsService);
  private authService = inject(AuthService);

  goals = signal<RocketGoal[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  showAvatarDropdown = signal(false);
  dashboardTitle = signal<string>('MISSION CONTROL');
  isEditingTitle = signal(false);
  editingTitleValue = signal<string>('');

  ngOnInit() {
    // Load custom dashboard title from localStorage
    const savedTitle = localStorage.getItem('dashboardTitle');
    if (savedTitle) {
      this.dashboardTitle.set(savedTitle);
    }

    this.loadGoals();
  }

  async loadGoals() {
    const profile = this.authService.profile();
    if (!profile?.userId) {
      this.error.set('Please log in to view your goals');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    try {
      const goals = await this.rocketGoalsService.getRocketGoalsByUserId(profile.userId);
      this.goals.set(goals as RocketGoal[]);
    } catch (err) {
      console.error('Error loading goals:', err);
      this.error.set('Failed to load goals');
    } finally {
      this.loading.set(false);
    }
  }

  getGoalTitle(goal: RocketGoal): string {
    return goal.answers['goal_title_label'] || goal.answers['custom_goal_title'] || goal.primaryGoal || 'Untitled Goal';
  }

  getGoalTheme(goal: RocketGoal): string {
    return goal.answers['goal_theme_label'] || 'Personal Growth';
  }

  getGoalStatus(goal: RocketGoal): string {
    return goal.status || 'active';
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

  goHome() {
    this.router.navigateByUrl('/');
  }

  startChallenge() {
    // Navigate to home page with query param to auto-start challenge
    this.router.navigateByUrl('/?startChallenge=true');
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.avatar-dropdown-container')) {
      this.closeAvatarDropdown();
    }
  }
}


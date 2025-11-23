import { Component, inject, OnInit, signal, HostListener, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
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
export class GoalsListComponent implements OnInit, AfterViewInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private rocketGoalsService = inject(RocketGoalsService);
  // Expose authService for template access
  authService = inject(AuthService);

  goals = signal<RocketGoal[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  showAvatarDropdown = signal(false);
  dashboardTitle = signal<string>('MISSION CONTROL');
  isEditingTitle = signal(false);
  editingTitleValue = signal<string>('');
  workOnTitle = signal<string>('Work on Life Balance');

  ngOnInit() {
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
    this.waitForAuthAndLoadGoals();
  }

  ngAfterViewInit() {
    // Check for startChallenge query param immediately and on changes
    // This handles the case where we navigate to the same route with different query params
    const checkParams = () => {
      const params = this.route.snapshot.queryParams;
      if (params['startChallenge'] === 'true') {
        // Dispatch a custom event that the app component can listen to
        // This handles same-route navigation where NavigationEnd might not fire
        window.dispatchEvent(new CustomEvent('startChallenge', { detail: { source: 'goals-list' } }));
      }
    };
    
    // Check immediately
    checkParams();
    
    // Also subscribe to changes
    this.route.queryParams.subscribe(params => {
      if (params['startChallenge'] === 'true') {
        window.dispatchEvent(new CustomEvent('startChallenge', { detail: { source: 'goals-list' } }));
      }
    });
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
      this.error.set('Please log in to view your goals');
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    try {
      console.log('Loading goals for userId:', profile.userId);
      const goals = await this.rocketGoalsService.getRocketGoalsByUserId(profile.userId);
      console.log('Loaded goals:', goals);
      this.goals.set(goals as RocketGoal[]);
      if (goals.length === 0) {
        console.log('No goals found for user - showing empty state');
      }
    } catch (err) {
      console.error('Error loading goals:', err);
      this.error.set('Failed to load goals. Please try again.');
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
    this.router.navigateByUrl('/goals');
  }

  startChallenge() {
    console.log('startChallenge called in goals-list component');
    // Navigate to goals page with query param to auto-start challenge
    // Use navigate instead of navigateByUrl to ensure NavigationEnd event fires
    this.router.navigate(['/goals'], { queryParams: { startChallenge: 'true' } }).then(() => {
      console.log('Navigation completed, checking for startChallenge param');
      // Also dispatch event immediately after navigation
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('startChallenge', { detail: { source: 'goals-list-navigate' } }));
      }, 50);
    });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.avatar-dropdown-container')) {
      this.closeAvatarDropdown();
    }
  }
}


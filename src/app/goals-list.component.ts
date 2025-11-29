import { Component, inject, OnInit, signal, HostListener, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute, NavigationEnd } from '@angular/router';
import { RocketGoalsService } from './rocket-goals.service';
import { AuthService } from './auth.service';
import { RocketGoalsAIComponent } from './rocket-goals-ai.component';
import type { RocketGoal } from './models/rocket-goal';
import { filter } from 'rxjs/operators';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-goals-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, RocketGoalsAIComponent],
  templateUrl: './goals-list.component.html',
  styleUrl: './goals-list.component.css'
})
export class GoalsListComponent implements OnInit, AfterViewInit, OnDestroy {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private rocketGoalsService = inject(RocketGoalsService);
  // Expose authService for template access
  authService = inject(AuthService);
  private routerSubscription?: Subscription;

  goals = signal<RocketGoal[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  showAvatarDropdown = signal(false);
  dashboardTitle = signal<string>('MISSION CONTROL');
  isEditingTitle = signal(false);
  editingTitleValue = signal<string>('');
  workOnTitle = signal<string>('Work on Life Balance');
  isEditingWorkOnTitle = signal(false);
  editingWorkOnTitleValue = signal<string>('');

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
      if (params['refresh'] === 'true') {
        // Reload goals when refresh param is present
        this.loadGoals();
        // Remove the refresh param from URL
        this.router.navigate(['/goals'], { replaceUrl: true, queryParams: {} });
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

  editGoal(goalId: string) {
    // Navigate to landing page with editGoal query param
    // The app component will handle pre-filling the challenge with goal data
    this.router.navigate(['/'], { queryParams: { editGoal: goalId } });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.avatar-dropdown-container')) {
      this.closeAvatarDropdown();
    }
  }
}


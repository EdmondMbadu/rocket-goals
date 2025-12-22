import { Component, inject, signal, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { RocketGoalsService } from './rocket-goals.service';

@Component({
  selector: 'app-avatar-dropdown',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './avatar-dropdown.component.html',
  styleUrl: './avatar-dropdown.component.css'
})
export class AvatarDropdownComponent implements OnInit {
  private authService = inject(AuthService);
  private router = inject(Router);
  private rocketGoalsService = inject(RocketGoalsService);

  showDropdown = signal(false);
  userGoals = signal<any[]>([]);
  loadingGoals = signal(false);
  billingLoading = signal(false);

  ngOnInit() {
    // Load goals when component initializes if user is logged in
    const profile = this.authService.profile();
    if (profile?.userId && this.userGoals().length === 0) {
      this.loadUserGoals();
    }
  }

  toggleDropdown() {
    this.showDropdown.set(!this.showDropdown());
    // Load goals when opening dropdown
    if (this.showDropdown() && this.userGoals().length === 0) {
      this.loadUserGoals();
    }
  }

  closeDropdown() {
    this.showDropdown.set(false);
  }

  async loadUserGoals() {
    const profile = this.authService.profile();
    if (!profile?.userId) return;

    this.loadingGoals.set(true);
    try {
      const goals = await this.rocketGoalsService.getRocketGoalsByUserId(profile.userId);
      this.userGoals.set(goals);
    } catch (err) {
      console.error('Error loading user goals:', err);
    } finally {
      this.loadingGoals.set(false);
    }
  }

  navigateToGoal(goalId: string) {
    this.router.navigateByUrl(`/rocketgoal/${goalId}`);
    this.closeDropdown();
  }

  navigateToProfile() {
    this.router.navigateByUrl('/profile');
    this.closeDropdown();
  }

  navigateToHome() {
    this.router.navigateByUrl('/goals');
    this.closeDropdown();
  }

  navigateToAI() {
    this.router.navigateByUrl('/ai');
    this.closeDropdown();
  }

  navigateToAdmin() {
    this.router.navigateByUrl('/admin');
    this.closeDropdown();
  }

  isAdmin(): boolean {
    const profile = this.authService.profile();
    return profile?.role === 'admin' || profile?.admin === true;
  }

  hasSubscription(): boolean {
    const profile = this.authService.profile();
    const status = profile?.subscriptionStatus;
    return status === 'active' || status === 'canceling' || status === 'past_due';
  }

  getSubscriptionPlan(): string | null {
    const profile = this.authService.profile();
    return profile?.subscriptionPlan || null;
  }

  getSubscriptionPlanDisplay(): string {
    const plan = this.getSubscriptionPlan();
    if (!plan) return '';
    const planNames: Record<string, string> = {
      'moonshot': 'Moonshot',
      'interplanetary': 'Interplanetary',
      'galactic': 'Galactic'
    };
    return planNames[plan] || plan;
  }

  getPlanBadgeClass(): string {
    const plan = this.getSubscriptionPlan();
    switch (plan) {
      case 'moonshot': return 'bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-300';
      case 'interplanetary': return 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-300';
      case 'galactic': return 'bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-300';
      default: return 'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300';
    }
  }

  async openBillingPortal() {
    this.billingLoading.set(true);

    try {
      const appModule = await import('firebase/app');
      const functionsModule = await import('firebase/functions');
      const { firebaseConfig } = await import('../../environments/environment');

      const app = appModule.getApps().length === 0
        ? appModule.initializeApp(firebaseConfig)
        : appModule.getApp();

      const functions = functionsModule.getFunctions(app, 'us-central1');
      const createBillingPortalSession = functionsModule.httpsCallable(functions, 'createBillingPortalSession');

      const result = await createBillingPortalSession({
        returnUrl: window.location.href
      });

      const data = result.data as { url?: string };

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      console.error('Error opening billing portal:', err);
      alert('Failed to open billing portal. Please try again.');
    } finally {
      this.billingLoading.set(false);
      this.closeDropdown();
    }
  }

  navigateToPricing() {
    this.router.navigateByUrl('/pricing');
    this.closeDropdown();
  }

  async handleLogout() {
    try {
      await this.authService.signOut();
      this.router.navigateByUrl('/');
    } catch (error) {
      console.error('Error logging out:', error);
    }
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

  getUserDisplayName(): string {
    const profile = this.authService.profile();
    if (!profile) return 'User';
    return `${profile.firstName} ${profile.lastName}`.trim() || profile.firstName || 'User';
  }

  getUserEmail(): string {
    const profile = this.authService.profile();
    return profile?.email || '';
  }

  getUserInitial(): string {
    const profile = this.authService.profile();
    if (!profile) return 'U';
    const firstName = profile.firstName || '';
    return firstName.charAt(0).toUpperCase() || 'U';
  }

  getProfilePictureUrl(): string | undefined {
    return this.authService.profile()?.profilePictureUrl;
  }

  getGoalTitle(goal: any): string {
    return goal.answers?.goal_title_label || goal.answers?.custom_goal_title || goal.primaryGoal || 'Untitled Goal';
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.avatar-dropdown-container')) {
      this.closeDropdown();
    }
  }
}



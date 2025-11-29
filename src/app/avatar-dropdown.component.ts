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



import { Component, inject, signal, OnInit, OnDestroy, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from './auth.service';
import { UserProfile } from './models/user-profile';
import { RocketGoalsService } from './rocket-goals.service';
import type { RocketGoal } from './models/rocket-goal';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css'
})
export class ProfileComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  router = inject(Router);
  private rocketGoalsService = inject(RocketGoalsService);
  private storage: any = null;
  
  profile = signal<UserProfile | null>(null);
  loading = signal(false);
  uploading = signal(false);
  uploadingHeader = signal(false);
  error = signal<string | null>(null);
  success = signal<string | null>(null);
  
  editingName = signal(false);
  firstName = signal('');
  lastName = signal('');
  
  profileImageFile: File | null = null;
  headerImageFile: File | null = null;
  profileImagePreview = signal<string | null>(null);
  headerImagePreview = signal<string | null>(null);
  
  // Goals
  goals = signal<RocketGoal[]>([]);
  loadingGoals = signal(false);
  editingGoalId = signal<string | null>(null);
  editingGoalTitle = signal<string>('');

  async ngOnInit() {
    // Wait a bit for auth to initialize
    let profile = this.authService.profile();
    if (!profile) {
      // Try waiting a bit for profile to load
      await new Promise(resolve => setTimeout(resolve, 100));
      profile = this.authService.profile();
    }
    
    if (!profile) {
      this.router.navigate(['/login']);
      return;
    }
    
    this.profile.set(profile);
    this.firstName.set(profile.firstName);
    this.lastName.set(profile.lastName);
    
    // Set profile image - check both preview and profile
    const profileImageUrl = profile.profilePictureUrl;
    if (profileImageUrl) {
      console.log('Setting profile image URL:', profileImageUrl);
      this.profileImagePreview.set(profileImageUrl);
    }
    
    if (profile.headerImageUrl) {
      this.headerImagePreview.set(profile.headerImageUrl);
    }
    
    await this.initStorage();
    await this.loadGoals();
    
    // Watch for profile changes
    const checkProfile = () => {
      const currentProfile = this.authService.profile();
      if (currentProfile && currentProfile.userId === profile.userId) {
        this.profile.set(currentProfile);
        if (currentProfile.profilePictureUrl && currentProfile.profilePictureUrl !== this.profileImagePreview()) {
          console.log('Profile image updated:', currentProfile.profilePictureUrl);
          this.profileImagePreview.set(currentProfile.profilePictureUrl);
        }
        if (currentProfile.headerImageUrl && currentProfile.headerImageUrl !== this.headerImagePreview()) {
          this.headerImagePreview.set(currentProfile.headerImageUrl);
        }
      }
    };
    
    // Check periodically for profile updates
    setInterval(checkProfile, 2000);
  }

  ngOnDestroy() {
    // Clean up preview URLs (only blob URLs need to be revoked)
    const profilePreview = this.profileImagePreview();
    if (profilePreview && profilePreview.startsWith('blob:')) {
      URL.revokeObjectURL(profilePreview);
    }
    const headerPreview = this.headerImagePreview();
    if (headerPreview && headerPreview.startsWith('blob:')) {
      URL.revokeObjectURL(headerPreview);
    }
  }

  private async initStorage() {
    try {
      const appModule = await import('firebase/app');
      const storageModule = await import('firebase/storage');
      const { firebaseConfig } = await import('../../environments/environment');
      
      const app = appModule.getApps().length === 0
        ? appModule.initializeApp(firebaseConfig)
        : appModule.getApp();
      
      this.storage = storageModule.getStorage(app);
    } catch (error) {
      console.error('Failed to initialize storage', error);
      this.error.set('Failed to initialize image upload. Please refresh the page.');
    }
  }

  onProfileImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      if (file.size > 5 * 1024 * 1024) {
        this.error.set('Profile image must be less than 5MB');
        setTimeout(() => this.error.set(null), 5000);
        return;
      }
      if (!file.type.startsWith('image/')) {
        this.error.set('Please select an image file');
        setTimeout(() => this.error.set(null), 5000);
        return;
      }
      // Clean up old preview URL if it was a blob URL
      const oldPreview = this.profileImagePreview();
      if (oldPreview && oldPreview.startsWith('blob:')) {
        URL.revokeObjectURL(oldPreview);
      }
      this.profileImageFile = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        this.profileImagePreview.set(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  onHeaderImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      if (file.size > 10 * 1024 * 1024) {
        this.error.set('Header image must be less than 10MB');
        setTimeout(() => this.error.set(null), 5000);
        return;
      }
      if (!file.type.startsWith('image/')) {
        this.error.set('Please select an image file');
        setTimeout(() => this.error.set(null), 5000);
        return;
      }
      // Clean up old preview URL if it was a blob URL
      const oldPreview = this.headerImagePreview();
      if (oldPreview && oldPreview.startsWith('blob:')) {
        URL.revokeObjectURL(oldPreview);
      }
      this.headerImageFile = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        this.headerImagePreview.set(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  async uploadProfileImage() {
    if (!this.profileImageFile || !this.storage || !this.profile()) {
      return;
    }

    this.uploading.set(true);
    this.error.set(null);
    this.success.set(null);

    try {
      const storageModule = await import('firebase/storage');
      const userId = this.profile()!.userId;
      const fileExtension = this.profileImageFile.name.split('.').pop();
      const fileName = `profile-${Date.now()}.${fileExtension}`;
      const storageRef = storageModule.ref(this.storage, `userProfiles/${userId}/${fileName}`);
      
      await storageModule.uploadBytes(storageRef, this.profileImageFile);
      const downloadURL = await storageModule.getDownloadURL(storageRef);
      
      await this.updateProfile({ profilePictureUrl: downloadURL });
      this.profileImageFile = null;
      // Update preview to show the uploaded image
      this.profileImagePreview.set(downloadURL);
      this.success.set('Profile image updated successfully!');
      setTimeout(() => this.success.set(null), 5000);
    } catch (error: any) {
      console.error('Error uploading profile image', error);
      this.error.set('Failed to upload profile image. Please try again.');
    } finally {
      this.uploading.set(false);
    }
  }

  async uploadHeaderImage() {
    if (!this.headerImageFile || !this.storage || !this.profile()) {
      return;
    }

    this.uploadingHeader.set(true);
    this.error.set(null);
    this.success.set(null);

    try {
      const storageModule = await import('firebase/storage');
      const userId = this.profile()!.userId;
      const fileExtension = this.headerImageFile.name.split('.').pop();
      const fileName = `header-${Date.now()}.${fileExtension}`;
      const storageRef = storageModule.ref(this.storage, `userProfiles/${userId}/${fileName}`);
      
      await storageModule.uploadBytes(storageRef, this.headerImageFile);
      const downloadURL = await storageModule.getDownloadURL(storageRef);
      
      await this.updateProfile({ headerImageUrl: downloadURL });
      this.headerImageFile = null;
      // Update preview to show the uploaded image
      this.headerImagePreview.set(downloadURL);
      this.success.set('Header image updated successfully!');
      setTimeout(() => this.success.set(null), 5000);
    } catch (error: any) {
      console.error('Error uploading header image', error);
      this.error.set('Failed to upload header image. Please try again.');
    } finally {
      this.uploadingHeader.set(false);
    }
  }

  startEditingName() {
    this.editingName.set(true);
  }

  cancelEditingName() {
    this.editingName.set(false);
    const profile = this.profile();
    if (profile) {
      this.firstName.set(profile.firstName);
      this.lastName.set(profile.lastName);
    }
  }

  async saveName() {
    const firstName = this.firstName().trim();
    const lastName = this.lastName().trim();
    
    if (!firstName) {
      this.error.set('First name is required');
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.success.set(null);

    try {
      await this.updateProfile({ firstName, lastName });
      this.editingName.set(false);
      this.success.set('Name updated successfully!');
      setTimeout(() => this.success.set(null), 5000);
    } catch (error: any) {
      console.error('Error updating name', error);
      this.error.set('Failed to update name. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  private async updateProfile(updates: Partial<UserProfile>) {
    const updatedProfile = await this.authService.updateUserProfile(updates);
    this.profile.set(updatedProfile);
  }

  private async ensureFirebase() {
    const appModule = await import('firebase/app');
    const firestoreModule = await import('firebase/firestore');
    const { firebaseConfig } = await import('../../environments/environment');
    
    const app = appModule.getApps().length === 0
      ? appModule.initializeApp(firebaseConfig)
      : appModule.getApp();
    
    const firestore = firestoreModule.getFirestore(app);
    return { firestore };
  }

  getDisplayName(): string {
    const profile = this.profile();
    if (!profile) return '';
    return `${profile.firstName} ${profile.lastName}`.trim();
  }

  getInitials(): string {
    const profile = this.profile();
    if (!profile) return '';
    const first = profile.firstName.charAt(0).toUpperCase();
    const last = profile.lastName.charAt(0).toUpperCase();
    return first + last;
  }

  getFormattedCreatedDate(): string {
    const profile = this.profile();
    if (!profile?.createdAt) return 'Recently';
    try {
      const date = profile.createdAt as any;
      // Handle Firestore Timestamp
      if (date && typeof date.toDate === 'function') {
        return date.toDate().toLocaleDateString();
      }
      // Handle regular date string or number
      if (typeof date === 'string' || typeof date === 'number') {
        return new Date(date).toLocaleDateString();
      }
      return 'Recently';
    } catch (error) {
      return 'Recently';
    }
  }

  async loadGoals() {
    const profile = this.profile();
    if (!profile?.userId) return;

    this.loadingGoals.set(true);
    try {
      const goals = await this.rocketGoalsService.getRocketGoalsByUserId(profile.userId);
      this.goals.set(goals as RocketGoal[]);
    } catch (err) {
      console.error('Error loading goals:', err);
    } finally {
      this.loadingGoals.set(false);
    }
  }

  getActiveGoalsCount(): number {
    return this.goals().filter(g => !g.status || g.status === 'active').length;
  }

  getCompletedGoalsCount(): number {
    return this.goals().filter(g => g.status === 'completed').length;
  }

  getGoalTitle(goal: RocketGoal): string {
    return goal.answers?.['goal_title_label'] || goal.answers?.['custom_goal_title'] || goal.primaryGoal || 'Untitled Goal';
  }

  getGoalTheme(goal: RocketGoal): string {
    return goal.answers?.['goal_theme_label'] || 'Personal Growth';
  }

  startEditingGoal(goal: RocketGoal) {
    this.editingGoalId.set(goal.id);
    this.editingGoalTitle.set(this.getGoalTitle(goal));
    // Focus the input after Angular updates
    setTimeout(() => {
      const input = document.querySelector(`input[ng-reflect-model="${this.getGoalTitle(goal)}"]`) as HTMLInputElement;
      if (input) {
        input.focus();
        input.select();
      }
    }, 0);
  }

  cancelEditingGoal() {
    this.editingGoalId.set(null);
    this.editingGoalTitle.set('');
  }

  async saveGoalTitle(goalId: string) {
    const newTitle = this.editingGoalTitle().trim();
    if (!newTitle) {
      this.error.set('Goal title cannot be empty');
      setTimeout(() => this.error.set(null), 3000);
      return;
    }

    try {
      const goal = this.goals().find(g => g.id === goalId);
      if (!goal) return;

      // Update the goal with new title
      const updates: any = {
        answers: {
          ...goal.answers,
          custom_goal_title: newTitle
        }
      };
      
      await this.rocketGoalsService.updateRocketGoal(goalId, updates);
      
      // Update local state
      const updatedGoals = this.goals().map(g => 
        g.id === goalId 
          ? { ...g, answers: { ...g.answers, custom_goal_title: newTitle } }
          : g
      );
      this.goals.set(updatedGoals);
      
      this.editingGoalId.set(null);
      this.editingGoalTitle.set('');
      this.success.set('Goal title updated!');
      setTimeout(() => this.success.set(null), 3000);
    } catch (error: any) {
      console.error('Error updating goal:', error);
      this.error.set('Failed to update goal title');
      setTimeout(() => this.error.set(null), 3000);
    }
  }

  navigateToGoal(goalId: string) {
    this.router.navigateByUrl(`/rocketgoal/${goalId}`);
  }

  async deleteGoal(goalId: string) {
    if (!confirm('Are you sure you want to delete this goal?')) {
      return;
    }

    try {
      await this.rocketGoalsService.deleteRocketGoal(goalId);
      const updatedGoals = this.goals().filter(g => g.id !== goalId);
      this.goals.set(updatedGoals);
      this.success.set('Goal deleted successfully');
      setTimeout(() => this.success.set(null), 3000);
    } catch (error: any) {
      console.error('Error deleting goal:', error);
      this.error.set('Failed to delete goal');
      setTimeout(() => this.error.set(null), 3000);
    }
  }

  onProfileImageError(event: Event) {
    const img = event.target as HTMLImageElement;
    console.error('Profile image failed to load:', img.src);
    if (img) {
      img.style.display = 'none';
      const fallback = img.parentElement?.querySelector('.profile-initials') as HTMLElement;
      if (fallback) {
        fallback.style.display = 'flex';
      }
      // Clear the preview if it's the same URL
      if (this.profileImagePreview() === img.src) {
        this.profileImagePreview.set(null);
      }
    }
  }
}


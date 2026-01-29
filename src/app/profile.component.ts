import { Component, inject, signal, OnInit, OnDestroy, HostListener, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from './auth.service';
import { UserProfile } from './models/user-profile';
import { RocketGoalsService } from './rocket-goals.service';
import { AvatarDropdownComponent } from './avatar-dropdown.component';
import type { RocketGoal } from './models/rocket-goal';
import { ThemeService } from './theme.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AvatarDropdownComponent],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css'
})
export class ProfileComponent implements OnInit, OnDestroy {
  authService = inject(AuthService);
  router = inject(Router);
  private rocketGoalsService = inject(RocketGoalsService);
  protected theme = inject(ThemeService);
  private cdr = inject(ChangeDetectorRef);
  private storage: any = null;
  
  profile = signal<UserProfile | null>(null);
  loading = signal(false);
  uploading = signal(false);
  uploadingHeader = signal(false);
  error = signal<string | null>(null);
  success = signal<string | null>(null);
  
  
  profileImageFile: File | null = null;
  headerImageFile: File | null = null;
  rocketGoalPhotoFile: File | null = null;
  profileImagePreview = signal<string | null>(null);
  headerImagePreview = signal<string | null>(null);
  rocketGoalPhotoPreview = signal<string | null>(null);
  uploadingRocketGoalPhoto = signal(false);
  
  // Goals
  goals = signal<RocketGoal[]>([]);
  loadingGoals = signal(false);
  editingGoalId = signal<string | null>(null);
  editingGoalTitle = signal<string>('');

  // Subscription management
  subscriptionLoading = signal(false);
  subscriptionError = signal<string | null>(null);
  phoneNumberDraft = signal('');
  phoneNumberSaving = signal(false);
  phoneNumberDirty = signal(false);
  phoneSavedModalVisible = signal(false);

  // Telegram
  telegramLinked = signal(false);
  telegramUsername = signal<string | null>(null);
  telegramLoading = signal(false);
  telegramError = signal<string | null>(null);
  telegramUnlinkLoading = signal(false);
  messagingPrefsSaving = signal(false);
  dailyCheckInEnabled = signal(true);
  checkInTimeDraft = signal('08:00');
  missionLogReminderEnabled = signal(true);
  reminderTimeDraft = signal('20:00');

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
    this.phoneNumberDraft.set(profile.phoneNumber || '');
    this.telegramLinked.set(!!profile.telegramId);
    this.telegramUsername.set(profile.telegramUsername ?? null);
    const prefs = profile.messagingPreferences;
    if (prefs) {
      this.dailyCheckInEnabled.set(prefs.dailyCheckInEnabled ?? true);
      this.checkInTimeDraft.set(prefs.checkInTime || '08:00');
      this.missionLogReminderEnabled.set(prefs.missionLogReminderEnabled ?? true);
      this.reminderTimeDraft.set(prefs.reminderTime || '20:00');
    }
    
    // Set profile image - check both preview and profile
    const profileImageUrl = profile.profilePictureUrl;
    if (profileImageUrl) {
      console.log('Setting profile image URL:', profileImageUrl);
      this.profileImagePreview.set(profileImageUrl);
    }
    
    if (profile.headerImageUrl) {
      this.headerImagePreview.set(profile.headerImageUrl);
    }
    
    if (profile.rocketGoalPhotoUrl) {
      this.rocketGoalPhotoPreview.set(profile.rocketGoalPhotoUrl);
    }
    
    await this.initStorage();
    await this.loadGoals();
    await this.loadTelegramStatus();
    
    // Watch for profile changes
    const checkProfile = () => {
      const currentProfile = this.authService.profile();
      if (currentProfile && currentProfile.userId === profile.userId) {
        this.profile.set(currentProfile);
        if (!this.phoneNumberDirty()) {
          this.phoneNumberDraft.set(currentProfile.phoneNumber || '');
        }
        // Only override the preview with the stored image when we don't have a local
        // selection in progress. This lets the user actually see the file they just picked.
        if (!this.profileImageFile && currentProfile.profilePictureUrl && currentProfile.profilePictureUrl !== this.profileImagePreview()) {
          console.log('Profile image updated:', currentProfile.profilePictureUrl);
          this.profileImagePreview.set(currentProfile.profilePictureUrl);
        }
        if (!this.headerImageFile && currentProfile.headerImageUrl && currentProfile.headerImageUrl !== this.headerImagePreview()) {
          this.headerImagePreview.set(currentProfile.headerImageUrl);
        }
        if (!this.rocketGoalPhotoFile && currentProfile.rocketGoalPhotoUrl && currentProfile.rocketGoalPhotoUrl !== this.rocketGoalPhotoPreview()) {
          this.rocketGoalPhotoPreview.set(currentProfile.rocketGoalPhotoUrl);
        }
        // Sync Telegram and messaging prefs from profile when it updates
        const prefs = currentProfile.messagingPreferences;
        if (prefs) {
          this.dailyCheckInEnabled.set(prefs.dailyCheckInEnabled ?? true);
          this.checkInTimeDraft.set(prefs.checkInTime || '08:00');
          this.missionLogReminderEnabled.set(prefs.missionLogReminderEnabled ?? true);
          this.reminderTimeDraft.set(prefs.reminderTime || '20:00');
        }
        this.telegramLinked.set(!!currentProfile.telegramId);
        this.telegramUsername.set(currentProfile.telegramUsername ?? null);
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
    const rocketGoalPhotoPreview = this.rocketGoalPhotoPreview();
    if (rocketGoalPhotoPreview && rocketGoalPhotoPreview.startsWith('blob:')) {
      URL.revokeObjectURL(rocketGoalPhotoPreview);
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
      // Clean up old preview URL if it was a blob URL or data URL
      const oldPreview = this.profileImagePreview();
      if (oldPreview && (oldPreview.startsWith('blob:') || oldPreview.startsWith('data:'))) {
        // For data URLs, we can't revoke them, but we'll clear the signal
        if (oldPreview.startsWith('blob:')) {
          URL.revokeObjectURL(oldPreview);
        }
      }
      this.profileImageFile = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        // Force update the preview immediately
        const newPreview = e.target?.result as string;
        this.profileImagePreview.set(newPreview);
        // Clear any error/success messages
        this.error.set(null);
        this.success.set(null);
      };
      reader.readAsDataURL(file);
      // Reset the input so the same file can be selected again if needed
      input.value = '';
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
      
      // Update profile in Firestore first
      const updatedProfile = await this.updateProfile({ profilePictureUrl: downloadURL });
      
      // Clear the file reference after successful upload
      this.profileImageFile = null;
      
      // Update preview with the new URL - add cache busting to force browser reload
      // This ensures the new image displays immediately instead of showing cached version
      const timestamp = Date.now();
      const cacheBustedURL = downloadURL.includes('?') 
        ? `${downloadURL}&t=${timestamp}` 
        : `${downloadURL}?t=${timestamp}`;
      
      // Set preview to the cache-busted URL to force immediate reload
      this.profileImagePreview.set(cacheBustedURL);
      
      // Also update the profile signal to ensure it's in sync
      if (updatedProfile) {
        this.profile.set(updatedProfile);
      }
      
      // Force change detection to ensure the view updates
      this.cdr.detectChanges();
      
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

  onRocketGoalPhotoSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      if (file.size > 5 * 1024 * 1024) {
        this.error.set('Rocket goal photo must be less than 5MB');
        setTimeout(() => this.error.set(null), 5000);
        return;
      }
      if (!file.type.startsWith('image/')) {
        this.error.set('Please select an image file');
        setTimeout(() => this.error.set(null), 5000);
        return;
      }
      // Clean up old preview URL if it was a blob URL or data URL
      const oldPreview = this.rocketGoalPhotoPreview();
      if (oldPreview && (oldPreview.startsWith('blob:') || oldPreview.startsWith('data:'))) {
        if (oldPreview.startsWith('blob:')) {
          URL.revokeObjectURL(oldPreview);
        }
      }
      this.rocketGoalPhotoFile = file;
      const reader = new FileReader();
      reader.onload = (e) => {
        const newPreview = e.target?.result as string;
        this.rocketGoalPhotoPreview.set(newPreview);
        this.error.set(null);
        this.success.set(null);
      };
      reader.readAsDataURL(file);
      input.value = '';
    }
  }

  async uploadRocketGoalPhoto() {
    if (!this.rocketGoalPhotoFile || !this.storage || !this.profile()) {
      return;
    }

    this.uploadingRocketGoalPhoto.set(true);
    this.error.set(null);
    this.success.set(null);

    try {
      const storageModule = await import('firebase/storage');
      const userId = this.profile()!.userId;
      const fileExtension = this.rocketGoalPhotoFile.name.split('.').pop();
      const fileName = `rocket-goal-photo-${Date.now()}.${fileExtension}`;
      const storageRef = storageModule.ref(this.storage, `userProfiles/${userId}/${fileName}`);
      
      await storageModule.uploadBytes(storageRef, this.rocketGoalPhotoFile);
      const downloadURL = await storageModule.getDownloadURL(storageRef);
      
      // Update profile in Firestore
      const updatedProfile = await this.updateProfile({ rocketGoalPhotoUrl: downloadURL });
      
      // Clear the file reference after successful upload
      this.rocketGoalPhotoFile = null;
      
      // Update preview with cache busting
      const timestamp = Date.now();
      const cacheBustedURL = downloadURL.includes('?') 
        ? `${downloadURL}&t=${timestamp}` 
        : `${downloadURL}?t=${timestamp}`;
      
      this.rocketGoalPhotoPreview.set(cacheBustedURL);
      
      if (updatedProfile) {
        this.profile.set(updatedProfile);
      }
      
      this.cdr.detectChanges();
      
      this.success.set('Rocket goal photo updated successfully!');
      setTimeout(() => this.success.set(null), 5000);
    } catch (error: any) {
      console.error('Error uploading rocket goal photo', error);
      this.error.set('Failed to upload rocket goal photo. Please try again.');
    } finally {
      this.uploadingRocketGoalPhoto.set(false);
    }
  }

  async removeRocketGoalPhoto() {
    if (!confirm('Are you sure you want to remove your rocket goal photo? This will affect future goal visualizations.')) {
      return;
    }

    try {
      // Remove from profile using Firestore deleteField
      const profile = this.profile();
      if (!profile?.userId) {
        throw new Error('No profile found');
      }

      const firestoreModule = await import('firebase/firestore');
      const appModule = await import('firebase/app');
      const { firebaseConfig } = await import('../../environments/environment');

      const app = appModule.getApps().length === 0
        ? appModule.initializeApp(firebaseConfig)
        : appModule.getApp();

      const firestore = firestoreModule.getFirestore(app);
      const docRef = firestoreModule.doc(firestore, 'userProfiles', profile.userId);

      // Use deleteField() to properly remove the field from Firestore
      await firestoreModule.updateDoc(docRef, {
        rocketGoalPhotoUrl: firestoreModule.deleteField()
      });

      // Refresh profile to get updated data
      const updatedProfile = await this.authService.refreshProfile();
      if (updatedProfile) {
        this.profile.set(updatedProfile);
      }

      // Clear preview
      const oldPreview = this.rocketGoalPhotoPreview();
      if (oldPreview && oldPreview.startsWith('blob:')) {
        URL.revokeObjectURL(oldPreview);
      }
      this.rocketGoalPhotoPreview.set(null);
      this.rocketGoalPhotoFile = null;

      this.success.set('Rocket goal photo removed successfully!');
      setTimeout(() => this.success.set(null), 5000);
    } catch (error: any) {
      console.error('Error removing rocket goal photo', error);
      this.error.set('Failed to remove rocket goal photo. Please try again.');
    }
  }

  private async updateProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
    const updatedProfile = await this.authService.updateUserProfile(updates);
    this.profile.set(updatedProfile);
    return updatedProfile;
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

  getAvatarImageSrc(): string | null {
    // If a new file is selected (not yet uploaded), always show the preview (new image)
    if (this.profileImageFile && this.profileImagePreview()) {
      return this.profileImagePreview()!;
    }
    // If we have a preview (which might be the uploaded image), use it
    // This ensures the preview shows immediately after upload
    if (this.profileImagePreview()) {
      return this.profileImagePreview()!;
    }
    // Fallback to profile picture URL
    return this.profile()?.profilePictureUrl || null;
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

  updatePhoneNumberDraft(value: string) {
    this.phoneNumberDraft.set(value);
    this.phoneNumberDirty.set(true);
  }

  private normalizeUsPhoneNumber(rawValue: string): string | null {
    const digits = rawValue.replace(/\D/g, '');
    if (digits.length === 10) {
      return `+1${digits}`;
    }
    if (digits.length === 11 && digits.startsWith('1')) {
      return `+1${digits.slice(1)}`;
    }
    return null;
  }

  async savePhoneNumber() {
    if (this.phoneNumberSaving()) return;
    const trimmed = this.phoneNumberDraft().trim();
    const normalized = trimmed ? this.normalizeUsPhoneNumber(trimmed) : '';
    if (trimmed && !normalized) {
      this.error.set('Please enter a valid 10-digit phone number (you can include +1).');
      setTimeout(() => this.error.set(null), 5000);
      return;
    }
    this.phoneNumberSaving.set(true);
    try {
      const updatedProfile = await this.updateProfile({ phoneNumber: normalized || undefined });
      this.phoneNumberDraft.set(updatedProfile.phoneNumber || '');
      this.phoneNumberDirty.set(false);
      this.success.set(trimmed ? 'Phone number saved.' : 'Phone number removed.');
      setTimeout(() => this.success.set(null), 5000);
      if (trimmed) {
        this.phoneSavedModalVisible.set(true);
        setTimeout(() => this.phoneSavedModalVisible.set(false), 2500);
      }
    } catch (error: any) {
      console.error('Error saving phone number', error);
      this.error.set('Failed to save phone number. Please try again.');
      setTimeout(() => this.error.set(null), 5000);
    } finally {
      this.phoneNumberSaving.set(false);
    }
  }

  getGoalTheme(goal: RocketGoal): string {
    return goal.answers?.['goal_theme_label'] || 'Personal Growth';
  }

  toggleTheme(): void {
    this.theme.toggleDarkMode();
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

  // Subscription management methods
  getSubscriptionStatus(): string {
    const profile = this.profile();
    if (!profile?.subscriptionStatus) return 'none';
    return profile.subscriptionStatus;
  }

  getSubscriptionStatusDisplay(): string {
    const status = this.getSubscriptionStatus();
    switch (status) {
      case 'active': return 'Active';
      case 'canceling': return 'Canceling at period end';
      case 'canceled': return 'Canceled';
      case 'past_due': return 'Past Due';
      case 'none': return 'No subscription';
      default: return status;
    }
  }

  getSubscriptionPlan(): string | null {
    const profile = this.profile();
    return profile?.subscriptionPlan || null;
  }

  getSubscriptionPlanDisplay(): string {
    const plan = this.getSubscriptionPlan();
    if (!plan) return 'Free';
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

  getSubscriptionExpiresAt(): string {
    const profile = this.profile();
    if (!profile?.subscriptionExpiresAt) {
      if (profile?.promoSubscription && profile?.subscriptionPlan) {
        return 'Lifetime';
      }
      return '';
    }
    try {
      const date = profile.subscriptionExpiresAt as any;
      if (date && typeof date.toDate === 'function') {
        return date.toDate().toLocaleDateString();
      }
      if (typeof date === 'string' || typeof date === 'number') {
        return new Date(date).toLocaleDateString();
      }
      return '';
    } catch {
      return '';
    }
  }

  hasActiveSubscription(): boolean {
    const status = this.getSubscriptionStatus();
    return status === 'active' || status === 'canceling';
  }

  async openBillingPortal() {
    this.subscriptionLoading.set(true);
    this.subscriptionError.set(null);

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
        returnUrl: window.location.origin + '/profile'
      });

      const data = result.data as { url?: string };

      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No billing portal URL returned');
      }
    } catch (err: any) {
      console.error('Error opening billing portal:', err);
      this.subscriptionError.set(err?.message || 'Failed to open billing portal. Please try again.');
      setTimeout(() => this.subscriptionError.set(null), 5000);
    } finally {
      this.subscriptionLoading.set(false);
    }
  }

  async cancelSubscription() {
    if (!confirm('Are you sure you want to cancel your subscription? You will still have access until the end of your billing period.')) {
      return;
    }

    this.subscriptionLoading.set(true);
    this.subscriptionError.set(null);

    try {
      const appModule = await import('firebase/app');
      const functionsModule = await import('firebase/functions');
      const { firebaseConfig } = await import('../../environments/environment');

      const app = appModule.getApps().length === 0
        ? appModule.initializeApp(firebaseConfig)
        : appModule.getApp();

      const functions = functionsModule.getFunctions(app, 'us-central1');
      const cancelSub = functionsModule.httpsCallable(functions, 'cancelSubscription');

      await cancelSub({ immediately: false });

      // Refresh profile to get updated status
      const updatedProfile = await this.authService.refreshProfile();
      if (updatedProfile) {
        this.profile.set(updatedProfile);
      }

      this.success.set('Your subscription has been scheduled for cancellation. You will have access until the end of your billing period.');
      setTimeout(() => this.success.set(null), 8000);
    } catch (err: any) {
      console.error('Error canceling subscription:', err);
      this.subscriptionError.set(err?.message || 'Failed to cancel subscription. Please try again.');
      setTimeout(() => this.subscriptionError.set(null), 5000);
    } finally {
      this.subscriptionLoading.set(false);
    }
  }

  async loadTelegramStatus() {
    const profile = this.profile();
    if (!profile?.userId) return;

    this.telegramLoading.set(true);
    this.telegramError.set(null);
    try {
      const appModule = await import("firebase/app");
      const functionsModule = await import("firebase/functions");
      const { firebaseConfig } = await import("../../environments/environment");

      const app =
        appModule.getApps().length === 0
          ? appModule.initializeApp(firebaseConfig)
          : appModule.getApp();

      const functions = functionsModule.getFunctions(app, "us-central1");
      const getTelegramLinkStatus = functionsModule.httpsCallable(functions, "getTelegramLinkStatus");
      const result = await getTelegramLinkStatus({});
      const data = result.data as { linked: boolean; telegramUsername?: string | null; linkedAt?: unknown };

      this.telegramLinked.set(!!data?.linked);
      this.telegramUsername.set(data?.telegramUsername ?? null);
    } catch (err: unknown) {
      console.error("Error loading Telegram status:", err);
      this.telegramError.set("Could not load Telegram status.");
    } finally {
      this.telegramLoading.set(false);
    }
  }

  async unlinkTelegram() {
    if (!confirm("Disconnect Telegram? You can reconnect anytime by messaging the bot again.")) return;

    this.telegramUnlinkLoading.set(true);
    this.telegramError.set(null);
    try {
      const appModule = await import("firebase/app");
      const functionsModule = await import("firebase/functions");
      const { firebaseConfig } = await import("../../environments/environment");

      const app =
        appModule.getApps().length === 0
          ? appModule.initializeApp(firebaseConfig)
          : appModule.getApp();

      const functions = functionsModule.getFunctions(app, "us-central1");
      const unlinkTelegramAccount = functionsModule.httpsCallable(functions, "unlinkTelegramAccount");
      await unlinkTelegramAccount({});

      const updatedProfile = await this.authService.refreshProfile();
      if (updatedProfile) this.profile.set(updatedProfile);
      this.telegramLinked.set(false);
      this.telegramUsername.set(null);
      this.success.set("Telegram disconnected.");
      setTimeout(() => this.success.set(null), 5000);
    } catch (err: unknown) {
      console.error("Error unlinking Telegram:", err);
      this.telegramError.set(err && typeof err === "object" && "message" in err ? String((err as { message: string }).message) : "Could not disconnect.");
      setTimeout(() => this.telegramError.set(null), 5000);
    } finally {
      this.telegramUnlinkLoading.set(false);
    }
  }

  async saveMessagingPreferences() {
    this.messagingPrefsSaving.set(true);
    this.telegramError.set(null);
    try {
      const prefs = {
        telegramEnabled: this.telegramLinked(),
        dailyCheckInEnabled: this.dailyCheckInEnabled(),
        checkInTime: this.checkInTimeDraft(),
        missionLogReminderEnabled: this.missionLogReminderEnabled(),
        reminderTime: this.reminderTimeDraft(),
      };
      await this.updateProfile({ messagingPreferences: prefs });
      this.success.set("Notification preferences saved.");
      setTimeout(() => this.success.set(null), 4000);
    } catch (err: unknown) {
      console.error("Error saving messaging preferences:", err);
      this.telegramError.set("Could not save preferences.");
      setTimeout(() => this.telegramError.set(null), 5000);
    } finally {
      this.messagingPrefsSaving.set(false);
    }
  }

  async reactivateSubscription() {
    this.subscriptionLoading.set(true);
    this.subscriptionError.set(null);

    try {
      const appModule = await import('firebase/app');
      const functionsModule = await import('firebase/functions');
      const { firebaseConfig } = await import('../../environments/environment');

      const app = appModule.getApps().length === 0
        ? appModule.initializeApp(firebaseConfig)
        : appModule.getApp();

      const functions = functionsModule.getFunctions(app, 'us-central1');
      const reactivateSub = functionsModule.httpsCallable(functions, 'reactivateSubscription');

      await reactivateSub({});

      // Refresh profile to get updated status
      const updatedProfile = await this.authService.refreshProfile();
      if (updatedProfile) {
        this.profile.set(updatedProfile);
      }

      this.success.set('Your subscription has been reactivated!');
      setTimeout(() => this.success.set(null), 5000);
    } catch (err: any) {
      console.error('Error reactivating subscription:', err);
      this.subscriptionError.set(err?.message || 'Failed to reactivate subscription. Please try again.');
      setTimeout(() => this.subscriptionError.set(null), 5000);
    } finally {
      this.subscriptionLoading.set(false);
    }
  }
}

import { Component, inject, signal, OnInit, OnDestroy, ChangeDetectorRef, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from './auth.service';
import { ProfileVisibilitySettings, UserProfile } from './models/user-profile';
import { RocketGoalsService } from './rocket-goals.service';
import { TeamService } from './team.service';
import { AvatarDropdownComponent } from './avatar-dropdown.component';
import type { RocketGoal } from './models/rocket-goal';
import type { Team } from './models/team';
import { ThemeService } from './theme.service';
import { TelegramQrModalComponent } from './telegram-qr-modal.component';
import { dedupeGoals } from './goal-dedupe.util';

type ProfileVisibilityKey = keyof ProfileVisibilitySettings;

const DEFAULT_PROFILE_VISIBILITY: ProfileVisibilitySettings = {
  hero: 'public',
  stats: 'public',
  goals: 'public',
  subscription: 'private',
  rocketGoalPhoto: 'private',
  telegram: 'private',
  contact: 'private'
};

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AvatarDropdownComponent, TelegramQrModalComponent],
  templateUrl: './profile.component.html',
  styleUrl: './profile.component.css'
})
export class ProfileComponent implements OnInit, OnDestroy {
  authService = inject(AuthService);
  router = inject(Router);
  private route = inject(ActivatedRoute);
  private rocketGoalsService = inject(RocketGoalsService);
  private teamService = inject(TeamService);
  protected theme = inject(ThemeService);
  private cdr = inject(ChangeDetectorRef);
  private storage: any = null;
  private profileSyncInterval: ReturnType<typeof setInterval> | null = null;
  
  profile = signal<UserProfile | null>(null);
  profileNotFound = signal(false);
  viewedUserId = signal<string | null>(null);
  isOwnProfile = signal(true);
  visibilitySavingSection = signal<ProfileVisibilityKey | null>(null);
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
  telegramConnecting = signal(false);
  showTelegramQrModal = signal(false);
  telegramDeepLink = signal<string | null>(null);
  messagingPrefsSaving = signal(false);
  dailyCheckInEnabled = signal(true);
  checkInTimeDraft = signal('08:00');
  missionLogReminderEnabled = signal(true);
  reminderTimeDraft = signal('20:00');
  readonly resolvedVisibility = computed<ProfileVisibilitySettings>(() => this.resolveProfileVisibility(this.profile()));
  readonly canEditProfile = computed(() => this.isOwnProfile());

  async ngOnInit() {
    this.loading.set(true);
    this.error.set(null);
    this.profileNotFound.set(false);

    const routeUserId = (this.route.snapshot.paramMap.get('userId') || '').trim();
    const signedInProfile = await this.waitForSignedInProfile();

    if (!routeUserId && !signedInProfile?.userId) {
      this.loading.set(false);
      this.router.navigate(['/login']);
      return;
    }

    const viewedUserId = routeUserId || signedInProfile!.userId;
    const viewingOwnProfile = !!signedInProfile?.userId && signedInProfile.userId === viewedUserId;
    this.viewedUserId.set(viewedUserId);
    this.isOwnProfile.set(viewingOwnProfile);

    let profileToDisplay: UserProfile | null = null;
    if (viewingOwnProfile && signedInProfile) {
      profileToDisplay = signedInProfile;
    } else {
      profileToDisplay = await this.fetchUserProfileById(viewedUserId);
    }

    if (!profileToDisplay) {
      this.loading.set(false);
      this.profileNotFound.set(true);
      this.profile.set(null);
      return;
    }

    this.applyLoadedProfile(profileToDisplay, viewingOwnProfile);

    if (this.shouldLoadGoalsForCurrentView(profileToDisplay)) {
      await this.loadGoals();
    } else {
      this.goals.set([]);
      this.loadingGoals.set(false);
    }

    if (viewingOwnProfile) {
      await this.initStorage();
      await this.loadTelegramStatus();
      this.startOwnerProfileSync(profileToDisplay.userId);
    } else {
      this.telegramLoading.set(false);
      this.telegramError.set(null);
      this.telegramLinked.set(!!profileToDisplay.telegramId);
      this.telegramUsername.set(profileToDisplay.telegramUsername ?? null);
    }

    this.loading.set(false);
  }

  ngOnDestroy() {
    if (this.profileSyncInterval) {
      clearInterval(this.profileSyncInterval);
      this.profileSyncInterval = null;
    }

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

  private async waitForSignedInProfile(): Promise<UserProfile | null> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const profile = this.authService.profile();
      if (profile?.userId) {
        return profile;
      }
      await new Promise(resolve => setTimeout(resolve, 120));
    }
    return this.authService.profile();
  }

  private async fetchUserProfileById(userId: string): Promise<UserProfile | null> {
    try {
      const { firestore } = await this.ensureFirebase();
      const firestoreModule = await import('firebase/firestore');

      const byDocIdRef = firestoreModule.doc(firestore, 'userProfiles', userId);
      const byDocIdSnap = await firestoreModule.getDoc(byDocIdRef);
      if (byDocIdSnap.exists()) {
        return byDocIdSnap.data() as UserProfile;
      }

      const q = firestoreModule.query(
        firestoreModule.collection(firestore, 'userProfiles'),
        firestoreModule.where('userId', '==', userId),
        firestoreModule.limit(1)
      );
      const querySnap = await firestoreModule.getDocs(q);
      if (!querySnap.empty) {
        return querySnap.docs[0].data() as UserProfile;
      }
      return null;
    } catch (error) {
      console.error('Failed to load profile by user id:', error);
      this.error.set('Unable to load this profile right now.');
      return null;
    }
  }

  private applyLoadedProfile(profile: UserProfile, viewingOwnProfile: boolean): void {
    this.profile.set(profile);
    this.isOwnProfile.set(viewingOwnProfile);
    this.profileNotFound.set(false);
    if (!viewingOwnProfile) {
      this.profileImageFile = null;
      this.headerImageFile = null;
      this.rocketGoalPhotoFile = null;
      this.editingGoalId.set(null);
      this.editingGoalTitle.set('');
    }
    this.phoneNumberDraft.set(profile.phoneNumber || '');
    this.phoneNumberDirty.set(false);

    const prefs = profile.messagingPreferences;
    this.dailyCheckInEnabled.set(prefs?.dailyCheckInEnabled ?? true);
    this.checkInTimeDraft.set(prefs?.checkInTime || '08:00');
    this.missionLogReminderEnabled.set(prefs?.missionLogReminderEnabled ?? true);
    this.reminderTimeDraft.set(prefs?.reminderTime || '20:00');

    if (!this.profileImageFile) {
      this.profileImagePreview.set(profile.profilePictureUrl || null);
    }
    if (!this.headerImageFile) {
      this.headerImagePreview.set(profile.headerImageUrl || null);
    }
    if (!this.rocketGoalPhotoFile) {
      this.rocketGoalPhotoPreview.set(profile.rocketGoalPhotoUrl || null);
    }
  }

  private startOwnerProfileSync(ownerUserId: string): void {
    if (this.profileSyncInterval) {
      clearInterval(this.profileSyncInterval);
      this.profileSyncInterval = null;
    }

    this.profileSyncInterval = setInterval(() => {
      const currentProfile = this.authService.profile();
      if (!currentProfile || currentProfile.userId !== ownerUserId) {
        return;
      }

      this.profile.set(currentProfile);
      if (!this.phoneNumberDirty()) {
        this.phoneNumberDraft.set(currentProfile.phoneNumber || '');
      }
      if (!this.profileImageFile && currentProfile.profilePictureUrl && currentProfile.profilePictureUrl !== this.profileImagePreview()) {
        this.profileImagePreview.set(currentProfile.profilePictureUrl);
      }
      if (!this.headerImageFile && currentProfile.headerImageUrl && currentProfile.headerImageUrl !== this.headerImagePreview()) {
        this.headerImagePreview.set(currentProfile.headerImageUrl);
      }
      if (!this.rocketGoalPhotoFile && currentProfile.rocketGoalPhotoUrl && currentProfile.rocketGoalPhotoUrl !== this.rocketGoalPhotoPreview()) {
        this.rocketGoalPhotoPreview.set(currentProfile.rocketGoalPhotoUrl);
      }

      const prefs = currentProfile.messagingPreferences;
      this.dailyCheckInEnabled.set(prefs?.dailyCheckInEnabled ?? true);
      this.checkInTimeDraft.set(prefs?.checkInTime || '08:00');
      this.missionLogReminderEnabled.set(prefs?.missionLogReminderEnabled ?? true);
      this.reminderTimeDraft.set(prefs?.reminderTime || '20:00');
      this.telegramLinked.set(!!currentProfile.telegramId);
      this.telegramUsername.set(currentProfile.telegramUsername ?? null);
    }, 2000);
  }

  private shouldLoadGoalsForCurrentView(profile: UserProfile | null): boolean {
    if (!profile?.userId) {
      return false;
    }
    if (this.isOwnProfile()) {
      return true;
    }
    return this.isSectionPublic('stats') || this.isSectionPublic('goals');
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
    if (!this.isOwnProfile()) {
      throw new Error('Only the profile owner can update profile settings.');
    }
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

  private resolveProfileVisibility(profile: UserProfile | null): ProfileVisibilitySettings {
    const raw = (profile?.profileVisibility || {}) as Partial<ProfileVisibilitySettings>;
    return {
      hero: raw.hero === 'private' ? 'private' : DEFAULT_PROFILE_VISIBILITY.hero,
      stats: raw.stats === 'private' ? 'private' : DEFAULT_PROFILE_VISIBILITY.stats,
      goals: raw.goals === 'private' ? 'private' : DEFAULT_PROFILE_VISIBILITY.goals,
      subscription: raw.subscription === 'public' ? 'public' : DEFAULT_PROFILE_VISIBILITY.subscription,
      rocketGoalPhoto: raw.rocketGoalPhoto === 'public' ? 'public' : DEFAULT_PROFILE_VISIBILITY.rocketGoalPhoto,
      telegram: raw.telegram === 'public' ? 'public' : DEFAULT_PROFILE_VISIBILITY.telegram,
      contact: raw.contact === 'public' ? 'public' : DEFAULT_PROFILE_VISIBILITY.contact
    };
  }

  isSectionPublic(section: ProfileVisibilityKey): boolean {
    return this.resolvedVisibility()[section] === 'public';
  }

  canShowSection(section: ProfileVisibilityKey): boolean {
    return this.isOwnProfile() || this.isSectionPublic(section);
  }

  hasAnyVisiblePublicSection(): boolean {
    if (this.isOwnProfile()) {
      return true;
    }
    const sections: ProfileVisibilityKey[] = ['hero', 'stats', 'goals', 'subscription', 'rocketGoalPhoto', 'telegram', 'contact'];
    return sections.some(section => this.isSectionPublic(section));
  }

  async toggleSectionVisibility(section: ProfileVisibilityKey): Promise<void> {
    if (!this.isOwnProfile() || this.visibilitySavingSection()) {
      return;
    }

    const profile = this.profile();
    if (!profile?.userId) {
      return;
    }

    const current = this.resolvedVisibility();
    const nextValue: ProfileVisibilitySettings[ProfileVisibilityKey] =
      current[section] === 'public' ? 'private' : 'public';
    const nextVisibility = {
      ...(profile.profileVisibility || {}),
      [section]: nextValue
    };

    this.visibilitySavingSection.set(section);
    this.error.set(null);
    try {
      const updatedProfile = await this.updateProfile({ profileVisibility: nextVisibility });
      this.profile.set(updatedProfile);
      this.success.set(`${this.getSectionLabel(section)} is now ${nextValue}.`);
      setTimeout(() => this.success.set(null), 3500);
    } catch (error) {
      console.error('Failed to update profile section visibility:', error);
      this.error.set('Unable to update section visibility right now.');
      setTimeout(() => this.error.set(null), 4000);
    } finally {
      this.visibilitySavingSection.set(null);
    }
  }

  getSectionLabel(section: ProfileVisibilityKey): string {
    switch (section) {
      case 'hero': return 'Profile header';
      case 'stats': return 'Stats';
      case 'goals': return 'Goals';
      case 'subscription': return 'Subscription';
      case 'rocketGoalPhoto': return 'Rocket goal photo';
      case 'telegram': return 'Telegram';
      case 'contact': return 'Contact';
      default: return 'Section';
    }
  }

  getVisibilityPillLabel(section: ProfileVisibilityKey): string {
    return this.isSectionPublic(section) ? 'Public' : 'Private';
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
      const [personalGoalsRaw, teamsRaw] = await Promise.all([
        this.rocketGoalsService.getRocketGoalsByUserId(profile.userId).catch(error => {
          console.warn('Failed to load personal goals for profile:', error);
          return [] as any[];
        }),
        this.teamService.getTeamsByUserId(profile.userId).catch(error => {
          console.warn('Failed to load teams while resolving profile goals:', error);
          return [] as any[];
        })
      ]);

      const mergedGoals = new Map<string, RocketGoal>();
      const fallbackTeamGoals = new Map<string, RocketGoal>();
      const activeTeamIds = new Set(
        (teamsRaw as Team[])
          .map(team => String(team?.id || '').trim())
          .filter(Boolean)
      );

      for (const goal of personalGoalsRaw as RocketGoal[]) {
        if (goal?.id && this.shouldIncludeProfileGoal(goal, activeTeamIds)) {
          mergedGoals.set(goal.id, goal);
        }
      }

      const candidateTeamGoalIds = new Set<string>();
      for (const team of teamsRaw as Team[]) {
        const resolvedGoalId = team?.id
          ? this.buildMemberTeamGoalId(team.id, profile.userId)
          : '';
        if (resolvedGoalId) {
          candidateTeamGoalIds.add(resolvedGoalId);
          fallbackTeamGoals.set(resolvedGoalId, this.buildFallbackTeamGoal(team, profile, resolvedGoalId));
        }
      }

      const preferredGoalId = String(profile.myOneThingGoalId || '').trim();
      if (preferredGoalId) {
        candidateTeamGoalIds.add(preferredGoalId);
      }

      for (const goalId of candidateTeamGoalIds) {
        if (!goalId || mergedGoals.has(goalId)) {
          continue;
        }
        try {
          const goal = await this.rocketGoalsService.getRocketGoalById(goalId);
          if (goal?.id) {
            const ownerId = String((goal as any).userId || '').trim();
            if (ownerId && ownerId !== profile.userId) {
              continue;
            }
            if (!this.shouldIncludeProfileGoal(goal as RocketGoal, activeTeamIds)) {
              continue;
            }
            mergedGoals.set(goal.id, goal as RocketGoal);
            continue;
          }
          const fallback = fallbackTeamGoals.get(goalId);
          if (fallback) {
            mergedGoals.set(goalId, fallback);
          }
        } catch (error) {
          console.warn(`Failed to load goal ${goalId} while building profile goals:`, error);
          const fallback = fallbackTeamGoals.get(goalId);
          if (fallback) {
            mergedGoals.set(goalId, fallback);
          }
        }
      }

      const mergedList = dedupeGoals(Array.from(mergedGoals.values()))
        .sort((a, b) => this.getGoalSortTime(b) - this.getGoalSortTime(a));
      this.goals.set(mergedList);
    } catch (err) {
      console.error('Error loading goals:', err);
      this.goals.set([]);
    } finally {
      this.loadingGoals.set(false);
    }
  }

  private getGoalSortTime(goal: RocketGoal): number {
    const createdAt = (goal as any)?.createdAt;
    if (typeof createdAt?.toMillis === 'function') {
      try {
        return createdAt.toMillis();
      } catch {
        return 0;
      }
    }
    if (typeof createdAt?.toDate === 'function') {
      try {
        const date = createdAt.toDate();
        return date instanceof Date ? date.getTime() : 0;
      } catch {
        return 0;
      }
    }
    if (createdAt instanceof Date) {
      return createdAt.getTime();
    }
    if (typeof createdAt === 'number') {
      return Number.isFinite(createdAt) ? createdAt : 0;
    }
    if (typeof createdAt === 'string') {
      const parsed = Date.parse(createdAt);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  private buildMemberTeamGoalId(teamId: string, userId: string): string {
    return `team-${teamId}-member-${userId}`;
  }

  private extractLinkedTeamId(goal: RocketGoal): string | null {
    const answerTeamId = typeof goal?.answers?.['teamId'] === 'string'
      ? goal.answers['teamId'].trim()
      : '';
    if (answerTeamId) {
      return answerTeamId;
    }

    const goalId = String(goal?.id || '').trim();
    if (!goalId.startsWith('team-')) {
      return null;
    }

    const memberMatch = goalId.match(/^team-(.+?)-member-.+$/);
    if (memberMatch?.[1]) {
      return memberMatch[1].trim() || null;
    }

    return goalId.slice('team-'.length).trim() || null;
  }

  private shouldIncludeProfileGoal(goal: RocketGoal, activeTeamIds: Set<string>): boolean {
    const linkedTeamId = this.extractLinkedTeamId(goal);
    if (!linkedTeamId) {
      return true;
    }
    return activeTeamIds.has(linkedTeamId);
  }

  private buildFallbackTeamGoal(team: Team, profile: UserProfile, goalId: string): RocketGoal {
    const teamName = String(team.name || 'Team').trim() || 'Team';
    const createdAt = (team.updatedAt || team.createdAt || Date.now()) as unknown;
    return {
      id: goalId,
      userId: profile.userId,
      primaryGoal: `${teamName} Team Mission`,
      answers: {
        goal_title_label: `${teamName} Team Mission`,
        custom_goal_title: `${teamName} Team Mission`,
        goal_theme_label: 'Team Mission',
        goal_support_label: 'Team',
        teamId: team.id,
        teamName,
        teamGoal: true,
        teamMemberGoal: true,
        teamMemberUserId: profile.userId
      },
      participant: {
        firstName: profile.firstName || teamName,
        lastName: profile.lastName || 'Team Member',
        email: profile.email || ''
      },
      status: 'active',
      entryPoint: 'launch_challenge',
      createdAt,
      startTime: typeof team.createdAt === 'number' ? team.createdAt : Date.now()
    };
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
    if (!this.isOwnProfile()) return;
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
    if (!this.isOwnProfile()) return;
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
    if (!this.isOwnProfile()) return;
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

  navigateToGoal(goalId: string, goal?: RocketGoal) {
    const teamId = String(goal?.answers?.['teamId'] || '').trim();
    if (teamId) {
      this.router.navigateByUrl(`/team/${teamId}`);
      return;
    }
    this.router.navigateByUrl(`/rocketgoal/${goalId}`);
  }

  async deleteGoal(goalId: string) {
    if (!this.isOwnProfile()) return;
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
    if (!this.isOwnProfile()) return;
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
    if (!this.isOwnProfile()) return;
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

  /** Generate a deep link and open Telegram for instant connection. */
  async connectTelegram(): Promise<void> {
    if (!this.isOwnProfile()) return;
    this.telegramConnecting.set(true);
    this.telegramError.set(null);
    this.telegramDeepLink.set(null);
    const isMobile = this.isMobileDevice();
    if (!isMobile) {
      this.showTelegramQrModal.set(true);
    }
    try {
      const appModule = await import("firebase/app");
      const functionsModule = await import("firebase/functions");
      const { firebaseConfig } = await import("../../environments/environment");

      const app =
        appModule.getApps().length === 0
          ? appModule.initializeApp(firebaseConfig)
          : appModule.getApp();

      const functions = functionsModule.getFunctions(app, "us-central1");
      const generateTelegramDeepLink = functionsModule.httpsCallable(functions, "generateTelegramDeepLink");
      const result = await generateTelegramDeepLink({});
      const data = result.data as { alreadyLinked: boolean; deepLink: string | null };

      if (data.alreadyLinked) {
        this.telegramLinked.set(true);
        this.success.set("Telegram is already connected!");
        setTimeout(() => this.success.set(null), 3000);
      }

      const deepLink = data.deepLink || "https://t.me/RocketGoalsBot";
      if (deepLink) {
        this.telegramDeepLink.set(deepLink);
        if (isMobile && data.deepLink) {
          window.location.href = deepLink;
        }
      } else {
        this.telegramError.set("Could not generate Telegram link. Please try again.");
      }
    } catch (err: unknown) {
      console.error("Error generating Telegram deep link:", err);
      this.telegramError.set("Could not generate Telegram link. Please try again.");
      setTimeout(() => this.telegramError.set(null), 5000);
    } finally {
      this.telegramConnecting.set(false);
    }
  }

  closeTelegramQrModal(): void {
    this.showTelegramQrModal.set(false);
  }

  retryTelegramConnect(): void {
    void this.connectTelegram();
  }

  private isMobileDevice(): boolean {
    const ua = navigator.userAgent || '';
    return /android|iphone|ipad|ipod/i.test(ua);
  }

  async loadTelegramStatus() {
    if (!this.isOwnProfile()) return;
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
    if (!this.isOwnProfile()) return;
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
    if (!this.isOwnProfile()) return;
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
    if (!this.isOwnProfile()) return;
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

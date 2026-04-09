export type DirectLaunchTarget = 'chatgpt' | 'gemini' | 'claude' | 'grok';

export interface UserPreferences {
  sidebarCollapsed?: boolean;
  defaultChatbot?: DirectLaunchTarget;
}

export interface MessagingPreferences {
  telegramEnabled: boolean;
  dailyCheckInEnabled: boolean;
  checkInTime: string; // "08:00" format (24-hour)
  missionLogReminderEnabled: boolean;
  reminderTime: string; // "20:00" format (24-hour)
}

export type ProfileSectionVisibility = 'public' | 'private';

export interface ProfileVisibilitySettings {
  hero: ProfileSectionVisibility;
  stats: ProfileSectionVisibility;
  goals: ProfileSectionVisibility;
  subscription: ProfileSectionVisibility;
  rocketGoalPhoto: ProfileSectionVisibility;
  telegram: ProfileSectionVisibility;
  contact: ProfileSectionVisibility;
}

export interface UserProfile {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  username?: string;
  profilePictureUrl?: string;
  headerImageUrl?: string;
  rocketGoalPhotoUrl?: string; // Photo used for rocket goal visualizations
  createdAt?: unknown;
  preferences?: UserPreferences;
  admin?: boolean;
  role?: string;
  subscriptionStatus?: string;
  subscriptionPlan?: 'moonshot' | 'team' | 'interplanetary' | 'galactic';
  subscriptionPriceId?: string;
  subscriptionPaidAt?: unknown;
  subscriptionExpiresAt?: unknown;
  subscriptionCancelAt?: unknown;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  lastSignInAt?: unknown;
  lastSignIn?: unknown;
  usedPromoCodes?: string[];
  promoSubscription?: boolean;
  phoneNumber?: string;
  myOneThingGoalId?: string;

  // Telegram integration
  telegramId?: string;
  telegramLinkedAt?: unknown;
  telegramUsername?: string;
  telegramChatId?: number;
  messagingPreferences?: MessagingPreferences;
  profileVisibility?: Partial<ProfileVisibilitySettings>;
}

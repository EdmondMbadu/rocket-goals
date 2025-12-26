export type DirectLaunchTarget = 'chatgpt' | 'gemini' | 'claude' | 'grok';

export interface UserPreferences {
  sidebarCollapsed?: boolean;
  defaultChatbot?: DirectLaunchTarget;
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
  subscriptionPlan?: 'moonshot' | 'interplanetary' | 'galactic';
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
}

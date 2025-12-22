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
  createdAt?: unknown;
  preferences?: UserPreferences;
  admin?: boolean;
  role?: string;
  subscriptionStatus?: string;
  subscriptionPaidAt?: unknown;
  subscriptionExpiresAt?: unknown;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  lastSignInAt?: unknown;
  lastSignIn?: unknown;
}

export type RocketGoalStatus = 'draft' | 'active' | 'completed';

export interface RocketGoalParticipant {
  firstName: string;
  lastName: string;
  email: string;
}

export interface RocketGoalCopilot {
  avatar: string;    // Path to copilot avatar image
  name: string;      // Copilot name (e.g., "Marcus Chen")
  role: string;      // Copilot role/description for system prompt
}

// Dashboard metrics for CareerQuest and other templates
export interface CareerQuestMetrics {
  applications: number;
  responses: number;
  interviews: number;
  offers: number;
  networkingContacts: number;
  followUps: number;
}

// Generic dashboard metrics that can be extended per template
export interface DashboardMetrics {
  careerQuest?: CareerQuestMetrics;
  // Future templates can add their own metrics here
}

export interface RocketGoal {
  id: string;
  userId: string;
  primaryGoal?: string;
  answers: Record<string, any>;
  participant: RocketGoalParticipant;
  status: RocketGoalStatus;
  entryPoint: 'launch_challenge';
  createdAt: unknown;
  startTime?: number; // Timestamp in milliseconds when the 7-day challenge started
  visualizationImageUrl?: string; // AI-generated visualization of the achieved goal
  visualizationGeneratedAt?: unknown; // Timestamp when visualization was generated
  copilot?: RocketGoalCopilot; // Custom copilot for app-suite launched goals
  welcomeVideoUrl?: string; // HeyGen AI coach welcome video URL
  welcomeVideoThumbnail?: string; // Thumbnail for the welcome video
  welcomeVideoGeneratedAt?: unknown; // Timestamp when welcome video was generated
  dashboardMetrics?: DashboardMetrics; // Template-specific dashboard metrics
}

export type CreateRocketGoalInput = Omit<RocketGoal, 'id' | 'createdAt'> & {
  createdAt?: unknown;
};

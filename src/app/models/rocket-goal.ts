export type RocketGoalStatus = 'draft' | 'active' | 'completed';

export interface RocketGoalParticipant {
  firstName: string;
  lastName: string;
  email: string;
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
}

export type CreateRocketGoalInput = Omit<RocketGoal, 'id' | 'createdAt'> & {
  createdAt?: unknown;
};

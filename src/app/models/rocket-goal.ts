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
}

export type CreateRocketGoalInput = Omit<RocketGoal, 'id' | 'createdAt'> & {
  createdAt?: unknown;
};

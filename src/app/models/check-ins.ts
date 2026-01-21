export type IgnitionOneThingChoice = 'suggested' | 'other' | 'unsure';
export type IgnitionTimeOfDay = 'morning' | 'afternoon' | 'evening';
export type IgnitionConfidence = 'high' | 'medium' | 'low';

export type MissionActionTaken = 'yes' | 'barely' | 'no';
export type MissionFocusLevel = 'full_focus' | 'distracted' | 'low_energy';
export type MissionChallengeLevel = 'tough_day' | 'average' | 'easy';
export type MissionFeeling = 'positive' | 'neutral' | 'frustrated';
export type MissionTeamConnection = 'yes' | 'no' | 'solo';

export type MissionLogCoaching = {
  reinstruction: string;
  demonstration: string;
  hustle: string;
};

export type DailyIgnition = {
  id: string;
  goalId: string;
  dateId: string;
  oneThingChoice: IgnitionOneThingChoice;
  oneThingText?: string;
  timeOfDay: IgnitionTimeOfDay;
  confidence: IgnitionConfidence;
  createdAt: unknown;
  createdAtMs?: number;
};

export type MissionLog = {
  id: string;
  goalId: string;
  dateId: string;
  actionTaken: MissionActionTaken;
  focusLevel: MissionFocusLevel;
  challengeLevel: MissionChallengeLevel;
  feeling: MissionFeeling;
  teamConnection: MissionTeamConnection;
  note?: string;
  intendedOneThing?: string;
  aiCoaching?: MissionLogCoaching;
  createdAt: unknown;
  createdAtMs?: number;
};

export type WeeklyResetSummary = {
  id: string;
  goalId: string;
  weekId: string;
  weekStartMs: number;
  weekEndMs: number;
  ignitionCompletionRate: number;
  missionLogCompletionRate: number;
  streakDays: number;
  oneThingCompletionRatio: number;
  focusDistribution: Record<string, number>;
  feelingDistribution: Record<string, number>;
  actionDistribution: Record<string, number>;
  topOneThing?: string;
  bestDayLabel?: string;
  toughestDayLabel?: string;
  suggestions: string[];
  createdAt: unknown;
  createdAtMs?: number;
};

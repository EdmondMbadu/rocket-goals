export interface TeamMember {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  profilePictureUrl?: string;
  role: 'admin' | 'coach' | 'captain' | 'team-lead' | 'member';
  joinedAt: number;
}

export interface TeamMessage {
  id: string;
  teamId: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl?: string;
  content: string;
  timestamp: number;
  type: 'text' | 'ai-response' | 'system';
  source?: 'web' | 'telegram';
}

export interface TeamDirectMessage {
  id: string;
  teamId: string;
  participantUserId: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl?: string;
  content: string;
  timestamp: number;
  type: 'text' | 'system';
  source?: 'web' | 'telegram';
}

export interface TeamMemberConversationPreview {
  memberUserId: string;
  lastMessage: TeamDirectMessage | null;
}

export interface TeamMemberProgressNote {
  id: string;
  teamId: string;
  memberUserId: string;
  content: string;
  authorUserId: string;
  authorName: string;
  authorRole: TeamMember['role'] | 'system';
  createdAt: unknown;
  updatedAt?: unknown;
}

export interface TeamMemberActivitySnapshot {
  memberUserId: string;
  goalId: string | null;
  primaryGoal: string | null;
  missionDay: number | null;
  totalDays: number | null;
  completedMilestones: number;
  totalMilestones: number;
  completedToday: number;
  totalToday: number;
  latestMissionLogAt: number | null;
  latestIgnitionAt: number | null;
  latestMilestoneUpdateAt: number | null;
  latestActivityAt: number | null;
  totalMilesLogged?: number;
  currentWeekMilesActual?: number;
  currentWeekMilesTarget?: number;
  weeklyMileageProgress?: TeamWeeklyMileageProgress[];
}

export type TeamMissionControlCardStyle = 'circular' | 'histogram';

export type TeamMissionControlMetricKey =
  | 'total_members'
  | 'milestones_done'
  | 'today_execution'
  | 'active_today'
  | 'overall_milestone_progress'
  | 'today_execution_rate'
  | 'team_engagement_rate'
  | 'current_week_miles'
  | 'weekly_mileage_progress'
  | 'weekly_miles_total'
  | 'overall_miles_total';

export interface TeamWeeklyMileageProgress {
  weekId: string;
  weekStartMs: number;
  weekEndMs: number;
  targetMiles: number;
  actualMiles: number;
}

export interface TeamMissionControlCard {
  id: string;
  name: string;
  style: TeamMissionControlCardStyle;
  metricKey: TeamMissionControlMetricKey;
}

export interface TeamMissionControlLeaderboardConfig {
  kicker?: string;
  primaryTitle?: string;
  primaryDescription?: string;
  secondaryTitle?: string;
  secondaryDescription?: string;
  primaryToggleLabel?: string;
  secondaryToggleLabel?: string;
}

export interface TeamInvite {
  id: string;
  teamId: string;
  teamName: string;
  teamDescription?: string;
  teamCoverImageUrl?: string;
  inviteeEmail: string;
  inviteeName?: string;
  invitedByUserId: string;
  invitedByName?: string;
  status: 'pending' | 'accepted' | 'declined';
  invitedAt: unknown;
  respondedAt?: unknown;
  respondedByUserId?: string;
}

export interface TeamAiSettings {
  displayName?: string;
  avatarUrl?: string;
  personality?: string;
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  welcomeMessage?: string;
  meetingRoomLink?: string;
  meetingRoomEventId?: string;
  meetingRoomProvider?: 'google-meet';
  meetingRoomCreatedAt?: unknown;
  avatarUrl?: string;
  coverImageUrl?: string;
  rocketGoalId?: string;
  adminId: string;
  members: TeamMember[];
  memberIds: string[];
  aiCoachEnabled: boolean;
  aiSettings?: TeamAiSettings;
  missionControlCards?: TeamMissionControlCard[];
  missionControlLeaderboard?: TeamMissionControlLeaderboardConfig;
  telegramGroupId?: number;
  telegramGroupInviteLink?: string;
  telegramGroupTitle?: string;
  createdAt: unknown;
  updatedAt: unknown;
}

export type CreateTeamInput = Omit<Team, 'id' | 'createdAt' | 'updatedAt'> & {
  createdAt?: unknown;
  updatedAt?: unknown;
};

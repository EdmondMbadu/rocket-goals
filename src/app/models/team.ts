export interface TeamMember {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  profilePictureUrl?: string;
  role: 'admin' | 'coach' | 'team-lead' | 'member';
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
}

export type TeamMissionControlCardStyle = 'circular' | 'histogram';

export type TeamMissionControlMetricKey =
  | 'total_members'
  | 'milestones_done'
  | 'today_execution'
  | 'active_today'
  | 'overall_milestone_progress'
  | 'today_execution_rate'
  | 'team_engagement_rate';

export interface TeamMissionControlCard {
  id: string;
  name: string;
  style: TeamMissionControlCardStyle;
  metricKey: TeamMissionControlMetricKey;
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  coverImageUrl?: string;
  rocketGoalId?: string;
  adminId: string;
  members: TeamMember[];
  memberIds: string[];
  aiCoachEnabled: boolean;
  missionControlCards?: TeamMissionControlCard[];
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

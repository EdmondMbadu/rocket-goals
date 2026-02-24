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

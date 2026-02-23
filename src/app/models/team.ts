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
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  coverImageUrl?: string;
  adminId: string;
  members: TeamMember[];
  memberIds: string[];
  aiCoachEnabled: boolean;
  createdAt: unknown;
  updatedAt: unknown;
}

export type CreateTeamInput = Omit<Team, 'id' | 'createdAt' | 'updatedAt'> & {
  createdAt?: unknown;
  updatedAt?: unknown;
};

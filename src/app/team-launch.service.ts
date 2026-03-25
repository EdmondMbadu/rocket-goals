import { Injectable, inject } from '@angular/core';
import { TeamService } from './team.service';
import type { Team, TeamMember } from './models/team';
import type { UserProfile } from './models/user-profile';

export type PendingTeamCoachSource = 'prebuilt' | 'community' | 'custom';

export interface PendingTeamCoachDraft {
  source: PendingTeamCoachSource;
  displayName: string;
  personality: string;
  avatarUrl?: string;
  uploadedAvatarDataUrl?: string;
  title: string;
  subtitle: string;
  description: string;
}

export interface PendingTeamCreationDraft {
  teamName: string;
  teamDescription: string;
  inviteEmails: string[];
  coach: PendingTeamCoachDraft;
}

const PENDING_TEAM_CREATION_KEY = 'pendingTeamCreationDraft';

@Injectable({ providedIn: 'root' })
export class TeamLaunchService {
  private readonly teamService = inject(TeamService);

  savePendingDraft(draft: PendingTeamCreationDraft): void {
    sessionStorage.setItem(PENDING_TEAM_CREATION_KEY, JSON.stringify(draft));
  }

  loadPendingDraft(): PendingTeamCreationDraft | null {
    const raw = sessionStorage.getItem(PENDING_TEAM_CREATION_KEY);
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as PendingTeamCreationDraft;
      if (!parsed?.teamName || !parsed?.coach?.displayName || !parsed?.coach?.personality) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  clearPendingDraft(): void {
    sessionStorage.removeItem(PENDING_TEAM_CREATION_KEY);
  }

  async createTeamFromDraft(profile: UserProfile, draft: PendingTeamCreationDraft): Promise<string> {
    if (!profile?.userId) {
      throw new Error('Please log in to create a team.');
    }

    const adminMember: TeamMember = {
      userId: profile.userId,
      firstName: profile.firstName || '',
      lastName: profile.lastName || '',
      email: (profile.email || '').trim().toLowerCase(),
      role: 'admin',
      joinedAt: Date.now(),
      ...(profile.profilePictureUrl ? { profilePictureUrl: profile.profilePictureUrl } : {})
    };

    const aiSettings: NonNullable<Team['aiSettings']> = {
      displayName: draft.coach.displayName,
      personality: draft.coach.personality
    };
    if (draft.coach.avatarUrl && !draft.coach.uploadedAvatarDataUrl) {
      aiSettings.avatarUrl = draft.coach.avatarUrl;
    }

    const teamId = await this.teamService.createTeam({
      name: draft.teamName.trim(),
      ...(draft.teamDescription.trim() ? { description: draft.teamDescription.trim() } : {}),
      adminId: profile.userId,
      members: [adminMember],
      memberIds: [profile.userId],
      aiCoachEnabled: true,
      aiSettings
    });

    if (draft.coach.uploadedAvatarDataUrl) {
      try {
        const file = this.dataUrlToFile(draft.coach.uploadedAvatarDataUrl, 'team-ai-avatar.png');
        const uploadedAvatarUrl = await this.teamService.uploadTeamAiAvatar(teamId, file);
        await this.teamService.updateTeam(teamId, {
          aiSettings: {
            ...aiSettings,
            avatarUrl: uploadedAvatarUrl
          }
        } as Partial<Team>);
      } catch (error) {
        console.error('Failed to upload pending team AI avatar:', error);
      }
    }

    try {
      await this.teamService.ensureTeamRocketGoal(teamId);
    } catch (error) {
      console.warn('Unable to ensure team rocket goal during setup-team launch:', error);
    }

    for (const email of draft.inviteEmails) {
      try {
        const user = await this.teamService.findUserByEmail(email);
        if (!user) {
          continue;
        }
        await this.teamService.addMemberToTeam(teamId, {
          userId: user.userId,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          profilePictureUrl: user.profilePictureUrl,
          role: 'member',
          joinedAt: Date.now()
        });
      } catch (error) {
        console.error(`Failed to add invited member ${email}:`, error);
      }
    }

    return teamId;
  }

  private dataUrlToFile(dataUrl: string, fileName: string): File {
    const [header, base64 = ''] = dataUrl.split(',');
    const mimeMatch = header.match(/data:(.*?);base64/);
    const mimeType = mimeMatch?.[1] || 'image/png';
    const binary = atob(base64);
    const length = binary.length;
    const bytes = new Uint8Array(length);
    for (let index = 0; index < length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return new File([bytes], fileName, { type: mimeType });
  }
}

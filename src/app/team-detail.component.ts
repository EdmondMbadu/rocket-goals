import { Component, inject, OnInit, signal, computed, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TeamService } from './team.service';
import { AuthService } from './auth.service';
import type { Team, TeamMember, TeamMessage } from './models/team';

@Component({
  selector: 'app-team-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './team-detail.component.html',
  styleUrl: './team-detail.component.css'
})
export class TeamDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private teamService = inject(TeamService);
  authService = inject(AuthService);

  @ViewChild('messagesContainer') messagesContainer?: ElementRef<HTMLDivElement>;

  team = signal<Team | null>(null);
  loading = signal(true);
  activeTab = signal<'members' | 'chat' | 'ai'>('members');
  messages = signal<TeamMessage[]>([]);
  showInviteModal = signal(false);
  sendingMessage = signal(false);
  inviteLoading = signal(false);
  inviteError = signal<string | null>(null);
  inviteSuccess = signal<string | null>(null);

  newMessage = '';
  inviteEmailField = '';

  currentUserId = computed(() => this.authService.profile()?.userId || '');
  isAdmin = computed(() => this.team()?.adminId === this.currentUserId());

  async ngOnInit() {
    const teamId = this.route.snapshot.paramMap.get('id');
    if (teamId) {
      this.waitForAuthAndLoad(teamId);
    } else {
      this.loading.set(false);
    }
  }

  private waitForAuthAndLoad(teamId: string) {
    let attempts = 0;
    const maxAttempts = 10;

    const tryLoad = async () => {
      attempts++;
      const profile = this.authService.profile();

      if (profile?.userId) {
        await this.loadTeam(teamId);
        await this.loadMessages(teamId);
      } else if (attempts < maxAttempts) {
        setTimeout(tryLoad, 200);
      } else {
        this.loading.set(false);
      }
    };

    setTimeout(tryLoad, 100);
  }

  private async loadTeam(teamId: string) {
    this.loading.set(true);
    try {
      const team = await this.teamService.getTeamById(teamId);
      this.team.set(team);
    } catch (err) {
      console.error('Failed to load team:', err);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadMessages(teamId: string) {
    try {
      const msgs = await this.teamService.getMessages(teamId);
      this.messages.set(msgs);
      this.scrollToBottom();
    } catch (err) {
      console.error('Failed to load messages:', err);
    }
  }

  getAdmins(): TeamMember[] {
    return this.team()?.members.filter(m => m.role === 'admin' || m.role === 'coach') || [];
  }

  getMembers(): TeamMember[] {
    return this.team()?.members.filter(m => m.role === 'member') || [];
  }

  async sendMessage() {
    const content = this.newMessage.trim();
    const teamId = this.team()?.id;
    const profile = this.authService.profile();
    if (!content || !teamId || !profile) return;

    this.sendingMessage.set(true);
    this.newMessage = '';

    try {
      await this.teamService.sendMessage(teamId, {
        teamId,
        senderId: profile.userId,
        senderName: `${profile.firstName} ${profile.lastName}`.trim(),
        senderAvatarUrl: profile.profilePictureUrl,
        content,
        type: 'text'
      });
      await this.loadMessages(teamId);
    } catch (err) {
      console.error('Failed to send message:', err);
      this.newMessage = content;
    } finally {
      this.sendingMessage.set(false);
    }
  }

  async removeMember(userId: string) {
    const teamId = this.team()?.id;
    if (!teamId) return;
    try {
      await this.teamService.removeMemberFromTeam(teamId, userId);
      await this.loadTeam(teamId);
    } catch (err) {
      console.error('Failed to remove member:', err);
    }
  }

  async inviteMember() {
    const email = this.inviteEmailField.trim().toLowerCase();
    if (!email || !email.includes('@')) return;

    const teamData = this.team();
    if (!teamData?.id) return;

    if (teamData.memberIds.includes(email) || teamData.members.some(m => m.email === email)) {
      this.inviteError.set('This person is already a member of the team.');
      return;
    }

    this.inviteLoading.set(true);
    this.inviteError.set(null);
    this.inviteSuccess.set(null);

    try {
      const user = await this.teamService.findUserByEmail(email);
      if (!user) {
        this.inviteError.set('No Rocket Goals account found for that email.');
        return;
      }

      if (teamData.memberIds.includes(user.userId)) {
        this.inviteError.set('This person is already a member of the team.');
        return;
      }

      await this.teamService.addMemberToTeam(teamData.id, {
        userId: user.userId,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        profilePictureUrl: user.profilePictureUrl,
        role: 'member',
        joinedAt: Date.now()
      });

      this.inviteEmailField = '';
      const name = `${user.firstName} ${user.lastName}`.trim() || user.email;
      this.inviteSuccess.set(`${name} has been added to the team!`);
      await this.loadTeam(teamData.id);
    } catch (err: any) {
      console.error('Failed to add member:', err);
      this.inviteError.set(err.message || 'Failed to add member. Please try again.');
    } finally {
      this.inviteLoading.set(false);
    }
  }

  onEnterKey(event: Event) {
    const ke = event as KeyboardEvent;
    if (!ke.shiftKey) {
      ke.preventDefault();
      this.sendMessage();
    }
  }

  formatTime(timestamp: any): string {
    if (!timestamp) return '';
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
      ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private scrollToBottom() {
    setTimeout(() => {
      const el = this.messagesContainer?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 100);
  }
}

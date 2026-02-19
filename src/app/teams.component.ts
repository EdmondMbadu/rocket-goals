import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TeamService } from './team.service';
import { AuthService } from './auth.service';
import type { Team, TeamMember } from './models/team';

@Component({
  selector: 'app-teams',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive, FormsModule],
  templateUrl: './teams.component.html',
  styleUrl: './teams.component.css'
})
export class TeamsComponent implements OnInit {
  private router = inject(Router);
  private teamService = inject(TeamService);
  authService = inject(AuthService);

  teams = signal<Team[]>([]);
  loading = signal(true);
  showCreateModal = signal(false);
  creating = signal(false);
  deleting = signal(false);
  mobileNavOpen = signal(false);
  teamToDelete = signal<Team | null>(null);

  currentUserId = computed(() => this.authService.profile()?.userId || '');

  newTeamName = '';
  newTeamDescription = '';
  newTeamAiCoach = true;
  inviteEmail = '';
  inviteEmails = signal<string[]>([]);

  async ngOnInit() {
    this.waitForAuthAndLoadTeams();
  }

  private waitForAuthAndLoadTeams() {
    let attempts = 0;
    const maxAttempts = 10;

    const tryLoad = async () => {
      attempts++;
      const profile = this.authService.profile();

      if (profile?.userId) {
        await this.loadTeams();
      } else if (attempts < maxAttempts) {
        setTimeout(tryLoad, 200);
      } else {
        this.loading.set(false);
      }
    };

    setTimeout(tryLoad, 100);
  }

  async loadTeams() {
    this.loading.set(true);
    try {
      const userId = this.authService.profile()?.userId;
      if (!userId) {
        this.loading.set(false);
        return;
      }
      const teams = await this.teamService.getTeamsByUserId(userId);
      this.teams.set(teams);
    } catch (err) {
      console.error('Failed to load teams:', err);
    } finally {
      this.loading.set(false);
    }
  }

  navigateToTeam(teamId: string) {
    this.router.navigate(['/team', teamId]);
  }

  confirmDelete(team: Team, event: Event) {
    event.stopPropagation();
    this.teamToDelete.set(team);
  }

  async deleteTeam() {
    const team = this.teamToDelete();
    if (!team || this.deleting()) return;
    this.deleting.set(true);
    try {
      await this.teamService.deleteTeam(team.id);
      this.teams.update(list => list.filter(t => t.id !== team.id));
      this.teamToDelete.set(null);
    } catch (err) {
      console.error('Failed to delete team:', err);
    } finally {
      this.deleting.set(false);
    }
  }

  addInviteEmail() {
    const email = this.inviteEmail.trim().toLowerCase();
    if (email && email.includes('@') && !this.inviteEmails().includes(email)) {
      this.inviteEmails.update(list => [...list, email]);
      this.inviteEmail = '';
    }
  }

  removeInviteEmail(email: string) {
    this.inviteEmails.update(list => list.filter(e => e !== email));
  }

  closeCreateModal() {
    this.showCreateModal.set(false);
    this.newTeamName = '';
    this.newTeamDescription = '';
    this.newTeamAiCoach = true;
    this.inviteEmail = '';
    this.inviteEmails.set([]);
  }

  async createTeam() {
    if (!this.newTeamName.trim() || this.creating()) return;
    this.creating.set(true);

    try {
      const profile = this.authService.profile();
      if (!profile) return;

      const adminMember: TeamMember = {
        userId: profile.userId,
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: profile.email,
        profilePictureUrl: profile.profilePictureUrl,
        role: 'admin',
        joinedAt: Date.now()
      };

      const teamId = await this.teamService.createTeam({
        name: this.newTeamName.trim(),
        description: this.newTeamDescription.trim() || undefined,
        adminId: profile.userId,
        members: [adminMember],
        memberIds: [profile.userId],
        aiCoachEnabled: this.newTeamAiCoach
      });

      this.closeCreateModal();
      this.router.navigate(['/team', teamId]);
    } catch (err) {
      console.error('Failed to create team:', err);
    } finally {
      this.creating.set(false);
    }
  }
}

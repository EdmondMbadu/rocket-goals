import { Component, computed, effect, ElementRef, inject, OnInit, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TeamService } from './team.service';
import { AuthService } from './auth.service';
import { ThemeService } from './theme.service';
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
  protected theme = inject(ThemeService);

  @ViewChild('messagesContainer') messagesContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('coverInput') coverInput?: ElementRef<HTMLInputElement>;

  teamId = signal<string | null>(null);
  team = signal<Team | null>(null);
  loading = signal(true);
  activeTab = signal<'members' | 'chat' | 'ai'>('members');
  messages = signal<TeamMessage[]>([]);
  showInviteModal = signal(false);
  sendingMessage = signal(false);
  inviteLoading = signal(false);
  inviteError = signal<string | null>(null);
  inviteSuccess = signal<string | null>(null);

  // Invite onboarding and sharing state
  onboardingMode = signal<'signup' | 'login'>('signup');
  showJoinModal = signal(false);
  private joinModalDismissed = signal(false);
  authActionLoading = signal(false);
  joiningTeam = signal(false);
  verificationPending = signal(false);
  verificationEmail = signal('');
  joinError = signal<string | null>(null);
  joinSuccess = signal<string | null>(null);
  verificationNotice = signal<string | null>(null);
  shareNotice = signal<string | null>(null);
  shareError = signal<string | null>(null);

  signupName = '';
  signupEmail = '';
  signupPassword = '';

  loginEmail = '';
  loginPassword = '';

  // Cover image
  coverImagePreview = signal<string | null>(null);
  uploadingCover = signal(false);
  private coverImageFile: File | null = null;

  newMessage = '';
  inviteEmailField = '';

  private messagesLoadedForTeamId: string | null = null;

  currentUserId = computed(() => this.authService.profile()?.userId || '');
  currentUserName = computed(() => {
    const profile = this.authService.profile();
    if (!profile) return '';
    return `${profile.firstName} ${profile.lastName}`.trim() || profile.email;
  });

  isCurrentUserMember = computed(() => {
    const team = this.team();
    const profile = this.authService.profile();
    if (!team || !profile) return false;

    const userEmail = this.normalizeEmail(profile.email);
    if (team.memberIds.includes(profile.userId)) return true;

    return team.members.some(member => {
      if (member.userId === profile.userId) return true;
      if (!userEmail) return false;
      return this.normalizeEmail(member.email) === userEmail;
    });
  });

  isAdmin = computed(() => this.team()?.adminId === this.currentUserId());

  coverImageSrc = computed(() => {
    return this.coverImagePreview() || this.team()?.coverImageUrl || '/assets/team-rocket.jpg';
  });

  showJoinOnboarding = computed(() => {
    return !!this.team() && !this.isCurrentUserMember();
  });

  canShareTeamLink = computed(() => {
    return !!this.team()?.id && this.isCurrentUserMember();
  });

  isBusyJoining = computed(() => this.authActionLoading() || this.joiningTeam());

  readonly teamPageUrl = computed(() => this.buildTeamPageUrl(this.team()?.id || undefined));

  constructor() {
    effect(() => {
      const team = this.team();
      const isMember = this.isCurrentUserMember();

      if (!isMember && this.activeTab() !== 'members') {
        this.activeTab.set('members');
      }

      if (!team || !this.showJoinOnboarding()) {
        this.showJoinModal.set(false);
        this.joinModalDismissed.set(false);
      } else if (!this.showJoinModal() && !this.joinModalDismissed()) {
        this.showJoinModal.set(true);
      }

      if (team?.id && isMember && this.messagesLoadedForTeamId !== team.id) {
        void this.loadMessages(team.id);
      }
    });
  }

  async ngOnInit() {
    const teamId = this.route.snapshot.paramMap.get('id');
    if (!teamId) {
      this.loading.set(false);
      return;
    }

    this.teamId.set(teamId);

    await this.loadTeam(teamId);

    const verified = this.route.snapshot.queryParamMap.get('verified');
    if (verified === '1' || verified === 'true') {
      await this.completeEmailVerificationAndJoin(true);
    }
  }

  private async loadTeam(teamId: string) {
    this.loading.set(true);
    try {
      const team = await this.teamService.getTeamById(teamId);
      this.team.set(team);
    } catch (err) {
      console.error('Failed to load team:', err);
      this.joinError.set('Unable to load this team right now. Please refresh and try again.');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadMessages(teamId: string) {
    try {
      const msgs = await this.teamService.getMessages(teamId);
      this.messages.set(msgs);
      this.messagesLoadedForTeamId = teamId;
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

  getAllMembers(): TeamMember[] {
    const members = this.team()?.members || [];
    return [...members].sort((a, b) => {
      const rank = (role: TeamMember['role']) => {
        if (role === 'admin') return 0;
        if (role === 'coach') return 1;
        return 2;
      };
      return rank(a.role) - rank(b.role);
    });
  }

  async shareTeamLink() {
    const team = this.team();
    const pageUrl = this.teamPageUrl();
    if (!team?.id || !pageUrl) {
      return;
    }

    this.shareNotice.set(null);
    this.shareError.set(null);

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(pageUrl);
        this.shareNotice.set('Team page URL copied to clipboard.');
        return;
      }

      this.shareError.set('Copy is not available on this device right now.');
    } catch (err) {
      console.error('Failed to copy team URL:', err);
      this.shareError.set('Unable to copy the team page URL right now. Please try again.');
    }
  }

  async handleSignupAndJoin() {
    if (this.isBusyJoining()) {
      return;
    }

    const name = this.signupName.trim();
    const email = this.normalizeEmail(this.signupEmail);
    const password = this.signupPassword;

    if (name.length < 2) {
      this.joinError.set('Enter your name to continue.');
      return;
    }
    if (!this.isValidEmail(email)) {
      this.joinError.set('Enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      this.joinError.set('Password must be at least 6 characters.');
      return;
    }

    this.joinError.set(null);
    this.joinSuccess.set(null);
    this.authActionLoading.set(true);

    try {
      const { firstName, lastName } = this.splitName(name);
      await this.authService.signUpWithEmail({
        firstName,
        lastName,
        email,
        password
      });

      const verificationRedirect = this.buildTeamVerificationUrl();
      try {
        await this.authService.sendEmailVerification(verificationRedirect || undefined);
        this.verificationPending.set(true);
        this.verificationEmail.set(email);
        this.verificationNotice.set('Please verify your email first. After you verify, this page will add you to the team automatically.');
      } catch {
        this.verificationNotice.set('Account created. We could not send a verification email right now. Try resending.');
      }

      this.authService.sendWelcomeEmail().catch(() => {});
      this.joinSuccess.set(null);
      this.signupPassword = '';
    } catch (err: any) {
      console.error('Signup + join failed:', err);
      this.joinError.set(this.authService.authError() || err?.message || 'Unable to create your account right now.');
    } finally {
      this.authActionLoading.set(false);
    }
  }

  async handleLoginAndJoin() {
    if (this.isBusyJoining()) {
      return;
    }

    const email = this.normalizeEmail(this.loginEmail);
    const password = this.loginPassword;

    if (!this.isValidEmail(email)) {
      this.joinError.set('Enter a valid email address.');
      return;
    }
    if (!password) {
      this.joinError.set('Enter your password.');
      return;
    }

    this.joinError.set(null);
    this.joinSuccess.set(null);
    this.authActionLoading.set(true);

    try {
      await this.authService.signInWithEmail(email, password);
      const joined = await this.joinCurrentUserToTeam(false);
      if (!joined) {
        return;
      }
      this.joinSuccess.set(`You joined ${this.team()?.name || 'the team'}.`);
      this.loginPassword = '';
    } catch (err: any) {
      console.error('Login + join failed:', err);
      this.joinError.set(this.authService.authError() || err?.message || 'Unable to log in right now.');
    } finally {
      this.authActionLoading.set(false);
    }
  }

  async joinWithCurrentAccount() {
    if (this.joiningTeam()) {
      return;
    }

    this.joinError.set(null);
    this.joinSuccess.set(null);
    await this.joinCurrentUserToTeam(true);
  }

  async resendVerificationForTeam() {
    if (this.authActionLoading()) {
      return;
    }

    this.authActionLoading.set(true);
    this.joinError.set(null);
    try {
      const verificationRedirect = this.buildTeamVerificationUrl();
      await this.authService.sendEmailVerification(verificationRedirect || undefined);
      this.verificationNotice.set(`Verification email sent to ${this.verificationEmail() || 'your inbox'}.`);
    } catch {
      this.joinError.set('Unable to resend verification email right now.');
    } finally {
      this.authActionLoading.set(false);
    }
  }

  async completeEmailVerificationAndJoin(fromRedirect = false) {
    if (this.isBusyJoining()) {
      return;
    }

    this.authActionLoading.set(true);
    this.joinError.set(null);

    try {
      const user = await this.authService.reloadCurrentUser();
      if (!user) {
        this.verificationNotice.set('Email verified. Log in to continue to this team.');
        this.verificationPending.set(false);
        return;
      }

      if (!user.emailVerified) {
        this.verificationPending.set(true);
        this.verificationEmail.set(this.normalizeEmail(user.email || this.verificationEmail()));
        this.joinError.set('Email is not verified yet. Open the verification email and click the link.');
        return;
      }

      this.verificationPending.set(false);
      const joined = await this.joinCurrentUserToTeam(false);
      if (joined) {
        this.joinSuccess.set(`Welcome to ${this.team()?.name || 'the team'}!`);
        if (fromRedirect) {
          this.verificationNotice.set('Email verified and team access unlocked.');
        } else {
          this.verificationNotice.set('Email verified. You are now in the team.');
        }
      }
    } catch (error) {
      console.error('Failed to complete verification join:', error);
      this.joinError.set('Unable to confirm verification right now.');
    } finally {
      this.authActionLoading.set(false);
    }
  }

  openJoinModal() {
    if (!this.showJoinOnboarding()) {
      return;
    }
    this.joinModalDismissed.set(false);
    this.showJoinModal.set(true);
  }

  closeJoinModal() {
    this.showJoinModal.set(false);
    this.joinModalDismissed.set(true);
  }

  private async joinCurrentUserToTeam(showMessage: boolean): Promise<boolean> {
    const team = this.team();
    if (!team?.id) {
      this.joinError.set('Log in or create an account to join this team.');
      return false;
    }

    const currentAuthUser = await this.authService.reloadCurrentUser();
    const profile = await this.waitForProfile();
    if (!profile) {
      this.joinError.set('Log in or create an account to join this team.');
      return false;
    }

    if (!currentAuthUser?.emailVerified) {
      this.verificationPending.set(true);
      this.verificationEmail.set(this.normalizeEmail(currentAuthUser?.email || profile.email));
      this.joinError.set('Please verify your email first. Then click "I verified my email" to join the team.');
      return false;
    }

    if (this.isCurrentUserMember()) {
      if (showMessage) {
        this.joinSuccess.set(`You are already in ${team.name}.`);
      }
      return true;
    }

    this.joiningTeam.set(true);
    this.joinError.set(null);

    try {
      await this.teamService.addMemberToTeam(team.id, {
        userId: profile.userId,
        firstName: profile.firstName,
        lastName: profile.lastName,
        email: this.normalizeEmail(profile.email),
        profilePictureUrl: profile.profilePictureUrl,
        role: 'member',
        joinedAt: Date.now()
      });

      await this.loadTeam(team.id);
      if (showMessage) {
        this.joinSuccess.set(`You are in. Welcome to ${this.team()?.name || 'the team'}!`);
      }
      return true;
    } catch (err: any) {
      console.error('Failed to join team:', err);
      this.joinError.set(err?.message || 'Unable to join this team right now.');
      return false;
    } finally {
      this.joiningTeam.set(false);
    }
  }

  onCoverImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      return;
    }

    this.coverImageFile = file;
    const reader = new FileReader();
    reader.onload = () => {
      this.coverImagePreview.set(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  async uploadCoverImage() {
    const teamId = this.team()?.id;
    if (!teamId || !this.coverImageFile || this.uploadingCover() || !this.isAdmin()) return;

    this.uploadingCover.set(true);
    try {
      const url = await this.teamService.uploadTeamCoverImage(teamId, this.coverImageFile);
      this.team.update(t => t ? { ...t, coverImageUrl: url } : t);
      this.coverImageFile = null;
      this.coverImagePreview.set(null);
      if (this.coverInput?.nativeElement) {
        this.coverInput.nativeElement.value = '';
      }
    } catch (err) {
      console.error('Failed to upload cover image:', err);
    } finally {
      this.uploadingCover.set(false);
    }
  }

  cancelCoverUpload() {
    this.coverImageFile = null;
    this.coverImagePreview.set(null);
    if (this.coverInput?.nativeElement) {
      this.coverInput.nativeElement.value = '';
    }
  }

  async sendMessage() {
    const content = this.newMessage.trim();
    const teamId = this.team()?.id;
    const profile = this.authService.profile();
    if (!content || !teamId || !profile || !this.isCurrentUserMember()) return;

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
    if (!teamId || !this.isAdmin()) return;
    try {
      await this.teamService.removeMemberFromTeam(teamId, userId);
      await this.loadTeam(teamId);
    } catch (err) {
      console.error('Failed to remove member:', err);
    }
  }

  async inviteMember() {
    const email = this.normalizeEmail(this.inviteEmailField);
    if (!email || !this.isValidEmail(email)) return;

    const teamData = this.team();
    if (!teamData?.id) return;

    if (teamData.members.some(m => this.normalizeEmail(m.email) === email)) {
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

      const isAlreadyMember = teamData.memberIds.includes(user.userId) || teamData.members.some(m => m.userId === user.userId);
      if (isAlreadyMember) {
        this.inviteError.set('This person is already a member of the team.');
        return;
      }

      await this.teamService.addMemberToTeam(teamData.id, {
        userId: user.userId,
        firstName: user.firstName,
        lastName: user.lastName,
        email: this.normalizeEmail(user.email),
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

  private normalizeEmail(email: string | null | undefined): string {
    return (email || '').trim().toLowerCase();
  }

  private isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  private splitName(name: string): { firstName: string; lastName: string } {
    const cleaned = name.trim().replace(/\s+/g, ' ');
    const [firstName, ...rest] = cleaned.split(' ');
    return {
      firstName: firstName || 'Rocketeer',
      lastName: rest.join(' ')
    };
  }

  private buildTeamPageUrl(teamId?: string): string {
    const id = teamId || this.teamId();
    if (!id) {
      return '';
    }

    const baseOrigin = typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://www.rocketgoals.com';

    return `${baseOrigin}/team/${id}`;
  }

  private buildTeamVerificationUrl(): string | null {
    const pageUrl = this.buildTeamPageUrl();
    if (!pageUrl) {
      return null;
    }

    try {
      const url = new URL(pageUrl);
      url.searchParams.set('verified', '1');
      return url.toString();
    } catch {
      return null;
    }
  }

  private async waitForProfile(maxAttempts = 10): Promise<NonNullable<ReturnType<AuthService['profile']>> | null> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const profile = this.authService.profile();
      if (profile) {
        return profile;
      }
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    return this.authService.profile();
  }
}

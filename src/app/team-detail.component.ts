import { Component, computed, effect, ElementRef, inject, OnInit, signal, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TeamService } from './team.service';
import { AuthService } from './auth.service';
import { ThemeService } from './theme.service';
import type { Team, TeamMember, TeamMessage } from './models/team';
import { AvatarDropdownComponent } from './avatar-dropdown.component';
import QRCode from 'qrcode';

type InviteUserSuggestion = {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  profilePictureUrl?: string;
};

@Component({
  selector: 'app-team-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, AvatarDropdownComponent],
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
  aiResponding = signal(false);
  inviteLoading = signal(false);
  inviteError = signal<string | null>(null);
  inviteSuccess = signal<string | null>(null);
  inviteSuggestions = signal<InviteUserSuggestion[]>([]);
  inviteSearchLoading = signal(false);
  selectedInviteCandidate = signal<InviteUserSuggestion | null>(null);

  // Invite onboarding and sharing state
  onboardingMode = signal<'signup' | 'login'>('signup');
  showJoinModal = signal(false);
  private joinModalDismissed = signal(false);
  authActionLoading = signal(false);
  joiningTeam = signal(false);
  verificationPending = signal(false);
  verificationEmail = signal('');
  leadUpdatingUserId = signal<string | null>(null);
  leadActionError = signal<string | null>(null);
  leadActionSuccess = signal<string | null>(null);
  openMemberMenuUserId = signal<string | null>(null);
  memberPendingRemoval = signal<TeamMember | null>(null);
  removingMemberUserId = signal<string | null>(null);
  leaveTeamPromptOpen = signal(false);
  leavingTeam = signal(false);
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

  // Telegram group
  connectingTelegram = signal(false);
  telegramConnectError = signal<string | null>(null);
  telegramConnectSuccess = signal<string | null>(null);
  telegramQrDataUrl = signal<string | null>(null);
  showTelegramBanner = signal(true);

  newMessage = '';
  inviteEmailField = '';

  private messagesLoadedForTeamId: string | null = null;
  private inviteSearchTimeout: ReturnType<typeof setTimeout> | null = null;
  private inviteSearchRequestId = 0;

  currentUserId = computed(() => this.authService.profile()?.userId || '');
  currentUserName = computed(() => {
    const profile = this.authService.profile();
    if (!profile) return '';
    return `${profile.firstName} ${profile.lastName}`.trim() || profile.email;
  });
  currentTeamLead = computed(() => this.team()?.members.find(m => m.role === 'team-lead') || null);

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
  canLeaveTeam = computed(() => this.isCurrentUserMember() && !this.isAdmin());

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
  hasTelegramGroup = computed(() => !!this.team()?.telegramGroupId);
  telegramInviteLink = computed(() => this.team()?.telegramGroupInviteLink || null);

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

      // Generate QR code when telegram group is connected
      if (team?.telegramGroupInviteLink) {
        void this.generateTelegramQr(team.telegramGroupInviteLink);
      }
    });

    effect(() => {
      const isChatTab = this.activeTab() === 'chat';
      const messageCount = this.messages().length;
      const aiTyping = this.aiResponding();

      if (!isChatTab || !this.isCurrentUserMember()) {
        return;
      }
      if (messageCount === 0 && !aiTyping) {
        return;
      }

      this.scrollToBottom();
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
        if (role === 'team-lead') return 2;
        return 3;
      };
      return rank(a.role) - rank(b.role);
    });
  }

  canManageMemberActions(member: TeamMember): boolean {
    if (!this.isAdmin()) return false;
    if (member.userId === this.currentUserId()) return false;
    return member.role !== 'admin' && member.role !== 'coach';
  }

  toggleMemberMenu(member: TeamMember, event?: Event) {
    event?.stopPropagation();
    if (!this.canManageMemberActions(member)) {
      return;
    }

    this.openMemberMenuUserId.update(current => current === member.userId ? null : member.userId);
  }

  closeMemberMenu() {
    this.openMemberMenuUserId.set(null);
  }

  async makeTeamLead(member: TeamMember) {
    const team = this.team();
    if (!team?.id || !this.isAdmin() || member.userId === this.currentUserId()) {
      return;
    }

    if (member.role !== 'member') {
      this.leadActionError.set('Only a member can be assigned as Team Lead.');
      return;
    }

    this.leadUpdatingUserId.set(member.userId);
    this.leadActionError.set(null);
    this.leadActionSuccess.set(null);
    this.closeMemberMenu();

    try {
      await this.teamService.assignTeamLead(team.id, member.userId);
      await this.loadTeam(team.id);
      const displayName = `${member.firstName} ${member.lastName}`.trim() || member.email;
      this.leadActionSuccess.set(`${displayName} is now Team Lead.`);
    } catch (error: any) {
      console.error('Failed to assign Team Lead:', error);
      this.leadActionError.set(error?.message || 'Unable to assign Team Lead right now.');
    } finally {
      this.leadUpdatingUserId.set(null);
    }
  }

  async clearTeamLead(member: TeamMember) {
    const team = this.team();
    if (!team?.id || !this.isAdmin() || member.role !== 'team-lead') {
      return;
    }

    this.leadUpdatingUserId.set(member.userId);
    this.leadActionError.set(null);
    this.leadActionSuccess.set(null);
    this.closeMemberMenu();

    try {
      await this.teamService.assignTeamLead(team.id, null);
      await this.loadTeam(team.id);
      this.leadActionSuccess.set('Team Lead role removed.');
    } catch (error: any) {
      console.error('Failed to clear Team Lead:', error);
      this.leadActionError.set(error?.message || 'Unable to remove Team Lead right now.');
    } finally {
      this.leadUpdatingUserId.set(null);
    }
  }

  promptRemoveMember(member: TeamMember) {
    if (!this.canManageMemberActions(member)) {
      return;
    }
    this.memberPendingRemoval.set(member);
    this.closeMemberMenu();
  }

  cancelRemoveMemberPrompt() {
    this.memberPendingRemoval.set(null);
    this.removingMemberUserId.set(null);
  }

  async confirmRemoveMember() {
    const teamId = this.team()?.id;
    const member = this.memberPendingRemoval();
    if (!teamId || !member || !this.isAdmin()) {
      return;
    }

    this.removingMemberUserId.set(member.userId);
    this.leadActionError.set(null);
    this.leadActionSuccess.set(null);

    try {
      await this.teamService.removeMemberFromTeam(teamId, member.userId);
      await this.loadTeam(teamId);
      const name = `${member.firstName} ${member.lastName}`.trim() || member.email;
      this.leadActionSuccess.set(`${name} was removed from the team.`);
      this.memberPendingRemoval.set(null);
    } catch (err: any) {
      console.error('Failed to remove member:', err);
      this.leadActionError.set(err?.message || 'Unable to remove this member right now.');
    } finally {
      this.removingMemberUserId.set(null);
    }
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
        this.shareNotice.set('Share link copied to clipboard.');
        return;
      }

      this.shareError.set('Copy is not available on this device right now.');
    } catch (err) {
      console.error('Failed to copy team URL:', err);
      this.shareError.set('Unable to copy the share link right now. Please try again.');
    }
  }

  promptLeaveTeam() {
    if (!this.canLeaveTeam()) {
      return;
    }
    this.leaveTeamPromptOpen.set(true);
  }

  cancelLeaveTeamPrompt() {
    if (this.leavingTeam()) {
      return;
    }
    this.leaveTeamPromptOpen.set(false);
  }

  async confirmLeaveTeam() {
    const team = this.team();
    const userId = this.currentUserId();
    if (!team?.id || !userId) {
      this.joinError.set('Unable to leave this team right now.');
      return;
    }

    if (this.isAdmin()) {
      this.joinError.set('Team admin cannot leave this team.');
      this.leaveTeamPromptOpen.set(false);
      return;
    }

    this.leavingTeam.set(true);
    this.joinError.set(null);
    this.joinSuccess.set(null);
    this.joinModalDismissed.set(true);
    this.showJoinModal.set(false);

    const teamName = team.name;
    try {
      await this.teamService.removeMemberFromTeam(team.id, userId);
      this.messages.set([]);
      this.messagesLoadedForTeamId = null;
      await this.loadTeam(team.id);
      this.joinSuccess.set(`You left ${teamName}.`);
      this.leaveTeamPromptOpen.set(false);
      this.activeTab.set('members');
      this.closeMemberMenu();
    } catch (err: any) {
      console.error('Failed to leave team:', err);
      this.joinError.set(err?.message || 'Unable to leave this team right now.');
    } finally {
      this.leavingTeam.set(false);
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
        type: 'text',
        source: 'web'
      });
      await this.loadMessages(teamId);

      // Check if message mentions @rocket — trigger AI coach
      if (/@rocket\b/i.test(content)) {
        this.triggerAiCoach(teamId, content);
      }
    } catch (err) {
      console.error('Failed to send message:', err);
      this.newMessage = content;
    } finally {
      this.sendingMessage.set(false);
    }
  }

  private async triggerAiCoach(teamId: string, userMessage: string) {
    this.aiResponding.set(true);

    try {
      // Pass recent messages for context
      const recentMsgs = this.messages().slice(-10).map(m => ({
        senderName: m.senderName,
        content: m.content,
        type: m.type
      }));

      const aiResponse = await this.teamService.askTeamAiCoach(teamId, userMessage, recentMsgs);

      // Save AI response as a message in the chat
      await this.teamService.sendMessage(teamId, {
        teamId,
        senderId: 'rocket-ai',
        senderName: 'Rocket AI',
        content: aiResponse,
        type: 'ai-response',
        source: 'web'
      });

      await this.loadMessages(teamId);
    } catch (err) {
      console.error('AI Coach error:', err);
    } finally {
      this.aiResponding.set(false);
    }
  }

  openInviteModal() {
    if (!this.isAdmin()) {
      return;
    }
    this.inviteError.set(null);
    this.inviteSuccess.set(null);
    this.showInviteModal.set(true);
  }

  closeInviteModal() {
    this.showInviteModal.set(false);
    this.inviteEmailField = '';
    this.inviteError.set(null);
    this.inviteSuccess.set(null);
    this.resetInviteSearchState();
  }

  onInviteEmailInputChange(value: string) {
    this.inviteEmailField = value;
    this.inviteError.set(null);
    this.inviteSuccess.set(null);

    const normalizedEmail = this.normalizeEmail(value);
    const selected = this.selectedInviteCandidate();
    if (selected && this.normalizeEmail(selected.email) !== normalizedEmail) {
      this.selectedInviteCandidate.set(null);
    }

    if (this.inviteSearchTimeout) {
      clearTimeout(this.inviteSearchTimeout);
      this.inviteSearchTimeout = null;
    }

    this.inviteSearchRequestId += 1;
    const requestId = this.inviteSearchRequestId;

    if (normalizedEmail.length < 2) {
      this.inviteSearchLoading.set(false);
      this.inviteSuggestions.set([]);
      return;
    }

    this.inviteSearchLoading.set(true);
    this.inviteSearchTimeout = setTimeout(async () => {
      try {
        const matches = await this.teamService.searchUsersByEmailPrefix(normalizedEmail);
        if (requestId !== this.inviteSearchRequestId) {
          return;
        }

        const existingEmails = new Set(
          (this.team()?.members || []).map(member => this.normalizeEmail(member.email))
        );
        const dedupedEmails = new Set<string>();
        const suggestions = matches.filter(match => {
          const email = this.normalizeEmail(match.email);
          if (!email || existingEmails.has(email) || dedupedEmails.has(email)) {
            return false;
          }
          dedupedEmails.add(email);
          return true;
        });

        this.inviteSuggestions.set(suggestions);
      } catch (error) {
        console.error('Failed to load invite suggestions:', error);
        if (requestId === this.inviteSearchRequestId) {
          this.inviteSuggestions.set([]);
        }
      } finally {
        if (requestId === this.inviteSearchRequestId) {
          this.inviteSearchLoading.set(false);
        }
      }
    }, 250);
  }

  applyInviteSuggestion(suggestion: InviteUserSuggestion) {
    this.inviteEmailField = suggestion.email;
    this.selectedInviteCandidate.set(suggestion);
    this.inviteSuggestions.set([]);
    this.inviteSearchLoading.set(false);
    if (this.inviteSearchTimeout) {
      clearTimeout(this.inviteSearchTimeout);
      this.inviteSearchTimeout = null;
    }
    this.inviteSearchRequestId += 1;
  }

  async inviteMember() {
    const email = this.normalizeEmail(this.inviteEmailField);
    if (!email || !this.isValidEmail(email)) {
      this.inviteError.set('Enter a valid email address to send an invite.');
      return;
    }

    const teamData = this.team();
    if (!teamData?.id || !this.isAdmin()) return;

    if (teamData.members.some(m => this.normalizeEmail(m.email) === email)) {
      this.inviteError.set('This person is already a member of the team.');
      return;
    }

    this.inviteLoading.set(true);
    this.inviteError.set(null);
    this.inviteSuccess.set(null);

    try {
      const selected = this.selectedInviteCandidate();
      const inviteeName = selected && this.normalizeEmail(selected.email) === email
        ? `${selected.firstName} ${selected.lastName}`.trim() || undefined
        : undefined;

      await this.teamService.sendTeamInviteEmail({
        teamId: teamData.id,
        inviteeEmail: email,
        inviteeName,
        teamName: teamData.name,
        teamUrl: this.teamPageUrl()
      });
      this.inviteEmailField = '';
      this.resetInviteSearchState();
      this.inviteSuccess.set(`Invite sent to ${email}. They can use the link to join ${teamData.name}.`);
    } catch (err: any) {
      console.error('Failed to send invite:', err);
      const code = String(err?.code || '');
      if (code.includes('permission-denied')) {
        this.inviteError.set('Only the team admin can send invites.');
      } else if (code.includes('invalid-argument')) {
        this.inviteError.set('Enter a valid email address to send an invite.');
      } else if (code.includes('already-exists')) {
        this.inviteError.set('This person is already a member of the team.');
      } else {
        this.inviteError.set(err?.message || 'Failed to send invite. Please try again.');
      }
    } finally {
      this.inviteLoading.set(false);
    }
  }

  telegramDeepLink = signal<string | null>(null);
  waitingForTelegramLink = signal(false);
  private telegramPollInterval: ReturnType<typeof setInterval> | null = null;

  async connectTelegramGroup() {
    const teamId = this.team()?.id;
    if (!teamId || !this.isAdmin() || this.connectingTelegram()) return;

    this.connectingTelegram.set(true);
    this.telegramConnectError.set(null);
    this.telegramConnectSuccess.set(null);

    try {
      const result = await this.teamService.setupTeamTelegramGroup(teamId);

      if (result.success && result.needsGroupCreation && result.deepLink) {
        // Open Telegram deep link - user picks/creates a group
        this.telegramDeepLink.set(result.deepLink);
        window.open(result.deepLink, '_blank');
        this.waitingForTelegramLink.set(true);
        this.connectingTelegram.set(false);

        // Poll for the group to be linked (auto-detected by webhook)
        this.startTelegramLinkPolling(teamId);
      } else if (result.success) {
        // Group was linked immediately (from pending groups or already connected)
        this.telegramConnectSuccess.set(
          `Connected to Telegram group "${result.telegramGroupTitle || 'group'}"!`
        );
        await this.loadTeam(teamId);
        this.connectingTelegram.set(false);
      }
    } catch (err: any) {
      console.error('Failed to connect Telegram group:', err);
      this.telegramConnectError.set(
        'Unable to connect Telegram group right now. Please try again.'
      );
      this.connectingTelegram.set(false);
    }
  }

  private startTelegramLinkPolling(teamId: string) {
    this.stopTelegramLinkPolling();
    let pollCount = 0;

    this.telegramPollInterval = setInterval(async () => {
      pollCount++;
      try {
        const team = await this.teamService.getTeamById(teamId);
        if (team?.telegramGroupId) {
          this.stopTelegramLinkPolling();
          this.waitingForTelegramLink.set(false);
          this.telegramDeepLink.set(null);
          this.telegramConnectSuccess.set(
            `Connected to Telegram group "${team.telegramGroupTitle || 'group'}"!`
          );
          this.team.set(team);
        }
      } catch {
        // Ignore polling errors
      }

      // Stop polling after 2 minutes
      if (pollCount >= 40) {
        this.stopTelegramLinkPolling();
        this.waitingForTelegramLink.set(false);
      }
    }, 3000);
  }

  private stopTelegramLinkPolling() {
    if (this.telegramPollInterval) {
      clearInterval(this.telegramPollInterval);
      this.telegramPollInterval = null;
    }
  }

  private async generateTelegramQr(inviteLink: string) {
    try {
      const dataUrl = await QRCode.toDataURL(inviteLink, {
        width: 200,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' }
      });
      this.telegramQrDataUrl.set(dataUrl);
    } catch (err) {
      console.error('Failed to generate QR code:', err);
    }
  }

  dismissTelegramBanner() {
    this.showTelegramBanner.set(false);
  }

  toggleTheme(): void {
    this.theme.toggleDarkMode();
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

  private scrollToBottom(attempt = 0) {
    const delay = attempt === 0 ? 0 : 60;
    setTimeout(() => {
      const el = this.messagesContainer?.nativeElement;
      if (el) {
        el.scrollTop = el.scrollHeight;
        if (attempt < 2) {
          this.scrollToBottom(attempt + 1);
        }
        return;
      }

      if (attempt < 8) {
        this.scrollToBottom(attempt + 1);
      }
    }, delay);
  }

  private normalizeEmail(email: string | null | undefined): string {
    return (email || '').trim().toLowerCase();
  }

  private resetInviteSearchState() {
    if (this.inviteSearchTimeout) {
      clearTimeout(this.inviteSearchTimeout);
      this.inviteSearchTimeout = null;
    }
    this.inviteSearchRequestId += 1;
    this.inviteSearchLoading.set(false);
    this.inviteSuggestions.set([]);
    this.selectedInviteCandidate.set(null);
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

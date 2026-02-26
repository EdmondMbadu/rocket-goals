import { Injectable } from '@angular/core';
import type { Firestore } from 'firebase/firestore';
import { firebaseConfig } from '../../environments/environment';
import {
  CreateTeamInput,
  Team,
  TeamMissionControlCard,
  TeamDirectMessage,
  TeamMemberActivitySnapshot,
  TeamMemberConversationPreview,
  TeamMessage
} from './models/team';
import { CreateRocketGoalInput } from './models/rocket-goal';

@Injectable({ providedIn: 'root' })
export class TeamService {
  private firestoreInstance?: Promise<Firestore>;

  private buildDefaultMissionControlCards(): TeamMissionControlCard[] {
    return [
      { id: 'mc-total-members', name: 'Total Members', style: 'circular', metricKey: 'total_members' },
      { id: 'mc-milestones-done', name: 'Milestones Done', style: 'circular', metricKey: 'milestones_done' },
      { id: 'mc-today-execution', name: "Today's Execution", style: 'circular', metricKey: 'today_execution' },
      { id: 'mc-active-today', name: 'Active Today', style: 'circular', metricKey: 'active_today' },
      { id: 'mc-overall-progress', name: 'Overall Milestone Progress', style: 'histogram', metricKey: 'overall_milestone_progress' },
      { id: 'mc-today-rate', name: "Today's Execution Rate", style: 'histogram', metricKey: 'today_execution_rate' },
      { id: 'mc-engagement-rate', name: 'Team Engagement', style: 'histogram', metricKey: 'team_engagement_rate' }
    ];
  }

  private normalizeMissionControlCards(cards?: TeamMissionControlCard[]): TeamMissionControlCard[] {
    const defaults = this.buildDefaultMissionControlCards();
    if (!Array.isArray(cards) || cards.length === 0) {
      return defaults;
    }

    const allowedStyles = new Set<TeamMissionControlCard['style']>(['circular', 'histogram']);
    const allowedMetrics = new Set<TeamMissionControlCard['metricKey']>([
      'total_members',
      'milestones_done',
      'today_execution',
      'active_today',
      'overall_milestone_progress',
      'today_execution_rate',
      'team_engagement_rate'
    ]);

    const normalized = cards
      .map((card, index) => {
        const fallback = defaults[index % defaults.length];
        const id = String(card?.id || '').trim() || `mc-${Date.now()}-${index}`;
        const name = String(card?.name || '').trim() || fallback.name;
        const styleCandidate = card?.style as TeamMissionControlCard['style'] | undefined;
        const metricCandidate = card?.metricKey as TeamMissionControlCard['metricKey'] | undefined;
        const style = styleCandidate && allowedStyles.has(styleCandidate) ? styleCandidate : fallback.style;
        const metricKey = metricCandidate && allowedMetrics.has(metricCandidate) ? metricCandidate : fallback.metricKey;
        return { id, name, style, metricKey } as TeamMissionControlCard;
      })
      .filter(card => !!card.id);

    return normalized.length ? normalized : defaults;
  }

  private getTimestampMillis(value: any): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null;
    }
    if (value instanceof Date) {
      return value.getTime();
    }
    if (typeof value?.toMillis === 'function') {
      try {
        return value.toMillis();
      } catch {
        return null;
      }
    }
    if (typeof value?.toDate === 'function') {
      try {
        const date = value.toDate();
        return date instanceof Date ? date.getTime() : null;
      } catch {
        return null;
      }
    }

    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : null;
  }

  private getGoalTotalDays(goal: any): number {
    const fromAnswers = Number(goal?.answers?.['timeframe_days']);
    if (Number.isFinite(fromAnswers) && fromAnswers > 0) {
      return Math.max(1, Math.round(fromAnswers));
    }
    return 7;
  }

  private getMissionDay(goal: any, totalDays: number): number {
    const startTime = Number(goal?.startTime || Date.now());
    const dayMs = 24 * 60 * 60 * 1000;
    const elapsedDays = Math.floor((Date.now() - startTime) / dayMs) + 1;
    return Math.min(Math.max(1, elapsedDays), Math.max(1, totalDays));
  }

  private buildMemberTeamGoalId(teamId: string, userId: string): string {
    return `team-${teamId}-member-${userId}`;
  }

  private isTeamGoalForTeam(goal: Record<string, any> | null | undefined, teamId: string): boolean {
    if (!goal || !teamId) {
      return false;
    }
    const answers = (goal['answers'] || {}) as Record<string, any>;
    const answerTeamId = typeof answers['teamId'] === 'string' ? answers['teamId'].trim() : '';
    const flaggedTeamGoal = answers['teamGoal'] === true || answers['teamMemberGoal'] === true;
    return !!answerTeamId && answerTeamId === teamId && flaggedTeamGoal;
  }

  private buildTeamGoalAnswers(params: {
    teamId: string;
    teamName: string;
    teamSharedGoalId: string;
    memberUserId: string;
    sourceAnswers?: Record<string, any>;
  }): Record<string, any> {
    const {
      teamId,
      teamName,
      teamSharedGoalId,
      memberUserId,
      sourceAnswers = {}
    } = params;
    const timeframeDaysCandidate = Number(sourceAnswers['timeframe_days']);
    const timeframeDays = Number.isFinite(timeframeDaysCandidate) && timeframeDaysCandidate > 0
      ? Math.max(1, Math.round(timeframeDaysCandidate))
      : 30;
    const normalized: Record<string, any> = {
      goal_title_label: `${teamName} Team Mission`,
      custom_goal_title: `${teamName} Team Mission`,
      goal_theme_label: sourceAnswers['goal_theme_label'] || 'Team Mission',
      goal_support_label: sourceAnswers['goal_support_label'] || 'Team',
      timeframe: sourceAnswers['timeframe'] || 'month',
      timeframe_days: timeframeDays,
      teamId,
      teamName,
      teamGoal: true,
      teamMemberGoal: true,
      teamSharedGoalId,
      teamMemberUserId: memberUserId
    };
    const sourceDeadline = sourceAnswers['deadlineDate'];
    if (sourceDeadline !== undefined && sourceDeadline !== null && sourceDeadline !== '') {
      normalized['deadlineDate'] = sourceDeadline;
    }
    return normalized;
  }

  private sanitizeMemberForWrite(member: Team['members'][0]): Team['members'][0] {
    const sanitized: Team['members'][0] = {
      userId: member.userId,
      firstName: member.firstName || '',
      lastName: member.lastName || '',
      email: (member.email || '').trim().toLowerCase(),
      role: member.role,
      joinedAt: member.joinedAt
    };

    if (member.profilePictureUrl) {
      sanitized.profilePictureUrl = member.profilePictureUrl;
    }

    return sanitized;
  }

  private sanitizeWritePayload<T extends Record<string, any>>(payload: T): Record<string, any> {
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(payload)) {
      if (value !== undefined) {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  private async getFirestore(): Promise<Firestore> {
    if (!this.firestoreInstance) {
      this.firestoreInstance = (async () => {
        const appModule = await import('firebase/app');
        const firestoreModule = await import('firebase/firestore');

        const app =
          appModule.getApps().length === 0
            ? appModule.initializeApp(firebaseConfig)
            : appModule.getApp();

        return firestoreModule.getFirestore(app);
      })();
    }

    return this.firestoreInstance;
  }

  async createTeam(payload: CreateTeamInput): Promise<string> {
    const firestore = await this.getFirestore();
    const fm = await import('firebase/firestore');
    const collectionRef = fm.collection(firestore, 'teams');
    const missionControlCards = this.normalizeMissionControlCards(payload.missionControlCards);
    const docRef = await fm.addDoc(collectionRef, {
      ...payload,
      missionControlCards,
      createdAt: fm.serverTimestamp(),
      updatedAt: fm.serverTimestamp()
    });
    await fm.updateDoc(docRef, { id: docRef.id });
    return docRef.id;
  }

  async getTeamById(teamId: string): Promise<Team | null> {
    const firestore = await this.getFirestore();
    const fm = await import('firebase/firestore');
    const docRef = fm.doc(firestore, 'teams', teamId);
    const docSnap = await fm.getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as Team;
    }
    return null;
  }

  async getTeamsByUserId(userId: string): Promise<Team[]> {
    const firestore = await this.getFirestore();
    const fm = await import('firebase/firestore');
    const collectionRef = fm.collection(firestore, 'teams');
    const q = fm.query(
      collectionRef,
      fm.where('memberIds', 'array-contains', userId)
    );
    const querySnapshot = await fm.getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Team[];
  }

  async updateTeam(teamId: string, updates: Partial<Team>): Promise<void> {
    const firestore = await this.getFirestore();
    const fm = await import('firebase/firestore');
    const docRef = fm.doc(firestore, 'teams', teamId);
    await fm.updateDoc(docRef, {
      ...updates,
      updatedAt: fm.serverTimestamp()
    });
  }

  async ensureTeamRocketGoal(teamId: string): Promise<string> {
    const team = await this.getTeamById(teamId);
    if (!team) {
      throw new Error('Team not found.');
    }

    const firestore = await this.getFirestore();
    const fm = await import('firebase/firestore');

    const existingGoalId = (team.rocketGoalId || '').trim();
    if (existingGoalId) {
      const existingRef = fm.doc(firestore, 'rocketGoals', existingGoalId);
      const existingSnap = await fm.getDoc(existingRef);
      if (existingSnap.exists()) {
        const data = existingSnap.data() as Record<string, any>;
        const answers = (data?.['answers'] || {}) as Record<string, any>;
        if (answers['teamId'] !== teamId || answers['teamGoal'] !== true) {
          try {
            await fm.updateDoc(existingRef, {
              answers: {
                ...answers,
                teamId,
                teamName: team.name,
                teamGoal: true
              }
            });
          } catch (error) {
            console.warn('Unable to update team goal metadata on existing goal:', error);
          }
        }
        return existingGoalId;
      }
    }

    const goalId = `team-${teamId}`;
    const goalRef = fm.doc(firestore, 'rocketGoals', goalId);
    const goalSnap = await fm.getDoc(goalRef);

    if (!goalSnap.exists()) {
      const adminMember = team.members.find(member => member.userId === team.adminId);
      const teamName = (team.name || 'Team').trim() || 'Team';

      const payload: CreateRocketGoalInput = {
        userId: team.adminId,
        primaryGoal: `${teamName} Team Mission`,
        answers: {
          goal_title_label: `${teamName} Team Mission`,
          custom_goal_title: `${teamName} Team Mission`,
          goal_theme_label: 'Team Mission',
          goal_support_label: 'Team',
          timeframe: 'month',
          timeframe_days: 30,
          teamId,
          teamName,
          teamGoal: true
        },
        participant: {
          firstName: teamName,
          lastName: 'Team',
          email: (adminMember?.email || `team-${teamId}@rocketgoals.local`).trim().toLowerCase()
        },
        status: 'active',
        entryPoint: 'launch_challenge',
        startTime: Date.now(),
        createdAt: fm.serverTimestamp()
      };

      await fm.setDoc(goalRef, {
        id: goalId,
        ...payload,
        createdAt: payload.createdAt || fm.serverTimestamp()
      });
    } else {
      const existingData = goalSnap.data() as Record<string, any>;
      const answers = (existingData?.['answers'] || {}) as Record<string, any>;
      try {
        await fm.updateDoc(goalRef, {
          id: goalId,
          answers: {
            ...answers,
            teamId,
            teamName: team.name,
            teamGoal: true
          }
        });
      } catch (error) {
        console.warn('Unable to update metadata on deterministic team goal:', error);
      }
    }

    try {
      await this.updateTeam(teamId, { rocketGoalId: goalId } as Partial<Team>);
    } catch (error) {
      // Goal can still be used even if team metadata update is restricted.
      console.warn('Unable to persist rocketGoalId on team doc:', error);
    }
    return goalId;
  }

  async ensureMemberTeamRocketGoal(
    teamId: string,
    member: { userId: string; firstName?: string; lastName?: string; email?: string }
  ): Promise<string> {
    const team = await this.getTeamById(teamId);
    if (!team) {
      throw new Error('Team not found.');
    }
    const memberUserId = String(member.userId || '').trim();
    if (!memberUserId) {
      throw new Error('Member user ID is required.');
    }

    const teamSharedGoalId = await this.ensureTeamRocketGoal(teamId);
    if (memberUserId === team.adminId) {
      return teamSharedGoalId;
    }

    const firestore = await this.getFirestore();
    const fm = await import('firebase/firestore');

    const teamName = String(team.name || 'Team').trim() || 'Team';
    const teamSharedGoalRef = fm.doc(firestore, 'rocketGoals', teamSharedGoalId);
    const teamSharedGoalSnap = await fm.getDoc(teamSharedGoalRef);
    const teamSharedGoalData = teamSharedGoalSnap.exists()
      ? (teamSharedGoalSnap.data() as Record<string, any>)
      : null;

    const memberGoalId = this.buildMemberTeamGoalId(teamId, memberUserId);
    const memberGoalRef = fm.doc(firestore, 'rocketGoals', memberGoalId);
    const memberGoalSnap = await fm.getDoc(memberGoalRef);
    const teamMemberRecord = team.members.find(item => item.userId === memberUserId);
    const firstName = String(member.firstName || teamMemberRecord?.firstName || 'Team').trim() || 'Team';
    const lastName = String(member.lastName || teamMemberRecord?.lastName || 'Member').trim() || 'Member';
    const email = String(member.email || teamMemberRecord?.email || `member-${memberUserId}@rocketgoals.local`).trim().toLowerCase();
    const sourceAnswers = (teamSharedGoalData?.['answers'] || {}) as Record<string, any>;
    const baseAnswers = this.buildTeamGoalAnswers({
      teamId,
      teamName,
      teamSharedGoalId,
      memberUserId,
      sourceAnswers
    });

    if (!memberGoalSnap.exists()) {
      const payload: CreateRocketGoalInput = {
        userId: memberUserId,
        primaryGoal: `${teamName} Team Mission`,
        answers: baseAnswers,
        participant: {
          firstName,
          lastName,
          email
        },
        status: 'active',
        entryPoint: 'launch_challenge',
        startTime: Number(teamSharedGoalData?.['startTime']) || Date.now(),
        createdAt: fm.serverTimestamp()
      };
      await fm.setDoc(memberGoalRef, {
        id: memberGoalId,
        ...payload,
        createdAt: payload.createdAt || fm.serverTimestamp()
      });
      return memberGoalId;
    }

    const existingData = memberGoalSnap.data() as Record<string, any>;
    const existingAnswers = (existingData['answers'] || {}) as Record<string, any>;
    const mergedAnswers: Record<string, any> = {
      ...existingAnswers,
      teamId,
      teamName,
      teamGoal: true,
      teamMemberGoal: true,
      teamSharedGoalId,
      teamMemberUserId: memberUserId
    };
    if (!String(mergedAnswers['goal_title_label'] || '').trim()) {
      mergedAnswers['goal_title_label'] = baseAnswers['goal_title_label'];
    }
    if (!String(mergedAnswers['custom_goal_title'] || '').trim()) {
      mergedAnswers['custom_goal_title'] = baseAnswers['custom_goal_title'];
    }
    if (!String(mergedAnswers['goal_theme_label'] || '').trim()) {
      mergedAnswers['goal_theme_label'] = baseAnswers['goal_theme_label'];
    }
    if (!String(mergedAnswers['goal_support_label'] || '').trim()) {
      mergedAnswers['goal_support_label'] = baseAnswers['goal_support_label'];
    }
    if (!String(mergedAnswers['timeframe'] || '').trim()) {
      mergedAnswers['timeframe'] = baseAnswers['timeframe'];
    }
    if (!Number.isFinite(Number(mergedAnswers['timeframe_days'])) || Number(mergedAnswers['timeframe_days']) <= 0) {
      mergedAnswers['timeframe_days'] = baseAnswers['timeframe_days'];
    }
    if (
      (mergedAnswers['deadlineDate'] === undefined || mergedAnswers['deadlineDate'] === null || mergedAnswers['deadlineDate'] === '')
      && baseAnswers['deadlineDate'] !== undefined
    ) {
      mergedAnswers['deadlineDate'] = baseAnswers['deadlineDate'];
    }
    const nextParticipant = {
      firstName: String(existingData?.['participant']?.['firstName'] || firstName).trim() || firstName,
      lastName: String(existingData?.['participant']?.['lastName'] || lastName).trim() || lastName,
      email: String(existingData?.['participant']?.['email'] || email).trim().toLowerCase() || email
    };
    const updates = this.sanitizeWritePayload({
      id: memberGoalId,
      userId: memberUserId,
      primaryGoal: existingData['primaryGoal'] || `${teamName} Team Mission`,
      answers: mergedAnswers,
      participant: nextParticipant
    });
    if (Object.keys(updates).length) {
      await fm.updateDoc(memberGoalRef, updates);
    }
    return memberGoalId;
  }

  async findUserByEmail(email: string): Promise<{ userId: string; firstName: string; lastName: string; email: string; profilePictureUrl?: string } | null> {
    const firestore = await this.getFirestore();
    const fm = await import('firebase/firestore');
    const q = fm.query(
      fm.collection(firestore, 'userProfiles'),
      fm.where('email', '==', email.toLowerCase()),
      fm.limit(1)
    );
    const snapshot = await fm.getDocs(q);
    if (snapshot.empty) return null;
    const data = snapshot.docs[0].data();
    return {
      userId: data['userId'] || snapshot.docs[0].id,
      firstName: data['firstName'] || '',
      lastName: data['lastName'] || '',
      email: data['email'] || email,
      profilePictureUrl: data['profilePictureUrl']
    };
  }

  async searchUsersByEmailPrefix(prefix: string, limitCount = 8): Promise<Array<{
    userId: string;
    firstName: string;
    lastName: string;
    email: string;
    profilePictureUrl?: string;
  }>> {
    const normalizedPrefix = (prefix || '').trim().toLowerCase();
    if (normalizedPrefix.length < 2) {
      return [];
    }

    const firestore = await this.getFirestore();
    const fm = await import('firebase/firestore');
    const usersRef = fm.collection(firestore, 'userProfiles');
    const q = fm.query(
      usersRef,
      fm.where('email', '>=', normalizedPrefix),
      fm.where('email', '<=', `${normalizedPrefix}\uf8ff`),
      fm.limit(limitCount)
    );

    const snapshot = await fm.getDocs(q);
    return snapshot.docs
      .map(doc => {
        const data = doc.data();
        return {
          userId: data['userId'] || doc.id,
          firstName: data['firstName'] || '',
          lastName: data['lastName'] || '',
          email: (data['email'] || '').toString().trim().toLowerCase(),
          profilePictureUrl: data['profilePictureUrl']
        };
      })
      .filter(user => !!user.email);
  }

  async sendTeamInviteEmail(payload: {
    teamId: string;
    inviteeEmail: string;
    inviteeName?: string;
    teamName?: string;
    teamUrl?: string;
  }): Promise<void> {
    const appModule = await import('firebase/app');
    const app =
      appModule.getApps().length === 0
        ? appModule.initializeApp(firebaseConfig)
        : appModule.getApp();

    const functionsModule = await import('firebase/functions');
    const functions = functionsModule.getFunctions(app, 'us-central1');
    const sendInvite = functionsModule.httpsCallable(functions, 'sendTeamInviteEmail');
    await sendInvite(payload);
  }

  async addMemberToTeam(teamId: string, member: Team['members'][0]): Promise<void> {
    const team = await this.getTeamById(teamId);
    if (!team) {
      throw new Error('Team not found.');
    }

    const sanitizedInput = this.sanitizeMemberForWrite(member);
    const existingMember = team.members.find(m => m.userId === sanitizedInput.userId);

    const mergedMember = existingMember
      ? {
          ...this.sanitizeMemberForWrite(existingMember),
          ...existingMember,
          ...sanitizedInput,
          // Preserve elevated roles when re-adding an existing member.
          role: existingMember.role === 'admin' || existingMember.role === 'coach' || existingMember.role === 'captain' || existingMember.role === 'team-lead'
            ? existingMember.role
            : sanitizedInput.role,
          joinedAt: existingMember.joinedAt || sanitizedInput.joinedAt
        }
      : sanitizedInput;

    const nextMembers = existingMember
      ? team.members.map(m => (m.userId === sanitizedInput.userId ? mergedMember : this.sanitizeMemberForWrite(m)))
      : [...team.members, mergedMember];

    const nextMemberIds = team.memberIds.includes(sanitizedInput.userId)
      ? team.memberIds
      : [...team.memberIds, sanitizedInput.userId];

    const firestore = await this.getFirestore();
    const fm = await import('firebase/firestore');
    const docRef = fm.doc(firestore, 'teams', teamId);
    await fm.updateDoc(docRef, {
      members: nextMembers,
      memberIds: nextMemberIds,
      updatedAt: fm.serverTimestamp()
    });
  }

  async assignTeamLead(teamId: string, targetUserId: string | null): Promise<void> {
    const team = await this.getTeamById(teamId);
    if (!team) {
      throw new Error('Team not found.');
    }

    if (targetUserId) {
      const target = team.members.find(m => m.userId === targetUserId);
      if (!target) {
        throw new Error('Selected member was not found in this team.');
      }
      if (target.role === 'admin' || target.role === 'coach') {
        throw new Error('Only team members can be assigned as Team Lead.');
      }
    }

    const nextMembers = team.members.map(member => {
      const sanitized = this.sanitizeMemberForWrite(member);

      if (!targetUserId) {
        if (sanitized.role === 'team-lead') {
          return { ...sanitized, role: 'member' as const };
        }
        return sanitized;
      }

      if (sanitized.userId === targetUserId) {
        return { ...sanitized, role: 'team-lead' as const };
      }

      if (sanitized.role === 'team-lead') {
        return { ...sanitized, role: 'member' as const };
      }

      return sanitized;
    });

    const firestore = await this.getFirestore();
    const fm = await import('firebase/firestore');
    const docRef = fm.doc(firestore, 'teams', teamId);
    await fm.updateDoc(docRef, {
      members: nextMembers,
      updatedAt: fm.serverTimestamp()
    });
  }

  async assignMemberRole(teamId: string, targetUserId: string, role: 'member' | 'coach' | 'captain'): Promise<void> {
    const team = await this.getTeamById(teamId);
    if (!team) {
      throw new Error('Team not found.');
    }

    const target = team.members.find(member => member.userId === targetUserId);
    if (!target) {
      throw new Error('Selected member was not found in this team.');
    }
    if (target.role === 'admin') {
      throw new Error('Admin role cannot be changed.');
    }

    const nextMembers = team.members.map(member => {
      const sanitized = this.sanitizeMemberForWrite(member);
      if (sanitized.userId !== targetUserId) {
        return sanitized;
      }
      return { ...sanitized, role };
    });

    const firestore = await this.getFirestore();
    const fm = await import('firebase/firestore');
    const docRef = fm.doc(firestore, 'teams', teamId);
    await fm.updateDoc(docRef, {
      members: nextMembers,
      updatedAt: fm.serverTimestamp()
    });
  }

  async removeMemberFromTeam(teamId: string, userId: string): Promise<void> {
    const team = await this.getTeamById(teamId);
    if (!team) return;
    const firestore = await this.getFirestore();
    const fm = await import('firebase/firestore');
    const docRef = fm.doc(firestore, 'teams', teamId);
    await fm.updateDoc(docRef, {
      members: team.members.filter(m => m.userId !== userId),
      memberIds: team.memberIds.filter(id => id !== userId),
      updatedAt: fm.serverTimestamp()
    });

    try {
      await this.cleanupRemovedMemberArtifacts(teamId, userId);
    } catch (error) {
      console.warn('Unable to fully clean up removed member artifacts:', error);
    }
  }

  private async cleanupRemovedMemberArtifacts(teamId: string, userId: string): Promise<void> {
    const firestore = await this.getFirestore();
    const fm = await import('firebase/firestore');

    const memberGoalIdsToDelete = new Set<string>([
      this.buildMemberTeamGoalId(teamId, userId)
    ]);
    const teamGoalIdsForProfileCleanup = new Set<string>([
      this.buildMemberTeamGoalId(teamId, userId),
      `team-${teamId}`
    ]);

    const userGoalsQuery = fm.query(
      fm.collection(firestore, 'rocketGoals'),
      fm.where('userId', '==', userId)
    );
    const userGoalsSnapshot = await fm.getDocs(userGoalsQuery);
    for (const goalDoc of userGoalsSnapshot.docs) {
      const goalData = goalDoc.data() as Record<string, any>;
      if (this.isTeamGoalForTeam(goalData, teamId)) {
        memberGoalIdsToDelete.add(goalDoc.id);
        teamGoalIdsForProfileCleanup.add(goalDoc.id);
      }
    }

    const profileQuery = fm.query(
      fm.collection(firestore, 'userProfiles'),
      fm.where('userId', '==', userId),
      fm.limit(1)
    );
    const profileSnapshot = await fm.getDocs(profileQuery);
    let profileDoc: any = !profileSnapshot.empty
      ? profileSnapshot.docs[0]
      : null;

    if (!profileDoc) {
      const fallbackProfileRef = fm.doc(firestore, 'userProfiles', userId);
      const fallbackProfileSnap = await fm.getDoc(fallbackProfileRef);
      if (fallbackProfileSnap.exists()) {
        profileDoc = fallbackProfileSnap;
      }
    }

    if (profileDoc) {
      const profileData = profileDoc.data() as Record<string, any>;
      const selectedGoalId = String(profileData['myOneThingGoalId'] || '').trim();
      if (selectedGoalId && teamGoalIdsForProfileCleanup.has(selectedGoalId)) {
        await fm.updateDoc(profileDoc.ref, {
          myOneThingGoalId: fm.deleteField()
        });
      }
    }

    await Promise.all(
      Array.from(memberGoalIdsToDelete).map(async goalId => {
        if (!goalId) {
          return;
        }
        try {
          await fm.deleteDoc(fm.doc(firestore, 'rocketGoals', goalId));
        } catch {
          // Goal may not exist or may already be deleted.
        }
      })
    );

    const conversationRef = fm.doc(firestore, 'teams', teamId, 'memberConversations', userId);
    const directMessagesRef = fm.collection(conversationRef, 'messages');
    const directMessagesSnapshot = await fm.getDocs(directMessagesRef);
    if (!directMessagesSnapshot.empty) {
      await Promise.all(directMessagesSnapshot.docs.map(doc => fm.deleteDoc(doc.ref)));
    }
    try {
      await fm.deleteDoc(conversationRef);
    } catch {
      // Missing conversation doc is acceptable.
    }
  }

  async sendMessage(teamId: string, message: Omit<TeamMessage, 'id' | 'timestamp'>): Promise<string> {
    const firestore = await this.getFirestore();
    const fm = await import('firebase/firestore');
    const messagesRef = fm.collection(firestore, 'teams', teamId, 'messages');
    const payload = this.sanitizeWritePayload({
      ...message,
      timestamp: fm.serverTimestamp()
    });
    const docRef = await fm.addDoc(messagesRef, payload);
    await fm.updateDoc(docRef, { id: docRef.id });
    return docRef.id;
  }

  async getMessages(teamId: string, limitCount = 50): Promise<TeamMessage[]> {
    const firestore = await this.getFirestore();
    const fm = await import('firebase/firestore');
    const messagesRef = fm.collection(firestore, 'teams', teamId, 'messages');
    try {
      const q = fm.query(messagesRef, fm.orderBy('timestamp', 'desc'), fm.limit(limitCount));
      const snapshot = await fm.getDocs(q);
      return snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }) as TeamMessage)
        .reverse();
    } catch {
      const snapshot = await fm.getDocs(fm.query(messagesRef, fm.limit(limitCount)));
      return snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }) as TeamMessage)
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    }
  }

  async sendDirectMessage(
    teamId: string,
    participantUserId: string,
    message: Omit<TeamDirectMessage, 'id' | 'timestamp' | 'teamId' | 'participantUserId'>
  ): Promise<string> {
    const firestore = await this.getFirestore();
    const fm = await import('firebase/firestore');
    const messagesRef = fm.collection(
      firestore,
      'teams',
      teamId,
      'memberConversations',
      participantUserId,
      'messages'
    );
    const payload = this.sanitizeWritePayload({
      ...message,
      teamId,
      participantUserId,
      timestamp: fm.serverTimestamp()
    });
    const docRef = await fm.addDoc(messagesRef, payload);
    await fm.updateDoc(docRef, { id: docRef.id });
    return docRef.id;
  }

  async getDirectMessages(teamId: string, participantUserId: string, limitCount = 100): Promise<TeamDirectMessage[]> {
    const firestore = await this.getFirestore();
    const fm = await import('firebase/firestore');
    const messagesRef = fm.collection(
      firestore,
      'teams',
      teamId,
      'memberConversations',
      participantUserId,
      'messages'
    );
    try {
      const q = fm.query(messagesRef, fm.orderBy('timestamp', 'desc'), fm.limit(limitCount));
      const snapshot = await fm.getDocs(q);
      return snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }) as TeamDirectMessage)
        .reverse();
    } catch {
      const snapshot = await fm.getDocs(fm.query(messagesRef, fm.limit(limitCount)));
      return snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }) as TeamDirectMessage)
        .sort((a, b) => {
          const left = this.getTimestampMillis(a.timestamp) || 0;
          const right = this.getTimestampMillis(b.timestamp) || 0;
          return left - right;
        });
    }
  }

  async getMemberConversationPreviews(teamId: string, memberUserIds: string[]): Promise<TeamMemberConversationPreview[]> {
    const uniqueMemberIds = Array.from(new Set(memberUserIds.filter(Boolean)));
    const previews = await Promise.all(
      uniqueMemberIds.map(async memberUserId => {
        const messages = await this.getDirectMessages(teamId, memberUserId, 1);
        return {
          memberUserId,
          lastMessage: messages.length ? messages[0] : null
        } as TeamMemberConversationPreview;
      })
    );

    return previews.sort((a, b) => {
      const left = this.getTimestampMillis(a.lastMessage?.timestamp) || 0;
      const right = this.getTimestampMillis(b.lastMessage?.timestamp) || 0;
      return right - left;
    });
  }

  async getMemberActivitySnapshot(teamId: string, memberUserId: string): Promise<TeamMemberActivitySnapshot> {
    const team = await this.getTeamById(teamId);
    if (!team) {
      throw new Error('Team not found.');
    }
    const isMember = team.memberIds.includes(memberUserId) || team.members.some(member => member.userId === memberUserId);
    if (!isMember) {
      throw new Error('Member not found in this team.');
    }

    const firestore = await this.getFirestore();
    const fm = await import('firebase/firestore');

    const profileQuery = fm.query(
      fm.collection(firestore, 'userProfiles'),
      fm.where('userId', '==', memberUserId),
      fm.limit(1)
    );
    const profileSnapshot = await fm.getDocs(profileQuery);
    let profileData: Record<string, any> | null = null;
    if (!profileSnapshot.empty) {
      profileData = profileSnapshot.docs[0].data() as Record<string, any>;
    } else {
      const profileDoc = await fm.getDoc(fm.doc(firestore, 'userProfiles', memberUserId));
      if (profileDoc.exists()) {
        profileData = profileDoc.data() as Record<string, any>;
      }
    }

    const emptySnapshot = (resolvedGoalId: string | null): TeamMemberActivitySnapshot => ({
      memberUserId,
      goalId: resolvedGoalId,
      primaryGoal: null,
      missionDay: null,
      totalDays: null,
      completedMilestones: 0,
      totalMilestones: 0,
      completedToday: 0,
      totalToday: 0,
      latestMissionLogAt: null,
      latestIgnitionAt: null,
      latestMilestoneUpdateAt: null,
      latestActivityAt: null
    });

    const profileGoalId = String(profileData?.['myOneThingGoalId'] || '').trim();
    let goalId: string | null = null;
    let goalDoc: any = null;

    const memberGoalId = this.buildMemberTeamGoalId(teamId, memberUserId);
    const memberGoalDoc = await fm.getDoc(fm.doc(firestore, 'rocketGoals', memberGoalId));
    if (memberGoalDoc.exists()) {
      const goalData = memberGoalDoc.data() as Record<string, any>;
      if (this.isTeamGoalForTeam(goalData, teamId)) {
        goalId = memberGoalId;
        goalDoc = memberGoalDoc;
      }
    }

    if (!goalDoc && profileGoalId) {
      const selectedGoalDoc = await fm.getDoc(fm.doc(firestore, 'rocketGoals', profileGoalId));
      if (selectedGoalDoc.exists()) {
        const selectedGoalData = selectedGoalDoc.data() as Record<string, any>;
        if (
          String(selectedGoalData['userId'] || '').trim() === memberUserId
          && this.isTeamGoalForTeam(selectedGoalData, teamId)
        ) {
          goalId = profileGoalId;
          goalDoc = selectedGoalDoc;
        }
      }
    }

    if (!goalDoc) {
      try {
        const memberRecord = team.members.find(member => member.userId === memberUserId);
        goalId = await this.ensureMemberTeamRocketGoal(teamId, {
          userId: memberUserId,
          firstName: memberRecord?.firstName || '',
          lastName: memberRecord?.lastName || '',
          email: memberRecord?.email || ''
        });
        if (goalId) {
          const createdGoalDoc = await fm.getDoc(fm.doc(firestore, 'rocketGoals', goalId));
          if (createdGoalDoc.exists()) {
            goalDoc = createdGoalDoc;
          }
        }
      } catch (error) {
        console.warn('Unable to ensure member-specific team goal for snapshot:', error);
      }
    }

    if (!goalId) {
      return emptySnapshot(null);
    }
    if (!goalDoc?.exists()) {
      return emptySnapshot(goalId);
    }

    const goal = goalDoc.data() as Record<string, any>;
    const totalDays = this.getGoalTotalDays(goal);
    const missionDay = this.getMissionDay(goal, totalDays);

    const actionItemsSnapshot = await fm.getDocs(fm.collection(firestore, 'rocketGoals', goalId, 'actionItems'));
    const actionItems = actionItemsSnapshot.docs.map(doc => doc.data() as Record<string, any>);

    const totalMilestones = actionItems.length;
    const completedMilestones = actionItems.filter(item => !!item['completed']).length;
    const todayItems = actionItems.filter(item => Number(item['dayNumber']) === missionDay);
    const totalToday = todayItems.length;
    const completedToday = todayItems.filter(item => !!item['completed']).length;
    const latestMilestoneUpdateAt = actionItems.reduce<number | null>((latest, item) => {
      const updatedAt = this.getTimestampMillis(item['updatedAt']) ?? this.getTimestampMillis(item['createdAt']);
      if (updatedAt === null) {
        return latest;
      }
      if (latest === null) {
        return updatedAt;
      }
      return Math.max(latest, updatedAt);
    }, null);

    const fetchLatestFromSubcollection = async (subCollection: 'missionLogs' | 'dailyIgnitions'): Promise<number | null> => {
      const subRef = fm.collection(firestore, 'rocketGoals', goalId, subCollection);
      try {
        const q = fm.query(subRef, fm.orderBy('createdAtMs', 'desc'), fm.limit(1));
        const snapshot = await fm.getDocs(q);
        if (snapshot.empty) {
          return null;
        }
        const data = snapshot.docs[0].data() as Record<string, any>;
        return this.getTimestampMillis(data['createdAtMs']) ?? this.getTimestampMillis(data['createdAt']);
      } catch {
        const snapshot = await fm.getDocs(fm.query(subRef, fm.limit(25)));
        let latest: number | null = null;
        for (const doc of snapshot.docs) {
          const data = doc.data() as Record<string, any>;
          const timestamp = this.getTimestampMillis(data['createdAtMs']) ?? this.getTimestampMillis(data['createdAt']);
          if (timestamp === null) {
            continue;
          }
          latest = latest === null ? timestamp : Math.max(latest, timestamp);
        }
        return latest;
      }
    };

    const [latestMissionLogAt, latestIgnitionAt] = await Promise.all([
      fetchLatestFromSubcollection('missionLogs'),
      fetchLatestFromSubcollection('dailyIgnitions')
    ]);

    const latestActivityAt = [latestMissionLogAt, latestIgnitionAt, latestMilestoneUpdateAt]
      .filter((value): value is number => value !== null)
      .reduce<number | null>((latest, value) => (latest === null ? value : Math.max(latest, value)), null);

    return {
      memberUserId,
      goalId,
      primaryGoal: String(goal['primaryGoal'] || '').trim() || null,
      missionDay,
      totalDays,
      completedMilestones,
      totalMilestones,
      completedToday,
      totalToday,
      latestMissionLogAt,
      latestIgnitionAt,
      latestMilestoneUpdateAt,
      latestActivityAt
    };
  }

  async uploadTeamCoverImage(teamId: string, file: File): Promise<string> {
    const appModule = await import('firebase/app');
    const storageModule = await import('firebase/storage');
    const app = appModule.getApps().length === 0
      ? appModule.initializeApp(firebaseConfig)
      : appModule.getApp();
    const storage = storageModule.getStorage(app);

    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `cover-${Date.now()}.${ext}`;
    const storageRef = storageModule.ref(storage, `teams/${teamId}/${fileName}`);
    await storageModule.uploadBytes(storageRef, file);
    const downloadUrl = await storageModule.getDownloadURL(storageRef);

    await this.updateTeam(teamId, { coverImageUrl: downloadUrl } as Partial<Team>);
    return downloadUrl;
  }

  async setupTeamTelegramGroup(teamId: string): Promise<{
    success: boolean;
    needsGroupCreation?: boolean;
    deepLink?: string;
    alreadyConnected?: boolean;
    telegramGroupId?: number;
    telegramGroupInviteLink?: string;
    telegramGroupTitle?: string;
  }> {
    const appModule = await import('firebase/app');
    const app =
      appModule.getApps().length === 0
        ? appModule.initializeApp(firebaseConfig)
        : appModule.getApp();

    const functionsModule = await import('firebase/functions');
    const functions = functionsModule.getFunctions(app, 'us-central1');
    const setup = functionsModule.httpsCallable(functions, 'setupTeamTelegramGroup');
    const result = await setup({ teamId });
    return result.data as {
      success: boolean;
      needsGroupCreation?: boolean;
      deepLink?: string;
      alreadyConnected?: boolean;
      telegramGroupId?: number;
      telegramGroupInviteLink?: string;
      telegramGroupTitle?: string;
    };
  }

  async askTeamAiCoach(teamId: string, message: string, recentMessages?: Array<{ senderName: string; content: string; type: string }>): Promise<string> {
    const appModule = await import('firebase/app');
    const app =
      appModule.getApps().length === 0
        ? appModule.initializeApp(firebaseConfig)
        : appModule.getApp();

    const functionsModule = await import('firebase/functions');
    const functions = functionsModule.getFunctions(app, 'us-central1');
    const ask = functionsModule.httpsCallable(functions, 'askTeamAiCoach');
    const result = await ask({ teamId, message, recentMessages });
    return (result.data as { success: boolean; response: string }).response;
  }

  async deleteTeam(teamId: string): Promise<void> {
    const firestore = await this.getFirestore();
    const fm = await import('firebase/firestore');
    const messagesRef = fm.collection(firestore, 'teams', teamId, 'messages');
    const snapshot = await fm.getDocs(messagesRef);
    await Promise.all(snapshot.docs.map(doc => fm.deleteDoc(doc.ref)));
    const docRef = fm.doc(firestore, 'teams', teamId);
    await fm.deleteDoc(docRef);
  }
}

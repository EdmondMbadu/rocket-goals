import { Injectable } from '@angular/core';
import type { Firestore } from 'firebase/firestore';
import { firebaseConfig } from '../../environments/environment';
import { CreateTeamInput, Team, TeamMessage } from './models/team';
import { CreateRocketGoalInput } from './models/rocket-goal';

@Injectable({ providedIn: 'root' })
export class TeamService {
  private firestoreInstance?: Promise<Firestore>;
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
    const docRef = await fm.addDoc(collectionRef, {
      ...payload,
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
          role: existingMember.role === 'admin' || existingMember.role === 'coach' || existingMember.role === 'team-lead'
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
  }

  async sendMessage(teamId: string, message: Omit<TeamMessage, 'id' | 'timestamp'>): Promise<string> {
    const firestore = await this.getFirestore();
    const fm = await import('firebase/firestore');
    const messagesRef = fm.collection(firestore, 'teams', teamId, 'messages');
    const docRef = await fm.addDoc(messagesRef, {
      ...message,
      timestamp: fm.serverTimestamp()
    });
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

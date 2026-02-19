import { Injectable } from '@angular/core';
import type { Firestore } from 'firebase/firestore';
import { firebaseConfig } from '../../environments/environment';
import { CreateTeamInput, Team, TeamMessage } from './models/team';

@Injectable({ providedIn: 'root' })
export class TeamService {
  private firestoreInstance?: Promise<Firestore>;

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

  async addMemberToTeam(teamId: string, member: Team['members'][0]): Promise<void> {
    const firestore = await this.getFirestore();
    const fm = await import('firebase/firestore');
    const docRef = fm.doc(firestore, 'teams', teamId);
    await fm.updateDoc(docRef, {
      members: fm.arrayUnion(member),
      memberIds: fm.arrayUnion(member.userId),
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

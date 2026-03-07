import { Injectable } from '@angular/core';
import type { Firestore } from 'firebase/firestore';
import { firebaseConfig } from '../../environments/environment';

export interface CommunityCoach {
  id: string;
  creatorUserId: string;
  coachName: string;
  avatar: string;
  soulFilet: string;
  appName: string;
  tagline: string;
  description: string;
  icon: string;
  category: string;
  visibility: 'public' | 'private';
  defaultGoals: {
    primaryGoal: string;
    theme: string;
    dailyEffort: string;
    objectives: string[];
  };
  createdAt?: unknown;
  imageUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class CommunityCoachService {
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

  async saveCommunityCoach(payload: {
    coachName: string;
    avatar: string;
    soulFilet: string;
    appName: string;
    tagline: string;
    description: string;
    icon: string;
    category: string;
    visibility: 'public' | 'private';
    defaultGoals: {
      primaryGoal: string;
      theme: string;
      dailyEffort: string;
      objectives: string[];
    };
  }): Promise<{ success: boolean; coachId: string }> {
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const { getApp } = await import('firebase/app');
    const fn = httpsCallable(getFunctions(getApp()), 'saveCommunityCoach');
    const result = await fn(payload);
    return result.data as { success: boolean; coachId: string };
  }

  async generateAvatar(payload: {
    coachName: string;
    coachDescription: string;
    category: string;
  }): Promise<{ success: boolean; imageUrl?: string }> {
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const { getApp } = await import('firebase/app');
    const fn = httpsCallable(
      getFunctions(getApp(), 'us-central1'),
      'generateCoachAvatar',
      { timeout: 60_000 }
    );
    const result = await fn(payload);
    return result.data as { success: boolean; imageUrl?: string };
  }

  async getPublicCoaches(): Promise<CommunityCoach[]> {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');
    const ref = firestoreModule.collection(firestore, 'communityCoaches');
    const q = firestoreModule.query(
      ref,
      firestoreModule.where('visibility', '==', 'public')
    );
    const snapshot = await firestoreModule.getDocs(q);
    const coaches = snapshot.docs.map((doc) => ({
      ...(doc.data() as Omit<CommunityCoach, 'id'>),
      id: doc.id
    }));
    return coaches.sort((a, b) => {
      const ta = (a.createdAt as any)?.toMillis?.() || 0;
      const tb = (b.createdAt as any)?.toMillis?.() || 0;
      return tb - ta;
    });
  }

  async getMyCoaches(userId: string): Promise<CommunityCoach[]> {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');
    const ref = firestoreModule.collection(firestore, 'communityCoaches');
    const q = firestoreModule.query(
      ref,
      firestoreModule.where('creatorUserId', '==', userId)
    );
    const snapshot = await firestoreModule.getDocs(q);
    const coaches = snapshot.docs.map((doc) => ({
      ...(doc.data() as Omit<CommunityCoach, 'id'>),
      id: doc.id
    }));
    return coaches.sort((a, b) => {
      const ta = (a.createdAt as any)?.toMillis?.() || 0;
      const tb = (b.createdAt as any)?.toMillis?.() || 0;
      return tb - ta;
    });
  }

  async deleteCommunityCoach(coachId: string): Promise<{ success: boolean }> {
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const { getApp } = await import('firebase/app');
    const fn = httpsCallable(getFunctions(getApp()), 'deleteCommunityCoach');
    const result = await fn({ coachId });
    return result.data as { success: boolean };
  }
}

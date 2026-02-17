import { Injectable } from '@angular/core';
import type { Firestore } from 'firebase/firestore';
import { firebaseConfig } from '../../environments/environment';

export type CoachPromptConfig = {
  templateId: string;
  appName: string;
  coachName: string;
  avatar: string;
  soulFilet: string;
  updatedAt?: unknown;
  updatedBy?: string;
};

@Injectable({ providedIn: 'root' })
export class CoachPromptsService {
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

  async getAllConfigs(): Promise<Record<string, CoachPromptConfig>> {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');
    const ref = firestoreModule.collection(firestore, 'coachPrompts');
    const snapshot = await firestoreModule.getDocs(ref);
    const result: Record<string, CoachPromptConfig> = {};
    snapshot.forEach((doc) => {
      const data = doc.data() as Partial<CoachPromptConfig>;
      if (!data.templateId) return;
      result[data.templateId] = {
        templateId: data.templateId,
        appName: data.appName || '',
        coachName: data.coachName || '',
        avatar: data.avatar || '',
        soulFilet: data.soulFilet || '',
        updatedAt: data.updatedAt,
        updatedBy: data.updatedBy
      };
    });
    return result;
  }

  async getConfig(templateId: string): Promise<CoachPromptConfig | null> {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');
    const ref = firestoreModule.doc(firestore, 'coachPrompts', templateId);
    const snapshot = await firestoreModule.getDoc(ref);
    if (!snapshot.exists()) return null;
    const data = snapshot.data() as Partial<CoachPromptConfig>;
    if (!data.templateId) return null;
    return {
      templateId: data.templateId,
      appName: data.appName || '',
      coachName: data.coachName || '',
      avatar: data.avatar || '',
      soulFilet: data.soulFilet || '',
      updatedAt: data.updatedAt,
      updatedBy: data.updatedBy
    };
  }

  async saveConfig(payload: {
    templateId: string;
    appName: string;
    coachName: string;
    avatar: string;
    soulFilet: string;
    applyToExistingGoals?: boolean;
  }) {
    const { getFunctions, httpsCallable } = await import('firebase/functions');
    const { getApp } = await import('firebase/app');
    const fn = httpsCallable(getFunctions(getApp()), 'saveCoachPromptConfig');
    const result = await fn(payload);
    return result.data as { success: boolean; updatedGoals: number };
  }
}

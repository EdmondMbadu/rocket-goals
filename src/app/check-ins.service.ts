import { Injectable } from '@angular/core';
import type { Firestore } from 'firebase/firestore';
import { firebaseConfig } from '../../environments/environment';
import type {
  DailyIgnition,
  IgnitionConfidence,
  IgnitionOneThingChoice,
  IgnitionTimeOfDay,
  MissionActionTaken,
  MissionChallengeLevel,
  MissionFeeling,
  MissionFocusLevel,
  MissionLog,
  MissionLogCoaching,
  MissionTeamConnection
} from './models/check-ins';

export type DailyIgnitionInput = {
  goalId: string;
  oneThingChoice: IgnitionOneThingChoice;
  oneThingText?: string;
  timeOfDay: IgnitionTimeOfDay;
  confidence: IgnitionConfidence;
};

export type MissionLogInput = {
  goalId: string;
  actionTaken: MissionActionTaken;
  focusLevel: MissionFocusLevel;
  challengeLevel: MissionChallengeLevel;
  feeling: MissionFeeling;
  teamConnection: MissionTeamConnection;
  note?: string;
  intendedOneThing?: string;
  aiCoaching?: MissionLogCoaching;
};

@Injectable({ providedIn: 'root' })
export class CheckInsService {
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

  private getTodayId(date = new Date()): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private stripUndefined<T extends Record<string, unknown>>(value: T): T {
    const cleaned = { ...value };
    Object.keys(cleaned).forEach(key => {
      if (cleaned[key] === undefined) {
        delete cleaned[key];
      }
    });
    return cleaned;
  }

  async upsertDailyIgnition(input: DailyIgnitionInput): Promise<string> {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');
    const dateId = this.getTodayId();
    const docRef = firestoreModule.doc(
      firestore,
      'rocketGoals',
      input.goalId,
      'dailyIgnitions',
      dateId
    );

    await firestoreModule.setDoc(
      docRef,
      this.stripUndefined({
        ...input,
        goalId: input.goalId,
        dateId,
        createdAt: firestoreModule.serverTimestamp(),
        createdAtMs: Date.now()
      }),
      { merge: true }
    );

    return dateId;
  }

  async upsertMissionLog(input: MissionLogInput): Promise<string> {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');
    const dateId = this.getTodayId();
    const docRef = firestoreModule.doc(
      firestore,
      'rocketGoals',
      input.goalId,
      'missionLogs',
      dateId
    );

    await firestoreModule.setDoc(
      docRef,
      this.stripUndefined({
        ...input,
        goalId: input.goalId,
        dateId,
        createdAt: firestoreModule.serverTimestamp(),
        createdAtMs: Date.now()
      }),
      { merge: true }
    );

    return dateId;
  }

  async getLatestDailyIgnition(goalId: string): Promise<DailyIgnition | null> {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');
    const collectionRef = firestoreModule.collection(firestore, 'rocketGoals', goalId, 'dailyIgnitions');
    const q = firestoreModule.query(collectionRef, firestoreModule.orderBy('createdAtMs', 'desc'), firestoreModule.limit(1));
    const snapshot = await firestoreModule.getDocs(q);
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data()
    } as DailyIgnition;
  }

  async getLatestMissionLog(goalId: string): Promise<MissionLog | null> {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');
    const collectionRef = firestoreModule.collection(firestore, 'rocketGoals', goalId, 'missionLogs');
    const q = firestoreModule.query(collectionRef, firestoreModule.orderBy('createdAtMs', 'desc'), firestoreModule.limit(1));
    const snapshot = await firestoreModule.getDocs(q);
    if (snapshot.empty) return null;
    const doc = snapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data()
    } as MissionLog;
  }

  async getRecentDailyIgnitions(goalId: string, limitCount = 30): Promise<DailyIgnition[]> {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');
    const collectionRef = firestoreModule.collection(firestore, 'rocketGoals', goalId, 'dailyIgnitions');
    const q = firestoreModule.query(collectionRef, firestoreModule.orderBy('createdAtMs', 'desc'), firestoreModule.limit(limitCount));
    const snapshot = await firestoreModule.getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as DailyIgnition));
  }

  async getRecentMissionLogs(goalId: string, limitCount = 30): Promise<MissionLog[]> {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');
    const collectionRef = firestoreModule.collection(firestore, 'rocketGoals', goalId, 'missionLogs');
    const q = firestoreModule.query(collectionRef, firestoreModule.orderBy('createdAtMs', 'desc'), firestoreModule.limit(limitCount));
    const snapshot = await firestoreModule.getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as MissionLog));
  }
}

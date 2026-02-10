import { Injectable } from '@angular/core';
import type { Firestore } from 'firebase/firestore';
import type { FirebaseStorage } from 'firebase/storage';
import { firebaseConfig } from '../../environments/environment';
import type {
  DailyIgnition,
  IgnitionConfidence,
  IgnitionOneThingChoice,
  IgnitionTimeOfDay,
  JourneyPhoto,
  JourneyPhotoSource,
  MissionActionTaken,
  MissionChallengeLevel,
  MissionFeeling,
  MissionFocusLevel,
  MissionLog,
  MissionLogCoaching,
  MissionTeamConnection,
  WeeklyResetSummary
} from './models/check-ins';

export type DailyIgnitionInput = {
  goalId: string;
  oneThingChoice: IgnitionOneThingChoice;
  oneThingText?: string;
  timeOfDay: IgnitionTimeOfDay;
  confidence: IgnitionConfidence;
  activationRitual?: {
    breathsComplete?: boolean;
    identityStatementComplete?: boolean;
    environmentalCue?: string;
  };
  commitment?: {
    task?: string;
    accountabilityPartner?: string;
    messageSent?: boolean;
    burnDurationSeconds?: number;
  };
  execution?: {
    actionTaken?: MissionActionTaken;
    focusLevel?: MissionFocusLevel;
    challengeLevel?: MissionChallengeLevel;
    feeling?: MissionFeeling;
    teamConnection?: MissionTeamConnection;
  };
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
    const collectionRef = firestoreModule.collection(
      firestore,
      'rocketGoals',
      input.goalId,
      'dailyIgnitions'
    );

    const docRef = await firestoreModule.addDoc(
      collectionRef,
      this.stripUndefined({
        ...input,
        goalId: input.goalId,
        dateId,
        createdAt: firestoreModule.serverTimestamp(),
        createdAtMs: Date.now()
      })
    );

    return docRef.id;
  }

  async upsertMissionLog(input: MissionLogInput): Promise<string> {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');
    const dateId = this.getTodayId();
    const collectionRef = firestoreModule.collection(
      firestore,
      'rocketGoals',
      input.goalId,
      'missionLogs'
    );

    const docRef = await firestoreModule.addDoc(
      collectionRef,
      this.stripUndefined({
        ...input,
        goalId: input.goalId,
        dateId,
        createdAt: firestoreModule.serverTimestamp(),
        createdAtMs: Date.now()
      })
    );

    return docRef.id;
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

  async saveWeeklyResetSummary(goalId: string, summary: Omit<WeeklyResetSummary, 'id' | 'goalId'>): Promise<string> {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');
    const collectionRef = firestoreModule.collection(firestore, 'rocketGoals', goalId, 'weeklyResets');
    const docRef = await firestoreModule.addDoc(collectionRef, {
      ...summary,
      goalId,
      createdAt: firestoreModule.serverTimestamp(),
      createdAtMs: Date.now()
    });
    return docRef.id;
  }

  async getWeeklyResets(goalId: string, limitCount = 8): Promise<WeeklyResetSummary[]> {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');
    const collectionRef = firestoreModule.collection(firestore, 'rocketGoals', goalId, 'weeklyResets');
    const q = firestoreModule.query(collectionRef, firestoreModule.orderBy('weekStartMs', 'desc'), firestoreModule.limit(limitCount));
    const snapshot = await firestoreModule.getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as WeeklyResetSummary));
  }

  private async getStorage(): Promise<FirebaseStorage> {
    const appModule = await import('firebase/app');
    const storageModule = await import('firebase/storage');
    const app =
      appModule.getApps().length === 0
        ? appModule.initializeApp(firebaseConfig)
        : appModule.getApp();
    return storageModule.getStorage(app);
  }

  async uploadJourneyPhoto(
    goalId: string,
    file: File,
    source: JourneyPhotoSource,
    caption?: string
  ): Promise<JourneyPhoto> {
    const storage = await this.getStorage();
    const storageModule = await import('firebase/storage');
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');

    const dateId = this.getTodayId();
    const timestamp = Date.now();
    const fileExtension = file.name.split('.').pop() || 'jpg';
    const fileName = `journey-${dateId}-${timestamp}.${fileExtension}`;
    const storagePath = `journey-photos/${goalId}/${fileName}`;

    const storageRef = storageModule.ref(storage, storagePath);
    await storageModule.uploadBytes(storageRef, file);
    const imageUrl = await storageModule.getDownloadURL(storageRef);

    const collectionRef = firestoreModule.collection(
      firestore,
      'rocketGoals',
      goalId,
      'journeyPhotos'
    );

    const docData = this.stripUndefined({
      goalId,
      dateId,
      imageUrl,
      caption,
      source,
      createdAt: firestoreModule.serverTimestamp(),
      createdAtMs: timestamp
    });

    const docRef = await firestoreModule.addDoc(collectionRef, docData);

    return {
      id: docRef.id,
      goalId,
      dateId,
      imageUrl,
      caption,
      source,
      createdAt: null,
      createdAtMs: timestamp
    };
  }

  async getJourneyPhotos(goalId: string, limitCount = 50): Promise<JourneyPhoto[]> {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');
    const collectionRef = firestoreModule.collection(firestore, 'rocketGoals', goalId, 'journeyPhotos');
    const q = firestoreModule.query(
      collectionRef,
      firestoreModule.orderBy('createdAtMs', 'desc'),
      firestoreModule.limit(limitCount)
    );
    const snapshot = await firestoreModule.getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as JourneyPhoto));
  }

  async deleteJourneyPhoto(goalId: string, photoId: string, imageUrl: string): Promise<void> {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');
    const storage = await this.getStorage();
    const storageModule = await import('firebase/storage');

    const docRef = firestoreModule.doc(firestore, 'rocketGoals', goalId, 'journeyPhotos', photoId);
    await firestoreModule.deleteDoc(docRef);

    try {
      const storageRef = storageModule.ref(storage, imageUrl);
      await storageModule.deleteObject(storageRef);
    } catch {
      // Image may already be deleted or URL format different
    }
  }
}

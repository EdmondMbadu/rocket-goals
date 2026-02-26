import { Injectable } from '@angular/core';
import type { Firestore } from 'firebase/firestore';
import { firebaseConfig } from '../../environments/environment';

export interface MileageEntry {
  id: string;
  goalId: string;
  actionItemId?: string;
  dateId: string; // YYYY-MM-DD
  miles: number;
  note?: string;
  createdAt: unknown;
  updatedAt: unknown;
  createdAtMs: number;
  updatedAtMs: number;
}

export type CreateMileageEntryInput = Omit<MileageEntry, 'id' | 'createdAt' | 'updatedAt' | 'createdAtMs' | 'updatedAtMs'>;

@Injectable({ providedIn: 'root' })
export class MileageEntriesService {
  private firestoreInstance?: Promise<Firestore>;

  private stripUndefined<T extends Record<string, any>>(payload: T): Record<string, any> {
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

  async createEntry(input: CreateMileageEntryInput): Promise<string> {
    const firestore = await this.getFirestore();
    const fm = await import('firebase/firestore');
    const now = Date.now();
    const collectionRef = fm.collection(firestore, 'rocketGoals', input.goalId, 'milestoneEntries');
    const payload = this.stripUndefined({
      ...input,
      createdAt: fm.serverTimestamp(),
      updatedAt: fm.serverTimestamp(),
      createdAtMs: now,
      updatedAtMs: now
    });
    const docRef = await fm.addDoc(collectionRef, payload);
    await fm.updateDoc(docRef, { id: docRef.id });
    return docRef.id;
  }

  async getEntriesByGoalId(goalId: string): Promise<MileageEntry[]> {
    const firestore = await this.getFirestore();
    const fm = await import('firebase/firestore');
    const collectionRef = fm.collection(firestore, 'rocketGoals', goalId, 'milestoneEntries');

    try {
      const q = fm.query(
        collectionRef,
        fm.orderBy('dateId', 'desc'),
        fm.orderBy('createdAtMs', 'desc')
      );
      const snapshot = await fm.getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as MileageEntry));
    } catch {
      const snapshot = await fm.getDocs(collectionRef);
      return snapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        } as MileageEntry))
        .sort((a, b) => {
          if (a.dateId === b.dateId) {
            return (b.createdAtMs || 0) - (a.createdAtMs || 0);
          }
          return a.dateId > b.dateId ? -1 : 1;
        });
    }
  }

  async updateEntry(
    goalId: string,
    entryId: string,
    updates: Partial<Pick<MileageEntry, 'actionItemId' | 'dateId' | 'miles' | 'note'>>
  ): Promise<void> {
    const firestore = await this.getFirestore();
    const fm = await import('firebase/firestore');
    const docRef = fm.doc(firestore, 'rocketGoals', goalId, 'milestoneEntries', entryId);
    await fm.updateDoc(docRef, this.stripUndefined({
      ...updates,
      updatedAt: fm.serverTimestamp(),
      updatedAtMs: Date.now()
    }));
  }

  async deleteEntry(goalId: string, entryId: string): Promise<void> {
    const firestore = await this.getFirestore();
    const fm = await import('firebase/firestore');
    const docRef = fm.doc(firestore, 'rocketGoals', goalId, 'milestoneEntries', entryId);
    await fm.deleteDoc(docRef);
  }
}

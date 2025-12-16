import { Injectable } from '@angular/core';
import type { Firestore } from 'firebase/firestore';
import { firebaseConfig } from '../../environments/environment';

export interface ActionItem {
  id: string;
  goalId: string;
  title: string;
  description?: string;
  notes?: string; // User notes/comments on the task
  dayNumber: number; // Which day of the mission this is for (1-based)
  completed: boolean;
  order: number; // For sorting within a day
  createdAt: unknown;
  updatedAt: unknown;
}

export type CreateActionItemInput = Omit<ActionItem, 'id' | 'createdAt' | 'updatedAt'>;

@Injectable({ providedIn: 'root' })
export class ActionItemsService {
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

  async createActionItem(input: CreateActionItemInput): Promise<string> {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');
    const collectionRef = firestoreModule.collection(firestore, 'rocketGoals', input.goalId, 'actionItems');

    const itemData = {
      ...input,
      createdAt: firestoreModule.serverTimestamp(),
      updatedAt: firestoreModule.serverTimestamp()
    };

    const docRef = await firestoreModule.addDoc(collectionRef, itemData);
    await firestoreModule.updateDoc(docRef, { id: docRef.id });
    return docRef.id;
  }

  async getActionItemsByGoalId(goalId: string): Promise<ActionItem[]> {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');
    const collectionRef = firestoreModule.collection(firestore, 'rocketGoals', goalId, 'actionItems');

    try {
      const q = firestoreModule.query(
        collectionRef,
        firestoreModule.orderBy('dayNumber', 'asc'),
        firestoreModule.orderBy('order', 'asc')
      );
      const querySnapshot = await firestoreModule.getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as ActionItem));
    } catch (error: any) {
      // If orderBy fails (missing index), fetch without it and sort manually
      if (error.code === 'failed-precondition') {
        console.warn('Firestore index missing for actionItems, fetching without orderBy');
        const querySnapshot = await firestoreModule.getDocs(collectionRef);
        const items = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as ActionItem));
        return items.sort((a, b) => {
          if (a.dayNumber !== b.dayNumber) return a.dayNumber - b.dayNumber;
          return a.order - b.order;
        });
      }
      throw error;
    }
  }

  async updateActionItem(goalId: string, itemId: string, updates: Partial<Omit<ActionItem, 'id' | 'goalId' | 'createdAt'>>): Promise<void> {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');
    const docRef = firestoreModule.doc(firestore, 'rocketGoals', goalId, 'actionItems', itemId);

    await firestoreModule.updateDoc(docRef, {
      ...updates,
      updatedAt: firestoreModule.serverTimestamp()
    });
  }

  async deleteActionItem(goalId: string, itemId: string): Promise<void> {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');
    const docRef = firestoreModule.doc(firestore, 'rocketGoals', goalId, 'actionItems', itemId);
    await firestoreModule.deleteDoc(docRef);
  }

  async toggleActionItemComplete(goalId: string, itemId: string, completed: boolean): Promise<void> {
    await this.updateActionItem(goalId, itemId, { completed });
  }

  // Create multiple action items at once (for generating a plan)
  async createBulkActionItems(goalId: string, items: Omit<CreateActionItemInput, 'goalId'>[]): Promise<string[]> {
    const ids: string[] = [];
    for (const item of items) {
      const id = await this.createActionItem({ ...item, goalId });
      ids.push(id);
    }
    return ids;
  }
}

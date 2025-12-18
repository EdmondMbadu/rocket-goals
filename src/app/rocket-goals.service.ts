import { Injectable } from '@angular/core';
import type { Firestore } from 'firebase/firestore';
import { firebaseConfig } from '../../environments/environment';
import { CreateRocketGoalInput } from './models/rocket-goal';

@Injectable({ providedIn: 'root' })
export class RocketGoalsService {
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

  async createRocketGoal(payload: CreateRocketGoalInput) {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');
    const collectionRef = firestoreModule.collection(firestore, 'rocketGoals');
    const docRef = await firestoreModule.addDoc(collectionRef, {
      ...payload,
      createdAt: payload.createdAt || firestoreModule.serverTimestamp()
    });
    // Save the ID in the document for ease of tracking
    await firestoreModule.updateDoc(docRef, {
      id: docRef.id
    });
    return docRef.id;
  }

  async getRocketGoalById(goalId: string) {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');
    const docRef = firestoreModule.doc(firestore, 'rocketGoals', goalId);
    const docSnap = await firestoreModule.getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as any;
    }
    return null;
  }

  async getRocketGoalsByUserId(userId: string) {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');
    const collectionRef = firestoreModule.collection(firestore, 'rocketGoals');
    
    try {
      // Try with orderBy first
      const q = firestoreModule.query(
        collectionRef,
        firestoreModule.where('userId', '==', userId),
        firestoreModule.orderBy('createdAt', 'desc')
      );
      const querySnapshot = await firestoreModule.getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any[];
    } catch (error: any) {
      // If orderBy fails (missing index), try without it
      if (error.code === 'failed-precondition') {
        console.warn('Firestore index missing, fetching without orderBy');
        const q = firestoreModule.query(
          collectionRef,
          firestoreModule.where('userId', '==', userId)
        );
        const querySnapshot = await firestoreModule.getDocs(q);
        const goals = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as any[];
        // Sort manually by createdAt if available
        return goals.sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() || 0;
          const bTime = b.createdAt?.toMillis?.() || 0;
          return bTime - aTime;
        });
      }
      throw error;
    }
  }

  async updateRocketGoal(goalId: string, updates: Partial<{ primaryGoal: string; answers: Record<string, any>; startTime?: number; visualizationImageUrl?: string }>) {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');
    const docRef = firestoreModule.doc(firestore, 'rocketGoals', goalId);
    await firestoreModule.updateDoc(docRef, updates);
  }

  async deleteRocketGoal(goalId: string) {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');

    const deleteCollectionDocs = async (collectionName: string) => {
      const collectionRef = firestoreModule.collection(firestore, 'rocketGoals', goalId, collectionName);
      const snapshot = await firestoreModule.getDocs(collectionRef);
      await Promise.all(snapshot.docs.map(doc => firestoreModule.deleteDoc(doc.ref)));
    };

    await Promise.all([
      deleteCollectionDocs('fans'),
      deleteCollectionDocs('fanComments'),
      deleteCollectionDocs('fanReactions')
    ]);

    const docRef = firestoreModule.doc(firestore, 'rocketGoals', goalId);
    await firestoreModule.deleteDoc(docRef);
  }
}

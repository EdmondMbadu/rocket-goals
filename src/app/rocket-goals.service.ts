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
    return docRef.id;
  }
}

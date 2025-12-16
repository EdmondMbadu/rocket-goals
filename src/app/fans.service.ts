import { Injectable } from '@angular/core';
import type { Firestore } from 'firebase/firestore';
import { firebaseConfig } from '../../environments/environment';

export interface Fan {
  id: string;
  goalId: string;
  email: string;
  name?: string;
  userId?: string; // If fan is a registered user
  status: 'pending' | 'accepted';
  invitedAt: unknown;
  acceptedAt?: unknown;
}

export interface FanComment {
  id: string;
  goalId: string;
  fanId: string;
  fanEmail: string;
  fanName?: string;
  content: string;
  emoji?: string;
  createdAt: unknown;
}

export interface FanReaction {
  id: string;
  goalId: string;
  fanId: string;
  fanEmail: string;
  fanName?: string;
  emoji: string;
  createdAt: unknown;
}

@Injectable({ providedIn: 'root' })
export class FansService {
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

  // Fan Invitations
  async inviteFan(goalId: string, email: string, name?: string): Promise<string> {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');
    const collectionRef = firestoreModule.collection(firestore, 'rocketGoals', goalId, 'fans');

    // Check if already invited
    const existingQuery = firestoreModule.query(
      collectionRef,
      firestoreModule.where('email', '==', email.toLowerCase())
    );
    const existingDocs = await firestoreModule.getDocs(existingQuery);

    if (!existingDocs.empty) {
      throw new Error('This person has already been invited');
    }

    const fanData = {
      goalId,
      email: email.toLowerCase(),
      name: name || undefined,
      status: 'pending' as const,
      invitedAt: firestoreModule.serverTimestamp()
    };

    const docRef = await firestoreModule.addDoc(collectionRef, fanData);
    await firestoreModule.updateDoc(docRef, { id: docRef.id });
    return docRef.id;
  }

  async getFansByGoalId(goalId: string): Promise<Fan[]> {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');
    const collectionRef = firestoreModule.collection(firestore, 'rocketGoals', goalId, 'fans');

    try {
      const q = firestoreModule.query(
        collectionRef,
        firestoreModule.orderBy('invitedAt', 'desc')
      );
      const querySnapshot = await firestoreModule.getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Fan));
    } catch (error: any) {
      if (error.code === 'failed-precondition') {
        const querySnapshot = await firestoreModule.getDocs(collectionRef);
        return querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Fan));
      }
      throw error;
    }
  }

  async removeFan(goalId: string, fanId: string): Promise<void> {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');
    const docRef = firestoreModule.doc(firestore, 'rocketGoals', goalId, 'fans', fanId);
    await firestoreModule.deleteDoc(docRef);
  }

  // Comments
  async addComment(goalId: string, fanEmail: string, content: string, fanName?: string, emoji?: string): Promise<string> {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');
    const collectionRef = firestoreModule.collection(firestore, 'rocketGoals', goalId, 'fanComments');

    const commentData: Record<string, unknown> = {
      goalId,
      fanEmail: fanEmail.toLowerCase(),
      fanName: fanName || undefined,
      content,
      createdAt: firestoreModule.serverTimestamp()
    };

    if (emoji && emoji.trim()) {
      commentData['emoji'] = emoji.trim();
    }

    const docRef = await firestoreModule.addDoc(collectionRef, commentData);
    await firestoreModule.updateDoc(docRef, { id: docRef.id });
    return docRef.id;
  }

  async getCommentsByGoalId(goalId: string): Promise<FanComment[]> {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');
    const collectionRef = firestoreModule.collection(firestore, 'rocketGoals', goalId, 'fanComments');

    try {
      const q = firestoreModule.query(
        collectionRef,
        firestoreModule.orderBy('createdAt', 'desc')
      );
      const querySnapshot = await firestoreModule.getDocs(q);
      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as FanComment));
    } catch (error: any) {
      if (error.code === 'failed-precondition') {
        const querySnapshot = await firestoreModule.getDocs(collectionRef);
        const comments = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as FanComment));
        return comments.reverse();
      }
      throw error;
    }
  }

  async deleteComment(goalId: string, commentId: string): Promise<void> {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');
    const docRef = firestoreModule.doc(firestore, 'rocketGoals', goalId, 'fanComments', commentId);
    await firestoreModule.deleteDoc(docRef);
  }

  // Reactions (Emojis)
  async addReaction(goalId: string, fanEmail: string, emoji: string, fanName?: string): Promise<string> {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');
    const collectionRef = firestoreModule.collection(firestore, 'rocketGoals', goalId, 'fanReactions');

    // Check if already reacted with this emoji
    const existingQuery = firestoreModule.query(
      collectionRef,
      firestoreModule.where('fanEmail', '==', fanEmail.toLowerCase()),
      firestoreModule.where('emoji', '==', emoji)
    );
    const existingDocs = await firestoreModule.getDocs(existingQuery);

    if (!existingDocs.empty) {
      // Remove the existing reaction (toggle off)
      const existingDoc = existingDocs.docs[0];
      await firestoreModule.deleteDoc(existingDoc.ref);
      return '';
    }

    const reactionData = {
      goalId,
      fanEmail: fanEmail.toLowerCase(),
      fanName: fanName || undefined,
      emoji,
      createdAt: firestoreModule.serverTimestamp()
    };

    const docRef = await firestoreModule.addDoc(collectionRef, reactionData);
    await firestoreModule.updateDoc(docRef, { id: docRef.id });
    return docRef.id;
  }

  async getReactionsByGoalId(goalId: string): Promise<FanReaction[]> {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');
    const collectionRef = firestoreModule.collection(firestore, 'rocketGoals', goalId, 'fanReactions');

    const querySnapshot = await firestoreModule.getDocs(collectionRef);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as FanReaction));
  }

  // Get aggregated reaction counts
  async getReactionCounts(goalId: string): Promise<Map<string, number>> {
    const reactions = await this.getReactionsByGoalId(goalId);
    const counts = new Map<string, number>();

    reactions.forEach(reaction => {
      const current = counts.get(reaction.emoji) || 0;
      counts.set(reaction.emoji, current + 1);
    });

    return counts;
  }

  // Search for existing users by email (for autocomplete)
  async searchUsersByEmail(emailPrefix: string): Promise<{ email: string; name: string }[]> {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');
    const usersRef = firestoreModule.collection(firestore, 'users');

    // Simple prefix search
    const q = firestoreModule.query(
      usersRef,
      firestoreModule.where('email', '>=', emailPrefix.toLowerCase()),
      firestoreModule.where('email', '<=', emailPrefix.toLowerCase() + '\uf8ff'),
      firestoreModule.limit(5)
    );

    try {
      const querySnapshot = await firestoreModule.getDocs(q);
      return querySnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          email: data['email'] || '',
          name: `${data['firstName'] || ''} ${data['lastName'] || ''}`.trim()
        };
      });
    } catch {
      return [];
    }
  }
}

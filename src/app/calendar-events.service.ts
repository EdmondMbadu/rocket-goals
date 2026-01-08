import { Injectable } from '@angular/core';
import type { Firestore } from 'firebase/firestore';
import { firebaseConfig } from '../../environments/environment';
import type { CalendarEvent } from './mission-calendar.component';

export interface CalendarEventData {
  id: string;
  goalId: string;
  title: string;
  date: Date;
  time?: string;
  duration?: number; // in minutes
  color?: string;
  completed?: boolean;
  description?: string;
  createdAt: unknown;
  updatedAt: unknown;
}

@Injectable({ providedIn: 'root' })
export class CalendarEventsService {
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

  async createEvent(goalId: string, event: Omit<CalendarEventData, 'id' | 'goalId' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');
    const collectionRef = firestoreModule.collection(firestore, 'rocketGoals', goalId, 'calendarEvents');
    
    const eventData = {
      ...event,
      goalId,
      date: firestoreModule.Timestamp.fromDate(event.date),
      createdAt: firestoreModule.serverTimestamp(),
      updatedAt: firestoreModule.serverTimestamp()
    };
    
    const docRef = await firestoreModule.addDoc(collectionRef, eventData);
    await firestoreModule.updateDoc(docRef, {
      id: docRef.id
    });
    return docRef.id;
  }

  async getEventsByGoalId(goalId: string): Promise<CalendarEventData[]> {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');
    const collectionRef = firestoreModule.collection(firestore, 'rocketGoals', goalId, 'calendarEvents');
    
    try {
      const q = firestoreModule.query(
        collectionRef,
        firestoreModule.orderBy('date', 'asc')
      );
      const querySnapshot = await firestoreModule.getDocs(q);
      return querySnapshot.docs.map(doc => {
        const data = doc.data();
        const dateValue = data['date'];
        return {
          id: doc.id,
          ...data,
          date: dateValue?.toDate ? dateValue.toDate() : new Date(dateValue),
        } as CalendarEventData;
      });
    } catch (error: any) {
      // If orderBy fails, try without it
      if (error.code === 'failed-precondition') {
        console.warn('Firestore index missing, fetching without orderBy');
        const querySnapshot = await firestoreModule.getDocs(collectionRef);
        const events = querySnapshot.docs.map(doc => {
          const data = doc.data();
          const dateValue = data['date'];
          return {
            id: doc.id,
            ...data,
            date: dateValue?.toDate ? dateValue.toDate() : new Date(dateValue),
          } as CalendarEventData;
        });
        // Sort manually by date
        return events.sort((a, b) => a.date.getTime() - b.date.getTime());
      }
      throw error;
    }
  }

  async updateEvent(goalId: string, eventId: string, updates: Partial<Omit<CalendarEventData, 'id' | 'goalId' | 'createdAt'>>): Promise<void> {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');
    const docRef = firestoreModule.doc(firestore, 'rocketGoals', goalId, 'calendarEvents', eventId);
    
    const updateData: any = {
      ...updates,
      updatedAt: firestoreModule.serverTimestamp()
    };
    
    if (updates.date) {
      updateData.date = firestoreModule.Timestamp.fromDate(updates.date);
    }
    
    await firestoreModule.updateDoc(docRef, updateData);
  }

  async deleteEvent(goalId: string, eventId: string): Promise<void> {
    const firestore = await this.getFirestore();
    const firestoreModule = await import('firebase/firestore');
    const docRef = firestoreModule.doc(firestore, 'rocketGoals', goalId, 'calendarEvents', eventId);
    await firestoreModule.deleteDoc(docRef);
  }

  // Convert CalendarEventData to CalendarEvent for the component
  toCalendarEvent(eventData: CalendarEventData): CalendarEvent {
    return {
      id: eventData.id,
      title: eventData.title,
      date: eventData.date,
      time: eventData.time,
      duration: eventData.duration,
      color: eventData.color || '#dc2626',
      completed: eventData.completed || false,
      description: eventData.description
    };
  }
}

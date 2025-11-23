import { Injectable, signal } from '@angular/core';
import type { FirebaseApp } from 'firebase/app';
import type { Auth, User, UserCredential } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { firebaseConfig } from '../../environments/environment';
import { UserProfile } from './models/user-profile';

interface FirebaseHandles {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private firebaseHandles?: Promise<FirebaseHandles>;
  private authSubscriptionInitialized = false;

  readonly user = signal<User | null>(null);
  readonly profile = signal<UserProfile | null>(null);
  readonly authError = signal<string | null>(null);
  readonly authLoading = signal<boolean>(false);

  constructor() {
    this.initAuthListener();
  }

  async signInWithEmail(email: string, password: string) {
    this.authLoading.set(true);
    this.authError.set(null);
    try {
      const credential = await this.executeWithAuth(async (authModule, auth) => {
        const { signInWithEmailAndPassword } = authModule;
        return await signInWithEmailAndPassword(auth, email, password);
      });
      await this.handleProfileAfterAuth(credential);
      return this.profile();
    } catch (error: any) {
      this.authError.set(this.mapFirebaseError(error));
      throw error;
    } finally {
      this.authLoading.set(false);
    }
  }

  async signUpWithEmail(data: { firstName: string; lastName: string; email: string; password: string }) {
    this.authLoading.set(true);
    this.authError.set(null);
    try {
      const credential = await this.executeWithAuth(async (authModule, auth) => {
        const { createUserWithEmailAndPassword, updateProfile } = authModule;
        const result = await createUserWithEmailAndPassword(auth, data.email, data.password);
        await updateProfile(result.user, {
          displayName: `${data.firstName} ${data.lastName}`.trim()
        });
        return result;
      });
      await this.createOrUpdateUserProfile(credential.user.uid, {
        id: credential.user.uid,
        userId: credential.user.uid,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email
      });
      await this.handleProfileAfterAuth(credential);
      return this.profile();
    } catch (error: any) {
      this.authError.set(this.mapFirebaseError(error));
      throw error;
    } finally {
      this.authLoading.set(false);
    }
  }

  async signInWithGoogle() {
    this.authLoading.set(true);
    this.authError.set(null);
    try {
      const credential = await this.executeWithAuth(async (authModule, auth) => {
        const { GoogleAuthProvider, signInWithPopup } = authModule;
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        return await signInWithPopup(auth, provider);
      });
      await this.handleProfileAfterAuth(credential);
      return this.profile();
    } catch (error: any) {
      this.authError.set(this.mapFirebaseError(error));
      throw error;
    } finally {
      this.authLoading.set(false);
    }
  }

  async signOut() {
    const { auth } = await this.ensureFirebase();
    const authModule = await import('firebase/auth');
    await authModule.signOut(auth);
    this.profile.set(null);
  }

  async emailExists(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      return false;
    }
    const existingProfile = await this.findProfileByEmail(normalizedEmail);
    if (existingProfile) {
      return true;
    }
    return this.executeWithAuth(async (authModule, auth) => {
      const { fetchSignInMethodsForEmail } = authModule;
      const methods = await fetchSignInMethodsForEmail(auth, normalizedEmail);
      return methods.length > 0;
    });
  }

  async sendEmailVerification() {
    const { auth } = await this.ensureFirebase();
    if (!auth.currentUser) {
      throw new Error('No authenticated user to verify.');
    }
    const { sendEmailVerification } = await import('firebase/auth');
    await sendEmailVerification(auth.currentUser);
  }

  async reloadCurrentUser() {
    const { auth } = await this.ensureFirebase();
    if (!auth.currentUser) {
      return null;
    }
    const { reload } = await import('firebase/auth');
    await reload(auth.currentUser);
    return auth.currentUser;
  }

  async sendPasswordResetEmail(email: string) {
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      throw new Error('Enter your email to receive a reset link.');
    }
    try {
      await this.executeWithAuth(async (authModule, auth) => {
        const { sendPasswordResetEmail } = authModule;
        await sendPasswordResetEmail(auth, trimmedEmail);
      });
    } catch (error: any) {
      throw new Error(this.mapPasswordResetError(error));
    }
  }

  async updateUserProfile(updates: Partial<UserProfile>) {
    const currentProfile = this.profile();
    if (!currentProfile) {
      throw new Error('No profile found');
    }
    const { firestore } = await this.ensureFirebase();
    const firestoreModule = await import('firebase/firestore');
    const docRef = firestoreModule.doc(firestore, 'userProfiles', currentProfile.userId);
    await firestoreModule.updateDoc(docRef, updates);
    // Fetch the updated profile from Firestore to ensure we have the latest data
    const updatedProfile = await this.fetchUserProfile(currentProfile.userId);
    if (updatedProfile) {
      this.profile.set(updatedProfile);
      return updatedProfile;
    }
    // Fallback to merging updates if fetch fails
    const mergedProfile = { ...currentProfile, ...updates };
    this.profile.set(mergedProfile);
    return mergedProfile;
  }

  private async ensureFirebase(): Promise<FirebaseHandles> {
    if (!this.firebaseHandles) {
      this.firebaseHandles = (async () => {
        const appModule = await import('firebase/app');
        const authModule = await import('firebase/auth');
        const firestoreModule = await import('firebase/firestore');

        const app =
          appModule.getApps().length === 0
            ? appModule.initializeApp(firebaseConfig)
            : appModule.getApp();
        const auth = authModule.getAuth(app);
        const firestore = firestoreModule.getFirestore(app);
        return { app, auth, firestore };
      })();
    }
    return this.firebaseHandles;
  }

  private async initAuthListener() {
    try {
      if (this.authSubscriptionInitialized) {
        return;
      }
      this.authSubscriptionInitialized = true;
      const { auth } = await this.ensureFirebase();
      const { onAuthStateChanged } = await import('firebase/auth');
      onAuthStateChanged(auth, async (user) => {
        this.user.set(user);
        if (user) {
          const profile = await this.fetchUserProfile(user.uid);
          if (profile) {
            this.profile.set(profile);
          } else {
            const fallbackProfile = this.buildProfileFromUser(user);
            await this.createOrUpdateUserProfile(user.uid, fallbackProfile);
            this.profile.set(fallbackProfile);
          }
        } else {
          this.profile.set(null);
        }
      });
    } catch (error) {
      console.error('Failed to initialize auth listener', error);
    }
  }

  private async handleProfileAfterAuth(credential: UserCredential) {
    const profile = await this.fetchUserProfile(credential.user.uid);
    if (profile) {
      this.profile.set(profile);
      return;
    }
    const fallbackProfile = this.buildProfileFromUser(credential.user);
    await this.createOrUpdateUserProfile(credential.user.uid, fallbackProfile);
    this.profile.set(fallbackProfile);
  }

  private buildProfileFromUser(user: User): UserProfile {
    const displayName = user.displayName?.trim() || '';
    const [firstName = 'Rocketeer', ...lastParts] = displayName.split(' ').filter(Boolean);
    const lastName = lastParts.join(' ');
    return {
      id: user.uid,
      userId: user.uid,
      firstName: firstName || 'Rocketeer',
      lastName,
      email: user.email || ''
    };
  }

  private async executeWithAuth<T>(
    executor: (authModule: typeof import('firebase/auth'), auth: Auth) => Promise<T>
  ): Promise<T> {
    const { auth } = await this.ensureFirebase();
    const authModule = await import('firebase/auth');
    return executor(authModule, auth);
  }

  private async fetchUserProfile(userId: string) {
    const { firestore } = await this.ensureFirebase();
    const firestoreModule = await import('firebase/firestore');
    const docRef = firestoreModule.doc(firestore, 'userProfiles', userId);
    const snapshot = await firestoreModule.getDoc(docRef);
    if (!snapshot.exists()) {
      return null;
    }
    return snapshot.data() as UserProfile;
  }

  private async findProfileByEmail(email: string) {
    const { firestore } = await this.ensureFirebase();
    const firestoreModule = await import('firebase/firestore');
    const collectionRef = firestoreModule.collection(firestore, 'userProfiles');
    const q = firestoreModule.query(
      collectionRef,
      firestoreModule.where('email', '==', email),
      firestoreModule.limit(1)
    );
    const snapshot = await firestoreModule.getDocs(q);
    if (snapshot.empty) {
      return null;
    }
    return snapshot.docs[0].data() as UserProfile;
  }

  private async createOrUpdateUserProfile(userId: string, profile: UserProfile) {
    const { firestore } = await this.ensureFirebase();
    const firestoreModule = await import('firebase/firestore');
    const docRef = firestoreModule.doc(firestore, 'userProfiles', userId);
    const payload = {
      ...profile,
      id: userId,
      userId,
      createdAt: profile.createdAt || firestoreModule.serverTimestamp()
    };
    await firestoreModule.setDoc(docRef, payload, { merge: true });
  }

  private mapFirebaseError(error: any) {
    if (!error?.code) return 'Something went wrong. Please try again.';
    const code = String(error.code);
    if (code.includes('auth/invalid-credential')) {
      return 'Invalid email or password.';
    }
    if (code.includes('auth/email-already-in-use')) {
      return 'An account with this email already exists.';
    }
    if (code.includes('auth/popup-closed-by-user')) {
      return 'The Google sign-in popup was closed before finishing.';
    }
    return error.message || 'Something went wrong. Please try again.';
  }

  private mapPasswordResetError(error: any) {
    if (!error?.code) {
      return 'Unable to send reset email. Please try again in a moment.';
    }
    const code = String(error.code);
    if (code.includes('auth/invalid-email')) {
      return 'Enter a valid email address to reset your password.';
    }
    if (code.includes('auth/user-not-found')) {
      return 'We could not find an account with that email.';
    }
    return 'Unable to send reset email. Please try again soon.';
  }
}

import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { AvatarDropdownComponent } from '../avatar-dropdown.component';
import { UserProfile } from '../models/user-profile';
import { firebaseConfig } from '../../../environments/environment';
import type { Timestamp } from 'firebase/firestore';

type SectionKey = 'users' | 'email' | 'quickActions';
type AdminUser = UserProfile & { lastSignInAt?: unknown; lastSignIn?: unknown };

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AvatarDropdownComponent],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.css'
})
export class AdminComponent implements OnInit {
  private authService = inject(AuthService);
  private router = inject(Router);
  
  // Email form state
  emailTo = signal('');
  emailSubject = signal('Test Email from Rocket Goals');
  emailMessage = signal('Hello! This is a test email sent from the Rocket Goals Admin Panel to verify SendGrid integration is working correctly.');
  
  // UI state
  loading = signal(false);
  success = signal<string | null>(null);
  error = signal<string | null>(null);
  isAdmin = signal(false);
  checkingAuth = signal(true);
  users = signal<AdminUser[]>([]);
  usersLoading = signal(false);
  usersError = signal<string | null>(null);
  sections = signal<Record<SectionKey, boolean>>({
    users: false,
    email: false,
    quickActions: true
  });
  totalUsers = signal<number | null>(null);
  totalGoals = signal<number | null>(null);
  statsLoading = signal(false);
  statsError = signal<string | null>(null);

  private firestorePromise?: Promise<import('firebase/firestore').Firestore>;

  async ngOnInit() {
    console.log('🔐 Admin component initializing...');
    
    // Wait for auth to load
    let attempts = 0;
    while (!this.authService.profile() && attempts < 20) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    const profile = this.authService.profile();
    console.log('🔐 Profile loaded:', profile);
    console.log('🔐 Role:', profile?.role, 'Admin flag:', profile?.admin);
    
    if (!profile) {
      console.log('🔐 No profile, redirecting to login');
      this.router.navigate(['/login']);
      return;
    }

    // Check if user is admin - check both role and admin fields
    const isUserAdmin = profile.role === 'admin' || profile.admin === true;
    console.log('🔐 Is admin?', isUserAdmin);
    
    if (!isUserAdmin) {
      console.log('🔐 Not admin, redirecting to goals');
      this.router.navigate(['/goals']);
      return;
    }

    console.log('🔐 Admin access granted!');
    this.isAdmin.set(true);
    this.checkingAuth.set(false);
    this.loadStats();
    this.loadUsers();
  }

  async sendTestEmail() {
    const to = this.emailTo().trim();
    const subject = this.emailSubject().trim();
    const message = this.emailMessage().trim();

    // Validation
    if (!to) {
      this.error.set('Please enter a recipient email address');
      setTimeout(() => this.error.set(null), 5000);
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      this.error.set('Please enter a valid email address');
      setTimeout(() => this.error.set(null), 5000);
      return;
    }

    if (!subject) {
      this.error.set('Please enter an email subject');
      setTimeout(() => this.error.set(null), 5000);
      return;
    }

    if (!message) {
      this.error.set('Please enter an email message');
      setTimeout(() => this.error.set(null), 5000);
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.success.set(null);

    try {
      // Import Firebase functions
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { getApp } = await import('firebase/app');
      
      const app = getApp();
      const functions = getFunctions(app);
      const sendEmail = httpsCallable(functions, 'sendTestEmail');

      const result = await sendEmail({ to, subject, message });
      const data = result.data as { success: boolean; message: string };
      
      if (data.success) {
        this.success.set(`✅ ${data.message}`);
        // Clear form on success
        this.emailTo.set('');
      } else {
        this.error.set('Failed to send email. Please try again.');
      }
    } catch (err: any) {
      console.error('Error sending email:', err);
      const errorMessage = err.message || 'An unexpected error occurred';
      this.error.set(`Failed to send email: ${errorMessage}`);
    } finally {
      this.loading.set(false);
      setTimeout(() => {
        this.success.set(null);
        this.error.set(null);
      }, 8000);
    }
  }

  getProfile() {
    return this.authService.profile();
  }

  sectionOpen(key: SectionKey) {
    return this.sections()[key];
  }

  toggleSection(key: SectionKey) {
    this.sections.update((state) => ({ ...state, [key]: !state[key] }));
  }

  formatDate(value: unknown) {
    if (!value) return '-';
    let date: Date | null = null;
    if (value instanceof Date) {
      date = value;
    } else if (typeof value === 'string' || typeof value === 'number') {
      date = new Date(value);
    } else if (typeof value === 'object' && value !== null && 'seconds' in value) {
      const ts = value as Timestamp;
      date = new Date(ts.seconds * 1000);
    }
    if (!date || Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  private async ensureFirestore() {
    if (!this.firestorePromise) {
      this.firestorePromise = (async () => {
        const appModule = await import('firebase/app');
        const firestoreModule = await import('firebase/firestore');
        const app =
          appModule.getApps().length === 0
            ? appModule.initializeApp(firebaseConfig)
            : appModule.getApp();
        return firestoreModule.getFirestore(app);
      })();
    }
    return this.firestorePromise;
  }

  private async loadStats() {
    this.statsLoading.set(true);
    this.statsError.set(null);
    try {
      const firestore = await this.ensureFirestore();
      const firestoreModule = await import('firebase/firestore');
      const usersCollection = firestoreModule.collection(firestore, 'userProfiles');
      const goalsCollection = firestoreModule.collection(firestore, 'rocketGoals');

      const [usersCount, goalsCount] = await Promise.all([
        firestoreModule.getCountFromServer(usersCollection),
        firestoreModule.getCountFromServer(goalsCollection)
      ]);

      this.totalUsers.set(usersCount.data().count);
      this.totalGoals.set(goalsCount.data().count);
    } catch (err: any) {
      console.error('Failed to load stats', err);
      this.statsError.set('Unable to load summary stats.');
    } finally {
      this.statsLoading.set(false);
    }
  }

  private async loadUsers() {
    this.usersLoading.set(true);
    this.usersError.set(null);
    try {
      const firestore = await this.ensureFirestore();
      const firestoreModule = await import('firebase/firestore');
      const collectionRef = firestoreModule.collection(firestore, 'userProfiles');
      const snapshot = await firestoreModule.getDocs(collectionRef);
      const data = snapshot.docs.map((doc) => {
        const payload = doc.data() as AdminUser;
        return { ...payload, id: doc.id, userId: payload.userId || doc.id };
      });
      data.sort((a, b) =>
        (a.firstName || '').localeCompare(b.firstName || '', undefined, { sensitivity: 'base' })
      );
      const enriched = await this.enrichWithAuthMetadata(data);
      this.users.set(enriched);
    } catch (err: any) {
      console.error('Failed to load users', err);
      this.usersError.set('Unable to load users right now.');
    } finally {
      this.usersLoading.set(false);
    }
  }

  private async enrichWithAuthMetadata(users: AdminUser[]) {
    try {
      const uids = users.map((u) => u.userId).filter(Boolean);
      if (uids.length === 0) return users;

      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { getApp } = await import('firebase/app');
      const functions = getFunctions(getApp());
      const getAuthMetadata = httpsCallable(functions, 'getAuthMetadata');

      // Chunk to avoid exceeding callable payload limits (100 uids per chunk)
      const chunkSize = 100;
      const mergedMeta: Record<string, { lastSignInTime: string | null; creationTime: string | null }> = {};

      for (let i = 0; i < uids.length; i += chunkSize) {
        const chunk = uids.slice(i, i + chunkSize);
        const result = await getAuthMetadata({ uids: chunk });
        const data = result.data as { users?: { uid: string; lastSignInTime?: string | null; creationTime?: string | null }[] };
        data.users?.forEach((u) => {
          mergedMeta[u.uid] = {
            lastSignInTime: u.lastSignInTime ?? null,
            creationTime: u.creationTime ?? null
          };
        });
      }

      return users.map((user) => {
        const meta = mergedMeta[user.userId];
        return {
          ...user,
          lastSignInAt: meta?.lastSignInTime ?? user.lastSignInAt ?? user.lastSignIn,
          createdAt: meta?.creationTime ?? user.createdAt
        };
      });
    } catch (err) {
      console.error('Failed to enrich with auth metadata', err);
      return users;
    }
  }
}


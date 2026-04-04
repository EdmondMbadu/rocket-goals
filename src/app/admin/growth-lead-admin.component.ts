import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firebaseConfig } from '../../../environments/environment';
import { AuthService } from '../auth.service';
import { AvatarDropdownComponent } from '../avatar-dropdown.component';
import { ThemeService } from '../theme.service';

type SharePlatform = 'fb' | 'tw' | 'li';

type GrowthLeadAdminEntry = {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  quizMode: 'adult' | 'student' | 'unknown';
  totalScore: number | null;
  archetype: string;
  downloadedAt: Date;
  shareUpdatedAt: Date | null;
  codeUnlockedAt: Date | null;
  shareCount: number;
  sharedPlatforms: Record<SharePlatform, boolean>;
  codeUnlocked: boolean;
  hasAccount: boolean;
};

@Component({
  selector: 'app-growth-lead-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AvatarDropdownComponent],
  templateUrl: './growth-lead-admin.component.html',
  styleUrl: './growth-lead-admin.component.css'
})
export class GrowthLeadAdminComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly theme = inject(ThemeService);

  protected readonly isDarkMode = this.theme.isDarkMode;
  protected readonly checkingAuth = signal(true);
  protected readonly isAdmin = signal(false);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly success = signal<string | null>(null);
  protected readonly searchTerm = signal('');
  protected readonly entries = signal<GrowthLeadAdminEntry[]>([]);
  protected readonly platformOrder: SharePlatform[] = ['fb', 'tw', 'li'];

  protected readonly filteredEntries = computed(() => {
    const query = this.searchTerm().trim().toLowerCase();
    const allEntries = this.entries();

    if (!query) {
      return allEntries;
    }

    return allEntries.filter(entry => {
      const haystack = [
        this.fullName(entry),
        entry.email,
        entry.archetype,
        entry.userId,
        entry.quizMode
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  });

  protected readonly totalEntries = computed(() => this.entries().length);
  protected readonly unlockedEntries = computed(() => this.entries().filter(entry => entry.codeUnlocked).length);
  protected readonly averageShares = computed(() => {
    const allEntries = this.entries();
    if (allEntries.length === 0) {
      return 0;
    }

    const totalShares = allEntries.reduce((sum, entry) => sum + entry.shareCount, 0);
    return Math.round((totalShares / allEntries.length) * 10) / 10;
  });
  protected readonly recentEntries = computed(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return this.entries().filter(entry => entry.downloadedAt.getTime() >= cutoff).length;
  });

  private firestorePromise?: Promise<import('firebase/firestore').Firestore>;

  async ngOnInit(): Promise<void> {
    let attempts = 0;
    while (!this.authService.profile() && attempts < 20) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts += 1;
    }

    const profile = this.authService.profile();
    if (!profile) {
      this.router.navigate(['/login']);
      return;
    }

    const isUserAdmin = profile.role === 'admin' || profile.admin === true;
    if (!isUserAdmin) {
      this.router.navigate(['/goals']);
      return;
    }

    this.isAdmin.set(true);
    this.checkingAuth.set(false);
    await this.loadEntries();
  }

  protected getProfile() {
    return this.authService.profile();
  }

  protected toggleDarkMode(): void {
    this.theme.toggleDarkMode();
  }

  protected async refresh(): Promise<void> {
    await this.loadEntries();
  }

  protected fullName(entry: GrowthLeadAdminEntry): string {
    const fullName = `${entry.firstName} ${entry.lastName}`.trim();
    return fullName || 'Unknown visitor';
  }

  protected formatDateTime(date: Date | null): string {
    if (!date || Number.isNaN(date.getTime())) {
      return 'Unknown';
    }

    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  protected relativeTime(date: Date | null): string {
    if (!date || Number.isNaN(date.getTime())) {
      return 'No timestamp';
    }

    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.max(1, Math.round(diffMs / 60000));

    if (diffMinutes < 60) {
      return `${diffMinutes}m ago`;
    }

    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }

    const diffDays = Math.round(diffHours / 24);
    if (diffDays < 30) {
      return `${diffDays}d ago`;
    }

    const diffMonths = Math.round(diffDays / 30);
    return `${diffMonths}mo ago`;
  }

  protected shareLabel(platform: SharePlatform): string {
    if (platform === 'fb') {
      return 'Facebook';
    }
    if (platform === 'tw') {
      return 'X';
    }
    return 'LinkedIn';
  }

  protected async deleteEntry(entry: GrowthLeadAdminEntry): Promise<void> {
    const label = this.fullName(entry);
    if (!confirm(`Delete the growth lead entry for ${label}? This cannot be undone.`)) {
      return;
    }

    try {
      const firestore = await this.ensureFirestore();
      const firestoreModule = await import('firebase/firestore');
      await firestoreModule.deleteDoc(firestoreModule.doc(firestore, 'bookDownloads', entry.id));

      this.entries.update(entries => entries.filter(item => item.id !== entry.id));
      this.success.set(`Deleted ${label}.`);
      this.error.set(null);
      window.setTimeout(() => this.success.set(null), 4000);
    } catch (error) {
      console.error('Failed to delete growth lead entry.', error);
      this.error.set('Unable to delete this growth lead entry.');
      this.success.set(null);
      window.setTimeout(() => this.error.set(null), 5000);
    }
  }

  private async loadEntries(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    try {
      const firestore = await this.ensureFirestore();
      const firestoreModule = await import('firebase/firestore');
      const snapshot = await firestoreModule.getDocs(
        firestoreModule.query(
          firestoreModule.collection(firestore, 'bookDownloads'),
          firestoreModule.orderBy('downloadedAt', 'desc')
        )
      );

      const entries = snapshot.docs
        .map(docSnapshot => {
          const data = docSnapshot.data();
          if (data['leadSource'] !== 'growth-lead') {
            return null;
          }

          const sharedPlatforms = this.normalizeSharedPlatforms(data['sharedPlatforms']);
          const shareCount = this.countPlatforms(sharedPlatforms);

          return {
            id: docSnapshot.id,
            userId: data['userId'] || '',
            firstName: data['firstName'] || '',
            lastName: data['lastName'] || '',
            email: data['email'] || '',
            quizMode: data['quizMode'] === 'adult' || data['quizMode'] === 'student' ? data['quizMode'] : 'unknown',
            totalScore: typeof data['totalScore'] === 'number' ? data['totalScore'] : null,
            archetype: data['archetype'] || 'Unclassified',
            downloadedAt: this.toDate(data['downloadedAt']),
            shareUpdatedAt: this.toDateOrNull(data['shareUpdatedAt']),
            codeUnlockedAt: this.toDateOrNull(data['codeUnlockedAt']),
            shareCount,
            sharedPlatforms,
            codeUnlocked: data['codeUnlocked'] === true || shareCount >= 1,
            hasAccount: data['hasAccount'] === true
          } satisfies GrowthLeadAdminEntry;
        })
        .filter((entry): entry is GrowthLeadAdminEntry => entry !== null);

      this.entries.set(entries);
    } catch (error) {
      console.error('Failed to load growth lead entries.', error);
      this.error.set('Unable to load growth lead submissions.');
    } finally {
      this.loading.set(false);
    }
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

  private normalizeSharedPlatforms(value: unknown): Record<SharePlatform, boolean> {
    if (!value || typeof value !== 'object') {
      return { fb: false, tw: false, li: false };
    }

    const shared = value as Record<string, unknown>;
    return {
      fb: shared['fb'] === true,
      tw: shared['tw'] === true,
      li: shared['li'] === true
    };
  }

  private countPlatforms(sharedPlatforms: Record<SharePlatform, boolean>): number {
    return (sharedPlatforms.fb ? 1 : 0) + (sharedPlatforms.tw ? 1 : 0) + (sharedPlatforms.li ? 1 : 0);
  }

  private toDate(value: unknown): Date {
    const parsed = this.toDateOrNull(value);
    return parsed ?? new Date(0);
  }

  private toDateOrNull(value: unknown): Date | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }

    if (typeof value === 'object' && value !== null && 'toDate' in value && typeof value.toDate === 'function') {
      const converted = value.toDate();
      return converted instanceof Date && !Number.isNaN(converted.getTime()) ? converted : null;
    }

    if (typeof value === 'string' || typeof value === 'number') {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date;
    }

    return null;
  }
}

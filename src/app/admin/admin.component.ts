import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { AvatarDropdownComponent } from '../avatar-dropdown.component';
import { UserProfile } from '../models/user-profile';
import { firebaseConfig } from '../../../environments/environment';
import type { Timestamp } from 'firebase/firestore';
import { ThemeService } from '../theme.service';

type SectionKey = 'users' | 'email' | 'sms' | 'reminders' | 'quickActions' | 'aiAnalytics' | 'promoCodes' | 'demoRequests' | 'bookDownloads';

type PromoCodeUser = {
  userId: string;
  name: string;
  email: string;
  redeemedAt: Date;
};

type PromoCode = {
  code: string;
  usageCount: number;
  createdAt: Date;
  durationMonths: number;
  lifetimeAccess: boolean;
  usedBy: PromoCodeUser[];
  archived: boolean;
};

type DemoRequest = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string | null;
  expectations: string;
  scheduledDate: Date;
  scheduledTime: string;
  displayTime: string;
  meetingLink: string;
  createdAt: Date;
};

type BookDownload = {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  bookTitle: string;
  downloadedAt: Date;
};

type ScheduledReminder = {
  id: string;
  time: string;
  enabled: boolean;
  reminderType?: 'ignition' | 'mission_log';
  emailSubject: string;
  emailBodyText: string;
  emailBodyHtml: string;
  createdAt: unknown;
  updatedAt: unknown;
  lastRunAt?: unknown;
  createdBy: string;
};
type AdminUser = UserProfile & { lastSignInAt?: unknown; lastSignIn?: unknown };
type AiAnalytics = {
  path: string;
  dateRange: { startDate: string; endDate: string };
  views: number;
  activeUsers: number;
  viewsPerActiveUser: number;
  avgEngagementPerActiveUserSeconds: number;
  engagementSeconds: number;
  eventCount: number;
  totalRevenue: number;
  newUsers: number;
  sessions: number;
  bounceRate: number;
  avgSessionDurationSeconds: number;
  countries: { country: string; activeUsers: number; views: number }[];
  devices: { device: string; activeUsers: number; views: number }[];
  browsers: { browser: string; activeUsers: number; views: number }[];
  trafficSources: { channel: string; activeUsers: number; views: number }[];
};

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
  private readonly theme = inject(ThemeService);
  protected readonly isDarkMode = this.theme.isDarkMode;

  // Email form state
  emailTo = signal('');
  emailSubject = signal('Test Email from Rocket Goals');
  emailMessage = signal('Hello! This is a test email sent from the Rocket Goals Admin Panel to verify SendGrid integration is working correctly.');

  // SMS form state
  smsPhoneNumber = signal('');
  smsMessage = signal('Hello! This is a test SMS from Rocket Goals Admin Panel to verify Twilio integration is working correctly.');

  // Reminder OS form state
  reminderGoalTitle = signal('Complete my fitness challenge');
  reminderParticipantName = signal('John Doe');
  reminderParticipantEmail = signal('john@example.com');
  reminderTestEmail = signal('');
  reminderPreviewHtml = signal<string | null>(null);
  reminderPreviewSubject = signal<string | null>(null);
  reminderPreviewText = signal<string | null>(null);
  reminderLoading = signal(false);
  reminderBulkLoading = signal(false);
  reminderBulkResults = signal<{ sent: number; failed: number; total: number; errors: Array<{ goalId: string; email: string; error: string }> } | null>(null);

  // Scheduled reminders state
  scheduledReminders = signal<ScheduledReminder[]>([]);
  scheduledRemindersLoading = signal(false);
  scheduledRemindersError = signal<string | null>(null);
  newReminderTime = signal('09:00');
  newReminderType = signal<'ignition' | 'mission_log'>('ignition');
  editingReminder = signal<ScheduledReminder | null>(null);
  editingEmailSubject = signal('');
  editingEmailBodyText = signal('');
  editingEmailBodyHtml = signal('');
  editingReminderType = signal<'ignition' | 'mission_log'>('mission_log');
  showEmailPreview = signal(false);
  savingReminder = signal(false);

  // Weekly Reset test state
  weeklyResetGoalId = signal('');
  weeklyResetLoading = signal(false);
  weeklyResetResult = signal<string | null>(null);
  weeklyResetError = signal<string | null>(null);

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
    sms: false,
    reminders: false,
    quickActions: true,
    aiAnalytics: false,
    promoCodes: false,
    demoRequests: false,
    bookDownloads: false
  });

  // Demo requests state
  demoRequests = signal<DemoRequest[]>([]);
  demoRequestsLoading = signal(false);
  demoRequestsError = signal<string | null>(null);

  // Book downloads state
  bookDownloads = signal<BookDownload[]>([]);
  bookDownloadsLoading = signal(false);
  bookDownloadsError = signal<string | null>(null);
  totalUsers = signal<number | null>(null);
  totalGoals = signal<number | null>(null);
  statsLoading = signal(false);
  statsError = signal<string | null>(null);
  aiAnalytics = signal<AiAnalytics | null>(null);
  aiAnalyticsLoading = signal(false);
  aiAnalyticsError = signal<string | null>(null);
  dateRange = signal<'1day' | '7days' | '30days' | 'custom'>('30days');
  customStartDate = signal<string>('');
  customEndDate = signal<string>('');

  // Promo code management
  promoCodesMoonshot = signal<PromoCode[]>([]);
  promoCodesInterplanetary = signal<PromoCode[]>([]);
  promoCodesGalactic = signal<PromoCode[]>([]);
  newCodeMoonshot = signal('');
  newCodeInterplanetary = signal('');
  newCodeGalactic = signal('');
  newDurationMoonshot = signal(12);
  newDurationInterplanetary = signal(12);
  newDurationGalactic = signal(12);
  newLifetimeMoonshot = signal(false);
  newLifetimeInterplanetary = signal(false);
  newLifetimeGalactic = signal(false);
  promoCodesLoading = signal(false);
  promoCodesSaving = signal(false);
  promoCodesError = signal<string | null>(null);

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
    this.loadAiAnalytics();
    this.loadUsers();
    this.loadPromoCodes();
    this.loadDemoRequests();
    this.loadScheduledReminders();
    this.loadBookDownloads();
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

  async sendTestSMS() {
    const phoneNumber = this.smsPhoneNumber().trim();
    const message = this.smsMessage().trim();

    // Validation
    if (!phoneNumber) {
      this.error.set('Please enter a recipient phone number');
      setTimeout(() => this.error.set(null), 5000);
      return;
    }

    // Basic phone number validation (should start with + for E.164 format)
    if (!phoneNumber.startsWith('+')) {
      this.error.set('Please enter phone number in E.164 format (e.g., +1234567890)');
      setTimeout(() => this.error.set(null), 5000);
      return;
    }

    if (phoneNumber.length < 10) {
      this.error.set('Please enter a valid phone number');
      setTimeout(() => this.error.set(null), 5000);
      return;
    }

    if (!message) {
      this.error.set('Please enter an SMS message');
      setTimeout(() => this.error.set(null), 5000);
      return;
    }

    if (message.length > 1600) {
      this.error.set('Message is too long. Maximum length is 1600 characters.');
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
      const sendSMS = httpsCallable(functions, 'sendTestSMS');

      const result = await sendSMS({ phoneNumber, message });
      const data = result.data as { success: boolean; message: string; sid?: string; status?: string };

      if (data.success) {
        this.success.set(`✅ ${data.message}${data.sid ? ` (SID: ${data.sid})` : ''}`);
        // Clear form on success
        this.smsPhoneNumber.set('');
      } else {
        this.error.set('Failed to send SMS. Please try again.');
      }
    } catch (err: any) {
      console.error('Error sending SMS:', err);
      const errorMessage = err.message || 'An unexpected error occurred';
      this.error.set(`Failed to send SMS: ${errorMessage}`);
    } finally {
      this.loading.set(false);
      setTimeout(() => {
        this.success.set(null);
        this.error.set(null);
      }, 8000);
    }
  }

  async previewGoalReminder() {
    const goalTitle = this.reminderGoalTitle().trim();
    const participantName = this.reminderParticipantName().trim();
    const participantEmail = this.reminderParticipantEmail().trim();

    if (!goalTitle || !participantName || !participantEmail) {
      this.error.set('Please fill in all fields to preview the reminder');
      setTimeout(() => this.error.set(null), 5000);
      return;
    }

    this.reminderLoading.set(true);
    this.error.set(null);

    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { getApp } = await import('firebase/app');

      const app = getApp();
      const functions = getFunctions(app);
      const previewReminder = httpsCallable(functions, 'previewGoalReminder');

      const result = await previewReminder({ goalTitle, participantName, participantEmail });
      const data = result.data as { success: boolean; subject: string; text: string; html: string };

      if (data.success) {
        this.reminderPreviewSubject.set(data.subject);
        this.reminderPreviewText.set(data.text);
        this.reminderPreviewHtml.set(data.html);
        this.success.set('✅ Preview generated successfully');
      } else {
        this.error.set('Failed to generate preview');
      }
    } catch (err: any) {
      console.error('Error generating preview:', err);
      const errorMessage = err.message || 'An unexpected error occurred';
      this.error.set(`Failed to generate preview: ${errorMessage}`);
    } finally {
      this.reminderLoading.set(false);
      setTimeout(() => {
        this.success.set(null);
        this.error.set(null);
      }, 5000);
    }
  }

  async sendTestGoalReminder() {
    const goalTitle = this.reminderGoalTitle().trim();
    const participantName = this.reminderParticipantName().trim();
    const participantEmail = this.reminderParticipantEmail().trim();
    const testEmail = this.reminderTestEmail().trim();

    if (!goalTitle || !participantName || !participantEmail) {
      this.error.set('Please fill in goal title, participant name, and email');
      setTimeout(() => this.error.set(null), 5000);
      return;
    }

    if (!testEmail) {
      this.error.set('Please enter a test email address');
      setTimeout(() => this.error.set(null), 5000);
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(testEmail)) {
      this.error.set('Please enter a valid email address');
      setTimeout(() => this.error.set(null), 5000);
      return;
    }

    this.reminderLoading.set(true);
    this.error.set(null);
    this.success.set(null);

    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { getApp } = await import('firebase/app');

      const app = getApp();
      const functions = getFunctions(app);
      const sendTestReminder = httpsCallable(functions, 'sendTestGoalReminder');

      const result = await sendTestReminder({ goalTitle, participantName, participantEmail, testEmail });
      const data = result.data as { success: boolean; message: string };

      if (data.success) {
        this.success.set(`✅ ${data.message}`);
      } else {
        this.error.set('Failed to send test reminder');
      }
    } catch (err: any) {
      console.error('Error sending test reminder:', err);
      const errorMessage = err.message || 'An unexpected error occurred';
      this.error.set(`Failed to send test reminder: ${errorMessage}`);
    } finally {
      this.reminderLoading.set(false);
      setTimeout(() => {
        this.success.set(null);
        this.error.set(null);
      }, 8000);
    }
  }

  async sendBulkGoalReminders() {
    if (!confirm('Are you sure you want to send reminders to ALL active goals? This action cannot be undone.')) {
      return;
    }

    this.reminderBulkLoading.set(true);
    this.error.set(null);
    this.success.set(null);
    this.reminderBulkResults.set(null);

    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { getApp } = await import('firebase/app');

      const app = getApp();
      const functions = getFunctions(app);
      const sendBulkReminders = httpsCallable(functions, 'sendBulkGoalReminders');

      const result = await sendBulkReminders({});
      const data = result.data as {
        success: boolean;
        message: string;
        sent: number;
        failed: number;
        total: number;
        errors: Array<{ goalId: string; email: string; error: string }>;
      };

      if (data.success) {
        this.success.set(`✅ ${data.message}`);
        this.reminderBulkResults.set({
          sent: data.sent,
          failed: data.failed,
          total: data.total,
          errors: data.errors || []
        });
      } else {
        this.error.set('Failed to send bulk reminders');
      }
    } catch (err: any) {
      console.error('Error sending bulk reminders:', err);
      const errorMessage = err.message || 'An unexpected error occurred';
      this.error.set(`Failed to send bulk reminders: ${errorMessage}`);
    } finally {
      this.reminderBulkLoading.set(false);
      setTimeout(() => {
        this.success.set(null);
        this.error.set(null);
      }, 10000);
    }
  }

  async runWeeklyResetTest() {
    this.weeklyResetLoading.set(true);
    this.weeklyResetResult.set(null);
    this.weeklyResetError.set(null);

    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { getApp } = await import('firebase/app');

      const app = getApp();
      const functions = getFunctions(app);
      const runWeeklyReset = httpsCallable(functions, 'runWeeklyResetTest');

      const goalId = this.weeklyResetGoalId().trim();
      const result = await runWeeklyReset(goalId ? { goalId } : {});
      const data = result.data as { success: boolean; message: string };

      if (data.success) {
        this.weeklyResetResult.set(data.message);
      } else {
        this.weeklyResetError.set('Weekly reset test failed.');
      }
    } catch (err: any) {
      console.error('Error running weekly reset test:', err);
      this.weeklyResetError.set(err.message || 'Failed to run weekly reset test');
    } finally {
      this.weeklyResetLoading.set(false);
    }
  }

  // Scheduled Reminders Methods
  async loadScheduledReminders() {
    this.scheduledRemindersLoading.set(true);
    this.scheduledRemindersError.set(null);

    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { getApp } = await import('firebase/app');

      const app = getApp();
      const functions = getFunctions(app);
      const getReminders = httpsCallable(functions, 'getScheduledReminders');

      const result = await getReminders({});
      const data = result.data as { success: boolean; reminders: ScheduledReminder[] };

      if (data.success) {
        this.scheduledReminders.set(data.reminders);
      }
    } catch (err: any) {
      console.error('Error loading scheduled reminders:', err);
      this.scheduledRemindersError.set(err.message || 'Failed to load scheduled reminders');
    } finally {
      this.scheduledRemindersLoading.set(false);
    }
  }

  async addScheduledReminder() {
    const time = this.newReminderTime().trim();
    const reminderType = this.newReminderType();

    if (!time) {
      this.error.set('Please select a time for the reminder');
      setTimeout(() => this.error.set(null), 5000);
      return;
    }

    this.scheduledRemindersLoading.set(true);
    this.error.set(null);

    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { getApp } = await import('firebase/app');

      const app = getApp();
      const functions = getFunctions(app);
      const addReminder = httpsCallable(functions, 'addScheduledReminder');

      const result = await addReminder({ time, reminderType });
      const data = result.data as { success: boolean; reminder: ScheduledReminder };

      if (data.success) {
        this.success.set(`Scheduled reminder added for ${time} (Eastern Time)`);
        await this.loadScheduledReminders();
        this.newReminderTime.set('09:00');
        this.newReminderType.set('ignition');
      }
    } catch (err: any) {
      console.error('Error adding scheduled reminder:', err);
      this.error.set(err.message || 'Failed to add scheduled reminder');
    } finally {
      this.scheduledRemindersLoading.set(false);
      setTimeout(() => {
        this.success.set(null);
        this.error.set(null);
      }, 5000);
    }
  }

  async deleteScheduledReminder(id: string) {
    if (!confirm('Are you sure you want to delete this scheduled reminder?')) {
      return;
    }

    this.scheduledRemindersLoading.set(true);
    this.error.set(null);

    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { getApp } = await import('firebase/app');

      const app = getApp();
      const functions = getFunctions(app);
      const deleteReminder = httpsCallable(functions, 'deleteScheduledReminder');

      await deleteReminder({ id });
      this.success.set('Scheduled reminder deleted');
      await this.loadScheduledReminders();
    } catch (err: any) {
      console.error('Error deleting scheduled reminder:', err);
      this.error.set(err.message || 'Failed to delete scheduled reminder');
    } finally {
      this.scheduledRemindersLoading.set(false);
      setTimeout(() => {
        this.success.set(null);
        this.error.set(null);
      }, 5000);
    }
  }

  async toggleReminderEnabled(reminder: ScheduledReminder) {
    this.scheduledRemindersLoading.set(true);
    this.error.set(null);

    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { getApp } = await import('firebase/app');

      const app = getApp();
      const functions = getFunctions(app);
      const updateReminder = httpsCallable(functions, 'updateScheduledReminder');

      await updateReminder({ id: reminder.id, enabled: !reminder.enabled });
      this.success.set(`Reminder ${!reminder.enabled ? 'enabled' : 'disabled'}`);
      await this.loadScheduledReminders();
    } catch (err: any) {
      console.error('Error toggling reminder:', err);
      this.error.set(err.message || 'Failed to update reminder');
    } finally {
      this.scheduledRemindersLoading.set(false);
      setTimeout(() => {
        this.success.set(null);
        this.error.set(null);
      }, 5000);
    }
  }

  editReminder(reminder: ScheduledReminder) {
    this.editingReminder.set(reminder);
    this.editingEmailSubject.set(reminder.emailSubject);
    this.editingEmailBodyText.set(reminder.emailBodyText);
    this.editingEmailBodyHtml.set(reminder.emailBodyHtml);
    this.editingReminderType.set(reminder.reminderType || this.inferReminderTypeFromTime(reminder.time));
    this.showEmailPreview.set(false);
  }

  cancelEditReminder() {
    this.editingReminder.set(null);
    this.editingEmailSubject.set('');
    this.editingEmailBodyText.set('');
    this.editingEmailBodyHtml.set('');
    this.editingReminderType.set('mission_log');
    this.showEmailPreview.set(false);
  }

  toggleEmailPreview() {
    this.showEmailPreview.update(v => !v);
  }

  async saveReminderEmail() {
    const reminder = this.editingReminder();
    if (!reminder) return;

    this.savingReminder.set(true);
    this.error.set(null);

    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { getApp } = await import('firebase/app');

      const app = getApp();
      const functions = getFunctions(app);
      const updateReminder = httpsCallable(functions, 'updateScheduledReminder');

      await updateReminder({
        id: reminder.id,
        reminderType: this.editingReminderType(),
        emailSubject: this.editingEmailSubject(),
        emailBodyText: this.editingEmailBodyText(),
        emailBodyHtml: this.editingEmailBodyHtml()
      });

      this.success.set('Email template saved');
      await this.loadScheduledReminders();
      this.cancelEditReminder();
    } catch (err: any) {
      console.error('Error saving reminder email:', err);
      this.error.set(err.message || 'Failed to save email template');
    } finally {
      this.savingReminder.set(false);
      setTimeout(() => {
        this.success.set(null);
        this.error.set(null);
      }, 5000);
    }
  }

  async resetToDefaultTemplate() {
    if (!confirm('Reset email template to default? This will overwrite your current changes.')) {
      return;
    }

    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { getApp } = await import('firebase/app');

      const app = getApp();
      const functions = getFunctions(app);
      const getDefault = httpsCallable(functions, 'getDefaultEmailTemplate');

      const result = await getDefault({ reminderType: this.editingReminderType() });
      const data = result.data as { success: boolean; template: { subject: string; text: string; html: string } };

      if (data.success) {
        this.editingEmailSubject.set(data.template.subject);
        this.editingEmailBodyText.set(data.template.text);
        this.editingEmailBodyHtml.set(data.template.html);
        this.success.set('Template reset to default');
      }
    } catch (err: any) {
      console.error('Error resetting template:', err);
      this.error.set(err.message || 'Failed to reset template');
    }
    setTimeout(() => {
      this.success.set(null);
      this.error.set(null);
    }, 5000);
  }

  formatTime(time: string): string {
    const [hours, minutes] = time.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  }

  inferReminderTypeFromTime(time: string): 'ignition' | 'mission_log' {
    const hour = Number(time.split(':')[0]);
    if (Number.isNaN(hour)) return 'mission_log';
    return hour < 12 ? 'ignition' : 'mission_log';
  }

  formatReminderType(reminderType?: 'ignition' | 'mission_log'): string {
    if (reminderType === 'ignition') return 'Daily Ignition';
    if (reminderType === 'mission_log') return 'Mission Log';
    return 'Mission Log';
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

  toggleDarkMode() {
    this.theme.toggleDarkMode();
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

  getDateRangeParams() {
    const range = this.dateRange();
    console.log('🔍 getDateRangeParams called with range:', range);
    let startDate: string;
    let endDate = 'today';

    if (range === '1day') {
      startDate = '1daysAgo';
    } else if (range === '7days') {
      startDate = '7daysAgo';
    } else if (range === '30days') {
      startDate = '30daysAgo';
    } else if (range === 'custom') {
      const start = this.customStartDate();
      const end = this.customEndDate();
      if (!start || !end) {
        throw new Error('Please select both start and end dates for custom range');
      }
      // Convert YYYY-MM-DD to YYYYMMDD format for GA4
      startDate = start.replace(/-/g, '');
      endDate = end.replace(/-/g, '');
    } else {
      startDate = '30daysAgo';
    }

    const params = { startDate, endDate };
    console.log('🔍 getDateRangeParams returning:', params);
    return params;
  }

  async loadAiAnalytics() {
    this.aiAnalyticsLoading.set(true);
    this.aiAnalyticsError.set(null);
    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { getApp } = await import('firebase/app');
      const functions = getFunctions(getApp());
      const fetchAnalytics = httpsCallable(functions, 'getAiAnalytics');
      const dateParams = this.getDateRangeParams();
      console.log('📊 Loading AI analytics with date range:', dateParams, 'Current range signal:', this.dateRange());
      console.log('📊 Sending to backend:', JSON.stringify(dateParams));
      const result = await fetchAnalytics(dateParams);
      const data = result.data as AiAnalytics;
      console.log('📊 Received analytics data - dateRange:', data.dateRange, 'views:', data.views);
      this.aiAnalytics.set(data);
    } catch (err: any) {
      console.error('Failed to load AI analytics', err);
      this.aiAnalyticsError.set(err.message || 'Unable to load AI page analytics.');
    } finally {
      this.aiAnalyticsLoading.set(false);
    }
  }

  setDateRange(range: '1day' | '7days' | '30days' | 'custom') {
    console.log('🔍 setDateRange called with:', range);
    this.dateRange.set(range);
    if (range !== 'custom') {
      // Immediately load with the new range
      console.log('🔍 Loading analytics for range:', range);
      this.loadAiAnalytics();
    } else {
      // Pre-populate custom dates with last 30 days if not already set
      if (!this.customStartDate() || !this.customEndDate()) {
        const today = new Date();
        const startDate = new Date(today);
        startDate.setDate(today.getDate() - 30);
        this.customStartDate.set(startDate.toISOString().split('T')[0]);
        this.customEndDate.set(today.toISOString().split('T')[0]);
      }
    }
  }

  applyCustomDateRange() {
    if (this.customStartDate() && this.customEndDate()) {
      this.loadAiAnalytics();
    }
  }

  getMonthRange(monthsAgo: number) {
    const today = new Date();
    const startDate = new Date(today.getFullYear(), today.getMonth() - monthsAgo, 1);
    const endDate = new Date(today.getFullYear(), today.getMonth() - (monthsAgo - 1), 0);

    this.customStartDate.set(startDate.toISOString().split('T')[0]);
    this.customEndDate.set(endDate.toISOString().split('T')[0]);
    this.dateRange.set('custom');
    this.loadAiAnalytics();
  }

  formatDuration(seconds: number) {
    if (!Number.isFinite(seconds)) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    if (mins === 0) return `${secs}s`;
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
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

  async loadPromoCodes() {
    this.promoCodesLoading.set(true);
    this.promoCodesError.set(null);
    try {
      const firestore = await this.ensureFirestore();
      const firestoreModule = await import('firebase/firestore');
      const docRef = firestoreModule.doc(firestore, 'adminSettings', 'promoCodes');
      const docSnap = await firestoreModule.getDoc(docRef);

      const parseUsedBy = (usedByData: unknown): PromoCodeUser[] => {
        if (!Array.isArray(usedByData)) return [];
        return usedByData.map(user => ({
          userId: user.userId || '',
          name: user.name || 'Unknown',
          email: user.email || '',
          redeemedAt: user.redeemedAt?.toDate?.() || new Date(user.redeemedAt) || new Date()
        }));
      };

      const parseCodesArray = (data: unknown): PromoCode[] => {
        if (Array.isArray(data)) {
          return data.map(item => ({
            code: item.code || '',
            usageCount: item.usageCount || 0,
            createdAt: item.createdAt?.toDate?.() || new Date(item.createdAt) || new Date(),
            durationMonths: typeof item.durationMonths === 'number' ? item.durationMonths : 1,
            lifetimeAccess: Boolean(item.lifetimeAccess),
            usedBy: parseUsedBy(item.usedBy),
            archived: item.archived || false
          }));
        }
        // Handle legacy single code format
        if (typeof data === 'string' && data) {
          return [{ code: data, usageCount: 0, createdAt: new Date(), durationMonths: 1, lifetimeAccess: false, usedBy: [], archived: false }];
        }
        return [];
      };

      if (docSnap.exists()) {
        const data = docSnap.data();
        this.promoCodesMoonshot.set(parseCodesArray(data['moonshot']));
        this.promoCodesInterplanetary.set(parseCodesArray(data['interplanetary']));
        this.promoCodesGalactic.set(parseCodesArray(data['galactic']));
      } else {
        // Initialize with default values if document doesn't exist
        this.promoCodesMoonshot.set([{ code: 'NY2026MOONSHOT', usageCount: 0, createdAt: new Date(), durationMonths: 1, lifetimeAccess: false, usedBy: [], archived: false }]);
        this.promoCodesInterplanetary.set([{ code: 'NY2026INTERPLANETARY', usageCount: 0, createdAt: new Date(), durationMonths: 1, lifetimeAccess: false, usedBy: [], archived: false }]);
        this.promoCodesGalactic.set([{ code: 'NY2026GALACTIC', usageCount: 0, createdAt: new Date(), durationMonths: 1, lifetimeAccess: false, usedBy: [], archived: false }]);
      }
    } catch (err: any) {
      console.error('Failed to load promo codes:', err);
      this.promoCodesError.set('Unable to load promo codes.');
    } finally {
      this.promoCodesLoading.set(false);
    }
  }

  async addPromoCode(tier: 'moonshot' | 'interplanetary' | 'galactic') {
    let newCode = '';
    let duration = 1;
    let lifetimeAccess = false;
    if (tier === 'moonshot') {
      newCode = this.newCodeMoonshot().trim().toUpperCase();
      duration = this.newDurationMoonshot();
      lifetimeAccess = this.newLifetimeMoonshot();
    } else if (tier === 'interplanetary') {
      newCode = this.newCodeInterplanetary().trim().toUpperCase();
      duration = this.newDurationInterplanetary();
      lifetimeAccess = this.newLifetimeInterplanetary();
    } else {
      newCode = this.newCodeGalactic().trim().toUpperCase();
      duration = this.newDurationGalactic();
      lifetimeAccess = this.newLifetimeGalactic();
    }

    if (!newCode) {
      this.promoCodesError.set('Please enter a promo code.');
      setTimeout(() => this.promoCodesError.set(null), 5000);
      return;
    }

    if (!lifetimeAccess && (duration < 1 || duration > 12)) {
      this.promoCodesError.set('Duration must be between 1 and 12 months or set to lifetime.');
      setTimeout(() => this.promoCodesError.set(null), 5000);
      return;
    }

    // Check for duplicates across all tiers
    const allCodes = [
      ...this.promoCodesMoonshot().map(c => c.code),
      ...this.promoCodesInterplanetary().map(c => c.code),
      ...this.promoCodesGalactic().map(c => c.code)
    ];

    if (allCodes.includes(newCode)) {
      this.promoCodesError.set('This promo code already exists.');
      setTimeout(() => this.promoCodesError.set(null), 5000);
      return;
    }

    this.promoCodesSaving.set(true);
    this.promoCodesError.set(null);

    try {
      const firestore = await this.ensureFirestore();
      const firestoreModule = await import('firebase/firestore');
      const docRef = firestoreModule.doc(firestore, 'adminSettings', 'promoCodes');

    const newPromoCode: PromoCode = {
      code: newCode,
      usageCount: 0,
      createdAt: new Date(),
      durationMonths: lifetimeAccess ? 0 : duration,
      lifetimeAccess,
      usedBy: [],
      archived: false
    };

      // Get current codes for the tier and add the new one
      let currentCodes: PromoCode[];
      if (tier === 'moonshot') {
        currentCodes = [...this.promoCodesMoonshot(), newPromoCode];
      } else if (tier === 'interplanetary') {
        currentCodes = [...this.promoCodesInterplanetary(), newPromoCode];
      } else {
        currentCodes = [...this.promoCodesGalactic(), newPromoCode];
      }

      // Convert to Firestore format
      const firestoreCodes = currentCodes.map(c => ({
        code: c.code,
        usageCount: c.usageCount,
        createdAt: firestoreModule.Timestamp.fromDate(c.createdAt),
        durationMonths: c.durationMonths,
        lifetimeAccess: c.lifetimeAccess,
        usedBy: c.usedBy.map(u => ({
          userId: u.userId,
          name: u.name,
          email: u.email,
          redeemedAt: firestoreModule.Timestamp.fromDate(u.redeemedAt)
        })),
        archived: c.archived
      }));

      await firestoreModule.setDoc(docRef, {
        [tier]: firestoreCodes,
        updatedAt: firestoreModule.Timestamp.now()
      }, { merge: true });

      // Update local state and reset inputs
      if (tier === 'moonshot') {
        this.promoCodesMoonshot.set(currentCodes);
        this.newCodeMoonshot.set('');
        this.newDurationMoonshot.set(12);
        this.newLifetimeMoonshot.set(false);
      } else if (tier === 'interplanetary') {
        this.promoCodesInterplanetary.set(currentCodes);
        this.newCodeInterplanetary.set('');
        this.newDurationInterplanetary.set(12);
        this.newLifetimeInterplanetary.set(false);
      } else {
        this.promoCodesGalactic.set(currentCodes);
        this.newCodeGalactic.set('');
        this.newDurationGalactic.set(12);
        this.newLifetimeGalactic.set(false);
      }

      this.success.set(`Promo code "${newCode}" added successfully!`);
      setTimeout(() => this.success.set(null), 5000);
    } catch (err: any) {
      console.error('Failed to add promo code:', err);
      this.promoCodesError.set('Failed to add promo code. Please try again.');
      setTimeout(() => this.promoCodesError.set(null), 5000);
    } finally {
      this.promoCodesSaving.set(false);
    }
  }

  async deletePromoCode(tier: 'moonshot' | 'interplanetary' | 'galactic', code: string) {
    if (!confirm(`Are you sure you want to delete the promo code "${code}"?`)) {
      return;
    }

    this.promoCodesSaving.set(true);
    this.promoCodesError.set(null);

    try {
      const firestore = await this.ensureFirestore();
      const firestoreModule = await import('firebase/firestore');
      const docRef = firestoreModule.doc(firestore, 'adminSettings', 'promoCodes');

      // Get current codes for the tier and remove the one to delete
      let currentCodes: PromoCode[];
      if (tier === 'moonshot') {
        currentCodes = this.promoCodesMoonshot().filter(c => c.code !== code);
      } else if (tier === 'interplanetary') {
        currentCodes = this.promoCodesInterplanetary().filter(c => c.code !== code);
      } else {
        currentCodes = this.promoCodesGalactic().filter(c => c.code !== code);
      }

      // Convert to Firestore format
      const firestoreCodes = currentCodes.map(c => ({
        code: c.code,
        usageCount: c.usageCount,
        createdAt: firestoreModule.Timestamp.fromDate(c.createdAt),
        durationMonths: c.durationMonths,
        lifetimeAccess: c.lifetimeAccess,
        usedBy: c.usedBy.map(u => ({
          userId: u.userId,
          name: u.name,
          email: u.email,
          redeemedAt: firestoreModule.Timestamp.fromDate(u.redeemedAt)
        })),
        archived: c.archived
      }));

      await firestoreModule.setDoc(docRef, {
        [tier]: firestoreCodes,
        updatedAt: firestoreModule.Timestamp.now()
      }, { merge: true });

      // Update local state
      if (tier === 'moonshot') {
        this.promoCodesMoonshot.set(currentCodes);
      } else if (tier === 'interplanetary') {
        this.promoCodesInterplanetary.set(currentCodes);
      } else {
        this.promoCodesGalactic.set(currentCodes);
      }

      this.success.set(`Promo code "${code}" deleted successfully!`);
      setTimeout(() => this.success.set(null), 5000);
    } catch (err: any) {
      console.error('Failed to delete promo code:', err);
      this.promoCodesError.set('Failed to delete promo code. Please try again.');
      setTimeout(() => this.promoCodesError.set(null), 5000);
    } finally {
      this.promoCodesSaving.set(false);
    }
  }

  async toggleArchivePromoCode(tier: 'moonshot' | 'interplanetary' | 'galactic', code: string) {
    this.promoCodesSaving.set(true);
    this.promoCodesError.set(null);

    try {
      const firestore = await this.ensureFirestore();
      const firestoreModule = await import('firebase/firestore');
      const docRef = firestoreModule.doc(firestore, 'adminSettings', 'promoCodes');

      // Get current codes for the tier and toggle the archived status
      let currentCodes: PromoCode[];
      if (tier === 'moonshot') {
        currentCodes = this.promoCodesMoonshot().map(c =>
          c.code === code ? { ...c, archived: !c.archived } : c
        );
      } else if (tier === 'interplanetary') {
        currentCodes = this.promoCodesInterplanetary().map(c =>
          c.code === code ? { ...c, archived: !c.archived } : c
        );
      } else {
        currentCodes = this.promoCodesGalactic().map(c =>
          c.code === code ? { ...c, archived: !c.archived } : c
        );
      }

      const targetCode = currentCodes.find(c => c.code === code);
      const isNowArchived = targetCode?.archived;

      // Convert to Firestore format
      const firestoreCodes = currentCodes.map(c => ({
        code: c.code,
        usageCount: c.usageCount,
        createdAt: firestoreModule.Timestamp.fromDate(c.createdAt),
        durationMonths: c.durationMonths,
        lifetimeAccess: c.lifetimeAccess,
        usedBy: c.usedBy.map(u => ({
          userId: u.userId,
          name: u.name,
          email: u.email,
          redeemedAt: firestoreModule.Timestamp.fromDate(u.redeemedAt)
        })),
        archived: c.archived
      }));

      await firestoreModule.setDoc(docRef, {
        [tier]: firestoreCodes,
        updatedAt: firestoreModule.Timestamp.now()
      }, { merge: true });

      // Update local state
      if (tier === 'moonshot') {
        this.promoCodesMoonshot.set(currentCodes);
      } else if (tier === 'interplanetary') {
        this.promoCodesInterplanetary.set(currentCodes);
      } else {
        this.promoCodesGalactic.set(currentCodes);
      }

      this.success.set(`Promo code "${code}" ${isNowArchived ? 'archived' : 'activated'} successfully!`);
      setTimeout(() => this.success.set(null), 5000);
    } catch (err: any) {
      console.error('Failed to toggle archive status:', err);
      this.promoCodesError.set('Failed to update promo code. Please try again.');
      setTimeout(() => this.promoCodesError.set(null), 5000);
    } finally {
      this.promoCodesSaving.set(false);
    }
  }

  async loadDemoRequests() {
    this.demoRequestsLoading.set(true);
    this.demoRequestsError.set(null);
    try {
      const firestore = await this.ensureFirestore();
      const firestoreModule = await import('firebase/firestore');
      const demoRequestsRef = firestoreModule.collection(firestore, 'demoRequests');
      const q = firestoreModule.query(demoRequestsRef, firestoreModule.orderBy('createdAt', 'desc'));
      const snapshot = await firestoreModule.getDocs(q);

      const requests: DemoRequest[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        requests.push({
          id: doc.id,
          firstName: data['firstName'] || '',
          lastName: data['lastName'] || '',
          email: data['email'] || '',
          company: data['company'] || null,
          expectations: data['expectations'] || '',
          scheduledDate: data['scheduledDate']?.toDate?.() || new Date(data['scheduledDate']),
          scheduledTime: data['scheduledTime'] || '',
          displayTime: data['displayTime'] || '',
          meetingLink: data['meetingLink'] || '',
          createdAt: data['createdAt']?.toDate?.() || new Date()
        });
      });

      this.demoRequests.set(requests);
    } catch (err: any) {
      console.error('Failed to load demo requests:', err);
      this.demoRequestsError.set('Unable to load demo requests.');
    } finally {
      this.demoRequestsLoading.set(false);
    }
  }

  formatDemoDate(date: Date): string {
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  formatDemoDateTime(date: Date): string {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  async deleteDemoRequest(requestId: string) {
    if (!confirm('Are you sure you want to delete this demo request? This action cannot be undone.')) {
      return;
    }

    try {
      const firestore = await this.ensureFirestore();
      const firestoreModule = await import('firebase/firestore');
      const docRef = firestoreModule.doc(firestore, 'demoRequests', requestId);
      await firestoreModule.deleteDoc(docRef);

      // Update local state to remove the deleted request
      this.demoRequests.update(requests => requests.filter(r => r.id !== requestId));
      this.success.set('✅ Demo request deleted successfully');
      setTimeout(() => this.success.set(null), 5000);
    } catch (err: any) {
      console.error('Failed to delete demo request:', err);
      this.error.set('Failed to delete demo request. Please try again.');
      setTimeout(() => this.error.set(null), 5000);
    }
  }

  async loadBookDownloads() {
    this.bookDownloadsLoading.set(true);
    this.bookDownloadsError.set(null);
    try {
      const firestore = await this.ensureFirestore();
      const firestoreModule = await import('firebase/firestore');
      const bookDownloadsRef = firestoreModule.collection(firestore, 'bookDownloads');
      const q = firestoreModule.query(bookDownloadsRef, firestoreModule.orderBy('downloadedAt', 'desc'));
      const snapshot = await firestoreModule.getDocs(q);

      const downloads: BookDownload[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        downloads.push({
          id: doc.id,
          userId: data['userId'] || '',
          firstName: data['firstName'] || '',
          lastName: data['lastName'] || '',
          email: data['email'] || '',
          bookTitle: data['bookTitle'] || 'Surge: 42 High-Velocity Prompts',
          downloadedAt: data['downloadedAt']?.toDate?.() || new Date(data['downloadedAt'])
        });
      });

      this.bookDownloads.set(downloads);
    } catch (err: any) {
      console.error('Failed to load book downloads:', err);
      this.bookDownloadsError.set('Unable to load book downloads.');
    } finally {
      this.bookDownloadsLoading.set(false);
    }
  }

  formatDownloadDateTime(date: Date): string {
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  exportBookDownloadsCsv() {
    const downloads = this.bookDownloads();
    if (downloads.length === 0) {
      this.error.set('No book downloads to export.');
      setTimeout(() => this.error.set(null), 5000);
      return;
    }

    // CSV headers
    const headers = ['First Name', 'Last Name', 'Email', 'Book Title', 'Downloaded At', 'User ID'];

    // CSV rows
    const rows = downloads.map(d => [
      this.escapeCsvField(d.firstName),
      this.escapeCsvField(d.lastName),
      this.escapeCsvField(d.email),
      this.escapeCsvField(d.bookTitle),
      this.escapeCsvField(this.formatDownloadDateTime(d.downloadedAt)),
      this.escapeCsvField(d.userId || 'N/A')
    ]);

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Create and download the file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `surge-book-downloads-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    this.success.set(`Exported ${downloads.length} book downloads to CSV`);
    setTimeout(() => this.success.set(null), 5000);
  }

  private escapeCsvField(field: string): string {
    if (!field) return '';
    // If field contains comma, newline, or quotes, wrap in quotes and escape internal quotes
    if (field.includes(',') || field.includes('\n') || field.includes('"')) {
      return `"${field.replace(/"/g, '""')}"`;
    }
    return field;
  }

  async deleteBookDownload(downloadId: string) {
    if (!confirm('Are you sure you want to delete this book download record? This action cannot be undone.')) {
      return;
    }

    try {
      const firestore = await this.ensureFirestore();
      const firestoreModule = await import('firebase/firestore');
      const docRef = firestoreModule.doc(firestore, 'bookDownloads', downloadId);
      await firestoreModule.deleteDoc(docRef);

      // Update local state to remove the deleted download
      this.bookDownloads.update(downloads => downloads.filter(d => d.id !== downloadId));
      this.success.set('Book download record deleted successfully');
      setTimeout(() => this.success.set(null), 5000);
    } catch (err: any) {
      console.error('Failed to delete book download:', err);
      this.error.set('Failed to delete book download. Please try again.');
      setTimeout(() => this.error.set(null), 5000);
    }
  }
}

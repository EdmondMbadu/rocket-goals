import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { AvatarDropdownComponent } from '../avatar-dropdown.component';

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
  selector: 'app-ai-stats',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AvatarDropdownComponent],
  templateUrl: './ai-stats.component.html',
  styleUrl: './ai-stats.component.css'
})
export class AiStatsComponent implements OnInit {
  private authService = inject(AuthService);
  private router = inject(Router);

  checkingAuth = signal(true);
  isAdmin = signal(false);
  aiAnalytics = signal<AiAnalytics | null>(null);
  aiAnalyticsLoading = signal(false);
  aiAnalyticsError = signal<string | null>(null);
  dateRange = signal<'1day' | '7days' | '30days' | 'custom'>('30days');
  customStartDate = signal<string>('');
  customEndDate = signal<string>('');

  async ngOnInit() {
    console.log('🔐 AI Stats component initializing...');

    // Wait for auth to load
    let attempts = 0;
    while (!this.authService.profile() && attempts < 20) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    const profile = this.authService.profile();
    console.log('🔐 Profile loaded:', profile);

    if (!profile) {
      console.log('🔐 No profile, redirecting to login');
      this.router.navigate(['/login']);
      return;
    }

    // Check if user is admin
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
    this.loadAiAnalytics();
  }

  getDateRangeParams() {
    const range = this.dateRange();
    const today = new Date();
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

    return { startDate, endDate };
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
      const result = await fetchAnalytics(dateParams);
      const data = result.data as AiAnalytics;
      this.aiAnalytics.set(data);
    } catch (err: any) {
      console.error('Failed to load AI analytics', err);
      this.aiAnalyticsError.set(err.message || 'Unable to load AI page analytics.');
    } finally {
      this.aiAnalyticsLoading.set(false);
    }
  }

  setDateRange(range: '1day' | '7days' | '30days' | 'custom') {
    this.dateRange.set(range);
    if (range !== 'custom') {
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

  getProfile() {
    return this.authService.profile();
  }
}

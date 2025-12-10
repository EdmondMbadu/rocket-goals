import { Component, inject, signal, OnInit, AfterViewInit, OnDestroy, effect, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { AvatarDropdownComponent } from '../avatar-dropdown.component';
import { Chart, ChartConfiguration, registerables } from 'chart.js';

Chart.register(...registerables);

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
export class AiStatsComponent implements OnInit, AfterViewInit, OnDestroy {
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

  // Chart instances
  private countriesChart: Chart | null = null;
  private devicesChart: Chart | null = null;
  private browsersChart: Chart | null = null;
  private trafficSourcesChart: Chart | null = null;
  private metricsBarChart: Chart | null = null;

  // Color palette for charts
  private readonly chartColors = [
    '#ef4444', // red-500
    '#f97316', // orange-500
    '#eab308', // yellow-500
    '#22c55e', // green-500
    '#3b82f6', // blue-500
    '#8b5cf6', // violet-500
    '#ec4899', // pink-500
    '#06b6d4', // cyan-500
    '#84cc16', // lime-500
    '#f59e0b', // amber-500
  ];

  constructor() {
    // Update charts when analytics data changes
    effect(() => {
      const data = this.aiAnalytics();
      if (data && !this.aiAnalyticsLoading()) {
        // Wait for DOM to be ready
        setTimeout(() => {
          if (document.getElementById('countriesChart')) {
            this.updateAllCharts();
          }
        }, 200);
      }
    });
  }

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
      console.log('📊 Loading AI analytics with date range:', dateParams, 'Current range:', this.dateRange());
      const result = await fetchAnalytics(dateParams);
      const data = result.data as AiAnalytics;
      console.log('📊 Received analytics data:', data);
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

  ngAfterViewInit() {
    // Charts will be initialized when data is loaded via effect
  }

  ngOnDestroy() {
    // Clean up chart instances to prevent memory leaks
    if (this.countriesChart) {
      this.countriesChart.destroy();
    }
    if (this.devicesChart) {
      this.devicesChart.destroy();
    }
    if (this.browsersChart) {
      this.browsersChart.destroy();
    }
    if (this.trafficSourcesChart) {
      this.trafficSourcesChart.destroy();
    }
    if (this.metricsBarChart) {
      this.metricsBarChart.destroy();
    }
  }

  private updateAllCharts() {
    const data = this.aiAnalytics();
    if (!data) return;

    this.updateCountriesChart(data);
    this.updateDevicesChart(data);
    this.updateBrowsersChart(data);
    this.updateTrafficSourcesChart(data);
    this.updateMetricsBarChart(data);
  }

  private updateCountriesChart(data: AiAnalytics) {
    const canvas = document.getElementById('countriesChart') as HTMLCanvasElement;
    if (!canvas) return;

    const topCountries = data.countries.slice(0, 8);
    const labels = topCountries.map(c => c.country);
    const values = topCountries.map(c => c.activeUsers);

    if (this.countriesChart) {
      this.countriesChart.destroy();
    }

    this.countriesChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: this.chartColors.slice(0, labels.length),
          borderWidth: 2,
          borderColor: '#ffffff',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 15,
              font: { size: 12, weight: 500 },
              usePointStyle: true,
            }
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const label = context.label || '';
                const value = context.parsed || 0;
                const total = values.reduce((a, b) => a + b, 0);
                const percentage = ((value / total) * 100).toFixed(1);
                return `${label}: ${value.toLocaleString()} users (${percentage}%)`;
              }
            }
          }
        }
      }
    });
  }

  private updateDevicesChart(data: AiAnalytics) {
    const canvas = document.getElementById('devicesChart') as HTMLCanvasElement;
    if (!canvas) return;

    const labels = data.devices.map(d => d.device);
    const values = data.devices.map(d => d.activeUsers);

    if (this.devicesChart) {
      this.devicesChart.destroy();
    }

    this.devicesChart = new Chart(canvas, {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: this.chartColors.slice(0, labels.length),
          borderWidth: 2,
          borderColor: '#ffffff',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 15,
              font: { size: 12, weight: 500 },
              usePointStyle: true,
            }
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const label = context.label || '';
                const value = context.parsed || 0;
                const total = values.reduce((a, b) => a + b, 0);
                const percentage = ((value / total) * 100).toFixed(1);
                return `${label}: ${value.toLocaleString()} users (${percentage}%)`;
              }
            }
          }
        }
      }
    });
  }

  private updateBrowsersChart(data: AiAnalytics) {
    const canvas = document.getElementById('browsersChart') as HTMLCanvasElement;
    if (!canvas) return;

    const labels = data.browsers.map(b => b.browser);
    const values = data.browsers.map(b => b.activeUsers);

    if (this.browsersChart) {
      this.browsersChart.destroy();
    }

    this.browsersChart = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: this.chartColors.slice(0, labels.length),
          borderWidth: 2,
          borderColor: '#ffffff',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 15,
              font: { size: 12, weight: 500 },
              usePointStyle: true,
            }
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const label = context.label || '';
                const value = context.parsed || 0;
                const total = values.reduce((a, b) => a + b, 0);
                const percentage = ((value / total) * 100).toFixed(1);
                return `${label}: ${value.toLocaleString()} users (${percentage}%)`;
              }
            }
          }
        }
      }
    });
  }

  private updateTrafficSourcesChart(data: AiAnalytics) {
    const canvas = document.getElementById('trafficSourcesChart') as HTMLCanvasElement;
    if (!canvas) return;

    const labels = data.trafficSources.map(t => t.channel);
    const values = data.trafficSources.map(t => t.activeUsers);

    if (this.trafficSourcesChart) {
      this.trafficSourcesChart.destroy();
    }

    this.trafficSourcesChart = new Chart(canvas, {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          data: values,
          backgroundColor: this.chartColors.slice(0, labels.length),
          borderWidth: 2,
          borderColor: '#ffffff',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              padding: 15,
              font: { size: 12, weight: 500 },
              usePointStyle: true,
            }
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const label = context.label || '';
                const value = context.parsed || 0;
                const total = values.reduce((a, b) => a + b, 0);
                const percentage = ((value / total) * 100).toFixed(1);
                return `${label}: ${value.toLocaleString()} users (${percentage}%)`;
              }
            }
          }
        }
      }
    });
  }

  private updateMetricsBarChart(data: AiAnalytics) {
    const canvas = document.getElementById('metricsBarChart') as HTMLCanvasElement;
    if (!canvas) return;

    // Normalize metrics for comparison (using relative scale)
    const maxValue = Math.max(
      data.views,
      data.activeUsers,
      data.newUsers,
      data.sessions,
      data.eventCount
    );

    const labels = ['Views', 'Active Users', 'New Users', 'Sessions', 'Events'];
    const values = [
      (data.views / maxValue) * 100,
      (data.activeUsers / maxValue) * 100,
      (data.newUsers / maxValue) * 100,
      (data.sessions / maxValue) * 100,
      (data.eventCount / maxValue) * 100,
    ];
    const actualValues = [data.views, data.activeUsers, data.newUsers, data.sessions, data.eventCount];

    if (this.metricsBarChart) {
      this.metricsBarChart.destroy();
    }

    this.metricsBarChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Relative Performance',
          data: values,
          backgroundColor: [
            'rgba(239, 68, 68, 0.8)',   // red
            'rgba(59, 130, 246, 0.8)',  // blue
            'rgba(34, 197, 94, 0.8)',   // green
            'rgba(139, 92, 246, 0.8)',  // violet
            'rgba(236, 72, 153, 0.8)',  // pink
          ],
          borderColor: [
            'rgb(239, 68, 68)',
            'rgb(59, 130, 246)',
            'rgb(34, 197, 94)',
            'rgb(139, 92, 246)',
            'rgb(236, 72, 153)',
          ],
          borderWidth: 2,
          borderRadius: 8,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const index = context.dataIndex;
                return `Value: ${actualValues[index].toLocaleString()}`;
              }
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            max: 100,
            ticks: {
              callback: function (value) {
                return value + '%';
              }
            },
            grid: {
              color: 'rgba(0, 0, 0, 0.05)',
            }
          },
          y: {
            grid: {
              color: 'rgba(0, 0, 0, 0.05)',
            }
          }
        }
      }
    });
  }
}

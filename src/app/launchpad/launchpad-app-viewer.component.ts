import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ThemeService } from '../theme.service';
import { AvatarDropdownComponent } from '../avatar-dropdown.component';
import { LaunchpadService } from './launchpad.service';
import { LAUNCHPAD_TEMPLATES, LaunchpadTemplate } from './launchpad.types';

@Component({
  selector: 'app-launchpad-app-viewer',
  standalone: true,
  imports: [CommonModule, RouterLink, AvatarDropdownComponent],
  template: `
    <div class="launchpad-page" 
      [class.light-theme]="!isDarkMode()" 
      [class.dark-theme]="isDarkMode()">
      
      <!-- Animated Backgrounds -->
      <div class="absolute inset-0 bg-page-gradient"></div>
      
      <!-- Stars (Visible in Dark Mode) -->
      @if (isDarkMode()) {
        <div class="stars-layer stars-sm"></div>
        <div class="stars-layer stars-md"></div>
        <div class="stars-layer stars-lg"></div>
      } @else {
        <!-- Light Mode Pattern -->
        <div class="light-pattern-overlay"></div>
      }
      
      <!-- Dynamic Gradient Orbs -->
      <div class="gradient-orb orb-primary" [style.background]="'radial-gradient(circle, ' + template()?.accentColor + ' 0%, transparent 70%)'"></div>
      <div class="gradient-orb orb-secondary" [style.background]="'radial-gradient(circle, ' + template()?.accentColor + 'dd 0%, transparent 70%)'"></div>
      
      <!-- Grid Overlay -->
      <div class="grid-overlay"></div>
      
      <!-- Navigation -->
      <nav class="launchpad-nav">
        <div class="container mx-auto px-6 py-4">
          <div class="flex items-center justify-between max-w-7xl mx-auto">
            <a routerLink="/" class="flex items-center gap-3 group">
              <div class="relative">
                <div class="absolute -inset-1 bg-gradient-to-r from-red-600 to-orange-500 rounded-full blur opacity-30 group-hover:opacity-50 transition duration-500"></div>
                <img src="/assets/rocket-goals.png" alt="Rocket Goals" class="relative w-12 h-12 object-contain" />
              </div>
              <span class="text-xl font-black tracking-tight hidden sm:block">
                ROCKET<span class="text-red-600">GOALS</span>
              </span>
            </a>
            
            <div class="flex items-center gap-4">
              <a routerLink="/app-suite" class="transition-colors text-sm font-bold flex items-center gap-2 opacity-60 hover:opacity-100">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
                </svg>
                Back to Launch Pad
              </a>
              <button (click)="toggleTheme()" class="p-2 rounded-full border transition-all duration-300 glass hover:scale-110"
                [title]="isDarkMode() ? 'Switch to Light Mode' : 'Switch to Dark Mode'">
                @if (isDarkMode()) {
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.021 0l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                } @else {
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                  </svg>
                }
              </button>
              @if (isLoggedIn()) {
                <app-avatar-dropdown />
              } @else {
                <a routerLink="/signup" 
                   class="px-6 py-2.5 text-white text-sm font-black rounded-full transition-all duration-300 shadow-xl hover:scale-105 active:scale-95"
                   [style.background]="template()?.accentColor || '#ef4444'"
                   [style.boxShadow]="'0 10px 30px ' + (template()?.accentColor || '#ef4444') + '44'">
                  Get Started
                </a>
              }
            </div>
          </div>
        </div>
      </nav>
      
      <!-- Hero Section -->
      @if (template(); as t) {
        <main class="hero-section container mx-auto px-6 relative z-10">
          <div class="max-w-7xl mx-auto">
            <div class="hero-content-grid">
              <!-- Left: Content Side -->
              <div class="hero-text-side animate-reveal-text">
                <!-- Premium Badge -->
                <div class="hero-badge">
                  <span class="hero-badge-dot" [style.background]="t.accentColor" [style.color]="t.accentColor"></span>
                  <span class="text-[10px] font-black uppercase tracking-[0.3em] opacity-60">
                    {{ t.category }}
                  </span>
                </div>
                
                <!-- Brand Title -->
                <h1 class="hero-title mb-4">
                  {{ t.name }}
                </h1>
                
                <!-- Dynamic Tagline -->
                <p class="hero-tagline mb-6" [style.color]="t.accentColor">
                  {{ t.tagline }}
                </p>
                
                <!-- High-Quality Description -->
                <p class="hero-description">
                  {{ t.description }}
                </p>

                <!-- CTA Button -->
                <div class="cta-section pt-4">
                  <button 
                    (click)="launchMission()"
                    [disabled]="isLaunching()"
                    class="launch-btn group shadow-2xl"
                    [style.background]="'linear-gradient(135deg, ' + t.accentColor + ' 0%, ' + t.accentColor + 'dd 100%)'"
                    [style.boxShadow]="'0 20px 60px ' + t.accentColor + '55'">
                    @if (isLaunching()) {
                      <span class="spinner"></span>
                      <span class="ml-3 uppercase tracking-widest font-black">Initiating...</span>
                    } @else {
                      <span class="mr-3">🚀</span>
                      <span class="uppercase tracking-widest font-black">Launch Mission</span>
                    }
                  </button>
                </div>
              </div>

              <!-- Right: Visual Side -->
              <div class="hero-image-side animate-fade-in delay-300">
                <div class="image-glass-card">
                  <img [src]="t.imageUrl" [alt]="t.name" class="app-hero-img" />
                </div>
              </div>
            </div>

            <!-- Premium Features Matrix -->
            <div class="features-grid max-w-7xl mx-auto my-24">
              @for (feature of t.features; track feature; let i = $index) {
                <div class="feature-card group glass" [style.animation-delay]="(i * 0.1) + 's'">
                  <div class="feature-icon transition-all duration-500 group-hover:scale-110" 
                    [style.background]="t.accentColor + '15'" 
                    [style.color]="t.accentColor">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                    </svg>
                  </div>
                  <h3 class="feature-title">
                    {{ feature }}
                  </h3>
                </div>
              }
            </div>

            <!-- Strategic Co-Pilot Section -->
            <div class="co-pilot-section animate-slide-up">
              <div class="co-pilot-card">
                <div class="co-pilot-avatar-wrapper">
                  <div class="co-pilot-avatar-ring" [style.border-color]="t.accentColor"></div>
                  <img [src]="t.coPilotAvatar" [alt]="t.coPilotName" class="co-pilot-img" />
                </div>
                <div class="co-pilot-info">
                  <span class="co-pilot-badge" [style.color]="t.accentColor">Strategic Co-Pilot</span>
                  <h4 class="co-pilot-name">{{ t.coPilotName }}</h4>
                  <p class="co-pilot-role">{{ t.coPilotRole }}</p>
                  <p class="co-pilot-quote">
                    "I'll be your lead strategist for this mission. Our objective is to optimize your {{ t.category.toLowerCase() }} trajectory through focused execution and high-performance protocols."
                  </p>
                </div>
              </div>
            </div>

            <!-- Bottom Back Link -->
            <div class="mt-16 text-center">
              <a routerLink="/app-suite" class="launch-btn-secondary group">
                <svg class="w-5 h-5 transition-transform group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6z"/>
                </svg>
                <span>Full App Suite</span>
              </a>
            </div>
          </div>
        </main>
      }
      
      <!-- Footer -->
      <footer class="launchpad-footer">
        <p class="opacity-40">
          © {{ currentYear }} RocketGoals. High Performance Systems.
        </p>
      </footer>
    </div>
  `,
  styleUrls: ['./launchpad-base.css']
})
export class LaunchpadAppViewerComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly theme = inject(ThemeService);
  private readonly launchpadService = inject(LaunchpadService);

  protected readonly isDarkMode = this.theme.isDarkMode;
  protected readonly isLaunching = signal(false);
  protected readonly currentYear = new Date().getFullYear();

  // Reactive template selection based on route ID
  protected readonly template = computed(() => {
    const id = this.route.snapshot.paramMap.get('id');
    return id ? LAUNCHPAD_TEMPLATES[id] : null;
  });

  protected isLoggedIn(): boolean {
    return this.launchpadService.isLoggedIn();
  }

  async ngOnInit() {
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Validate template exists
    if (!this.template()) {
      this.router.navigate(['/app-suite']);
      return;
    }

    if (this.isLoggedIn()) {
      const handled = await this.launchpadService.checkPendingLaunchpad();
      if (handled) return;
    }
  }

  toggleTheme() {
    this.theme.toggleDarkMode();
  }

  async launchMission() {
    const t = this.template();
    if (!t) return;

    this.isLaunching.set(true);

    try {
      const goalId = await this.launchpadService.launchMission(t);
      if (goalId) {
        this.router.navigate(['/rocketgoal', goalId]);
      }
    } catch (error) {
      console.error('Failed to launch mission:', error);
    } finally {
      this.isLaunching.set(false);
    }
  }
}

import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ThemeService } from '../theme.service';
import { AvatarDropdownComponent } from '../avatar-dropdown.component';
import { LaunchpadService } from './launchpad.service';
import { LAUNCHPAD_TEMPLATES, LaunchpadTemplate } from './launchpad.types';

@Component({
  selector: 'app-hustle-orbit',
  standalone: true,
  imports: [CommonModule, RouterLink, AvatarDropdownComponent],
  template: `
    <div class="launchpad-page">
      <!-- Animated Background -->
      <div class="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950"></div>
      
      <!-- Stars -->
      <div class="stars-layer stars-sm"></div>
      <div class="stars-layer stars-md"></div>
      <div class="stars-layer stars-lg"></div>
      
      <!-- Gradient Orbs -->
      <div class="gradient-orb orb-primary" style="background: radial-gradient(circle, #f97316 0%, transparent 70%);"></div>
      <div class="gradient-orb orb-secondary" style="background: radial-gradient(circle, #ea580c 0%, transparent 70%);"></div>
      <div class="gradient-orb orb-accent" style="background: radial-gradient(circle, #fb923c 0%, transparent 70%);"></div>
      
      <!-- Grid Overlay -->
      <div class="grid-overlay"></div>
      
      <!-- Navigation -->
      <nav class="launchpad-nav">
        <div class="container mx-auto px-6 py-4">
          <div class="flex items-center justify-between max-w-7xl mx-auto">
            <a routerLink="/" class="flex items-center gap-3 group">
              <div class="relative">
                <div class="absolute -inset-1 bg-gradient-to-r from-orange-600 to-amber-500 rounded-full blur opacity-30 group-hover:opacity-50 transition duration-500"></div>
                <img src="/assets/rocket-goals.png" alt="Rocket Goals" class="relative w-12 h-12 object-contain" />
              </div>
              <span class="text-xl font-black tracking-tight text-white hidden sm:block">
                ROCKET<span class="text-orange-500">GOALS</span>
              </span>
            </a>
            
            <div class="flex items-center gap-4">
              <a routerLink="/app-suite" class="text-white/60 hover:text-white transition-colors text-sm font-semibold flex items-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
                </svg>
                Back to Launch Pad
              </a>
              <button (click)="toggleTheme()" class="p-2 rounded-full border border-white/20 text-white/70 hover:text-white hover:bg-white/10 transition-colors">
                @if (isDarkMode()) {
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.021 0l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>
                  </svg>
                } @else {
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
                  </svg>
                }
              </button>
              @if (isLoggedIn()) {
                <app-avatar-dropdown />
              } @else {
                <a routerLink="/signup" class="px-5 py-2 bg-orange-600 text-white text-sm font-bold rounded-full hover:bg-orange-500 transition-colors shadow-lg shadow-orange-600/30">
                  Get Started
                </a>
              }
            </div>
          </div>
        </div>
      </nav>
      
      <!-- Hero Section -->
      <main class="hero-section container mx-auto px-6">
        <div class="max-w-5xl mx-auto text-center">
          <!-- Badge -->
          <div class="hero-badge">
            <span class="hero-badge-dot" style="background: #f97316; color: #f97316;"></span>
            <span class="text-xs font-black text-white/60 uppercase tracking-[0.2em]">{{ template.category }}</span>
          </div>
          
          <!-- Icon -->
          <div class="hero-icon">{{ template.icon }}</div>
          
          <!-- Title -->
          <h1 class="hero-title text-white">
            {{ template.name }}
          </h1>
          
          <!-- Tagline -->
          <p class="hero-tagline bg-gradient-to-r from-orange-400 to-amber-400 bg-clip-text text-transparent">
            {{ template.tagline }}
          </p>
          
          <!-- Description -->
          <p class="hero-description text-white/60">
            {{ template.description }}
          </p>
          
          <!-- Features Grid -->
          <div class="features-grid max-w-4xl mx-auto">
            @for (feature of template.features; track feature; let i = $index) {
              <div class="feature-card" [style.animation-delay]="(i * 0.1) + 's'">
                <div class="feature-icon" style="background: rgba(249, 115, 22, 0.2); color: #fb923c;">
                  <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                  </svg>
                </div>
                <h3 class="feature-title">{{ feature }}</h3>
              </div>
            }
          </div>
          
          <!-- CTA Section -->
          <div class="cta-section">
            <button 
              (click)="launchMission()"
              [disabled]="isLaunching()"
              class="launch-btn"
              style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); color: white; box-shadow: 0 20px 60px rgba(249, 115, 22, 0.4);">
              @if (isLaunching()) {
                <span class="spinner"></span>
                <span>Initiating Launch...</span>
              } @else {
                <span>🚀</span>
                <span>Launch Mission</span>
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/>
                </svg>
              }
            </button>
            
            <div class="mt-8 flex items-center justify-center gap-6">
              <a routerLink="/app-suite" class="launch-btn-secondary">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6z"/>
                </svg>
                Explore Other Apps
              </a>
            </div>
            
            @if (!isLoggedIn()) {
              <p class="mt-6 text-sm text-white/40">
                You'll create an account to launch this mission
              </p>
            }
          </div>
        </div>
      </main>
      
      <!-- Footer -->
      <footer class="launchpad-footer">
        <p>© {{ currentYear }} RocketGoals. All rights reserved.</p>
      </footer>
    </div>
  `,
  styleUrls: ['./launchpad-base.css']
})
export class HustleOrbitComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly theme = inject(ThemeService);
  private readonly launchpadService = inject(LaunchpadService);
  
  protected readonly isDarkMode = this.theme.isDarkMode;
  protected readonly isLaunching = signal(false);
  protected readonly template: LaunchpadTemplate = LAUNCHPAD_TEMPLATES['hustle-orbit'];
  protected readonly currentYear = new Date().getFullYear();
  
  protected isLoggedIn(): boolean {
    return this.launchpadService.isLoggedIn();
  }
  
  async ngOnInit() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    if (this.isLoggedIn()) {
      const handled = await this.launchpadService.checkPendingLaunchpad();
      if (handled) return;
    }
  }
  
  toggleTheme() {
    this.theme.toggleDarkMode();
  }
  
  async launchMission() {
    this.isLaunching.set(true);
    
    try {
      const goalId = await this.launchpadService.launchMission(this.template);
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


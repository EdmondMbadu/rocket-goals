import { Component, OnInit, inject, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from './auth.service';
import { ThemeService } from './theme.service';
import { AvatarDropdownComponent } from './avatar-dropdown.component';

@Component({
  selector: 'app-surge-book-page',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, AvatarDropdownComponent],
  template: `
    <div class="min-h-screen bg-white text-black dark:bg-slate-950 dark:text-slate-100 flex flex-col transition-colors duration-300">
      <!-- Navigation -->
      <nav class="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl border-b transition-colors duration-300"
        [class]="isDarkMode() ? 'bg-slate-950/80 border-white/10' : 'bg-white/80 border-slate-200'">
        <div class="container mx-auto px-6 py-4">
          <div class="flex items-center justify-between max-w-7xl mx-auto w-full gap-6">
            <!-- Logo -->
            <a routerLink="/" class="flex items-center gap-3 group flex-none">
              <div class="relative">
                <div
                  class="absolute -inset-1 bg-gradient-to-r from-red-600 to-orange-500 rounded-full blur opacity-30 group-hover:opacity-50 transition duration-500">
                </div>
                <img src="/assets/rocket-goals.png" alt="Rocket Goals" class="relative w-12 h-12 object-contain" />
              </div>
              <span class="text-xl font-black tracking-tight hidden sm:block"
                [class]="isDarkMode() ? 'text-white' : 'text-slate-900'">
                ROCKET<span class="text-red-500">GOALS</span>
              </span>
            </a>

            <!-- Center Navigation Links -->
            @if (isLoggedIn()) {
            <div class="flex-1 hidden md:flex items-center justify-center gap-6">
              <a routerLink="/goals"
                class="pb-1 text-sm font-bold transition-colors uppercase tracking-wide inline-flex items-center gap-2"
                [class]="isDarkMode() ? 'text-slate-300 hover:text-red-400' : 'text-slate-600 hover:text-red-600'">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                Home
              </a>
              <a routerLink="/ai"
                class="pb-1 text-sm font-bold transition-colors uppercase tracking-wide inline-flex items-center gap-2"
                [class]="isDarkMode() ? 'text-slate-300 hover:text-red-400' : 'text-slate-600 hover:text-red-600'">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                AI
              </a>
              <a routerLink="/profile"
                class="pb-1 text-sm font-bold transition-colors uppercase tracking-wide inline-flex items-center gap-2"
                [class]="isDarkMode() ? 'text-slate-300 hover:text-red-400' : 'text-slate-600 hover:text-red-600'">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Profile
              </a>
              <a routerLink="/app-suite"
                class="pb-1 text-sm font-bold transition-colors uppercase tracking-wide inline-flex items-center gap-2"
                [class]="isDarkMode() ? 'text-slate-300 hover:text-red-400' : 'text-slate-600 hover:text-red-600'">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
                App Suite
              </a>
            </div>
            }

            <!-- Right Actions -->
            <div class="flex items-center gap-3 flex-none">
              <button type="button" (click)="toggleTheme()" class="p-2 rounded-full border transition-colors"
                [class]="isDarkMode() ? 'border-white/20 text-white/70 hover:text-white hover:bg-white/10' : 'border-slate-300 text-slate-600 hover:text-slate-900 hover:bg-slate-100'"
                title="Toggle theme">
                @if (isDarkMode()) {
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.021 0l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                } @else {
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                </svg>
                }
              </button>

              @if (isLoggedIn()) {
              <app-avatar-dropdown />
              } @else {
              <div class="hidden sm:flex items-center gap-3">
                <a routerLink="/login" class="px-5 py-2 text-sm font-bold border rounded-full transition-colors"
                  [class]="isDarkMode() ? 'text-white/80 border-white/20 hover:bg-white/10' : 'text-slate-700 border-slate-300 hover:bg-slate-100'">
                  Log in
                </a>
                <a routerLink="/signup"
                  class="px-5 py-2 bg-red-600 text-white text-sm font-bold rounded-full hover:bg-red-500 transition-colors shadow-lg shadow-red-600/30">
                  Start Free
                </a>
              </div>
              }
              <button type="button" (click)="toggleMobileNav()"
                class="sm:hidden p-2 rounded-full border transition-colors"
                [class]="isDarkMode() ? 'border-white/20 text-white/80 hover:text-white hover:bg-white/10' : 'border-slate-300 text-slate-700 hover:text-slate-900 hover:bg-slate-100'"
                aria-label="Open menu">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </nav>

      @if (mobileNavOpen()) {
      <div class="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm sm:hidden" (click)="closeMobileNav()"></div>
      <div class="fixed top-20 left-4 right-4 z-50 rounded-2xl shadow-2xl sm:hidden"
        [class]="isDarkMode() ? 'bg-slate-950 border border-white/10' : 'bg-white border border-slate-200'">
        <div class="p-4 grid gap-2 text-sm font-semibold">
          @if (isLoggedIn()) {
          <a routerLink="/goals" (click)="closeMobileNav()" class="px-4 py-3 rounded-xl"
            [class]="isDarkMode() ? 'hover:bg-white/10' : 'hover:bg-slate-100'">Home</a>
          <a routerLink="/ai" (click)="closeMobileNav()" class="px-4 py-3 rounded-xl"
            [class]="isDarkMode() ? 'hover:bg-white/10' : 'hover:bg-slate-100'">AI</a>
          <a routerLink="/profile" (click)="closeMobileNav()" class="px-4 py-3 rounded-xl"
            [class]="isDarkMode() ? 'hover:bg-white/10' : 'hover:bg-slate-100'">Profile</a>
          <a routerLink="/app-suite" (click)="closeMobileNav()" class="px-4 py-3 rounded-xl"
            [class]="isDarkMode() ? 'hover:bg-white/10' : 'hover:bg-slate-100'">App Suite</a>
          } @else {
          <a routerLink="/login" (click)="closeMobileNav()" class="px-4 py-3 rounded-xl"
            [class]="isDarkMode() ? 'hover:bg-white/10' : 'hover:bg-slate-100'">Log in</a>
          <a routerLink="/signup" (click)="closeMobileNav()"
            class="px-4 py-3 rounded-xl bg-red-600 text-white text-center">Start Free</a>
          <a routerLink="/app-suite" (click)="closeMobileNav()" class="px-4 py-3 rounded-xl"
            [class]="isDarkMode() ? 'hover:bg-white/10' : 'hover:bg-slate-100'">App Suite</a>
          }
        </div>
      </div>
      }

      <!-- Spacer for fixed nav -->
      <div class="h-20"></div>

      <main class="flex-1">
        <!-- Hero Section -->
        <section class="relative overflow-hidden border-b border-black/5 dark:border-white/10">
          <div class="absolute inset-0 opacity-20 pointer-events-none">
            <div
              class="absolute top-[-200px] left-[-200px] w-[600px] h-[600px] bg-red-600/15 rounded-full blur-[140px]">
            </div>
            <div
              class="absolute bottom-[-200px] right-[-150px] w-[500px] h-[500px] bg-black/10 rounded-full blur-[120px]">
            </div>
          </div>

          <div class="container mx-auto px-6 py-16 md:py-24 relative z-10">
            <div class="grid lg:grid-cols-2 gap-12 items-center max-w-7xl mx-auto">
              <!-- Left Column - Book Image -->
              <div class="relative flex justify-center order-2 lg:order-1">
                <div class="relative">
                  <div
                    class="absolute -inset-6 bg-gradient-to-r from-red-600/30 to-black/30 rounded-3xl blur-2xl opacity-60">
                  </div>
                  <img
                    [src]="bookImageUrl"
                    alt="Surge: 42 High-Velocity Prompts Book"
                    class="relative w-72 md:w-96 rounded-2xl shadow-2xl" />
                </div>
              </div>

              <!-- Right Column - Content -->
              <div class="space-y-6 order-1 lg:order-2">
                <div
                  class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-100 border border-red-200 dark:bg-red-500/15 dark:border-red-500/30">
                  <span class="w-2 h-2 bg-red-600 rounded-full animate-pulse"></span>
                  <span class="text-xs font-bold text-red-700 tracking-wider uppercase dark:text-red-200">Free eBook</span>
                </div>

                <h1 class="text-4xl md:text-6xl font-black tracking-tight leading-tight text-black dark:text-white">
                  SURGE:<br />
                  <span class="text-red-600">42 High-Velocity Prompts</span>
                </h1>

                <p class="text-xl text-black/70 leading-relaxed dark:text-slate-300">
                  Your acceleration playbook for dismantling "Velocity Barriers." Skip the theory: these 42 high-velocity
                  AI prompts are designed to override your default programming and force an immediate surge in momentum.
                </p>

                <p class="text-lg text-black/60 dark:text-slate-400 italic">
                  "Don't just dream of progress - launch it!"
                </p>

                <div class="flex flex-wrap items-center gap-4">
                  <button (click)="handleDownload()"
                    class="group inline-flex items-center gap-3 px-10 py-5 bg-red-600 text-white font-black text-xl rounded-full hover:bg-black transition-all duration-300 shadow-xl hover:shadow-2xl hover:-translate-y-1">
                    Download Now - Free
                    <svg class="w-6 h-6 transform group-hover:translate-y-1 transition-transform" fill="none"
                      stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                  </button>

                  <a href="https://www.amazon.com/dp/B0GHZLXM8V" target="_blank" rel="noopener noreferrer"
                    class="group inline-flex items-center gap-3 px-10 py-5 bg-black text-white font-black text-xl rounded-full hover:bg-red-600 transition-all duration-300 shadow-xl hover:shadow-2xl hover:-translate-y-1 dark:bg-white dark:text-black dark:hover:bg-red-600 dark:hover:text-white">
                    Buy on Amazon
                    <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M.045 18.02c.072-.116.187-.124.348-.022 3.636 2.11 7.594 3.166 11.87 3.166 2.852 0 5.668-.533 8.447-1.595l.315-.14c.138-.06.234-.1.293-.13.226-.088.39-.046.493.13.12.197.06.39-.18.58-.18.14-.4.313-.65.517-1.7 1.36-3.61 2.39-5.72 3.1-2.11.7-4.26 1.05-6.44 1.05-2.42 0-4.73-.43-6.92-1.28-2.19-.85-4.12-2.04-5.79-3.57-.04-.03-.06-.07-.06-.11zm6.57-3.55c0-.97.25-1.77.75-2.39.5-.62 1.14-.96 1.93-1.02 1.06-.08 2.04.31 2.93 1.18.37.34.67.74.9 1.19l.18.36c.1.22.1.4-.01.55-.11.14-.27.19-.48.14l-.19-.05c-.44-.11-.83-.23-1.17-.37-.33-.14-.64-.3-.91-.49-.28-.19-.55-.39-.8-.61-.25-.21-.5-.43-.73-.64-.15-.13-.27-.24-.35-.33-.09-.09-.14-.15-.17-.19-.03-.05-.05-.09-.06-.12-.01-.03-.02-.08-.02-.13 0-.1.04-.19.11-.25.08-.06.17-.08.28-.06.1.02.21.07.34.16.12.09.25.2.4.34.3.27.63.53.98.79.35.26.73.5 1.14.72.4.22.82.41 1.26.57.43.16.87.28 1.31.36.1.02.18.05.24.08.06.04.09.08.09.14 0 .12-.07.26-.21.4-.14.14-.34.29-.58.44-.25.15-.53.28-.85.4-.32.12-.64.22-.96.29-.66.16-1.29.25-1.87.25-.58 0-1.13-.09-1.62-.28-.5-.19-.92-.46-1.27-.81-.35-.35-.62-.77-.82-1.26-.2-.49-.3-1.03-.3-1.63z" />
                    </svg>
                  </a>
                </div>

              </div>
            </div>
          </div>
        </section>

        <!-- What You'll Learn Header -->
        <section class="py-16 md:py-20 bg-gray-50 dark:bg-slate-900/50">
          <div class="container mx-auto px-6">
            <div class="max-w-4xl mx-auto text-center">
              <div
                class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 border border-gray-200 text-gray-600 dark:bg-white/5 dark:border-white/10 dark:text-slate-200 mb-4">
                <span class="w-2 h-2 bg-red-600 rounded-full animate-pulse"></span>
                <span class="text-xs font-bold tracking-wider uppercase">What You'll Learn</span>
              </div>
              <h2 class="text-3xl md:text-5xl font-black tracking-tight text-black dark:text-white mb-4">
                Your Complete <span class="text-red-600">Launch System</span>
              </h2>
              <p class="text-lg text-black/60 dark:text-slate-300 max-w-2xl mx-auto">
                Master the framework, categories, and prompts that will propel your goals into orbit.
              </p>
            </div>
          </div>
        </section>

        <!-- Project Types Section -->
        <section class="py-16 md:py-24">
          <div class="container mx-auto px-6">
            <div class="max-w-6xl mx-auto">
              <div class="text-center mb-16">
                <div
                  class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 border border-gray-200 text-gray-600 dark:bg-white/5 dark:border-white/10 dark:text-slate-200 mb-4">
                  <span class="w-2 h-2 bg-red-600 rounded-full animate-pulse"></span>
                  <span class="text-xs font-bold tracking-wider uppercase">The Framework</span>
                </div>
                <h2 class="text-3xl md:text-5xl font-black tracking-tight text-black dark:text-white mb-4">
                  Three Project Types
                </h2>
                <p class="text-lg text-black/60 dark:text-slate-300 max-w-2xl mx-auto">
                  Understanding your project type is the key to choosing the right prompts and strategies.
                </p>
              </div>

              <div class="grid md:grid-cols-3 gap-8">
                <!-- Metro -->
                <div
                  class="relative bg-white border border-black/10 rounded-3xl p-8 space-y-4 hover:shadow-2xl hover:border-red-600/30 transition-all duration-300 dark:bg-slate-900/70 dark:border-white/10 dark:hover:border-red-500/50 group">
                  <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-600 to-red-400 rounded-t-3xl"></div>
                  <div
                    class="w-16 h-16 bg-black rounded-2xl flex items-center justify-center shadow-lg group-hover:bg-red-600 transition-colors duration-300 dark:bg-white">
                    <svg class="w-8 h-8 text-white dark:text-black group-hover:text-white dark:group-hover:text-white transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                  </div>
                  <h3 class="text-2xl font-black text-black dark:text-white">The Metro</h3>
                  <p class="text-black/70 dark:text-slate-300">
                    Clear path from A to B. The trip has been made before. Barring some unexpected act of nature, the
                    Metro project generally arrives on time and on budget.
                  </p>
                  <p class="text-sm text-black/50 dark:text-slate-400 italic border-t border-black/5 dark:border-white/10 pt-4 mt-4">
                    Examples: Certifications, marathons, product updates, sales playbooks
                  </p>
                </div>

                <!-- Maze -->
                <div
                  class="relative bg-white border border-black/10 rounded-3xl p-8 space-y-4 hover:shadow-2xl hover:border-red-600/30 transition-all duration-300 dark:bg-slate-900/70 dark:border-white/10 dark:hover:border-red-500/50 group">
                  <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 to-red-600 rounded-t-3xl"></div>
                  <div
                    class="w-16 h-16 bg-black rounded-2xl flex items-center justify-center shadow-lg group-hover:bg-red-600 transition-colors duration-300 dark:bg-white">
                    <svg class="w-8 h-8 text-white dark:text-black group-hover:text-white dark:group-hover:text-white transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                    </svg>
                  </div>
                  <h3 class="text-2xl font-black text-black dark:text-white">The Maze</h3>
                  <p class="text-black/70 dark:text-slate-300">
                    Wicked twists and turns. You know the destination, but the path keeps shifting. Requires constant
                    recalibration and flexibility.
                  </p>
                  <p class="text-sm text-black/50 dark:text-slate-400 italic border-t border-black/5 dark:border-white/10 pt-4 mt-4">
                    Examples: Complex integrations, organizational change, market pivots
                  </p>
                </div>

                <!-- Moonshot -->
                <div
                  class="relative bg-white border border-black/10 rounded-3xl p-8 space-y-4 hover:shadow-2xl hover:border-red-600/30 transition-all duration-300 dark:bg-slate-900/70 dark:border-white/10 dark:hover:border-red-500/50 group">
                  <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-400 to-red-600 rounded-t-3xl"></div>
                  <div
                    class="w-16 h-16 bg-black rounded-2xl flex items-center justify-center shadow-lg group-hover:bg-red-600 transition-colors duration-300 dark:bg-white">
                    <svg class="w-8 h-8 text-white dark:text-black group-hover:text-white dark:group-hover:text-white transition-colors duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                  </div>
                  <h3 class="text-2xl font-black text-black dark:text-white">The Moonshot</h3>
                  <p class="text-black/70 dark:text-slate-300">
                    Wild, audacious goals. The destination might not even exist yet. High risk, high reward ventures
                    that require courage and vision.
                  </p>
                  <p class="text-sm text-black/50 dark:text-slate-400 italic border-t border-black/5 dark:border-white/10 pt-4 mt-4">
                    Examples: Startups, breakthrough innovations, transformational goals
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Seven Categories Section - Premium Timeline -->
        <section class="py-20 md:py-32 bg-gradient-to-b from-gray-50 to-white dark:from-slate-950 dark:to-black text-black dark:text-white relative overflow-hidden">
          <!-- Background Effects -->
          <div class="absolute inset-0 pointer-events-none">
            <div class="absolute top-0 left-1/2 -translate-x-1/2 w-px h-full bg-gradient-to-b from-transparent via-red-600/30 dark:via-red-600/50 to-transparent"></div>
            <div class="absolute top-[-300px] left-[-200px] w-[600px] h-[600px] bg-red-600/5 dark:bg-red-600/10 rounded-full blur-[150px]"></div>
            <div class="absolute bottom-[-200px] right-[-150px] w-[500px] h-[500px] bg-red-600/3 dark:bg-red-600/5 rounded-full blur-[120px]"></div>
          </div>

          <div class="container mx-auto px-6 relative z-10">
            <div class="max-w-5xl mx-auto">
              <!-- Section Header -->
              <div class="text-center mb-20">
                <div
                  class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 mb-6">
                  <span class="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                  <span class="text-xs font-bold text-gray-600 dark:text-white/80 tracking-wider uppercase">The Categories</span>
                </div>
                <h2 class="text-4xl md:text-6xl font-black tracking-tight mb-6 text-black dark:text-white">
                  Seven Categories of <span class="text-red-500">Propulsion</span>
                </h2>
                <p class="text-xl text-black/60 dark:text-white/60 max-w-2xl mx-auto">
                  Your complete flight sequence from launch to orbit. Master each category to achieve maximum velocity.
                </p>
              </div>

              <!-- Timeline -->
              <div class="relative">
                <!-- Vertical Line -->
                <div class="absolute left-8 md:left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-red-600 via-red-500 to-red-600/30 md:-translate-x-px"></div>

                <!-- Category I -->
                <div class="relative flex items-center mb-12 md:mb-16 group">
                  <div class="flex-1 md:pr-16 md:text-right order-2 md:order-1 pl-20 md:pl-0">
                    <div class="bg-white dark:bg-white/5 backdrop-blur-sm border border-gray-200 dark:border-white/10 rounded-2xl p-6 md:p-8 shadow-lg dark:shadow-none hover:shadow-xl dark:hover:bg-white/10 hover:border-red-500/30 transition-all duration-500 group-hover:shadow-[0_0_40px_rgba(239,68,68,0.1)] dark:group-hover:shadow-[0_0_40px_rgba(239,68,68,0.15)]">
                      <h3 class="text-2xl md:text-3xl font-black text-black dark:text-white mb-3">Ignition & Escape Velocity</h3>
                      <p class="text-black/60 dark:text-white/60 leading-relaxed">
                        Overcome the "limbic friction" and freeze-response that kills big Moonshot ideas. Light the fuse and break free from gravity.
                      </p>
                    </div>
                  </div>
                  <div class="absolute left-8 md:left-1/2 md:-translate-x-1/2 w-16 h-16 bg-gradient-to-br from-red-500 to-red-700 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.3)] dark:shadow-[0_0_30px_rgba(239,68,68,0.5)] z-10 group-hover:scale-110 transition-transform duration-300 order-1 md:order-2">
                    <span class="text-white font-black text-xl">I</span>
                  </div>
                  <div class="flex-1 md:pl-16 hidden md:block order-3"></div>
                </div>

                <!-- Category II -->
                <div class="relative flex items-center mb-12 md:mb-16 group">
                  <div class="flex-1 md:pr-16 hidden md:block order-1"></div>
                  <div class="absolute left-8 md:left-1/2 md:-translate-x-1/2 w-16 h-16 bg-gradient-to-br from-red-500 to-red-700 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.3)] dark:shadow-[0_0_30px_rgba(239,68,68,0.5)] z-10 group-hover:scale-110 transition-transform duration-300 order-1 md:order-2">
                    <span class="text-white font-black text-xl">II</span>
                  </div>
                  <div class="flex-1 md:pl-16 order-2 md:order-3 pl-20 md:pl-16">
                    <div class="bg-white dark:bg-white/5 backdrop-blur-sm border border-gray-200 dark:border-white/10 rounded-2xl p-6 md:p-8 shadow-lg dark:shadow-none hover:shadow-xl dark:hover:bg-white/10 hover:border-red-500/30 transition-all duration-500 group-hover:shadow-[0_0_40px_rgba(239,68,68,0.1)] dark:group-hover:shadow-[0_0_40px_rgba(239,68,68,0.15)]">
                      <h3 class="text-2xl md:text-3xl font-black text-black dark:text-white mb-3">Visual Narrowing & Target Lock</h3>
                      <p class="text-black/60 dark:text-white/60 leading-relaxed">
                        Cut through the "blurry vision" of a Maze project to find your next aligned step forward. Lock onto your target with precision.
                      </p>
                    </div>
                  </div>
                </div>

                <!-- Category III -->
                <div class="relative flex items-center mb-12 md:mb-16 group">
                  <div class="flex-1 md:pr-16 md:text-right order-2 md:order-1 pl-20 md:pl-0">
                    <div class="bg-white dark:bg-white/5 backdrop-blur-sm border border-gray-200 dark:border-white/10 rounded-2xl p-6 md:p-8 shadow-lg dark:shadow-none hover:shadow-xl dark:hover:bg-white/10 hover:border-red-500/30 transition-all duration-500 group-hover:shadow-[0_0_40px_rgba(239,68,68,0.1)] dark:group-hover:shadow-[0_0_40px_rgba(239,68,68,0.15)]">
                      <h3 class="text-2xl md:text-3xl font-black text-black dark:text-white mb-3">The Aerodynamics of Friction</h3>
                      <p class="text-black/60 dark:text-white/60 leading-relaxed">
                        Strip away the bureaucratic friction and busy work that stalls your Metro progress. Streamline for maximum efficiency.
                      </p>
                    </div>
                  </div>
                  <div class="absolute left-8 md:left-1/2 md:-translate-x-1/2 w-16 h-16 bg-gradient-to-br from-red-500 to-red-700 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.3)] dark:shadow-[0_0_30px_rgba(239,68,68,0.5)] z-10 group-hover:scale-110 transition-transform duration-300 order-1 md:order-2">
                    <span class="text-white font-black text-xl">III</span>
                  </div>
                  <div class="flex-1 md:pl-16 hidden md:block order-3"></div>
                </div>

                <!-- Category IV -->
                <div class="relative flex items-center mb-12 md:mb-16 group">
                  <div class="flex-1 md:pr-16 hidden md:block order-1"></div>
                  <div class="absolute left-8 md:left-1/2 md:-translate-x-1/2 w-16 h-16 bg-gradient-to-br from-red-500 to-red-700 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.3)] dark:shadow-[0_0_30px_rgba(239,68,68,0.5)] z-10 group-hover:scale-110 transition-transform duration-300 order-1 md:order-2">
                    <span class="text-white font-black text-xl">IV</span>
                  </div>
                  <div class="flex-1 md:pl-16 order-2 md:order-3 pl-20 md:pl-16">
                    <div class="bg-white dark:bg-white/5 backdrop-blur-sm border border-gray-200 dark:border-white/10 rounded-2xl p-6 md:p-8 shadow-lg dark:shadow-none hover:shadow-xl dark:hover:bg-white/10 hover:border-red-500/30 transition-all duration-500 group-hover:shadow-[0_0_40px_rgba(239,68,68,0.1)] dark:group-hover:shadow-[0_0_40px_rgba(239,68,68,0.15)]">
                      <h3 class="text-2xl md:text-3xl font-black text-black dark:text-white mb-3">Time Compression & Warp Speed</h3>
                      <p class="text-black/60 dark:text-white/60 leading-relaxed">
                        Accelerate timelines and compress the distance between where you are and where you need to be. Bend time to your will.
                      </p>
                    </div>
                  </div>
                </div>

                <!-- Category V -->
                <div class="relative flex items-center mb-12 md:mb-16 group">
                  <div class="flex-1 md:pr-16 md:text-right order-2 md:order-1 pl-20 md:pl-0">
                    <div class="bg-white dark:bg-white/5 backdrop-blur-sm border border-gray-200 dark:border-white/10 rounded-2xl p-6 md:p-8 shadow-lg dark:shadow-none hover:shadow-xl dark:hover:bg-white/10 hover:border-red-500/30 transition-all duration-500 group-hover:shadow-[0_0_40px_rgba(239,68,68,0.1)] dark:group-hover:shadow-[0_0_40px_rgba(239,68,68,0.15)]">
                      <h3 class="text-2xl md:text-3xl font-black text-black dark:text-white mb-3">Volume & Velocity</h3>
                      <p class="text-black/60 dark:text-white/60 leading-relaxed">
                        Increase output and speed simultaneously without burning out or sacrificing quality. Master the art of sustainable acceleration.
                      </p>
                    </div>
                  </div>
                  <div class="absolute left-8 md:left-1/2 md:-translate-x-1/2 w-16 h-16 bg-gradient-to-br from-red-500 to-red-700 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.3)] dark:shadow-[0_0_30px_rgba(239,68,68,0.5)] z-10 group-hover:scale-110 transition-transform duration-300 order-1 md:order-2">
                    <span class="text-white font-black text-xl">V</span>
                  </div>
                  <div class="flex-1 md:pl-16 hidden md:block order-3"></div>
                </div>

                <!-- Category VI -->
                <div class="relative flex items-center mb-12 md:mb-16 group">
                  <div class="flex-1 md:pr-16 hidden md:block order-1"></div>
                  <div class="absolute left-8 md:left-1/2 md:-translate-x-1/2 w-16 h-16 bg-gradient-to-br from-red-500 to-red-700 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(239,68,68,0.3)] dark:shadow-[0_0_30px_rgba(239,68,68,0.5)] z-10 group-hover:scale-110 transition-transform duration-300 order-1 md:order-2">
                    <span class="text-white font-black text-xl">VI</span>
                  </div>
                  <div class="flex-1 md:pl-16 order-2 md:order-3 pl-20 md:pl-16">
                    <div class="bg-white dark:bg-white/5 backdrop-blur-sm border border-gray-200 dark:border-white/10 rounded-2xl p-6 md:p-8 shadow-lg dark:shadow-none hover:shadow-xl dark:hover:bg-white/10 hover:border-red-500/30 transition-all duration-500 group-hover:shadow-[0_0_40px_rgba(239,68,68,0.1)] dark:group-hover:shadow-[0_0_40px_rgba(239,68,68,0.15)]">
                      <h3 class="text-2xl md:text-3xl font-black text-black dark:text-white mb-3">Peak State Propulsion</h3>
                      <p class="text-black/60 dark:text-white/60 leading-relaxed">
                        Access your optimal mental and emotional state to perform at your highest level. Harness the power of flow state.
                      </p>
                    </div>
                  </div>
                </div>

                <!-- Category VII - Final -->
                <div class="relative flex items-center group">
                  <div class="flex-1 md:pr-16 md:text-right order-2 md:order-1 pl-20 md:pl-0">
                    <div class="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-600/20 dark:to-red-900/20 backdrop-blur-sm border border-red-200 dark:border-red-500/30 rounded-2xl p-6 md:p-8 shadow-lg dark:shadow-none hover:shadow-xl dark:hover:bg-red-600/30 transition-all duration-500 group-hover:shadow-[0_0_40px_rgba(239,68,68,0.15)] dark:group-hover:shadow-[0_0_60px_rgba(239,68,68,0.3)]">
                      <h3 class="text-2xl md:text-3xl font-black text-black dark:text-white mb-3">The Afterburner Effect</h3>
                      <p class="text-black/70 dark:text-white/70 leading-relaxed">
                        Leverage the power of AI to cross the finish line with maximum force. Ignite your afterburners and achieve escape velocity.
                      </p>
                    </div>
                  </div>
                  <div class="absolute left-8 md:left-1/2 md:-translate-x-1/2 w-20 h-20 bg-gradient-to-br from-red-500 via-red-600 to-orange-500 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(239,68,68,0.4)] dark:shadow-[0_0_50px_rgba(239,68,68,0.6)] z-10 group-hover:scale-110 transition-transform duration-300 order-1 md:order-2">
                    <span class="text-white font-black text-2xl">VII</span>
                  </div>
                  <div class="flex-1 md:pl-16 hidden md:block order-3"></div>
                </div>

                <!-- Rocket at the end -->
                <div class="flex justify-center mt-16">
                  <div class="w-12 h-12 text-red-500 animate-bounce">
                    <svg fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12.5 2.75a.75.75 0 00-1 0l-9 8.25a.75.75 0 00.5 1.25h1.5v8a.75.75 0 00.75.75h3.5a.75.75 0 00.75-.75v-5.5h3v5.5a.75.75 0 00.75.75h3.5a.75.75 0 00.75-.75v-8h1.5a.75.75 0 00.5-1.25l-9-8.25z"/>
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 42 High-Velocity Prompts Section -->
        <section class="py-16 md:py-24">
          <div class="container mx-auto px-6">
            <div class="max-w-4xl mx-auto text-center">
              <div
                class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-100 border border-red-200 dark:bg-red-500/15 dark:border-red-500/30 mb-4">
                <span class="w-2 h-2 bg-red-600 rounded-full animate-pulse"></span>
                <span class="text-xs font-bold text-red-700 tracking-wider uppercase dark:text-red-200">The Arsenal</span>
              </div>
              <h2 class="text-3xl md:text-5xl font-black tracking-tight text-black dark:text-white mb-6">
                42 High-Velocity <span class="text-red-600">Prompts</span>
              </h2>
              <p class="text-xl text-black/70 dark:text-slate-300 leading-relaxed max-w-3xl mx-auto mb-8">
                These 42 powerful AI prompts are tailored for each step in your goal setting journey and will ensure
                that your project continues with maximum momentum and the least amount of drag. Also, to make sure you
                launch into action, each prompt is linked to a powerful "One Click" launch code that instantly runs the
                prompt in your favorite AI engine.
              </p>
              <div class="inline-flex items-center gap-4 px-8 py-4 bg-black/5 dark:bg-white/5 rounded-2xl">
                <div class="text-5xl font-black text-red-600">42</div>
                <div class="text-left">
                  <div class="text-lg font-bold text-black dark:text-white">Ready-to-Use Prompts</div>
                  <div class="text-sm text-black/60 dark:text-slate-400">Across all 7 propulsion categories</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Author Section -->
        <section class="py-16 md:py-24 bg-gray-50 dark:bg-slate-900/50">
          <div class="container mx-auto px-6">
            <div class="max-w-4xl mx-auto">
              <div
                class="bg-white border border-black/5 rounded-3xl p-8 md:p-12 space-y-6 dark:bg-slate-900/70 dark:border-white/10">
                <div
                  class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 border border-gray-200 text-gray-600 dark:bg-white/5 dark:border-white/10 dark:text-slate-200">
                  <span class="w-2 h-2 bg-red-600 rounded-full animate-pulse"></span>
                  <span class="text-xs font-bold tracking-wider uppercase">About the Author</span>
                </div>

                <h2 class="text-3xl md:text-4xl font-black tracking-tight text-black dark:text-white">
                  Jim Walker
                </h2>

                <p class="text-lg text-black/70 dark:text-slate-300 leading-relaxed">
                  With decades of project management and goal setting experience, Jim Walker has consulted with
                  organizations like AstraZeneca, Genentech, IBM, NewWorld Game, and the Project Management Institute,
                  helping countless teams navigate complex projects. By combining his deep expertise with cutting-edge
                  AI prompts, he's created a unique system to help you move from hesitation to hyperdrive.
                </p>

                <p class="text-lg text-black/70 dark:text-slate-300 leading-relaxed italic">
                  "Here's to Launching Your Goals Faster Than Ever!"<br />
                  <span class="text-sm not-italic text-black/50 dark:text-slate-400">- Jim Walker, Philadelphia, PA</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        <!-- Final CTA Section -->
        <section class="py-16 md:py-24 bg-black text-white dark:bg-slate-950">
          <div class="container mx-auto px-6 text-center">
            <div class="max-w-3xl mx-auto space-y-8">
              <h2 class="text-4xl md:text-6xl font-black tracking-tight">
                Ready to <span class="text-red-500">Surge</span>?
              </h2>

              <p class="text-xl text-white/70">
                Download your free copy of Surge: 42 High-Velocity Prompts and start launching your goals today.
              </p>

              <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
                <button (click)="handleDownload()"
                  class="group inline-flex items-center gap-3 px-12 py-6 bg-red-600 text-white font-black text-2xl rounded-full hover:bg-white hover:text-black transition-all duration-300 shadow-xl hover:shadow-2xl hover:-translate-y-1">
                  Download Free eBook
                  <svg class="w-7 h-7 transform group-hover:translate-y-1 transition-transform" fill="none"
                    stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>

                <a href="https://www.amazon.com/dp/B0GHZLXM8V" target="_blank" rel="noopener noreferrer"
                  class="group inline-flex items-center gap-3 px-12 py-6 bg-white text-black font-black text-2xl rounded-full hover:bg-red-600 hover:text-white transition-all duration-300 shadow-xl hover:shadow-2xl hover:-translate-y-1">
                  Buy on Amazon
                  <svg class="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M.045 18.02c.072-.116.187-.124.348-.022 3.636 2.11 7.594 3.166 11.87 3.166 2.852 0 5.668-.533 8.447-1.595l.315-.14c.138-.06.234-.1.293-.13.226-.088.39-.046.493.13.12.197.06.39-.18.58-.18.14-.4.313-.65.517-1.7 1.36-3.61 2.39-5.72 3.1-2.11.7-4.26 1.05-6.44 1.05-2.42 0-4.73-.43-6.92-1.28-2.19-.85-4.12-2.04-5.79-3.57-.04-.03-.06-.07-.06-.11zm6.57-3.55c0-.97.25-1.77.75-2.39.5-.62 1.14-.96 1.93-1.02 1.06-.08 2.04.31 2.93 1.18.37.34.67.74.9 1.19l.18.36c.1.22.1.4-.01.55-.11.14-.27.19-.48.14l-.19-.05c-.44-.11-.83-.23-1.17-.37-.33-.14-.64-.3-.91-.49-.28-.19-.55-.39-.8-.61-.25-.21-.5-.43-.73-.64-.15-.13-.27-.24-.35-.33-.09-.09-.14-.15-.17-.19-.03-.05-.05-.09-.06-.12-.01-.03-.02-.08-.02-.13 0-.1.04-.19.11-.25.08-.06.17-.08.28-.06.1.02.21.07.34.16.12.09.25.2.4.34.3.27.63.53.98.79.35.26.73.5 1.14.72.4.22.82.41 1.26.57.43.16.87.28 1.31.36.1.02.18.05.24.08.06.04.09.08.09.14 0 .12-.07.26-.21.4-.14.14-.34.29-.58.44-.25.15-.53.28-.85.4-.32.12-.64.22-.96.29-.66.16-1.29.25-1.87.25-.58 0-1.13-.09-1.62-.28-.5-.19-.92-.46-1.27-.81-.35-.35-.62-.77-.82-1.26-.2-.49-.3-1.03-.3-1.63z" />
                  </svg>
                </a>
              </div>

              <div class="pt-8">
                <a routerLink="/"
                  class="text-white/60 hover:text-white transition-colors inline-flex items-center gap-2">
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Back to RocketGoals
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <!-- Download Modal -->
      @if (showDownloadModal()) {
      <div class="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" (click)="closeModal()"></div>

        <!-- Modal Content -->
        <div class="relative bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-md w-full p-8 space-y-6 animate-in fade-in zoom-in duration-200">
          <!-- Close Button -->
          <button (click)="closeModal()"
            class="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
            <svg class="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <!-- Header -->
          <div class="text-center space-y-2">
            <div class="w-16 h-16 bg-red-100 dark:bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg class="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 class="text-2xl font-black text-black dark:text-white">Get Your Free Book</h3>
            <p class="text-sm text-gray-600 dark:text-gray-400">Enter your details to download Surge: 42 High-Velocity Prompts</p>
          </div>

          <!-- Form -->
          <form (ngSubmit)="submitDownloadForm()" class="space-y-4">
            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">First Name</label>
                <input type="text" [(ngModel)]="downloadForm.firstName" name="firstName" required
                  class="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                  placeholder="John" />
              </div>
              <div>
                <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Last Name</label>
                <input type="text" [(ngModel)]="downloadForm.lastName" name="lastName" required
                  class="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                  placeholder="Doe" />
              </div>
            </div>

            <div>
              <label class="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Email Address</label>
              <input type="email" [(ngModel)]="downloadForm.email" name="email" required
                class="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/5 text-black dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                placeholder="john@example.com" />
            </div>

            <!-- Signup Checkbox -->
            <label class="flex items-start gap-3 cursor-pointer group">
              <div class="relative mt-0.5 flex-shrink-0">
                <input type="checkbox" [(ngModel)]="downloadForm.createAccount" name="createAccount"
                  class="w-5 h-5 rounded border-2 border-gray-300 dark:border-gray-600 text-red-600 focus:ring-red-500 focus:ring-2 cursor-pointer accent-red-600" />
              </div>
              <span class="text-sm text-gray-600 dark:text-gray-400 group-hover:text-gray-800 dark:group-hover:text-gray-200 transition-colors">
                Also sign up for a free RocketGoals membership!
              </span>
            </label>

            @if (formError()) {
            <div class="p-3 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30">
              <p class="text-sm text-red-600 dark:text-red-400">{{ formError() }}</p>
            </div>
            }

            <!-- Submit Button -->
            <button type="submit" [disabled]="formSubmitting()"
              class="w-full py-4 bg-red-600 text-white font-bold text-lg rounded-xl hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center gap-2">
              @if (formSubmitting()) {
                <svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              } @else {
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download Free eBook
              }
            </button>
          </form>

          <p class="text-xs text-center text-gray-500 dark:text-gray-500">
            We respect your privacy. No spam, ever.
          </p>
        </div>
      </div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
    :host-context(.dark) .min-h-screen {
      background-color: #020617;
      color: #e2e8f0;
    }
    :host-context(.dark) .bg-white {
      background-color: rgba(2, 6, 23, 0.95);
      color: #e2e8f0;
    }
    :host-context(.dark) .bg-gray-50 {
      background-color: rgba(15, 23, 42, 0.7);
    }
    :host-context(.dark) .bg-gray-100 {
      background-color: rgba(15, 23, 42, 0.8);
    }
    :host-context(.dark) .border-black\\/5,
    :host-context(.dark) .border-black\\/10 {
      border-color: rgba(226, 232, 240, 0.2);
    }
    :host-context(.dark) .border-gray-200 {
      border-color: rgba(226, 232, 240, 0.2);
    }
    :host-context(.dark) .text-black {
      color: #f8fafc;
    }
    :host-context(.dark) .text-black\\/70,
    :host-context(.dark) .text-black\\/60,
    :host-context(.dark) .text-black\\/80 {
      color: #94a3b8;
    }
  `]
})
export class SurgeBookPageComponent implements OnInit {
  protected authService = inject(AuthService);
  private router = inject(Router);
  private theme = inject(ThemeService);

  protected readonly isDarkMode = this.theme.isDarkMode;
  protected readonly isLoggedIn = computed(() => !!this.authService.profile()?.userId);
  protected readonly mobileNavOpen = signal(false);

  readonly bookPdfUrl = 'https://firebasestorage.googleapis.com/v0/b/rocket-prompt.firebasestorage.app/o/site%2FSurge_%2042_High_Velocity_Prompts_PDF_Final.pdf?alt=media&token=c2a60c20-e51b-49ea-bcae-1800545ce047';
  readonly bookImageUrl = 'https://firebasestorage.googleapis.com/v0/b/rocket-prompt.firebasestorage.app/o/site%2Fsurge-book.png?alt=media&token=1fa8febd-bf3e-4bce-aa9f-13ed5cb03462';

  // Modal state
  showDownloadModal = signal(false);
  formSubmitting = signal(false);
  formError = signal<string | null>(null);

  // Form data
  downloadForm = {
    firstName: '',
    lastName: '',
    email: '',
    createAccount: true // Pre-checked by default
  };

  ngOnInit(): void {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  toggleMobileNav(): void {
    this.mobileNavOpen.set(!this.mobileNavOpen());
  }

  closeMobileNav(): void {
    this.mobileNavOpen.set(false);
  }

  toggleTheme(): void {
    this.theme.toggleDarkMode();
  }

  handleDownload(): void {
    // If already logged in, directly download
    if (this.authService.user()) {
      this.downloadForLoggedInUser();
      return;
    }
    // Otherwise show the modal
    this.showDownloadModal.set(true);
  }

  closeModal(): void {
    this.showDownloadModal.set(false);
    this.formError.set(null);
  }

  async submitDownloadForm(): Promise<void> {
    // Validate form
    if (!this.downloadForm.firstName.trim() || !this.downloadForm.lastName.trim() || !this.downloadForm.email.trim()) {
      this.formError.set('Please fill in all fields.');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(this.downloadForm.email)) {
      this.formError.set('Please enter a valid email address.');
      return;
    }

    this.formSubmitting.set(true);
    this.formError.set(null);

    const firstName = this.downloadForm.firstName.trim();
    const lastName = this.downloadForm.lastName.trim();
    const email = this.downloadForm.email.trim();
    const wantsAccount = this.downloadForm.createAccount;

    try {
      // Record the download
      await this.recordDownload(firstName, lastName, email, wantsAccount);

      // Close modal and open PDF
      this.closeModal();
      window.open(this.bookPdfUrl, '_blank');

      // If they want to create an account, redirect to signup with pre-filled info
      if (wantsAccount) {
        this.router.navigate(['/signup'], {
          queryParams: {
            firstName,
            lastName,
            email
          }
        });
      }

      // Reset form
      this.downloadForm = {
        firstName: '',
        lastName: '',
        email: '',
        createAccount: true
      };
    } catch (err: any) {
      console.error('Download form error:', err);
      this.formError.set(err.message || 'Something went wrong. Please try again.');
    } finally {
      this.formSubmitting.set(false);
    }
  }

  private async downloadForLoggedInUser(): Promise<void> {
    // Record the download for logged-in user
    try {
      const profile = this.authService.profile();
      if (profile) {
        await this.recordDownload(
          profile.firstName || '',
          profile.lastName || '',
          profile.email || '',
          true,
          profile.userId || profile.id
        );
      }
    } catch (err) {
      console.error('Failed to record book download:', err);
    }

    // Open the PDF
    window.open(this.bookPdfUrl, '_blank');
  }

  private async recordDownload(
    firstName: string,
    lastName: string,
    email: string,
    hasAccount: boolean,
    userId?: string
  ): Promise<void> {
    const { initializeApp, getApps, getApp } = await import('firebase/app');
    const { getFirestore, collection, addDoc, serverTimestamp } = await import('firebase/firestore');
    const { firebaseConfig } = await import('../../environments/environment');

    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    const firestore = getFirestore(app);

    await addDoc(collection(firestore, 'bookDownloads'), {
      userId: userId || null,
      firstName,
      lastName,
      email,
      hasAccount,
      bookTitle: 'Surge: 42 High-Velocity Prompts',
      downloadedAt: serverTimestamp()
    });
  }

}

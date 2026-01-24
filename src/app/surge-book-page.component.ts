import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-surge-book-page',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="min-h-screen bg-white text-black dark:bg-slate-950 dark:text-slate-100 flex flex-col transition-colors duration-300">
      <!-- Header -->
      <header class="border-b border-black/5 dark:border-white/10">
        <div class="container mx-auto px-6 py-5 flex items-center justify-between">
          <a routerLink="/" class="flex items-center gap-3 group">
            <div class="relative w-12 h-12">
              <div
                class="absolute -inset-1 bg-gradient-to-r from-red-600 to-black rounded-full blur opacity-20 group-hover:opacity-40 transition">
              </div>
              <img src="/assets/rocket-goals.png" alt="Rocket Goals" class="relative w-12 h-12 object-contain" />
            </div>
            <span class="text-xl font-black tracking-tighter">
              ROCKET<span class="text-red-600">GOALS</span>
            </span>
          </a>

          @if (authService.user()) {
            <!-- Logged in navigation -->
            <nav class="hidden md:flex items-center gap-1">
              <a routerLink="/"
                class="px-4 py-2 text-sm font-bold rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition">
                Home
              </a>
              <a routerLink="/ai"
                class="px-4 py-2 text-sm font-bold rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition">
                AI
              </a>
              <a routerLink="/app-suite"
                class="px-4 py-2 text-sm font-bold rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition">
                App Suite
              </a>
              <a routerLink="/goals"
                class="px-4 py-2 text-sm font-bold rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition">
                My Goals
              </a>
            </nav>
            <div class="flex items-center gap-3">
              <a routerLink="/goals"
                class="px-4 py-2 bg-black text-white text-sm font-bold rounded-full hover:bg-red-600 transition shadow-lg dark:bg-white dark:text-black dark:hover:bg-red-600 dark:hover:text-white">
                Dashboard
              </a>
            </div>
          } @else {
            <!-- Logged out navigation -->
            <div class="flex items-center gap-3">
              <a routerLink="/login"
                class="px-4 py-2 text-sm font-bold rounded-full border border-black/10 hover:border-black transition dark:border-white/20 dark:hover:border-white">Log in</a>
              <a routerLink="/signup"
                class="px-4 py-2 bg-black text-white text-sm font-bold rounded-full hover:bg-red-600 transition shadow-lg dark:bg-white dark:text-black dark:hover:bg-red-600 dark:hover:text-white">Start Free</a>
            </div>
          }
        </div>
      </header>

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
                  Your tactical manual for shattering the "Velocity Barriers" that are holding you back. This isn't just
                  a book of theory; it's a high-octane engine of 42 high-intensity AI prompts designed to override your
                  default thinking and propel you into immediate action.
                </p>

                <p class="text-lg text-black/60 dark:text-slate-400 italic">
                  "Don't just dream of progress - launch it!"
                </p>

                <button (click)="handleDownload()"
                  class="group inline-flex items-center gap-3 px-10 py-5 bg-red-600 text-white font-black text-xl rounded-full hover:bg-black transition-all duration-300 shadow-xl hover:shadow-2xl hover:-translate-y-1">
                  Download Now - Free
                  <svg class="w-6 h-6 transform group-hover:translate-y-1 transition-transform" fill="none"
                    stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>

                @if (!authService.user()) {
                  <p class="text-sm text-black/50 dark:text-slate-400">
                    * Login required to download
                  </p>
                }
              </div>
            </div>
          </div>
        </section>

        <!-- What You'll Learn Section -->
        <section class="py-16 md:py-24 bg-gray-50 dark:bg-slate-900/50">
          <div class="container mx-auto px-6">
            <div class="max-w-6xl mx-auto">
              <div class="text-center mb-16">
                <div
                  class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 border border-gray-200 text-gray-600 dark:bg-white/5 dark:border-white/10 dark:text-slate-200 mb-4">
                  <span class="w-2 h-2 bg-red-600 rounded-full animate-pulse"></span>
                  <span class="text-xs font-bold tracking-wider uppercase">What You'll Learn</span>
                </div>
                <h2 class="text-3xl md:text-5xl font-black tracking-tight text-black dark:text-white mb-4">
                  Seven Categories of <span class="text-red-600">Propulsion</span>
                </h2>
                <p class="text-lg text-black/60 dark:text-slate-300 max-w-2xl mx-auto">
                  Through seven specialized categories, you will learn to overcome the barriers holding you back and
                  launch your goals faster than ever.
                </p>
              </div>

              <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                <!-- Card 1 -->
                <div
                  class="bg-white border border-black/5 rounded-3xl p-6 space-y-4 hover:shadow-xl transition-shadow dark:bg-slate-900/70 dark:border-white/10">
                  <div class="w-14 h-14 bg-red-600/10 rounded-2xl flex items-center justify-center">
                    <svg class="w-7 h-7 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <h3 class="text-xl font-bold text-black dark:text-white">Ignite Escape Velocity</h3>
                  <p class="text-black/60 dark:text-slate-300 text-sm">
                    Overcome the "limbic friction" and freeze-response that kills big Moonshot ideas.
                  </p>
                </div>

                <!-- Card 2 -->
                <div
                  class="bg-white border border-black/5 rounded-3xl p-6 space-y-4 hover:shadow-xl transition-shadow dark:bg-slate-900/70 dark:border-white/10">
                  <div class="w-14 h-14 bg-red-600/10 rounded-2xl flex items-center justify-center">
                    <svg class="w-7 h-7 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </div>
                  <h3 class="text-xl font-bold text-black dark:text-white">Narrow Your Focus</h3>
                  <p class="text-black/60 dark:text-slate-300 text-sm">
                    Cut through the "blurry vision" of a Maze project to find your next aligned step forward.
                  </p>
                </div>

                <!-- Card 3 -->
                <div
                  class="bg-white border border-black/5 rounded-3xl p-6 space-y-4 hover:shadow-xl transition-shadow dark:bg-slate-900/70 dark:border-white/10">
                  <div class="w-14 h-14 bg-red-600/10 rounded-2xl flex items-center justify-center">
                    <svg class="w-7 h-7 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </div>
                  <h3 class="text-xl font-bold text-black dark:text-white">Eliminate Drag</h3>
                  <p class="text-black/60 dark:text-slate-300 text-sm">
                    Strip away the bureaucratic friction and busy work that stalls your Metro progress.
                  </p>
                </div>

                <!-- Card 4 -->
                <div
                  class="bg-white border border-black/5 rounded-3xl p-6 space-y-4 hover:shadow-xl transition-shadow dark:bg-slate-900/70 dark:border-white/10">
                  <div class="w-14 h-14 bg-red-600/10 rounded-2xl flex items-center justify-center">
                    <svg class="w-7 h-7 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
                    </svg>
                  </div>
                  <h3 class="text-xl font-bold text-black dark:text-white">Activate Afterburner</h3>
                  <p class="text-black/60 dark:text-slate-300 text-sm">
                    Leverage the power of AI to cross the finish line with maximum force.
                  </p>
                </div>
              </div>
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
                  organizations like the Project Management Institute and helped countless teams navigate complex
                  projects. By combining his deep expertise with cutting-edge AI prompts, he's created a unique system
                  to help you move from hesitation to hyperdrive.
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

              <button (click)="handleDownload()"
                class="group inline-flex items-center gap-3 px-12 py-6 bg-red-600 text-white font-black text-2xl rounded-full hover:bg-white hover:text-black transition-all duration-300 shadow-xl hover:shadow-2xl hover:-translate-y-1">
                Download Free eBook
                <svg class="w-7 h-7 transform group-hover:translate-y-1 transition-transform" fill="none"
                  stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>

              @if (!authService.user()) {
                <p class="text-sm text-white/40">
                  * You'll need to log in to download the book
                </p>
              }

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

  readonly bookPdfUrl = 'https://firebasestorage.googleapis.com/v0/b/rocket-prompt.firebasestorage.app/o/site%2FSurge_%2042%20High%20Velocity_%20FULL%20eBOOK_Final.pdf?alt=media&token=a0ddc6ca-4c99-4532-9342-b214e9f90a72';
  readonly bookImageUrl = 'https://firebasestorage.googleapis.com/v0/b/rocket-prompt.firebasestorage.app/o/site%2Fsurge-book.png?alt=media&token=1fa8febd-bf3e-4bce-aa9f-13ed5cb03462';

  ngOnInit(): void {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  handleDownload(): void {
    if (!this.authService.user()) {
      this.router.navigate(['/login'], { queryParams: { redirectTo: '/surge-book' } });
      return;
    }
    window.open(this.bookPdfUrl, '_blank');
  }
}

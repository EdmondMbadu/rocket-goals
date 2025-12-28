import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-about-page',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="min-h-screen bg-white text-black dark:bg-slate-950 dark:text-slate-100 flex flex-col transition-colors duration-300">
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
          <div class="flex items-center gap-3">
            <a routerLink="/pricing"
              class="px-4 py-2 text-sm font-bold rounded-full border border-black/10 hover:border-black transition">Pricing</a>
            <a routerLink="/signup"
              class="px-4 py-2 bg-black text-white text-sm font-bold rounded-full hover:bg-red-600 transition shadow-lg">Start Free</a>
          </div>
        </div>
      </header>

      <main class="flex-1">
        <section class="relative overflow-hidden border-b border-black/5 dark:border-white/10">
          <div class="absolute inset-0 opacity-20 pointer-events-none">
            <div
              class="absolute top-[-200px] left-[-200px] w-[600px] h-[600px] bg-red-600/15 rounded-full blur-[140px]">
            </div>
            <div
              class="absolute bottom-[-200px] right-[-150px] w-[500px] h-[500px] bg-black/10 rounded-full blur-[120px]">
            </div>
          </div>

          <div class="container mx-auto px-6 py-8 relative z-10 space-y-6 text-center">
            <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 border border-gray-200 text-gray-600 dark:bg-white/5 dark:border-white/10 dark:text-slate-200">
              <span class="w-2 h-2 bg-red-600 rounded-full animate-pulse"></span>
              <span class="text-xs font-bold tracking-wider uppercase">About</span>
            </div>
            <h1 class="text-4xl md:text-6xl font-black tracking-tight leading-tight text-black dark:text-white">
              About RocketGoals
            </h1>
            <p class="text-lg md:text-xl text-black/60 dark:text-slate-300 max-w-3xl mx-auto">
              The world's most advanced AI-powered goal tracking platform. Transform your ambitions into achievements at warp speed.
            </p>
          </div>
        </section>

        <section class="py-8 md:py-12">
          <div class="container mx-auto px-6">
            <div class="max-w-4xl mx-auto space-y-8">
              <!-- Mission -->
              <div class="bg-white border border-black/5 rounded-3xl shadow-xl p-8 space-y-4 dark:bg-slate-900/80 dark:border-white/10 dark:shadow-[0_25px_60px_rgba(2,6,23,0.7)]">
                <div class="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-red-50 text-red-700 text-xs font-bold uppercase tracking-widest dark:bg-red-500/15 dark:text-red-200">
                  Our Mission
                </div>
                <h2 class="text-3xl md:text-4xl font-black tracking-tight text-black dark:text-white">
                  Power Your Impossible
                </h2>
                <p class="text-lg text-black/70 dark:text-slate-300 leading-relaxed">
                  RocketGoals was built to solve a simple problem: most people set goals but never achieve them. We combine the power of AI coaching with proven frameworks to help you turn ambitious dreams into daily achievements.
                </p>
              </div>

              <!-- What We Do -->
              <div class="grid md:grid-cols-2 gap-6">
                <div class="bg-white border border-black/5 rounded-3xl p-6 space-y-3 dark:bg-slate-900/70 dark:border-white/10">
                  <div class="w-12 h-12 bg-red-600/10 rounded-2xl flex items-center justify-center">
                    <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                  <h3 class="text-xl font-bold text-black dark:text-white">AI-Powered Coaching</h3>
                  <p class="text-black/70 dark:text-slate-300">Get personalized guidance 24/7 from our Gemini-powered AI coach. It understands your goals, learns your patterns, and provides real-time coaching to keep you on track.</p>
                </div>

                <div class="bg-white border border-black/5 rounded-3xl p-6 space-y-3 dark:bg-slate-900/70 dark:border-white/10">
                  <div class="w-12 h-12 bg-red-600/10 rounded-2xl flex items-center justify-center">
                    <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <h3 class="text-xl font-bold text-black dark:text-white">7-Day Launch Framework</h3>
                  <p class="text-black/70 dark:text-slate-300">Turn any goal into an actionable 7-day mission plan. Our proven framework helps you break down big dreams into daily achievable steps.</p>
                </div>

                <div class="bg-white border border-black/5 rounded-3xl p-6 space-y-3 dark:bg-slate-900/70 dark:border-white/10">
                  <div class="w-12 h-12 bg-red-600/10 rounded-2xl flex items-center justify-center">
                    <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <h3 class="text-xl font-bold text-black dark:text-white">Progress Tracking</h3>
                  <p class="text-black/70 dark:text-slate-300">Beautiful dashboards show exactly how far you've come. Track streaks, visualize progress, and celebrate every milestone on your journey.</p>
                </div>

                <div class="bg-white border border-black/5 rounded-3xl p-6 space-y-3 dark:bg-slate-900/70 dark:border-white/10">
                  <div class="w-12 h-12 bg-red-600/10 rounded-2xl flex items-center justify-center">
                    <svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 class="text-xl font-bold text-black dark:text-white">Flexible Pricing</h3>
                  <p class="text-black/70 dark:text-slate-300">Start free and upgrade when ready. Plans that scale with your ambition from Launch (free) to Galactic (enterprise).</p>
                </div>
              </div>

              <!-- Stats -->
              <div class="bg-gray-50 border border-black/5 rounded-3xl p-8 dark:bg-slate-900/70 dark:border-white/10">
                <div class="grid md:grid-cols-3 gap-6 text-center">
                  <div>
                    <div class="text-4xl md:text-5xl font-black text-red-600 mb-2">10,000+</div>
                    <div class="text-sm font-bold text-black/60 dark:text-slate-300 uppercase tracking-wider">Goals Launched</div>
                  </div>
                  <div>
                    <div class="text-4xl md:text-5xl font-black text-red-600 mb-2">94%</div>
                    <div class="text-sm font-bold text-black/60 dark:text-slate-300 uppercase tracking-wider">Success Rate</div>
                  </div>
                  <div>
                    <div class="text-4xl md:text-5xl font-black text-red-600 mb-2">24/7</div>
                    <div class="text-sm font-bold text-black/60 dark:text-slate-300 uppercase tracking-wider">AI Coaching</div>
                  </div>
                </div>
              </div>

              <!-- CTA -->
              <div class="text-center space-y-4 pt-6">
                <h3 class="text-2xl md:text-3xl font-black text-black dark:text-white">Ready to Launch Your Goals?</h3>
                <p class="text-lg text-black/60 dark:text-slate-300 max-w-2xl mx-auto">
                  Join thousands of achievers who are transforming their dreams into reality. Start your journey today.
                </p>
                <div class="flex flex-col sm:flex-row gap-4 justify-center">
                  <a routerLink="/signup"
                    class="px-8 py-4 bg-red-600 text-white font-bold text-lg rounded-full hover:bg-black transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-1 inline-flex items-center justify-center">
                    Start Free
                  </a>
                  <a routerLink="/pricing"
                    class="px-8 py-4 bg-white text-black font-bold text-lg rounded-full border-2 border-black/10 hover:border-black hover:bg-black hover:text-white transition-all duration-300 dark:bg-transparent dark:text-white dark:border-white/20 dark:hover:bg-white dark:hover:text-black">
                    View Pricing
                  </a>
                </div>
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
export class AboutPageComponent implements OnInit {
  ngOnInit(): void {
    // Scroll to top when component loads
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
}


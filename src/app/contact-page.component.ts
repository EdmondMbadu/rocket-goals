import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-contact-page',
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

          <div class="container mx-auto px-6 py-16 relative z-10 space-y-10 text-center">
            <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 border border-gray-200 text-gray-600 dark:bg-white/5 dark:border-white/10 dark:text-slate-200">
              <span class="w-2 h-2 bg-red-600 rounded-full animate-pulse"></span>
              <span class="text-xs font-bold tracking-wider uppercase">Contact</span>
            </div>
            <h1 class="text-4xl md:text-6xl font-black tracking-tight leading-tight text-black dark:text-white">
              Talk to Mission Control
            </h1>
            <p class="text-lg md:text-xl text-black/60 dark:text-slate-300 max-w-3xl mx-auto">
              If you want to reach us, email
              <a class="text-red-600 font-semibold hover:underline" href="mailto:missoncontrol@rocketgoals.com">
                missoncontrol@rocketgoals.com
              </a>.
              We're here to help with sales, partnerships, or product questions.
            </p>
          </div>
        </section>

        <section class="py-12 md:py-20">
          <div class="container mx-auto px-6">
            <div class="grid lg:grid-cols-[1.2fr_0.8fr] gap-8">
              <div class="bg-white border border-black/5 rounded-3xl shadow-xl p-10 space-y-8 dark:bg-slate-900/80 dark:border-white/10 dark:shadow-[0_25px_60px_rgba(2,6,23,0.7)]">
                <div class="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-red-50 text-red-700 text-xs font-bold uppercase tracking-widest dark:bg-red-500/15 dark:text-red-200">
                  Mission Control
                </div>
                <h2 class="text-3xl md:text-4xl font-black tracking-tight text-black dark:text-white">
                  Email our team and we'll respond fast
                </h2>
                <p class="text-lg text-black/70 dark:text-slate-300 leading-relaxed">
                  Whether you're ready to launch with RocketGoals or just want to talk through the details, drop us a note.
                  We typically respond within one business day.
                </p>

                <div class="grid sm:grid-cols-2 gap-4">
                  <a href="mailto:missoncontrol@rocketgoals.com"
                    class="w-full inline-flex items-center justify-center gap-3 px-6 py-4 bg-black text-white font-bold text-base rounded-2xl hover:bg-red-600 transition shadow-lg hover:shadow-red-600/20">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M16 12h2a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4a2 2 0 012-2h2m2 0l2 2 4-4m-6 2L8 8" />
                    </svg>
                    Email Mission Control
                  </a>
                  <a routerLink="/pricing"
                    class="w-full inline-flex items-center justify-center gap-3 px-6 py-4 bg-white text-black font-bold text-base rounded-2xl border-2 border-black/10 hover:border-black hover:bg-black hover:text-white transition dark:bg-transparent dark:text-white dark:border-white/20 dark:hover:bg-white dark:hover:text-black">
                    View Pricing
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
                    </svg>
                  </a>
                </div>

                <div class="space-y-4">
                  <div class="flex items-start gap-3">
                    <div class="w-10 h-10 rounded-2xl bg-red-600/10 text-red-700 flex items-center justify-center">
                      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8m-9 4.34L5 8m14 0l-7 4.34M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div>
                      <h3 class="text-xl font-bold">Direct inbox</h3>
                      <p class="text-black/70 dark:text-slate-300">Your message goes straight to the RocketGoals team. No forms, just email.</p>
                    </div>
                  </div>
                  <div class="flex items-start gap-3">
                    <div class="w-10 h-10 rounded-2xl bg-black/5 text-black flex items-center justify-center">
                      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3-.895 3-2-1.343-2-3-2zm0 0V4m0 8v6m-4-4h8" />
                      </svg>
                    </div>
                    <div>
                      <h3 class="text-xl font-bold">Sales & partnerships</h3>
                      <p class="text-black/70 dark:text-slate-300">Tell us what you need and we'll tailor the best plan for your team.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div class="bg-gray-50 border border-black/5 rounded-3xl p-8 space-y-6 dark:bg-slate-900/70 dark:border-white/10">
                <div class="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-white text-black text-xs font-bold uppercase tracking-widest border border-black/5 dark:bg-slate-900 dark:text-white dark:border-white/10">
                  Quick info
                </div>
                <div class="space-y-4">
                  <div class="p-4 bg-white rounded-2xl border border-black/5 dark:bg-slate-900/60 dark:border-white/10">
                    <div class="text-sm font-bold text-black/60 dark:text-slate-300 uppercase tracking-[0.2em]">Email</div>
                    <a href="mailto:missoncontrol@rocketgoals.com" class="text-lg font-bold text-red-600 hover:underline">
                      missoncontrol@rocketgoals.com
                    </a>
                  </div>
                  <div class="p-4 bg-white rounded-2xl border border-black/5 dark:bg-slate-900/60 dark:border-white/10">
                    <div class="text-sm font-bold text-black/60 dark:text-slate-300 uppercase tracking-[0.2em]">Hours</div>
                    <p class="text-lg font-semibold text-black dark:text-white">Mon–Fri • 9am–6pm PT</p>
                    <p class="text-sm text-black/60 dark:text-slate-400">We usually reply within one business day.</p>
                  </div>
                  <div class="p-4 bg-white rounded-2xl border border-black/5 dark:bg-slate-900/60 dark:border-white/10">
                    <div class="text-sm font-bold text-black/60 dark:text-slate-300 uppercase tracking-[0.2em]">Need a demo?</div>
                    <p class="text-lg font-semibold text-black dark:text-white">Ask for a walkthrough in your email.</p>
                    <p class="text-sm text-black/60 dark:text-slate-400">We'll share a personalized demo recording.</p>
                  </div>
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
    :host-context(.dark) .bg-white.border {
      border-color: rgba(226, 232, 240, 0.15);
    }
    :host-context(.dark) .bg-white.shadow-xl,
    :host-context(.dark) .bg-white.shadow-lg {
      box-shadow: 0 25px 60px rgba(2, 6, 23, 0.7);
    }
    :host-context(.dark) .bg-white\\/5 {
      background-color: rgba(248, 250, 252, 0.05);
    }
    :host-context(.dark) .bg-black\\/5 {
      background-color: rgba(148, 163, 184, 0.15);
    }
    :host-context(.dark) .text-gray-500,
    :host-context(.dark) .text-gray-600 {
      color: #cbd5f5;
    }
  `]
})
export class ContactPageComponent { }

import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ThemeService } from './theme.service';

type StatItem = {
  value: string;
  label: string;
};

type ListItem = {
  title: string;
  description?: string;
};

type FeatureItem = {
  eyebrow: string;
  title: string;
  description: string;
};

@Component({
  selector: 'app-setup-team-page',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="min-h-screen bg-white text-black transition-colors duration-300 dark:bg-slate-950 dark:text-slate-100">
      <header class="sticky top-0 z-40 border-b border-black/5 bg-white/90 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/80">
        <div class="container mx-auto flex items-center justify-between gap-6 px-6 py-5">
          <a routerLink="/" class="group flex items-center gap-3">
            <div class="relative w-12 h-12">
              <div
                class="absolute -inset-1 rounded-full bg-gradient-to-r from-red-600 to-black blur opacity-20 transition group-hover:opacity-40">
              </div>
              <img src="/assets/rocket-goals.png" alt="Rocket Goals" class="relative h-12 w-12 object-contain" />
            </div>
            <span class="text-xl font-black tracking-tighter">
              ROCKET<span class="text-red-600">GOALS</span>
            </span>
          </a>

          <div class="flex items-center gap-3">
            <button
              type="button"
              (click)="toggleDarkMode()"
              [attr.aria-pressed]="isDarkMode()"
              class="rounded-full border border-black/10 p-2.5 text-black/75 transition hover:bg-black hover:text-white dark:border-white/20 dark:text-white dark:hover:bg-white dark:hover:text-black"
              title="Toggle dark mode">
              @if (isDarkMode()) {
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                </svg>
              } @else {
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M12 3v2m0 14v2m9-9h-2M5 12H3m13.364 6.364-1.414-1.414M8.05 8.05 6.636 6.636m9.9 0-1.414 1.414M8.05 15.95l-1.414 1.414M12 8a4 4 0 100 8 4 4 0 000-8z" />
                </svg>
              }
            </button>
            <a
              routerLink="/schedule"
              class="hidden rounded-full border border-black/10 px-4 py-2 text-sm font-bold transition hover:border-black dark:border-white/15 dark:hover:border-white sm:inline-flex">
              Schedule Demo
            </a>
            <a
              routerLink="/signup"
              class="inline-flex rounded-full bg-black px-4 py-2 text-sm font-bold text-white shadow-lg transition hover:bg-red-600">
              Start Free
            </a>
          </div>
        </div>
      </header>

      <main>
        @if (isDarkMode()) {
          <section class="relative overflow-hidden border-b border-white/10 bg-neutral-950 text-white">
            <div class="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.30),transparent_32%)]"></div>
            <div class="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(251,146,60,0.16),transparent_30%)]"></div>

            <div class="container relative mx-auto grid min-h-[calc(100vh-81px)] items-center gap-14 px-6 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
              <div class="max-w-3xl">
                <div class="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.25em] text-white/80">
                  <span class="h-2 w-2 rounded-full bg-red-500"></span>
                  For Coaches
                </div>

                <h1 class="mt-6 text-5xl font-black tracking-[-0.06em] text-white sm:text-6xl lg:text-7xl">
                  Your team keeps moving.
                  <span class="block text-red-500">Even when you are not watching.</span>
                </h1>

                <p class="mt-6 max-w-2xl text-lg leading-relaxed text-white/72 sm:text-xl">
                  Launch a dedicated team page with an AI coach that handles check-ins, reminders, and accountability,
                  so you can spend your energy on strategy, leadership, and the moments that actually require you.
                </p>

                <div class="mt-10 flex flex-col gap-4 sm:flex-row">
                  <a
                    routerLink="/signup"
                    class="inline-flex items-center justify-center rounded-full bg-white px-8 py-4 text-base font-black text-black shadow-[0_18px_45px_rgba(255,255,255,0.16)] transition hover:-translate-y-0.5 hover:bg-red-500 hover:text-white">
                    Create Your Team Page
                  </a>
                  <a
                    routerLink="/schedule"
                    class="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/10 px-8 py-4 text-base font-black text-white transition hover:bg-white hover:text-black">
                    See How It Works
                  </a>
                </div>

                <div class="mt-12 grid gap-4 sm:grid-cols-3">
                  @for (item of socialProof; track item.label) {
                    <div class="rounded-3xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur">
                      <div class="text-2xl font-black text-red-400">{{ item.value }}</div>
                      <div class="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-white/60">{{ item.label }}</div>
                    </div>
                  }
                </div>
              </div>

              <div class="relative">
                <div class="absolute -left-8 top-10 h-40 w-40 rounded-full bg-red-600/20 blur-3xl"></div>
                <div class="absolute -bottom-4 right-8 h-48 w-48 rounded-full bg-orange-400/15 blur-3xl"></div>

                <div class="relative overflow-hidden rounded-[2rem] border border-white/10 bg-white/6 p-5 shadow-2xl backdrop-blur-xl sm:p-7">
                  <div class="flex items-center justify-between border-b border-white/10 pb-4">
                    <div>
                      <p class="text-xs font-bold uppercase tracking-[0.24em] text-red-300">RocketGoals Team OS</p>
                      <h2 class="mt-2 text-2xl font-black tracking-tight">Momentum dashboard</h2>
                    </div>
                    <div class="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-300">
                      Live
                    </div>
                  </div>

                  <div class="space-y-4 py-5">
                    <div class="ml-auto max-w-[85%] rounded-3xl border border-white/10 bg-white px-5 py-4 text-black shadow-lg">
                      <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-red-600">AI Coach • 08:00 AM</p>
                      <p class="mt-2 text-sm font-medium leading-relaxed text-black/80">
                        Good morning Marcus. You are at 85% of your weekly sprint target. Ready to close the last 15%
                        today?
                      </p>
                    </div>

                    <div class="max-w-[80%] rounded-3xl bg-red-600 px-5 py-4 text-white shadow-lg shadow-red-950/20">
                      <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-red-100">Marcus • 08:03 AM</p>
                      <p class="mt-2 text-sm font-medium leading-relaxed">
                        Absolutely. Client report will be done by 2 PM and the handoff goes out right after.
                      </p>
                    </div>

                    <div class="rounded-[1.75rem] border border-white/10 bg-white/10 p-5">
                      <div class="flex items-center justify-between text-sm font-bold">
                        <span class="text-white/72">Weekly progress</span>
                        <span class="text-red-300">92%</span>
                      </div>
                      <div class="mt-3 h-3 overflow-hidden rounded-full bg-white/10">
                        <div class="h-full rounded-full bg-gradient-to-r from-red-500 to-orange-400" style="width: 92%"></div>
                      </div>
                      <div class="mt-4 grid gap-3 sm:grid-cols-3">
                        <div class="rounded-2xl bg-black/25 px-4 py-3">
                          <div class="text-xs uppercase tracking-[0.2em] text-white/50">Check-ins</div>
                          <div class="mt-1 text-lg font-black">18 sent</div>
                        </div>
                        <div class="rounded-2xl bg-black/25 px-4 py-3">
                          <div class="text-xs uppercase tracking-[0.2em] text-white/50">At risk</div>
                          <div class="mt-1 text-lg font-black">2 members</div>
                        </div>
                        <div class="rounded-2xl bg-black/25 px-4 py-3">
                          <div class="text-xs uppercase tracking-[0.2em] text-white/50">Needs coach</div>
                          <div class="mt-1 text-lg font-black">1 alert</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="rounded-[1.5rem] bg-black/50 p-4 text-sm text-white/80 ring-1 ring-white/10">
                    <p class="text-[11px] font-bold uppercase tracking-[0.2em] text-red-300">Observer insight</p>
                    <p class="mt-2 leading-relaxed">
                      AI handled the morning follow-up while you stayed in deep work. You only get pulled in when a real
                      intervention is needed.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        } @else {
          <section class="relative overflow-hidden border-b border-black/5 bg-[linear-gradient(135deg,#fff8f6_0%,#fff1ee_42%,#f8fafc_100%)] text-black">
            <div class="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.16),transparent_32%)]"></div>
            <div class="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,rgba(251,146,60,0.12),transparent_30%)]"></div>
            <div class="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.72),rgba(255,255,255,0.9))]"></div>

            <div class="container relative mx-auto grid min-h-[calc(100vh-81px)] items-center gap-14 px-6 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
              <div class="max-w-3xl">
                <div class="inline-flex items-center gap-2 rounded-full border border-red-200 bg-white/80 px-4 py-2 text-xs font-bold uppercase tracking-[0.25em] text-red-700 shadow-sm">
                  <span class="h-2 w-2 rounded-full bg-red-500"></span>
                  For Coaches
                </div>

                <h1 class="mt-6 text-5xl font-black tracking-[-0.06em] text-black sm:text-6xl lg:text-7xl">
                  Your team keeps moving.
                  <span class="block text-red-500">Even when you are not watching.</span>
                </h1>

                <p class="mt-6 max-w-2xl text-lg leading-relaxed text-black/68 sm:text-xl">
                  Launch a dedicated team page with an AI coach that handles check-ins, reminders, and accountability,
                  so you can spend your energy on strategy, leadership, and the moments that actually require you.
                </p>

                <div class="mt-10 flex flex-col gap-4 sm:flex-row">
                  <a
                    routerLink="/signup"
                    class="inline-flex items-center justify-center rounded-full bg-black px-8 py-4 text-base font-black text-white shadow-[0_18px_45px_rgba(15,23,42,0.14)] transition hover:-translate-y-0.5 hover:bg-red-500">
                    Create Your Team Page
                  </a>
                  <a
                    routerLink="/schedule"
                    class="inline-flex items-center justify-center rounded-full border border-black/10 bg-white/80 px-8 py-4 text-base font-black text-black transition hover:border-black hover:bg-black hover:text-white">
                    See How It Works
                  </a>
                </div>

                <div class="mt-12 grid gap-4 sm:grid-cols-3">
                  @for (item of socialProof; track item.label) {
                    <div class="rounded-3xl border border-black/5 bg-white/75 px-5 py-4 shadow-sm backdrop-blur">
                      <div class="text-2xl font-black text-red-500">{{ item.value }}</div>
                      <div class="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-black/50">{{ item.label }}</div>
                    </div>
                  }
                </div>
              </div>

              <div class="relative">
                <div class="absolute -left-8 top-10 h-40 w-40 rounded-full bg-red-600/20 blur-3xl"></div>
                <div class="absolute -bottom-4 right-8 h-48 w-48 rounded-full bg-orange-400/15 blur-3xl"></div>

                <div class="relative overflow-hidden rounded-[2rem] border border-black/5 bg-white/88 p-5 shadow-2xl backdrop-blur-xl sm:p-7">
                  <div class="flex items-center justify-between border-b border-black/5 pb-4">
                    <div>
                      <p class="text-xs font-bold uppercase tracking-[0.24em] text-red-600">RocketGoals Team OS</p>
                      <h2 class="mt-2 text-2xl font-black tracking-tight text-black">Momentum dashboard</h2>
                    </div>
                    <div class="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-700">
                      Live
                    </div>
                  </div>

                  <div class="space-y-4 py-5">
                    <div class="ml-auto max-w-[85%] rounded-3xl border border-white/10 bg-white px-5 py-4 text-black shadow-lg">
                      <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-red-600">AI Coach • 08:00 AM</p>
                      <p class="mt-2 text-sm font-medium leading-relaxed text-black/80">
                        Good morning Marcus. You are at 85% of your weekly sprint target. Ready to close the last 15%
                        today?
                      </p>
                    </div>

                    <div class="max-w-[80%] rounded-3xl bg-red-600 px-5 py-4 text-white shadow-lg shadow-red-950/20">
                      <p class="text-[11px] font-bold uppercase tracking-[0.18em] text-red-100">Marcus • 08:03 AM</p>
                      <p class="mt-2 text-sm font-medium leading-relaxed">
                        Absolutely. Client report will be done by 2 PM and the handoff goes out right after.
                      </p>
                    </div>

                    <div class="rounded-[1.75rem] border border-black/5 bg-slate-50/95 p-5">
                      <div class="flex items-center justify-between text-sm font-bold">
                        <span class="text-black/65">Weekly progress</span>
                        <span class="text-red-500">92%</span>
                      </div>
                      <div class="mt-3 h-3 overflow-hidden rounded-full bg-black/10">
                        <div class="h-full rounded-full bg-gradient-to-r from-red-500 to-orange-400" style="width: 92%"></div>
                      </div>
                      <div class="mt-4 grid gap-3 sm:grid-cols-3">
                        <div class="rounded-2xl bg-white px-4 py-3 shadow-sm">
                          <div class="text-xs uppercase tracking-[0.2em] text-black/45">Check-ins</div>
                          <div class="mt-1 text-lg font-black text-black">18 sent</div>
                        </div>
                        <div class="rounded-2xl bg-white px-4 py-3 shadow-sm">
                          <div class="text-xs uppercase tracking-[0.2em] text-black/45">At risk</div>
                          <div class="mt-1 text-lg font-black text-black">2 members</div>
                        </div>
                        <div class="rounded-2xl bg-white px-4 py-3 shadow-sm">
                          <div class="text-xs uppercase tracking-[0.2em] text-black/45">Needs coach</div>
                          <div class="mt-1 text-lg font-black text-black">1 alert</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="rounded-[1.5rem] bg-black px-4 py-4 text-sm text-white/80 ring-1 ring-black/5">
                    <p class="text-[11px] font-bold uppercase tracking-[0.2em] text-red-300">Observer insight</p>
                    <p class="mt-2 leading-relaxed">
                      AI handled the morning follow-up while you stayed in deep work. You only get pulled in when a real
                      intervention is needed.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        }

        <section class="border-b border-black/5 bg-white py-20 dark:border-white/10 dark:bg-slate-950">
          <div class="container mx-auto px-6">
            <div class="grid gap-px overflow-hidden rounded-[2rem] border border-black/5 bg-black/5 dark:border-white/10 dark:bg-white/10 lg:grid-cols-2">
              <div class="bg-red-600 px-8 py-10 text-white sm:px-12 sm:py-14">
                <p class="text-xs font-bold uppercase tracking-[0.24em] text-red-100">AI handles</p>
                <h2 class="mt-4 text-4xl font-black tracking-tight sm:text-5xl">The repetition</h2>
                <div class="mt-10 space-y-5">
                  @for (item of aiHandles; track item.title) {
                    <div class="flex items-start gap-4">
                      <div class="mt-1 flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white/15">
                        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="m5 13 4 4L19 7" />
                        </svg>
                      </div>
                      <div>
                        <h3 class="text-xl font-black">{{ item.title }}</h3>
                        <p class="mt-1 text-white/80">{{ item.description }}</p>
                      </div>
                    </div>
                  }
                </div>
              </div>

              <div class="bg-slate-50 px-8 py-10 text-black dark:bg-slate-900 sm:px-12 sm:py-14 dark:text-white">
                <p class="text-xs font-bold uppercase tracking-[0.24em] text-red-600 dark:text-red-300">You handle</p>
                <h2 class="mt-4 text-4xl font-black tracking-tight sm:text-5xl">The coaching</h2>
                <div class="mt-10 space-y-5">
                  @for (item of coachHandles; track item.title) {
                    <div class="flex items-start gap-4">
                      <div class="mt-1 flex h-8 w-8 flex-none items-center justify-center rounded-full bg-red-600/10 text-red-600 dark:bg-red-500/15 dark:text-red-300">
                        <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 3 4 14h6l-1 7 9-11h-6l1-7Z" />
                        </svg>
                      </div>
                      <div>
                        <h3 class="text-xl font-black">{{ item.title }}</h3>
                        <p class="mt-1 text-black/65 dark:text-slate-300">{{ item.description }}</p>
                      </div>
                    </div>
                  }
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="bg-slate-50 py-20 dark:bg-slate-900/40">
          <div class="container mx-auto px-6">
            <div class="max-w-3xl">
              <p class="text-xs font-bold uppercase tracking-[0.24em] text-red-600 dark:text-red-300">The infrastructure</p>
              <h2 class="mt-4 text-4xl font-black tracking-tight sm:text-5xl">Everything your team page includes</h2>
              <p class="mt-4 text-lg leading-relaxed text-black/65 dark:text-slate-300">
                The page is built to feel like your system, not a generic chat widget. Set the tone, define the rules,
                and let the AI do the operational work.
              </p>
            </div>

            <div class="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
              @for (item of features; track item.title) {
                <article class="group rounded-[1.75rem] border border-black/5 bg-white p-7 shadow-sm transition hover:-translate-y-1 hover:border-red-500/30 hover:shadow-xl dark:border-white/10 dark:bg-slate-950/80">
                  <div class="inline-flex rounded-full bg-red-600/10 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-red-700 dark:bg-red-500/15 dark:text-red-200">
                    {{ item.eyebrow }}
                  </div>
                  <h3 class="mt-5 text-2xl font-black tracking-tight">{{ item.title }}</h3>
                  <p class="mt-3 text-base leading-relaxed text-black/65 dark:text-slate-300">
                    {{ item.description }}
                  </p>
                </article>
              }
            </div>
          </div>
        </section>

        <section class="bg-white py-20 dark:bg-slate-950">
          <div class="container mx-auto px-6">
            <div class="text-center">
              <p class="text-xs font-bold uppercase tracking-[0.24em] text-red-600 dark:text-red-300">How it works</p>
              <h2 class="mt-4 text-4xl font-black tracking-tight sm:text-5xl">Up and running in four steps</h2>
            </div>

            <div class="relative mt-14 grid gap-6 md:grid-cols-4">
              <div class="absolute left-0 right-0 top-8 hidden h-px bg-black/10 dark:bg-white/10 md:block"></div>
              @for (item of steps; track item.title; let i = $index) {
                <div class="relative z-10 rounded-[1.75rem] border border-black/5 bg-slate-50 p-7 text-center dark:border-white/10 dark:bg-slate-900/70 md:text-left">
                  <div class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-600 text-2xl font-black text-white md:mx-0">
                    {{ i + 1 }}
                  </div>
                  <h3 class="mt-6 text-2xl font-black">{{ item.title }}</h3>
                  <p class="mt-3 text-black/65 dark:text-slate-300">{{ item.description }}</p>
                </div>
              }
            </div>
          </div>
        </section>

        <section class="bg-slate-50 py-20 dark:bg-slate-900/40">
          <div class="container mx-auto px-6">
            <div class="grid items-center gap-10 overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-xl dark:border-white/10 dark:bg-slate-950/80 lg:grid-cols-[0.95fr_1.05fr]">
              <div class="p-8 sm:p-12 lg:p-14">
                <p class="text-xs font-bold uppercase tracking-[0.24em] text-red-600 dark:text-red-300">Personalized accountability</p>
                <h2 class="mt-4 text-4xl font-black tracking-tight sm:text-5xl">
                  Individual nudges. Team-wide momentum.
                </h2>
                <p class="mt-6 text-lg leading-relaxed text-black/65 dark:text-slate-300">
                  Generic reminders get ignored. RocketGoals AI uses each member's goal, progress, and friction points
                  to send messages that feel like a coach paying attention, not automation for the sake of it.
                </p>

                <div class="mt-8 space-y-4">
                  <div class="rounded-3xl border border-black/5 bg-slate-50 p-5 dark:border-white/10 dark:bg-slate-900">
                    <h3 class="text-lg font-black">Dynamic tone control</h3>
                    <p class="mt-2 text-black/65 dark:text-slate-300">
                      Shift from encouraging mentor to hard-edged accountability depending on context and urgency.
                    </p>
                  </div>
                  <div class="rounded-3xl border border-black/5 bg-slate-50 p-5 dark:border-white/10 dark:bg-slate-900">
                    <h3 class="text-lg font-black">Escalate only when needed</h3>
                    <p class="mt-2 text-black/65 dark:text-slate-300">
                      You get involved when the AI spots a real risk, a blocked teammate, or a conversation that needs
                      human judgment.
                    </p>
                  </div>
                </div>
              </div>

              <div class="relative h-full min-h-[440px] overflow-hidden bg-neutral-950 p-8 text-white sm:p-10">
                <div class="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(239,68,68,0.26),transparent_28%)]"></div>
                <div class="relative mx-auto flex max-w-md flex-col gap-4">
                  @for (item of nudgeSequence; track item.title) {
                    <div
                      class="rounded-[1.5rem] border border-white/10 bg-white/10 p-5 shadow-2xl backdrop-blur"
                      [class.ml-8]="$index === 1"
                      [class.ml-4]="$index === 2">
                      <div class="flex items-center justify-between gap-4">
                        <p class="text-[11px] font-bold uppercase tracking-[0.22em]" [class.text-red-300]="$index > 0" [class.text-white/65]="$index === 0">
                          {{ item.title }}
                        </p>
                        <p class="text-[11px] text-white/45">{{ item.description }}</p>
                      </div>
                      <p class="mt-3 text-sm font-medium leading-relaxed text-white/82">{{ item.message }}</p>
                    </div>
                  }
                </div>
              </div>
            </div>
          </div>
        </section>

        <section class="bg-white py-24 dark:bg-slate-950">
          <div class="container mx-auto px-6">
            <div class="mx-auto max-w-4xl rounded-[2.5rem] border border-black/5 bg-gradient-to-br from-white to-slate-50 p-10 text-center shadow-2xl dark:border-white/10 dark:from-slate-900 dark:to-slate-950 sm:p-14">
              <p class="text-xs font-bold uppercase tracking-[0.24em] text-red-600 dark:text-red-300">Final CTA</p>
              <h2 class="mt-5 text-4xl font-black tracking-tight sm:text-6xl">
                Your team deserves a coach that never sleeps.
              </h2>
              <p class="mx-auto mt-5 max-w-2xl text-lg leading-relaxed text-black/65 dark:text-slate-300">
                Set up your coaching page in under a minute, define your standards, and let AI keep the rhythm of
                execution every day.
              </p>

              <div class="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
                <a
                  routerLink="/signup"
                  class="inline-flex items-center justify-center rounded-full bg-red-600 px-8 py-4 text-base font-black text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-black">
                  Get Started
                </a>
                <a
                  routerLink="/contact"
                  class="inline-flex items-center justify-center rounded-full border border-black/10 px-8 py-4 text-base font-black transition hover:border-black hover:bg-black hover:text-white dark:border-white/15 dark:hover:border-white dark:hover:bg-white dark:hover:text-black">
                  Talk to Mission Control
                </a>
              </div>

              <p class="mt-5 text-sm font-medium text-black/50 dark:text-slate-400">
                Free 14-day trial. No credit card required.
              </p>
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
  `]
})
export class SetupTeamPageComponent implements OnInit {
  private readonly themeService = inject(ThemeService);
  protected readonly isDarkMode = this.themeService.isDarkMode;

  readonly socialProof: StatItem[] = [
    { value: '24/7', label: 'AI coach availability' },
    { value: 'Daily', label: 'Automated check-ins' },
    { value: '1 min', label: 'Team page setup' }
  ];

  readonly aiHandles: ListItem[] = [
    {
      title: 'Daily morning check-ins',
      description: 'Every teammate gets a nudge to commit to the most important move for the day.'
    },
    {
      title: 'Missed-goal reminders',
      description: 'The system follows up when momentum drops instead of waiting for your next live session.'
    },
    {
      title: 'Progress collection',
      description: 'Responses, blockers, and daily status updates are captured without manual chasing.'
    },
    {
      title: 'Live performance dashboards',
      description: 'Spot patterns across the team before they become coaching problems.'
    }
  ];

  readonly coachHandles: ListItem[] = [
    {
      title: 'Vision and direction',
      description: 'Define standards, priorities, and what winning looks like for the team.'
    },
    {
      title: 'High-stakes 1-on-1s',
      description: 'Step in for tough conversations, strategic pivots, and confidence resets.'
    },
    {
      title: 'Culture and accountability',
      description: 'Shape the tone, the values, and the edge your AI coach is reinforcing.'
    },
    {
      title: 'Human judgment',
      description: 'Handle nuance, emotion, and leadership decisions that should stay human.'
    }
  ];

  readonly features: FeatureItem[] = [
    {
      eyebrow: 'Voice Match',
      title: 'Build your AI coach',
      description: 'Input your coaching philosophy, tone, and standards so the system sounds like your program.'
    },
    {
      eyebrow: 'Reminder OS',
      title: 'Custom reminder rules',
      description: 'Trigger follow-ups by inactivity, missed commitments, milestone timing, or custom thresholds.'
    },
    {
      eyebrow: 'Broadcasts',
      title: 'Team-wide announcements',
      description: 'Send one message to the whole team while AI follows up with each person individually.'
    },
    {
      eyebrow: 'Visibility',
      title: 'Progress dashboard',
      description: 'See momentum, risk, and consistency across the team without digging through separate chats.'
    },
    {
      eyebrow: 'Detail',
      title: 'Goal-level history',
      description: 'Review each member’s commitments, streaks, friction points, and pattern shifts over time.'
    },
    {
      eyebrow: 'Escalation',
      title: 'Smart alerts for coaches',
      description: 'Get notified only when a teammate is drifting, blocked, or needs a real human intervention.'
    }
  ];

  readonly steps: ListItem[] = [
    {
      title: 'Create',
      description: 'Launch your team page and brand it around your coaching offer.'
    },
    {
      title: 'Configure',
      description: 'Set the tone, accountability rhythm, and the guardrails your AI should follow.'
    },
    {
      title: 'Invite',
      description: 'Bring in team members and have them define their current goals and commitments.'
    },
    {
      title: 'Coach',
      description: 'Use the dashboard for signal while AI handles the daily repetition underneath.'
    }
  ];

  readonly nudgeSequence = [
    {
      title: 'Team broadcast',
      description: '09:00 AM',
      message: 'Final 48 hours for Q3 targets. Let’s show the board what this team is made of.'
    },
    {
      title: 'AI follow-up',
      description: '10:15 AM',
      message: 'Hey Sarah, noticed the design phase stalled. Want me to queue a 10-minute unblock with the lead?'
    },
    {
      title: 'AI follow-up',
      description: '11:00 AM',
      message: 'James, strong push on the documentation. One more step gets this goal back to green.'
    }
  ];

  toggleDarkMode(): void {
    this.themeService.toggleDarkMode();
  }

  ngOnInit(): void {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
}

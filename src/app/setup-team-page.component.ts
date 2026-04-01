import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AuthService } from './auth.service';
import { TeamLaunchService, PendingTeamCreationDraft, PendingTeamCoachDraft, PendingTeamCoachSource } from './team-launch.service';
import { CoachCatalogService } from './coach-catalog.service';
import { CommunityCoach, CommunityCoachService } from './community-coach.service';
import { PrebuiltTemplate } from './coach-catalog.data';
import { RocketGoalsAIService } from './rocket-goals-ai.service';
import { ThemeService } from './theme.service';
import {
  buildCoachPersonalityRefinementPrompt,
  buildFallbackCoachPersonality,
  COACH_CATEGORIES,
  DEFAULT_COACH_PHILOSOPHY,
  normalizeCoachPersonality
} from './coach-builder.util';

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

interface TeamCoachSelectionView {
  source: PendingTeamCoachSource;
  title: string;
  subtitle: string;
  description: string;
  avatarUrl?: string;
  uploadedAvatarDataUrl?: string;
  settings: PendingTeamCoachDraft;
}

@Component({
  selector: 'app-setup-team-page',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
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
            <button
              type="button"
              (click)="openTeamSetupModal()"
              class="inline-flex rounded-full bg-black px-4 py-2 text-sm font-bold text-white shadow-lg transition hover:bg-red-600">
              {{ isLoggedIn() ? 'Create Team Page' : 'Start Free' }}
            </button>
          </div>
        </div>
      </header>

      <main>
        @if (pageError()) {
          <div class="container mx-auto px-6 pt-6">
            <div class="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
              {{ pageError() }}
            </div>
          </div>
        }

        @if (pageNotice()) {
          <div class="container mx-auto px-6 pt-6">
            <div class="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-semibold text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
              {{ pageNotice() }}
            </div>
          </div>
        }

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
                  <button
                    type="button"
                    (click)="openTeamSetupModal()"
                    class="inline-flex items-center justify-center rounded-full bg-white px-8 py-4 text-base font-black text-black shadow-[0_18px_45px_rgba(255,255,255,0.16)] transition hover:-translate-y-0.5 hover:bg-red-500 hover:text-white">
                    Create Your Team Page
                  </button>
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
                  <button
                    type="button"
                    (click)="openTeamSetupModal()"
                    class="inline-flex items-center justify-center rounded-full bg-black px-8 py-4 text-base font-black text-white shadow-[0_18px_45px_rgba(15,23,42,0.14)] transition hover:-translate-y-0.5 hover:bg-red-500">
                    Create Your Team Page
                  </button>
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
              <div class="relative overflow-hidden bg-red-600 px-8 py-10 text-white sm:px-12 sm:py-14">
                <div class="pointer-events-none absolute right-0 top-0 h-40 w-40 translate-x-10 -translate-y-10 rounded-full bg-white/12 blur-3xl"></div>
                <div class="pointer-events-none absolute bottom-0 left-0 h-32 w-32 -translate-x-8 translate-y-8 rounded-full bg-black/10 blur-3xl"></div>
                <div class="relative flex items-start gap-5">
                  <div class="relative h-20 w-20 flex-none">
                    <div class="absolute inset-0 rounded-[1.75rem] bg-white/25 blur-xl"></div>
                    <img
                      src="/assets/robot.jpg"
                      alt="AI coach"
                      class="relative h-full w-full rounded-[1.75rem] border border-white/25 object-cover shadow-[0_20px_45px_rgba(0,0,0,0.28)]" />
                    <div class="absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center rounded-2xl border border-white/25 bg-black/70 text-white shadow-lg backdrop-blur-md">
                      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <rect x="7" y="8" width="10" height="8" rx="2" stroke-width="2"></rect>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v2M5 10H4m16 0h-1M9.5 12h.01M14.5 12h.01M10 14h4" />
                      </svg>
                    </div>
                  </div>
                  <div class="relative">
                    <span class="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-red-50">AI handles</span>
                    <h2 class="mt-4 text-4xl font-black tracking-tight sm:text-5xl">The repetition</h2>
                  </div>
                </div>
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

              <div class="relative overflow-hidden bg-slate-50 px-8 py-10 text-black dark:bg-slate-900 sm:px-12 sm:py-14 dark:text-white">
                <div class="pointer-events-none absolute right-0 top-0 h-40 w-40 translate-x-10 -translate-y-10 rounded-full bg-red-500/10 blur-3xl dark:bg-red-400/10"></div>
                <div class="pointer-events-none absolute bottom-0 left-0 h-32 w-32 -translate-x-8 translate-y-8 rounded-full bg-black/5 blur-3xl dark:bg-white/5"></div>
                <div class="relative flex items-start gap-5">
                  <div class="relative h-20 w-20 flex-none">
                    <div class="absolute inset-0 rounded-[1.75rem] bg-red-500/20 blur-xl dark:bg-red-400/15"></div>
                    <img
                      src="/assets/sarah-jenkins.jpg"
                      alt="Human coach"
                      class="relative h-full w-full rounded-[1.75rem] border border-red-200/80 object-cover shadow-[0_20px_45px_rgba(239,68,68,0.16)] dark:border-red-500/20" />
                    <div class="absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center rounded-2xl border border-red-200 bg-white text-red-600 shadow-lg dark:border-red-500/20 dark:bg-slate-950 dark:text-red-300">
                      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm-8 12a5 5 0 0 1 10 0" />
                      </svg>
                    </div>
                  </div>
                  <div class="relative">
                    <span class="inline-flex items-center rounded-full border border-red-200 bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-red-600 shadow-sm dark:border-red-500/20 dark:bg-slate-950/80 dark:text-red-300">You handle</span>
                    <h2 class="mt-4 text-4xl font-black tracking-tight sm:text-5xl">The coaching</h2>
                  </div>
                </div>
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
                <button
                  type="button"
                  (click)="openTeamSetupModal()"
                  class="inline-flex items-center justify-center rounded-full bg-red-600 px-8 py-4 text-base font-black text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-black">
                  {{ isLoggedIn() ? 'Create Team Page' : 'Get Started' }}
                </button>
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

        @if (showCreateTeamModal()) {
          <div class="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-md">
            <div
              class="w-full max-w-5xl overflow-hidden rounded-3xl border border-white/50 bg-white shadow-2xl dark:border-white/10 dark:bg-slate-900">
              <div class="flex items-start justify-between gap-4 border-b border-black/10 px-6 py-5 dark:border-white/10">
                <div>
                  <p class="mb-1 text-xs font-bold uppercase tracking-[0.22em] text-red-500">Team Mission</p>
                  <h3 class="text-2xl font-black text-black dark:text-white">
                    {{ teamSetupStep() === 1 ? 'Create Team' : 'Finish your setup' }}
                  </h3>
                  <p class="mt-1 text-sm text-gray-600 dark:text-slate-300">
                    {{
                      teamSetupStep() === 1
                        ? 'Define the team, assign its AI coach, and launch the page in one flow.'
                        : 'Your team draft is ready. Sign in or create your account to launch it.'
                    }}
                  </p>
                </div>
                <button
                  type="button"
                  class="h-10 w-10 rounded-full border border-black/10 text-gray-500 transition-all hover:border-red-400 hover:text-red-600 dark:border-white/15 dark:text-slate-300 dark:hover:border-red-400/60 dark:hover:text-red-300"
                  (click)="closeTeamSetupModal()"
                  [disabled]="creatingTeam()">
                  <svg class="mx-auto h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div class="max-h-[75vh] space-y-6 overflow-y-auto px-6 py-5">
                @if (teamSetupStep() === 1) {
                  <section class="space-y-4">
                    <div class="flex items-center gap-3">
                      <div class="flex h-8 w-8 items-center justify-center rounded-full bg-black text-sm font-black text-white dark:bg-white dark:text-black">1</div>
                      <div>
                        <h4 class="text-lg font-black text-black dark:text-white">Team basics</h4>
                        <p class="text-sm text-gray-500 dark:text-slate-400">Name the team and define what everyone is here to accomplish.</p>
                      </div>
                    </div>

                    <div class="max-w-3xl space-y-4">
                      <div>
                        <label class="mb-1 block text-sm font-semibold text-gray-700 dark:text-slate-200">Team name</label>
                        <input
                          type="text"
                          class="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-black placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 dark:border-white/15 dark:bg-slate-950/70 dark:text-white dark:placeholder-slate-500"
                          [ngModel]="teamName"
                          (ngModelChange)="teamName = $event"
                          placeholder="e.g. MS Bike - Team Walksalot"
                          maxlength="80" />
                      </div>

                      <div>
                        <label class="mb-1 block text-sm font-semibold text-gray-700 dark:text-slate-200">Coach/Team Lead name (Human in charge)</label>
                        <input
                          type="text"
                          class="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-black placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 dark:border-white/15 dark:bg-slate-950/70 dark:text-white dark:placeholder-slate-500"
                          [ngModel]="coachTeamLeadName"
                          (ngModelChange)="coachTeamLeadName = $event"
                          placeholder="e.g. Marcus Rivera"
                          maxlength="80" />
                      </div>

                      <div>
                        <label class="mb-1 block text-sm font-semibold text-gray-700 dark:text-slate-200">Description</label>
                        <textarea
                          class="w-full resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm text-black placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 dark:border-white/15 dark:bg-slate-950/70 dark:text-white dark:placeholder-slate-500"
                          [ngModel]="teamDescription"
                          (ngModelChange)="teamDescription = $event"
                          rows="4"
                          placeholder="What is the shared mission, sprint, or outcome this team is driving?"></textarea>
                      </div>
                    </div>
                  </section>

                  <section class="space-y-4">
                    <div class="flex items-center gap-3">
                      <div class="flex h-8 w-8 items-center justify-center rounded-full bg-black text-sm font-black text-white dark:bg-white dark:text-black">2</div>
                      <div>
                        <h4 class="text-lg font-black text-black dark:text-white">Choose an AI coach or Create your own</h4>
                        <p class="text-sm text-gray-500 dark:text-slate-400">Use a Rocket Coach, one of your saved/community coaches, build one here, or skip this for now.</p>
                      </div>
                    </div>

                    <div class="flex flex-wrap gap-2">
                      <button type="button" class="rounded-full border px-4 py-2 text-sm font-bold transition-all"
                        [class]="teamCoachBrowseMode() === 'prebuilt'
                          ? 'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black'
                          : 'border-black/10 text-black hover:border-red-500 hover:text-red-600 dark:border-white/15 dark:text-white dark:hover:border-red-400 dark:hover:text-red-300'"
                        (click)="setTeamCoachBrowseMode('prebuilt')">
                        Rocket Coaches
                      </button>
                      <button type="button" class="rounded-full border px-4 py-2 text-sm font-bold transition-all"
                        [class]="teamCoachBrowseMode() === 'community'
                          ? 'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black'
                          : 'border-black/10 text-black hover:border-red-500 hover:text-red-600 dark:border-white/15 dark:text-white dark:hover:border-red-400 dark:hover:text-red-300'"
                        (click)="setTeamCoachBrowseMode('community')">
                        My & Community Coaches
                      </button>
                      <button type="button" class="rounded-full border px-4 py-2 text-sm font-bold transition-all"
                        [class]="teamCoachBrowseMode() === 'custom'
                          ? 'border-black bg-black text-white dark:border-white dark:bg-white dark:text-black'
                          : 'border-black/10 text-black hover:border-red-500 hover:text-red-600 dark:border-white/15 dark:text-white dark:hover:border-red-400 dark:hover:text-red-300'"
                        (click)="setTeamCoachBrowseMode('custom')">
                        Create Custom Coach
                      </button>
                    </div>

                    @if (teamSetupLoading()) {
                      <div class="flex items-center gap-3 rounded-2xl border border-black/10 bg-black/[0.02] p-5 dark:border-white/10 dark:bg-white/[0.02]">
                        <span class="inline-block h-5 w-5 animate-spin rounded-full border-2 border-red-200 border-t-red-600 dark:border-red-500/30 dark:border-t-red-300"></span>
                        <p class="text-sm font-semibold text-gray-700 dark:text-slate-200">Loading coach library...</p>
                      </div>
                    } @else {
                      @if (teamCoachBrowseMode() === 'prebuilt') {
                        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                          @for (template of prebuiltTeamCoaches(); track template.id) {
                            <button type="button"
                              class="overflow-hidden rounded-3xl border text-left transition-all group"
                              [class]="isPrebuiltCoachSelected(template.id)
                                ? 'border-red-500 shadow-[0_18px_50px_rgba(220,38,38,0.18)]'
                                : 'border-black/10 hover:border-red-400 dark:border-white/10 dark:hover:border-red-400/60'"
                              (click)="selectPrebuiltCoach(template)">
                              <div class="relative h-40 overflow-hidden">
                                <img [src]="template.imageUrl" [alt]="template.name" class="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                <div class="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent"></div>
                                <div class="absolute left-4 top-4 flex items-center gap-3 rounded-full bg-white/95 px-3 py-2 shadow-lg">
                                  <img [src]="template.coPilotAvatar" [alt]="template.coPilotName" class="h-10 w-10 rounded-full border border-red-100 object-cover" />
                                  <div class="min-w-0">
                                    <p class="text-[10px] font-black uppercase tracking-[0.18em] text-red-600">AI Coach</p>
                                    <p class="truncate text-sm font-bold text-black">{{ template.coPilotName }}</p>
                                  </div>
                                </div>
                                <div class="absolute right-4 top-4 rounded-full bg-black/65 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white">{{ template.category }}</div>
                              </div>
                              <div class="bg-white p-5 dark:bg-slate-900">
                                <div class="flex items-start justify-between gap-3">
                                  <div>
                                    <h5 class="text-lg font-black text-black dark:text-white">{{ template.name }}</h5>
                                    <p class="mt-1 text-sm text-gray-600 dark:text-slate-300">{{ template.tagline }}</p>
                                  </div>
                                  @if (isPrebuiltCoachSelected(template.id)) {
                                    <span class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
                                      <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                                      </svg>
                                    </span>
                                  }
                                </div>
                              </div>
                            </button>
                          }
                        </div>
                      }

                      @if (teamCoachBrowseMode() === 'community') {
                        @if (communityTeamCoaches().length > 0) {
                          <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            @for (coach of communityTeamCoaches(); track coach.id) {
                              <button type="button"
                                class="rounded-3xl border p-5 text-left transition-all"
                                [class]="isCommunityCoachSelected(coach.id)
                                  ? 'border-red-500 shadow-[0_18px_50px_rgba(220,38,38,0.18)]'
                                  : 'border-black/10 hover:border-red-400 dark:border-white/10 dark:hover:border-red-400/60'"
                                (click)="selectCommunityCoach(coach)">
                                <div class="flex items-start gap-4">
                                  @if (coach.avatar) {
                                    <img [src]="coach.avatar" [alt]="coach.coachName" class="h-14 w-14 rounded-2xl border border-black/10 object-cover dark:border-white/10" />
                                  } @else {
                                    <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-red-500 to-orange-500 text-2xl text-white">{{ coach.icon }}</div>
                                  }
                                  <div class="min-w-0 flex-1">
                                    <div class="flex items-center justify-between gap-3">
                                      <p class="truncate text-lg font-black text-black dark:text-white">{{ coach.appName }}</p>
                                      @if (isCommunityCoachSelected(coach.id)) {
                                        <span class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-600 text-white">
                                          <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                                          </svg>
                                        </span>
                                      }
                                    </div>
                                    <p class="mt-1 text-sm font-semibold text-red-600 dark:text-red-300">{{ coach.coachName }}</p>
                                    <p class="mt-2 line-clamp-3 text-sm text-gray-600 dark:text-slate-300">{{ coach.tagline || coach.description }}</p>
                                  </div>
                                </div>
                              </button>
                            }
                          </div>
                        } @else {
                          <div class="rounded-2xl border border-dashed border-black/15 p-6 text-center dark:border-white/15">
                            <p class="text-base font-bold text-black dark:text-white">No saved community coaches yet.</p>
                            <p class="mt-2 text-sm text-gray-500 dark:text-slate-400">Use Rocket Coaches above or create a custom one here.</p>
                          </div>
                        }
                      }

                      @if (teamCoachBrowseMode() === 'custom') {
                        <div class="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
                          <div class="space-y-4">
                            <div class="rounded-2xl border border-black/10 bg-black/[0.02] p-4 dark:border-white/10 dark:bg-white/[0.02]">
                              <p class="text-sm font-semibold text-black dark:text-white">{{ teamCoachPhilosophyBlurb() }}</p>
                            </div>

                            <div class="rounded-2xl border border-dashed border-black/15 p-4 dark:border-white/15">
                              <div class="flex items-start gap-4">
                                <div class="shrink-0">
                                  @if (customTeamCoachAvatarPreview()) {
                                    <img [src]="customTeamCoachAvatarPreview()" alt="Custom team coach avatar" class="h-24 w-24 rounded-2xl border border-black/10 object-cover dark:border-white/10" />
                                  } @else {
                                    <div class="flex h-24 w-24 items-center justify-center rounded-2xl border-2 border-dashed border-black/15 text-gray-300 dark:border-white/15 dark:text-slate-600">
                                      <svg class="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
                                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                      </svg>
                                    </div>
                                  }
                                </div>

                                <div class="min-w-0 flex-1 space-y-2">
                                  <p class="text-sm font-bold text-black dark:text-white">Coach avatar</p>
                                  <button type="button"
                                    class="w-full rounded-xl bg-black px-4 py-2.5 text-sm font-bold text-white transition-all hover:bg-red-600 disabled:opacity-50 dark:bg-white dark:text-black dark:hover:bg-red-500 dark:hover:text-white"
                                    (click)="generateCustomTeamCoachAvatar()"
                                    [disabled]="customTeamCoachGeneratingAvatar()">
                                    {{ customTeamCoachGeneratingAvatar() ? 'Generating...' : 'Generate with AI' }}
                                  </button>

                                  <label class="block w-full cursor-pointer rounded-xl border border-black/10 px-4 py-2.5 text-center text-sm font-bold transition-all hover:border-red-500 hover:text-red-600 dark:border-white/15 dark:text-white dark:hover:border-red-400 dark:hover:text-red-300">
                                    Upload Image
                                    <input type="file" accept="image/*" class="hidden" (change)="onCustomTeamCoachAvatarSelected($event)" />
                                  </label>

                                  @if (customTeamCoachAvatarPreview()) {
                                    <button type="button"
                                      class="text-xs font-semibold text-gray-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-300"
                                      (click)="clearCustomTeamCoachAvatar()">
                                      Remove avatar
                                    </button>
                                  }
                                </div>
                              </div>
                            </div>
                          </div>

                          <div class="space-y-4">
                            <div>
                              <label class="mb-1 block text-sm font-semibold text-gray-700 dark:text-slate-200">Coach name</label>
                              <input type="text"
                                class="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-black placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 dark:border-white/15 dark:bg-slate-950/70 dark:text-white dark:placeholder-slate-500"
                                [ngModel]="customTeamCoachName()"
                                (ngModelChange)="updateCustomTeamCoachName($event)"
                                placeholder="e.g. Coach Tessa, Sprint Captain, Dr. Rivera"
                                maxlength="60" />
                            </div>

                            <div>
                              <label class="mb-1 block text-sm font-semibold text-gray-700 dark:text-slate-200">Category</label>
                              <select
                                class="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm text-black focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 dark:border-white/15 dark:bg-slate-950/70 dark:text-white"
                                [ngModel]="customTeamCoachCategory()"
                                (ngModelChange)="updateCustomTeamCoachCategory($event)">
                                @for (category of teamCoachCategories; track category) {
                                  <option [value]="category">{{ category }}</option>
                                }
                              </select>
                            </div>

                            <div>
                              <div class="mb-1 flex items-center justify-between gap-3">
                                <label class="block text-sm font-semibold text-gray-700 dark:text-slate-200">Coaching personality</label>
                                <button type="button"
                                  class="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-red-600 to-orange-500 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-white shadow-lg shadow-red-600/20 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-red-600/30 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none dark:from-red-500 dark:to-orange-400"
                                  (click)="refineCustomTeamCoachPersonality()"
                                  [disabled]="!customTeamCoachPersonality().trim() || customTeamCoachRefining()">
                                  @if (customTeamCoachRefining()) {
                                    <span class="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/35 border-t-white"></span>
                                    Refining...
                                  } @else {
                                    <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 3 4 14h6l-1 7 9-11h-6l1-7Z" />
                                    </svg>
                                    Refine with AI
                                  }
                                </button>
                              </div>
                              <textarea
                                class="w-full resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm text-black placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 dark:border-white/15 dark:bg-slate-950/70 dark:text-white dark:placeholder-slate-500"
                                [ngModel]="customTeamCoachPersonality()"
                                (ngModelChange)="updateCustomTeamCoachPersonality($event)"
                                rows="6"
                                placeholder="Describe the tone, expertise, accountability style, and how this coach should push the team forward."></textarea>
                            </div>
                          </div>
                        </div>
                      }
                    }

                    @if (teamSetupError()) {
                      <div class="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                        {{ teamSetupError() }}
                      </div>
                    }

                    @if (selectedTeamCoach(); as chosenCoach) {
                      <div class="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 dark:border-emerald-500/20 dark:bg-emerald-500/10">
                        <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                          <div class="flex min-w-0 items-center gap-4">
                            @if (chosenCoach.avatarUrl) {
                              <img [src]="chosenCoach.avatarUrl" [alt]="chosenCoach.settings.displayName" class="h-16 w-16 rounded-2xl border border-emerald-200 object-cover dark:border-emerald-500/20" />
                            } @else {
                              <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-600 text-xl font-black text-white">
                                {{ chosenCoach.settings.displayName.charAt(0) }}
                              </div>
                            }
                            <div class="min-w-0">
                              <p class="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-700 dark:text-emerald-300">{{ teamCoachSelectionLabel(chosenCoach.source) }}</p>
                              <h5 class="truncate text-lg font-black text-black dark:text-white">{{ chosenCoach.title }}</h5>
                              <p class="truncate text-sm font-semibold text-gray-700 dark:text-slate-200">{{ chosenCoach.subtitle }}</p>
                              <p class="mt-1 line-clamp-2 text-sm text-gray-600 dark:text-slate-300">{{ chosenCoach.description }}</p>
                            </div>
                          </div>
                          <div class="rounded-full bg-white px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-emerald-700 shadow-sm dark:bg-slate-950/70 dark:text-emerald-300">
                            Coach assigned
                          </div>
                        </div>
                      </div>
                    }
                  </section>

                  <section class="space-y-4">
                    <div class="flex items-center gap-3">
                      <div class="flex h-8 w-8 items-center justify-center rounded-full bg-black text-sm font-black text-white dark:bg-white dark:text-black">3</div>
                      <div>
                        <h4 class="text-lg font-black text-black dark:text-white">Invite teammates</h4>
                        <p class="text-sm text-gray-500 dark:text-slate-400">Optional for now. You can add more people later from the team page.</p>
                      </div>
                    </div>

                    <div>
                      <label class="mb-1 block text-sm font-semibold text-gray-700 dark:text-slate-200">Invite teammates</label>
                      @if (inviteEmails().length > 0) {
                        <div class="mb-3 flex flex-wrap gap-2">
                          @for (email of inviteEmails(); track email) {
                            <span class="inline-flex items-center gap-2 rounded-full border border-red-100 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
                              {{ email }}
                              <button type="button"
                                class="text-red-500 hover:text-red-700 dark:text-red-300 dark:hover:text-red-100"
                                (click)="removeInviteEmail(email)">
                                <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </span>
                          }
                        </div>
                      }
                      <div class="flex items-center gap-2">
                        <input type="email"
                          class="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm text-black placeholder-gray-400 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/30 dark:border-white/15 dark:bg-slate-950/70 dark:text-white dark:placeholder-slate-500"
                          [ngModel]="inviteEmail"
                          (ngModelChange)="inviteEmail = $event"
                          (keyup.enter)="addInviteEmail()"
                          placeholder="name@email.com" />
                        <button type="button"
                          class="rounded-xl border border-black/15 px-4 py-3 font-semibold text-black transition-all hover:border-red-500 hover:text-red-600 disabled:opacity-40 dark:border-white/20 dark:text-white dark:hover:border-red-400 dark:hover:text-red-300"
                          (click)="addInviteEmail()"
                          [disabled]="!inviteEmail.trim()">
                          Add
                        </button>
                      </div>
                    </div>
                  </section>
                } @else {
                  <section class="space-y-5">
                    <div class="rounded-3xl border border-black/10 bg-black/[0.02] p-6 dark:border-white/10 dark:bg-white/[0.02]">
                      <p class="text-xs font-black uppercase tracking-[0.24em] text-red-600 dark:text-red-300">Step 2</p>
                      <h4 class="mt-3 text-2xl font-black text-black dark:text-white">Create your account or log in</h4>
                      <p class="mt-3 text-sm leading-relaxed text-gray-600 dark:text-slate-300">
                        We already have your team draft. Authenticate once and we will create your account and launch the team immediately after.
                      </p>
                    </div>

                    @if (selectedTeamCoach(); as chosenCoach) {
                      <div class="rounded-2xl border border-black/10 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-950/70">
                        <div class="grid gap-4 md:grid-cols-2">
                          <div>
                            <p class="text-[11px] font-black uppercase tracking-[0.2em] text-gray-500 dark:text-slate-400">Team</p>
                            <h5 class="mt-2 text-xl font-black text-black dark:text-white">{{ teamName }}</h5>
                            @if (coachTeamLeadName.trim()) {
                              <p class="mt-2 text-sm font-semibold text-gray-700 dark:text-slate-200">Coach/Team Lead: {{ coachTeamLeadName }}</p>
                            }
                            <p class="mt-2 text-sm text-gray-600 dark:text-slate-300">{{ teamDescription || 'No team description yet.' }}</p>
                          </div>
                          <div>
                            <p class="text-[11px] font-black uppercase tracking-[0.2em] text-gray-500 dark:text-slate-400">AI coach</p>
                            <h5 class="mt-2 text-xl font-black text-black dark:text-white">{{ chosenCoach.subtitle }}</h5>
                            <p class="mt-2 text-sm text-gray-600 dark:text-slate-300">{{ chosenCoach.title }}</p>
                            @if (inviteEmails().length > 0) {
                              <p class="mt-2 text-sm text-gray-500 dark:text-slate-400">{{ inviteEmails().length }} teammate{{ inviteEmails().length === 1 ? '' : 's' }} queued for invite.</p>
                            }
                          </div>
                        </div>
                      </div>
                    }

                    <div class="grid gap-3 sm:grid-cols-2">
                      <button type="button"
                        class="inline-flex items-center justify-center rounded-2xl bg-black px-5 py-4 text-base font-black text-white transition hover:bg-red-600 dark:bg-white dark:text-black dark:hover:bg-red-500 dark:hover:text-white"
                        (click)="continueToAuth('signup')">
                        Create account and launch team
                      </button>
                      <button type="button"
                        class="inline-flex items-center justify-center rounded-2xl border border-black/10 px-5 py-4 text-base font-black text-black transition hover:border-black hover:bg-black hover:text-white dark:border-white/15 dark:text-white dark:hover:border-white dark:hover:bg-white dark:hover:text-black"
                        (click)="continueToAuth('login')">
                        Log in and launch team
                      </button>
                    </div>

                    <button type="button"
                      class="text-sm font-semibold text-gray-500 transition hover:text-red-600 dark:text-slate-400 dark:hover:text-red-300"
                      (click)="backToTeamDetails()">
                      Back to team details
                    </button>
                  </section>
                }
              </div>

              <div class="flex items-center justify-end gap-3 border-t border-black/10 px-6 py-4 dark:border-white/10">
                <button
                  type="button"
                  class="px-4 py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:text-gray-900 dark:text-slate-300 dark:hover:text-white"
                  (click)="closeTeamSetupModal()"
                  [disabled]="creatingTeam()">
                  Cancel
                </button>
                @if (teamSetupStep() === 1) {
                  <button
                    type="button"
                    class="inline-flex items-center gap-2 rounded-xl bg-black px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-red-600 disabled:opacity-50 disabled:hover:bg-black"
                    (click)="continueTeamSetup()"
                    [disabled]="teamSetupLoading() || creatingTeam()">
                    @if (creatingTeam()) {
                      <span class="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"></span>
                    }
                    {{
                      creatingTeam()
                        ? 'Creating team...'
                        : isLoggedIn()
                          ? 'Create team'
                          : 'Continue'
                    }}
                  </button>
                }
              </div>
            </div>
          </div>
        }
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
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly authService = inject(AuthService);
  private readonly themeService = inject(ThemeService);
  private readonly teamLaunchService = inject(TeamLaunchService);
  private readonly coachCatalogService = inject(CoachCatalogService);
  private readonly communityCoachService = inject(CommunityCoachService);
  private readonly aiService = inject(RocketGoalsAIService);
  protected readonly isDarkMode = this.themeService.isDarkMode;
  protected readonly isLoggedIn = computed(() => !!this.authService.profile()?.userId);
  protected readonly showCreateTeamModal = signal(false);
  protected readonly teamSetupStep = signal<1 | 2>(1);
  protected readonly teamSetupLoading = signal(false);
  protected readonly creatingTeam = signal(false);
  protected readonly pageNotice = signal<string | null>(null);
  protected readonly pageError = signal<string | null>(null);
  protected readonly teamSetupError = signal<string | null>(null);
  protected teamName = '';
  protected coachTeamLeadName = '';
  protected teamDescription = '';
  protected inviteEmail = '';
  protected readonly inviteEmails = signal<string[]>([]);
  protected readonly teamCoachBrowseMode = signal<PendingTeamCoachSource>('prebuilt');
  protected readonly teamCoachSelectionSource = signal<PendingTeamCoachSource | null>(null);
  protected readonly selectedPrebuiltCoachId = signal<string | null>(null);
  protected readonly selectedCommunityCoachId = signal<string | null>(null);
  protected readonly prebuiltTeamCoaches = signal<PrebuiltTemplate[]>([]);
  protected readonly communityTeamCoaches = signal<CommunityCoach[]>([]);
  protected readonly customTeamCoachName = signal('');
  protected readonly customTeamCoachPersonality = signal('');
  protected readonly customTeamCoachCategory = signal<string>('Custom');
  protected readonly customTeamCoachAvatarPreview = signal<string | null>(null);
  protected readonly customTeamCoachGeneratingAvatar = signal(false);
  protected readonly customTeamCoachRefining = signal(false);
  protected readonly teamCoachCategories = [...COACH_CATEGORIES];
  protected readonly teamCoachPhilosophyBlurb = signal(DEFAULT_COACH_PHILOSOPHY);
  private customTeamCoachUploadedAvatarDataUrl: string | null = null;

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
    },
    {
      title: 'Growth mindset nudges',
      description: 'The system reframes setbacks as experiments and reminds teammates that skill grows with effort.'
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
    },
    {
      title: 'Belief and identity',
      description: 'Help people believe they can grow, and turn setbacks into meaning, confidence, and ownership.'
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

  private resetCoachDraft(): void {
    this.teamCoachBrowseMode.set('prebuilt');
    this.teamCoachSelectionSource.set(null);
    this.selectedPrebuiltCoachId.set(null);
    this.selectedCommunityCoachId.set(null);
    this.customTeamCoachName.set('');
    this.customTeamCoachPersonality.set('');
    this.customTeamCoachCategory.set('Custom');
    this.customTeamCoachAvatarPreview.set(null);
    this.customTeamCoachGeneratingAvatar.set(false);
    this.customTeamCoachRefining.set(false);
    this.customTeamCoachUploadedAvatarDataUrl = null;
  }

  private resetTeamSetupState(): void {
    this.teamSetupStep.set(1);
    this.teamSetupError.set(null);
    this.teamName = '';
    this.coachTeamLeadName = '';
    this.teamDescription = '';
    this.inviteEmail = '';
    this.inviteEmails.set([]);
    this.resetCoachDraft();
  }

  private async loadCoachOptions(): Promise<void> {
    this.teamSetupLoading.set(true);
    try {
      const [prebuilt, community] = await Promise.all([
        this.coachCatalogService.getPrebuiltTemplates(),
        this.coachCatalogService.getAvailableCommunityCoaches(this.authService.profile()?.userId)
      ]);
      this.prebuiltTeamCoaches.set(prebuilt);
      this.communityTeamCoaches.set(community);
    } catch (error) {
      console.error('Failed to load setup-team coach options:', error);
      this.teamSetupError.set('Coach library is temporarily unavailable. Please try again.');
    } finally {
      this.teamSetupLoading.set(false);
    }
  }

  openTeamSetupModal(): void {
    this.pageNotice.set(null);
    this.pageError.set(null);
    this.resetTeamSetupState();
    this.showCreateTeamModal.set(true);
    void this.loadCoachOptions();
  }

  closeTeamSetupModal(): void {
    this.showCreateTeamModal.set(false);
    this.resetTeamSetupState();
  }

  setTeamCoachBrowseMode(mode: PendingTeamCoachSource): void {
    this.teamCoachBrowseMode.set(mode);
    if (mode === 'custom') {
      this.teamCoachSelectionSource.set('custom');
      this.teamSetupError.set(null);
    }
  }

  selectPrebuiltCoach(template: PrebuiltTemplate): void {
    this.teamCoachBrowseMode.set('prebuilt');
    this.teamCoachSelectionSource.set('prebuilt');
    this.selectedPrebuiltCoachId.set(template.id);
    this.selectedCommunityCoachId.set(null);
    this.teamSetupError.set(null);
  }

  selectCommunityCoach(coach: CommunityCoach): void {
    this.teamCoachBrowseMode.set('community');
    this.teamCoachSelectionSource.set('community');
    this.selectedCommunityCoachId.set(coach.id);
    this.selectedPrebuiltCoachId.set(null);
    this.teamSetupError.set(null);
  }

  activateCustomCoachSelection(): void {
    this.teamCoachBrowseMode.set('custom');
    this.teamCoachSelectionSource.set('custom');
    this.selectedPrebuiltCoachId.set(null);
    this.selectedCommunityCoachId.set(null);
    this.teamSetupError.set(null);
  }

  updateCustomTeamCoachName(value: string): void {
    this.customTeamCoachName.set(value);
    this.activateCustomCoachSelection();
  }

  updateCustomTeamCoachPersonality(value: string): void {
    this.customTeamCoachPersonality.set(value);
    this.activateCustomCoachSelection();
  }

  updateCustomTeamCoachCategory(value: string): void {
    this.customTeamCoachCategory.set(value);
    this.activateCustomCoachSelection();
  }

  async refineCustomTeamCoachPersonality(): Promise<void> {
    const seed = this.customTeamCoachPersonality().trim();
    if (!seed) {
      this.teamSetupError.set('Start with a short coach description first.');
      return;
    }

    this.customTeamCoachRefining.set(true);
    this.teamSetupError.set(null);
    this.activateCustomCoachSelection();

    try {
      const response = await this.aiService.callAISilent(
        buildCoachPersonalityRefinementPrompt({
          category: this.customTeamCoachCategory(),
          coachName: this.customTeamCoachName().trim(),
          philosophy: this.teamCoachPhilosophyBlurb(),
          seed
        })
      );
      this.customTeamCoachPersonality.set(normalizeCoachPersonality(response));
    } catch (error) {
      console.warn('Failed to refine setup-team coach personality:', error);
      this.customTeamCoachPersonality.set(
        buildFallbackCoachPersonality({
          seed,
          category: this.customTeamCoachCategory(),
          coachName: this.customTeamCoachName().trim()
        })
      );
    } finally {
      this.customTeamCoachRefining.set(false);
    }
  }

  async generateCustomTeamCoachAvatar(): Promise<void> {
    const coachName = this.customTeamCoachName().trim();
    const coachDescription = this.customTeamCoachPersonality().trim();

    if (!coachName) {
      this.teamSetupError.set('Give your coach a name before generating an avatar.');
      return;
    }
    if (!coachDescription) {
      this.teamSetupError.set('Describe your coach before generating an avatar.');
      return;
    }

    this.customTeamCoachGeneratingAvatar.set(true);
    this.teamSetupError.set(null);
    this.activateCustomCoachSelection();

    try {
      const result = await this.communityCoachService.generateAvatar({
        coachName,
        coachDescription,
        category: this.customTeamCoachCategory()
      });

      if (result.success && result.imageUrl) {
        this.customTeamCoachAvatarPreview.set(result.imageUrl);
        this.customTeamCoachUploadedAvatarDataUrl = null;
      } else {
        this.teamSetupError.set('Could not generate an avatar right now. Upload one instead.');
      }
    } catch (error) {
      console.error('Failed to generate setup-team coach avatar:', error);
      this.teamSetupError.set('Could not generate an avatar right now. Upload one instead.');
    } finally {
      this.customTeamCoachGeneratingAvatar.set(false);
    }
  }

  onCustomTeamCoachAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }
    const maxSizeBytes = this.isLoggedIn() ? 10 * 1024 * 1024 : 2 * 1024 * 1024;
    if (!file.type.startsWith('image/')) {
      this.teamSetupError.set('Please select an image file for your coach avatar.');
      return;
    }
    if (file.size > maxSizeBytes) {
      this.teamSetupError.set(
        this.isLoggedIn()
          ? 'Coach avatar image should stay under 10 MB.'
          : 'Coach avatar image should stay under 2 MB before sign-in so we can carry it through setup.'
      );
      return;
    }

    this.teamSetupError.set(null);
    this.activateCustomCoachSelection();
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      this.customTeamCoachAvatarPreview.set(dataUrl);
      this.customTeamCoachUploadedAvatarDataUrl = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  clearCustomTeamCoachAvatar(): void {
    this.customTeamCoachAvatarPreview.set(null);
    this.customTeamCoachUploadedAvatarDataUrl = null;
    this.activateCustomCoachSelection();
  }

  private hasPartialCustomCoachDraft(): boolean {
    return !!this.customTeamCoachName().trim()
      || !!this.customTeamCoachPersonality().trim()
      || !!this.customTeamCoachAvatarPreview()
      || !!this.customTeamCoachUploadedAvatarDataUrl
      || this.customTeamCoachCategory() !== 'Custom';
  }

  addInviteEmail(): void {
    const email = this.inviteEmail.trim().toLowerCase();
    if (email && email.includes('@') && !this.inviteEmails().includes(email)) {
      this.inviteEmails.update(list => [...list, email]);
      this.inviteEmail = '';
    }
  }

  removeInviteEmail(email: string): void {
    this.inviteEmails.update(list => list.filter(candidate => candidate !== email));
  }

  private getSelectedPrebuiltCoach(): PrebuiltTemplate | null {
    const id = this.selectedPrebuiltCoachId();
    if (!id) return null;
    return this.prebuiltTeamCoaches().find(template => template.id === id) || null;
  }

  private getSelectedCommunityCoach(): CommunityCoach | null {
    const id = this.selectedCommunityCoachId();
    if (!id) return null;
    return this.communityTeamCoaches().find(coach => coach.id === id) || null;
  }

  selectedTeamCoach(): TeamCoachSelectionView | null {
    const source = this.teamCoachSelectionSource();

    if (source === 'prebuilt') {
      const template = this.getSelectedPrebuiltCoach();
      if (!template) return null;
      const settings: PendingTeamCoachDraft = {
        source,
        displayName: template.coPilotName,
        personality: `${template.coPilotName} is the dedicated AI coach for ${template.name}. ${template.description}`,
        avatarUrl: template.coPilotAvatar,
        title: template.name,
        subtitle: `AI Coach: ${template.coPilotName}`,
        description: template.tagline
      };
      return {
        source,
        title: settings.title,
        subtitle: settings.subtitle,
        description: settings.description,
        avatarUrl: settings.avatarUrl,
        settings
      };
    }

    if (source === 'community') {
      const coach = this.getSelectedCommunityCoach();
      if (!coach) return null;
      const settings: PendingTeamCoachDraft = {
        source,
        displayName: coach.coachName,
        personality: (coach.soulFilet || coach.description || coach.tagline || '').trim(),
        ...(coach.avatar ? { avatarUrl: coach.avatar } : {}),
        title: coach.appName,
        subtitle: `AI Coach: ${coach.coachName}`,
        description: coach.tagline || coach.description
      };
      return {
        source,
        title: settings.title,
        subtitle: settings.subtitle,
        description: settings.description,
        avatarUrl: settings.avatarUrl,
        settings
      };
    }

    if (source === 'custom') {
      const displayName = this.customTeamCoachName().trim();
      const personality = this.customTeamCoachPersonality().trim();
      if (!displayName || !personality) {
        return null;
      }
      const settings: PendingTeamCoachDraft = {
        source,
        displayName,
        personality,
        ...(this.customTeamCoachAvatarPreview() && !this.customTeamCoachUploadedAvatarDataUrl
          ? { avatarUrl: this.customTeamCoachAvatarPreview() || undefined }
          : {}),
        ...(this.customTeamCoachUploadedAvatarDataUrl
          ? { uploadedAvatarDataUrl: this.customTeamCoachUploadedAvatarDataUrl }
          : {}),
        title: displayName,
        subtitle: `${this.customTeamCoachCategory()} coach`,
        description: personality
      };
      return {
        source,
        title: settings.title,
        subtitle: settings.subtitle,
        description: settings.description,
        avatarUrl: this.customTeamCoachAvatarPreview() || undefined,
        uploadedAvatarDataUrl: this.customTeamCoachUploadedAvatarDataUrl || undefined,
        settings
      };
    }

    return null;
  }

  isPrebuiltCoachSelected(templateId: string): boolean {
    return this.teamCoachSelectionSource() === 'prebuilt' && this.selectedPrebuiltCoachId() === templateId;
  }

  isCommunityCoachSelected(coachId: string): boolean {
    return this.teamCoachSelectionSource() === 'community' && this.selectedCommunityCoachId() === coachId;
  }

  teamCoachSelectionLabel(source: PendingTeamCoachSource): string {
    if (source === 'prebuilt') return 'Rocket Coach';
    if (source === 'community') return 'Community coach';
    return 'Custom coach';
  }

  private validateDraft(): string | null {
    if (!this.teamName.trim()) {
      return 'Enter your team name.';
    }

    const selection = this.selectedTeamCoach();
    if (!selection && this.teamCoachSelectionSource() === 'custom' && this.hasPartialCustomCoachDraft()) {
      return 'Finish your custom coach details or clear them before creating the team.';
    }

    if (selection?.source === 'custom') {
      if (selection.settings.displayName.length > 60) {
        return 'Coach name should stay under 60 characters.';
      }
      if (selection.settings.personality.length > 12000) {
        return 'Coach personality should stay under 12,000 characters.';
      }
    }

    return null;
  }

  private buildPendingDraft(): PendingTeamCreationDraft | null {
    const selection = this.selectedTeamCoach();
    return {
      teamName: this.teamName.trim(),
      coachTeamLeadName: this.coachTeamLeadName.trim(),
      teamDescription: this.teamDescription.trim(),
      inviteEmails: this.inviteEmails(),
      ...(selection ? { coach: selection.settings } : {})
    };
  }

  private hydrateDraft(draft: PendingTeamCreationDraft): void {
    this.teamName = draft.teamName;
    this.coachTeamLeadName = draft.coachTeamLeadName || '';
    this.teamDescription = draft.teamDescription;
    this.inviteEmail = '';
    this.inviteEmails.set(draft.inviteEmails || []);
    if (!draft.coach) {
      this.resetCoachDraft();
      return;
    }
    this.teamCoachSelectionSource.set('custom');
    this.teamCoachBrowseMode.set('custom');
    this.selectedPrebuiltCoachId.set(null);
    this.selectedCommunityCoachId.set(null);
    this.customTeamCoachName.set(draft.coach.displayName);
    this.customTeamCoachPersonality.set(draft.coach.personality);
    this.customTeamCoachCategory.set('Custom');
    this.customTeamCoachAvatarPreview.set(draft.coach.uploadedAvatarDataUrl || draft.coach.avatarUrl || null);
    this.customTeamCoachUploadedAvatarDataUrl = draft.coach.uploadedAvatarDataUrl || null;
  }

  async continueTeamSetup(): Promise<void> {
    const validationError = this.validateDraft();
    if (validationError) {
      this.teamSetupError.set(validationError);
      return;
    }

    const draft = this.buildPendingDraft();
    if (!draft) {
      this.teamSetupError.set('Could not prepare your team draft. Please try again.');
      return;
    }

    if (this.isLoggedIn()) {
      await this.createTeamFromDraft(draft);
      return;
    }

    this.teamSetupError.set(null);
    this.teamSetupStep.set(2);
  }

  continueToAuth(mode: 'login' | 'signup'): void {
    const validationError = this.validateDraft();
    if (validationError) {
      this.teamSetupError.set(validationError);
      this.teamSetupStep.set(1);
      return;
    }

    const draft = this.buildPendingDraft();
    if (!draft) {
      this.teamSetupError.set('Could not prepare your team draft. Please try again.');
      return;
    }

    this.teamLaunchService.savePendingDraft(draft);
    this.router.navigate([`/${mode}`], {
      queryParams: {
        redirectTo: '/setup-team?completePendingTeam=true'
      }
    });
  }

  backToTeamDetails(): void {
    this.teamSetupStep.set(1);
    this.teamSetupError.set(null);
  }

  private async createTeamFromDraft(draft: PendingTeamCreationDraft): Promise<void> {
    const profile = this.authService.profile();
    if (!profile?.userId || this.creatingTeam()) {
      this.teamSetupError.set('Please log in to create your team.');
      return;
    }

    this.creatingTeam.set(true);
    this.teamSetupError.set(null);
    this.pageError.set(null);
    try {
      const teamId = await this.teamLaunchService.createTeamFromDraft(profile, draft);
      this.teamLaunchService.clearPendingDraft();
      this.closeTeamSetupModal();
      await this.router.navigate(['/team', teamId]);
    } catch (error) {
      console.error('Failed to create team from setup-team page:', error);
      this.pageError.set('Could not create the team right now. Please try again.');
      this.teamSetupError.set('Could not create the team right now. Please try again.');
      this.hydrateDraft(draft);
      this.showCreateTeamModal.set(true);
    } finally {
      this.creatingTeam.set(false);
    }
  }

  private async completePendingTeamAfterAuth(): Promise<void> {
    const pendingDraft = this.teamLaunchService.loadPendingDraft();
    const shouldComplete = this.route.snapshot.queryParamMap.get('completePendingTeam') === 'true';
    if (!shouldComplete || !pendingDraft) {
      return;
    }

    let attempts = 0;
    while (attempts < 20 && !this.authService.profile()?.userId) {
      attempts += 1;
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    if (!this.authService.profile()?.userId) {
      this.pageError.set('We created your account, but could not finalize the team yet. Please try again.');
      return;
    }

    this.hydrateDraft(pendingDraft);
    void this.loadCoachOptions();
    this.showCreateTeamModal.set(true);
    this.teamSetupStep.set(1);
    await this.createTeamFromDraft(pendingDraft);
  }

  toggleDarkMode(): void {
    this.themeService.toggleDarkMode();
  }

  ngOnInit(): void {
    window.scrollTo({ top: 0, behavior: 'instant' });
    void this.completePendingTeamAfterAuth();
  }
}

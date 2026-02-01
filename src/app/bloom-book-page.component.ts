import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ThemeService } from './theme.service';

@Component({
  selector: 'app-bloom-book-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="min-h-screen bg-emerald-50 text-emerald-950 dark:bg-slate-900 dark:text-emerald-50 transition-colors duration-300">
      <header class="px-6 pt-6 flex items-center justify-between">
        <a routerLink="/" class="flex items-center gap-3 group">
          <div class="relative">
            <div class="absolute -inset-1 bg-gradient-to-r from-emerald-600 to-slate-900 rounded-full blur opacity-25"></div>
            <img src="/assets/rocket-goals.png" alt="Rocket Goals"
              class="relative w-14 h-14 object-contain transform group-hover:scale-105 transition-transform" />
          </div>
          <span class="text-2xl font-black tracking-tight">
            ROCKET<span class="text-emerald-600">GOALS</span>
          </span>
        </a>
        <div class="flex items-center gap-3">
          <button type="button" (click)="theme.toggleDarkMode()" [attr.aria-pressed]="theme.isDarkMode()"
            class="p-3 rounded-full border border-black/10 dark:border-white/20 text-emerald-950 dark:text-emerald-50 hover:text-white hover:bg-black dark:hover:bg-white dark:hover:text-black transition-colors"
            title="Toggle dark mode">
            @if (theme.isDarkMode()) {
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
          <a routerLink="/app-suite"
            class="text-sm font-semibold text-emerald-900 dark:text-emerald-100 hover:text-emerald-600 transition-colors">
            Explore App Suite
          </a>
        </div>
      </header>

      <main class="px-6 py-16">
        <div class="max-w-6xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <div class="relative flex justify-center">
            <div class="relative">
              <div
                class="absolute -inset-6 bg-gradient-to-r from-emerald-500/30 to-slate-700/30 rounded-3xl blur-2xl opacity-70">
              </div>
              <img
                src="https://firebasestorage.googleapis.com/v0/b/rocket-prompt.firebasestorage.app/o/site%2FBloom_cover_final.jpg?alt=media&token=61720f46-3cb0-4523-bab6-d17222953a20"
                alt="Bloom: 42 Evolutionary Prompts Book"
                class="relative w-80 md:w-96 rounded-3xl shadow-2xl" />
              <div
                class="absolute -top-4 -right-4 bg-emerald-500 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow-lg">
                Coming Soon
              </div>
            </div>
          </div>

          <div class="space-y-6">
            <div
              class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-100 border border-emerald-200 dark:bg-emerald-500/15 dark:border-emerald-500/30">
              <span class="w-2 h-2 bg-emerald-600 rounded-full animate-pulse"></span>
              <span class="text-xs font-bold text-emerald-700 tracking-wider uppercase dark:text-emerald-200">Coming Soon</span>
            </div>

            <h1 class="text-4xl md:text-5xl lg:text-6xl font-black tracking-tight leading-tight text-emerald-950 dark:text-emerald-100">
              Bloom<br />
              <span class="text-emerald-600">42 Evolutionary Prompts</span>
            </h1>

            <p class="text-xl text-emerald-900 leading-relaxed font-medium dark:text-emerald-100/80">
              How to rewild the mind of artificial intelligence. A new prompt journey—short, wild, and designed for the
              20‑minute mind reset.
            </p>

            <div class="rounded-2xl border border-emerald-200/70 bg-white/70 p-5 text-emerald-900 shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-100">
              <p class="text-sm font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-300">Stay tuned</p>
              <p class="mt-2 text-sm leading-relaxed">
                Bloom is on the way. We’re refining the final prompts and will announce release details soon.
              </p>
            </div>

            <div class="flex flex-wrap items-center gap-4">
              <a routerLink="/"
                class="group inline-flex items-center gap-3 px-8 py-4 bg-emerald-900 text-white font-bold text-lg rounded-full hover:bg-emerald-700 transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-1">
                Back to Home
                <svg class="w-5 h-5 transform group-hover:translate-x-1 transition-transform" fill="none"
                  stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </a>
              <a routerLink="/app-suite"
                class="group inline-flex items-center gap-3 px-8 py-4 bg-white text-emerald-900 font-bold text-lg rounded-full border border-emerald-200 hover:border-emerald-400 transition-all duration-300 shadow-lg hover:shadow-xl hover:-translate-y-1 dark:bg-transparent dark:text-emerald-100 dark:border-emerald-500/30">
                Explore App Suite
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  `
})
export class BloomBookPageComponent {
  protected theme = inject(ThemeService);
}

import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { INTERNAL_BLOG_POSTS } from './internal-blogs.data';
import { ThemeService } from './theme.service';

@Component({
  selector: 'app-blogs-page',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="min-h-screen bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header class="sticky top-0 z-30 border-b border-slate-100 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div class="mx-auto flex max-w-[1100px] items-center justify-between px-6 py-4">
          <a routerLink="/" class="flex items-center gap-2.5 group">
            <img src="/assets/rocket-goals.png" alt="RocketGoals" class="h-9 w-9 object-contain" />
            <span class="text-lg font-extrabold tracking-tight">
              ROCKET<span class="text-red-600">GOALS</span>
            </span>
          </a>
          <div class="flex items-center gap-6">
            <nav class="hidden items-center gap-6 md:flex">
              <a routerLink="/" class="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">Home</a>
              <a routerLink="/app-suite" class="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">Rocket Coaches</a>
              <a href="https://rocketgoals.beehiiv.com/" target="_blank" rel="noopener noreferrer" class="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">Daily Rocket</a>
            </nav>
            <button type="button" (click)="toggleDarkMode()" [attr.aria-pressed]="isDarkMode()"
              class="rounded-full border border-slate-200 p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              title="Toggle dark mode">
              @if (isDarkMode()) {
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.021 0l-.707-.707M6.343 6.343l-.707-.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              } @else {
              <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
              }
            </button>
          </div>
        </div>
      </header>

      <main>
        <section class="mx-auto max-w-[840px] px-6 pt-16 pb-12 md:pt-24 md:pb-16">
          <p class="text-sm font-semibold uppercase tracking-widest text-red-600">Blog</p>
          <h1 class="mt-4 text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white md:text-5xl">
            Research &amp; frameworks from RocketGoals
          </h1>
          <p class="mt-4 text-lg leading-relaxed text-slate-500 dark:text-slate-400">
            Internal thinking on coaching systems, AI-human collaboration, behavior change, and turning ambition into execution.
          </p>
        </section>

        <section class="mx-auto max-w-[840px] px-6 pb-24">
          <div class="divide-y divide-slate-100 dark:divide-slate-800">
            @for (post of posts; track post.slug) {
            <a [routerLink]="['/blogs', post.slug]" class="group block py-8 first:pt-0">
              <div class="flex flex-wrap items-center gap-3 text-sm text-slate-400 dark:text-slate-500">
                <span>{{ post.publishedDate }}</span>
                <span class="text-slate-300 dark:text-slate-700">&middot;</span>
                <span>{{ post.readTime }}</span>
              </div>
              <h2 class="mt-3 text-2xl font-bold tracking-tight text-slate-900 transition-colors group-hover:text-red-600 dark:text-white dark:group-hover:text-red-400 md:text-3xl">
                {{ post.title }}
              </h2>
              <p class="mt-2 text-base leading-relaxed text-slate-500 dark:text-slate-400">
                {{ post.subtitle }}
              </p>
              <p class="mt-4 text-sm font-medium text-slate-400 dark:text-slate-500">
                By {{ post.authorName }}
              </p>
            </a>
            }
          </div>
        </section>
      </main>
    </div>
  `
})
export class BlogsPageComponent implements OnInit {
  private readonly theme = inject(ThemeService);
  protected readonly isDarkMode = this.theme.isDarkMode;
  protected readonly posts = INTERNAL_BLOG_POSTS;

  ngOnInit(): void {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  toggleDarkMode() {
    this.theme.toggleDarkMode();
  }
}

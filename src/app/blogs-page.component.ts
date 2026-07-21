import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { RouterModule } from '@angular/router';
import { INTERNAL_BLOG_POSTS } from './internal-blogs.data';
import { ThemeService } from './theme.service';

interface BlogListingPost {
  slug: string;
  href: string;
  title: string;
  subtitle: string;
  publishedDate: string;
  readTime: string;
  authorName: string;
}

const STANDALONE_ARTICLES: BlogListingPost[] = [
  {
    slug: 'bodies-in-the-basement',
    href: '/bodies-in-the-basement',
    title: "The Bodies in Algebra's Basement",
    subtitle: 'A frontier-mathematics field report on four more conjectures that fell with the Jacobian conjecture—and where the first explicit counterexamples may be buried.',
    publishedDate: 'July 21, 2026',
    readTime: '17 min read',
    authorName: 'Claude Fable 5 with Jim Walker'
  },
  {
    slug: 'map-that-broke-algebra',
    href: '/map-that-broke-algebra',
    title: 'The Map That Broke Algebra',
    subtitle: 'The story of an explicit polynomial map, the conjectures it brought down, and the global pathology hidden at infinity.',
    publishedDate: 'July 20, 2026',
    readTime: '20 min read',
    authorName: 'Claude Fable 5 with Jim Walker'
  }
];

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
              <a routerLink="/app-suite" class="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">Rocket Coaches</a>
              <a href="https://rocketgoals.beehiiv.com/" target="_blank" rel="noopener noreferrer" class="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">Daily Rocket</a>
            </nav>
            <div class="hidden items-center gap-3 md:flex">
              <a routerLink="/login"
                class="rounded-full border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                Login
              </a>
              <a routerLink="/signup"
                class="rounded-full bg-slate-950 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-600 dark:bg-white dark:text-slate-950 dark:hover:bg-red-500 dark:hover:text-white">
                Start Free
              </a>
            </div>
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
            <a [attr.href]="post.href" class="group block py-8 first:pt-0">
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

      <footer class="border-t border-slate-100 bg-white py-12 dark:border-slate-800 dark:bg-slate-950">
        <div class="mx-auto max-w-[1100px] px-6">
          <div class="flex flex-col items-center justify-center gap-6 md:flex-row md:gap-8">
            <a routerLink="/about" class="text-sm font-medium text-slate-400 transition-colors hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400">About</a>
            <a routerLink="/app-suite" class="text-sm font-medium text-slate-400 transition-colors hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400">Rocket Coaches</a>
            <a routerLink="/blogs" class="text-sm font-medium text-slate-400 transition-colors hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400">Blogs</a>
            <a href="https://rocketgoals.beehiiv.com/" target="_blank" rel="noopener noreferrer" class="text-sm font-medium text-slate-400 transition-colors hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400">Daily Rocket</a>
            <a routerLink="/contact" class="text-sm font-medium text-slate-400 transition-colors hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400">Contact Us</a>
          </div>
          <div class="mt-8 flex flex-col items-center justify-between gap-4 border-t border-slate-100 pt-8 dark:border-slate-800 md:flex-row">
            <p class="text-sm text-slate-400 dark:text-slate-500">&copy; {{ currentYear }} RocketGoals. All rights reserved.</p>
            <a href="https://x.com/RocketGoals" target="_blank" rel="noopener noreferrer" class="text-slate-400 transition-colors hover:text-slate-900 dark:text-slate-500 dark:hover:text-white">
              <span class="sr-only">Twitter</span>
              <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8.29 20.251c7.547 0 11.675-6.253 11.675-11.675 0-.178 0-.355-.012-.53A8.348 8.348 0 0022 5.92a8.19 8.19 0 01-2.357.646 4.118 4.118 0 001.804-2.27 8.224 8.224 0 01-2.605.996 4.107 4.107 0 00-6.993 3.743 11.65 11.65 0 01-8.457-4.287 4.106 4.106 0 001.27 5.477A4.072 4.072 0 012.8 9.713v.052a4.105 4.105 0 003.292 4.022 4.095 4.095 0 01-1.853.07 4.108 4.108 0 003.834 2.85A8.233 8.233 0 012 18.407a11.616 11.616 0 006.29 1.84" />
              </svg>
            </a>
          </div>
        </div>
      </footer>
    </div>
  `
})
export class BlogsPageComponent implements OnInit {
  private readonly theme = inject(ThemeService);
  protected readonly isDarkMode = this.theme.isDarkMode;
  protected readonly posts: BlogListingPost[] = [
    ...STANDALONE_ARTICLES,
    ...INTERNAL_BLOG_POSTS.map(post => ({
      slug: post.slug,
      href: `/blogs/${post.slug}`,
      title: post.title,
      subtitle: post.subtitle,
      publishedDate: post.publishedDate,
      readTime: post.readTime,
      authorName: post.authorName
    }))
  ];
  protected readonly currentYear = new Date().getFullYear();

  ngOnInit(): void {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  toggleDarkMode() {
    this.theme.toggleDarkMode();
  }
}

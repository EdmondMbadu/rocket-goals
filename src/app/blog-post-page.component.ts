import { CommonModule } from '@angular/common';
import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, ParamMap, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';
import { getInternalBlogPostBySlug, type InternalBlogPost, type InternalBlogBlock } from './internal-blogs.data';
import { ThemeService } from './theme.service';

@Component({
  selector: 'app-blog-post-page',
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
              <a routerLink="/blogs" class="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">Blog</a>
              <a routerLink="/growth-lead" class="text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">Growth Test</a>
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

      @if (post; as article) {
      <main>
        <!-- Hero -->
        <section class="mx-auto max-w-[840px] px-6 pt-12 pb-10 md:pt-20 md:pb-14">
          <a routerLink="/blogs" class="inline-flex items-center gap-1.5 text-sm font-medium text-slate-400 transition-colors hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
            Back to blog
          </a>

          <div class="mt-8 flex flex-wrap items-center gap-3 text-sm text-slate-400 dark:text-slate-500">
            <span class="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-semibold text-white">{{ article.heroBadge }}</span>
            <span>{{ article.publishedDate }}</span>
            <span class="text-slate-300 dark:text-slate-700">&middot;</span>
            <span>{{ article.readTime }}</span>
          </div>

          <h1 class="mt-5 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white md:text-[2.75rem] md:leading-[1.15]">
            {{ article.title }}
          </h1>

          <p class="mt-5 text-lg leading-relaxed text-slate-500 dark:text-slate-400">
            {{ article.subtitle }}
          </p>

          <div class="mt-8 flex items-center justify-between border-t border-slate-100 pt-6 dark:border-slate-800">
            <div>
              <p class="text-sm font-semibold text-slate-900 dark:text-white">{{ article.authorName }}</p>
              <p class="text-sm text-slate-400 dark:text-slate-500">{{ article.authorRole }}</p>
            </div>
            @if (article.ctaLabel && article.ctaPath) {
            <a [routerLink]="article.ctaPath"
              class="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700">
              {{ article.ctaLabel }}
              <svg class="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </a>
            }
          </div>
        </section>

        <!-- Content -->
        <article class="mx-auto max-w-[840px] px-6 pb-24">
          @for (section of article.sections; track section.title) {
          <section class="mb-12">
            @if (section.eyebrow) {
            <p class="text-xs font-semibold uppercase tracking-widest text-red-600 dark:text-red-400">{{ section.eyebrow }}</p>
            }
            <h2 class="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white md:text-3xl">{{ section.title }}</h2>

            <div class="mt-5 space-y-5">
              @for (block of section.blocks; track $index) {
              <div [ngSwitch]="block.type">
                <p *ngSwitchCase="'paragraph'" class="text-[1.0625rem] leading-[1.8] text-slate-600 dark:text-slate-300">
                  {{ asParagraph(block).text }}
                </p>

                <ul *ngSwitchCase="'bullet-list'" class="space-y-3 pl-5 text-[1.0625rem] leading-[1.8] text-slate-600 dark:text-slate-300">
                  @for (item of asBulletList(block).items; track item) {
                  <li class="pl-1">{{ item }}</li>
                  }
                </ul>

                <div *ngSwitchCase="'numbered-list'" class="space-y-5">
                  @for (item of asNumberedList(block).items; track item.title) {
                  <div class="border-l-2 border-red-600 pl-5">
                    <p class="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">{{ $index + 1 }}</p>
                    <h3 class="mt-1 text-lg font-bold text-slate-900 dark:text-white">{{ item.title }}</h3>
                    <p class="mt-1.5 text-[1.0625rem] leading-[1.8] text-slate-600 dark:text-slate-300">{{ item.text }}</p>
                  </div>
                  }
                </div>

                <div *ngSwitchCase="'table'" class="overflow-x-auto">
                  <table class="w-full text-left text-sm">
                    <thead>
                      <tr class="border-b border-slate-200 dark:border-slate-700">
                        @for (column of asTable(block).columns; track column) {
                        <th class="py-3 pr-6 font-semibold text-slate-900 dark:text-white">{{ column }}</th>
                        }
                      </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                      @for (row of asTable(block).rows; track row[0]) {
                      <tr>
                        @for (cell of row; track cell) {
                        <td class="py-3 pr-6 align-top text-slate-600 dark:text-slate-300">{{ cell }}</td>
                        }
                      </tr>
                      }
                    </tbody>
                  </table>
                </div>

                <div *ngSwitchCase="'callout'" class="border-l-2 border-red-600 bg-slate-50 py-5 pl-5 pr-6 dark:bg-slate-900">
                  <p class="text-xs font-semibold uppercase tracking-widest text-red-600 dark:text-red-400">{{ asCallout(block).title }}</p>
                  <p class="mt-2 text-[1.0625rem] leading-[1.8] text-slate-700 dark:text-slate-300">{{ asCallout(block).text }}</p>
                </div>
              </div>
              }
            </div>
          </section>
          }

          <!-- Citations -->
          <section class="border-t border-slate-100 pt-10 dark:border-slate-800">
            <p class="text-xs font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">References</p>
            <ol class="mt-4 space-y-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              @for (citation of article.citations; track citation) {
              <li>{{ citation }}</li>
              }
            </ol>
          </section>
        </article>
      </main>
      } @else {
      <main class="mx-auto max-w-[840px] px-6 py-24 text-center">
        <h1 class="text-3xl font-extrabold text-slate-900 dark:text-white">Post not found</h1>
        <p class="mt-3 text-base text-slate-500 dark:text-slate-400">This blog post does not exist yet.</p>
        <a routerLink="/blogs"
          class="mt-6 inline-flex items-center gap-1.5 rounded-full bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700">
          Back to blog
        </a>
      </main>
      }

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
  `,
  styles: [`
    :host {
      display: block;
    }
  `]
})
export class BlogPostPageComponent implements OnInit, OnDestroy {
  private readonly theme = inject(ThemeService);
  protected readonly isDarkMode = this.theme.isDarkMode;
  protected readonly currentYear = new Date().getFullYear();
  protected post: InternalBlogPost | null = null;
  private routeSub?: Subscription;

  constructor(private readonly route: ActivatedRoute) {}

  toggleDarkMode() {
    this.theme.toggleDarkMode();
  }

  ngOnInit(): void {
    this.routeSub = this.route.paramMap.subscribe((params: ParamMap) => {
      this.post = getInternalBlogPostBySlug(params.get('slug'));
      window.scrollTo({ top: 0, behavior: 'instant' });
    });
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();
  }

  protected asParagraph(block: InternalBlogBlock): Extract<InternalBlogBlock, { type: 'paragraph' }> {
    return block as Extract<InternalBlogBlock, { type: 'paragraph' }>;
  }

  protected asBulletList(block: InternalBlogBlock): Extract<InternalBlogBlock, { type: 'bullet-list' }> {
    return block as Extract<InternalBlogBlock, { type: 'bullet-list' }>;
  }

  protected asNumberedList(block: InternalBlogBlock): Extract<InternalBlogBlock, { type: 'numbered-list' }> {
    return block as Extract<InternalBlogBlock, { type: 'numbered-list' }>;
  }

  protected asTable(block: InternalBlogBlock): Extract<InternalBlogBlock, { type: 'table' }> {
    return block as Extract<InternalBlogBlock, { type: 'table' }>;
  }

  protected asCallout(block: InternalBlogBlock): Extract<InternalBlogBlock, { type: 'callout' }> {
    return block as Extract<InternalBlogBlock, { type: 'callout' }>;
  }
}

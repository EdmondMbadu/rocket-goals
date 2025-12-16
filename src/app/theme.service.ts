import { DOCUMENT } from '@angular/common';
import { effect, inject, Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private document = inject(DOCUMENT);
  readonly isDarkMode = signal(false);

  constructor() {
    if (typeof window !== 'undefined') {
      const storedTheme = localStorage.getItem('rocketGoalsTheme');
      if (storedTheme === 'dark') {
        this.isDarkMode.set(true);
      } else if (storedTheme === 'light') {
        this.isDarkMode.set(false);
      } else {
        const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        this.isDarkMode.set(!!prefersDark);
      }
    }

    effect(() => {
      const darkModeEnabled = this.isDarkMode();
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('rocketGoalsTheme', darkModeEnabled ? 'dark' : 'light');
        } catch (error) {
          console.warn('Unable to persist theme preference', error);
        }
      }
      if (this.document?.documentElement) {
        this.document.documentElement.classList.toggle('dark', darkModeEnabled);
      }
    });
  }

  toggleDarkMode() {
    this.isDarkMode.update(mode => !mode);
  }

  setDarkMode(isDark: boolean) {
    this.isDarkMode.set(isDark);
  }
}

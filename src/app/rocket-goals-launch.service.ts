import { Injectable } from '@angular/core';

export interface RocketGoalsLaunchPreparation {
  token: string;
  url: string;
  stored: boolean;
}

const STORAGE_PREFIX = 'rocketGoalsAutoPrompt:';

@Injectable({ providedIn: 'root' })
export class RocketGoalsLaunchService {
  prepareLaunch(promptText: string, promptId?: string): RocketGoalsLaunchPreparation {
    const token = this.createToken(promptId);
    const key = this.buildStorageKey(token);
    let stored = false;

    if (this.isBrowser()) {
      try {
        window.localStorage.setItem(key, promptText);
        stored = true;
      } catch {
        stored = false;
      }
    }

    const baseUrl = this.isBrowser() ? window.location.origin : '';
    const url = `${baseUrl}/ai?autoLaunch=${encodeURIComponent(token)}`;

    return { token, url, stored };
  }

  consumePrompt(token: string): string | null {
    if (!this.isBrowser()) return null;

    const key = this.buildStorageKey(token);
    try {
      const payload = window.localStorage.getItem(key);
      if (payload) {
        window.localStorage.removeItem(key);
        return payload;
      }
    } catch {
      return null;
    }
    return null;
  }

  private createToken(promptId?: string): string {
    const timestamp = Date.now();
    const prefix = (promptId || 'prompt').slice(0, 8);
    const random = this.randomString(8);
    return `${timestamp}-${prefix}-${random}`;
  }

  private randomString(length: number): string {
    if (this.isBrowser() && window.crypto?.getRandomValues) {
      const bytes = new Uint8Array(length);
      window.crypto.getRandomValues(bytes);
      return Array.from(bytes, (byte) => (byte % 36).toString(36)).join('');
    }
    return Math.random().toString(36).slice(2, 2 + length);
  }

  private buildStorageKey(token: string): string {
    return `${STORAGE_PREFIX}${token}`;
  }

  private isBrowser(): boolean {
    return typeof window !== 'undefined';
  }
}

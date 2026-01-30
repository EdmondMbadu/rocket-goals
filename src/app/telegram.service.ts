import { Injectable, inject, signal, computed } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';
import { AuthService } from './auth.service';

export interface TelegramLinkStatus {
  linked: boolean;
  telegramUsername?: string | null;
  linkedAt?: any;
}

@Injectable({
  providedIn: 'root'
})
export class TelegramService {
  private functions = inject(Functions);
  private authService = inject(AuthService);

  // Reactive state
  private _linkStatus = signal<TelegramLinkStatus | null>(null);
  private _loading = signal(false);
  private _error = signal<string | null>(null);

  // Public computed values
  linkStatus = computed(() => this._linkStatus());
  loading = computed(() => this._loading());
  error = computed(() => this._error());
  isLinked = computed(() => this._linkStatus()?.linked ?? false);

  // Bot username - update this after creating your bot
  readonly botUsername = 'RocketGoalsBot';
  readonly botLink = `https://t.me/${this.botUsername}`;

  /**
   * Check if user has Telegram linked
   */
  async checkLinkStatus(): Promise<TelegramLinkStatus> {
    this._loading.set(true);
    this._error.set(null);

    try {
      const getTelegramLinkStatus = httpsCallable<void, TelegramLinkStatus>(
        this.functions,
        'getTelegramLinkStatus'
      );

      const result = await getTelegramLinkStatus();
      this._linkStatus.set(result.data);
      return result.data;
    } catch (error: any) {
      console.error('Error checking Telegram link status:', error);
      this._error.set(error.message || 'Failed to check link status');
      return { linked: false };
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Link Telegram account using token from URL
   */
  async linkAccount(token: string): Promise<boolean> {
    this._loading.set(true);
    this._error.set(null);

    try {
      const linkTelegramAccount = httpsCallable<{ token: string }, { success: boolean; message: string }>(
        this.functions,
        'linkTelegramAccount'
      );

      const result = await linkTelegramAccount({ token });

      if (result.data.success) {
        // Refresh link status
        await this.checkLinkStatus();
        return true;
      }

      this._error.set(result.data.message || 'Failed to link account');
      return false;
    } catch (error: any) {
      console.error('Error linking Telegram account:', error);
      this._error.set(error.message || 'Failed to link account');
      return false;
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Unlink Telegram account
   */
  async unlinkAccount(): Promise<boolean> {
    this._loading.set(true);
    this._error.set(null);

    try {
      const unlinkTelegramAccount = httpsCallable<void, { success: boolean; message: string }>(
        this.functions,
        'unlinkTelegramAccount'
      );

      const result = await unlinkTelegramAccount();

      if (result.data.success) {
        this._linkStatus.set({ linked: false });
        return true;
      }

      this._error.set(result.data.message || 'Failed to unlink account');
      return false;
    } catch (error: any) {
      console.error('Error unlinking Telegram account:', error);
      this._error.set(error.message || 'Failed to unlink account');
      return false;
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Open Telegram bot in new tab
   */
  openTelegramBot(): void {
    window.open(this.botLink, '_blank');
  }
}

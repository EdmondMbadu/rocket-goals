import { Component, inject, signal, OnInit } from "@angular/core";
import { CommonModule } from "@angular/common";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { AuthService } from "./auth.service";
import { ThemeService } from "./theme.service";

@Component({
  selector: "app-link-telegram",
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    <div class="link-telegram-page" [class.dark-mode]="theme.isDarkMode()">
      <div class="link-telegram-card">
        @if (!token()) {
          <div class="status error">
            <p class="status-title">Invalid link</p>
            <p class="status-message">This link is missing a token. In Telegram, open the bot and send /start to get a fresh link.</p>
            <a routerLink="/" class="btn solid">Go to RocketGoals</a>
          </div>
        } @else if (needsLogin()) {
          <div class="status login-cta">
            <p class="status-icon">📱</p>
            <p class="status-title">Connect Telegram to RocketGoals</p>
            <p class="status-message">You're one step away. Log in with your RocketGoals account and we'll link your Telegram so you can chat with your AI coach.</p>
            <a [routerLink]="['/login']" [queryParams]="loginRedirectParams()" class="btn solid">Log in to connect</a>
            <p class="status-hint">Don't have an account? <a routerLink="/signup" [queryParams]="loginRedirectParams()">Sign up</a> first, then use this link again.</p>
          </div>
        } @else if (loading()) {
          <div class="status">
            <span class="spinner"></span>
            <p>Linking your Telegram account...</p>
          </div>
        } @else if (error()) {
          <div class="status error">
            <p class="status-title">Could not link account</p>
            <p class="status-message">{{ error() }}</p>
            <a routerLink="/profile" class="btn solid">Go to Profile</a>
          </div>
        } @else if (success()) {
          <div class="status success">
            <p class="status-icon">✓</p>
            <p class="status-title">Telegram connected</p>
            <p class="status-message">You can now chat with your RocketGoals coach in Telegram. Conversations sync with the web app.</p>
            <a routerLink="/profile" class="btn solid">Go to Profile</a>
          </div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .link-telegram-page {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 1.5rem;
        background: var(--page-bg, #f5f5f5);
      }
      .dark-mode .link-telegram-page {
        background: var(--page-bg);
      }
      .link-telegram-card {
        background: var(--card-bg, #fff);
        border-radius: 12px;
        padding: 2rem;
        max-width: 420px;
        width: 100%;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
      }
      .status {
        text-align: center;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
      }
      .status .spinner {
        width: 32px;
        height: 32px;
        border: 3px solid var(--border-color, #e5e7eb);
        border-top-color: var(--accent, #ef4444);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
      .status-title {
        font-weight: 600;
        font-size: 1.125rem;
        margin: 0;
      }
      .status-message {
        color: var(--muted, #6b7280);
        font-size: 0.9375rem;
        margin: 0;
        line-height: 1.5;
      }
      .status-icon {
        font-size: 2.5rem;
        margin: 0;
      }
      .status-hint {
        font-size: 0.875rem;
        color: var(--muted, #6b7280);
        margin: 0.5rem 0 0;
      }
      .status-hint a {
        color: var(--accent, #ef4444);
        font-weight: 600;
      }
      .status.error .status-title { color: var(--error, #dc2626); }
      .status.login-cta .status-title { color: var(--text, #111); }
      .btn {
        display: inline-block;
        padding: 0.625rem 1.5rem;
        border-radius: 8px;
        font-weight: 600;
        text-decoration: none;
        margin-top: 0.25rem;
      }
      .btn.solid {
        background: var(--accent, #ef4444);
        color: white;
      }
    `,
  ],
})
export class LinkTelegramComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private authService = inject(AuthService);
  protected theme = inject(ThemeService);

  token = signal<string | null>(null);
  needsLogin = signal(false);
  loading = signal(false);
  success = signal(false);
  error = signal<string | null>(null);

  /** Return URL to pass to login/signup so after auth we come back here with token. */
  loginRedirectParams() {
    const t = this.token();
    if (!t) return {};
    return { redirectTo: "/link-telegram?token=" + encodeURIComponent(t) };
  }

  async ngOnInit() {
    const token = this.route.snapshot.queryParamMap.get("token");
    if (!token) {
      this.token.set(null);
      return;
    }
    this.token.set(token);

    const user = this.authService.user() ?? (await this.authService.getCurrentUser());
    if (!user) {
      this.needsLogin.set(true);
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    try {
      const appModule = await import("firebase/app");
      const functionsModule = await import("firebase/functions");
      const { firebaseConfig } = await import("../../environments/environment");

      const app =
        appModule.getApps().length === 0
          ? appModule.initializeApp(firebaseConfig)
          : appModule.getApp();

      const functions = functionsModule.getFunctions(app, "us-central1");
      const linkTelegramAccount = functionsModule.httpsCallable(functions, "linkTelegramAccount");

      await linkTelegramAccount({ token });
      this.success.set(true);
      this.authService.refreshProfile();
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "Something went wrong. The link may have expired (links last 15 minutes). Get a new link from the bot.";
      this.error.set(message);
    } finally {
      this.loading.set(false);
    }
  }
}

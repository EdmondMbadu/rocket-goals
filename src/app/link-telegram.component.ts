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
        @if (loading()) {
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
            <p class="status-message">You can now chat with your RocketGoals coach in Telegram.</p>
            <a routerLink="/profile" class="btn solid">Go to Profile</a>
          </div>
        } @else if (!token()) {
          <div class="status error">
            <p class="status-title">Invalid link</p>
            <p class="status-message">This link is missing a token. Start a chat with the bot and use the link it sends.</p>
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
        background: var(--card-bg);
        border-radius: 12px;
        padding: 2rem;
        max-width: 400px;
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
        border: 3px solid var(--border-color);
        border-top-color: var(--accent);
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
        color: var(--muted);
        font-size: 0.9375rem;
        margin: 0;
        line-height: 1.4;
      }
      .status-icon {
        font-size: 2.5rem;
        margin: 0;
        color: var(--success, #22c55e);
      }
      .status.error .status-title { color: var(--error, #dc2626); }
      .btn {
        display: inline-block;
        padding: 0.5rem 1.25rem;
        border-radius: 8px;
        font-weight: 500;
        text-decoration: none;
        margin-top: 0.5rem;
      }
      .btn.solid {
        background: var(--accent);
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
  loading = signal(true);
  success = signal(false);
  error = signal<string | null>(null);

  async ngOnInit() {
    const token = this.route.snapshot.queryParamMap.get("token");
    if (!token) {
      this.token.set(null);
      this.loading.set(false);
      return;
    }
    this.token.set(token);

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
          : "Something went wrong. The link may have expired.";
      this.error.set(message);
    } finally {
      this.loading.set(false);
    }
  }
}

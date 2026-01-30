import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

const OVERLAY_CLOSE_GUARD_MS = 500;

@Component({
  selector: 'app-telegram-qr-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="modal-overlay" (click)="onOverlayClick($event)">
      <div class="modal-content">
        <button class="close-btn" (click)="close.emit()" title="Close">×</button>

        <div class="modal-header">
          <span class="telegram-icon">📱</span>
          <h2>Connect Telegram</h2>
        </div>

        <div class="modal-body">
          @if (loading()) {
            <div class="qr-placeholder">
              <div class="spinner"></div>
              <p>Generating link...</p>
            </div>
          } @else if (error()) {
            <div class="error-state">
              <p>{{ error() }}</p>
              <button class="retry-btn" (click)="retry.emit()">Try Again</button>
            </div>
          } @else if (deepLink()) {
            <div class="qr-section">
              <div class="qr-code-container">
                <img
                  [src]="qrCodeUrl()"
                  alt="Scan to connect Telegram"
                  class="qr-code"
                  (error)="onQrError()"
                />
              </div>
              <p class="scan-instruction">Scan with your phone camera</p>
            </div>

            <div class="divider">
              <span>or</span>
            </div>

            <div class="manual-section">
              <p class="manual-instruction">On mobile? Tap to open Telegram:</p>
              <a [href]="deepLink()" target="_blank" rel="noopener noreferrer" class="open-telegram-btn">
                Open Telegram
              </a>
            </div>
          }
        </div>

        <div class="modal-footer">
          <p class="hint">Link expires in 15 minutes</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      padding: 1rem;
      backdrop-filter: blur(4px);
    }

    .modal-content {
      background: var(--card-bg, #fff);
      border-radius: 16px;
      max-width: 380px;
      width: 100%;
      padding: 1.5rem;
      position: relative;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      animation: modalSlideIn 0.2s ease-out;
    }

    @keyframes modalSlideIn {
      from {
        opacity: 0;
        transform: scale(0.95) translateY(-10px);
      }
      to {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }

    :host-context(.dark-mode) .modal-content {
      background: var(--card-bg, #1a1a1a);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .close-btn {
      position: absolute;
      top: 0.75rem;
      right: 0.75rem;
      width: 32px;
      height: 32px;
      border: none;
      background: transparent;
      font-size: 1.5rem;
      color: var(--muted, #6b7280);
      cursor: pointer;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s ease, color 0.15s ease;
    }

    .close-btn:hover {
      background: rgba(0, 0, 0, 0.08);
      color: var(--text, #1a1a1a);
    }

    :host-context(.dark-mode) .close-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      color: var(--text, #f5f5f5);
    }

    .modal-header {
      text-align: center;
      margin-bottom: 1.5rem;
    }

    .telegram-icon {
      font-size: 2.5rem;
      display: block;
      margin-bottom: 0.5rem;
    }

    .modal-header h2 {
      margin: 0;
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--text, #1a1a1a);
    }

    :host-context(.dark-mode) .modal-header h2 {
      color: var(--text, #f5f5f5);
    }

    .modal-body {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
    }

    .qr-placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
      padding: 2rem;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid var(--border-color, #e5e7eb);
      border-top-color: #0088cc;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .qr-placeholder p,
    .error-state p {
      color: var(--muted, #6b7280);
      font-size: 0.9rem;
      margin: 0;
    }

    .error-state {
      text-align: center;
      padding: 1rem;
    }

    .retry-btn {
      margin-top: 1rem;
      padding: 0.5rem 1.25rem;
      background: #0088cc;
      color: white;
      border: none;
      border-radius: 8px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s ease;
    }

    .retry-btn:hover {
      background: #006699;
    }

    .qr-section {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.75rem;
    }

    .qr-code-container {
      background: white;
      padding: 12px;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .qr-code {
      width: 180px;
      height: 180px;
      display: block;
    }

    .scan-instruction {
      color: var(--muted, #6b7280);
      font-size: 0.875rem;
      margin: 0;
    }

    .divider {
      display: flex;
      align-items: center;
      width: 100%;
      gap: 1rem;
      color: var(--muted, #6b7280);
      font-size: 0.8125rem;
    }

    .divider::before,
    .divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--border-color, #e5e7eb);
    }

    .manual-section {
      text-align: center;
      width: 100%;
    }

    .manual-instruction {
      color: var(--muted, #6b7280);
      font-size: 0.875rem;
      margin: 0 0 0.75rem;
    }

    .open-telegram-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.75rem 1.5rem;
      background: #0088cc;
      color: white;
      border: none;
      border-radius: 10px;
      font-size: 0.9375rem;
      font-weight: 600;
      text-decoration: none;
      cursor: pointer;
      transition: background 0.15s ease, transform 0.1s ease;
      width: 100%;
    }

    .open-telegram-btn:hover {
      background: #006699;
      transform: translateY(-1px);
    }

    .open-telegram-btn:active {
      transform: translateY(0);
    }

    .modal-footer {
      margin-top: 1.25rem;
      text-align: center;
    }

    .hint {
      color: var(--muted, #6b7280);
      font-size: 0.75rem;
      margin: 0;
    }
  `]
})
export class TelegramQrModalComponent {
  @Input() deepLink = signal<string | null>(null);
  @Input() loading = signal(false);
  @Input() error = signal<string | null>(null);
  @Output() close = new EventEmitter<void>();
  @Output() retry = new EventEmitter<void>();

  private qrFallback = false;
  /** When the modal was shown; overlay click is ignored until this time has passed. */
  private readonly openedAt = Date.now();

  qrCodeUrl(): string {
    const link = this.deepLink();
    if (!link) return '';

    // Use QR Server API (free, no auth required)
    // Fallback to goqr.me if first fails
    if (this.qrFallback) {
      return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(link)}`;
    }
    return `https://quickchart.io/qr?text=${encodeURIComponent(link)}&size=180&margin=1`;
  }

  onQrError(): void {
    if (!this.qrFallback) {
      this.qrFallback = true;
    }
  }

  onOverlayClick(event: MouseEvent): void {
    const el = event.target as HTMLElement;
    if (!el.classList.contains('modal-overlay')) return;
    // Ignore overlay clicks for a short time so the same click that opened the modal doesn't close it
    if (Date.now() - this.openedAt < OVERLAY_CLOSE_GUARD_MS) return;
    this.close.emit();
  }
}

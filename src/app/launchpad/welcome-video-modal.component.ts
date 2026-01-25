import { Component, EventEmitter, Input, Output, signal, OnInit, OnDestroy, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { LaunchpadTemplate } from './launchpad.types';
import { HeyGenService, WelcomeVideoConfig } from '../heygen.service';

export type VideoState = 'generating' | 'ready' | 'playing' | 'error' | 'skipped';

@Component({
  selector: 'app-welcome-video-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="video-modal-backdrop">
      <div class="video-modal-container">
        <!-- Generating State -->
        @if (state() === 'generating') {
          <div class="generating-state">
            <!-- Co-pilot Avatar with Pulse Animation -->
            <div class="avatar-container">
              <div class="avatar-pulse" [style.background]="template.accentColor + '30'"></div>
              <div class="avatar-pulse delay-1" [style.background]="template.accentColor + '20'"></div>
              <img [src]="template.coPilotAvatar" [alt]="template.coPilotName" class="copilot-avatar" />
            </div>

            <h2 class="generating-title">{{ template.coPilotName }} is preparing your welcome...</h2>
            <p class="generating-subtitle">Your personal AI coach is creating a customized message just for you</p>

            <!-- Progress Indicator -->
            <div class="progress-container">
              <div class="progress-bar">
                <div class="progress-fill" [style.background]="template.accentColor" [style.width]="progressPercent() + '%'"></div>
              </div>
              <span class="progress-text">{{ progressText() }}</span>
            </div>

            <!-- Status Messages -->
            <div class="status-messages">
              @for (message of statusMessages(); track message) {
                <div class="status-item animate-fade-in">
                  <svg class="status-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                  </svg>
                  <span>{{ message }}</span>
                </div>
              }
            </div>

            <!-- Skip Button -->
            <button class="skip-button" (click)="skip()">
              Skip and go to dashboard
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"/>
              </svg>
            </button>
          </div>
        }

        <!-- Ready/Playing State -->
        @if (state() === 'ready' || state() === 'playing') {
          <div class="video-state">
            <div class="video-header">
              <div class="copilot-info">
                <img [src]="template.coPilotAvatar" [alt]="template.coPilotName" class="copilot-avatar-small" />
                <div>
                  <h3 class="copilot-name">{{ template.coPilotName }}</h3>
                  <p class="copilot-role">{{ template.coPilotRole }}</p>
                </div>
              </div>
            </div>

            <div class="video-container">
              <video
                #videoPlayer
                [src]="videoUrl()"
                class="welcome-video"
                autoplay
                playsinline
                (play)="onVideoPlay()"
                (ended)="onVideoEnd()"
                (error)="onVideoError()"
                controls
              ></video>
            </div>

            <div class="video-footer">
              <button
                class="continue-button"
                [style.background]="template.accentColor"
                (click)="continue()"
              >
                Continue to Dashboard
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/>
                </svg>
              </button>
            </div>
          </div>
        }

        <!-- Error/Fallback State -->
        @if (state() === 'error') {
          <div class="error-state">
            <div class="avatar-container">
              <img [src]="template.coPilotAvatar" [alt]="template.coPilotName" class="copilot-avatar" />
            </div>

            <h2 class="welcome-title">Welcome to your {{ template.name }} Mission!</h2>

            <div class="welcome-message">
              <p>Hi {{ firstName }}! Congratulations on this ambitious goal!</p>
              <p>{{ formattedMetric }} is a true ROCKET Goal. I've created a series of milestones over the next {{ formattedDuration }} that will help you build up to reaching this goal.</p>
              <p>Take a few minutes to explore your milestones, and then use the chat window on the left to ask me any questions.</p>
              <p class="closing">It's going to be an exciting challenge! I'll be rooting for you every step of the way!</p>
              <p class="signature">— {{ template.coPilotName }}</p>
            </div>

            <button
              class="continue-button"
              [style.background]="template.accentColor"
              (click)="continue()"
            >
              Start My Mission
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/>
              </svg>
            </button>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .video-modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1100;
      background: rgba(0, 0, 0, 0.9);
      backdrop-filter: blur(12px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      animation: fadeIn 0.3s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .video-modal-container {
      width: 100%;
      max-width: 600px;
      max-height: 90vh;
      overflow-y: auto;
      background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 24px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
      animation: slideUp 0.4s ease-out;
    }

    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(30px) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    /* Generating State */
    .generating-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 48px 32px;
      text-align: center;
    }

    .avatar-container {
      position: relative;
      margin-bottom: 32px;
    }

    .avatar-pulse {
      position: absolute;
      inset: -20px;
      border-radius: 50%;
      animation: pulse 2s ease-in-out infinite;
    }

    .avatar-pulse.delay-1 {
      inset: -35px;
      animation-delay: 0.5s;
    }

    @keyframes pulse {
      0%, 100% {
        opacity: 0.3;
        transform: scale(0.9);
      }
      50% {
        opacity: 0.6;
        transform: scale(1.1);
      }
    }

    .copilot-avatar {
      width: 120px;
      height: 120px;
      border-radius: 50%;
      object-fit: cover;
      border: 4px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      position: relative;
      z-index: 1;
    }

    .generating-title {
      font-size: 1.5rem;
      font-weight: 800;
      color: #ffffff;
      margin: 0 0 8px 0;
    }

    .generating-subtitle {
      font-size: 1rem;
      color: rgba(255, 255, 255, 0.5);
      margin: 0 0 32px 0;
      max-width: 400px;
    }

    .progress-container {
      width: 100%;
      max-width: 320px;
      margin-bottom: 28px;
    }

    .progress-bar {
      height: 6px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 3px;
      overflow: hidden;
      margin-bottom: 8px;
    }

    .progress-fill {
      height: 100%;
      border-radius: 3px;
      transition: width 0.5s ease-out;
    }

    .progress-text {
      font-size: 0.8125rem;
      color: rgba(255, 255, 255, 0.5);
    }

    .status-messages {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 32px;
      min-height: 80px;
    }

    .status-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.875rem;
      color: rgba(255, 255, 255, 0.7);
    }

    .status-icon {
      width: 16px;
      height: 16px;
      color: #22c55e;
    }

    .animate-fade-in {
      animation: fadeInItem 0.3s ease-out;
    }

    @keyframes fadeInItem {
      from {
        opacity: 0;
        transform: translateX(-10px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }

    .skip-button {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 20px;
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 12px;
      color: rgba(255, 255, 255, 0.6);
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .skip-button:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.3);
      color: rgba(255, 255, 255, 0.9);
    }

    /* Video State */
    .video-state {
      display: flex;
      flex-direction: column;
    }

    .video-header {
      padding: 20px 24px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .copilot-info {
      display: flex;
      align-items: center;
      gap: 14px;
    }

    .copilot-avatar-small {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      object-fit: cover;
      border: 2px solid rgba(255, 255, 255, 0.2);
    }

    .copilot-name {
      font-size: 1rem;
      font-weight: 700;
      color: #ffffff;
      margin: 0;
    }

    .copilot-role {
      font-size: 0.8125rem;
      color: rgba(255, 255, 255, 0.5);
      margin: 2px 0 0 0;
    }

    .video-container {
      padding: 20px;
      background: #000;
    }

    .welcome-video {
      width: 100%;
      border-radius: 12px;
      background: #000;
    }

    .video-footer {
      padding: 20px 24px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      justify-content: center;
    }

    .continue-button {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 28px;
      border: none;
      border-radius: 14px;
      color: #ffffff;
      font-size: 1rem;
      font-weight: 800;
      cursor: pointer;
      transition: all 0.2s;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    }

    .continue-button:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    }

    /* Error/Fallback State */
    .error-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 48px 32px;
      text-align: center;
    }

    .welcome-title {
      font-size: 1.5rem;
      font-weight: 800;
      color: #ffffff;
      margin: 0 0 28px 0;
    }

    .welcome-message {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 28px;
      margin-bottom: 32px;
      max-width: 480px;
      text-align: left;
    }

    .welcome-message p {
      font-size: 1rem;
      line-height: 1.7;
      color: rgba(255, 255, 255, 0.85);
      margin: 0 0 16px 0;
    }

    .welcome-message p:last-child {
      margin-bottom: 0;
    }

    .welcome-message .closing {
      font-weight: 600;
      color: #ffffff;
    }

    .welcome-message .signature {
      font-style: italic;
      color: rgba(255, 255, 255, 0.6);
      margin-top: 20px;
    }

    /* Responsive */
    @media (max-width: 640px) {
      .video-modal-container {
        max-height: 95vh;
      }

      .generating-state,
      .error-state {
        padding: 32px 20px;
      }

      .copilot-avatar {
        width: 100px;
        height: 100px;
      }

      .generating-title {
        font-size: 1.25rem;
      }

      .welcome-message {
        padding: 20px;
      }

      .video-container {
        padding: 12px;
      }
    }
  `]
})
export class WelcomeVideoModalComponent implements OnInit, OnDestroy {
  @ViewChild('videoPlayer') videoPlayer!: ElementRef<HTMLVideoElement>;

  @Input({ required: true }) template!: LaunchpadTemplate;
  @Input({ required: true }) goalId!: string;
  @Input({ required: true }) firstName!: string;
  @Input({ required: true }) oneThingMetric!: string;
  @Input({ required: true }) oneThingLabel!: string;
  @Input({ required: true }) totalDays!: number;

  @Output() onContinue = new EventEmitter<void>();
  @Output() onSkip = new EventEmitter<void>();

  readonly state = signal<VideoState>('generating');
  readonly videoUrl = signal<string | null>(null);
  readonly progressPercent = signal(0);
  readonly statusMessages = signal<string[]>([]);

  private pollAttempts = 0;
  private isDestroyed = false;

  constructor(private heygenService: HeyGenService) {}

  ngOnInit(): void {
    this.startVideoGeneration();
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
  }

  get formattedMetric(): string {
    return this.heygenService.buildWelcomeScript({
      firstName: this.firstName,
      coPilotName: this.template.coPilotName,
      templateName: this.template.name,
      oneThingMetric: this.oneThingMetric,
      oneThingLabel: this.oneThingLabel,
      totalDays: this.totalDays
    }).split('!')[1]?.split(' is a true')[0]?.trim() || this.oneThingMetric;
  }

  get formattedDuration(): string {
    if (this.totalDays <= 7) return this.totalDays === 7 ? 'week' : `${this.totalDays} days`;
    if (this.totalDays <= 30) return 'month';
    if (this.totalDays <= 90) return '3 months';
    return `${Math.round(this.totalDays / 30)} months`;
  }

  progressText(): string {
    const percent = this.progressPercent();
    if (percent < 20) return 'Preparing your welcome message...';
    if (percent < 50) return 'Generating personalized video...';
    if (percent < 80) return 'Almost ready...';
    return 'Finalizing...';
  }

  private async startVideoGeneration(): Promise<void> {
    try {
      // Build the video config with HeyGen avatar/voice from template
      const config: WelcomeVideoConfig = {
        firstName: this.firstName,
        coPilotName: this.template.coPilotName,
        templateName: this.template.name,
        oneThingMetric: this.oneThingMetric,
        oneThingLabel: this.oneThingLabel,
        totalDays: this.totalDays,
        avatarId: this.template.heygenAvatarId,
        voiceId: this.template.heygenVoiceId
      };

      // Start generating
      this.addStatusMessage('Connecting to AI coach...');

      const result = await this.heygenService.generateWelcomeVideo(
        config,
        this.goalId,
        this.template.id,
        (status, attempt) => this.handleProgress(status, attempt)
      );

      if (this.isDestroyed) return;

      if (result.status === 'completed' && result.videoUrl) {
        this.videoUrl.set(result.videoUrl);
        this.state.set('ready');
      } else {
        console.warn('Video generation failed or timed out:', result.error);
        this.state.set('error');
      }
    } catch (error) {
      console.error('Error in video generation:', error);
      if (!this.isDestroyed) {
        this.state.set('error');
      }
    }
  }

  private handleProgress(status: string, attempt: number): void {
    if (this.isDestroyed) return;

    this.pollAttempts = attempt;

    // Calculate progress (max out at 95% until complete)
    const maxPercent = 95;
    const progressPerAttempt = maxPercent / 60; // Assume ~5 minutes (60 attempts)
    const newProgress = Math.min(attempt * progressPerAttempt, maxPercent);
    this.progressPercent.set(newProgress);

    // Add status messages at certain milestones
    if (attempt === 1) {
      this.addStatusMessage('Personalizing your welcome message...');
    } else if (attempt === 6) {
      this.addStatusMessage('Creating AI avatar animation...');
    } else if (attempt === 20) {
      this.addStatusMessage('Rendering video...');
    } else if (attempt === 40) {
      this.addStatusMessage('Applying final touches...');
    }
  }

  private addStatusMessage(message: string): void {
    const current = this.statusMessages();
    if (!current.includes(message)) {
      // Keep only last 4 messages
      const updated = [...current, message].slice(-4);
      this.statusMessages.set(updated);
    }
  }

  onVideoPlay(): void {
    this.state.set('playing');
    this.progressPercent.set(100);
  }

  onVideoEnd(): void {
    // Video finished - keep showing continue button
  }

  onVideoError(): void {
    console.warn('Video playback error, showing fallback');
    this.state.set('error');
  }

  skip(): void {
    this.state.set('skipped');
    this.onSkip.emit();
  }

  continue(): void {
    this.onContinue.emit();
  }
}

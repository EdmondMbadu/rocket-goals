import { CommonModule } from '@angular/common';
import { Component, ViewChild, computed, inject, signal, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from './auth.service';
import { AvatarDropdownComponent } from './avatar-dropdown.component';
import { RocketGoalsAIComponent } from './rocket-goals-ai.component';
import { RocketGoalsAIService } from './rocket-goals-ai.service';

@Component({
  selector: 'app-rocket-ai-page',
  standalone: true,
  imports: [CommonModule, RouterLink, RocketGoalsAIComponent, AvatarDropdownComponent],
  templateUrl: './rocket-ai-page.component.html',
  styleUrl: './rocket-ai-page.component.css'
})
export class RocketAiPageComponent implements OnInit {
  protected readonly aiService = inject(RocketGoalsAIService);
  protected readonly authService = inject(AuthService);
  protected readonly isLightMode = signal(true); // default to light mode
  protected readonly showHistory = signal(true);
  protected readonly isLoggedIn = computed(() => !!this.authService.profile()?.userId);
  protected readonly sessions = this.aiService.sessions;
  protected readonly sessionsLoading = this.aiService.sessionsLoading;
  protected readonly sessionsError = this.aiService.sessionsError;
  protected readonly currentSessionId = this.aiService.currentSessionId;
  protected readonly confirmingDeleteSessionId = signal<string | null>(null);

  @ViewChild(RocketGoalsAIComponent) aiPanel?: RocketGoalsAIComponent;

  protected readonly starterPrompts = [
    'Give me a focused 7-day launch plan.',
    'What should I do today to keep momentum?',
    'Break my goal into the next three actions.',
    'Write a motivational boost for my mission.'
  ];

  async ngOnInit() {
    if (this.isLoggedIn()) {
      await this.aiService.loadSessionsForCurrentUser();
    }
  }

  protected runPrompt(prompt: string): void {
    if (this.aiPanel) {
      this.aiPanel.sendQuickPrompt(prompt);
    } else {
      this.aiService.addLocalUserMessage(prompt);
    }
  }

  protected async openSession(sessionId: string): Promise<void> {
    await this.aiService.loadSession(sessionId);
  }

  protected startNewChat(): void {
    this.aiService.startNewSession();
  }

  protected openDeleteModal(sessionId: string, event?: Event): void {
    event?.stopPropagation();
    this.confirmingDeleteSessionId.set(sessionId);
  }

  protected cancelDelete(): void {
    this.confirmingDeleteSessionId.set(null);
  }

  protected async confirmDelete(): Promise<void> {
    const sessionId = this.confirmingDeleteSessionId();
    if (!sessionId) return;
    await this.aiService.deleteSession(sessionId);
    this.confirmingDeleteSessionId.set(null);
  }

  protected trackBySession(_index: number, session: { id: string }): string {
    return session.id;
  }

  protected toggleTheme(): void {
    this.isLightMode.update((current) => !current);
  }

  protected toggleHistory(): void {
    this.showHistory.update((current) => !current);
  }
}


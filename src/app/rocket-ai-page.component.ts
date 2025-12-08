import { CommonModule } from '@angular/common';
import { Component, ViewChild, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from './auth.service';
import type { ChatMessage } from './rocket-goals-ai.service';
import { RocketGoalsAIComponent } from './rocket-goals-ai.component';
import { RocketGoalsAIService } from './rocket-goals-ai.service';

interface InteractionPreview {
  id: number;
  user?: ChatMessage;
  ai?: ChatMessage;
  timestamp: Date;
}

@Component({
  selector: 'app-rocket-ai-page',
  standalone: true,
  imports: [CommonModule, RouterLink, RocketGoalsAIComponent],
  templateUrl: './rocket-ai-page.component.html',
  styleUrl: './rocket-ai-page.component.css'
})
export class RocketAiPageComponent {
  protected readonly aiService = inject(RocketGoalsAIService);
  protected readonly authService = inject(AuthService);
  protected readonly isLightMode = signal(true); // default to white background
  protected readonly showHistory = signal(true);

  @ViewChild(RocketGoalsAIComponent) aiPanel?: RocketGoalsAIComponent;

  protected readonly interactions = computed<InteractionPreview[]>(() => {
    const messages = this.aiService.messages();
    const previews: InteractionPreview[] = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role !== 'user') continue;

      const aiResponse = messages[i + 1]?.role === 'model' ? messages[i + 1] : undefined;
      previews.push({
        id: msg.timestamp.getTime(),
        user: msg,
        ai: aiResponse,
        timestamp: msg.timestamp
      });
    }

    // Show most recent first
    return previews.reverse();
  });

  protected readonly starterPrompts = [
    'Give me a focused 7-day launch plan.',
    'What should I do today to keep momentum?',
    'Break my goal into the next three actions.',
    'Write a motivational boost for my mission.'
  ];

  protected clearConversation(): void {
    this.aiService.clearConversation();
  }

  protected runPrompt(prompt: string): void {
    if (this.aiPanel) {
      this.aiPanel.sendQuickPrompt(prompt);
    } else {
      this.aiService.addLocalUserMessage(prompt);
    }
  }

  protected trackByInteraction(_index: number, interaction: InteractionPreview): number {
    return interaction.id;
  }

  protected toggleTheme(): void {
    this.isLightMode.update((current) => !current);
  }

  protected toggleHistory(): void {
    this.showHistory.update((current) => !current);
  }
}


import { Injectable, inject, signal } from '@angular/core';
import { Functions, getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';
import { AuthService } from './auth.service';
import { RocketGoalsService } from './rocket-goals.service';
import type { RocketGoal } from './models/rocket-goal';

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  timestamp: Date;
}

interface AIRequest {
  message: string;
  conversationHistory?: { role: 'user' | 'model'; content: string }[];
  goalContext?: {
    title: string;
    primaryGoal: string;
    answers: Record<string, any>;
    status: string;
  };
}

interface AIResponse {
  response: string;
  model: string;
}

@Injectable({
  providedIn: 'root'
})
export class RocketGoalsAIService {
  private readonly functions = getFunctions(getApp(), 'us-central1');
  private readonly authService = inject(AuthService);
  private readonly goalsService = inject(RocketGoalsService);

  readonly messages = signal<ChatMessage[]>([]);
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);
  readonly isOpen = signal(false);

  private conversationHistory: { role: 'user' | 'model'; content: string }[] = [];

  private readonly systemPrompt = `You are RocketGoals AI, a helpful assistant for goal-setting and achievement. You help users create, manage, and achieve their goals using the 7-day Rocket Goal challenge methodology.

Your role is to:
1. Help users understand the 7-day challenge concept
2. Provide guidance on goal setting and achievement
3. Offer motivation and accountability support
4. Help users refine their goals and action plans
5. Answer questions about goal tracking and progress
6. Provide tips for staying motivated and overcoming obstacles

Key principles you follow:
- Be encouraging and supportive
- Focus on actionable advice
- Use the rocket metaphor when appropriate
- Keep responses concise but helpful
- Ask clarifying questions when needed
- Celebrate small wins and progress

If asked about technical issues or features, explain them clearly and suggest solutions.

Remember: Users are on a 7-day journey to transform their goals into reality. Help them launch successfully and stay on course!`;

  togglePanel(): void {
    this.isOpen.update(v => !v);
  }

  openPanel(): void {
    this.isOpen.set(true);
  }

  closePanel(): void {
    this.isOpen.set(false);
  }

  async sendMessage(userMessage: string, goalContext?: RocketGoal | null): Promise<string> {
    if (!userMessage.trim()) {
      throw new Error('Message cannot be empty');
    }

    this.isLoading.set(true);
    this.error.set(null);

    // Add user message to conversation
    const userChatMessage: ChatMessage = {
      role: 'user',
      content: userMessage.trim(),
      timestamp: new Date()
    };
    this.messages.update(msgs => [...msgs, userChatMessage]);

    try {
      // Prepare conversation history for context (last 10 messages for efficiency)
      const conversationHistory = this.messages()
        .slice(-10)
        .map(msg => ({
          role: msg.role,
          content: msg.content
        }));

      // Call the Cloud Function
      const callable = httpsCallable<AIRequest, AIResponse>(
        this.functions,
        'rocketGoalsAI'
      );

      const result = await callable({
        message: userMessage.trim(),
        conversationHistory: conversationHistory.slice(0, -1), // Exclude the current message we just added
        goalContext: goalContext ? {
          title: this.getGoalTitle(goalContext),
          primaryGoal: goalContext.primaryGoal || '',
          answers: goalContext.answers || {},
          status: goalContext.status
        } : undefined
      });

      // Add AI response to conversation
      const aiChatMessage: ChatMessage = {
        role: 'model',
        content: result.data.response,
        timestamp: new Date()
      };
      this.messages.update(msgs => [...msgs, aiChatMessage]);

      // Add to conversation history
      this.conversationHistory.push({
        role: 'user',
        content: userMessage.trim()
      });
      this.conversationHistory.push({
        role: 'model',
        content: result.data.response
      });

      // Keep only last 20 messages in history to manage context
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20);
      }

      return result.data.response;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get AI response';
      this.error.set(errorMessage);

      // Remove the user message if we failed
      this.messages.update(msgs => msgs.slice(0, -1));

      throw new Error(errorMessage);
    } finally {
      this.isLoading.set(false);
    }
  }

  clearConversation(): void {
    this.messages.set([]);
    this.conversationHistory = [];
    this.error.set(null);
  }

  addLocalUserMessage(content: string): void {
    const cleanContent = content.trim();
    if (!cleanContent) {
      return;
    }

    const message: ChatMessage = {
      role: 'user',
      content: cleanContent,
      timestamp: new Date(),
    };

    this.messages.update(msgs => [...msgs, message]);
  }

  private getGoalTitle(goal: RocketGoal): string {
    return goal.answers?.['goal_title_label'] ||
           goal.answers?.['custom_goal_title'] ||
           goal.primaryGoal ||
           'Untitled Goal';
  }
}

import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ElevenLabsService } from './elevenlabs.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, FormsModule, CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('rocket-goals');

  // Conversation state
  isConversationActive = signal(false);
  isSpeaking = signal(false);
  userMessage = '';
  conversationHistory: Array<{ role: 'user' | 'avatar', message: string }> = [];

  // Welcome messages
  private welcomeMessages = [
    "Hello! I'm Jim, your personal goal achievement coach. How can I help you today?",
    "Welcome to RocketGoals! I'm here to help you turn your dreams into reality. What would you like to know?",
    "Hi there! Ready to power your impossible goals? Let's get started!"
  ];

  constructor(private elevenLabsService: ElevenLabsService) { }

  public scrollToSection(sectionId: string): void {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  async startConversation(): Promise<void> {
    this.isConversationActive.set(true);
    this.conversationHistory = []; // Reset conversation history
    const welcomeMessage = this.welcomeMessages[Math.floor(Math.random() * this.welcomeMessages.length)];
    this.conversationHistory.push({ role: 'avatar', message: welcomeMessage });
    await this.speakMessage(welcomeMessage, 'avatar');
  }

  async sendMessage(): Promise<void> {
    if (!this.userMessage.trim() || this.isSpeaking()) {
      return;
    }

    const message = this.userMessage.trim();
    this.userMessage = '';

    // Add user message to history
    this.conversationHistory.push({ role: 'user', message });

    // Generate response (simple for now - you can integrate with an AI API later)
    const response = this.generateResponse(message);

    // Add avatar response to history
    this.conversationHistory.push({ role: 'avatar', message: response });

    // Speak the response
    await this.speakMessage(response, 'avatar');
  }

  private generateResponse(userMessage: string): string {
    const lowerMessage = userMessage.toLowerCase();

    // Simple response logic - you can replace this with an AI API call
    if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
      return "Hello! Great to meet you. What goal would you like to work on today?";
    } else if (lowerMessage.includes('goal') || lowerMessage.includes('help')) {
      return "I'd love to help you achieve your goals! Start by breaking down your big dream into smaller, manageable steps. What's one goal you'd like to focus on?";
    } else if (lowerMessage.includes('track') || lowerMessage.includes('progress')) {
      return "Tracking your progress is key to success! RocketGoals makes it easy to monitor your achievements and stay motivated. Would you like to learn more about our tracking features?";
    } else if (lowerMessage.includes('motivation') || lowerMessage.includes('motivated')) {
      return "Staying motivated can be challenging, but remember: every small step counts! Celebrate your wins, no matter how small. What's been your biggest win recently?";
    } else if (lowerMessage.includes('thank')) {
      return "You're very welcome! I'm here whenever you need support. Keep pushing forward!";
    } else {
      return "That's interesting! Tell me more about that, or ask me how I can help you achieve your goals with RocketGoals.";
    }
  }

  async speakMessage(message: string, role: 'user' | 'avatar'): Promise<void> {
    if (role !== 'avatar') {
      return;
    }

    this.isSpeaking.set(true);

    try {
      await this.elevenLabsService.speakAndPlay(message);
    } catch (error) {
      console.error('Error speaking message:', error);
    } finally {
      this.isSpeaking.set(false);
    }
  }

  closeConversation(): void {
    this.isConversationActive.set(false);
    this.conversationHistory = [];
    this.userMessage = '';
  }
}

import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ElevenLabsService } from './elevenlabs.service';
import { SpeechRecognitionService } from './speech-recognition.service';

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
  isListening = signal(false);
  userMessage = '';
  conversationHistory: Array<{ role: 'user' | 'avatar', message: string }> = [];
  errorMessage = signal<string | null>(null);
  speechSupported = signal(false);

  // Welcome messages
  private welcomeMessages = [
    "Hello! I'm Jim, your personal goal achievement coach. How can I help you today?",
    "Welcome to RocketGoals! I'm here to help you turn your dreams into reality. What would you like to know?",
    "Hi there! Ready to power your impossible goals? Let's get started!"
  ];

  constructor(
    private elevenLabsService: ElevenLabsService,
    private speechRecognitionService: SpeechRecognitionService
  ) {
    this.speechSupported.set(this.speechRecognitionService.isAvailable());
  }

  public scrollToSection(sectionId: string): void {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  async startConversation(): Promise<void> {
    this.isConversationActive.set(true);
    this.conversationHistory = []; // Reset conversation history
    this.errorMessage.set(null); // Clear any previous errors
    const welcomeMessage = this.welcomeMessages[Math.floor(Math.random() * this.welcomeMessages.length)];
    this.conversationHistory.push({ role: 'avatar', message: welcomeMessage });
    await this.speakMessage(welcomeMessage, 'avatar');
  }

  async sendMessage(message?: string): Promise<void> {
    const textToSend = message || this.userMessage.trim();

    if (!textToSend || this.isSpeaking() || this.isListening()) {
      return;
    }

    this.userMessage = '';
    this.errorMessage.set(null);

    // Add user message to history
    this.conversationHistory.push({ role: 'user', message: textToSend });

    // Generate response (simple for now - you can integrate with an AI API later)
    const response = this.generateResponse(textToSend);

    // Add avatar response to history
    this.conversationHistory.push({ role: 'avatar', message: response });

    // Speak the response
    await this.speakMessage(response, 'avatar');
  }

  async startListening(): Promise<void> {
    if (!this.speechSupported() || this.isListening() || this.isSpeaking()) {
      return;
    }

    this.isListening.set(true);
    this.errorMessage.set(null);

    try {
      const transcript = await this.speechRecognitionService.startListening();
      console.log('Speech recognized:', transcript);

      // Automatically send the transcribed message
      await this.sendMessage(transcript);
    } catch (error) {
      console.error('Speech recognition error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to recognize speech';
      this.errorMessage.set(errorMsg);
    } finally {
      this.isListening.set(false);
    }
  }

  stopListening(): void {
    if (this.isListening()) {
      this.speechRecognitionService.stopListening();
      this.isListening.set(false);
    }
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
    this.errorMessage.set(null);

    try {
      await this.elevenLabsService.speakAndPlay(message);
    } catch (error) {
      console.error('Error speaking message:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to generate speech. Please check your API key permissions.';
      this.errorMessage.set(errorMsg);
    } finally {
      this.isSpeaking.set(false);
    }
  }

  closeConversation(): void {
    this.stopListening();
    this.isConversationActive.set(false);
    this.conversationHistory = [];
    this.userMessage = '';
    this.errorMessage.set(null);
  }
}

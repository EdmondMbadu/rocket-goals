import { Component, signal, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ElevenLabsService } from './elevenlabs.service';
import { SpeechRecognitionService } from './speech-recognition.service';
import { FirestoreAIService } from './firestore-ai.service';
import { stripMarkdownForTTS } from './text-utils';

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
  isThinking = signal(false); // Indicates AI is processing
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

  // Lazy load services only when needed
  private elevenLabsService = inject(ElevenLabsService);
  private speechRecognitionService = inject(SpeechRecognitionService);
  private firestoreAIService = inject(FirestoreAIService);

  constructor() {
    // Check speech support without initializing the full service
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    this.speechSupported.set(!!SpeechRecognition);
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
    this.isThinking.set(true); // Show thinking indicator

    // Add user message to history
    this.conversationHistory.push({ role: 'user', message: textToSend });

    const startTime = performance.now();

    try {
      // Get AI response from Firestore
      console.log('Getting AI response for:', textToSend);
      const response = await this.firestoreAIService.getAIResponse(textToSend);
      
      const aiTime = performance.now() - startTime;
      console.log(`AI response received in ${aiTime.toFixed(0)}ms:`, response);

      // Store formatted response for display
      this.conversationHistory.push({ role: 'avatar', message: response });

      // Strip markdown for TTS (but keep formatted version in history)
      const cleanedResponse = stripMarkdownForTTS(response);
      console.log('Cleaned response for TTS:', cleanedResponse);

      this.isThinking.set(false); // Hide thinking indicator

      // Speak the cleaned response
      const ttsStartTime = performance.now();
      await this.speakMessage(cleanedResponse, 'avatar');
      const ttsTime = performance.now() - ttsStartTime;
      console.log(`TTS completed in ${ttsTime.toFixed(0)}ms`);
      console.log(`Total time: ${(performance.now() - startTime).toFixed(0)}ms`);
    } catch (error) {
      this.isThinking.set(false); // Hide thinking indicator on error
      console.error('Error getting AI response:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to get AI response';
      this.errorMessage.set(errorMsg);
      
      // Add error message to history
      this.conversationHistory.push({ 
        role: 'avatar', 
        message: 'Sorry, I encountered an error. Please try again.' 
      });
    }
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

      // Set listening to false before sending message (so sendMessage doesn't return early)
      this.isListening.set(false);

      // Automatically send the transcribed message
      await this.sendMessage(transcript);
    } catch (error) {
      console.error('Speech recognition error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to recognize speech';
      this.errorMessage.set(errorMsg);
      this.isListening.set(false);
    }
  }

  stopListening(): void {
    if (this.isListening()) {
      this.speechRecognitionService.stopListening();
      this.isListening.set(false);
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
    this.isThinking.set(false);
    this.conversationHistory = [];
    this.userMessage = '';
    this.errorMessage.set(null);
  }

  copyConversation(): void {
    if (this.conversationHistory.length === 0) {
      return;
    }

    const conversationText = this.conversationHistory
      .map(item => {
        const role = item.role === 'user' ? 'You' : "Jim's Avatar";
        const message = item.role === 'avatar' 
          ? item.message.replace(/<[^>]*>/g, '') // Strip HTML tags
          : item.message;
        return `${role}: ${message}`;
      })
      .join('\n\n');

    navigator.clipboard.writeText(conversationText).then(() => {
      // Show a brief success message (temporarily use errorMessage for display)
      const originalError = this.errorMessage();
      this.errorMessage.set('✓ Conversation copied to clipboard!');
      setTimeout(() => {
        // Only restore if there was an original error, otherwise clear
        this.errorMessage.set(originalError || null);
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy:', err);
      this.errorMessage.set('Failed to copy conversation. Please try again.');
    });
  }

  downloadConversationAsPDF(): void {
    if (this.conversationHistory.length === 0) {
      return;
    }

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
<title>RocketGoals Conversation</title>
<style>
@media print{@page{margin:1in}}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;line-height:1.6;color:#1a1a1a;max-width:800px;margin:0 auto;padding:20px}
h1{color:#dc2626;border-bottom:3px solid #dc2626;padding-bottom:10px;margin-bottom:30px}
.message{margin-bottom:20px;padding:15px;border-radius:8px}
.user-message{background-color:#dc2626;color:white;margin-left:20%;text-align:right}
.avatar-message{background-color:#f5f5f5;color:#1a1a1a;margin-right:20%}
.role{font-weight:bold;margin-bottom:8px;font-size:0.9em;opacity:0.9}
.content{white-space:pre-wrap}
.timestamp{font-size:0.8em;opacity:0.7;margin-top:10px}
</style>
</head>
<body>
<h1>RocketGoals Conversation</h1>
<div class="timestamp">Generated on ${new Date().toLocaleString()}</div>
${this.conversationHistory.map((item) => {
  const role = item.role === 'user' ? 'You' : "Jim's Avatar";
  const message = item.role === 'avatar' 
    ? item.message.replace(/<[^>]*>/g, '').replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1')
    : item.message;
  const messageClass = item.role === 'user' ? 'user-message' : 'avatar-message';
  return `<div class="message ${messageClass}"><div class="role">${role}</div><div class="content">${message}</div></div>`;
}).join('')}
</body>
</html>`;

    // Create blob and download directly
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `rocket-goals-conversation-${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Format message for display (convert markdown to HTML)
   * This is a simple formatter - you might want to use a proper markdown library
   */
  formatMessage(message: string): string {
    if (!message) return message;
    
    // Simple markdown to HTML conversion for display
    let formatted = message
      // Bold
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      // Line breaks
      .replace(/\n/g, '<br>');
    
    return formatted;
  }
}

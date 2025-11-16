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
  conversationHistory: Array<{ role: 'user' | 'avatar', message: string, displayedMessage?: string }> = [];
  errorMessage = signal<string | null>(null);
  speechSupported = signal(false);
  
  // Typewriter effect state
  private typewriterIntervals: Map<number, any> = new Map();
  private typewriterSpeed = 10; // milliseconds per character (faster = more responsive)
  private typewriterCatchUpSpeed = 5; // Even faster when catching up to new text

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
    let fullResponse = '';
    let firstChunkSpoken = false;

    try {
      // Get AI response from Firestore with streaming callback
      console.log('Getting AI response for:', textToSend);
      
      // Set up streaming callback for immediate TTS
      const streamCallback = async (chunk: string) => {
        const cleanedChunk = stripMarkdownForTTS(chunk);
        
        if (!firstChunkSpoken) {
          // First chunk - start speaking immediately
          firstChunkSpoken = true;
          this.isThinking.set(false); // Hide thinking indicator
          this.isSpeaking.set(true);
          
          const timeToFirstChunk = performance.now() - startTime;
          console.log(`⚡ Starting TTS in ${timeToFirstChunk.toFixed(0)}ms`);
          
          // Start streaming TTS
          await this.elevenLabsService.startStreaming(cleanedChunk);
          
          // Update conversation history with partial response
          fullResponse = chunk;
          // Remove any existing avatar message and add new one with typewriter
          this.conversationHistory = this.conversationHistory.filter(
            item => item.role !== 'avatar'
          );
          const avatarIndex = this.conversationHistory.length;
          this.conversationHistory.push({ 
            role: 'avatar', 
            message: fullResponse,
            displayedMessage: '' // Start with empty for typewriter effect
          });
          
          // Start typewriter effect
          this.startTypewriter(avatarIndex, fullResponse);
        } else {
          // Subsequent chunks - queue for TTS
          // Note: chunk here is only the new text (not the full accumulated)
          await this.elevenLabsService.addStreamChunk(cleanedChunk);
          
          // Update conversation history by appending the new chunk
          fullResponse += chunk;
          
          // Find the avatar message and update it
          const avatarIndex = this.conversationHistory.findIndex(
            item => item.role === 'avatar'
          );
          
          if (avatarIndex >= 0) {
            // Update the full message
            this.conversationHistory[avatarIndex].message = fullResponse;
            // Continue typewriter effect with new text
            this.continueTypewriter(avatarIndex, fullResponse);
          } else {
            // If no avatar message found, create one
            const newIndex = this.conversationHistory.length;
            this.conversationHistory.push({ 
              role: 'avatar', 
              message: fullResponse,
              displayedMessage: ''
            });
            this.startTypewriter(newIndex, fullResponse);
          }
        }
      };
      
      const response = await this.firestoreAIService.getAIResponse(textToSend, streamCallback);
      
      const aiTime = performance.now() - startTime;
      console.log(`AI response received in ${aiTime.toFixed(0)}ms:`, response);

      // Store final formatted response for display
      fullResponse = response;
      
      // Ensure typewriter completes for final response
      const avatarIndex = this.conversationHistory.findIndex(
        item => item.role === 'avatar'
      );
      
      if (avatarIndex >= 0) {
        this.conversationHistory[avatarIndex].message = fullResponse;
        // Complete typewriter effect
        this.completeTypewriter(avatarIndex, fullResponse);
      } else {
        this.conversationHistory.push({ 
          role: 'avatar', 
          message: fullResponse,
          displayedMessage: ''
        });
        this.startTypewriter(this.conversationHistory.length - 1, fullResponse);
      }

      // Finish streaming TTS
      await this.elevenLabsService.finishStreaming();
      this.isSpeaking.set(false);
      
      const totalTime = performance.now() - startTime;
      console.log(`Total time: ${totalTime.toFixed(0)}ms`);
    } catch (error) {
      this.isThinking.set(false); // Hide thinking indicator on error
      this.isSpeaking.set(false);
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
    // Clear all typewriter intervals
    this.typewriterIntervals.forEach(interval => clearInterval(interval));
    this.typewriterIntervals.clear();
    this.conversationHistory = [];
    this.userMessage = '';
    this.errorMessage.set(null);
  }

  /**
   * Start typewriter effect for a message
   */
  private startTypewriter(index: number, fullText: string): void {
    // Clear any existing interval for this index
    if (this.typewriterIntervals.has(index)) {
      clearInterval(this.typewriterIntervals.get(index));
    }
    
    const displayedLength = this.conversationHistory[index]?.displayedMessage?.length || 0;
    let currentLength = displayedLength;
    
    const interval = setInterval(() => {
      if (currentLength < fullText.length) {
        currentLength++;
        // Update displayed message
        if (this.conversationHistory[index]) {
          this.conversationHistory[index].displayedMessage = fullText.substring(0, currentLength);
          // Trigger change detection by creating new array reference
          this.conversationHistory = [...this.conversationHistory];
        }
      } else {
        // Typewriter complete
        clearInterval(interval);
        this.typewriterIntervals.delete(index);
      }
    }, this.typewriterSpeed);
    
    this.typewriterIntervals.set(index, interval);
  }

  /**
   * Continue typewriter effect with new text
   */
  private continueTypewriter(index: number, fullText: string): void {
    // If typewriter is already running, restart with faster speed to catch up
    if (this.typewriterIntervals.has(index)) {
      // Clear existing and restart with catch-up speed
      clearInterval(this.typewriterIntervals.get(index));
      this.typewriterIntervals.delete(index);
    }
    
    // Start with catch-up speed if there's a gap, otherwise normal speed
    const currentDisplayed = this.conversationHistory[index]?.displayedMessage?.length || 0;
    const gap = fullText.length - currentDisplayed;
    
    if (gap > 20) {
      // Large gap - use catch-up speed
      this.startTypewriterWithSpeed(index, fullText, this.typewriterCatchUpSpeed);
    } else {
      // Small gap - use normal speed
      this.startTypewriter(index, fullText);
    }
  }

  /**
   * Start typewriter with custom speed
   */
  private startTypewriterWithSpeed(index: number, fullText: string, speed: number): void {
    // Clear any existing interval for this index
    if (this.typewriterIntervals.has(index)) {
      clearInterval(this.typewriterIntervals.get(index));
    }
    
    const displayedLength = this.conversationHistory[index]?.displayedMessage?.length || 0;
    let currentLength = displayedLength;
    
    const interval = setInterval(() => {
      if (currentLength < fullText.length) {
        currentLength++;
        // Update displayed message
        if (this.conversationHistory[index]) {
          this.conversationHistory[index].displayedMessage = fullText.substring(0, currentLength);
          // Trigger change detection by creating new array reference
          this.conversationHistory = [...this.conversationHistory];
        }
      } else {
        // Typewriter complete
        clearInterval(interval);
        this.typewriterIntervals.delete(index);
      }
    }, speed);
    
    this.typewriterIntervals.set(index, interval);
  }

  /**
   * Complete typewriter effect immediately
   */
  private completeTypewriter(index: number, fullText: string): void {
    // Clear interval and set to full text
    if (this.typewriterIntervals.has(index)) {
      clearInterval(this.typewriterIntervals.get(index));
      this.typewriterIntervals.delete(index);
    }
    
    if (this.conversationHistory[index]) {
      this.conversationHistory[index].displayedMessage = fullText;
      this.conversationHistory = [...this.conversationHistory];
    }
  }

  copyConversation(): void {
    if (this.conversationHistory.length === 0) {
      return;
    }

    const conversationText = this.conversationHistory
      .map(item => {
        const role = item.role === 'user' ? 'You' : "Jim's Avatar";
        let message = item.role === 'avatar' 
          ? item.message
          : item.message;
        
        // Convert HTML line breaks to actual newlines first
        message = message.replace(/<br\s*\/?>/gi, '\n');
        
        // Strip HTML tags but preserve line breaks
        message = message.replace(/<[^>]*>/g, '');
        
        // Clean up markdown asterisks and weird punctuation, but preserve spacing and line breaks
        message = message
          .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold markdown (**text** -> text)
          .replace(/\*(.*?)\*/g, '$1') // Remove italic markdown (*text* -> text)
          .replace(/`(.*?)`/g, '$1') // Remove inline code
          .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1') // Remove markdown links but keep text
          .replace(/[•·▪▫‣⁃]/g, '-') // Replace weird bullet points with dash
          .replace(/[—–]/g, '-') // Replace em/en dashes with regular dash
          .replace(/[""]/g, '"') // Replace smart quotes with regular quotes
          .replace(/['']/g, "'"); // Replace smart apostrophes with regular apostrophe
        // Note: We intentionally DON'T normalize whitespace to preserve line breaks and spacing
        
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
<meta charset="utf-8">
<style>
@media print{@page{margin:1in;size:letter}}
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
  let message = item.role === 'avatar' 
    ? item.message.replace(/<[^>]*>/g, '').replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1')
    : item.message;
  // Clean up weird punctuation
  message = message
    .replace(/[•·▪▫‣⁃]/g, '-')
    .replace(/[—–]/g, '-')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'");
  const messageClass = item.role === 'user' ? 'user-message' : 'avatar-message';
  return `<div class="message ${messageClass}"><div class="role">${role}</div><div class="content">${message}</div></div>`;
}).join('')}
</body>
</html>`;

    // Create a hidden iframe and trigger print to generate PDF
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    
    document.body.appendChild(iframe);
    
    const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
    if (iframeDoc) {
      iframeDoc.open();
      iframeDoc.write(htmlContent);
      iframeDoc.close();
      
      // Wait for content to load, then trigger print
      iframe.onload = () => {
        setTimeout(() => {
          iframe.contentWindow?.print();
          // Remove iframe after a delay
          setTimeout(() => {
            document.body.removeChild(iframe);
          }, 1000);
        }, 250);
      };
    } else {
      // Fallback: open in new window
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        setTimeout(() => {
          printWindow.print();
        }, 250);
      }
      document.body.removeChild(iframe);
    }
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

import { Component, signal, computed, inject } from '@angular/core';
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
  
  // Conversation mode: 'voice' (default) or 'chat'
  conversationMode = signal<'voice' | 'chat'>('voice');
  
  // Conversation state management
  conversationState = signal<'idle' | 'waiting_for_user' | 'ai_speaking' | 'user_speaking' | 'processing'>('idle');
  isWaitingForUser = signal(false); // Indicates AI is waiting for user response
  
  // Timer state management
  conversationStartTime = signal<number | null>(null);
  private currentTime = signal<number>(Date.now()); // Signal that updates every second to trigger recomputation
  private readonly CONVERSATION_TIME_LIMIT = 120; // 2 minutes in seconds
  conversationElapsedTime = computed(() => {
    const start = this.conversationStartTime();
    const now = this.currentTime();
    if (!start) return 0;
    return Math.floor((now - start) / 1000);
  });
  conversationTimeRemaining = computed(() => {
    return Math.max(0, this.CONVERSATION_TIME_LIMIT - this.conversationElapsedTime());
  });
  isTimeUp = computed(() => this.conversationTimeRemaining() === 0);
  shouldAskForEmail = signal(false);
  isWaitingForEmail = signal(false);
  userEmail = signal<string | null>(null);
  isGeneratingPlan = signal(false);
  private timerInterval: any = null;
  
  // Typewriter effect state
  private typewriterIntervals: Map<number, any> = new Map();
  private typewriterSpeed = 10; // milliseconds per character (faster = more responsive)
  private typewriterCatchUpSpeed = 5; // Even faster when catching up to new text

  // Welcome messages
  private welcomeMessages = [
    "Hi! I'm Jim. I'll help you create your instant Rocket Goals Launch Plan. It's free and takes just two minutes - let's get started! What's the one goal you're most excited about achieving?",
    "Hi! I'm Jim. I'll help you create your instant Rocket Goals Launch Plan. It's free and takes just two minutes - let's get started! What's the one goal you're most excited about achieving?",
    "Hi! I'm Jim. I'll help you create your instant Rocket Goals Launch Plan. It's free and takes just two minutes - let's get started! What's the one goal you're most excited about achieving?"
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
    
    // Start timer
    this.conversationStartTime.set(Date.now());
    this.shouldAskForEmail.set(false);
    this.isWaitingForEmail.set(false);
    this.userEmail.set(null);
    this.isGeneratingPlan.set(false);
    this.startTimerCheck();
    
    const welcomeMessage = this.welcomeMessages[Math.floor(Math.random() * this.welcomeMessages.length)];
    this.conversationHistory.push({ role: 'avatar', message: welcomeMessage });
    
    // Only speak welcome message in voice mode
    if (this.conversationMode() === 'voice') {
      await this.speakMessage(welcomeMessage, 'avatar');
    }
    
    // Auto-start listening after welcome message only in Voice mode
    if (this.conversationMode() === 'voice' && this.speechSupported() && !this.isListening()) {
      setTimeout(() => {
        if (this.isConversationActive() && !this.isListening() && !this.isSpeaking()) {
          console.log('🎤 Auto-starting microphone after welcome message (Voice mode)');
          this.startListening();
        }
      }, 1000); // Wait a bit longer for welcome message to finish
    }
  }
  
  private startTimerCheck(): void {
    // Clear any existing interval
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }
    
    this.timerInterval = setInterval(() => {
      // Update currentTime signal to trigger recomputation of elapsed time
      this.currentTime.set(Date.now());
      
      if (this.isTimeUp() && !this.shouldAskForEmail() && !this.isGeneratingPlan() && !this.isWaitingForEmail()) {
        // Time is up - generate plan first, then ask for email
        this.generatePlanAndRequestEmail();
      }
    }, 1000);
  }
  
  formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  
  private async generatePlanAndRequestEmail(): Promise<void> {
    if (this.isGeneratingPlan()) {
      return; // Already generating
    }
    
    this.isGeneratingPlan.set(true);
    this.shouldAskForEmail.set(true);
    
    // Stop listening if active
    this.stopListening();
    
    // Interrupt AI if speaking
    if (this.isSpeaking()) {
      this.interruptAI();
    }
    
    // Add message that plan is being generated
    const generatingMessage = "Great conversation! I'm now creating your personalized Rocket Goals Launch Plan based on everything we discussed. This will just take a moment...";
    this.conversationHistory.push({ role: 'avatar', message: generatingMessage });
    
    // Speak the message (voice mode only)
    if (this.conversationMode() === 'voice') {
      await this.speakMessage(generatingMessage, 'avatar');
    }
    
    try {
      // Generate the plan with generatePlan: true
      // Use a more explicit prompt and exclude the "generating plan" message from history
      const planPrompt = "Generate a comprehensive Rocket Goals Launch Plan based on the entire conversation. Create a well-structured document with:\n\n1. EXECUTIVE SUMMARY\n   - User's primary goals and aspirations\n   - Key motivations and values identified\n\n2. KEY INSIGHTS\n   - Important discoveries from the conversation\n   - Challenges and opportunities identified\n\n3. ACTIONABLE STEPS\n   - Specific, measurable actions the user can take\n   - Prioritized by importance and impact\n   - Timeline recommendations where relevant\n\n4. PERSONALIZED RECOMMENDATIONS\n   - Customized strategies based on the user's unique situation\n   - Resources and next steps\n\n5. INSPIRATION & MOTIVATION\n   - Encouraging message tailored to the user\n\nFormat with clear headers (use ## for main sections, ### for subsections), bullet points, and organized structure. Make it comprehensive and detailed - this is the final deliverable.";
      
      // Exclude the "generating plan" message from history - only pass actual conversation
      const conversationForPlan = this.conversationHistory.filter((item, index) => {
        // Exclude the last message (the "generating plan" message we just added)
        return index < this.conversationHistory.length - 1;
      });
      
      this.isThinking.set(true);
      const plan = await this.firestoreAIService.getAIResponse(
        planPrompt,
        conversationForPlan, // Use filtered history without the "generating" message
        async (chunk: string) => {
          // Stream plan chunks (but don't speak them in voice mode - too long)
          const lastIndex = this.conversationHistory.length - 1;
          if (this.conversationHistory[lastIndex]?.role === 'avatar') {
            this.conversationHistory[lastIndex].message = chunk;
            this.conversationHistory[lastIndex].displayedMessage = chunk;
            this.conversationHistory = [...this.conversationHistory];
          }
        },
        this.conversationMode(),
        true // generatePlan: true
      );
      
      this.isThinking.set(false);
      
      // Update the last message with the full plan
      const lastIndex = this.conversationHistory.length - 1;
      if (this.conversationHistory[lastIndex]?.role === 'avatar') {
        this.conversationHistory[lastIndex].message = plan;
        this.conversationHistory[lastIndex].displayedMessage = plan;
        this.conversationHistory = [...this.conversationHistory];
      }
      
      // Now ask for email
      await this.requestEmail();
    } catch (error) {
      console.error('Error generating plan:', error);
      this.isThinking.set(false);
      // Still ask for email even if plan generation fails
      await this.requestEmail();
    }
  }
  
  private async requestEmail(): Promise<void> {
    this.isGeneratingPlan.set(false);
    this.isWaitingForEmail.set(true);
    
    const emailRequestMessage = "Perfect! Your Rocket Goals Launch Plan is ready. To receive it, I'll need your email address. Please type your email below:";
    this.conversationHistory.push({ role: 'avatar', message: emailRequestMessage });
    
    // Speak the request (voice mode only)
    if (this.conversationMode() === 'voice') {
      await this.speakMessage(emailRequestMessage, 'avatar');
    }
  }
  
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  }

  async sendMessage(message?: string): Promise<void> {
    const textToSend = message || this.userMessage.trim();

    if (!textToSend || this.isListening()) {
      return;
    }

    // Check if we're waiting for email
    if (this.isWaitingForEmail()) {
      const email = textToSend.trim();
      
      if (this.isValidEmail(email)) {
        // Valid email - capture it
        this.userEmail.set(email);
        this.isWaitingForEmail.set(false);
        
        // Add confirmation message
        const confirmationMessage = `Perfect! I've got your email (${email}). Your Rocket Goals Launch Plan is ready to download!`;
        this.conversationHistory.push({ role: 'avatar', message: confirmationMessage });
        
        // Speak confirmation (voice mode only)
        if (this.conversationMode() === 'voice') {
          await this.speakMessage(confirmationMessage, 'avatar');
        }
        
        this.userMessage = '';
        return; // Don't proceed with normal message flow
      } else {
        // Invalid email - ask again
        const errorMessage = "That doesn't look like a valid email address. Please enter your email in the format: yourname@example.com";
        this.conversationHistory.push({ role: 'avatar', message: errorMessage });
        
        if (this.conversationMode() === 'voice') {
          await this.speakMessage(errorMessage, 'avatar');
        }
        
        this.userMessage = '';
        return;
      }
    }

    // If AI is speaking, interrupt it first
    if (this.isSpeaking()) {
      console.log('🛑 User interrupting AI speech with typed message...');
      this.interruptAI();
    }

    this.userMessage = '';
    this.errorMessage.set(null);
    this.isThinking.set(true); // Show thinking indicator
    this.conversationState.set('processing');
    this.isWaitingForUser.set(false);

    // Add user message to history
    this.conversationHistory.push({ role: 'user', message: textToSend });

    const startTime = performance.now();
    let fullResponse = '';
    let firstChunkSpoken = false;

    try {
      // Get AI response from Firestore with streaming callback
      console.log('Getting AI response for:', textToSend);
      
      // Set up streaming callback for immediate TTS (only in voice mode)
      const streamCallback = async (chunk: string) => {
        const cleanedChunk = stripMarkdownForTTS(chunk);
        const isVoiceMode = this.conversationMode() === 'voice';
        
        if (!firstChunkSpoken) {
          // First chunk - start speaking immediately (only in voice mode)
          firstChunkSpoken = true;
          this.isThinking.set(false); // Hide thinking indicator
          if (isVoiceMode) {
            this.isSpeaking.set(true);
            this.conversationState.set('ai_speaking');
            
            const timeToFirstChunk = performance.now() - startTime;
            console.log(`⚡ Starting TTS in ${timeToFirstChunk.toFixed(0)}ms (Voice mode)`);
            
            // Start streaming TTS
            await this.elevenLabsService.startStreaming(cleanedChunk);
          } else {
            this.conversationState.set('waiting_for_user');
            console.log(`📝 Chat mode - skipping TTS`);
          }
          
          // Update conversation history with partial response
          fullResponse = chunk;
          // Find and remove only the LAST avatar message (current streaming one), not all avatar messages
          const lastAvatarIndex = this.conversationHistory.map((item, idx) => 
            item.role === 'avatar' ? idx : -1
          ).filter(idx => idx !== -1).pop();
          
          if (lastAvatarIndex !== undefined) {
            // Remove only the last avatar message (the one currently being streamed)
            this.conversationHistory.splice(lastAvatarIndex, 1);
          }
          
          const avatarIndex = this.conversationHistory.length;
          this.conversationHistory.push({ 
            role: 'avatar', 
            message: fullResponse,
            displayedMessage: '' // Start with empty for typewriter effect
          });
          
          // Start typewriter effect
          this.startTypewriter(avatarIndex, fullResponse);
        } else {
          // Subsequent chunks - queue for TTS (only in voice mode)
          if (isVoiceMode) {
            // Note: chunk here is only the new text (not the full accumulated)
            await this.elevenLabsService.addStreamChunk(cleanedChunk);
          }
          
          // Update conversation history by appending the new chunk
          fullResponse += chunk;
          
          // Find the LAST avatar message (the one currently being streamed) and update it
          // Find all avatar indices, get the last one
          const avatarIndices = this.conversationHistory
            .map((item, idx) => item.role === 'avatar' ? idx : -1)
            .filter(idx => idx !== -1);
          const avatarIndex = avatarIndices.length > 0 ? avatarIndices[avatarIndices.length - 1] : -1;
          
          if (avatarIndex >= 0) {
            // Update the last avatar message (the one currently being streamed)
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
      
      const response = await this.firestoreAIService.getAIResponse(textToSend, this.conversationHistory, streamCallback, this.conversationMode());
      
      const aiTime = performance.now() - startTime;
      console.log(`AI response received in ${aiTime.toFixed(0)}ms:`, response);

      // Store final formatted response for display
      fullResponse = response;
      
      // Ensure typewriter completes for final response
      // Find the LAST avatar message (the one currently being streamed)
      const avatarIndices = this.conversationHistory
        .map((item, idx) => item.role === 'avatar' ? idx : -1)
        .filter(idx => idx !== -1);
      const avatarIndex = avatarIndices.length > 0 ? avatarIndices[avatarIndices.length - 1] : -1;
      
      if (avatarIndex >= 0) {
        // Update the last avatar message
        this.conversationHistory[avatarIndex].message = fullResponse;
        // Complete typewriter effect
        this.completeTypewriter(avatarIndex, fullResponse);
      } else {
        // If no avatar message found, create one
        this.conversationHistory.push({ 
          role: 'avatar', 
          message: fullResponse,
          displayedMessage: ''
        });
        this.startTypewriter(this.conversationHistory.length - 1, fullResponse);
      }

      // Finish streaming TTS (only in voice mode)
      if (this.conversationMode() === 'voice') {
        await this.elevenLabsService.finishStreaming();
        this.isSpeaking.set(false);
      }
      this.conversationState.set('waiting_for_user');
      this.isWaitingForUser.set(true);
      
      const totalTime = performance.now() - startTime;
      console.log(`Total time: ${totalTime.toFixed(0)}ms`);
      console.log('✅ AI finished speaking - waiting for user response');
      
      // Auto-start listening only in Voice mode - longer delay for more natural feel
      if (this.conversationMode() === 'voice' && this.speechSupported() && this.isConversationActive() && !this.isListening()) {
        // Longer delay to let the response sink in and feel more natural
        setTimeout(() => {
          if (this.isConversationActive() && !this.isListening() && !this.isSpeaking()) {
            console.log('🎤 Auto-starting microphone after AI finished speaking (Voice mode)');
            this.startListening();
          }
        }, 800); // Increased from 500ms to 800ms for more natural pause
      }
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
    if (!this.speechSupported() || this.isListening()) {
      return;
    }

    // If AI is speaking, interrupt it first
    if (this.isSpeaking()) {
      console.log('🛑 User interrupting AI speech...');
      this.interruptAI();
      // Small delay to ensure audio is fully stopped before starting speech recognition
      await new Promise(resolve => setTimeout(resolve, 50)); // Reduced from 100ms for faster response
    }

    this.isListening.set(true);
    this.conversationState.set('user_speaking');
    this.isWaitingForUser.set(false);
    this.errorMessage.set(null);

    try {
      const transcript = await this.speechRecognitionService.startListening();
      console.log('Speech recognized:', transcript);

      // Set listening to false before sending message (so sendMessage doesn't return early)
      this.isListening.set(false);

      // Automatically send the transcribed message
      await this.sendMessage(transcript);
      
      // Note: sendMessage will auto-start listening again after AI responds
    } catch (error) {
      console.error('Speech recognition error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Failed to recognize speech';
      this.errorMessage.set(errorMsg);
      this.isListening.set(false);
    }
  }

  /**
   * Interrupt AI speech and stop all audio playback with state preservation
   */
  private interruptAI(): void {
    console.log('🛑 Interrupting AI...');
    
    // Stop all audio playback
    this.elevenLabsService.stopAll();
    
    // Stop typewriter effects
    this.typewriterIntervals.forEach(interval => clearInterval(interval));
    this.typewriterIntervals.clear();
    
    // Complete any partial typewriter messages (preserve what was said)
    this.conversationHistory.forEach(item => {
      if (item.role === 'avatar' && item.displayedMessage !== undefined) {
        item.displayedMessage = item.message; // Complete the message display
      }
    });
    
    // Reset speaking state but preserve conversation state
    this.isSpeaking.set(false);
    this.isThinking.set(false);
    this.conversationState.set('waiting_for_user');
    
    console.log('✅ AI interrupted - ready for user input');
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
    console.log('🛑 Closing conversation and stopping all activity...');
    
    // Stop speech recognition
    this.stopListening();
    this.speechRecognitionService.abort();
    
    // Stop all audio playback (TTS)
    this.elevenLabsService.stopAll();
    
    // Cancel all AI requests
    this.firestoreAIService.cancelAll();
    
    // Clear timer
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    
    // Reset all state
    this.isConversationActive.set(false);
    this.isSpeaking.set(false);
    this.isListening.set(false);
    this.isThinking.set(false);
    this.conversationState.set('idle');
    this.isWaitingForUser.set(false);
    this.conversationStartTime.set(null);
    this.shouldAskForEmail.set(false);
    this.isWaitingForEmail.set(false);
    this.isGeneratingPlan.set(false);
    
    // Clear all typewriter intervals
    this.typewriterIntervals.forEach(interval => clearInterval(interval));
    this.typewriterIntervals.clear();
    
    // Clear conversation data
    this.conversationHistory = [];
    this.userMessage = '';
    this.errorMessage.set(null);
    this.userEmail.set(null);
    
    console.log('✅ Conversation closed and all activity stopped');
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

  /**
   * Convert image to base64 data URL for PDF embedding
   */
  private async imageToBase64(imagePath: string): Promise<string> {
    try {
      const response = await fetch(imagePath);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('Error converting image to base64:', error);
      return ''; // Return empty string if conversion fails
    }
  }

  /**
   * Convert markdown to HTML for PDF rendering
   */
  private markdownToHtml(markdown: string): string {
    if (!markdown) return '';
    
    // Split into lines for better processing
    const lines = markdown.split('\n');
    let html = '';
    let inList = false;
    let listType = 'ul';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Headers
      if (line.startsWith('### ')) {
        if (inList) {
          html += `</${listType}>`;
          inList = false;
        }
        html += `<h3>${line.substring(4)}</h3>`;
        continue;
      }
      if (line.startsWith('## ')) {
        if (inList) {
          html += `</${listType}>`;
          inList = false;
        }
        html += `<h2>${line.substring(3)}</h2>`;
        continue;
      }
      if (line.startsWith('# ')) {
        if (inList) {
          html += `</${listType}>`;
          inList = false;
        }
        html += `<h1>${line.substring(2)}</h1>`;
        continue;
      }
      
      // Lists
      const bulletMatch = line.match(/^[\*\-] (.+)$/);
      const numberMatch = line.match(/^\d+\. (.+)$/);
      
      if (bulletMatch || numberMatch) {
        const newListType = bulletMatch ? 'ul' : 'ol';
        const content = bulletMatch ? bulletMatch[1] : numberMatch![1];
        
        if (!inList || listType !== newListType) {
          if (inList) {
            html += `</${listType}>`;
          }
          html += `<${newListType}>`;
          inList = true;
          listType = newListType;
        }
        
        // Process inline formatting
        let processedContent = content
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>');
        
        html += `<li>${processedContent}</li>`;
        continue;
      }
      
      // End list if we hit a non-list line
      if (inList && line !== '') {
        html += `</${listType}>`;
        inList = false;
      }
      
      // Regular paragraph
      if (line !== '') {
        let processedLine = line
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>');
        
        // Check if it's already a paragraph or header
        if (!processedLine.startsWith('<')) {
          html += `<p>${processedLine}</p>`;
        } else {
          html += processedLine;
        }
      } else if (!inList) {
        // Empty line - add spacing
        html += '<br>';
      }
    }
    
    // Close any open list
    if (inList) {
      html += `</${listType}>`;
    }
    
    return html;
  }

  /**
   * Check if a message is the generated plan (has markdown headers)
   */
  private isPlanMessage(message: string): boolean {
    // Check if message contains markdown headers (## or ###)
    return /^##?\s/.test(message) || message.includes('EXECUTIVE SUMMARY') || message.includes('KEY INSIGHTS') || message.includes('ACTIONABLE STEPS');
  }

  async downloadConversationAsPDF(): Promise<void> {
    if (this.conversationHistory.length === 0) {
      return;
    }

    // Convert logo to base64
    const logoBase64 = await this.imageToBase64('/assets/rocket-goals.png');
    const logoImg = logoBase64 ? `<img src="${logoBase64}" alt="RocketGoals" style="height: 60px; width: auto;" />` : '<div style="font-size: 24px; font-weight: bold; color: #dc2626;">RocketGoals</div>';

    // Separate conversation and plan
    const conversationMessages: Array<{ role: 'user' | 'avatar', message: string }> = [];
    const planMessages: Array<string> = [];
    
    for (const item of this.conversationHistory) {
      if (item.role === 'avatar' && this.isPlanMessage(item.message)) {
        planMessages.push(item.message);
      } else {
        conversationMessages.push(item);
      }
    }

    const htmlContent = `<!DOCTYPE html>
<html>
<head>
<title>RocketGoals Launch Plan</title>
<meta charset="utf-8">
<style>
@page {
  margin: 0.75in;
  size: letter;
}
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  line-height: 1.7;
  color: #1a1a1a;
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  background: white;
}
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 40px;
  padding-bottom: 20px;
  border-bottom: 3px solid #dc2626;
}
.header-content {
  flex: 1;
}
.header h1 {
  color: #dc2626;
  font-size: 32px;
  font-weight: 900;
  margin: 0 0 8px 0;
  border: none;
  padding: 0;
}
.header .subtitle {
  color: #666;
  font-size: 14px;
  margin: 0;
}
.timestamp {
  font-size: 12px;
  color: #999;
  margin-top: 8px;
}
.conversation-section {
  margin-bottom: 50px;
  page-break-inside: avoid;
}
.section-title {
  color: #dc2626;
  font-size: 24px;
  font-weight: 700;
  margin: 40px 0 20px 0;
  padding-bottom: 10px;
  border-bottom: 2px solid #dc2626;
}
.message {
  margin-bottom: 20px;
  padding: 15px 20px;
  border-radius: 12px;
  page-break-inside: avoid;
}
.user-message {
  background-color: #dc2626;
  color: white;
  margin-left: 20%;
  text-align: right;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}
.avatar-message {
  background-color: #f5f5f5;
  color: #1a1a1a;
  margin-right: 20%;
  border: 1px solid #e5e5e5;
}
.role {
  font-weight: 700;
  margin-bottom: 8px;
  font-size: 0.85em;
  opacity: 0.9;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.content {
  white-space: pre-wrap;
  word-wrap: break-word;
}
.plan-section {
  margin-top: 50px;
  page-break-before: always;
  background: white;
}
.plan-content {
  color: #1a1a1a;
  line-height: 1.8;
}
.plan-content h1 {
  color: #dc2626;
  font-size: 28px;
  font-weight: 800;
  margin: 30px 0 20px 0;
  padding-bottom: 10px;
  border-bottom: 2px solid #dc2626;
}
.plan-content h2 {
  color: #dc2626;
  font-size: 22px;
  font-weight: 700;
  margin: 25px 0 15px 0;
  padding-top: 15px;
}
.plan-content h3 {
  color: #333;
  font-size: 18px;
  font-weight: 600;
  margin: 20px 0 12px 0;
}
.plan-content p {
  margin: 12px 0;
  text-align: justify;
}
.plan-content ul, .plan-content ol {
  margin: 15px 0;
  padding-left: 30px;
}
.plan-content li {
  margin: 8px 0;
  line-height: 1.6;
}
.plan-content strong {
  color: #dc2626;
  font-weight: 700;
}
.separator {
  height: 2px;
  background: linear-gradient(to right, transparent, #dc2626, transparent);
  margin: 40px 0;
  page-break-inside: avoid;
}
@media print {
  .message {
    page-break-inside: avoid;
  }
  .plan-section {
    page-break-before: always;
  }
}
</style>
</head>
<body>
<div class="header">
  ${logoImg}
  <div class="header-content" style="margin-left: 20px;">
    <h1>RocketGoals Launch Plan</h1>
    <div class="subtitle">Your Personalized Goal Achievement Roadmap</div>
    <div class="timestamp">Generated on ${new Date().toLocaleString()}</div>
  </div>
</div>

${conversationMessages.length > 0 ? `
<div class="conversation-section">
  <div class="section-title">Conversation</div>
  ${conversationMessages.map((item) => {
    const role = item.role === 'user' ? 'You' : "Jim's Avatar";
    let message = item.message;
    // Clean up HTML tags but preserve content
    message = message.replace(/<[^>]*>/g, '');
    // Clean up weird punctuation
    message = message
      .replace(/[•·▪▫‣⁃]/g, '•')
      .replace(/[—–]/g, '-')
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'");
    const messageClass = item.role === 'user' ? 'user-message' : 'avatar-message';
    return `<div class="message ${messageClass}"><div class="role">${role}</div><div class="content">${message}</div></div>`;
  }).join('')}
</div>
` : ''}

${planMessages.length > 0 ? `
<div class="separator"></div>
<div class="plan-section">
  <div class="section-title">Your Rocket Goals Launch Plan</div>
  <div class="plan-content">
    ${planMessages.map(plan => this.markdownToHtml(plan)).join('<div class="separator" style="margin: 30px 0;"></div>')}
  </div>
</div>
` : ''}
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
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 1000);
        }, 500); // Increased delay to ensure images load
      };
    } else {
      // Fallback: open in new window
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        setTimeout(() => {
          printWindow.print();
        }, 500);
      }
      if (document.body.contains(iframe)) {
        document.body.removeChild(iframe);
      }
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

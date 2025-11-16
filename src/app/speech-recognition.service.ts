import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class SpeechRecognitionService {
  private recognition: any = null;
  private isSupported = false;

  constructor() {
    // Check if browser supports speech recognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      this.isSupported = true;
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false; // Stop after user finishes speaking
      this.recognition.interimResults = false; // Only return final results
      this.recognition.lang = 'en-US'; // Set language
    }
  }

  isAvailable(): boolean {
    return this.isSupported;
  }

  startListening(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.isSupported || !this.recognition) {
        reject(new Error('Speech recognition is not supported in this browser'));
        return;
      }

      let finalTranscript = '';

      this.recognition.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          }
        }
      };

      this.recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'no-speech') {
          reject(new Error('No speech detected. Please try again.'));
        } else if (event.error === 'audio-capture') {
          reject(new Error('No microphone found. Please check your microphone settings.'));
        } else if (event.error === 'not-allowed') {
          reject(new Error('Microphone permission denied. Please allow microphone access.'));
        } else {
          reject(new Error(`Speech recognition error: ${event.error}`));
        }
      };

      this.recognition.onend = () => {
        if (finalTranscript.trim()) {
          resolve(finalTranscript.trim());
        } else {
          reject(new Error('No speech detected'));
        }
      };

      // Start listening
      try {
        this.recognition.start();
      } catch (error) {
        reject(new Error('Failed to start speech recognition. It may already be running.'));
      }
    });
  }

  stopListening(): void {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (error) {
        // Ignore errors when stopping
      }
    }
  }

  abort(): void {
    if (this.recognition) {
      try {
        this.recognition.abort();
      } catch (error) {
        // Ignore errors when aborting
      }
    }
  }
}


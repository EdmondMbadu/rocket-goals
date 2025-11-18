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
      this.recognition.continuous = true; // Keep session open a bit longer so users aren't cut off
      this.recognition.interimResults = true; // Capture partials to avoid early endings
      this.recognition.lang = 'en-US'; // Set language
    }
  }

  isAvailable(): boolean {
    return this.isSupported;
  }

  startListening(options?: { maxDurationMs?: number }): Promise<string> {
    const config = {
      maxDurationMs: options?.maxDurationMs ?? 12000 // Give users up to ~12s to respond before timing out
    };

    return new Promise((resolve, reject) => {
      if (!this.isSupported || !this.recognition) {
        reject(new Error('Speech recognition is not supported in this browser'));
        return;
      }

      let finalTranscript = '';
      let attempt = 0;
      let timeoutId: number | null = null;
      let timedOut = false;

      const startWithTimer = () => {
        attempt += 1;
        finalTranscript = '';
        timedOut = false;

        // Safety timeout so we never hang waiting for the API to end on its own
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        if (config.maxDurationMs > 0) {
          timeoutId = window.setTimeout(() => {
            timedOut = true;
            try {
              this.recognition?.stop();
            } catch {
              // ignore
            }
          }, config.maxDurationMs);
        }

        try {
          this.recognition?.start();
        } catch (error) {
          reject(new Error('Failed to start speech recognition. It may already be running.'));
        }
      };

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

        // Give the user one automatic retry on a no-speech error so they have more time
        if (event.error === 'no-speech' && attempt < 2) {
          try {
            this.recognition?.abort();
          } catch {
            // ignore
          }
          setTimeout(startWithTimer, 150);
          return;
        }

        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        if (event.error === 'audio-capture') {
          reject(new Error('No microphone found. Please check your microphone settings.'));
        } else if (event.error === 'not-allowed') {
          reject(new Error('Microphone permission denied. Please allow microphone access.'));
        } else if (event.error === 'no-speech') {
          reject(new Error('No speech detected. Please try again.'));
        } else {
          reject(new Error(`Speech recognition error: ${event.error}`));
        }
      };

      this.recognition.onend = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        if (finalTranscript.trim()) {
          resolve(finalTranscript.trim());
        } else if (timedOut && attempt < 2) {
          // Auto-retry once after a timeout to give users more room
          setTimeout(startWithTimer, 150);
        } else if (timedOut) {
          reject(new Error('Listening timed out. Please try speaking again.'));
        } else if (attempt < 2) {
          // Allow one restart when users pause too long to start speaking
          setTimeout(startWithTimer, 150);
        } else {
          reject(new Error('No speech detected'));
        }
      };

      startWithTimer();
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

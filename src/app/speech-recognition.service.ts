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

  startListening(options?: { maxDurationMs?: number; maxTotalMs?: number; silenceMs?: number }): Promise<string> {
    // maxTotalMs is a flexible ceiling (resets while user speaks); silenceMs is the gap allowed between sounds
    const config = {
      silenceMs: options?.silenceMs ?? 2500, // Tight pause window for quicker hand-offs
      maxTotalMs: options?.maxTotalMs ?? options?.maxDurationMs ?? 15000
    };

    return new Promise((resolve, reject) => {
      if (!this.isSupported || !this.recognition) {
        reject(new Error('Speech recognition is not supported in this browser'));
        return;
      }

      let finalTranscript = '';
      let attempt = 0;
      let silenceTimeoutId: number | null = null;
      let totalTimeoutId: number | null = null;
      let timedOutCause: 'silence' | 'total' | null = null;

      const clearTimers = () => {
        if (silenceTimeoutId) {
          clearTimeout(silenceTimeoutId);
          silenceTimeoutId = null;
        }
        if (totalTimeoutId) {
          clearTimeout(totalTimeoutId);
          totalTimeoutId = null;
        }
      };

      const resetSilenceTimer = () => {
        if (silenceTimeoutId) {
          clearTimeout(silenceTimeoutId);
        }
        if (config.silenceMs > 0) {
          silenceTimeoutId = window.setTimeout(() => {
            timedOutCause = 'silence';
            try {
              this.recognition?.stop();
            } catch {
              // ignore
            }
          }, config.silenceMs);
        }
      };

      const startWithTimer = () => {
        attempt += 1;
        finalTranscript = '';
        timedOutCause = null;
        clearTimers();

        // Total session ceiling
        if (config.maxTotalMs > 0) {
          totalTimeoutId = window.setTimeout(() => {
            timedOutCause = 'total';
            try {
              this.recognition?.stop();
            } catch {
              // ignore
            }
          }, config.maxTotalMs);
        }

        // Silence gap timer
        resetSilenceTimer();

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

          // Any audible result extends the silence window
          resetSilenceTimer();
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

        clearTimers();

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
        clearTimers();

        if (finalTranscript.trim()) {
          resolve(finalTranscript.trim());
        } else if (timedOutCause && attempt < 2) {
          // Auto-retry once after a timeout to give users more room
          setTimeout(startWithTimer, 150);
        } else if (timedOutCause) {
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




import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ElevenLabsService {
  private readonly apiKey = 'sk_cec0819a20966aa5caf8a89d2136bcfbdc406d8970a5f218';
  private readonly voiceId = 'mzrYpmliCpyQZ0vQjs6m';
  private readonly apiUrl = 'https://api.elevenlabs.io/v1/text-to-speech';

  private currentAudioQueue: Promise<void> = Promise.resolve();
  private isStreaming = false;
  private currentAudioElement: HTMLAudioElement | null = null;
  private audioElements: HTMLAudioElement[] = [];

  /**
   * Primary method: Uses ElevenLabs only (quality voice, no switching)
   * Optimized for speed with chunking for very long texts
   */
  async speakAndPlay(text: string): Promise<void> {
    // Only use chunking for very long texts (reduces number of chunks)
    if (text.length > 2000) {
      return this.speakWithChunking(text);
    } else {
      return this.speakWithElevenLabs(text);
    }
  }

  /**
   * Start streaming TTS - plays first chunk immediately, queues subsequent chunks
   */
  async startStreaming(firstChunk: string): Promise<void> {
    this.isStreaming = true;
    this.currentAudioQueue = this.speakWithElevenLabs(firstChunk);
    console.log('🎤 Started streaming TTS with first chunk');
  }

  /**
   * Add a chunk to the streaming queue with natural pause detection
   */
  async addStreamChunk(chunk: string): Promise<void> {
    if (!this.isStreaming) {
      // If streaming hasn't started, start it
      return this.startStreaming(chunk);
    }
    
    // Queue this chunk to play after current audio finishes
    this.currentAudioQueue = this.currentAudioQueue.then(async () => {
      if (chunk.trim().length > 0) {
        console.log(`🎤 Queueing chunk: ${chunk.substring(0, 30)}...`);
        
        // Remove pause detection - it's not needed and might cause issues
        // The AI responses are already very short (1 sentence), so no need for pauses between chunks
        
        return this.speakWithElevenLabs(chunk);
      }
      return Promise.resolve();
    });
  }

  /**
   * Finish streaming and wait for all chunks to complete
   */
  async finishStreaming(): Promise<void> {
    this.isStreaming = false;
    await this.currentAudioQueue;
    console.log('✅ Streaming TTS completed');
  }

  /**
   * Split text into chunks optimized for speed (larger chunks = fewer API calls)
   */
  private splitIntoChunks(text: string): string[] {
    const chunks: string[] = [];
    const targetChunkSize = 800; // Target ~800 chars per chunk (good balance)
    const firstChunkSize = 400; // First chunk smaller for faster start
    
    // First chunk: smaller for faster start
    if (text.length > firstChunkSize) {
      // Find a good break point (sentence end) near firstChunkSize
      const firstPart = text.substring(0, firstChunkSize);
      const lastSentenceEnd = Math.max(
        firstPart.lastIndexOf('.'),
        firstPart.lastIndexOf('!'),
        firstPart.lastIndexOf('?')
      );
      
      if (lastSentenceEnd > firstChunkSize * 0.5) {
        chunks.push(text.substring(0, lastSentenceEnd + 1).trim());
        text = text.substring(lastSentenceEnd + 1).trim();
      } else {
        chunks.push(text.substring(0, firstChunkSize).trim());
        text = text.substring(firstChunkSize).trim();
      }
    } else {
      return [text]; // Text is short enough, no chunking needed
    }
    
    // Remaining chunks: split by target size at sentence boundaries
    while (text.length > 0) {
      if (text.length <= targetChunkSize) {
        chunks.push(text.trim());
        break;
      }
      
      // Find sentence boundary near target size
      const candidate = text.substring(0, targetChunkSize);
      const lastSentenceEnd = Math.max(
        candidate.lastIndexOf('.'),
        candidate.lastIndexOf('!'),
        candidate.lastIndexOf('?')
      );
      
      if (lastSentenceEnd > targetChunkSize * 0.6) {
        // Good break point found
        chunks.push(text.substring(0, lastSentenceEnd + 1).trim());
        text = text.substring(lastSentenceEnd + 1).trim();
      } else {
        // No good break point, split at target size anyway
        chunks.push(text.substring(0, targetChunkSize).trim());
        text = text.substring(targetChunkSize).trim();
      }
    }
    
    return chunks.filter(c => c.trim().length > 0);
  }

  /**
   * Chunked approach: Play first chunk immediately (smaller = faster), then rest
   * All using ElevenLabs - same voice throughout, no switching
   */
  private async speakWithChunking(text: string): Promise<void> {
    const startTime = performance.now();
    const chunks = this.splitIntoChunks(text);
    
    console.log(`🎯 Using chunked ElevenLabs: ${chunks.length} chunks (same voice throughout)`);
    console.log(`📝 First chunk: ${chunks[0].substring(0, 50)}... (${chunks[0].length} chars - smaller = faster)`);
    
    // Play chunks sequentially with same voice
    for (let i = 0; i < chunks.length; i++) {
      const chunkStartTime = performance.now();
      console.log(`▶️ Playing chunk ${i + 1}/${chunks.length} with ElevenLabs...`);
      
      await this.speakWithElevenLabs(chunks[i]);
      
      const chunkTime = performance.now() - chunkStartTime;
      console.log(`✅ Chunk ${i + 1} completed in ${chunkTime.toFixed(0)}ms`);
    }
    
    const totalTime = performance.now() - startTime;
    console.log(`✅ All chunks completed in ${totalTime.toFixed(0)}ms (same voice throughout)`);
  }

  /**
   * Check if Web Speech API is available
   */
  private isWebSpeechAvailable(): boolean {
    return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  }

  /**
   * Use Web Speech API for instant TTS (no network delay)
   */
  private speakWithWebSpeech(text: string): Promise<void> {
    const startTime = performance.now();
    console.log('🎤 Using Web Speech API for instant playback');
    console.log('📝 Text length:', text.length, 'characters');

    return new Promise((resolve, reject) => {
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        
        // Configure voice settings for better quality
        utterance.rate = 1.0; // Normal speed
        utterance.pitch = 1.0; // Normal pitch
        utterance.volume = 1.0; // Full volume
        utterance.lang = 'en-US'; // Set language
        
        // Function to select and set voice
        const selectVoice = () => {
          const voices = speechSynthesis.getVoices();
          if (voices.length === 0) {
            console.log('🎙️ No voices available, using default');
            return;
          }
          
          // Preferred voices (male voices for "Jim")
          const preferredVoices = [
            'Google US English', 'Microsoft David', 'Alex', 'Daniel',
            'Google UK English Male', 'Microsoft Zira', 'Samantha'
          ];
          
          // Find a good voice
          let selectedVoice = voices.find(voice => 
            preferredVoices.some(pref => voice.name.includes(pref))
          ) || voices.find(voice => voice.lang.startsWith('en')) || null;
          
          if (selectedVoice) {
            utterance.voice = selectedVoice;
            console.log('🎙️ Using voice:', selectedVoice.name);
          } else {
            console.log('🎙️ Using default voice');
          }
        };
        
        // Try to get voices immediately
        selectVoice();
        
        // If voices aren't loaded yet, wait for them
        if (speechSynthesis.getVoices().length === 0) {
          speechSynthesis.onvoiceschanged = () => {
            selectVoice();
            speechSynthesis.onvoiceschanged = null; // Remove listener
          };
        }

        utterance.onstart = () => {
          const timeToStart = performance.now() - startTime;
          console.log(`✅ Speech started in ${timeToStart.toFixed(0)}ms`);
        };

        utterance.onend = () => {
          const totalTime = performance.now() - startTime;
          console.log(`✅ Speech completed in ${totalTime.toFixed(0)}ms`);
          resolve();
        };

        utterance.onerror = (error) => {
          console.error('❌ Web Speech error:', error);
          // Fallback to ElevenLabs on error
          console.log('🔄 Falling back to ElevenLabs...');
          this.speakWithElevenLabs(text).then(resolve).catch(reject);
        };

        // Cancel any ongoing speech
        speechSynthesis.cancel();
        
        // Start speaking immediately
        speechSynthesis.speak(utterance);
        
        const initTime = performance.now() - startTime;
        console.log(`⏱️ Speech initialized in ${initTime.toFixed(0)}ms`);
        
      } catch (error) {
        console.error('❌ Error initializing Web Speech:', error);
        // Fallback to ElevenLabs
        console.log('🔄 Falling back to ElevenLabs...');
        this.speakWithElevenLabs(text).then(resolve).catch(reject);
      }
    });
  }

  /**
   * Fallback method: Use ElevenLabs API (higher quality, but slower)
   */
  private async speakWithElevenLabs(text: string): Promise<void> {
    console.log('🎤 Using ElevenLabs API (fallback/high quality mode)');
    const totalStartTime = performance.now();
    
    try {
      console.log('🎤 Generating speech for:', text.substring(0, 50) + (text.length > 50 ? '...' : ''));
      console.log('Using API key:', this.apiKey.substring(0, 10) + '...');
      console.log('Voice ID:', this.voiceId);
      
      const apiStartTime = performance.now();
      
      // Call ElevenLabs REST API directly with turbo model for faster generation
      const response = await fetch(`${this.apiUrl}/${this.voiceId}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': this.apiKey
        },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_turbo_v2', // Fastest model available
          voice_settings: {
            stability: 0.3, // Lower for faster generation
            similarity_boost: 0.6, // Lower for faster generation
            style: 0.0, // Neutral style for faster processing
            use_speaker_boost: false // Disable for speed
          }
        })
      });
      
      const apiEndTime = performance.now();
      console.log(`⏱️ API call completed in ${(apiEndTime - apiStartTime).toFixed(0)}ms`);

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { detail: { message: errorText } };
        }
        
        console.error('ElevenLabs API Error Details:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });
        
        // Provide helpful error message
        if (response.status === 401) {
          const message = errorData?.detail?.message || 'Authentication failed';
          throw new Error(`API Key Error: ${message}\n\nTo fix this:\n1. Go to https://elevenlabs.io/app/settings/api-keys\n2. Click "Edit" on your API key\n3. Enable "Text to Speech" permission\n4. Save and try again`);
        }
        
        throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
      }

      const blobStartTime = performance.now();
      console.log('📦 Audio stream received, converting to blob...');

      // Convert response to blob
      const blob = await response.blob();
      const blobEndTime = performance.now();
      
      console.log(`⏱️ Blob created in ${(blobEndTime - blobStartTime).toFixed(0)}ms, size: ${blob.size} bytes`);
      
      const urlStartTime = performance.now();
      // Create an object URL and play it
      const audioUrl = URL.createObjectURL(blob);
      const urlEndTime = performance.now();
      console.log(`⏱️ Object URL created in ${(urlEndTime - urlStartTime).toFixed(0)}ms`);
      
      const audioInitStartTime = performance.now();
      const audio = new Audio(audioUrl);
      
      // Set volume
      audio.volume = 1.0;
      const audioInitEndTime = performance.now();
      console.log(`⏱️ Audio element created in ${(audioInitEndTime - audioInitStartTime).toFixed(0)}ms`);
      
      // Track audio element for stopping
      this.currentAudioElement = audio;
      this.audioElements.push(audio);
      
      // Play the audio and clean up when done
      return new Promise((resolve, reject) => {
        let playStartTime: number | null = null;
        let canPlayTime: number | null = null;
        let hasStartedPlaying = false;
        
        // Start playing as soon as we can (don't wait for full buffer)
        audio.oncanplay = () => {
          if (!canPlayTime) {
            canPlayTime = performance.now();
            console.log(`⏱️ Audio can play (partial buffer) in ${(canPlayTime - totalStartTime).toFixed(0)}ms`);
            
            // Try to play immediately if not already playing
            if (audio.paused && !hasStartedPlaying) {
              audio.play()
                .then(() => {
                  if (!playStartTime) {
                    playStartTime = performance.now();
                    hasStartedPlaying = true;
                    const timeToPlay = playStartTime - totalStartTime;
                    console.log(`✅ Audio playback started (via oncanplay) in ${timeToPlay.toFixed(0)}ms`);
                  }
                })
                .catch(err => {
                  console.warn('Early play attempt failed, will retry:', err);
                });
            }
          }
        };
        
        audio.oncanplaythrough = () => {
          const fullBufferTime = performance.now();
          console.log(`⏱️ Audio fully buffered in ${(fullBufferTime - totalStartTime).toFixed(0)}ms`);
        };
        
        audio.onended = () => {
          const totalTime = performance.now() - totalStartTime;
          console.log(`✅ Audio playback ended. Total time: ${totalTime.toFixed(0)}ms`);
          URL.revokeObjectURL(audioUrl);
          // Remove from tracking
          this.audioElements = this.audioElements.filter(a => a !== audio);
          if (this.currentAudioElement === audio) {
            this.currentAudioElement = null;
          }
          resolve();
        };
        
        audio.onerror = (error) => {
          console.error('❌ Audio playback error:', error);
          URL.revokeObjectURL(audioUrl);
          // Remove from tracking
          this.audioElements = this.audioElements.filter(a => a !== audio);
          if (this.currentAudioElement === audio) {
            this.currentAudioElement = null;
          }
          reject(error);
        };
        
        const playAttemptStartTime = performance.now();
        console.log('▶️ Attempting to play audio immediately...');
        
        // Try to play immediately - don't wait for canplaythrough
        audio.play()
          .then(() => {
            if (!playStartTime) {
              playStartTime = performance.now();
              hasStartedPlaying = true;
              const timeToPlay = playStartTime - totalStartTime;
              console.log(`✅ Audio playback started in ${timeToPlay.toFixed(0)}ms`);
              console.log(`📊 Breakdown: API=${(apiEndTime - apiStartTime).toFixed(0)}ms, Blob=${(blobEndTime - blobStartTime).toFixed(0)}ms, Play=${(playStartTime - playAttemptStartTime).toFixed(0)}ms`);
            }
          })
          .catch((playError) => {
            console.warn('⚠️ Immediate play failed (will retry when buffer ready):', playError);
            // The oncanplay handler will retry automatically
          });
      });
    } catch (error) {
      console.error('Error generating or playing speech:', error);
      throw error;
    }
  }

  /**
   * Stop all audio playback and clear the queue
   */
  stopAll(): void {
    console.log('🛑 Stopping all audio playback...');
    
    // Stop streaming
    this.isStreaming = false;
    
    // Stop and remove all audio elements
    this.audioElements.forEach(audio => {
      try {
        audio.pause();
        audio.currentTime = 0;
        // Clean up object URL if possible
        if (audio.src && audio.src.startsWith('blob:')) {
          URL.revokeObjectURL(audio.src);
        }
      } catch (error) {
        console.warn('Error stopping audio:', error);
      }
    });
    
    // Clear arrays
    this.audioElements = [];
    this.currentAudioElement = null;
    
    // Cancel Web Speech API if active
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
    }
    
    // Reset queue
    this.currentAudioQueue = Promise.resolve();
    
    console.log('✅ All audio stopped');
  }
}


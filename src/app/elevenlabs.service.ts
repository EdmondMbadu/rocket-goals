import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ElevenLabsService {
  private readonly apiKey = 'sk_cec0819a20966aa5caf8a89d2136bcfbdc406d8970a5f218';
  private readonly voiceId = 'JBFqnCBsd6RMkjVDRZzb'; // Default voice ID from your example
  private readonly apiUrl = 'https://api.elevenlabs.io/v1/text-to-speech';

  /**
   * Primary method: Uses ElevenLabs only (quality voice, no switching)
   * Optimized for speed with chunking for long texts
   */
  async speakAndPlay(text: string): Promise<void> {
    // For long texts, use chunking to start faster
    if (text.length > 1000) {
      return this.speakWithChunking(text);
    } else {
      return this.speakWithElevenLabs(text);
    }
  }

  /**
   * Split text into chunks (first chunk is smaller for faster start)
   */
  private splitIntoChunks(text: string): string[] {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const chunks: string[] = [];
    
    if (sentences.length === 0) return [text];
    
    // First chunk: first 2 sentences (smaller for faster generation)
    const firstChunkSize = Math.min(2, sentences.length);
    chunks.push(sentences.slice(0, firstChunkSize).join(' '));
    
    // Remaining chunks: group remaining sentences
    if (sentences.length > firstChunkSize) {
      const remaining = sentences.slice(firstChunkSize);
      // Group into chunks of ~4 sentences each
      for (let i = 0; i < remaining.length; i += 4) {
        chunks.push(remaining.slice(i, i + 4).join(' '));
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
          resolve();
        };
        
        audio.onerror = (error) => {
          console.error('❌ Audio playback error:', error);
          URL.revokeObjectURL(audioUrl);
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
}


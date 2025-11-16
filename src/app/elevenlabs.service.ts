import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ElevenLabsService {
  private readonly apiKey = 'sk_cec0819a20966aa5caf8a89d2136bcfbdc406d8970a5f218';
  private readonly voiceId = 'JBFqnCBsd6RMkjVDRZzb'; // Default voice ID from your example
  private readonly apiUrl = 'https://api.elevenlabs.io/v1/text-to-speech';

  async speakAndPlay(text: string): Promise<void> {
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
          model_id: 'eleven_turbo_v2', // Faster model with lower latency
          voice_settings: {
            stability: 0.4, // Slightly lower for faster generation
            similarity_boost: 0.7 // Slightly lower for faster generation
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


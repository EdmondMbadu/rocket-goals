import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ElevenLabsService {
  private readonly apiKey = 'sk_cec0819a20966aa5caf8a89d2136bcfbdc406d8970a5f218';
  private readonly voiceId = 'JBFqnCBsd6RMkjVDRZzb'; // Default voice ID from your example
  private readonly apiUrl = 'https://api.elevenlabs.io/v1/text-to-speech';

  async speakAndPlay(text: string): Promise<void> {
    try {
      console.log('Generating speech for:', text);
      console.log('Using API key:', this.apiKey.substring(0, 10) + '...');
      console.log('Voice ID:', this.voiceId);
      
      // Call ElevenLabs REST API directly
      const response = await fetch(`${this.apiUrl}/${this.voiceId}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': this.apiKey
        },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
          }
        })
      });

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

      console.log('Audio stream received, converting to blob...');

      // Convert response to blob
      const blob = await response.blob();
      
      console.log('Blob created from stream, size:', blob.size, 'bytes');
      
      // Create an object URL and play it
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      
      // Set volume
      audio.volume = 1.0;
      
      // Play the audio and clean up when done
      return new Promise((resolve, reject) => {
        audio.onended = () => {
          console.log('Audio playback ended');
          URL.revokeObjectURL(audioUrl);
          resolve();
        };
        audio.onerror = (error) => {
          console.error('Audio playback error:', error);
          URL.revokeObjectURL(audioUrl);
          reject(error);
        };
        audio.oncanplaythrough = () => {
          console.log('Audio ready to play');
        };
        
        console.log('Attempting to play audio...');
        audio.play()
          .then(() => {
            console.log('Audio playback started');
          })
          .catch((playError) => {
            console.error('Error playing audio:', playError);
            URL.revokeObjectURL(audioUrl);
            reject(playError);
          });
      });
    } catch (error) {
      console.error('Error generating or playing speech:', error);
      throw error;
    }
  }
}


import { Injectable } from '@angular/core';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';

@Injectable({
  providedIn: 'root'
})
export class ElevenLabsService {
  private client: ElevenLabsClient;
  private readonly voiceId = 'JBFqnCBsd6RMkjVDRZzb'; // Default voice ID from your example

  constructor() {
    const apiKey = 'sk_cec0819a20966aa5caf8a89d2136bcfbdc406d8970a5f218';
    this.client = new ElevenLabsClient({ apiKey });
  }

  async speakAndPlay(text: string): Promise<void> {
    try {
      console.log('Generating speech for:', text);
      
      // Get the audio stream from ElevenLabs
      const audioStream = await this.client.textToSpeech.convert(
        this.voiceId,
        {
          text: text,
          modelId: 'eleven_multilingual_v2',
          outputFormat: 'mp3_44100_128',
        }
      );

      console.log('Audio stream received, converting to blob...');

      // Convert ReadableStream to Blob using Response
      const response = new Response(audioStream);
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


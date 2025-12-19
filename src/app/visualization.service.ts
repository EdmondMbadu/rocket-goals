import { Injectable } from '@angular/core';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';

export interface GenerateVisualizationInput {
  goalId: string;
  goalDescription: string;
  timeframe: string;
  hasAccountabilitySupport?: string;
  userPhotoBase64?: string | null; // base64 encoded user face photo for personalized visualization
}

export interface GenerateVisualizationResult {
  success: boolean;
  imageUrl?: string;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class VisualizationService {
  private readonly functions = getFunctions(getApp(), 'us-central1');

  /**
   * Generate a visualization image for a goal using Gemini
   * The image is based on the user's goal description and timeframe
   */
  async generateVisualization(input: GenerateVisualizationInput): Promise<GenerateVisualizationResult> {
    try {
      const generateGoalVisualization = httpsCallable<GenerateVisualizationInput, GenerateVisualizationResult>(
        this.functions,
        'generateGoalVisualization'
      );

      const result = await generateGoalVisualization({
        goalId: input.goalId,
        goalDescription: input.goalDescription,
        timeframe: input.timeframe,
        hasAccountabilitySupport: input.hasAccountabilitySupport,
        userPhotoBase64: input.userPhotoBase64
      });

      return result.data;
    } catch (error: any) {
      console.error('Error generating visualization:', error);
      return {
        success: false,
        message: error?.message || 'Failed to generate visualization'
      };
    }
  }
}

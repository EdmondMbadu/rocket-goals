import { Injectable, signal } from '@angular/core';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { getApp } from 'firebase/app';

/**
 * Input for initiating a HeyGen welcome video
 */
export interface InitiateVideoInput {
  goalId: string;
  script: string;
  avatarId?: string;
  voiceId?: string;
  templateId?: string;
}

/**
 * Response from initiating video generation
 */
export interface InitiateVideoResult {
  success: boolean;
  videoId?: string;
  status?: string;
  message: string;
}

/**
 * Response from checking video status
 */
export interface VideoStatusResult {
  success: boolean;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  duration?: number | null;
  error?: string | null;
}

/**
 * Configuration for generating welcome video script
 */
export interface WelcomeVideoConfig {
  firstName: string;
  coPilotName: string;
  templateName: string;
  oneThingMetric: string;
  oneThingLabel: string;
  totalDays: number;
  avatarId?: string;
  voiceId?: string;
}

@Injectable({ providedIn: 'root' })
export class HeyGenService {
  private readonly functions = getFunctions(getApp(), 'us-central1');

  // Polling configuration
  private readonly POLL_INTERVAL_MS = 5000; // Poll every 5 seconds
  private readonly MAX_POLL_ATTEMPTS = 120; // Max 10 minutes of polling (120 * 5s)

  /**
   * Initiate video generation with HeyGen
   * Returns a videoId for polling status
   */
  async initiateVideo(input: InitiateVideoInput): Promise<InitiateVideoResult> {
    try {
      const initiateHeyGenVideo = httpsCallable<InitiateVideoInput, InitiateVideoResult>(
        this.functions,
        'initiateHeyGenVideo'
      );

      const result = await initiateHeyGenVideo(input);
      return result.data;
    } catch (error: any) {
      console.error('Error initiating HeyGen video:', error);
      return {
        success: false,
        message: error?.message || 'Failed to initiate video generation'
      };
    }
  }

  /**
   * Check the status of a video generation
   */
  async checkVideoStatus(videoId: string, goalId: string): Promise<VideoStatusResult> {
    try {
      const checkHeyGenVideoStatus = httpsCallable<{ videoId: string; goalId: string }, VideoStatusResult>(
        this.functions,
        'checkHeyGenVideoStatus'
      );

      const result = await checkHeyGenVideoStatus({ videoId, goalId });
      return result.data;
    } catch (error: any) {
      console.error('Error checking HeyGen video status:', error);
      return {
        success: false,
        status: 'failed',
        error: error?.message || 'Failed to check video status'
      };
    }
  }

  /**
   * Poll for video completion
   * Returns a promise that resolves when video is ready or fails
   *
   * @param videoId The HeyGen video ID to poll
   * @param goalId The goal ID associated with the video
   * @param onProgress Callback for progress updates
   */
  async pollForCompletion(
    videoId: string,
    goalId: string,
    onProgress?: (status: string, attempt: number) => void
  ): Promise<VideoStatusResult> {
    let attempts = 0;

    while (attempts < this.MAX_POLL_ATTEMPTS) {
      attempts++;

      const result = await this.checkVideoStatus(videoId, goalId);

      if (onProgress) {
        onProgress(result.status, attempts);
      }

      if (result.status === 'completed') {
        return result;
      }

      if (result.status === 'failed') {
        return result;
      }

      // Wait before next poll
      await this.delay(this.POLL_INTERVAL_MS);
    }

    // Timeout reached
    return {
      success: false,
      status: 'failed',
      error: 'Video generation timed out. Please try again later.'
    };
  }

  /**
   * Generate and wait for welcome video
   * Combines initiation and polling into a single async operation
   */
  async generateWelcomeVideo(
    config: WelcomeVideoConfig,
    goalId: string,
    templateId: string,
    onProgress?: (status: string, attempt: number) => void
  ): Promise<VideoStatusResult> {
    // Build the personalized script
    const script = this.buildWelcomeScript(config);

    // Initiate video generation
    const initResult = await this.initiateVideo({
      goalId,
      script,
      avatarId: config.avatarId,
      voiceId: config.voiceId,
      templateId
    });

    if (!initResult.success || !initResult.videoId) {
      return {
        success: false,
        status: 'failed',
        error: initResult.message || 'Failed to start video generation'
      };
    }

    // Poll for completion
    return this.pollForCompletion(initResult.videoId, goalId, onProgress);
  }

  /**
   * Build the personalized welcome script for the AI coach
   */
  buildWelcomeScript(config: WelcomeVideoConfig): string {
    const {
      firstName,
      coPilotName,
      templateName,
      oneThingMetric,
      oneThingLabel,
      totalDays
    } = config;

    const metricPhrase = this.formatMetricForSpeech(oneThingMetric, oneThingLabel);
    const durationPhrase = this.formatDuration(totalDays);

    return `Hi ${firstName}! Congratulations on this ambitious goal! ` +
      `${metricPhrase} is a true ROCKET Goal. ` +
      `I went ahead and created a series of milestones over the next ${durationPhrase} ` +
      `that will help you build up to reaching this goal. ` +
      `Take a few minutes to explore your milestones, and then use the chat window ` +
      `on the left to ask me any questions. ` +
      `It's going to be an exciting challenge! I'll be rooting for you every step of the way!`;
  }

  /**
   * Format the ONE Thing metric for natural speech
   */
  private formatMetricForSpeech(metric: string, label: string): string {
    // Handle different metric types
    const lowerLabel = label.toLowerCase();

    if (lowerLabel.includes('revenue') || lowerLabel.includes('funding')) {
      return `Earning ${metric} dollars`;
    }

    if (lowerLabel.includes('weight')) {
      return `Reaching ${metric} pounds`;
    }

    if (lowerLabel.includes('distance') || lowerLabel.includes('miles')) {
      return `Riding ${metric} miles`;
    }

    if (lowerLabel.includes('time') || lowerLabel.includes('finish')) {
      return `Finishing in ${metric}`;
    }

    if (lowerLabel.includes('deals') || lowerLabel.includes('customers') || lowerLabel.includes('offers')) {
      return `Getting ${metric} ${lowerLabel.replace('target ', '')}`;
    }

    if (lowerLabel.includes('projects') || lowerLabel.includes('tools')) {
      return `Completing ${metric} ${lowerLabel.replace('target ', '').replace(' to complete', '').replace(' to master', '')}`;
    }

    // Default: use the label and metric together
    return `Achieving ${metric} for ${label}`;
  }

  /**
   * Format days into natural speech duration
   */
  private formatDuration(totalDays: number): string {
    if (totalDays <= 7) {
      return totalDays === 7 ? 'week' : `${totalDays} days`;
    }

    if (totalDays <= 14) {
      return 'two weeks';
    }

    if (totalDays <= 21) {
      return 'three weeks';
    }

    if (totalDays <= 31) {
      return 'month';
    }

    if (totalDays <= 45) {
      return 'six weeks';
    }

    if (totalDays <= 62) {
      return 'two months';
    }

    if (totalDays <= 93) {
      return 'three months';
    }

    if (totalDays <= 124) {
      return 'four months';
    }

    if (totalDays <= 186) {
      return 'six months';
    }

    // For longer periods, calculate months
    const months = Math.round(totalDays / 30);
    return `${months} months`;
  }

  /**
   * Utility: delay helper for polling
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * List all available HeyGen avatars
   * Use this to find the best avatar for each app suite
   */
  async listAvatars(): Promise<{
    success: boolean;
    avatars?: Array<{
      id: string;
      name: string;
      gender: string;
      previewImage?: string;
      previewVideo?: string;
      premium: boolean;
    }>;
    summary?: {
      total: number;
      male: number;
      female: number;
    };
    error?: string;
  }> {
    try {
      const listHeyGenAvatars = httpsCallable<void, any>(
        this.functions,
        'listHeyGenAvatars'
      );

      const result = await listHeyGenAvatars();
      return result.data;
    } catch (error: any) {
      console.error('Error listing HeyGen avatars:', error);
      return {
        success: false,
        error: error?.message || 'Failed to list avatars'
      };
    }
  }
}

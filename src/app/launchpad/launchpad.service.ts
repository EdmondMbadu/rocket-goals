import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { RocketGoalsService } from '../rocket-goals.service';
import { VisualizationService } from '../visualization.service';
import { LaunchpadTemplate, LAUNCHPAD_TEMPLATES } from './launchpad.types';

@Injectable({
  providedIn: 'root'
})
export class LaunchpadService {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly goalsService = inject(RocketGoalsService);
  private readonly visualizationService = inject(VisualizationService);

  getTemplate(id: string): LaunchpadTemplate | undefined {
    return LAUNCHPAD_TEMPLATES[id];
  }

  isLoggedIn(): boolean {
    return !!this.authService.profile()?.userId;
  }

  getUserProfile() {
    return this.authService.profile();
  }

  async launchMission(template: LaunchpadTemplate): Promise<string | null> {
    const profile = this.authService.profile();
    
    if (!profile?.userId) {
      // Store template and redirect to signup
      sessionStorage.setItem('pendingLaunchpad', JSON.stringify({
        templateId: template.id
      }));
      this.router.navigate(['/signup'], {
        queryParams: { redirectTo: `/launchpad/${template.id}`, createLaunchpad: 'true' }
      });
      return null;
    }

    const now = Date.now();

    try {
      // Create the goal with launchpad template data
      const goalId = await this.goalsService.createRocketGoal({
        userId: profile.userId,
        primaryGoal: template.defaultGoals.primaryGoal,
        answers: {
          goal_title_label: `${template.name} Mission`,
          goal_theme: template.defaultGoals.theme,
          goal_theme_label: template.category,
          daily_effort: template.defaultGoals.dailyEffort,
          source: 'launchpad_template',
          launchpad_template_id: template.id,
          launchpad_template_name: template.name,
          launchpad_tagline: template.tagline,
          objectives: template.defaultGoals.objectives,
          custom_goal_title: `${template.name} Mission`,
          goalDescription: template.description,
          timeframe: 'week'
        },
        participant: {
          firstName: profile.firstName || '',
          lastName: profile.lastName || '',
          email: profile.email || ''
        },
        status: 'active',
        entryPoint: 'launch_challenge',
        startTime: now
      });

      // Generate visualization image
      try {
        let userPhotoBase64: string | null = null;
        if (profile.rocketGoalPhotoUrl) {
          try {
            userPhotoBase64 = await this.imageUrlToBase64(profile.rocketGoalPhotoUrl);
          } catch (error) {
            console.warn('Failed to convert profile photo to base64:', error);
          }
        }

        const visualizationResult = await this.visualizationService.generateVisualization({
          goalId,
          goalDescription: `${template.name}: ${template.description}. Goal: ${template.defaultGoals.primaryGoal}`,
          timeframe: 'week',
          hasAccountabilitySupport: 'yes',
          userPhotoBase64
        });

        if (visualizationResult.success && visualizationResult.imageUrl) {
          await this.goalsService.updateRocketGoal(goalId, {
            visualizationImageUrl: visualizationResult.imageUrl
          });
        }
      } catch (visualizationError) {
        console.warn('Error generating visualization:', visualizationError);
      }

      return goalId;
    } catch (error) {
      console.error('Error creating launchpad goal:', error);
      throw error;
    }
  }

  async checkPendingLaunchpad(): Promise<boolean> {
    const pending = sessionStorage.getItem('pendingLaunchpad');
    if (pending && this.isLoggedIn()) {
      try {
        const data = JSON.parse(pending);
        const template = this.getTemplate(data.templateId);
        if (template) {
          sessionStorage.removeItem('pendingLaunchpad');
          const goalId = await this.launchMission(template);
          if (goalId) {
            this.router.navigate(['/rocketgoal', goalId]);
            return true;
          }
        }
      } catch (error) {
        console.error('Failed to process pending launchpad:', error);
        sessionStorage.removeItem('pendingLaunchpad');
      }
    }
    return false;
  }

  private async imageUrlToBase64(url: string): Promise<string | null> {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          const base64Data = base64.includes(',') ? base64.split(',')[1] : base64;
          resolve(base64Data);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('Error converting image URL to base64:', error);
      return null;
    }
  }
}


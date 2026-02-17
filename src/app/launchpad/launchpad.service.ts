import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../auth.service';
import { RocketGoalsService } from '../rocket-goals.service';
import { VisualizationService } from '../visualization.service';
import { ActionItemsService } from '../action-items.service';
import { RocketGoalsAIService } from '../rocket-goals-ai.service';
import { CalendarEventsService } from '../calendar-events.service';
import { CoachPromptsService } from '../coach-prompts.service';
import { LaunchpadTemplate, LAUNCHPAD_TEMPLATES, MissionOnboardingData } from './launchpad.types';

@Injectable({
  providedIn: 'root'
})
export class LaunchpadService {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly goalsService = inject(RocketGoalsService);
  private readonly visualizationService = inject(VisualizationService);
  private readonly actionItemsService = inject(ActionItemsService);
  private readonly rocketGoalsAIService = inject(RocketGoalsAIService);
  private readonly calendarEventsService = inject(CalendarEventsService);
  private readonly coachPromptsService = inject(CoachPromptsService);

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
    const copilot = await this.resolveCopilot(template);

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
        startTime: now,
        // Include copilot data for personalized AI experience
        copilot
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

  /**
   * Launch mission with onboarding data (start date, end date, experience level, ONE Thing metric)
   * This generates AI-powered milestones based on the user's input
   */
  async launchMissionWithOnboarding(template: LaunchpadTemplate, onboardingData: MissionOnboardingData): Promise<string | null> {
    const profile = this.authService.profile();

    if (!profile?.userId) {
      // Store template and onboarding data, redirect to signup
      sessionStorage.setItem('pendingLaunchpad', JSON.stringify({
        templateId: template.id,
        onboardingData
      }));
      this.router.navigate(['/signup'], {
        queryParams: { redirectTo: `/launchpad/${template.id}`, createLaunchpad: 'true' }
      });
      return null;
    }

    // Calculate timeline
    const startDate = new Date(onboardingData.startDate);
    const endDate = new Date(onboardingData.endDate);
    const startTime = startDate.getTime();
    const totalDays = Math.ceil((endDate.getTime() - startTime) / (1000 * 60 * 60 * 24));
    const copilot = await this.resolveCopilot(template);

    // Determine timeframe label
    let timeframe: 'week' | 'month' | '3months' | '6months' = 'month';
    if (totalDays <= 7) timeframe = 'week';
    else if (totalDays <= 30) timeframe = 'month';
    else if (totalDays <= 90) timeframe = '3months';
    else timeframe = '6months';

    try {
      // Create the goal with onboarding data
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
          timeframe,
          timeframe_days: totalDays,
          deadlineDate: endDate.getTime(),
          // NEW: Onboarding data
          onboarding_start_date: onboardingData.startDate,
          onboarding_end_date: onboardingData.endDate,
          onboarding_experience_level: onboardingData.experienceLevel,
          onboarding_one_thing_metric: onboardingData.oneThingMetric,
          onboarding_one_thing_label: template.oneThingMetric.label,
          onboarding_one_thing_unit: template.oneThingMetric.unit || ''
        },
        participant: {
          firstName: profile.firstName || '',
          lastName: profile.lastName || '',
          email: profile.email || ''
        },
        status: 'active',
        entryPoint: 'launch_challenge',
        startTime,
        copilot
      });

      // Generate visualization image (async, don't wait)
      this.generateVisualizationAsync(goalId, template, profile);

      // Generate AI-powered milestones based on onboarding data
      await this.generateMilestonesFromOnboarding(goalId, template, onboardingData, totalDays, startTime);

      return goalId;
    } catch (error) {
      console.error('Error creating launchpad goal with onboarding:', error);
      throw error;
    }
  }

  /**
   * Generate AI-powered milestones based on onboarding data
   */
  private async generateMilestonesFromOnboarding(
    goalId: string,
    template: LaunchpadTemplate,
    onboardingData: MissionOnboardingData,
    totalDays: number,
    startTime: number
  ): Promise<void> {
    try {
      // Generate milestones for EVERY day from start to finish
      const milestoneCount = totalDays;

      // Build the AI prompt
      const prompt = this.buildMilestonePrompt(template, onboardingData, totalDays, milestoneCount);

      // Get the goal for context
      const goal = await this.goalsService.getRocketGoalById(goalId);

      // Call AI to generate milestones (silent - doesn't add to chat history)
      const response = await this.rocketGoalsAIService.callAISilent(prompt, goal);

      // Parse the response
      const milestones = this.parseMilestonesResponse(response, totalDays, startTime);
      const normalizedMilestones = this.ensureMilestonesForAllDays(milestones, totalDays, startTime, template);

      // Create action items and calendar events from milestones
      for (const milestone of normalizedMilestones) {
        // Create action item
        await this.actionItemsService.createActionItem({
          goalId,
          title: milestone.title,
          dayNumber: milestone.dayNumber,
          completed: false,
          order: milestone.dayNumber
        });

        // Create corresponding calendar event
        const milestoneDate = new Date(milestone.date);
        await this.createCalendarEventForMilestone(goalId, milestone.title, milestoneDate);
      }

      console.log(`Generated ${normalizedMilestones.length} milestones with calendar events for goal ${goalId}`);
    } catch (error) {
      console.error('Error generating milestones:', error);
      // Don't throw - milestone generation failure shouldn't block goal creation
    }
  }

  /**
   * Build the prompt for milestone generation
   */
  private buildMilestonePrompt(
    template: LaunchpadTemplate,
    onboardingData: MissionOnboardingData,
    totalDays: number,
    milestoneCount: number
  ): string {
    const experienceDescriptions: Record<string, string> = {
      beginner: 'beginner (needs foundational steps and more guidance)',
      intermediate: 'intermediate (ready for moderate challenges)',
      advanced: 'advanced (ready for aggressive, challenging milestones)'
    };

    const experienceDesc = experienceDescriptions[onboardingData.experienceLevel] || 'intermediate';

    const metricDisplay = template.oneThingMetric.unit
      ? `${onboardingData.oneThingMetric} ${template.oneThingMetric.unit}`
      : onboardingData.oneThingMetric;

    return `Create EXACTLY ${milestoneCount} daily milestones for a ${template.name} mission - ONE milestone for EACH day from Day 1 to Day ${totalDays}.

MISSION DETAILS:
- Goal: ${template.defaultGoals.primaryGoal}
- Category: ${template.category}
- Description: ${template.description}

USER PROFILE:
- Experience Level: ${experienceDesc}
- Timeline: ${onboardingData.startDate} to ${onboardingData.endDate} (${totalDays} days total)
- ONE Thing Success Metric: ${template.oneThingMetric.label} = ${metricDisplay}

REQUIREMENTS:
1. Generate EXACTLY ${milestoneCount} milestones - ONE for EACH day (Day 1, Day 2, Day 3, ... Day ${totalDays})
2. Each milestone should be specific, actionable, and measurable
3. Build progressive momentum - start easier and increase difficulty gradually
4. Tailor difficulty to the user's experience level (${onboardingData.experienceLevel})
5. Milestones should logically build toward achieving: ${metricDisplay}
6. CRITICAL: You MUST include a milestone for EVERY single day from 1 to ${totalDays}, no skipping days

IMPORTANT: Return ONLY a valid JSON array. Each object must have:
- "title": Specific action (keep it concise, under 100 characters)
- "dayNumber": The day number (1 to ${totalDays}) - EVERY day must be included

Example format for a 5-day goal:
[
  {"title": "Complete initial assessment and set baseline", "dayNumber": 1},
  {"title": "Research best practices and create plan", "dayNumber": 2},
  {"title": "Begin first training session", "dayNumber": 3},
  {"title": "Review progress and adjust approach", "dayNumber": 4},
  {"title": "Complete final milestone and celebrate", "dayNumber": 5}
]

Generate ${milestoneCount} milestones now (JSON array only, no other text):`;
  }

  /**
   * Parse milestones from AI response
   */
  private parseMilestonesResponse(response: string, totalDays: number, startTime: number): Array<{ title: string; date: string; dayNumber: number }> {
    let milestones: any[] = [];

    // Extract JSON array from response
    const jsonMatch = response.match(/\[[\s\S]*/);
    if (jsonMatch) {
      let jsonStr = jsonMatch[0];

      try {
        milestones = JSON.parse(jsonStr);
      } catch {
        // Try to recover from truncated JSON by extracting complete objects
        milestones = this.extractCompleteMilestones(jsonStr);

        if (milestones.length === 0) {
          const cleanedJson = jsonStr
            .replace(/,\s*\]/g, ']')
            .replace(/'/g, '"')
            .replace(/(\w+):/g, '"$1":');
          try {
            milestones = JSON.parse(cleanedJson);
          } catch {
            milestones = this.extractCompleteMilestones(cleanedJson);
          }
        }
      }
    }

    if (!Array.isArray(milestones) || milestones.length === 0) {
      console.error('Could not parse milestones. Response:', response);
      return [];
    }

    return milestones.map((m: any, index: number) => {
      let dayNumber = m.dayNumber || m.day || (index + 1);
      if (typeof dayNumber === 'string') {
        dayNumber = parseInt(dayNumber, 10) || (index + 1);
      }
      dayNumber = Math.min(Math.max(1, dayNumber), totalDays);

      const milestoneDate = new Date(startTime + ((dayNumber - 1) * 24 * 60 * 60 * 1000));
      const dateStr = this.formatDateISO(milestoneDate);

      return {
        title: (m.title || m.milestone || '').trim(),
        date: dateStr,
        dayNumber
      };
    }).filter(m => m.title);
  }

  private ensureMilestonesForAllDays(
    milestones: Array<{ title: string; date?: string; dayNumber: number }>,
    totalDays: number,
    startTime: number,
    template: LaunchpadTemplate
  ): Array<{ title: string; date: string; dayNumber: number }> {
    const dayMs = 24 * 60 * 60 * 1000;
    const byDay = new Map<number, { title: string; date: string; dayNumber: number }>();

    for (const milestone of milestones) {
      if (!milestone?.title) continue;
      const dayNumber = Math.min(Math.max(1, milestone.dayNumber), totalDays);
      const date = milestone.date || this.formatDateISO(new Date(startTime + ((dayNumber - 1) * dayMs)));
      if (!byDay.has(dayNumber)) {
        byDay.set(dayNumber, { title: milestone.title.trim(), date, dayNumber });
      }
    }

    const normalized: Array<{ title: string; date: string; dayNumber: number }> = [];
    for (let day = 1; day <= totalDays; day++) {
      const date = this.formatDateISO(new Date(startTime + ((day - 1) * dayMs)));
      const existing = byDay.get(day);
      if (existing) {
        normalized.push({ ...existing, date });
        continue;
      }
      normalized.push({
        title: this.buildFallbackMilestoneTitle(template, day),
        date,
        dayNumber: day
      });
    }

    return normalized;
  }

  private buildFallbackMilestoneTitle(template: LaunchpadTemplate, dayNumber: number): string {
    const goal = template.defaultGoals.primaryGoal || template.name || 'your mission';
    return `Day ${dayNumber}: Make progress toward ${goal}`;
  }

  /**
   * Extract complete milestone objects from potentially truncated JSON
   */
  private extractCompleteMilestones(jsonStr: string): any[] {
    const milestones: any[] = [];
    const objectPattern = /\{\s*"title"\s*:\s*"([^"]+)"\s*,\s*"dayNumber"\s*:\s*(\d+)\s*\}|\{\s*"dayNumber"\s*:\s*(\d+)\s*,\s*"title"\s*:\s*"([^"]+)"\s*\}/g;

    let match;
    while ((match = objectPattern.exec(jsonStr)) !== null) {
      const title = match[1] || match[4];
      const dayNumber = parseInt(match[2] || match[3], 10);

      if (title && !isNaN(dayNumber)) {
        milestones.push({ title, dayNumber });
      }
    }

    return milestones;
  }

  /**
   * Format date as ISO string (YYYY-MM-DD)
   */
  private formatDateISO(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Create a calendar event for a milestone
   */
  private async createCalendarEventForMilestone(goalId: string, title: string, date: Date): Promise<void> {
    try {
      await this.calendarEventsService.createEvent(goalId, {
        title: `🎯 ${title}`,
        date,
        color: '#9333ea', // Purple for milestones
        completed: false
      });
    } catch (error) {
      console.error('Error creating calendar event for milestone:', error);
      // Don't throw - milestone was still created successfully
    }
  }

  /**
   * Generate visualization asynchronously
   */
  private async generateVisualizationAsync(goalId: string, template: LaunchpadTemplate, profile: any): Promise<void> {
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
        timeframe: 'month',
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
  }

  async checkPendingLaunchpad(): Promise<{ goalId: string; template?: LaunchpadTemplate; onboardingData?: MissionOnboardingData } | null> {
    const pending = sessionStorage.getItem('pendingLaunchpad');
    if (pending && this.isLoggedIn()) {
      try {
        const data = JSON.parse(pending);
        const template = this.getTemplate(data.templateId);
        if (template) {
          sessionStorage.removeItem('pendingLaunchpad');

          // Check if onboarding data was stored (new flow)
          let goalId: string | null;
          if (data.onboardingData) {
            goalId = await this.launchMissionWithOnboarding(template, data.onboardingData);
          } else {
            goalId = await this.launchMission(template);
          }

          if (goalId) {
            return {
              goalId,
              template,
              onboardingData: data.onboardingData
            };
          }
        }
      } catch (error) {
        console.error('Failed to process pending launchpad:', error);
        sessionStorage.removeItem('pendingLaunchpad');
      }
    }
    return null;
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

  private async resolveCopilot(template: LaunchpadTemplate): Promise<{ avatar: string; name: string; role: string }> {
    try {
      const config = await this.coachPromptsService.getConfig(template.id);
      if (config?.coachName && config?.soulFilet) {
        return {
          avatar: config.avatar || template.coPilotAvatar,
          name: config.coachName,
          role: config.soulFilet
        };
      }
    } catch (error) {
      console.warn('Failed to load dynamic coach prompt config, using defaults:', error);
    }

    return {
      avatar: template.coPilotAvatar,
      name: template.coPilotName,
      role: template.coPilotRole
    };
  }
}

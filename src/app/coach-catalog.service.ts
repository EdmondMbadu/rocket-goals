import { Injectable, inject } from '@angular/core';
import { CoachPromptsService } from './coach-prompts.service';
import { CommunityCoach, CommunityCoachService } from './community-coach.service';
import { clonePrebuiltTemplates, PrebuiltTemplate } from './coach-catalog.data';

@Injectable({ providedIn: 'root' })
export class CoachCatalogService {
  private readonly coachPromptsService = inject(CoachPromptsService);
  private readonly communityCoachService = inject(CommunityCoachService);

  async getPrebuiltTemplates(): Promise<PrebuiltTemplate[]> {
    const templates = clonePrebuiltTemplates();

    try {
      const configs = await this.coachPromptsService.getAllConfigs();
      for (const template of templates) {
        const saved = configs[template.id];
        if (!saved) {
          continue;
        }
        if (saved.coachName) {
          template.coPilotName = saved.coachName;
        }
        if (saved.avatar) {
          template.coPilotAvatar = saved.avatar;
        }
      }
    } catch (error) {
      console.warn('Failed to load coach overrides:', error);
    }

    return templates;
  }

  async getAvailableCommunityCoaches(userId?: string): Promise<CommunityCoach[]> {
    try {
      const publicCoaches = await this.communityCoachService.getPublicCoaches();
      if (!userId) {
        return publicCoaches;
      }

      const myCoaches = await this.communityCoachService.getMyCoaches(userId);
      const publicIds = new Set(publicCoaches.map(coach => coach.id));
      const privateOnly = myCoaches.filter(coach => !publicIds.has(coach.id));
      return [...publicCoaches, ...privateOnly];
    } catch (error) {
      console.warn('Failed to load community coaches:', error);
      return [];
    }
  }
}

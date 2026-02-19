import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AvatarDropdownComponent } from '../avatar-dropdown.component';
import { AuthService } from '../auth.service';
import { CoachPromptsService } from '../coach-prompts.service';
import { LaunchpadTemplate, LAUNCHPAD_TEMPLATES } from '../launchpad/launchpad.types';
import { ThemeService } from '../theme.service';

type EditableCoachPrompt = {
  templateId: string;
  appName: string;
  coachName: string;
  avatar: string;
  soulFilet: string;
  defaultCoachName: string;
  defaultAvatar: string;
  defaultSoulFilet: string;
  isSaving: boolean;
  isDirty: boolean;
  saveMessage: string | null;
  saveError: string | null;
  updatedGoals: number;
};

@Component({
  selector: 'app-coaches',
  standalone: true,
  imports: [CommonModule, RouterLink, AvatarDropdownComponent],
  templateUrl: './coaches.component.html',
  styleUrl: './coaches.component.css'
})
export class CoachesComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly coachPromptsService = inject(CoachPromptsService);
  private readonly theme = inject(ThemeService);
  protected readonly isDarkMode = this.theme.isDarkMode;

  checkingAuth = signal(true);
  loading = signal(true);
  loadError = signal<string | null>(null);
  sharedPhilosophy = signal('');
  sharedPhilosophySaving = signal(false);
  sharedPhilosophyDirty = signal(false);
  sharedPhilosophyWarning = signal<string | null>(null);
  sharedPhilosophyMessage = signal<string | null>(null);
  sharedPhilosophyError = signal<string | null>(null);
  sharedPhilosophyExpanded = signal(false);
  searchQuery = signal('');
  searchFeedback = signal<string | null>(null);
  highlightedTemplateId = signal<string | null>(null);

  private readonly defaultTemplates: LaunchpadTemplate[] = Object.values(LAUNCHPAD_TEMPLATES);

  readonly coachPrompts = signal<EditableCoachPrompt[]>([]);

  async ngOnInit() {
    let attempts = 0;
    while (!this.authService.profile() && attempts < 20) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }

    const profile = this.authService.profile();
    if (!profile) {
      this.router.navigate(['/login']);
      return;
    }

    const isUserAdmin = profile.role === 'admin' || profile.admin === true;
    if (!isUserAdmin) {
      this.router.navigate(['/goals']);
      return;
    }

    this.checkingAuth.set(false);
    await Promise.all([this.loadCoachPrompts(), this.loadSharedPhilosophy()]);
  }

  toggleDarkMode() {
    this.theme.toggleDarkMode();
  }

  getSearchOptions(): string[] {
    return this.coachPrompts().flatMap((item) => [
      item.coachName,
      item.appName,
      `${item.appName} - ${item.coachName}`
    ]);
  }

  jumpToCoachFromSearch() {
    const query = this.searchQuery().trim().toLowerCase();
    if (!query) {
      this.searchFeedback.set('Type a coach or app-suite name.');
      return;
    }

    const candidates = this.coachPrompts();
    const exact = candidates.find((item) =>
      item.coachName.toLowerCase() === query ||
      item.appName.toLowerCase() === query ||
      `${item.appName} - ${item.coachName}`.toLowerCase() === query
    );

    const partial = candidates.find((item) =>
      item.coachName.toLowerCase().includes(query) ||
      item.appName.toLowerCase().includes(query)
    );

    const match = exact || partial;
    if (!match) {
      this.searchFeedback.set('No coach found for that search.');
      this.highlightedTemplateId.set(null);
      return;
    }

    const element = document.getElementById(this.getCoachCardId(match.templateId));
    if (!element) {
      this.searchFeedback.set('Coach found, but section is not available yet.');
      return;
    }

    this.searchFeedback.set(`Jumped to ${match.coachName}`);
    this.highlightedTemplateId.set(match.templateId);
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  getCoachCardId(templateId: string): string {
    return `coach-card-${templateId}`;
  }

  updateSharedPhilosophy(value: string) {
    this.sharedPhilosophy.set(value);
    this.sharedPhilosophyDirty.set(true);
    this.sharedPhilosophyWarning.set(null);
    this.sharedPhilosophyMessage.set(null);
    this.sharedPhilosophyError.set(null);
  }

  toggleSharedPhilosophyExpanded() {
    this.sharedPhilosophyExpanded.update((current) => !current);
  }

  sharedPhilosophyWordCount(): number {
    return this.countWords(this.sharedPhilosophy());
  }

  async saveSharedPhilosophy() {
    const rocketGoalsPhilosophy = this.sharedPhilosophy().trim();
    const wordCount = this.countWords(rocketGoalsPhilosophy);

    this.sharedPhilosophyWarning.set(null);
    this.sharedPhilosophySaving.set(true);
    this.sharedPhilosophyMessage.set(null);
    this.sharedPhilosophyError.set(null);

    if (wordCount > 1000) {
      this.sharedPhilosophySaving.set(false);
      this.sharedPhilosophyError.set(
        'For speed considerations, compact this prompt which will be shared to all coaches to 1000 words.'
      );
      return;
    }

    if (wordCount > 250) {
      this.sharedPhilosophyWarning.set(
        `Warning: this shared philosophy is ${wordCount} words. For best speed, keep it concise.`
      );
    }

    try {
      await this.coachPromptsService.saveSharedPhilosophy({ rocketGoalsPhilosophy });
      this.sharedPhilosophyDirty.set(false);
      this.sharedPhilosophyMessage.set('RocketGoals Philosophy saved and applied.');
    } catch (error: any) {
      console.error('Failed to save shared philosophy:', error);
      this.sharedPhilosophyError.set(error?.message || 'Unable to save shared philosophy.');
    } finally {
      this.sharedPhilosophySaving.set(false);
    }
  }

  async handleSharedMdUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      this.updateSharedPhilosophy(text);
    } catch (error: any) {
      this.sharedPhilosophyError.set(error?.message || 'Unable to read markdown file.');
    } finally {
      input.value = '';
    }
  }

  downloadSharedPhilosophyMd() {
    const content = this.sharedPhilosophy() || '';
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'rocketgoals-philosophy.md';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  private async loadCoachPrompts() {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const stored = await this.coachPromptsService.getAllConfigs();
      const merged: EditableCoachPrompt[] = this.defaultTemplates.map((template) => {
        const fallbackPrompt = template.coPilotRole;
        const saved = stored[template.id];
        return {
          templateId: template.id,
          appName: saved?.appName || template.name,
          coachName: saved?.coachName || template.coPilotName,
          avatar: saved?.avatar || template.coPilotAvatar,
          soulFilet: saved?.soulFilet || fallbackPrompt,
          defaultCoachName: template.coPilotName,
          defaultAvatar: template.coPilotAvatar,
          defaultSoulFilet: fallbackPrompt,
          isSaving: false,
          isDirty: false,
          saveMessage: null,
          saveError: null,
          updatedGoals: 0
        };
      });

      this.coachPrompts.set(merged);
    } catch (error: any) {
      console.error('Failed to load coach prompts:', error);
      this.loadError.set(error?.message || 'Unable to load coach prompts.');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadSharedPhilosophy() {
    try {
      const config = await this.coachPromptsService.getSharedPhilosophy();
      this.sharedPhilosophy.set(config.rocketGoalsPhilosophy || '');
      this.sharedPhilosophyDirty.set(false);
      this.sharedPhilosophyWarning.set(null);
      this.sharedPhilosophyMessage.set(null);
      this.sharedPhilosophyError.set(null);
    } catch (error: any) {
      console.error('Failed to load shared philosophy:', error);
      this.sharedPhilosophyError.set(error?.message || 'Unable to load RocketGoals Philosophy.');
    }
  }

  isPromptExactlyDefault(item: EditableCoachPrompt): boolean {
    return item.soulFilet.trim() === item.defaultSoulFilet.trim()
      && item.coachName.trim() === item.defaultCoachName.trim()
      && item.avatar.trim() === item.defaultAvatar.trim();
  }

  updateCoachName(templateId: string, value: string) {
    this.patchItem(templateId, { coachName: value, isDirty: true, saveMessage: null, saveError: null });
  }

  updateSoulFilet(templateId: string, value: string) {
    this.patchItem(templateId, { soulFilet: value, isDirty: true, saveMessage: null, saveError: null });
  }

  updateAvatar(templateId: string, value: string) {
    this.patchItem(templateId, { avatar: value, isDirty: true, saveMessage: null, saveError: null });
  }

  resetToDefaults(templateId: string) {
    this.coachPrompts.update((items) => items.map((item) => {
      if (item.templateId !== templateId) return item;
      return {
        ...item,
        coachName: item.defaultCoachName,
        avatar: item.defaultAvatar,
        soulFilet: item.defaultSoulFilet,
        isDirty: true,
        saveMessage: null,
        saveError: null
      };
    }));
  }

  async saveCoachPrompt(item: EditableCoachPrompt) {
    const coachName = item.coachName.trim();
    const soulFilet = item.soulFilet.trim();
    const avatar = item.avatar.trim();

    if (!coachName || !soulFilet) {
      this.patchItem(item.templateId, {
        saveError: 'Coach name and Soul Filet are required.',
        saveMessage: null
      });
      return;
    }

    this.patchItem(item.templateId, { isSaving: true, saveError: null, saveMessage: null });

    try {
      const response = await this.coachPromptsService.saveConfig({
        templateId: item.templateId,
        appName: item.appName,
        coachName,
        avatar,
        soulFilet,
        applyToExistingGoals: true
      });

      this.patchItem(item.templateId, {
        isSaving: false,
        isDirty: false,
        saveMessage: 'Saved. Prompt is now live.',
        saveError: null,
        updatedGoals: response.updatedGoals || 0
      });
    } catch (error: any) {
      console.error('Failed to save coach prompt:', error);
      this.patchItem(item.templateId, {
        isSaving: false,
        saveError: error?.message || 'Failed to save coach prompt.',
        saveMessage: null
      });
    }
  }

  async handleMdUpload(templateId: string, event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      this.updateSoulFilet(templateId, text);
    } catch (error: any) {
      this.patchItem(templateId, { saveError: error?.message || 'Unable to read markdown file.' });
    } finally {
      input.value = '';
    }
  }

  downloadMd(item: EditableCoachPrompt) {
    const content = item.soulFilet || '';
    const safeId = item.templateId.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeId}-soul-filet.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async handleImageUpload(templateId: string, event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.patchItem(templateId, { saveError: 'Please upload an image file.' });
      input.value = '';
      return;
    }

    try {
      const dataUrl = await this.readFileAsDataUrl(file);
      this.updateAvatar(templateId, dataUrl);
    } catch (error: any) {
      this.patchItem(templateId, { saveError: error?.message || 'Unable to read image file.' });
    } finally {
      input.value = '';
    }
  }

  private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result || '').toString());
      reader.onerror = () => reject(new Error('File read failed.'));
      reader.readAsDataURL(file);
    });
  }

  private patchItem(templateId: string, patch: Partial<EditableCoachPrompt>) {
    this.coachPrompts.update((items) => items.map((item) => {
      if (item.templateId !== templateId) return item;
      return { ...item, ...patch };
    }));
  }

  private countWords(value: string): number {
    const text = (value || '').trim();
    if (!text) return 0;
    return text.split(/\s+/).filter(Boolean).length;
  }
}

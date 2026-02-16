import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, OnInit, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AvatarDropdownComponent } from '../avatar-dropdown.component';
import { AuthService } from '../auth.service';
import { ThemeService } from '../theme.service';

type SyntheticTestResult = {
  summary?: {
    bestAudience?: string;
    bestPositioning?: string;
    bestCoreMessage?: string;
    bestPricing?: string;
    bestChannel?: string;
    keyObjection?: string;
    confidence?: number;
  };
  winningCombinations?: Array<{
    positioning: string;
    coreMessage: string;
    pricing: string;
    targetAudience: string;
    channel: string;
    intentScore: number;
    confidence?: number;
    rationale?: string;
  }>;
  audienceInsights?: Array<{
    audience: string;
    averageIntent: number;
    motivators: string[];
    objections: string[];
  }>;
  personaResponses?: Array<{
    personaName: string;
    audience: string;
    intentScore: number;
    verdict: 'yes' | 'maybe' | 'no';
    attraction: string;
    repellents: string;
    questions: string[];
    payTrigger: string;
  }>;
  nextActions?: Array<{
    priority: number;
    action: string;
    why: string;
    owner: string;
    timeline: string;
  }>;
};

type SyntheticOptionListKey = 'positioning' | 'coreMessage' | 'pricing' | 'audience' | 'channel';

@Component({
  selector: 'app-synthetic-market-testing',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AvatarDropdownComponent],
  templateUrl: './synthetic-market-testing.component.html',
  styleUrl: './synthetic-market-testing.component.css'
})
export class SyntheticMarketTestingComponent implements OnInit, AfterViewInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly theme = inject(ThemeService);
  protected readonly isDarkMode = this.theme.isDarkMode;

  checkingAuth = signal(true);
  success = signal<string | null>(null);
  activeSection = signal<string | null>(null);

  private readonly initialSyntheticPersonaSeeds = `Sarah Chen, 34, marketing manager, Austin, busy schedule, willing to pay for quality
Busy mom, 3 kids, budget-conscious, needs short home workouts
Type 2 diabetic, 52, health-first mindset, seeks safe guidance
Solo founder, 31, erratic schedule, high execution pressure`;
  syntheticCoachName = signal('Coach Tess');
  syntheticProductDescription = signal('Home workout & weight loss coaching for busy people. Power-packed 20-30 minute routines with personalized nutrition plans.');
  syntheticResearchGoal = signal('Find the best audience, positioning, message, pricing, and channel to prioritize for launch.');
  syntheticPersonaSeeds = signal(this.initialSyntheticPersonaSeeds);
  syntheticPositioningOptions = signal<string[]>([
    'Time-Shifter',
    'Your Home Workout Strategist',
    'The 20-Minute Solution',
    'No-BS Fitness Coach'
  ]);
  syntheticCoreMessageOptions = signal<string[]>([
    'Get fit in 20 minutes/day',
    'Home workouts that actually work',
    'Your personal trainer, minus the gym',
    'Science-backed workouts for busy people'
  ]);
  syntheticPricingOptions = signal<string[]>([
    '$9.99/month',
    '$19.99/month',
    '$29.99/month',
    '$49.99/month',
    '$99 one-time'
  ]);
  syntheticTargetAudienceOptions = signal<string[]>([
    'Busy professionals',
    'Stay-at-home parents',
    'Post-pregnancy moms',
    'People with chronic conditions',
    '50+ adults'
  ]);
  syntheticChannelOptions = signal<string[]>([
    'Instagram ads',
    'TikTok organic',
    'Facebook groups',
    'Reddit',
    'Google search ads'
  ]);
  syntheticRunning = signal(false);
  syntheticGeneratingPersonas = signal(false);
  personaSeedsCopied = signal(false);
  syntheticError = signal<string | null>(null);
  syntheticModel = signal<string | null>(null);
  syntheticGeneratedAt = signal<string | null>(null);
  syntheticResult = signal<SyntheticTestResult | null>(null);
  @ViewChild('personaSeedsTextarea') personaSeedsTextarea?: ElementRef<HTMLTextAreaElement>;
  private personaCopiedResetTimeout: ReturnType<typeof setTimeout> | null = null;

  async ngOnInit() {
    // Scroll to top when page opens
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }

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
    this.schedulePersonaTextareaResize();
  }

  ngAfterViewInit() {
    this.schedulePersonaTextareaResize();
  }

  toggleSection(section: string) {
    this.activeSection.update(current => current === section ? null : section);
  }

  getPersonaCount(): number {
    return this.syntheticPersonaSeeds()
      .split('\n')
      .filter(line => line.trim().length > 0)
      .length;
  }

  toggleDarkMode() {
    this.theme.toggleDarkMode();
  }

  async runSyntheticMarketTest() {
    const productDescription = this.syntheticProductDescription().trim();
    const personas = this.parseLines(this.syntheticPersonaSeeds());
    const positioning = this.cleanOptions(this.syntheticPositioningOptions());
    const coreMessages = this.cleanOptions(this.syntheticCoreMessageOptions());
    const pricing = this.cleanOptions(this.syntheticPricingOptions());
    const audiences = this.cleanOptions(this.syntheticTargetAudienceOptions());
    const channels = this.cleanOptions(this.syntheticChannelOptions());

    if (!productDescription) {
      this.syntheticError.set('Product description is required.');
      return;
    }

    if (personas.length === 0) {
      this.syntheticError.set('Add at least one persona seed.');
      return;
    }
    if (positioning.length === 0 || coreMessages.length === 0 || pricing.length === 0 || audiences.length === 0 || channels.length === 0) {
      this.syntheticError.set('Each option list needs at least one item before running the simulation.');
      return;
    }

    this.syntheticRunning.set(true);
    this.syntheticError.set(null);

    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { getApp } = await import('firebase/app');
      const functions = getFunctions(getApp());
      const runSimulation = httpsCallable(functions, 'runSyntheticMarketSimulation');

      const result = await runSimulation({
        coachName: this.syntheticCoachName().trim(),
        productDescription,
        researchGoal: this.syntheticResearchGoal().trim(),
        personaSeeds: personas,
        positioningOptions: positioning,
        coreMessageOptions: coreMessages,
        pricingOptions: pricing,
        targetAudienceOptions: audiences,
        channelOptions: channels,
      });

      const data = result.data as {
        success: boolean;
        model?: string;
        generatedAt?: string;
        result?: SyntheticTestResult;
      };

      if (!data?.success || !data?.result) {
        throw new Error('No simulation result returned.');
      }

      this.syntheticResult.set(data.result);
      this.syntheticModel.set(data.model || null);
      this.syntheticGeneratedAt.set(data.generatedAt || null);
    } catch (err: any) {
      console.error('Failed to run synthetic market test:', err);
      this.syntheticError.set(err?.message || 'Unable to run simulation.');
    } finally {
      this.syntheticRunning.set(false);
    }
  }

  async generateSyntheticPersonaSeeds() {
    const productDescription = this.syntheticProductDescription().trim();
    const positioning = this.cleanOptions(this.syntheticPositioningOptions());
    const coreMessages = this.cleanOptions(this.syntheticCoreMessageOptions());
    const pricing = this.cleanOptions(this.syntheticPricingOptions());
    const audiences = this.cleanOptions(this.syntheticTargetAudienceOptions());
    const channels = this.cleanOptions(this.syntheticChannelOptions());
    const existingPersonaSeeds = this.parseLines(this.syntheticPersonaSeeds());

    if (!productDescription) {
      this.syntheticError.set('Product description is required to generate personas.');
      return;
    }

    this.syntheticGeneratingPersonas.set(true);
    this.syntheticError.set(null);

    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { getApp } = await import('firebase/app');
      const functions = getFunctions(getApp());
      const generatePersonas = httpsCallable(functions, 'generateSyntheticPersonaSeeds');

      const result = await generatePersonas({
        coachName: this.syntheticCoachName().trim(),
        productDescription,
        researchGoal: this.syntheticResearchGoal().trim(),
        positioningOptions: positioning,
        coreMessageOptions: coreMessages,
        pricingOptions: pricing,
        targetAudienceOptions: audiences,
        channelOptions: channels,
        existingPersonaSeeds
      });

      const data = result.data as {
        success: boolean;
        model?: string;
        generatedAt?: string;
        personaSeeds?: string[];
      };

      const personaSeeds = Array.isArray(data?.personaSeeds)
        ? data.personaSeeds.map((item: unknown) => (item || '').toString().trim()).filter(Boolean)
        : [];

      if (!data?.success || personaSeeds.length === 0) {
        throw new Error('No personas were generated.');
      }

      this.syntheticPersonaSeeds.set(personaSeeds.join('\n'));
      this.schedulePersonaTextareaResize();
      this.success.set(`Generated ${personaSeeds.length} persona seeds.`);
      setTimeout(() => this.success.set(null), 3000);
    } catch (err: any) {
      console.error('Failed to generate persona seeds:', err);
      this.syntheticError.set(err?.message || 'Unable to generate persona seeds.');
    } finally {
      this.syntheticGeneratingPersonas.set(false);
    }
  }

  onPersonaSeedsInput(value: string, element: HTMLTextAreaElement) {
    this.syntheticPersonaSeeds.set(value);
    this.resizeTextarea(element);
  }

  async copyPersonaSeeds() {
    const value = this.syntheticPersonaSeeds().trim();
    if (!value || typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      this.personaSeedsCopied.set(true);
      if (this.personaCopiedResetTimeout) {
        clearTimeout(this.personaCopiedResetTimeout);
      }
      this.personaCopiedResetTimeout = setTimeout(() => {
        this.personaSeedsCopied.set(false);
        this.personaCopiedResetTimeout = null;
      }, 2500);
      this.success.set('Persona seeds copied to clipboard.');
      setTimeout(() => this.success.set(null), 3000);
    } catch (error) {
      console.warn('Failed to copy persona seeds:', error);
    }
  }

  resetPersonaSeeds() {
    this.syntheticPersonaSeeds.set(this.initialSyntheticPersonaSeeds);
    this.personaSeedsCopied.set(false);
    if (this.personaCopiedResetTimeout) {
      clearTimeout(this.personaCopiedResetTimeout);
      this.personaCopiedResetTimeout = null;
    }
    this.schedulePersonaTextareaResize();
  }

  syntheticResultJson() {
    const result = this.syntheticResult();
    if (!result) return '';
    return JSON.stringify(result, null, 2);
  }

  async copySyntheticResultJson() {
    const value = this.syntheticResultJson();
    if (!value || typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      this.success.set('Synthetic result JSON copied to clipboard.');
      setTimeout(() => this.success.set(null), 3000);
    } catch (error) {
      console.warn('Failed to copy synthetic result JSON:', error);
    }
  }

  intentLabel(score: number | undefined) {
    if (!Number.isFinite(score as number)) return '-';
    if ((score as number) >= 2.4) return 'High';
    if ((score as number) >= 1.5) return 'Medium';
    return 'Low';
  }

  syntheticTopCombination() {
    return this.syntheticResult()?.winningCombinations?.[0] || null;
  }

  syntheticOtherCombinations() {
    return this.syntheticResult()?.winningCombinations?.slice(1) || [];
  }

  addSyntheticOption(list: SyntheticOptionListKey) {
    const next = '';
    if (list === 'positioning') {
      this.syntheticPositioningOptions.update(items => [...items, next]);
      return;
    }
    if (list === 'coreMessage') {
      this.syntheticCoreMessageOptions.update(items => [...items, next]);
      return;
    }
    if (list === 'pricing') {
      this.syntheticPricingOptions.update(items => [...items, next]);
      return;
    }
    if (list === 'audience') {
      this.syntheticTargetAudienceOptions.update(items => [...items, next]);
      return;
    }
    this.syntheticChannelOptions.update(items => [...items, next]);
  }

  updateSyntheticOption(list: SyntheticOptionListKey, index: number, value: string) {
    const patch = (items: string[]) => items.map((item, i) => (i === index ? value : item));
    if (list === 'positioning') {
      this.syntheticPositioningOptions.update(patch);
      return;
    }
    if (list === 'coreMessage') {
      this.syntheticCoreMessageOptions.update(patch);
      return;
    }
    if (list === 'pricing') {
      this.syntheticPricingOptions.update(patch);
      return;
    }
    if (list === 'audience') {
      this.syntheticTargetAudienceOptions.update(patch);
      return;
    }
    this.syntheticChannelOptions.update(patch);
  }

  removeSyntheticOption(list: SyntheticOptionListKey, index: number) {
    const drop = (items: string[]) => items.filter((_item, i) => i !== index);
    if (list === 'positioning') {
      this.syntheticPositioningOptions.update(drop);
      return;
    }
    if (list === 'coreMessage') {
      this.syntheticCoreMessageOptions.update(drop);
      return;
    }
    if (list === 'pricing') {
      this.syntheticPricingOptions.update(drop);
      return;
    }
    if (list === 'audience') {
      this.syntheticTargetAudienceOptions.update(drop);
      return;
    }
    this.syntheticChannelOptions.update(drop);
  }

  private parseLines(input: string): string[] {
    return input
      .split(/\r?\n/)
      .map(item => item.trim())
      .filter(Boolean);
  }

  private cleanOptions(items: string[]): string[] {
    return Array.from(new Set(items.map(item => item.trim()).filter(Boolean)));
  }

  private schedulePersonaTextareaResize() {
    if (typeof window === 'undefined') return;
    setTimeout(() => {
      const textarea = this.personaSeedsTextarea?.nativeElement;
      if (textarea) this.resizeTextarea(textarea);
    });
  }

  private resizeTextarea(textarea: HTMLTextAreaElement) {
    textarea.style.height = 'auto';
    textarea.style.height = `${textarea.scrollHeight}px`;
  }
}

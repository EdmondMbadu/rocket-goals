import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from './auth.service';
import { RocketGoalsService } from './rocket-goals.service';
import { ThemeService } from './theme.service';
import { AvatarDropdownComponent } from './avatar-dropdown.component';
import { VisualizationService } from './visualization.service';

export interface PrebuiltTemplate {
  id: string;
  name: string;
  tagline: string;
  description: string;
  icon: string; // Emoji or icon identifier
  color: string; // Gradient colors for the card
  category: string;
  defaultGoals: {
    primaryGoal: string;
    theme: string;
    dailyEffort: string;
    objectives: string[];
  };
}

@Component({
  selector: 'app-app-suite',
  standalone: true,
  imports: [CommonModule, RouterLink, AvatarDropdownComponent],
  templateUrl: './app-suite.component.html',
  styleUrl: './app-suite.component.css'
})
export class AppSuiteComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly goalsService = inject(RocketGoalsService);
  private readonly theme = inject(ThemeService);
  private readonly visualizationService = inject(VisualizationService);

  protected readonly isDarkMode = this.theme.isDarkMode;
  protected readonly isLoggedIn = computed(() => !!this.authService.profile()?.userId);
  protected readonly isCreating = signal(false);
  protected readonly selectedTemplate = signal<PrebuiltTemplate | null>(null);
  protected readonly showConfirmModal = signal(false);

  readonly prebuiltTemplates: PrebuiltTemplate[] = [
    {
      id: 'hustle-orbit',
      name: 'HustleOrbit',
      tagline: 'Solopreneur & Indie Hacker execution co-pilot.',
      description: 'Build your indie empire with focused execution. Track product launches, customer acquisition, and revenue milestones.',
      icon: '🚀',
      color: 'from-slate-800 via-slate-700 to-slate-600',
      category: 'Business',
      defaultGoals: {
        primaryGoal: 'Launch and grow my indie product',
        theme: 'career',
        dailyEffort: '1hour',
        objectives: ['Ship features', 'Grow audience', 'Generate revenue']
      }
    },
    {
      id: 'opti-human',
      name: 'OptiHuman',
      tagline: 'Biohacker performance & health optimization.',
      description: 'Optimize your biology for peak performance. Track sleep, nutrition, exercise, and cognitive enhancement protocols.',
      icon: '🧬',
      color: 'from-purple-700 via-purple-600 to-indigo-600',
      category: 'Health',
      defaultGoals: {
        primaryGoal: 'Optimize my health and performance',
        theme: 'health',
        dailyEffort: '30min',
        objectives: ['Sleep optimization', 'Nutrition tracking', 'Energy management']
      }
    },
    {
      id: 'moonlight-maker',
      name: 'MoonlightMaker',
      tagline: 'Side Hustler empire building after hours.',
      description: 'Build your side hustle after your 9-5. Track progress on your passion project while balancing work-life.',
      icon: '🌙',
      color: 'from-indigo-800 via-indigo-700 to-blue-700',
      category: 'Business',
      defaultGoals: {
        primaryGoal: 'Build a profitable side hustle',
        theme: 'career',
        dailyEffort: '1hour',
        objectives: ['Evening work blocks', 'Weekend sprints', 'Revenue goals']
      }
    },
    {
      id: 'pipeline-pilot',
      name: 'PipelinePilot',
      tagline: 'Real Estate & Sales Pro deal accelerator.',
      description: 'Close more deals and grow your pipeline. Track leads, follow-ups, and revenue targets with precision.',
      icon: '📈',
      color: 'from-emerald-600 via-teal-600 to-cyan-600',
      category: 'Sales',
      defaultGoals: {
        primaryGoal: 'Close more deals and grow revenue',
        theme: 'finance',
        dailyEffort: '2hours',
        objectives: ['Lead generation', 'Follow-up cadence', 'Deal closing']
      }
    },
    {
      id: 'apex-ascend',
      name: 'ApexAscend',
      tagline: 'Corporate Climber leadership & strategy.',
      description: 'Advance your corporate career with strategic moves. Track promotions, skill building, and leadership development.',
      icon: '⛰️',
      color: 'from-sky-600 via-blue-600 to-indigo-600',
      category: 'Career',
      defaultGoals: {
        primaryGoal: 'Advance my corporate career',
        theme: 'career',
        dailyEffort: '30min',
        objectives: ['Visibility projects', 'Networking', 'Skill development']
      }
    },
    {
      id: 'creator-craft',
      name: 'CreatorCraft',
      tagline: 'Creative Freelancer project completion tool.',
      description: 'Ship creative projects on time. Track client work, personal projects, and portfolio building.',
      icon: '🎨',
      color: 'from-orange-500 via-amber-500 to-yellow-500',
      category: 'Creative',
      defaultGoals: {
        primaryGoal: 'Complete creative projects consistently',
        theme: 'career',
        dailyEffort: '2hours',
        objectives: ['Client deliverables', 'Portfolio pieces', 'Skill growth']
      }
    },
    {
      id: 'neuro-nexus',
      name: 'NeuroNexus',
      tagline: 'AI Early Adopter neural network coaching.',
      description: 'Master AI tools and stay ahead of the curve. Track learning, experiments, and AI project implementations.',
      icon: '🧠',
      color: 'from-cyan-600 via-teal-600 to-emerald-600',
      category: 'Learning',
      defaultGoals: {
        primaryGoal: 'Master AI tools and applications',
        theme: 'learning',
        dailyEffort: '1hour',
        objectives: ['AI tool mastery', 'Project experiments', 'Knowledge sharing']
      }
    },
    {
      id: 'boss-beam',
      name: 'BossBeam',
      tagline: 'Female Founder vision & scaling platform.',
      description: 'Scale your vision with confidence. Track fundraising, team building, and company milestones.',
      icon: '👑',
      color: 'from-fuchsia-600 via-pink-600 to-rose-600',
      category: 'Founder',
      defaultGoals: {
        primaryGoal: 'Scale my company and vision',
        theme: 'career',
        dailyEffort: '2hours',
        objectives: ['Team growth', 'Revenue milestones', 'Vision execution']
      }
    },
    {
      id: 'my-sugar-shift',
      name: 'MySugarShift',
      tagline: 'Wellness & nutrition balance assistant.',
      description: 'Transform your relationship with food and energy. Track nutrition, blood sugar, and wellness habits.',
      icon: '🍎',
      color: 'from-lime-500 via-green-500 to-emerald-500',
      category: 'Health',
      defaultGoals: {
        primaryGoal: 'Optimize nutrition and energy levels',
        theme: 'health',
        dailyEffort: '20min',
        objectives: ['Meal tracking', 'Energy patterns', 'Healthy habits']
      }
    },
    {
      id: 'my-rocket-ride',
      name: 'MyRocketRide',
      tagline: 'Distance Biker mileage & route planner.',
      description: 'Conquer long-distance cycling goals. Track mileage, routes, and training progress.',
      icon: '🚴',
      color: 'from-orange-600 via-red-500 to-rose-500',
      category: 'Fitness',
      defaultGoals: {
        primaryGoal: 'Complete my cycling distance goals',
        theme: 'health',
        dailyEffort: '1hour',
        objectives: ['Weekly mileage', 'Route completion', 'Performance gains']
      }
    },
    {
      id: 'marathon-mover',
      name: 'MarathonMover',
      tagline: 'Marathon runner training & pacing guide.',
      description: 'Train for your marathon with precision. Track runs, pacing strategies, and race preparation.',
      icon: '🏃',
      color: 'from-amber-500 via-orange-500 to-red-500',
      category: 'Fitness',
      defaultGoals: {
        primaryGoal: 'Complete my marathon training',
        theme: 'health',
        dailyEffort: '1hour',
        objectives: ['Weekly mileage', 'Pace improvement', 'Race readiness']
      }
    },
    {
      id: 'career-quest',
      name: 'CareerQuest',
      tagline: 'Job Seeker application & interview tracker.',
      description: 'Land your dream job with organized tracking. Manage applications, interviews, and networking.',
      icon: '💼',
      color: 'from-slate-600 via-zinc-600 to-neutral-600',
      category: 'Career',
      defaultGoals: {
        primaryGoal: 'Land my dream job',
        theme: 'career',
        dailyEffort: '2hours',
        objectives: ['Applications sent', 'Interviews completed', 'Network growth']
      }
    }
  ];

  async ngOnInit() {
    // Scroll to top when component loads
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    // Check for pending prebuilt creation after login/signup
    if (this.isLoggedIn()) {
      await this.checkPendingPrebuilt();
    }
  }

  toggleTheme() {
    this.theme.toggleDarkMode();
  }

  selectTemplate(template: PrebuiltTemplate) {
    this.selectedTemplate.set(template);
    this.showConfirmModal.set(true);
  }

  closeConfirmModal() {
    this.showConfirmModal.set(false);
    this.selectedTemplate.set(null);
  }

  async launchPrebuilt() {
    const template = this.selectedTemplate();
    if (!template) return;

    // Check if user is logged in
    if (!this.isLoggedIn()) {
      // Store the selected template and redirect to signup
      sessionStorage.setItem('pendingPrebuilt', JSON.stringify(template));
      this.closeConfirmModal();
      this.router.navigate(['/signup'], {
        queryParams: { redirectTo: '/app-suite', createPrebuilt: 'true' }
      });
      return;
    }

    await this.createGoalFromPrebuilt(template);
  }

  async createGoalFromPrebuilt(template: PrebuiltTemplate) {
    const profile = this.authService.profile();
    if (!profile?.userId) {
      this.router.navigate(['/signup'], {
        queryParams: { redirectTo: '/app-suite', createPrebuilt: 'true' }
      });
      return;
    }

    this.isCreating.set(true);

    try {
      const now = Date.now();

      // Create the goal with prebuilt template data
      const goalId = await this.goalsService.createRocketGoal({
        userId: profile.userId,
        primaryGoal: template.defaultGoals.primaryGoal,
        answers: {
          goal_title_label: `${template.name} Mission`,
          goal_theme: template.defaultGoals.theme,
          goal_theme_label: template.category,
          daily_effort: template.defaultGoals.dailyEffort,
          source: 'prebuilt_template',
          prebuilt_template_id: template.id,
          prebuilt_template_name: template.name,
          prebuilt_tagline: template.tagline,
          objectives: template.defaultGoals.objectives,
          custom_goal_title: `${template.name} Mission`,
          goalDescription: template.description,
          timeframe: 'week' // Default to 7-day challenge
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

      // Generate visualization image for the goal
      try {
        // Get user photo from profile for visualization if available
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
          // Update the goal with the visualization image URL
          await this.goalsService.updateRocketGoal(goalId, {
            visualizationImageUrl: visualizationResult.imageUrl
          });
          console.log('Visualization generated successfully:', visualizationResult.imageUrl);
        } else {
          console.warn('Failed to generate visualization:', visualizationResult.message);
        }
      } catch (visualizationError) {
        console.warn('Error generating visualization:', visualizationError);
        // Continue even if visualization fails - goal is already created
      }

      this.closeConfirmModal();
      this.isCreating.set(false);

      // Navigate to the new goal
      this.router.navigate(['/rocketgoal', goalId]);
    } catch (error) {
      console.error('Error creating prebuilt goal:', error);
      this.isCreating.set(false);
    }
  }

  /**
   * Convert an image URL to base64
   */
  private async imageUrlToBase64(url: string): Promise<string | null> {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = reader.result as string;
          // Remove data URL prefix if present
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

  async checkPendingPrebuilt() {
    const pending = sessionStorage.getItem('pendingPrebuilt');
    if (pending && this.isLoggedIn()) {
      try {
        const template = JSON.parse(pending) as PrebuiltTemplate;
        sessionStorage.removeItem('pendingPrebuilt');
        await this.createGoalFromPrebuilt(template);
      } catch (error) {
        console.error('Failed to create pending prebuilt:', error);
        sessionStorage.removeItem('pendingPrebuilt');
      }
    }
  }

  getUserFirstName(): string {
    return this.authService.profile()?.firstName || 'Achiever';
  }

  getCurrentYear(): number {
    return new Date().getFullYear();
  }
}


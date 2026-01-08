import { Routes } from '@angular/router';
import { authGuard } from './auth.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./landing-bridge.component').then(m => m.LandingBridgeComponent), pathMatch: 'full' },
  { path: 'login', loadComponent: () => import('./auth/login.component').then(m => m.LoginComponent) },
  { path: 'signup', loadComponent: () => import('./auth/signup.component').then(m => m.SignupComponent) },
  { path: 'welcome', loadComponent: () => import('./auth/welcome.component').then(m => m.WelcomeComponent) },
  { path: 'goals', loadComponent: () => import('./goals-list.component').then(m => m.GoalsListComponent), canActivate: [authGuard] },
  { path: 'rocketgoal/:id', loadComponent: () => import('./rocket-goal-view.component').then(m => m.RocketGoalViewComponent) },
  { path: 'profile', loadComponent: () => import('./profile.component').then(m => m.ProfileComponent) },
  { path: 'admin/ai-stats', loadComponent: () => import('./admin/ai-stats.component').then(m => m.AiStatsComponent) },
  { path: 'admin', loadComponent: () => import('./admin/admin.component').then(m => m.AdminComponent) },
  { path: 'ai', loadComponent: () => import('./rocket-ai-page.component').then(m => m.RocketAiPageComponent) },
  { path: 'quiz', loadComponent: () => import('./rocket-quiz/rocket-quiz').then(m => m.RocketQuiz) },
  { path: 'pricing', loadComponent: () => import('./pricing-page.component').then(m => m.PricingPageComponent), canActivate: [authGuard] },
  { path: 'contact', loadComponent: () => import('./contact-page.component').then(m => m.ContactPageComponent) },
  { path: 'about', loadComponent: () => import('./about-page.component').then(m => m.AboutPageComponent) },
  { path: 'schedule', loadComponent: () => import('./schedule-demo.component').then(m => m.ScheduleDemoComponent) },
  { path: 'app-suite', loadComponent: () => import('./app-suite.component').then(m => m.AppSuiteComponent) },
  
  // Launchpad Routes - Individual App Pages
  { path: 'launchpad/hustle-orbit', loadComponent: () => import('./launchpad/hustle-orbit.component').then(m => m.HustleOrbitComponent) },
  { path: 'launchpad/opti-human', loadComponent: () => import('./launchpad/opti-human.component').then(m => m.OptiHumanComponent) },
  { path: 'launchpad/moonlight-maker', loadComponent: () => import('./launchpad/moonlight-maker.component').then(m => m.MoonlightMakerComponent) },
  { path: 'launchpad/pipeline-pilot', loadComponent: () => import('./launchpad/pipeline-pilot.component').then(m => m.PipelinePilotComponent) },
  { path: 'launchpad/apex-ascend', loadComponent: () => import('./launchpad/apex-ascend.component').then(m => m.ApexAscendComponent) },
  { path: 'launchpad/creator-craft', loadComponent: () => import('./launchpad/creator-craft.component').then(m => m.CreatorCraftComponent) },
  { path: 'launchpad/neuro-nexus', loadComponent: () => import('./launchpad/neuro-nexus.component').then(m => m.NeuroNexusComponent) },
  { path: 'launchpad/boss-beam', loadComponent: () => import('./launchpad/boss-beam.component').then(m => m.BossBeamComponent) },
  { path: 'launchpad/my-sugar-shift', loadComponent: () => import('./launchpad/my-sugar-shift.component').then(m => m.MySugarShiftComponent) },
  { path: 'launchpad/my-rocket-ride', loadComponent: () => import('./launchpad/my-rocket-ride.component').then(m => m.MyRocketRideComponent) },
  { path: 'launchpad/marathon-mover', loadComponent: () => import('./launchpad/marathon-mover.component').then(m => m.MarathonMoverComponent) },
  { path: 'launchpad/career-quest', loadComponent: () => import('./launchpad/career-quest.component').then(m => m.CareerQuestComponent) },
  
  { path: '**', redirectTo: '' }
];

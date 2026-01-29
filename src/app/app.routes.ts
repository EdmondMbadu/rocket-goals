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
  { path: 'link-telegram', loadComponent: () => import('./link-telegram.component').then(m => m.LinkTelegramComponent), canActivate: [authGuard] },
  { path: 'admin/ai-stats', loadComponent: () => import('./admin/ai-stats.component').then(m => m.AiStatsComponent) },
  { path: 'admin', loadComponent: () => import('./admin/admin.component').then(m => m.AdminComponent) },
  { path: 'ai', loadComponent: () => import('./rocket-ai-page.component').then(m => m.RocketAiPageComponent) },
  { path: 'quiz', loadComponent: () => import('./rocket-quiz/rocket-quiz').then(m => m.RocketQuiz) },
  { path: 'pricing', loadComponent: () => import('./pricing-page.component').then(m => m.PricingPageComponent), canActivate: [authGuard] },
  { path: 'contact', loadComponent: () => import('./contact-page.component').then(m => m.ContactPageComponent) },
  { path: 'about', loadComponent: () => import('./about-page.component').then(m => m.AboutPageComponent) },
  { path: 'schedule', loadComponent: () => import('./schedule-demo.component').then(m => m.ScheduleDemoComponent) },
  { path: 'app-suite', loadComponent: () => import('./app-suite.component').then(m => m.AppSuiteComponent) },
  { path: 'surge-book', loadComponent: () => import('./surge-book-page.component').then(m => m.SurgeBookPageComponent) },

  // Launchpad Generic Route - Unified App Viewer
  { path: 'launchpad/:id', loadComponent: () => import('./launchpad/launchpad-app-viewer.component').then(m => m.LaunchpadAppViewerComponent) },

  { path: '**', redirectTo: '' }
];

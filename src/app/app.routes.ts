import { Routes } from '@angular/router';
import { LoginComponent } from './auth/login.component';
import { SignupComponent } from './auth/signup.component';
import { WelcomeComponent } from './auth/welcome.component';
import { LandingBridgeComponent } from './landing-bridge.component';
import { RocketGoalViewComponent } from './rocket-goal-view.component';
import { GoalsListComponent } from './goals-list.component';
import { ProfileComponent } from './profile.component';
import { AdminComponent } from './admin/admin.component';
import { RocketAiPageComponent } from './rocket-ai-page.component';

export const routes: Routes = [
  { path: '', component: LandingBridgeComponent, pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'signup', component: SignupComponent },
  { path: 'welcome', component: WelcomeComponent },
  { path: 'goals', component: GoalsListComponent },
  { path: 'rocketgoal/:id', component: RocketGoalViewComponent },
  { path: 'profile', component: ProfileComponent },
  { path: 'admin', component: AdminComponent },
  { path: 'rocketAi', component: RocketAiPageComponent },
  { path: 'ai', component: RocketAiPageComponent },
  { path: '**', redirectTo: '' }
];

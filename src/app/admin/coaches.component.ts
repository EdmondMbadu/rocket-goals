import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AvatarDropdownComponent } from '../avatar-dropdown.component';
import { AuthService } from '../auth.service';
import { ThemeService } from '../theme.service';
import { LAUNCHPAD_TEMPLATES } from '../launchpad/launchpad.types';

type CoachPromptItem = {
  id: string;
  appName: string;
  coachName: string;
  systemPrompt: string;
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
  private readonly theme = inject(ThemeService);
  protected readonly isDarkMode = this.theme.isDarkMode;

  checkingAuth = signal(true);

  readonly coachPrompts: CoachPromptItem[] = Object.values(LAUNCHPAD_TEMPLATES)
    .filter((template) => template.id !== 'lean-launch')
    .map((template) => ({
      id: template.id,
      appName: template.name,
      coachName: template.coPilotName,
      systemPrompt: `You are ${template.coPilotName}, ${template.coPilotRole}`
    }));

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
  }

  toggleDarkMode() {
    this.theme.toggleDarkMode();
  }
}

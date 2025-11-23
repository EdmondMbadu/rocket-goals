import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-welcome',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './welcome.component.html',
  styleUrl: './welcome.component.css'
})
export class WelcomeComponent {
  private authService = inject(AuthService);

  readonly profile = computed(() => this.authService.profile());

  get displayName() {
    const profile = this.profile();
    if (!profile) return 'Rocketeer';
    const first = profile.firstName?.trim();
    const last = profile.lastName?.trim();
    return [first, last].filter(Boolean).join(' ') || 'Rocketeer';
  }
}

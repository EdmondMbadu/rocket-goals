import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-landing-bridge',
  standalone: true,
  template: '' // Empty template to prevent any flicker
})
export class LandingBridgeComponent implements OnInit {
  private router = inject(Router);
  private authService = inject(AuthService);

  ngOnInit() {
    // Immediately check auth and redirect authenticated users to goals
    // Unauthenticated users will see the landing page (app.html)
    const checkAuthAndRedirect = () => {
      const profile = this.authService.profile();

      if (profile?.userId) {
        // User is authenticated, redirect to AI page (home page)
        this.router.navigateByUrl('/ai', { replaceUrl: true });
      }
      // If not authenticated, do nothing - let the app component show the landing page
    };

    // Try immediately, then retry if profile not ready yet
    checkAuthAndRedirect();

    // If profile not ready, wait a bit and try again (max 5 attempts)
    let attempts = 0;
    const maxAttempts = 5;
    const retryInterval = setInterval(() => {
      attempts++;
      const profile = this.authService.profile();

      if (profile?.userId) {
        clearInterval(retryInterval);
        this.router.navigateByUrl('/ai', { replaceUrl: true });
      } else if (attempts >= maxAttempts) {
        clearInterval(retryInterval);
        // Don't redirect - let landing page show
      }
    }, 100);
  }
}

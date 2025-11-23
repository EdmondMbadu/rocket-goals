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
    // Immediately check auth and redirect without rendering anything
    // This prevents flicker by redirecting before Angular renders the component
    const checkAuthAndRedirect = () => {
      const profile = this.authService.profile();
      
      if (profile?.userId) {
        // User is authenticated, redirect to goals list (home page)
        this.router.navigateByUrl('/goals', { replaceUrl: true });
      } else {
        // User is not authenticated, redirect to login
        this.router.navigateByUrl('/login', { replaceUrl: true });
      }
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
        this.router.navigateByUrl('/goals', { replaceUrl: true });
      } else if (attempts >= maxAttempts) {
        clearInterval(retryInterval);
        this.router.navigateByUrl('/login', { replaceUrl: true });
      }
    }, 100);
  }
}

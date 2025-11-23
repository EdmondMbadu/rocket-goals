import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-landing-bridge',
  standalone: true,
  template: '<div class="min-h-screen bg-gradient-to-br from-white via-gray-50 to-red-50 flex items-center justify-center"><div class="text-center"><div class="w-16 h-16 border-4 border-red-100 border-t-red-600 rounded-full animate-spin mx-auto mb-6"></div><p class="text-gray-600 font-semibold text-lg">Loading...</p></div></div>'
})
export class LandingBridgeComponent implements OnInit {
  private router = inject(Router);
  private authService = inject(AuthService);

  ngOnInit() {
    // Check if user is authenticated and redirect appropriately
    // Wait for auth to initialize (try multiple times)
    let attempts = 0;
    const maxAttempts = 10;
    
    const checkAuthAndRedirect = () => {
      attempts++;
      const profile = this.authService.profile();
      
      if (profile?.userId) {
        // User is authenticated, redirect to goals list (home page)
        this.router.navigateByUrl('/goals');
      } else if (attempts >= maxAttempts) {
        // After max attempts, assume not authenticated and redirect to login
        this.router.navigateByUrl('/login');
      } else {
        // Wait a bit more and try again
        setTimeout(checkAuthAndRedirect, 200);
      }
    };
    
    // Start checking after a short delay
    setTimeout(checkAuthAndRedirect, 100);
  }
}

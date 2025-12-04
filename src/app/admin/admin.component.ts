import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { AvatarDropdownComponent } from '../avatar-dropdown.component';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, AvatarDropdownComponent],
  templateUrl: './admin.component.html',
  styleUrl: './admin.component.css'
})
export class AdminComponent implements OnInit {
  private authService = inject(AuthService);
  private router = inject(Router);
  
  // Email form state
  emailTo = signal('');
  emailSubject = signal('Test Email from Rocket Goals');
  emailMessage = signal('Hello! This is a test email sent from the Rocket Goals Admin Panel to verify SendGrid integration is working correctly.');
  
  // UI state
  loading = signal(false);
  success = signal<string | null>(null);
  error = signal<string | null>(null);
  isAdmin = signal(false);
  checkingAuth = signal(true);

  async ngOnInit() {
    // Wait for auth to load
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

    // Check if user is admin
    if (profile.role !== 'admin' && !profile.admin) {
      this.router.navigate(['/goals']);
      return;
    }

    this.isAdmin.set(true);
    this.checkingAuth.set(false);
  }

  async sendTestEmail() {
    const to = this.emailTo().trim();
    const subject = this.emailSubject().trim();
    const message = this.emailMessage().trim();

    // Validation
    if (!to) {
      this.error.set('Please enter a recipient email address');
      setTimeout(() => this.error.set(null), 5000);
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
      this.error.set('Please enter a valid email address');
      setTimeout(() => this.error.set(null), 5000);
      return;
    }

    if (!subject) {
      this.error.set('Please enter an email subject');
      setTimeout(() => this.error.set(null), 5000);
      return;
    }

    if (!message) {
      this.error.set('Please enter an email message');
      setTimeout(() => this.error.set(null), 5000);
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.success.set(null);

    try {
      // Import Firebase functions
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { getApp } = await import('firebase/app');
      
      const app = getApp();
      const functions = getFunctions(app);
      const sendEmail = httpsCallable(functions, 'sendTestEmail');

      const result = await sendEmail({ to, subject, message });
      const data = result.data as { success: boolean; message: string };
      
      if (data.success) {
        this.success.set(`✅ ${data.message}`);
        // Clear form on success
        this.emailTo.set('');
      } else {
        this.error.set('Failed to send email. Please try again.');
      }
    } catch (err: any) {
      console.error('Error sending email:', err);
      const errorMessage = err.message || 'An unexpected error occurred';
      this.error.set(`Failed to send email: ${errorMessage}`);
    } finally {
      this.loading.set(false);
      setTimeout(() => {
        this.success.set(null);
        this.error.set(null);
      }, 8000);
    }
  }

  getProfile() {
    return this.authService.profile();
  }
}


import { Component, computed, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { AuthService } from '../auth.service';
import { ThemeService } from '../theme.service';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './signup.component.html',
  styleUrl: './signup.component.css'
})
export class SignupComponent implements OnInit {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  protected theme = inject(ThemeService);
  readonly redirectTo = this.route.snapshot.queryParamMap.get('redirectTo');
  readonly mobileNavOpen = signal(false);

  readonly signupForm = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.minLength(2)]],
    lastName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  ngOnInit(): void {
    // Pre-fill form from query parameters (e.g., from book download)
    const params = this.route.snapshot.queryParams;
    if (params['firstName']) {
      this.signupForm.patchValue({ firstName: params['firstName'] });
    }
    if (params['lastName']) {
      this.signupForm.patchValue({ lastName: params['lastName'] });
    }
    if (params['email']) {
      this.signupForm.patchValue({ email: params['email'] });
    }
  }

  readonly submitting = computed(() => this.authService.authLoading());
  readonly serverError = signal<string | null>(null);
  readonly verificationSent = signal(false);
  readonly verificationEmail = signal('');
  readonly verificationNotice = signal<string | null>(null);
  readonly verificationSending = signal(false);

  async handleSubmit() {
    if (this.signupForm.invalid || this.submitting()) {
      this.signupForm.markAllAsTouched();
      return;
    }
    this.serverError.set(null);
    this.verificationNotice.set(null);
    try {
      if (this.redirectTo) {
        sessionStorage.setItem('redirectTo', this.redirectTo);
      }
      const { firstName, lastName, email, password } = this.signupForm.getRawValue();
      await this.authService.signUpWithEmail({ firstName, lastName, email, password });
      await this.authService.sendEmailVerification();
      // Send welcome email with Surge book (fire and forget - don't block signup)
      this.authService.sendWelcomeEmail().catch(() => {});
      this.verificationEmail.set(email);
      this.verificationSent.set(true);
      this.verificationNotice.set('Verification email sent. Check your inbox and confirm to continue.');
    } catch {
      this.serverError.set(this.authService.authError() || 'Unable to create your account right now.');
    }
  }

  async handleGoogleSignup() {
    if (this.submitting()) return;
    this.serverError.set(null);
    try {
      const { isNewUser } = await this.authService.signInWithGoogle();
      if (isNewUser) {
        // Send welcome email with Surge book for new users (fire and forget)
        this.authService.sendWelcomeEmail().catch(() => {});
      }
      await this.router.navigateByUrl(this.redirectTo || '/ai');
    } catch {
      this.serverError.set(this.authService.authError());
    }
  }

  toggleMobileNav(): void {
    this.mobileNavOpen.set(!this.mobileNavOpen());
  }

  closeMobileNav(): void {
    this.mobileNavOpen.set(false);
  }

  async resendVerificationEmail() {
    if (this.verificationSending()) return;
    this.serverError.set(null);
    this.verificationNotice.set(null);
    this.verificationSending.set(true);
    try {
      await this.authService.sendEmailVerification();
      this.verificationNotice.set(`Verification email re-sent to ${this.verificationEmail()}.`);
    } catch {
      this.serverError.set('Unable to resend the verification email right now.');
    } finally {
      this.verificationSending.set(false);
    }
  }

  getControlError(controlName: keyof typeof this.signupForm.controls, label: string) {
    const control = this.signupForm.controls[controlName];
    if (!control.touched) return null;
    if (control.hasError('required')) return `${label} is required`;
    if (control.hasError('email')) return 'Enter a valid email';
    if (control.hasError('minlength')) {
      const required = control.getError('minlength').requiredLength;
      return `${label} must be at least ${required} characters`;
    }
    return null;
  }
}

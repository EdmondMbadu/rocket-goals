import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';
import { ThemeService } from '../theme.service';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './signup.component.html',
  styleUrl: './signup.component.css'
})
export class SignupComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  protected theme = inject(ThemeService);

  readonly signupForm = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.minLength(2)]],
    lastName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

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
      const { firstName, lastName, email, password } = this.signupForm.getRawValue();
      await this.authService.signUpWithEmail({ firstName, lastName, email, password });
      await this.authService.sendEmailVerification();
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
      await this.authService.signInWithGoogle();
      await this.router.navigateByUrl('/ai');
    } catch {
      this.serverError.set(this.authService.authError());
    }
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

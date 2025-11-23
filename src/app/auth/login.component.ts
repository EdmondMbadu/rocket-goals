import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  readonly loginForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  readonly submitting = computed(() => this.authService.authLoading());
  readonly serverError = signal<string | null>(null);
  readonly resetSuccess = signal<string | null>(null);
  readonly resetError = signal<string | null>(null);
  readonly sendingReset = signal(false);

  async handleSubmit() {
    if (this.loginForm.invalid || this.submitting()) {
      this.loginForm.markAllAsTouched();
      return;
    }
    this.serverError.set(null);
    try {
      await this.authService.signInWithEmail(
        this.loginForm.controls.email.value,
        this.loginForm.controls.password.value
      );
      await this.router.navigateByUrl('/welcome');
    } catch (error) {
      this.serverError.set(this.authService.authError());
    }
  }

  async handleGoogleLogin() {
    if (this.submitting()) {
      return;
    }
    this.serverError.set(null);
    try {
      await this.authService.signInWithGoogle();
      await this.router.navigateByUrl('/welcome');
    } catch (error) {
      this.serverError.set(this.authService.authError());
    }
  }

  async handleForgotPassword() {
    const emailControl = this.loginForm.controls.email;
    emailControl.markAsTouched();
    this.resetError.set(null);
    this.resetSuccess.set(null);
    if (emailControl.invalid || this.sendingReset()) {
      this.resetError.set(this.emailError || 'Enter your email to reset your password.');
      return;
    }
    this.sendingReset.set(true);
    try {
      await this.authService.sendPasswordResetEmail(emailControl.value);
      this.resetSuccess.set('Password reset link sent. Check your inbox (and spam folder just in case).');
    } catch (error: any) {
      this.resetError.set(error?.message || 'Unable to send reset email.');
    } finally {
      this.sendingReset.set(false);
    }
  }

  get emailError() {
    const control = this.loginForm.controls.email;
    if (!control.touched) return null;
    if (control.hasError('required')) return 'Email is required';
    if (control.hasError('email')) return 'Enter a valid email';
    return null;
  }

  get passwordError() {
    const control = this.loginForm.controls.password;
    if (!control.touched) return null;
    if (control.hasError('required')) return 'Password is required';
    if (control.hasError('minlength')) return 'Password must be at least 6 characters';
    return null;
  }
}

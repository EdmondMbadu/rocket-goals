import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth.service';

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

  readonly signupForm = this.fb.nonNullable.group({
    firstName: ['', [Validators.required, Validators.minLength(2)]],
    lastName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  readonly submitting = computed(() => this.authService.authLoading());
  readonly serverError = signal<string | null>(null);

  async handleSubmit() {
    if (this.signupForm.invalid || this.submitting()) {
      this.signupForm.markAllAsTouched();
      return;
    }
    this.serverError.set(null);
    try {
      const { firstName, lastName, email, password } = this.signupForm.getRawValue();
      await this.authService.signUpWithEmail({ firstName, lastName, email, password });
      await this.router.navigateByUrl('/welcome');
    } catch {
      this.serverError.set(this.authService.authError());
    }
  }

  async handleGoogleSignup() {
    if (this.submitting()) return;
    this.serverError.set(null);
    try {
      await this.authService.signInWithGoogle();
      await this.router.navigateByUrl('/welcome');
    } catch {
      this.serverError.set(this.authService.authError());
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

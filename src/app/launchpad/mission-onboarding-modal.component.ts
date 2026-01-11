import { Component, EventEmitter, Input, Output, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LaunchpadTemplate, MissionOnboardingData, ExperienceLevel } from './launchpad.types';

@Component({
  selector: 'app-mission-onboarding-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (isOpen()) {
      <!-- Modal Backdrop -->
      <div class="modal-backdrop" (click)="close()">
        <div class="modal-container" (click)="$event.stopPropagation()">
          <!-- Modal Header -->
          <div class="modal-header">
            <div class="modal-header-content">
              <div class="template-icon" [style.background]="template.accentColor + '20'">
                <span>{{ template.icon }}</span>
              </div>
              <div>
                <h2 class="modal-title">Launch {{ template.name }}</h2>
                <p class="modal-subtitle">Set up your mission parameters</p>
              </div>
            </div>
            <button class="close-btn" (click)="close()" type="button">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <!-- Modal Body -->
          <div class="modal-body">
            <!-- Step Indicator -->
            <div class="step-indicator">
              @for (step of steps; track step.num; let i = $index) {
                <div class="step" [class.active]="currentStep() >= step.num" [class.current]="currentStep() === step.num">
                  <div class="step-circle" [style.borderColor]="currentStep() >= step.num ? template.accentColor : ''">
                    @if (currentStep() > step.num) {
                      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                      </svg>
                    } @else {
                      {{ step.num }}
                    }
                  </div>
                  <span class="step-label">{{ step.label }}</span>
                </div>
                @if (i < steps.length - 1) {
                  <div class="step-line" [class.active]="currentStep() > step.num"></div>
                }
              }
            </div>

            <!-- Step 1: Dates -->
            @if (currentStep() === 1) {
              <div class="step-content animate-fade-in">
                <h3 class="step-title">When does your mission begin and end?</h3>
                <p class="step-description">Define your mission timeline. We'll create milestones to guide you through.</p>

                <div class="form-grid">
                  <div class="form-group">
                    <label class="form-label">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                      </svg>
                      Start Date
                    </label>
                    <input
                      type="date"
                      class="form-input"
                      [min]="today"
                      [(ngModel)]="formData.startDate"
                      (change)="validateDates()"
                      [style.borderColor]="formData.startDate ? template.accentColor + '50' : ''"
                    />
                  </div>

                  <div class="form-group">
                    <label class="form-label">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
                      </svg>
                      End Date
                    </label>
                    <input
                      type="date"
                      class="form-input"
                      [min]="formData.startDate || today"
                      [(ngModel)]="formData.endDate"
                      (change)="validateDates()"
                      [style.borderColor]="formData.endDate ? template.accentColor + '50' : ''"
                    />
                  </div>
                </div>

                @if (formData.startDate && formData.endDate) {
                  <div class="duration-badge" [style.background]="template.accentColor + '15'" [style.color]="template.accentColor">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    {{ getDurationText() }}
                  </div>
                }
              </div>
            }

            <!-- Step 2: Experience Level -->
            @if (currentStep() === 2) {
              <div class="step-content animate-fade-in">
                <h3 class="step-title">What's your experience level?</h3>
                <p class="step-description">This helps us tailor milestones to match your skill level.</p>

                <div class="experience-options">
                  @for (level of experienceLevels; track level.value) {
                    <button
                      type="button"
                      class="experience-card"
                      [class.selected]="formData.experienceLevel === level.value"
                      [style.borderColor]="formData.experienceLevel === level.value ? template.accentColor : ''"
                      [style.background]="formData.experienceLevel === level.value ? template.accentColor + '10' : ''"
                      (click)="selectExperience(level.value)"
                    >
                      <span class="experience-icon">{{ level.icon }}</span>
                      <span class="experience-label">{{ level.label }}</span>
                      <span class="experience-desc">{{ level.description }}</span>
                      @if (formData.experienceLevel === level.value) {
                        <div class="selected-indicator" [style.background]="template.accentColor">
                          <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                          </svg>
                        </div>
                      }
                    </button>
                  }
                </div>
              </div>
            }

            <!-- Step 3: ONE Thing Metric -->
            @if (currentStep() === 3) {
              <div class="step-content animate-fade-in">
                <h3 class="step-title">Define your ONE Thing success metric</h3>
                <p class="step-description">What specific outcome will mark mission success?</p>

                <div class="form-group metric-group">
                  <label class="form-label metric-label">
                    <span class="metric-icon" [style.background]="template.accentColor + '20'" [style.color]="template.accentColor">
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                      </svg>
                    </span>
                    {{ template.oneThingMetric.label }}
                  </label>

                  <div class="metric-input-wrapper">
                    @if (template.oneThingMetric.unit && template.oneThingMetric.type === 'currency') {
                      <span class="input-prefix">{{ template.oneThingMetric.unit }}</span>
                    }
                    <input
                      [type]="getInputType()"
                      class="form-input metric-input"
                      [class.has-prefix]="template.oneThingMetric.unit && template.oneThingMetric.type === 'currency'"
                      [class.has-suffix]="template.oneThingMetric.unit && template.oneThingMetric.type !== 'currency'"
                      [placeholder]="template.oneThingMetric.placeholder"
                      [(ngModel)]="formData.oneThingMetric"
                      [style.borderColor]="formData.oneThingMetric ? template.accentColor + '50' : ''"
                    />
                    @if (template.oneThingMetric.unit && template.oneThingMetric.type !== 'currency') {
                      <span class="input-suffix">{{ template.oneThingMetric.unit }}</span>
                    }
                  </div>

                  @if (template.oneThingMetric.helpText) {
                    <p class="form-help">{{ template.oneThingMetric.helpText }}</p>
                  }
                </div>

                <!-- Summary Preview -->
                @if (isFormValid()) {
                  <div class="mission-summary">
                    <h4 class="summary-title">Mission Summary</h4>
                    <div class="summary-content">
                      <div class="summary-item">
                        <span class="summary-label">Timeline</span>
                        <span class="summary-value">{{ getDurationText() }}</span>
                      </div>
                      <div class="summary-item">
                        <span class="summary-label">Experience</span>
                        <span class="summary-value">{{ getExperienceLabel() }}</span>
                      </div>
                      <div class="summary-item">
                        <span class="summary-label">Target</span>
                        <span class="summary-value">{{ getFormattedMetric() }}</span>
                      </div>
                    </div>
                  </div>
                }
              </div>
            }
          </div>

          <!-- Modal Footer -->
          <div class="modal-footer">
            @if (currentStep() > 1) {
              <button type="button" class="btn-secondary" (click)="prevStep()">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
                </svg>
                Back
              </button>
            } @else {
              <button type="button" class="btn-secondary" (click)="close()">
                Cancel
              </button>
            }

            @if (currentStep() < 3) {
              <button
                type="button"
                class="btn-primary"
                [disabled]="!canProceed()"
                [style.background]="template.accentColor"
                (click)="nextStep()"
              >
                Continue
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
              </button>
            } @else {
              <button
                type="button"
                class="btn-primary btn-launch"
                [disabled]="!isFormValid()"
                [style.background]="template.accentColor"
                (click)="submit()"
              >
                <span>🚀</span>
                Launch Mission
              </button>
            }
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1000;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      animation: fadeIn 0.2s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .modal-container {
      width: 100%;
      max-width: 580px;
      max-height: 90vh;
      overflow-y: auto;
      background: linear-gradient(180deg, #1e293b 0%, #0f172a 100%);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 24px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      animation: slideUp 0.3s ease-out;
    }

    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 24px 28px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .modal-header-content {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .template-icon {
      width: 48px;
      height: 48px;
      border-radius: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
    }

    .modal-title {
      font-size: 1.25rem;
      font-weight: 800;
      color: #ffffff;
      margin: 0;
    }

    .modal-subtitle {
      font-size: 0.875rem;
      color: rgba(255, 255, 255, 0.5);
      margin: 4px 0 0 0;
    }

    .close-btn {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 10px;
      color: rgba(255, 255, 255, 0.6);
      cursor: pointer;
      transition: all 0.2s;
    }

    .close-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #ffffff;
    }

    .modal-body {
      padding: 28px;
    }

    /* Step Indicator */
    .step-indicator {
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 32px;
    }

    .step {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }

    .step-circle {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: 2px solid rgba(255, 255, 255, 0.2);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.875rem;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.4);
      transition: all 0.3s;
      background: rgba(255, 255, 255, 0.05);
    }

    .step.active .step-circle {
      color: #ffffff;
      background: rgba(255, 255, 255, 0.1);
    }

    .step.current .step-circle {
      transform: scale(1.1);
      box-shadow: 0 0 20px rgba(255, 255, 255, 0.2);
    }

    .step-label {
      font-size: 0.75rem;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.4);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .step.active .step-label {
      color: rgba(255, 255, 255, 0.7);
    }

    .step-line {
      width: 60px;
      height: 2px;
      background: rgba(255, 255, 255, 0.1);
      margin: 0 12px;
      margin-bottom: 28px;
      transition: background 0.3s;
    }

    .step-line.active {
      background: rgba(255, 255, 255, 0.3);
    }

    /* Step Content */
    .step-content {
      min-height: 280px;
    }

    .animate-fade-in {
      animation: fadeInContent 0.3s ease-out;
    }

    @keyframes fadeInContent {
      from {
        opacity: 0;
        transform: translateX(10px);
      }
      to {
        opacity: 1;
        transform: translateX(0);
      }
    }

    .step-title {
      font-size: 1.25rem;
      font-weight: 800;
      color: #ffffff;
      margin: 0 0 8px 0;
    }

    .step-description {
      font-size: 0.9375rem;
      color: rgba(255, 255, 255, 0.5);
      margin: 0 0 28px 0;
      line-height: 1.5;
    }

    /* Form Elements */
    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .form-label {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.875rem;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.7);
    }

    .form-input {
      width: 100%;
      padding: 14px 16px;
      background: rgba(255, 255, 255, 0.05);
      border: 2px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      color: #ffffff;
      font-size: 1rem;
      font-weight: 500;
      transition: all 0.2s;
    }

    .form-input:focus {
      outline: none;
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.3);
    }

    .form-input::placeholder {
      color: rgba(255, 255, 255, 0.3);
    }

    .form-help {
      font-size: 0.8125rem;
      color: rgba(255, 255, 255, 0.4);
      margin: 4px 0 0 0;
    }

    .duration-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      border-radius: 10px;
      font-size: 0.875rem;
      font-weight: 700;
      margin-top: 20px;
    }

    /* Experience Cards */
    .experience-options {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .experience-card {
      position: relative;
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 20px;
      background: rgba(255, 255, 255, 0.03);
      border: 2px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      cursor: pointer;
      transition: all 0.2s;
      text-align: left;
    }

    .experience-card:hover {
      background: rgba(255, 255, 255, 0.06);
      border-color: rgba(255, 255, 255, 0.15);
    }

    .experience-icon {
      font-size: 28px;
      flex-shrink: 0;
    }

    .experience-label {
      font-size: 1rem;
      font-weight: 800;
      color: #ffffff;
      flex-shrink: 0;
      min-width: 120px;
    }

    .experience-desc {
      font-size: 0.875rem;
      color: rgba(255, 255, 255, 0.5);
      flex-grow: 1;
    }

    .selected-indicator {
      position: absolute;
      top: 16px;
      right: 16px;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
    }

    /* Metric Input */
    .metric-group {
      margin-top: 8px;
    }

    .metric-label {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 1rem;
      margin-bottom: 4px;
    }

    .metric-icon {
      width: 40px;
      height: 40px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .metric-input-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }

    .input-prefix {
      position: absolute;
      left: 16px;
      font-size: 1.125rem;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.5);
    }

    .input-suffix {
      position: absolute;
      right: 16px;
      font-size: 0.875rem;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.4);
    }

    .metric-input {
      font-size: 1.125rem;
      padding: 16px 20px;
    }

    .metric-input.has-prefix {
      padding-left: 40px;
    }

    .metric-input.has-suffix {
      padding-right: 60px;
    }

    /* Mission Summary */
    .mission-summary {
      margin-top: 28px;
      padding: 20px;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
    }

    .summary-title {
      font-size: 0.75rem;
      font-weight: 800;
      color: rgba(255, 255, 255, 0.5);
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin: 0 0 16px 0;
    }

    .summary-content {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }

    .summary-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .summary-label {
      font-size: 0.75rem;
      color: rgba(255, 255, 255, 0.4);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .summary-value {
      font-size: 0.9375rem;
      font-weight: 700;
      color: #ffffff;
    }

    /* Modal Footer */
    .modal-footer {
      display: flex;
      justify-content: space-between;
      padding: 20px 28px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }

    .btn-secondary {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 20px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      color: rgba(255, 255, 255, 0.7);
      font-size: 0.9375rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
    }

    .btn-secondary:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #ffffff;
    }

    .btn-primary {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 24px;
      border: none;
      border-radius: 12px;
      color: #ffffff;
      font-size: 0.9375rem;
      font-weight: 800;
      cursor: pointer;
      transition: all 0.2s;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    }

    .btn-primary:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
    }

    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-launch {
      padding: 14px 28px;
      font-size: 1rem;
    }

    /* Responsive */
    @media (max-width: 640px) {
      .modal-container {
        max-height: 95vh;
        border-radius: 20px;
      }

      .modal-header {
        padding: 20px;
      }

      .modal-body {
        padding: 20px;
      }

      .form-grid {
        grid-template-columns: 1fr;
      }

      .step-line {
        width: 40px;
        margin: 0 8px;
      }

      .summary-content {
        grid-template-columns: 1fr;
        gap: 12px;
      }

      .experience-card {
        flex-wrap: wrap;
      }

      .experience-desc {
        width: 100%;
        margin-top: 4px;
      }
    }
  `]
})
export class MissionOnboardingModalComponent {
  @Input({ required: true }) template!: LaunchpadTemplate;
  @Output() onClose = new EventEmitter<void>();
  @Output() onSubmit = new EventEmitter<MissionOnboardingData>();

  readonly isOpen = signal(true);
  readonly currentStep = signal(1);

  readonly today = this.formatDate(new Date());

  formData: MissionOnboardingData = {
    startDate: this.today,
    endDate: '',
    experienceLevel: 'intermediate',
    oneThingMetric: ''
  };

  readonly steps = [
    { num: 1, label: 'Timeline' },
    { num: 2, label: 'Experience' },
    { num: 3, label: 'Target' }
  ];

  readonly experienceLevels = [
    {
      value: 'beginner' as ExperienceLevel,
      label: 'Beginner',
      icon: '🌱',
      description: 'New to this area, need guidance and foundational steps'
    },
    {
      value: 'intermediate' as ExperienceLevel,
      label: 'Intermediate',
      icon: '🚀',
      description: 'Some experience, ready for moderate challenges'
    },
    {
      value: 'advanced' as ExperienceLevel,
      label: 'Advanced',
      icon: '⚡',
      description: 'Experienced, ready for aggressive milestones'
    }
  ];

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  validateDates(): void {
    if (this.formData.startDate && this.formData.endDate) {
      const start = new Date(this.formData.startDate);
      const end = new Date(this.formData.endDate);
      if (end <= start) {
        this.formData.endDate = '';
      }
    }
  }

  getDurationText(): string {
    if (!this.formData.startDate || !this.formData.endDate) return '';

    const start = new Date(this.formData.startDate);
    const end = new Date(this.formData.endDate);
    const days = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));

    if (days === 1) return '1 day';
    if (days < 7) return `${days} days`;
    if (days === 7) return '1 week';
    if (days < 30) return `${Math.ceil(days / 7)} weeks`;
    if (days < 60) return '1 month';
    return `${Math.ceil(days / 30)} months`;
  }

  selectExperience(level: ExperienceLevel): void {
    this.formData.experienceLevel = level;
  }

  getExperienceLabel(): string {
    return this.experienceLevels.find(l => l.value === this.formData.experienceLevel)?.label || '';
  }

  getFormattedMetric(): string {
    const metric = this.template.oneThingMetric;
    const value = this.formData.oneThingMetric;

    if (!value) return '';

    if (metric.type === 'currency' && metric.unit) {
      return `${metric.unit}${value}`;
    }
    if (metric.unit) {
      return `${value} ${metric.unit}`;
    }
    return value;
  }

  getInputType(): string {
    switch (this.template.oneThingMetric.type) {
      case 'number':
      case 'weight':
      case 'currency':
      case 'percentage':
        return 'number';
      case 'time':
        return 'text';
      default:
        return 'text';
    }
  }

  canProceed(): boolean {
    switch (this.currentStep()) {
      case 1:
        return !!this.formData.startDate && !!this.formData.endDate;
      case 2:
        return !!this.formData.experienceLevel;
      default:
        return true;
    }
  }

  isFormValid(): boolean {
    return (
      !!this.formData.startDate &&
      !!this.formData.endDate &&
      !!this.formData.experienceLevel &&
      !!this.formData.oneThingMetric
    );
  }

  nextStep(): void {
    if (this.currentStep() < 3 && this.canProceed()) {
      this.currentStep.update(s => s + 1);
    }
  }

  prevStep(): void {
    if (this.currentStep() > 1) {
      this.currentStep.update(s => s - 1);
    }
  }

  close(): void {
    this.isOpen.set(false);
    this.onClose.emit();
  }

  submit(): void {
    if (this.isFormValid()) {
      this.onSubmit.emit(this.formData);
    }
  }
}

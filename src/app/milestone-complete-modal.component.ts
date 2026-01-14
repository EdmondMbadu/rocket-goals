import { Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { ActionItem, MilestoneOutcome } from './action-items.service';
import type { DashboardConfig, MilestoneOutcomeConfig, DashboardMetricConfig } from './launchpad/launchpad.types';

export interface MilestoneCompletionData {
  outcome: MilestoneOutcome;
  outcomeNotes: string;
  metricType?: string;
  metricValue?: number;
}

@Component({
  selector: 'app-milestone-complete-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-overlay" (click)="onClose.emit()">
      <div class="modal-container" (click)="$event.stopPropagation()">
        <!-- Header -->
        <div class="modal-header">
          <div class="header-icon">🎯</div>
          <h2 class="modal-title">Complete Milestone</h2>
          <p class="modal-subtitle">{{ milestone.title }}</p>
          <button class="close-btn" (click)="onClose.emit()">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Content -->
        <div class="modal-content">
          <!-- Outcome Selection -->
          <div class="section">
            <label class="section-label">How did it go?</label>
            <div class="outcome-grid">
              @for (outcome of dashboardConfig.milestoneOutcomes; track outcome.key) {
                <button
                  type="button"
                  class="outcome-btn"
                  [class.selected]="selectedOutcome() === outcome.key"
                  [style.--outcome-color]="outcome.color"
                  (click)="selectOutcome(outcome.key)">
                  <span class="outcome-icon">{{ outcome.icon }}</span>
                  <span class="outcome-label">{{ outcome.label }}</span>
                  <span class="outcome-desc">{{ outcome.description }}</span>
                </button>
              }
            </div>
          </div>

          <!-- Metric Tracking (optional) -->
          @if (dashboardConfig.trackMetricsOnCompletion && dashboardConfig.metrics.length > 0) {
            <div class="section">
              <label class="section-label">Track a metric (optional)</label>
              <div class="metric-row">
                <select
                  class="metric-select"
                  [ngModel]="selectedMetricType()"
                  (ngModelChange)="selectedMetricType.set($event)">
                  <option value="">Select metric...</option>
                  @for (metric of dashboardConfig.metrics; track metric.key) {
                    <option [value]="metric.key">{{ metric.icon }} {{ metric.label }}</option>
                  }
                </select>
                @if (selectedMetricType()) {
                  <input
                    type="number"
                    class="metric-input"
                    placeholder="Value"
                    min="0"
                    [ngModel]="metricValue()"
                    (ngModelChange)="metricValue.set($event)" />
                }
              </div>
              @if (selectedMetricType()) {
                <p class="metric-hint">{{ getMetricDescription(selectedMetricType()) }}</p>
              }
            </div>
          }

          <!-- Notes -->
          <div class="section">
            <label class="section-label">Notes (optional)</label>
            <textarea
              class="notes-textarea"
              rows="3"
              placeholder="Any reflections or notes about this milestone..."
              [ngModel]="outcomeNotes()"
              (ngModelChange)="outcomeNotes.set($event)">
            </textarea>
          </div>
        </div>

        <!-- Footer -->
        <div class="modal-footer">
          <button type="button" class="skip-btn" (click)="skipAndComplete()">
            Skip & Complete
          </button>
          <button
            type="button"
            class="submit-btn"
            [disabled]="!selectedOutcome()"
            (click)="submitCompletion()">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            Complete Milestone
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.8);
      backdrop-filter: blur(8px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 1rem;
    }

    .modal-container {
      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 1.5rem;
      width: 100%;
      max-width: 500px;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
    }

    .modal-header {
      position: relative;
      padding: 2rem 2rem 1.5rem;
      text-align: center;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .header-icon {
      font-size: 3rem;
      margin-bottom: 0.75rem;
    }

    .modal-title {
      font-size: 1.5rem;
      font-weight: 800;
      color: white;
      margin: 0 0 0.5rem;
      font-family: 'Exo 2', sans-serif;
    }

    .modal-subtitle {
      color: rgba(255, 255, 255, 0.6);
      font-size: 0.875rem;
      margin: 0;
      max-width: 300px;
      margin-inline: auto;
      line-height: 1.4;
    }

    .close-btn {
      position: absolute;
      top: 1rem;
      right: 1rem;
      background: rgba(255, 255, 255, 0.1);
      border: none;
      border-radius: 0.5rem;
      padding: 0.5rem;
      color: rgba(255, 255, 255, 0.6);
      cursor: pointer;
      transition: all 0.2s;
    }

    .close-btn:hover {
      background: rgba(255, 255, 255, 0.2);
      color: white;
    }

    .modal-content {
      padding: 1.5rem 2rem;
    }

    .section {
      margin-bottom: 1.5rem;
    }

    .section:last-child {
      margin-bottom: 0;
    }

    .section-label {
      display: block;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: rgba(255, 255, 255, 0.5);
      margin-bottom: 0.75rem;
    }

    .outcome-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.75rem;
    }

    .outcome-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.25rem;
      padding: 1rem;
      background: rgba(255, 255, 255, 0.05);
      border: 2px solid transparent;
      border-radius: 1rem;
      cursor: pointer;
      transition: all 0.2s;
      text-align: center;
    }

    .outcome-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.2);
    }

    .outcome-btn.selected {
      background: color-mix(in srgb, var(--outcome-color) 20%, transparent);
      border-color: var(--outcome-color);
    }

    .outcome-icon {
      font-size: 1.5rem;
    }

    .outcome-label {
      font-size: 0.875rem;
      font-weight: 700;
      color: white;
    }

    .outcome-desc {
      font-size: 0.7rem;
      color: rgba(255, 255, 255, 0.5);
      line-height: 1.3;
    }

    .metric-row {
      display: flex;
      gap: 0.75rem;
    }

    .metric-select {
      flex: 2;
      padding: 0.75rem 1rem;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 0.75rem;
      color: white;
      font-size: 0.875rem;
      cursor: pointer;
    }

    .metric-select:focus {
      outline: none;
      border-color: rgba(255, 255, 255, 0.3);
    }

    .metric-select option {
      background: #1a1a2e;
      color: white;
    }

    .metric-input {
      flex: 1;
      padding: 0.75rem 1rem;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 0.75rem;
      color: white;
      font-size: 0.875rem;
    }

    .metric-input:focus {
      outline: none;
      border-color: rgba(255, 255, 255, 0.3);
    }

    .metric-input::placeholder {
      color: rgba(255, 255, 255, 0.4);
    }

    .metric-hint {
      margin-top: 0.5rem;
      font-size: 0.75rem;
      color: rgba(255, 255, 255, 0.4);
    }

    .notes-textarea {
      width: 100%;
      padding: 0.75rem 1rem;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 0.75rem;
      color: white;
      font-size: 0.875rem;
      resize: vertical;
      min-height: 80px;
    }

    .notes-textarea:focus {
      outline: none;
      border-color: rgba(255, 255, 255, 0.3);
    }

    .notes-textarea::placeholder {
      color: rgba(255, 255, 255, 0.4);
    }

    .modal-footer {
      display: flex;
      gap: 1rem;
      padding: 1.5rem 2rem;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    .skip-btn {
      flex: 1;
      padding: 0.875rem 1.5rem;
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 0.75rem;
      color: rgba(255, 255, 255, 0.7);
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .skip-btn:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.3);
    }

    .submit-btn {
      flex: 2;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 0.875rem 1.5rem;
      background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
      border: none;
      border-radius: 0.75rem;
      color: white;
      font-size: 0.875rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s;
    }

    .submit-btn:hover:not(:disabled) {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(34, 197, 94, 0.4);
    }

    .submit-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Responsive */
    @media (max-width: 480px) {
      .outcome-grid {
        grid-template-columns: 1fr;
      }

      .metric-row {
        flex-direction: column;
      }

      .modal-footer {
        flex-direction: column;
      }

      .skip-btn, .submit-btn {
        flex: none;
        width: 100%;
      }
    }
  `]
})
export class MilestoneCompleteModalComponent {
  @Input({ required: true }) milestone!: ActionItem;
  @Input({ required: true }) dashboardConfig!: DashboardConfig;
  @Output() onClose = new EventEmitter<void>();
  @Output() onComplete = new EventEmitter<MilestoneCompletionData>();
  @Output() onSkip = new EventEmitter<void>();

  selectedOutcome = signal<MilestoneOutcome>(null);
  outcomeNotes = signal('');
  selectedMetricType = signal('');
  metricValue = signal<number | null>(null);

  selectOutcome(key: string) {
    this.selectedOutcome.set(key as MilestoneOutcome);
  }

  getMetricDescription(metricKey: string): string {
    const metric = this.dashboardConfig.metrics.find(m => m.key === metricKey);
    return metric?.description || '';
  }

  submitCompletion() {
    const data: MilestoneCompletionData = {
      outcome: this.selectedOutcome(),
      outcomeNotes: this.outcomeNotes(),
      metricType: this.selectedMetricType() || undefined,
      metricValue: this.metricValue() ?? undefined
    };
    this.onComplete.emit(data);
  }

  skipAndComplete() {
    this.onSkip.emit();
  }
}

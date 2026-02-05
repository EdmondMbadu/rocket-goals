import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, ViewChild, ElementRef, computed, inject, signal } from '@angular/core';
import { ActionItem, ActionItemsService } from '../action-items.service';
import { CalendarEventsService } from '../calendar-events.service';
import { RocketGoalsAIService } from '../rocket-goals-ai.service';
import { RocketGoalsService } from '../rocket-goals.service';
import { ThemeService } from '../theme.service';
import { LaunchpadTemplate } from './launchpad.types';

type ViewMode = 'view' | 'edit';

@Component({
  selector: 'app-mission-plan-review-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="plan-modal-backdrop" [class.light-mode]="!isDarkMode()">
      <div class="plan-modal-container" [class.light-mode]="!isDarkMode()">
        <div class="plan-header">
          <div class="plan-title-block">
            <div class="plan-badge" [style.border-color]="template.accentColor">
              Mission Plan
            </div>
            <h2 class="plan-title">
              {{ goalTitle() }} Plan
            </h2>
            <p class="plan-subtitle">
              Review your milestones, polish the details, and launch with confidence.
            </p>
          </div>

          <div class="plan-actions">
            <div class="view-toggle">
              <button
                class="toggle-btn"
                [class.active]="viewMode() === 'view'"
                (click)="setViewMode('view')"
              >
                Preview
              </button>
              <button
                class="toggle-btn"
                [class.active]="viewMode() === 'edit'"
                (click)="setViewMode('edit')"
              >
                Edit All
              </button>
            </div>

            <button class="print-btn" (click)="printPlan()">
              Print Plan
            </button>
          </div>
        </div>

        <div class="plan-body">
          @if (isLoading()) {
            <div class="plan-loading">
              <div class="plan-spinner" [style.border-top-color]="template.accentColor"></div>
              <div>
                <div class="loading-title">Preparing your milestones...</div>
                <div class="loading-subtitle">One moment while we assemble the full plan.</div>
              </div>
            </div>
          } @else if (loadError()) {
            <div class="plan-error">
              <div class="error-title">We hit a snag loading the plan.</div>
              <div class="error-message">{{ loadError() }}</div>
            </div>
          } @else {
            <div class="plan-scroll" #planScroll>
              @if (viewMode() === 'view') {
                <div class="milestone-list">
                  @for (item of milestones(); track item.id) {
                    <div class="milestone-row">
                      <div class="day-pill" [style.border-color]="template.accentColor">
                        Day {{ item.dayNumber }}
                      </div>
                      <div class="milestone-content">
                        @if (editingId() === item.id) {
                          <input
                            class="milestone-input"
                            [value]="editingTitle()"
                            (input)="updateEditingTitle($event)"
                          />
                        } @else {
                          <div class="milestone-title">{{ item.title }}</div>
                        }
                      </div>
                      <div class="milestone-actions">
                        @if (editingId() === item.id) {
                          <button class="mini-btn save" (click)="saveInlineEdit(item)">Save</button>
                          <button class="mini-btn" (click)="cancelInlineEdit()">Cancel</button>
                        } @else {
                          <button class="mini-btn" (click)="startInlineEdit(item)">Edit</button>
                        }
                      </div>
                    </div>
                  }
                </div>
              } @else {
                <div class="milestone-edit-grid">
                  @for (item of milestones(); track item.id) {
                    <label class="milestone-edit-row">
                      <span class="day-pill" [style.border-color]="template.accentColor">Day {{ item.dayNumber }}</span>
                      <input
                        class="milestone-input"
                        [value]="bulkEdits()[item.id] || ''"
                        (input)="updateBulkTitle(item.id, $event)"
                      />
                    </label>
                  }
                </div>
              }
            </div>
            <div class="scroll-hint" (click)="scrollPlanDown()">
              <span>Scroll to see the full plan</span>
              <svg class="scroll-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 9l6 6 6-6"/>
              </svg>
            </div>

            <div class="ai-panel">
              <div class="ai-header">
                <img [src]="template.coPilotAvatar" [alt]="template.coPilotName" class="ai-avatar" />
                <div>
                  <div class="ai-title">{{ template.coPilotName }} Review</div>
                  <div class="ai-subtitle">
                    What do you feel about this plan? Ask for edits and I will restructure the milestones.
                  </div>
                </div>
              </div>
              <div class="ai-body">
                <textarea
                  class="ai-textarea"
                  rows="3"
                  [value]="aiPrompt()"
                  (input)="updateAiPrompt($event)"
                  placeholder="Tell me what you want changed or added. Example: Make Day 3 lighter and add a recovery focus..."
                ></textarea>
                <div class="ai-actions">
                  @if (aiStatus()) {
                    <span class="ai-status">{{ aiStatus() }}</span>
                  }
                  <button
                    class="ai-regenerate-btn"
                    [disabled]="isRegenerating() || !aiPrompt().trim()"
                    (click)="regeneratePlan()"
                  >
                    {{ isRegenerating() ? 'Regenerating...' : 'Regenerate Plan' }}
                  </button>
                </div>
                @if (isRegenerating()) {
                  <div class="ai-loading">
                    <span class="ai-spinner"></span>
                    <span>Generating a refreshed plan…</span>
                  </div>
                }
              </div>
            </div>
          }
        </div>

        <div class="plan-footer">
          <div class="plan-footer-left">
            <button class="ghost-btn" (click)="printPlan()">Print Plan</button>
            <span class="footer-note">Bring your plan into the real world or share it with a coach.</span>
          </div>
          <div class="plan-footer-right">
            @if (viewMode() === 'edit') {
              <button
                class="save-all-btn"
                [disabled]="isSaving()"
                (click)="saveAllEdits()"
              >
                {{ isSaving() ? 'Saving...' : 'Save Changes' }}
              </button>
            }
            <button
              class="commit-btn"
              [style.background]="template.accentColor"
              [disabled]="isSaving()"
              (click)="commitPlan()"
            >
              Commit & Start
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .plan-modal-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1200;
      background: rgba(6, 11, 23, 0.9);
      backdrop-filter: blur(18px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      animation: fadeIn 0.3s ease-out;
    }

    .plan-modal-backdrop.light-mode {
      background: rgba(148, 163, 184, 0.28);
    }

    .plan-modal-container {
      width: min(960px, 100%);
      max-height: 92vh;
      overflow: hidden;
      background: linear-gradient(160deg, rgba(15, 23, 42, 0.98), rgba(2, 6, 23, 0.98));
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 28px;
      box-shadow: 0 28px 80px rgba(0, 0, 0, 0.6);
      display: flex;
      flex-direction: column;
      animation: slideUp 0.4s ease-out;
    }

    .plan-modal-container.light-mode {
      background: linear-gradient(160deg, #ffffff 0%, #f1f5f9 100%);
      border: 1px solid rgba(15, 23, 42, 0.08);
      box-shadow: 0 24px 60px rgba(15, 23, 42, 0.12);
      color: #0f172a;
    }

    .plan-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 24px;
      padding: 28px 32px 18px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .plan-modal-container.light-mode .plan-header {
      border-bottom-color: rgba(15, 23, 42, 0.08);
    }

    .plan-title-block {
      max-width: 520px;
    }

    .plan-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: 1px solid rgba(239, 68, 68, 0.3);
      background: rgba(239, 68, 68, 0.12);
      padding: 6px 12px;
      border-radius: 999px;
      text-transform: uppercase;
      font-size: 10px;
      letter-spacing: 0.25em;
      font-weight: 700;
      color: #fecaca;
      margin-bottom: 14px;
    }

    .plan-modal-container.light-mode .plan-badge {
      border-color: rgba(239, 68, 68, 0.35);
      background: rgba(239, 68, 68, 0.08);
      color: #b91c1c;
    }

    .plan-title {
      font-size: clamp(24px, 3.4vw, 34px);
      font-weight: 800;
      color: #fff;
      margin: 0 0 8px;
    }

    .plan-modal-container.light-mode .plan-title {
      color: #0f172a;
    }

    .plan-subtitle {
      color: rgba(255, 255, 255, 0.6);
      margin: 0;
      font-size: 14px;
    }

    .plan-modal-container.light-mode .plan-subtitle {
      color: #64748b;
    }

    .plan-actions {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .view-toggle {
      background: rgba(255, 255, 255, 0.08);
      padding: 4px;
      border-radius: 999px;
      display: flex;
      gap: 4px;
    }

    .plan-modal-container.light-mode .view-toggle {
      background: rgba(15, 23, 42, 0.08);
    }

    .toggle-btn {
      background: transparent;
      border: none;
      color: rgba(255, 255, 255, 0.6);
      font-weight: 700;
      padding: 8px 16px;
      border-radius: 999px;
      cursor: pointer;
      transition: all 0.2s ease;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.14em;
    }

    .plan-modal-container.light-mode .toggle-btn {
      color: #475569;
    }

    .toggle-btn.active {
      background: rgba(255, 255, 255, 0.18);
      color: #fff;
    }

    .plan-modal-container.light-mode .toggle-btn.active {
      background: rgba(15, 23, 42, 0.12);
      color: #0f172a;
    }

    .print-btn {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: rgba(255, 255, 255, 0.8);
      padding: 10px 16px;
      border-radius: 12px;
      font-weight: 700;
      font-size: 12px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .plan-modal-container.light-mode .print-btn {
      background: rgba(15, 23, 42, 0.06);
      border-color: rgba(15, 23, 42, 0.12);
      color: #475569;
    }

    .print-btn:hover {
      background: rgba(255, 255, 255, 0.16);
      color: #fff;
    }

    .plan-modal-container.light-mode .print-btn:hover {
      background: rgba(15, 23, 42, 0.12);
      color: #0f172a;
    }

    .plan-body {
      padding: 10px 32px 0;
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .plan-scroll {
      flex: 1;
      overflow-y: auto;
      padding: 12px 6px 18px;
    }

    .scroll-hint {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.2em;
      color: rgba(255, 255, 255, 0.45);
      padding-bottom: 6px;
      animation: floatHint 2s ease-in-out infinite;
      cursor: pointer;
    }

    .plan-modal-container.light-mode .scroll-hint {
      color: #94a3b8;
    }

    .scroll-icon {
      width: 16px;
      height: 16px;
    }

    .plan-loading,
    .plan-error {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      color: rgba(255, 255, 255, 0.7);
      padding: 40px;
      text-align: center;
    }

    .plan-modal-container.light-mode .plan-loading,
    .plan-modal-container.light-mode .plan-error {
      color: #475569;
    }

    .plan-spinner {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: 3px solid rgba(255, 255, 255, 0.15);
      border-top-color: #ef4444;
      animation: spin 1s linear infinite;
    }

    .milestone-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .milestone-row {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 12px;
      align-items: center;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 16px;
      padding: 10px 14px;
    }

    .plan-modal-container.light-mode .milestone-row {
      background: rgba(15, 23, 42, 0.03);
      border-color: rgba(15, 23, 42, 0.08);
    }

    .milestone-content {
      min-width: 0;
    }

    .milestone-title {
      color: #fff;
      font-weight: 600;
      font-size: 13px;
      line-height: 1.4;
    }

    .plan-modal-container.light-mode .milestone-title {
      color: #0f172a;
    }

    .milestone-actions {
      display: flex;
      gap: 8px;
    }

    .day-pill {
      padding: 5px 10px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: rgba(255, 255, 255, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.16);
      white-space: nowrap;
    }

    .plan-modal-container.light-mode .day-pill {
      color: #475569;
      border-color: rgba(15, 23, 42, 0.12);
    }

    .milestone-input {
      width: 100%;
      background: rgba(15, 23, 42, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #fff;
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 14px;
      font-weight: 500;
      outline: none;
      transition: border 0.2s ease;
    }

    .plan-modal-container.light-mode .milestone-input {
      background: #ffffff;
      border-color: rgba(15, 23, 42, 0.12);
      color: #0f172a;
    }

    .milestone-input:focus {
      border-color: rgba(255, 255, 255, 0.35);
    }

    .mini-btn {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: rgba(255, 255, 255, 0.8);
      padding: 5px 10px;
      border-radius: 10px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .plan-modal-container.light-mode .mini-btn {
      background: rgba(15, 23, 42, 0.06);
      border-color: rgba(15, 23, 42, 0.12);
      color: #475569;
    }

    .mini-btn.save {
      background: rgba(34, 197, 94, 0.15);
      border-color: rgba(34, 197, 94, 0.35);
      color: #86efac;
    }

    .milestone-edit-grid {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .milestone-edit-row {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 14px;
      align-items: center;
      background: rgba(255, 255, 255, 0.035);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 14px;
      padding: 12px 14px;
    }

    .plan-modal-container.light-mode .milestone-edit-row {
      background: rgba(15, 23, 42, 0.02);
      border-color: rgba(15, 23, 42, 0.08);
    }

    .plan-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      padding: 18px 32px 26px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }

    .plan-modal-container.light-mode .plan-footer {
      border-top-color: rgba(15, 23, 42, 0.08);
    }

    .plan-footer-left {
      display: flex;
      align-items: center;
      gap: 16px;
      color: rgba(255, 255, 255, 0.55);
      font-size: 12px;
    }

    .plan-modal-container.light-mode .plan-footer-left {
      color: #64748b;
    }

    .ghost-btn {
      background: transparent;
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: rgba(255, 255, 255, 0.75);
      padding: 8px 14px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      cursor: pointer;
    }

    .plan-modal-container.light-mode .ghost-btn {
      border-color: rgba(15, 23, 42, 0.12);
      color: #475569;
    }

    .plan-footer-right {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .save-all-btn {
      background: rgba(34, 197, 94, 0.16);
      border: 1px solid rgba(34, 197, 94, 0.35);
      color: #86efac;
      padding: 10px 16px;
      border-radius: 12px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      font-size: 12px;
      cursor: pointer;
    }

    .plan-modal-container.light-mode .save-all-btn {
      background: rgba(34, 197, 94, 0.12);
      border-color: rgba(34, 197, 94, 0.3);
      color: #166534;
    }

    .commit-btn {
      color: #fff;
      border: none;
      padding: 12px 18px;
      border-radius: 14px;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      display: inline-flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      box-shadow: 0 18px 40px rgba(0, 0, 0, 0.4);
    }

    .plan-modal-container.light-mode .commit-btn {
      box-shadow: 0 18px 40px rgba(15, 23, 42, 0.18);
    }

    .ai-panel {
      margin: 12px 6px 22px;
      padding: 18px;
      border-radius: 18px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(255, 255, 255, 0.03);
    }

    .plan-modal-container.light-mode .ai-panel {
      border-color: rgba(15, 23, 42, 0.08);
      background: rgba(15, 23, 42, 0.03);
    }

    .ai-header {
      display: flex;
      gap: 14px;
      align-items: center;
      margin-bottom: 12px;
    }

    .ai-avatar {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      object-fit: cover;
      border: 2px solid rgba(255, 255, 255, 0.2);
      box-shadow: 0 8px 18px rgba(0, 0, 0, 0.3);
    }

    .plan-modal-container.light-mode .ai-avatar {
      border-color: rgba(15, 23, 42, 0.12);
      box-shadow: 0 8px 18px rgba(15, 23, 42, 0.12);
    }

    .ai-title {
      font-weight: 700;
      color: #fff;
      font-size: 14px;
      margin-bottom: 2px;
    }

    .plan-modal-container.light-mode .ai-title {
      color: #0f172a;
    }

    .ai-subtitle {
      color: rgba(255, 255, 255, 0.6);
      font-size: 12px;
    }

    .plan-modal-container.light-mode .ai-subtitle {
      color: #64748b;
    }

    .ai-body {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .ai-textarea {
      width: 100%;
      background: rgba(15, 23, 42, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #fff;
      border-radius: 12px;
      padding: 12px 14px;
      font-size: 13px;
      line-height: 1.5;
      resize: vertical;
      min-height: 88px;
    }

    .plan-modal-container.light-mode .ai-textarea {
      background: #ffffff;
      border-color: rgba(15, 23, 42, 0.12);
      color: #0f172a;
    }

    .ai-actions {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .ai-status {
      font-size: 12px;
      color: rgba(34, 197, 94, 0.9);
      font-weight: 600;
    }

    .plan-modal-container.light-mode .ai-status {
      color: #166534;
    }

    .ai-regenerate-btn {
      background: rgba(239, 68, 68, 0.18);
      border: 1px solid rgba(239, 68, 68, 0.45);
      color: #fecaca;
      padding: 10px 16px;
      border-radius: 12px;
      font-weight: 800;
      font-size: 12px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .plan-modal-container.light-mode .ai-regenerate-btn {
      background: rgba(239, 68, 68, 0.1);
      border-color: rgba(239, 68, 68, 0.4);
      color: #b91c1c;
    }

    .ai-regenerate-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .ai-loading {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.7);
    }

    .plan-modal-container.light-mode .ai-loading {
      color: #475569;
    }

    .ai-spinner {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      border: 2px solid rgba(255, 255, 255, 0.2);
      border-top-color: #22c55e;
      animation: spin 0.8s linear infinite;
    }

    .plan-modal-container.light-mode .ai-spinner {
      border-color: rgba(15, 23, 42, 0.15);
      border-top-color: #16a34a;
    }
    .commit-btn:disabled,
    .save-all-btn:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    @media (max-width: 768px) {
      .plan-header {
        flex-direction: column;
        align-items: flex-start;
      }

      .plan-actions {
        width: 100%;
        justify-content: space-between;
      }

      .plan-footer {
        flex-direction: column;
        align-items: flex-start;
      }

      .plan-footer-right {
        width: 100%;
        justify-content: flex-end;
      }
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes slideUp {
      from { opacity: 0; transform: translateY(20px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    @keyframes floatHint {
      0%, 100% { transform: translateY(0); opacity: 0.7; }
      50% { transform: translateY(4px); opacity: 1; }
    }
  `]
})
export class MissionPlanReviewModalComponent {
  private readonly theme = inject(ThemeService);
  private readonly actionItemsService = inject(ActionItemsService);
  private readonly calendarEventsService = inject(CalendarEventsService);
  private readonly aiService = inject(RocketGoalsAIService);
  private readonly goalsService = inject(RocketGoalsService);

  @Input({ required: true }) template!: LaunchpadTemplate;
  @Input({ required: true }) goalId!: string;
  @Output() onCommit = new EventEmitter<void>();

  protected readonly milestones = signal<ActionItem[]>([]);
  protected readonly isLoading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly viewMode = signal<ViewMode>('view');
  protected readonly editingId = signal<string | null>(null);
  protected readonly editingTitle = signal<string>('');
  protected readonly bulkEdits = signal<Record<string, string>>({});
  protected readonly isSaving = signal(false);
  protected readonly goalTitle = signal('Your RocketGoal');
  protected readonly isDarkMode = this.theme.isDarkMode;
  protected readonly aiPrompt = signal('');
  protected readonly aiStatus = signal<string | null>(null);
  protected readonly isRegenerating = signal(false);
  private goalContext: any | null = null;
  private goalStartTime = 0;
  private goalTotalDays = 0;
  @ViewChild('planScroll') private planScroll?: ElementRef<HTMLDivElement>;

  protected readonly hasUnsavedChanges = computed(() => {
    if (this.viewMode() !== 'edit') return false;
    const edits = this.bulkEdits();
    return this.milestones().some(item => (edits[item.id] ?? item.title).trim() !== item.title);
  });

  async ngOnInit() {
    await this.loadData();
  }

  private async loadData() {
    this.isLoading.set(true);
    this.loadError.set(null);
    try {
      const [goal, items] = await Promise.all([
        this.goalsService.getRocketGoalById(this.goalId),
        this.actionItemsService.getActionItemsByGoalId(this.goalId)
      ]);

      if (goal) {
        this.goalContext = goal;
        const fallbackTitle = `${this.template.name} Mission`;
        const title =
          goal?.answers?.custom_goal_title ||
          goal?.answers?.goal_title_label ||
          goal?.primaryGoal ||
          fallbackTitle;
        this.goalTitle.set(title);
        this.goalStartTime = this.resolveStartTime(goal);
        this.goalTotalDays = this.resolveTotalDays(goal, items.length);
      }

      this.milestones.set(items);
      this.bulkEdits.set(this.buildBulkEdits(items));
    } catch (error: any) {
      this.loadError.set(error?.message || 'Unable to load milestones right now.');
    } finally {
      this.isLoading.set(false);
    }
  }

  setViewMode(mode: ViewMode) {
    this.viewMode.set(mode);
    if (mode === 'edit') {
      this.bulkEdits.set(this.buildBulkEdits(this.milestones()));
    }
  }

  startInlineEdit(item: ActionItem) {
    this.editingId.set(item.id);
    this.editingTitle.set(item.title);
  }

  updateEditingTitle(event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.editingTitle.set(value);
  }

  cancelInlineEdit() {
    this.editingId.set(null);
    this.editingTitle.set('');
  }

  async saveInlineEdit(item: ActionItem) {
    const nextTitle = this.editingTitle().trim();
    if (!nextTitle || nextTitle === item.title) {
      this.cancelInlineEdit();
      return;
    }
    try {
      await this.actionItemsService.updateActionItem(this.goalId, item.id, { title: nextTitle });
      this.milestones.update(items =>
        items.map(m => m.id === item.id ? { ...m, title: nextTitle } : m)
      );
    } catch (error) {
      console.error('Failed to update milestone:', error);
    } finally {
      this.cancelInlineEdit();
    }
  }

  updateBulkTitle(itemId: string, event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.bulkEdits.update(edits => ({ ...edits, [itemId]: value }));
  }

  async saveAllEdits() {
    const edits = this.bulkEdits();
    const updates = this.milestones()
      .map(item => ({ item, nextTitle: (edits[item.id] ?? item.title).trim() }))
      .filter(({ item, nextTitle }) => nextTitle && nextTitle !== item.title);

    if (!updates.length) return;

    this.isSaving.set(true);
    try {
      for (const update of updates) {
        await this.actionItemsService.updateActionItem(this.goalId, update.item.id, { title: update.nextTitle });
      }
      this.milestones.update(items =>
        items.map(item => {
          const match = updates.find(update => update.item.id === item.id);
          return match ? { ...item, title: match.nextTitle } : item;
        })
      );
    } catch (error) {
      console.error('Failed to save milestone edits:', error);
    } finally {
      this.isSaving.set(false);
    }
  }

  updateAiPrompt(event: Event) {
    const value = (event.target as HTMLTextAreaElement).value;
    this.aiPrompt.set(value);
  }

  scrollPlanDown() {
    const container = this.planScroll?.nativeElement;
    if (!container) return;

    const firstRow = container.querySelector<HTMLElement>('.milestone-row, .milestone-edit-row');
    const rowHeight = firstRow ? firstRow.getBoundingClientRect().height : 48;
    const gap = 10;
    const scrollBy = (rowHeight + gap) * 3;
    container.scrollBy({ top: scrollBy, behavior: 'smooth' });
  }

  async regeneratePlan() {
    if (!this.aiPrompt().trim() || this.isRegenerating()) return;
    if (!this.goalContext) return;

    this.isRegenerating.set(true);
    this.aiStatus.set('Creating a refreshed milestone plan...');
    try {
      const totalDays = this.goalTotalDays || this.milestones().length;
      const goalTitle = this.goalTitle();
      const userNotes = this.aiPrompt().trim();
      const prompt = `
You are an expert coach. Regenerate a ${totalDays}-day milestone plan for the goal: "${goalTitle}".
Requirements:
1. Create EXACTLY ${totalDays} milestones, one per day (Day 1..Day ${totalDays}).
2. Each milestone must be specific, actionable, and measurable.
3. Keep titles short (max 12 words).
4. Use the user's guidance below to adjust the plan.

User guidance:
${userNotes}

Return ONLY a JSON array of objects with keys: "dayNumber" (number) and "title" (string). No extra text.
      `.trim();

      const response = await this.aiService.callAISilent(prompt, this.goalContext);
      const parsed = this.parseMilestonesResponse(response, totalDays);
      const normalized = this.normalizeMilestones(parsed, totalDays);

      await this.replaceMilestones(normalized);
      this.aiStatus.set('Plan updated. Review the refreshed milestones below.');
      this.aiPrompt.set('');
    } catch (error: any) {
      console.error('Failed to regenerate milestones:', error);
      this.aiStatus.set(error?.message || 'Unable to regenerate milestones right now.');
    } finally {
      this.isRegenerating.set(false);
    }
  }

  async commitPlan() {
    if (this.hasUnsavedChanges()) {
      await this.saveAllEdits();
    }
    this.onCommit.emit();
  }

  printPlan() {
    const title = `${this.goalTitle()} Plan`;
    const rows = this.milestones()
      .map(item => `
        <div class="row">
          <div class="day">Day ${item.dayNumber}</div>
          <div class="text">${this.escapeHtml(item.title)}</div>
        </div>
      `)
      .join('');

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: 'Inter', Arial, sans-serif; padding: 32px; color: #0f172a; }
            h1 { font-size: 28px; margin-bottom: 8px; }
            .subtitle { color: #475569; margin-bottom: 24px; }
            .row { display: flex; gap: 16px; padding: 10px 0; border-bottom: 1px solid #e2e8f0; }
            .day { font-weight: 700; color: #0f172a; min-width: 90px; }
            .text { flex: 1; color: #1e293b; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <h1>${title}</h1>
          <div class="subtitle">Generated by RocketGoals</div>
          ${rows}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  private buildBulkEdits(items: ActionItem[]) {
    return items.reduce((acc, item) => {
      acc[item.id] = item.title;
      return acc;
    }, {} as Record<string, string>);
  }

  private async replaceMilestones(items: { title: string; dayNumber: number }[]) {
    const current = this.milestones();

    for (const item of current) {
      await this.actionItemsService.deleteActionItem(this.goalId, item.id);
    }

    const events = await this.calendarEventsService.getEventsByGoalId(this.goalId);
    const milestoneEvents = events.filter(event => event.title?.startsWith('🎯 '));
    for (const event of milestoneEvents) {
      await this.calendarEventsService.deleteEvent(this.goalId, event.id);
    }

    const created: ActionItem[] = [];
    for (const item of items) {
      const id = await this.actionItemsService.createActionItem({
        goalId: this.goalId,
        title: item.title,
        dayNumber: item.dayNumber,
        completed: false,
        order: item.dayNumber
      });
      created.push({
        id,
        goalId: this.goalId,
        title: item.title,
        dayNumber: item.dayNumber,
        completed: false,
        order: item.dayNumber,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      if (this.goalStartTime) {
        const date = new Date(this.goalStartTime + (item.dayNumber - 1) * 24 * 60 * 60 * 1000);
        await this.calendarEventsService.createEvent(this.goalId, {
          title: `🎯 ${item.title}`,
          date,
          color: '#9333ea',
          completed: false
        });
      }
    }

    this.milestones.set(created);
    this.bulkEdits.set(this.buildBulkEdits(created));
    this.viewMode.set('view');
  }

  private parseMilestonesResponse(response: string, totalDays: number) {
    const trimmed = response.trim();
    const jsonStart = trimmed.indexOf('[');
    const jsonEnd = trimmed.lastIndexOf(']');
    const jsonStr = jsonStart >= 0 && jsonEnd > jsonStart
      ? trimmed.slice(jsonStart, jsonEnd + 1)
      : trimmed;

    let parsed: any;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      parsed = [];
    }

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item: any, index: number) => ({
        dayNumber: Number(item.dayNumber ?? item.day ?? index + 1),
        title: String(item.title ?? item.milestone ?? '').trim()
      }))
      .filter(item => item.title && item.dayNumber >= 1 && item.dayNumber <= totalDays);
  }

  private normalizeMilestones(items: { title: string; dayNumber: number }[], totalDays: number) {
    const fallback = this.milestones();
    const byDay = new Map<number, string>();
    for (const item of items) {
      byDay.set(item.dayNumber, item.title);
    }

    const normalized: { title: string; dayNumber: number }[] = [];
    for (let day = 1; day <= totalDays; day += 1) {
      const title = byDay.get(day) || fallback.find(item => item.dayNumber === day)?.title || `Day ${day} milestone`;
      normalized.push({ dayNumber: day, title });
    }
    return normalized;
  }

  private resolveStartTime(goal: any) {
    if (goal?.startTime) return Number(goal.startTime);
    const onboardingStart = goal?.answers?.onboarding_start_date;
    if (onboardingStart) {
      const parsed = new Date(onboardingStart).getTime();
      if (!Number.isNaN(parsed)) return parsed;
    }
    return Date.now();
  }

  private resolveTotalDays(goal: any, fallbackCount: number) {
    const onboardingEnd = goal?.answers?.onboarding_end_date;
    const onboardingStart = goal?.answers?.onboarding_start_date;
    if (onboardingStart && onboardingEnd) {
      const start = new Date(onboardingStart).getTime();
      const end = new Date(onboardingEnd).getTime();
      if (!Number.isNaN(start) && !Number.isNaN(end)) {
        return Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
      }
    }

    if (goal?.answers?.timeframe_days) {
      const days = Number(goal.answers.timeframe_days);
      if (!Number.isNaN(days) && days > 0) return days;
    }

    if (goal?.answers?.deadlineDate) {
      const end = Number(goal.answers.deadlineDate);
      if (!Number.isNaN(end) && this.goalStartTime) {
        return Math.max(1, Math.ceil((end - this.goalStartTime) / (1000 * 60 * 60 * 24)));
      }
    }

    return Math.max(1, fallbackCount);
  }

  private escapeHtml(value: string) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}

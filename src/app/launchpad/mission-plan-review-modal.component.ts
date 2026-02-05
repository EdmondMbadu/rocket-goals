import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { ActionItem, ActionItemsService } from '../action-items.service';
import { RocketGoalsService } from '../rocket-goals.service';
import { LaunchpadTemplate } from './launchpad.types';

type ViewMode = 'view' | 'edit';

@Component({
  selector: 'app-mission-plan-review-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="plan-modal-backdrop">
      <div class="plan-modal-container">
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
            <div class="plan-scroll">
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

    .plan-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 24px;
      padding: 28px 32px 18px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    .plan-title-block {
      max-width: 520px;
    }

    .plan-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border: 1px solid rgba(255, 255, 255, 0.2);
      padding: 6px 12px;
      border-radius: 999px;
      text-transform: uppercase;
      font-size: 10px;
      letter-spacing: 0.25em;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.7);
      margin-bottom: 14px;
    }

    .plan-title {
      font-size: clamp(24px, 3.4vw, 34px);
      font-weight: 800;
      color: #fff;
      margin: 0 0 8px;
    }

    .plan-subtitle {
      color: rgba(255, 255, 255, 0.6);
      margin: 0;
      font-size: 14px;
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

    .toggle-btn.active {
      background: rgba(255, 255, 255, 0.18);
      color: #fff;
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

    .print-btn:hover {
      background: rgba(255, 255, 255, 0.16);
      color: #fff;
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
      gap: 12px;
    }

    .milestone-row {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 16px;
      align-items: center;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 16px;
      padding: 14px 16px;
    }

    .milestone-content {
      min-width: 0;
    }

    .milestone-title {
      color: #fff;
      font-weight: 600;
      font-size: 14px;
      line-height: 1.4;
    }

    .milestone-actions {
      display: flex;
      gap: 8px;
    }

    .day-pill {
      padding: 6px 12px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.14em;
      color: rgba(255, 255, 255, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.16);
      white-space: nowrap;
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

    .milestone-input:focus {
      border-color: rgba(255, 255, 255, 0.35);
    }

    .mini-btn {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: rgba(255, 255, 255, 0.8);
      padding: 6px 12px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      cursor: pointer;
      transition: all 0.2s ease;
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

    .plan-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 24px;
      padding: 18px 32px 26px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }

    .plan-footer-left {
      display: flex;
      align-items: center;
      gap: 16px;
      color: rgba(255, 255, 255, 0.55);
      font-size: 12px;
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

    .plan-footer-right {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .save-all-btn {
      background: rgba(255, 255, 255, 0.12);
      border: 1px solid rgba(255, 255, 255, 0.18);
      color: #fff;
      padding: 10px 16px;
      border-radius: 12px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      font-size: 12px;
      cursor: pointer;
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
  `]
})
export class MissionPlanReviewModalComponent {
  private readonly actionItemsService = inject(ActionItemsService);
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
        const fallbackTitle = `${this.template.name} Mission`;
        const title =
          goal?.answers?.custom_goal_title ||
          goal?.answers?.goal_title_label ||
          goal?.primaryGoal ||
          fallbackTitle;
        this.goalTitle.set(title);
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

  private escapeHtml(value: string) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}

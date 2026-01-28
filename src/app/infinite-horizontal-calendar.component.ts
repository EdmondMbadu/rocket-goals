import {
    Component,
    Input,
    Output,
    EventEmitter,
    signal,
    computed,
    ElementRef,
    ViewChild,
    AfterViewInit,
    inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActionItem } from './action-items.service';
import { ThemeService } from './theme.service';
import { AuthService } from './auth.service';

export type CalendarViewMode = 'day' | 'week' | 'month' | 'year';

interface PeriodInfo {
    id: string;
    title: string;
    subtitle: string;
    date: Date;
}

@Component({
    selector: 'app-infinite-horizontal-calendar',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './infinite-horizontal-calendar.component.html',
    styleUrl: './infinite-horizontal-calendar.component.css',
})
export class InfiniteHorizontalCalendarComponent implements AfterViewInit {
    @Input() milestones: ActionItem[] = [];
    @Input() goalStartTime: number = Date.now();
    @Output() statusChanged = new EventEmitter<{
        item: ActionItem;
        status: 'maybe' | 'not-now' | 'done';
        newDate?: Date;
    }>();
    @Output() addCardRequested = new EventEmitter<Date>();
    @Output() cardClicked = new EventEmitter<ActionItem>();

    @ViewChild('scrollContainer') scrollContainer?: ElementRef<HTMLDivElement>;

    private themeService = inject(ThemeService);
    private authService = inject(AuthService);

    isDarkMode = this.themeService.isDarkMode;
    currentView = signal<CalendarViewMode>('month');
    centerDate = signal<Date>(new Date());
    activeDragZone = signal<'not-now' | 'done' | 'maybe' | null>(null);
    draggingItem = signal<ActionItem | null>(null);

    readonly views: { id: CalendarViewMode; label: string }[] = [
        { id: 'day', label: 'DAY' },
        { id: 'week', label: 'WEEK' },
        { id: 'month', label: 'MONTH' },
        { id: 'year', label: 'YEAR' },
    ];

    ownerInitial = computed(() => {
        const profile = this.authService.profile();
        return profile?.firstName?.[0] || profile?.email?.[0] || 'U';
    });

    notNowCount = computed(() => {
        // This would ideally come from a filtered list of milestones not yet assigned to a date
        return 0; // Placeholder
    });

    doneCount = computed(() => {
        return this.milestones.filter((m) => m.completed).length;
    });

    visiblePeriods = computed(() => {
        const view = this.currentView();
        const center = this.centerDate();
        const periods: PeriodInfo[] = [];

        // Generate 15 periods (7 before, center, 7 after) for smooth infinite scroll appearance
        for (let i = -7; i <= 7; i++) {
            const date = new Date(center);
            if (view === 'day') {
                date.setDate(center.getDate() + i);
            } else if (view === 'week') {
                date.setDate(center.getDate() + i * 7);
            } else if (view === 'month') {
                date.setMonth(center.getMonth() + i);
            } else if (view === 'year') {
                date.setFullYear(center.getFullYear() + i);
            }
            periods.push(this.getPeriodInfo(date, view));
        }
        return periods;
    });

    stripWidth = computed(() => {
        return this.visiblePeriods().length * 400;
    });

    ngAfterViewInit() {
        this.scrollToCenter();
    }

    private scrollToCenter() {
        setTimeout(() => {
            if (this.scrollContainer) {
                const container = this.scrollContainer.nativeElement;
                const centerOffset = (container.scrollWidth - container.clientWidth) / 2;
                container.scrollLeft = centerOffset;
            }
        }, 0);
    }

    onScroll(event: Event) {
        const container = event.target as HTMLDivElement;
        const scrollLeft = container.scrollLeft;
        const maxScroll = container.scrollWidth - container.clientWidth;

        // Infinite scroll logic: if near edges, shift centerDate and re-center scroll
        const threshold = 400 * 2; // 2 columns
        if (scrollLeft < threshold) {
            this.shiftCenter(-3);
        } else if (scrollLeft > maxScroll - threshold) {
            this.shiftCenter(3);
        }
    }

    private shiftCenter(delta: number) {
        const view = this.currentView();
        const newCenter = new Date(this.centerDate());
        if (view === 'day') newCenter.setDate(newCenter.getDate() + delta);
        if (view === 'week') newCenter.setDate(newCenter.getDate() + delta * 7);
        if (view === 'month') newCenter.setMonth(newCenter.getMonth() + delta);
        if (view === 'year') newCenter.setFullYear(newCenter.getFullYear() + delta);

        const oldScrollLeft = this.scrollContainer?.nativeElement.scrollLeft || 0;
        this.centerDate.set(newCenter);

        // After state update, adjust scroll position to maintain visual continuity
        setTimeout(() => {
            if (this.scrollContainer) {
                // Since we shifted center by delta columns (each 400px),
                // we need to adjust scrollLeft by delta * 400px in the opposite direction
                this.scrollContainer.nativeElement.scrollLeft = oldScrollLeft - delta * 400;
            }
        }, 0);
    }

    setView(view: CalendarViewMode) {
        this.currentView.set(view);
        this.centerDate.set(new Date());
        this.scrollToCenter();
    }

    getMilestonesForPeriod(date: Date): ActionItem[] {
        const view = this.currentView();
        return this.milestones.filter((m) => {
            if (!m.dayNumber) return false;
            // In this app, milestones have dayNumber relative to goal start.
            // For this experimental view, we might need to map dates to dayNumbers if they aren't provided.
            // For now, let's assume we are just showing milestones that match the period.
            // This is a simplified implementation.
            const milestoneDate = this.getDateFromDayNumber(m.dayNumber);
            return this.isSamePeriod(milestoneDate, date, view);
        });
    }

    private getDateFromDayNumber(day: number): Date {
        const start = new Date(this.goalStartTime);
        start.setHours(0, 0, 0, 0);
        const date = new Date(start);
        date.setDate(start.getDate() + (day - 1));
        return date;
    }

    private isSamePeriod(d1: Date, d2: Date, view: CalendarViewMode): boolean {
        if (view === 'day') {
            return (
                d1.getDate() === d2.getDate() &&
                d1.getMonth() === d2.getMonth() &&
                d1.getFullYear() === d2.getFullYear()
            );
        }
        if (view === 'week') {
            // Simple week check (same year and same week number would be better)
            const start1 = this.getStartOfWeek(d1);
            const start2 = this.getStartOfWeek(d2);
            return start1.getTime() === start2.getTime();
        }
        if (view === 'month') {
            return d1.getMonth() === d2.getMonth() && d1.getFullYear() === d2.getFullYear();
        }
        if (view === 'year') {
            return d1.getFullYear() === d2.getFullYear();
        }
        return false;
    }

    private getStartOfWeek(d: Date): Date {
        const date = new Date(d);
        const day = date.getDay();
        const diff = date.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
        date.setDate(diff);
        date.setHours(0, 0, 0, 0);
        return date;
    }

    private getPeriodInfo(date: Date, view: CalendarViewMode): PeriodInfo {
        const months = [
            'JAN',
            'FEB',
            'MAR',
            'APR',
            'MAY',
            'JUN',
            'JUL',
            'AUG',
            'SEP',
            'OCT',
            'NOV',
            'DEC',
        ];
        let title = '';
        let subtitle = '';
        let id = '';

        if (view === 'day') {
            title = date.getDate().toString();
            subtitle = `${months[date.getMonth()]} ${date.getFullYear()}`;
            id = `day-${date.getTime()}`;
        } else if (view === 'week') {
            const start = this.getStartOfWeek(date);
            const end = new Date(start);
            end.setDate(start.getDate() + 6);
            title = `${start.getDate()} - ${end.getDate()}`;
            subtitle = `${months[start.getMonth()]} ${start.getFullYear()}`;
            id = `week-${start.getTime()}`;
        } else if (view === 'month') {
            title = months[date.getMonth()];
            subtitle = date.getFullYear().toString();
            id = `month-${date.getFullYear()}-${date.getMonth()}`;
        } else if (view === 'year') {
            title = date.getFullYear().toString();
            subtitle = 'MISSION CYCLE';
            id = `year-${date.getFullYear()}`;
        }

        return { id, title, subtitle, date };
    }

    // Native Drag and Drop
    onDragStart(event: DragEvent, item: ActionItem) {
        this.draggingItem.set(item);
        if (event.dataTransfer) {
            event.dataTransfer.setData('text/plain', item.id);
            event.dataTransfer.effectAllowed = 'move';
        }
        // Add a class for styling
        const target = event.target as HTMLElement;
        setTimeout(() => target.classList.add('dragging'), 0);
    }

    onDragEnd(event: DragEvent) {
        this.draggingItem.set(null);
        this.activeDragZone.set(null);
        const target = event.target as HTMLElement;
        target.classList.remove('dragging');
    }

    onDragOver(event: DragEvent, zone: 'not-now' | 'done' | 'maybe', periodId?: string) {
        event.preventDefault();
        this.activeDragZone.set(zone);
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'move';
        }
    }

    onDragLeave(event: DragEvent) {
        // Optional: only unset if leaving the container, but since zones are adjacent it's tricky
    }

    onDrop(event: DragEvent, status: 'not-now' | 'done' | 'maybe', newDate?: Date) {
        event.preventDefault();
        const item = this.draggingItem();
        if (item) {
            this.statusChanged.emit({ item, status, newDate });
        }
        this.activeDragZone.set(null);
    }

    onAddCard(date: Date) {
        this.addCardRequested.emit(date);
    }

    onCardClick(item: ActionItem) {
        this.cardClicked.emit(item);
    }
}

import { Component, signal, computed, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

export type CalendarView = 'day' | 'week' | 'month' | 'year';

export interface CalendarEvent {
  id: string;
  title: string;
  date: Date;
  time?: string;
  duration?: number; // in minutes
  color?: string;
  completed?: boolean;
  description?: string;
}

interface FeedDay {
  date: Date;
  isToday: boolean;
  isPast: boolean;
  isFuture: boolean;
  dayOfWeek: string;
  dayNumber: number;
  monthName: string;
  year: number;
  events: CalendarEvent[];
  isFirstOfMonth: boolean;
}

@Component({
  selector: 'app-mission-calendar',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mission-calendar.component.html',
  styleUrl: './mission-calendar.component.css'
})
export class MissionCalendarComponent {
  @Input() events: CalendarEvent[] = [];
  @Output() dateSelected = new EventEmitter<Date>();
  @Output() eventClicked = new EventEmitter<CalendarEvent>();
  @Output() createEvent = new EventEmitter<Date>();

  currentView = signal<CalendarView>('month');
  currentDate = signal<Date>(new Date());
  selectedDate = signal<Date | null>(null);

  readonly views: { id: CalendarView; label: string }[] = [
    { id: 'day', label: 'DAY' },
    { id: 'week', label: 'WEEK' },
    { id: 'month', label: 'MONTH' },
    { id: 'year', label: 'YEAR' }
  ];

  readonly weekDays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  readonly weekDaysFull = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  readonly months = [
    'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
  ];
  readonly shortMonths = [
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'
  ];

  // Computed: Get number of days to show based on view
  private getDaysCount(): number {
    switch (this.currentView()) {
      case 'day': return 1;
      case 'week': return 7;
      case 'month': return 30;
      case 'year': return 365;
    }
  }

  // Computed: Generate feed days based on current view
  feedDays = computed(() => {
    const view = this.currentView();
    const baseDate = this.currentDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const days: FeedDay[] = [];
    let startDate: Date;
    let daysCount: number;

    switch (view) {
      case 'day':
        startDate = new Date(baseDate);
        daysCount = 1;
        break;
      case 'week':
        // Start from beginning of current week
        startDate = new Date(baseDate);
        startDate.setDate(baseDate.getDate() - baseDate.getDay());
        daysCount = 7;
        break;
      case 'month':
        // Start from first day of month
        startDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
        daysCount = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0).getDate();
        break;
      case 'year':
        // Start from January 1st of current year
        startDate = new Date(baseDate.getFullYear(), 0, 1);
        const endOfYear = new Date(baseDate.getFullYear(), 11, 31);
        daysCount = Math.ceil((endOfYear.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        break;
    }

    let prevMonth = -1;
    for (let i = 0; i < daysCount; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      date.setHours(0, 0, 0, 0);

      const isFirstOfMonth = date.getMonth() !== prevMonth;
      prevMonth = date.getMonth();

      days.push({
        date,
        isToday: this.isSameDay(date, today),
        isPast: date < today,
        isFuture: date > today,
        dayOfWeek: this.weekDaysFull[date.getDay()],
        dayNumber: date.getDate(),
        monthName: this.months[date.getMonth()],
        year: date.getFullYear(),
        events: this.getEventsForDate(date),
        isFirstOfMonth
      });
    }

    return days;
  });

  // Get header title based on view
  getHeaderTitle(): string {
    const view = this.currentView();
    const date = this.currentDate();

    switch (view) {
      case 'day':
        return `${this.weekDays[date.getDay()]} ${date.getDate()} ${this.months[date.getMonth()]} ${date.getFullYear()}`;
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        if (weekStart.getMonth() === weekEnd.getMonth()) {
          return `${weekStart.getDate()} - ${weekEnd.getDate()} ${this.months[weekStart.getMonth()]} ${weekStart.getFullYear()}`;
        }
        return `${weekStart.getDate()} ${this.shortMonths[weekStart.getMonth()]} - ${weekEnd.getDate()} ${this.shortMonths[weekEnd.getMonth()]} ${weekStart.getFullYear()}`;
      case 'month':
        return `${this.months[date.getMonth()]} ${date.getFullYear()}`;
      case 'year':
        return `${date.getFullYear()}`;
    }
  }

  setView(view: CalendarView) {
    this.currentView.set(view);
  }

  navigatePrev() {
    const view = this.currentView();
    const current = this.currentDate();
    let newDate: Date;

    switch (view) {
      case 'day':
        newDate = new Date(current.getFullYear(), current.getMonth(), current.getDate() - 1);
        break;
      case 'week':
        newDate = new Date(current.getFullYear(), current.getMonth(), current.getDate() - 7);
        break;
      case 'month':
        newDate = new Date(current.getFullYear(), current.getMonth() - 1, 1);
        break;
      case 'year':
        newDate = new Date(current.getFullYear() - 1, current.getMonth(), 1);
        break;
    }

    this.currentDate.set(newDate);
  }

  navigateNext() {
    const view = this.currentView();
    const current = this.currentDate();
    let newDate: Date;

    switch (view) {
      case 'day':
        newDate = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1);
        break;
      case 'week':
        newDate = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 7);
        break;
      case 'month':
        newDate = new Date(current.getFullYear(), current.getMonth() + 1, 1);
        break;
      case 'year':
        newDate = new Date(current.getFullYear() + 1, current.getMonth(), 1);
        break;
    }

    this.currentDate.set(newDate);
  }

  navigateToToday() {
    this.currentDate.set(new Date());
    this.selectedDate.set(new Date());
  }

  selectDate(date: Date) {
    this.selectedDate.set(date);
    this.dateSelected.emit(date);
  }

  onEventClick(event: CalendarEvent, e: Event) {
    e.stopPropagation();
    this.eventClicked.emit(event);
  }

  onCreateEventClick(date: Date, e: Event) {
    e.stopPropagation();
    this.createEvent.emit(date);
  }

  getEventsForDate(date: Date): CalendarEvent[] {
    return this.events.filter(event => this.isSameDay(new Date(event.date), date));
  }

  private isSameDay(date1: Date, date2: Date): boolean {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  }

  // Track by function for performance
  trackByDay(_: number, day: FeedDay): number {
    return day.date.getTime();
  }

  trackByEvent(_: number, event: CalendarEvent): string {
    return event.id;
  }

  getTimezoneString(): string {
    const offset = new Date().getTimezoneOffset();
    const sign = offset > 0 ? '-' : '+';
    const hours = Math.abs(Math.floor(offset / 60)).toString().padStart(2, '0');
    return `UTC ${sign}${hours}:00`;
  }

  // Format event time for display
  formatEventTime(event: CalendarEvent): string {
    const date = new Date(event.date);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    const displayMinutes = minutes.toString().padStart(2, '0');
    return `${displayHours}:${displayMinutes} ${ampm}`;
  }

  // Convert hex color to solid rgba for event bars
  getEventBarBackground(color: string | undefined): string {
    const eventColor = color || '#dc2626';
    if (eventColor.startsWith('#')) {
      const hex = eventColor.slice(1);
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, 1)`;
    }
    if (eventColor.startsWith('rgba')) {
      return eventColor.replace(/[\d\.]+\)$/g, '1)');
    }
    return `rgba(220, 38, 38, 1)`;
  }

  getEventBarBorderColor(color: string | undefined): string {
    return color || '#dc2626';
  }

  // Get relative day label (Today, Tomorrow, Yesterday, etc.)
  getRelativeDayLabel(day: FeedDay): string {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    if (day.isToday) return 'Today';
    if (this.isSameDay(day.date, tomorrow)) return 'Tomorrow';
    if (this.isSameDay(day.date, yesterday)) return 'Yesterday';
    return '';
  }
}

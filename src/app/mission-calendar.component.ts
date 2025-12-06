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

  readonly views: { id: CalendarView; label: string; icon: string }[] = [
    { id: 'day', label: 'DAY', icon: 'D' },
    { id: 'week', label: 'WEEK', icon: 'W' },
    { id: 'month', label: 'MONTH', icon: 'M' },
    { id: 'year', label: 'YEAR', icon: 'Y' }
  ];

  readonly weekDays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  readonly months = [
    'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
  ];
  readonly shortMonths = [
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
    'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'
  ];

  // Hours for day view
  readonly hours = Array.from({ length: 24 }, (_, i) => i);

  // Computed values
  currentMonth = computed(() => this.currentDate().getMonth());
  currentYear = computed(() => this.currentDate().getFullYear());
  currentMonthName = computed(() => this.months[this.currentMonth()]);

  // Get calendar days for month view
  calendarDays = computed(() => {
    const date = this.currentDate();
    const year = date.getFullYear();
    const month = date.getMonth();
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPadding = firstDay.getDay();
    const totalDays = lastDay.getDate();

    const days: { date: Date; isCurrentMonth: boolean; isToday: boolean; isSelected: boolean }[] = [];

    // Previous month padding
    const prevMonth = new Date(year, month, 0);
    for (let i = startPadding - 1; i >= 0; i--) {
      days.push({
        date: new Date(year, month - 1, prevMonth.getDate() - i),
        isCurrentMonth: false,
        isToday: false,
        isSelected: false
      });
    }

    // Current month days
    const today = new Date();
    for (let i = 1; i <= totalDays; i++) {
      const dayDate = new Date(year, month, i);
      days.push({
        date: dayDate,
        isCurrentMonth: true,
        isToday: this.isSameDay(dayDate, today),
        isSelected: this.selectedDate() ? this.isSameDay(dayDate, this.selectedDate()!) : false
      });
    }

    // Next month padding (to complete the grid)
    const remainingDays = 42 - days.length; // 6 rows x 7 days
    for (let i = 1; i <= remainingDays; i++) {
      days.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false,
        isToday: false,
        isSelected: false
      });
    }

    return days;
  });

  // Get week days for week view
  weekDaysData = computed(() => {
    const date = this.currentDate();
    const startOfWeek = new Date(date);
    startOfWeek.setDate(date.getDate() - date.getDay());

    const days: { date: Date; isToday: boolean; isSelected: boolean }[] = [];
    const today = new Date();

    for (let i = 0; i < 7; i++) {
      const dayDate = new Date(startOfWeek);
      dayDate.setDate(startOfWeek.getDate() + i);
      days.push({
        date: dayDate,
        isToday: this.isSameDay(dayDate, today),
        isSelected: this.selectedDate() ? this.isSameDay(dayDate, this.selectedDate()!) : false
      });
    }

    return days;
  });

  // Get months for year view
  yearMonths = computed(() => {
    const year = this.currentYear();
    const today = new Date();
    
    return this.shortMonths.map((name, index) => ({
      name,
      index,
      isCurrentMonth: today.getFullYear() === year && today.getMonth() === index
    }));
  });

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
    this.currentDate.set(date);
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

  createDateWithHour(date: Date, hour: number): Date {
    const newDate = new Date(date);
    newDate.setHours(hour, 0, 0, 0);
    return newDate;
  }

  selectMonth(monthIndex: number) {
    const newDate = new Date(this.currentYear(), monthIndex, 1);
    this.currentDate.set(newDate);
    this.currentView.set('month');
  }

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

  formatHour(hour: number): string {
    if (hour === 0) return '12 AM';
    if (hour === 12) return '12 PM';
    if (hour < 12) return `${hour} AM`;
    return `${hour - 12} PM`;
  }

  getEventsForDate(date: Date): CalendarEvent[] {
    return this.events.filter(event => this.isSameDay(new Date(event.date), date));
  }

  getEventsForHour(date: Date, hour: number): CalendarEvent[] {
    return this.events.filter(event => {
      const eventDate = new Date(event.date);
      return this.isSameDay(eventDate, date) && eventDate.getHours() === hour;
    });
  }

  private isSameDay(date1: Date, date2: Date): boolean {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
  }

  // Track by functions for performance
  trackByDate(_: number, day: { date: Date }): number {
    return day.date.getTime();
  }

  trackByMonth(_: number, month: { index: number }): number {
    return month.index;
  }

  trackByHour(_: number, hour: number): number {
    return hour;
  }

  getTimezoneString(): string {
    const offset = new Date().getTimezoneOffset();
    const sign = offset > 0 ? '-' : '+';
    const hours = Math.abs(Math.floor(offset / 60)).toString().padStart(2, '0');
    return `UTC ${sign}${hours}:00`;
  }

  // Convert hex color to rgba with opacity for event bars
  getEventBarBackground(color: string | undefined): string {
    const eventColor = color || '#dc2626';
    // For event bars, use a more opaque version (70-80% opacity) so white text is visible
    if (eventColor.startsWith('#')) {
      const hex = eventColor.slice(1);
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, 0.75)`;
    }
    // If already rgba, increase opacity
    if (eventColor.startsWith('rgba')) {
      return eventColor.replace(/[\d\.]+\)$/g, '0.75)');
    }
    return `rgba(220, 38, 38, 0.75)`;
  }

  getEventBarBorderColor(color: string | undefined): string {
    return color || '#dc2626';
  }
}


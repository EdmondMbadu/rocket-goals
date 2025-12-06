import { Component, Input, Output, EventEmitter, signal, effect, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { CalendarEvent } from './mission-calendar.component';
import type { CalendarEventData } from './calendar-events.service';

@Component({
  selector: 'app-event-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './event-modal.component.html',
  styleUrl: './event-modal.component.css'
})
export class EventModalComponent implements OnChanges {
  @Input() event: CalendarEvent | null = null;
  @Input() defaultDate: Date = new Date();
  @Input() goalId: string = '';
  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<Partial<CalendarEventData>>();
  @Output() delete = new EventEmitter<string>();

  isOpen = signal(false);
  isDeleteConfirm = signal(false);

  // Form fields
  title = signal('');
  date = signal('');
  time = signal('');
  duration = signal(60); // default 60 minutes
  color = signal('#dc2626');
  description = signal('');
  completed = signal(false);

  readonly colorOptions = [
    { value: '#dc2626', label: 'Red' },
    { value: '#3b82f6', label: 'Blue' },
    { value: '#10b981', label: 'Green' },
    { value: '#f59e0b', label: 'Orange' },
    { value: '#8b5cf6', label: 'Purple' },
    { value: '#ec4899', label: 'Pink' },
    { value: '#06b6d4', label: 'Cyan' },
    { value: '#f97316', label: 'Amber' }
  ];

  readonly durationOptions = [
    { value: 15, label: '15 min' },
    { value: 30, label: '30 min' },
    { value: 60, label: '1 hour' },
    { value: 90, label: '1.5 hours' },
    { value: 120, label: '2 hours' },
    { value: 180, label: '3 hours' },
    { value: 240, label: '4 hours' }
  ];

  ngOnChanges(changes: SimpleChanges) {
    if (changes['event'] || changes['defaultDate']) {
      this.initializeForm();
    }
  }

  private initializeForm() {
    if (this.event) {
      // Editing existing event
      this.isOpen.set(true);
      this.isDeleteConfirm.set(false);
      this.title.set(this.event.title);
      this.date.set(this.formatDateForInput(this.event.date));
      this.time.set(this.event.time || this.getDefaultTime());
      this.duration.set(this.event.duration || 60);
      this.color.set(this.event.color || '#dc2626');
      this.completed.set(this.event.completed || false);
      this.description.set((this.event as any).description || '');
    } else if (this.defaultDate) {
      // New event
      this.isOpen.set(true);
      this.isDeleteConfirm.set(false);
      this.title.set('');
      this.date.set(this.formatDateForInput(this.defaultDate));
      this.time.set(this.getDefaultTime());
      this.duration.set(60);
      this.color.set('#dc2626');
      this.completed.set(false);
      this.description.set('');
    }
  }

  formatDateForInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  getDefaultTime(): string {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  closeModal() {
    this.isOpen.set(false);
    this.close.emit();
  }

  handleSave() {
    if (!this.title().trim()) {
      alert('Please enter a title for the event');
      return;
    }

    const dateStr = this.date();
    const timeStr = this.time();
    
    if (!dateStr) {
      alert('Please select a date');
      return;
    }

    const [year, month, day] = dateStr.split('-').map(Number);
    const [hours, minutes] = timeStr.split(':').map(Number);
    const eventDate = new Date(year, month - 1, day, hours, minutes);

    const eventData: Partial<CalendarEventData> = {
      title: this.title().trim(),
      date: eventDate,
      time: timeStr,
      duration: this.duration(),
      color: this.color(),
      description: this.description().trim(),
      completed: this.completed()
    };

    this.save.emit(eventData);
    this.closeModal();
  }

  handleDelete() {
    if (this.isDeleteConfirm()) {
      if (this.event?.id) {
        this.delete.emit(this.event.id);
      }
      this.closeModal();
    } else {
      this.isDeleteConfirm.set(true);
    }
  }

  cancelDelete() {
    this.isDeleteConfirm.set(false);
  }

  onBackdropClick(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.closeModal();
    }
  }
}


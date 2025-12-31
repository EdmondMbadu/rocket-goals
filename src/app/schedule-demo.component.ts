import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';

interface TimeSlot {
  time: string;
  displayTime: string;
}

@Component({
  selector: 'app-schedule-demo',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="min-h-screen bg-white text-black dark:bg-slate-950 dark:text-slate-100 flex flex-col transition-colors duration-300">
      <!-- Header -->
      <header class="border-b border-black/5 dark:border-white/10">
        <div class="container mx-auto px-4 py-3 flex items-center justify-between">
          <a routerLink="/" class="flex items-center gap-3 group">
            <div class="relative w-12 h-12">
              <div class="absolute -inset-1 bg-gradient-to-r from-red-600 to-black rounded-full blur opacity-20 group-hover:opacity-40 transition"></div>
              <img src="/assets/rocket-goals.png" alt="Rocket Goals" class="relative w-12 h-12 object-contain" />
            </div>
            <span class="text-xl font-black tracking-tighter">
              ROCKET<span class="text-red-600">GOALS</span>
            </span>
          </a>
          <div class="flex items-center gap-3">
            <a routerLink="/contact" class="px-4 py-2 text-sm font-bold rounded-full border border-black/10 hover:border-black transition dark:border-white/20 dark:hover:border-white">Contact</a>
            <a routerLink="/signup" class="px-4 py-2 bg-black text-white text-sm font-bold rounded-full hover:bg-red-600 transition shadow-lg dark:bg-white dark:text-black dark:hover:bg-red-600 dark:hover:text-white">Start Free</a>
          </div>
        </div>
      </header>

      <main class="flex-1">
        <!-- Hero Section -->
        <section class="relative overflow-hidden border-b border-black/5 dark:border-white/10">
          <div class="absolute inset-0 opacity-20 pointer-events-none">
            <div class="absolute top-[-200px] left-[-200px] w-[600px] h-[600px] bg-red-600/15 rounded-full blur-[140px]"></div>
            <div class="absolute bottom-[-200px] right-[-150px] w-[500px] h-[500px] bg-black/10 rounded-full blur-[120px]"></div>
          </div>

          <div class="container mx-auto px-4 py-6 relative z-10 space-y-3 text-center">
            <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 border border-gray-200 text-gray-600 dark:bg-white/5 dark:border-white/10 dark:text-slate-200">
              <span class="w-2 h-2 bg-red-600 rounded-full animate-pulse"></span>
              <span class="text-xs font-bold tracking-wider uppercase">Schedule a Demo</span>
            </div>
            <h1 class="text-2xl md:text-4xl font-black tracking-tight leading-tight text-black dark:text-white">
              See Rocket Goals in Action
            </h1>
            <p class="text-base text-black/60 dark:text-slate-300 max-w-2xl mx-auto">
              Book a 30-minute personalized demo with our team
            </p>
          </div>
        </section>

        <!-- Progress Steps -->
        <div class="container mx-auto px-4 py-4">
          <div class="flex items-center justify-center gap-4 mb-4">
            @for (stepNum of [1, 2, 3]; track stepNum) {
              <div class="flex items-center gap-2">
                <div
                  class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-300"
                  [class]="stepNum < currentStep() ? 'bg-green-500 text-white' : stepNum === currentStep() ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-500 dark:bg-slate-700 dark:text-slate-400'">
                  @if (stepNum < currentStep()) {
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                    </svg>
                  } @else {
                    {{ stepNum }}
                  }
                </div>
                @if (stepNum < 3) {
                  <div class="w-16 h-1 rounded-full transition-all duration-300" [class]="stepNum < currentStep() ? 'bg-green-500' : 'bg-gray-200 dark:bg-slate-700'"></div>
                }
              </div>
            }
          </div>

          <!-- Step 1: What to Expect -->
          @if (currentStep() === 1) {
            <div class="max-w-3xl mx-auto">
              <div class="bg-white border border-black/5 rounded-3xl shadow-xl p-8 md:p-12 space-y-8 dark:bg-slate-900/80 dark:border-white/10 dark:shadow-[0_25px_60px_rgba(2,6,23,0.7)]">
                <div class="text-center space-y-4">
                  <div class="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-red-50 text-red-700 text-xs font-bold uppercase tracking-widest dark:bg-red-500/15 dark:text-red-200">
                    Step 1 of 3
                  </div>
                  <h2 class="text-2xl md:text-3xl font-black tracking-tight text-black dark:text-white">
                    What to Expect in Your Demo
                  </h2>
                  <p class="text-black/60 dark:text-slate-300">
                    Here's what we'll cover in your personalized 30-minute session
                  </p>
                </div>

                <div class="grid gap-4">
                  <div class="flex items-start gap-4 p-4 bg-gray-50 rounded-2xl dark:bg-slate-800/50">
                    <div class="w-10 h-10 rounded-xl bg-red-600/10 text-red-700 flex items-center justify-center flex-shrink-0 dark:bg-red-500/20 dark:text-red-300">
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path>
                      </svg>
                    </div>
                    <div>
                      <h3 class="font-bold text-black dark:text-white">Product Overview</h3>
                      <p class="text-sm text-black/60 dark:text-slate-400">See how Rocket Goals helps you set, track, and achieve your goals with AI-powered insights</p>
                    </div>
                  </div>

                  <div class="flex items-start gap-4 p-4 bg-gray-50 rounded-2xl dark:bg-slate-800/50">
                    <div class="w-10 h-10 rounded-xl bg-red-600/10 text-red-700 flex items-center justify-center flex-shrink-0 dark:bg-red-500/20 dark:text-red-300">
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path>
                      </svg>
                    </div>
                    <div>
                      <h3 class="font-bold text-black dark:text-white">Live Q&A</h3>
                      <p class="text-sm text-black/60 dark:text-slate-400">Get all your questions answered by our team in real-time</p>
                    </div>
                  </div>

                  <div class="flex items-start gap-4 p-4 bg-gray-50 rounded-2xl dark:bg-slate-800/50">
                    <div class="w-10 h-10 rounded-xl bg-red-600/10 text-red-700 flex items-center justify-center flex-shrink-0 dark:bg-red-500/20 dark:text-red-300">
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                      </svg>
                    </div>
                    <div>
                      <h3 class="font-bold text-black dark:text-white">Personalized Recommendations</h3>
                      <p class="text-sm text-black/60 dark:text-slate-400">Learn how to best use Rocket Goals for your specific needs and goals</p>
                    </div>
                  </div>

                  <div class="flex items-start gap-4 p-4 bg-gray-50 rounded-2xl dark:bg-slate-800/50">
                    <div class="w-10 h-10 rounded-xl bg-red-600/10 text-red-700 flex items-center justify-center flex-shrink-0 dark:bg-red-500/20 dark:text-red-300">
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                      </svg>
                    </div>
                    <div>
                      <h3 class="font-bold text-black dark:text-white">30 Minutes</h3>
                      <p class="text-sm text-black/60 dark:text-slate-400">A quick but comprehensive session that respects your time</p>
                    </div>
                  </div>
                </div>

                <div class="pt-4">
                  <button
                    (click)="nextStep()"
                    class="w-full py-4 bg-black text-white font-bold text-lg rounded-2xl hover:bg-red-600 transition shadow-lg dark:bg-white dark:text-black dark:hover:bg-red-600 dark:hover:text-white">
                    Choose a Date & Time
                    <svg class="w-5 h-5 inline-block ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          }

          <!-- Step 2: Choose Date & Time -->
          @if (currentStep() === 2) {
            <div class="max-w-4xl mx-auto">
              <div class="bg-white border border-black/5 rounded-3xl shadow-xl p-8 md:p-12 space-y-8 dark:bg-slate-900/80 dark:border-white/10 dark:shadow-[0_25px_60px_rgba(2,6,23,0.7)]">
                <div class="text-center space-y-4">
                  <div class="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-red-50 text-red-700 text-xs font-bold uppercase tracking-widest dark:bg-red-500/15 dark:text-red-200">
                    Step 2 of 3
                  </div>
                  <h2 class="text-2xl md:text-3xl font-black tracking-tight text-black dark:text-white">
                    Select Your Preferred Time
                  </h2>
                  <p class="text-black/60 dark:text-slate-300">
                    Available Saturdays from 5:00 PM - 7:00 PM EST (New York)
                  </p>
                </div>

                <div class="grid md:grid-cols-2 gap-8">
                  <!-- Calendar -->
                  <div class="space-y-4">
                    <div class="flex items-center justify-between mb-6">
                      <button
                        (click)="previousMonth()"
                        [disabled]="!canGoToPreviousMonth()"
                        class="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-700 transition disabled:opacity-30 disabled:cursor-not-allowed">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                        </svg>
                      </button>
                      <h3 class="text-xl font-bold">{{ currentMonthYear() }}</h3>
                      <button
                        (click)="nextMonth()"
                        class="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-slate-700 transition">
                        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                        </svg>
                      </button>
                    </div>

                    <!-- Day Headers -->
                    <div class="grid grid-cols-7 gap-2 text-center text-sm font-bold text-black/40 dark:text-slate-500">
                      <div>Sun</div>
                      <div>Mon</div>
                      <div>Tue</div>
                      <div>Wed</div>
                      <div>Thu</div>
                      <div>Fri</div>
                      <div class="text-red-600">Sat</div>
                    </div>

                    <!-- Calendar Grid -->
                    <div class="grid grid-cols-7 gap-2">
                      @for (day of calendarDays(); track day.date?.toISOString() || $index) {
                        @if (day.date) {
                          <button
                            (click)="selectDate(day.date)"
                            [disabled]="!day.isSelectable"
                            class="aspect-square rounded-xl text-sm font-semibold transition-all duration-200"
                            [class]="getDateClass(day)">
                            {{ day.date.getDate() }}
                          </button>
                        } @else {
                          <div class="aspect-square"></div>
                        }
                      }
                    </div>
                  </div>

                  <!-- Time Slots -->
                  <div class="space-y-6">
                    <h3 class="text-xl font-bold text-center">
                      @if (selectedDate()) {
                        {{ formatSelectedDate() }}
                      } @else {
                        Select a Saturday
                      }
                    </h3>

                    @if (selectedDate()) {
                      <div class="space-y-4">
                        @for (slot of timeSlots; track slot.time) {
                          <button
                            (click)="selectTime(slot.time)"
                            class="w-full p-5 rounded-2xl border-2 text-left font-semibold transition-all duration-200"
                            [class]="selectedTime() === slot.time
                              ? 'border-red-600 bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-200'
                              : 'border-black/10 hover:border-black/30 dark:border-white/10 dark:hover:border-white/30'">
                            <div class="flex items-center justify-between">
                              <span class="text-lg">{{ slot.displayTime }}</span>
                              @if (selectedTime() === slot.time) {
                                <svg class="w-6 h-6 text-red-600" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                                </svg>
                              }
                            </div>
                          </button>
                        }
                      </div>
                      <p class="text-sm text-center text-black/50 dark:text-slate-400">
                        All times are in Eastern Time (ET) - New York
                      </p>
                    } @else {
                      <div class="h-64 flex items-center justify-center text-black/40 dark:text-slate-500">
                        <div class="text-center">
                          <svg class="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                          </svg>
                          <p class="text-lg">Click on a Saturday to see available times</p>
                        </div>
                      </div>
                    }
                  </div>
                </div>

                <div class="flex gap-4 pt-4">
                  <button
                    (click)="previousStep()"
                    class="flex-1 py-4 bg-gray-100 text-black font-bold text-lg rounded-2xl hover:bg-gray-200 transition dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600">
                    <svg class="w-5 h-5 inline-block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                    </svg>
                    Back
                  </button>
                  <button
                    (click)="nextStep()"
                    [disabled]="!selectedDate() || !selectedTime()"
                    class="flex-1 py-4 bg-black text-white font-bold text-lg rounded-2xl hover:bg-red-600 transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-black dark:hover:bg-red-600 dark:hover:text-white">
                    Continue
                    <svg class="w-5 h-5 inline-block ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          }

          <!-- Step 3: Your Information & Expectations -->
          @if (currentStep() === 3) {
            <div class="max-w-3xl mx-auto">
              <div class="bg-white border border-black/5 rounded-3xl shadow-xl p-8 md:p-12 space-y-8 dark:bg-slate-900/80 dark:border-white/10 dark:shadow-[0_25px_60px_rgba(2,6,23,0.7)]">
                <div class="text-center space-y-4">
                  <div class="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-red-50 text-red-700 text-xs font-bold uppercase tracking-widest dark:bg-red-500/15 dark:text-red-200">
                    Step 3 of 3
                  </div>
                  <h2 class="text-2xl md:text-3xl font-black tracking-tight text-black dark:text-white">
                    Tell Us About Yourself
                  </h2>
                </div>

                <!-- Selected Date/Time Summary -->
                <div class="p-5 bg-gray-50 rounded-2xl dark:bg-slate-800/50">
                  <div class="flex items-center gap-4">
                    <div class="w-12 h-12 rounded-xl bg-red-600 text-white flex items-center justify-center">
                      <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                      </svg>
                    </div>
                    <div>
                      <p class="font-bold text-lg text-black dark:text-white">{{ formatSelectedDate() }} at {{ getDisplayTime() }}</p>
                      <p class="text-sm text-black/60 dark:text-slate-400">30-minute demo (Eastern Time)</p>
                    </div>
                    <button (click)="currentStep.set(2)" class="ml-auto text-red-600 hover:underline font-semibold text-sm">
                      Change
                    </button>
                  </div>
                </div>

                <!-- Form -->
                <form (ngSubmit)="submitForm()" class="space-y-6">
                  <div class="grid md:grid-cols-2 gap-6">
                    <div class="space-y-2">
                      <label class="block text-sm font-bold text-black dark:text-white">First Name *</label>
                      <input
                        type="text"
                        [(ngModel)]="firstName"
                        name="firstName"
                        required
                        class="w-full px-4 py-3 rounded-xl border border-black/10 bg-white focus:border-red-600 focus:ring-2 focus:ring-red-600/20 outline-none transition dark:bg-slate-800 dark:border-white/10 dark:text-white"
                        placeholder="John">
                    </div>
                    <div class="space-y-2">
                      <label class="block text-sm font-bold text-black dark:text-white">Last Name *</label>
                      <input
                        type="text"
                        [(ngModel)]="lastName"
                        name="lastName"
                        required
                        class="w-full px-4 py-3 rounded-xl border border-black/10 bg-white focus:border-red-600 focus:ring-2 focus:ring-red-600/20 outline-none transition dark:bg-slate-800 dark:border-white/10 dark:text-white"
                        placeholder="Doe">
                    </div>
                  </div>

                  <div class="grid md:grid-cols-2 gap-6">
                    <div class="space-y-2">
                      <label class="block text-sm font-bold text-black dark:text-white">Email Address *</label>
                      <input
                        type="email"
                        [(ngModel)]="email"
                        name="email"
                        required
                        class="w-full px-4 py-3 rounded-xl border border-black/10 bg-white focus:border-red-600 focus:ring-2 focus:ring-red-600/20 outline-none transition dark:bg-slate-800 dark:border-white/10 dark:text-white"
                        placeholder="john@example.com">
                    </div>
                    <div class="space-y-2">
                      <label class="block text-sm font-bold text-black dark:text-white">Company (Optional)</label>
                      <input
                        type="text"
                        [(ngModel)]="company"
                        name="company"
                        class="w-full px-4 py-3 rounded-xl border border-black/10 bg-white focus:border-red-600 focus:ring-2 focus:ring-red-600/20 outline-none transition dark:bg-slate-800 dark:border-white/10 dark:text-white"
                        placeholder="Your company">
                    </div>
                  </div>

                  <div class="space-y-2">
                    <label class="block text-sm font-bold text-black dark:text-white">What do you hope to get from this demo? *</label>
                    <textarea
                      [(ngModel)]="expectations"
                      name="expectations"
                      required
                      rows="4"
                      class="w-full px-4 py-3 rounded-xl border border-black/10 bg-white focus:border-red-600 focus:ring-2 focus:ring-red-600/20 outline-none transition resize-none dark:bg-slate-800 dark:border-white/10 dark:text-white"
                      placeholder="Tell us about your goals, what problems you're trying to solve..."></textarea>
                  </div>

                  @if (errorMessage()) {
                    <div class="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 dark:bg-red-500/15 dark:border-red-500/30 dark:text-red-200">
                      {{ errorMessage() }}
                    </div>
                  }

                  <div class="flex gap-4 pt-4">
                    <button
                      type="button"
                      (click)="previousStep()"
                      class="flex-1 py-4 bg-gray-100 text-black font-bold text-lg rounded-2xl hover:bg-gray-200 transition dark:bg-slate-700 dark:text-white dark:hover:bg-slate-600">
                      <svg class="w-5 h-5 inline-block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                      </svg>
                      Back
                    </button>
                    <button
                      type="submit"
                      [disabled]="isSubmitting() || !isFormValid()"
                      class="flex-1 py-4 bg-black text-white font-bold text-lg rounded-2xl hover:bg-red-600 transition shadow-lg disabled:opacity-50 disabled:cursor-not-allowed dark:bg-white dark:text-black dark:hover:bg-red-600 dark:hover:text-white">
                      @if (isSubmitting()) {
                        <svg class="w-5 h-5 inline-block mr-2 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Scheduling...
                      } @else {
                        Schedule Demo
                        <svg class="w-5 h-5 inline-block ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                      }
                    </button>
                  </div>
                </form>
              </div>
            </div>
          }

          <!-- Step 4: Confirmation -->
          @if (currentStep() === 4) {
            <div class="max-w-3xl mx-auto">
              <div class="bg-white border border-black/5 rounded-3xl shadow-xl p-8 md:p-12 space-y-8 text-center dark:bg-slate-900/80 dark:border-white/10 dark:shadow-[0_25px_60px_rgba(2,6,23,0.7)]">
                <div class="w-20 h-20 mx-auto bg-green-100 rounded-full flex items-center justify-center dark:bg-green-500/20">
                  <svg class="w-10 h-10 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                </div>

                <div class="space-y-4">
                  <h2 class="text-2xl md:text-3xl font-black tracking-tight text-black dark:text-white">
                    You're All Set!
                  </h2>
                  <p class="text-lg text-black/60 dark:text-slate-300 max-w-md mx-auto">
                    We've sent a confirmation email to <strong class="text-black dark:text-white">{{ email }}</strong> with all the meeting details.
                  </p>
                </div>

                <div class="p-6 bg-gray-50 rounded-2xl space-y-5 text-left dark:bg-slate-800/50">
                  <h3 class="font-bold text-xl text-black dark:text-white">Meeting Details</h3>

                  <div class="space-y-4">
                    <div class="flex items-start gap-4">
                      <svg class="w-6 h-6 text-red-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                      </svg>
                      <div>
                        <p class="font-semibold text-lg text-black dark:text-white">{{ formatSelectedDate() }}</p>
                        <p class="text-black/60 dark:text-slate-400">{{ getDisplayTime() }} EST (30 minutes)</p>
                      </div>
                    </div>

                    <div class="flex items-start gap-4">
                      <svg class="w-6 h-6 text-red-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                      </svg>
                      <div>
                        <p class="font-semibold text-lg text-black dark:text-white">Google Meet</p>
                        <a href="https://meet.google.com/cko-gfkj-wqg" target="_blank" class="text-red-600 hover:underline break-all">
                          meet.google.com/cko-gfkj-wqg
                        </a>
                      </div>
                    </div>

                    <div class="flex items-start gap-4">
                      <svg class="w-6 h-6 text-red-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path>
                      </svg>
                      <div>
                        <p class="font-semibold text-lg text-black dark:text-white">Join by Phone</p>
                        <p class="text-black/60 dark:text-slate-400">+1 904-419-3963 | PIN: 573 033 836#</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="space-y-6 pt-4">
                  <a
                    href="https://meet.google.com/cko-gfkj-wqg"
                    target="_blank"
                    class="inline-flex items-center justify-center gap-3 w-full py-4 bg-black text-white font-bold text-lg rounded-2xl hover:bg-red-600 transition shadow-lg dark:bg-white dark:text-black dark:hover:bg-red-600 dark:hover:text-white">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                    </svg>
                    Join Google Meet
                  </a>
                  <a routerLink="/" class="block text-red-600 hover:underline font-semibold text-lg">
                    Return to Home
                  </a>
                </div>
              </div>
            </div>
          }
        </div>
      </main>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
    :host-context(.dark) .min-h-screen {
      background-color: #020617;
      color: #e2e8f0;
    }
    :host-context(.dark) .bg-white {
      background-color: rgba(2, 6, 23, 0.95);
      color: #e2e8f0;
    }
    :host-context(.dark) .bg-gray-50 {
      background-color: rgba(15, 23, 42, 0.7);
    }
    :host-context(.dark) .bg-gray-100 {
      background-color: rgba(15, 23, 42, 0.8);
    }
    :host-context(.dark) .border-black\\/5,
    :host-context(.dark) .border-black\\/10 {
      border-color: rgba(226, 232, 240, 0.2);
    }
    :host-context(.dark) .border-gray-200 {
      border-color: rgba(226, 232, 240, 0.2);
    }
    :host-context(.dark) .text-black {
      color: #f8fafc;
    }
    :host-context(.dark) .text-black\\/70,
    :host-context(.dark) .text-black\\/60,
    :host-context(.dark) .text-black\\/80,
    :host-context(.dark) .text-black\\/40,
    :host-context(.dark) .text-black\\/50 {
      color: #94a3b8;
    }
  `]
})
export class ScheduleDemoComponent {
  currentStep = signal(1);
  selectedDate = signal<Date | null>(null);
  selectedTime = signal<string | null>(null);
  currentMonth = signal(new Date());
  isSubmitting = signal(false);
  errorMessage = signal<string | null>(null);

  // Form fields
  firstName = '';
  lastName = '';
  email = '';
  company = '';
  expectations = '';

  // Time slots: 5:00 PM - 7:00 PM EST (30-minute slots)
  timeSlots: TimeSlot[] = [
    { time: '17:00', displayTime: '5:00 PM EST' },
    { time: '17:30', displayTime: '5:30 PM EST' },
    { time: '18:00', displayTime: '6:00 PM EST' },
    { time: '18:30', displayTime: '6:30 PM EST' }
  ];

  private readonly functions = getFunctions(getApp(), 'us-central1');

  currentMonthYear = computed(() => {
    const date = this.currentMonth();
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  });

  calendarDays = computed(() => {
    const date = this.currentMonth();
    const year = date.getFullYear();
    const month = date.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startPadding = firstDay.getDay();

    const days: { date: Date | null; isSelectable: boolean; isSelected: boolean }[] = [];

    // Add padding for days before the first of the month
    for (let i = 0; i < startPadding; i++) {
      days.push({ date: null, isSelectable: false, isSelected: false });
    }

    // Add all days of the month
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let day = 1; day <= lastDay.getDate(); day++) {
      const currentDate = new Date(year, month, day);
      const isSaturday = currentDate.getDay() === 6;
      const isFuture = currentDate >= today;
      const isSelectable = isSaturday && isFuture;
      const isSelected = this.selectedDate()
        ? currentDate.toDateString() === this.selectedDate()!.toDateString()
        : false;

      days.push({ date: currentDate, isSelectable, isSelected });
    }

    return days;
  });

  canGoToPreviousMonth(): boolean {
    const today = new Date();
    const currentMonthStart = new Date(this.currentMonth().getFullYear(), this.currentMonth().getMonth(), 1);
    const todayMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    return currentMonthStart > todayMonthStart;
  }

  previousMonth(): void {
    const current = this.currentMonth();
    this.currentMonth.set(new Date(current.getFullYear(), current.getMonth() - 1, 1));
  }

  nextMonth(): void {
    const current = this.currentMonth();
    this.currentMonth.set(new Date(current.getFullYear(), current.getMonth() + 1, 1));
  }

  selectDate(date: Date): void {
    if (date.getDay() === 6) {
      this.selectedDate.set(date);
      this.selectedTime.set(null);
    }
  }

  selectTime(time: string): void {
    this.selectedTime.set(time);
  }

  getDateClass(day: { date: Date | null; isSelectable: boolean; isSelected: boolean }): string {
    if (!day.date) return '';

    if (day.isSelected) {
      return 'bg-red-600 text-white hover:bg-red-700';
    }

    if (day.isSelectable) {
      return 'bg-red-50 text-red-700 hover:bg-red-100 cursor-pointer dark:bg-red-500/15 dark:text-red-200 dark:hover:bg-red-500/25';
    }

    return 'text-black/30 cursor-not-allowed dark:text-slate-600';
  }

  formatSelectedDate(): string {
    const date = this.selectedDate();
    if (!date) return '';
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  }

  getDisplayTime(): string {
    const time = this.selectedTime();
    if (!time) return '';
    const slot = this.timeSlots.find(s => s.time === time);
    return slot ? slot.displayTime : '';
  }

  nextStep(): void {
    if (this.currentStep() < 4) {
      this.currentStep.set(this.currentStep() + 1);
    }
  }

  previousStep(): void {
    if (this.currentStep() > 1) {
      this.currentStep.set(this.currentStep() - 1);
    }
  }

  isFormValid(): boolean {
    return !!(
      this.firstName.trim() &&
      this.lastName.trim() &&
      this.email.trim() &&
      this.expectations.trim() &&
      this.isValidEmail(this.email)
    );
  }

  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  async submitForm(): Promise<void> {
    if (!this.isFormValid() || !this.selectedDate() || !this.selectedTime()) {
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    try {
      const scheduleDemoFn = httpsCallable<{
        firstName: string;
        lastName: string;
        email: string;
        company: string;
        expectations: string;
        date: string;
        time: string;
      }, { success: boolean }>(this.functions, 'scheduleDemoEmail');

      await scheduleDemoFn({
        firstName: this.firstName.trim(),
        lastName: this.lastName.trim(),
        email: this.email.trim(),
        company: this.company.trim(),
        expectations: this.expectations.trim(),
        date: this.selectedDate()!.toISOString(),
        time: this.selectedTime()!
      });

      this.currentStep.set(4);
    } catch (error: any) {
      console.error('Error scheduling demo:', error);
      this.errorMessage.set(
        error.message || 'Something went wrong. Please try again or contact us directly.'
      );
    } finally {
      this.isSubmitting.set(false);
    }
  }
}

import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterModule, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AvatarDropdownComponent } from './avatar-dropdown.component';
import { ThemeService } from './theme.service';
import { AuthService } from './auth.service';
import { stripePrices, firebaseConfig } from '../../environments/environment';

@Component({
  selector: 'app-pricing-page',
  standalone: true,
  imports: [RouterModule, CommonModule, AvatarDropdownComponent],
  template: `
    <div class="min-h-screen bg-white text-black flex flex-col transition-colors duration-300 dark:bg-slate-950 dark:text-slate-100">
      <header class="relative z-40 px-6 md:px-8 py-6 flex-none border-b border-gray-200/50 bg-white/90 backdrop-blur-xl dark:bg-slate-900/70 dark:border-white/10">
        <div class="flex items-center justify-between max-w-7xl mx-auto w-full gap-6">
          <a routerLink="/goals" class="flex items-center gap-3 group flex-none">
            <div class="relative">
              <div
                class="absolute -inset-1 bg-gradient-to-r from-red-600 to-black rounded-full blur opacity-20 group-hover:opacity-40 transition duration-500">
              </div>
              <img src="/assets/rocket-goals.png" alt="Rocket Goals"
                class="relative w-14 h-14 md:w-16 md:h-16 object-contain transform group-hover:scale-105 transition-transform" />
            </div>
            <span class="text-2xl md:text-3xl font-black tracking-tighter text-black hidden sm:block dark:text-white">
              ROCKET<span class="text-red-600">GOALS</span>
            </span>
          </a>
          <div class="flex-1 flex items-center justify-center gap-6">
            <a routerLink="/goals" routerLinkActive="text-red-600 border-b-2 border-red-600"
              class="pb-1 text-sm font-bold text-black/80 hover:text-red-600 transition-colors uppercase tracking-wide inline-flex items-center gap-2 dark:text-slate-300 dark:hover:text-red-400">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Home
            </a>
            <a routerLink="/ai" routerLinkActive="text-red-600 border-b-2 border-red-600"
              class="pb-1 text-sm font-bold text-black/80 hover:text-red-600 transition-colors uppercase tracking-wide inline-flex items-center gap-2 dark:text-slate-300 dark:hover:text-red-400">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              AI
            </a>
            <a routerLink="/profile" routerLinkActive="text-red-600 border-b-2 border-red-600"
              class="pb-1 text-sm font-bold text-black/80 hover:text-red-600 transition-colors uppercase tracking-wide inline-flex items-center gap-2 dark:text-slate-300 dark:hover:text-red-400">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Profile
            </a>
          </div>
          <div class="flex items-center gap-3 flex-none">
            <button type="button" (click)="toggleDarkMode()" [attr.aria-pressed]="isDarkMode()"
              class="p-2.5 rounded-full border border-black/10 text-black/70 hover:bg-black/5 transition-colors dark:border-white/20 dark:text-white dark:hover:bg-white/10"
              title="Toggle appearance">
              @if (isDarkMode()) {
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
              } @else {
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.364 6.364l-1.414-1.414M7.05 7.05 5.636 5.636m12.728 0-1.414 1.414M7.05 16.95l-1.414 1.414M12 8a4 4 0 100 8 4 4 0 000-8z" />
              </svg>
              }
            </button>
            <app-avatar-dropdown />
          </div>
        </div>
      </header>

      <main class="flex-1">
        <section class="relative overflow-hidden">
          <div class="absolute inset-0 opacity-20 pointer-events-none">
            <div class="absolute top-[-200px] left-[-200px] w-[600px] h-[600px] bg-red-600/15 rounded-full blur-[140px] dark:bg-red-600/25"></div>
            <div class="absolute bottom-[-200px] right-[-150px] w-[500px] h-[500px] bg-black/10 rounded-full blur-[120px] dark:bg-white/10"></div>
          </div>

          <div class="container mx-auto px-6 py-4 relative z-10 space-y-4 text-center">
            <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 border border-gray-200 dark:bg-white/5 dark:border-white/10">
              <span class="w-2 h-2 bg-red-600 rounded-full animate-pulse"></span>
              <span class="text-xs font-bold text-gray-600 tracking-wider uppercase dark:text-slate-300">Pricing</span>
            </div>
            <h1 class="text-4xl md:text-6xl font-black tracking-tight leading-tight dark:text-white">
              Pick the mission that matches your orbit
            </h1>
            <p class="text-lg md:text-xl text-black/60 max-w-3xl mx-auto dark:text-slate-300">
              Emotionally intelligent reminders, predictive coaching, and accountability built for every stage of your journey.
            </p>
          </div>
        </section>

        <section class="pb-20">
          <div class="container mx-auto px-6">
            @if (getCurrentPlan()) {
              <div class="max-w-2xl mx-auto mb-8 p-4 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-slate-800 dark:to-slate-900 border border-gray-200 dark:border-white/10 rounded-xl flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <span class="text-2xl">🚀</span>
                  <div>
                    <p class="text-sm text-gray-500 dark:text-slate-400">Your current plan</p>
                    <p class="font-bold text-lg text-black dark:text-white">{{ getCurrentPlanDisplay() }}</p>
                  </div>
                </div>
                <span class="px-3 py-1 text-sm font-bold rounded-full" [ngClass]="getPlanBadgeClass()">Active</span>
              </div>
            }
            @if (error()) {
              <div class="max-w-2xl mx-auto mb-8 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-200">
                {{ error() }}
              </div>
            }
            <div class="max-w-2xl mx-auto mb-10 p-4 border border-gray-200 rounded-xl bg-white/80 dark:bg-slate-900/60 dark:border-white/10">
              <label class="block text-sm font-bold text-gray-700 dark:text-slate-200 mb-2" for="promo-code-input">
                Have a promotion code?
              </label>
              <div class="flex flex-col md:flex-row gap-3">
                <input
                  id="promo-code-input"
                  type="text"
                  class="flex-1 px-4 py-3 rounded-lg border border-gray-300 text-sm font-semibold tracking-wide uppercase bg-white text-black placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:bg-slate-950 dark:border-white/10 dark:text-white"
                  placeholder="Enter code (e.g. NY2026MOONSHOT)"
                  [value]="promoCode()"
                  (input)="updatePromoCode($any($event.target).value)"
                  autocomplete="off"
                  spellcheck="false"
                />
                <button type="button" class="btn-accent md:w-32" (click)="redeemPromoCode()" [disabled]="!promoCode() || loading()">
                  {{ loading() ? 'Redeeming...' : 'Redeem' }}
                </button>
                <button type="button" class="btn-outline md:w-32" (click)="clearPromoCode()" [disabled]="!promoCode() || loading()">
                  Clear
                </button>
              </div>
              <p class="text-xs text-gray-500 mt-2 dark:text-slate-400">
                Promo codes are plan-specific and apply to your first month only.
              </p>
              @if (promoNotice()) {
                <p class="text-xs text-green-600 mt-2 font-semibold dark:text-green-400">
                  {{ promoNotice() }}
                </p>
              }
            </div>
            <div class="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
              <!-- Free/Launch -->
              <div class="pricing-card relative current-plan-free"
                   [class.current-plan]="isCurrentPlan('free')"
                   [class.opacity-60]="isDowngrade('free')">
                @if (isCurrentPlan('free')) {
                <div class="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-green-500 text-white text-xs font-bold rounded-full z-10 shadow-lg">
                  YOUR PLAN
                </div>
                }
                <div class="card-top">
                  <span class="rocket-emoji rocket-size-1 rocket-green">🚀</span>
                  <div class="badge bg-green-500 text-white">Free</div>
                </div>
                <div class="space-y-2">
                  <div class="title text-green-600 dark:text-green-400">Launch</div>
                  <div class="price dark:text-white">Free</div>
                  <div class="sub dark:text-slate-400">forever</div>
                  <p class="desc dark:text-slate-300">Start your journey with basic AI coaching and goal tracking.</p>
                </div>
                <ul class="features dark:text-slate-200">
                  <li><span></span>Basic goal tracking</li>
                  <li><span></span>AI coaching access</li>
                  <li><span></span>Essential reminders</li>
                </ul>
                @if (isCurrentPlan('free')) {
                <button disabled class="btn-outline opacity-50 cursor-not-allowed">Current Plan</button>
                } @else {
                <button disabled class="btn-outline opacity-50 cursor-not-allowed">Your Starting Point</button>
                }
              </div>

              <!-- Moonshot -->
              <div class="pricing-card relative current-plan-moonshot"
                   [class.highlight]="!isCurrentPlan('moonshot')"
                   [class.current-plan]="isCurrentPlan('moonshot')"
                   [class.opacity-60]="isDowngrade('moonshot')">
                @if (isCurrentPlan('moonshot')) {
                <div class="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-orange-500 text-white text-xs font-bold rounded-full z-10 shadow-lg">
                  YOUR PLAN
                </div>
                }
                <div class="card-top">
                  <span class="rocket-emoji rocket-size-2 rocket-orange">🚀</span>
                  <div class="badge bg-black text-white">Most Popular</div>
                </div>
                <div class="space-y-2">
                  <div class="title text-red-600 dark:text-red-400">Moonshot</div>
                  <div class="price dark:text-white">$9.99</div>
                  <div class="sub dark:text-slate-400">per month</div>
                  <p class="desc dark:text-slate-300">Hit your ONE thing in 30–90 day sprints with smart accountability.</p>
                </div>
                <ul class="features dark:text-slate-200">
                  <li><span></span>Custom reminders + AI encouragement</li>
                  <li><span></span>Weekly PDF + bottleneck nudges</li>
                  <li><span></span>Dynamic micro-wins + ROCKET Blast</li>
                </ul>
                @if (isCurrentPlan('moonshot')) {
                <button disabled class="btn-accent opacity-50 cursor-not-allowed">Current Plan</button>
                } @else if (canUpgradeTo('moonshot')) {
                <button (click)="selectPlan(stripePrices.moonshot)" [disabled]="loading()" class="btn-accent">
                  {{ getButtonText('moonshot') }}
                </button>
                } @else {
                <button disabled class="btn-outline opacity-50 cursor-not-allowed">Included in your plan</button>
                }
              </div>

              <!-- Interplanetary -->
              <div class="pricing-card relative current-plan-interplanetary"
                   [class.current-plan]="isCurrentPlan('interplanetary')"
                   [class.opacity-60]="isDowngrade('interplanetary')">
                @if (isCurrentPlan('interplanetary')) {
                <div class="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-red-600 text-white text-xs font-bold rounded-full z-10 shadow-lg">
                  YOUR PLAN
                </div>
                }
                <div class="card-top">
                  <span class="rocket-emoji rocket-size-3 rocket-red">🚀</span>
                  <div class="badge bg-red-600 text-white">Performance</div>
                </div>
                <div class="space-y-2">
                  <div class="title dark:text-white">Interplanetary</div>
                  <div class="price dark:text-white">$29.99</div>
                  <div class="sub dark:text-slate-400">per month</div>
                  <p class="desc dark:text-slate-300">Predictive, multi-channel coaching for high-performers.</p>
                </div>
                <ul class="features dark:text-slate-200">
                  <li><span></span>App + Email + SMS reminders</li>
                  <li><span></span>Personality-coached, predictive nudges</li>
                  <li><span></span>Deep weekly report + ROCKET Blast Pro</li>
                </ul>
                @if (isCurrentPlan('interplanetary')) {
                <button disabled class="btn-primary opacity-50 cursor-not-allowed">Current Plan</button>
                } @else if (canUpgradeTo('interplanetary')) {
                <button (click)="selectPlan(stripePrices.interplanetary)" [disabled]="loading()" class="btn-primary">
                  {{ getButtonText('interplanetary') }}
                </button>
                } @else {
                <button disabled class="btn-outline opacity-50 cursor-not-allowed">Included in your plan</button>
                }
              </div>

              <!-- Galactic -->
              <div class="pricing-card relative current-plan-galactic"
                   [class.current-plan]="isCurrentPlan('galactic')">
                @if (isCurrentPlan('galactic')) {
                <div class="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-purple-600 text-white text-xs font-bold rounded-full z-10 shadow-lg">
                  YOUR PLAN
                </div>
                }
                <div class="card-top">
                  <span class="rocket-emoji rocket-size-4 rocket-gray">🚀</span>
                  <div class="badge bg-gray-900 text-white">Elite</div>
                </div>
                <div class="space-y-2">
                  <div class="title text-gray-800 dark:text-white">Galactic</div>
                  <div class="price dark:text-white">$499</div>
                  <div class="sub dark:text-slate-400">per month</div>
                  <p class="desc dark:text-slate-300">Hybrid human + AI leadership system with elite accountability.</p>
                </div>
                <ul class="features dark:text-slate-200">
                  <li><span></span>Mentor nudges + leadership dashboards</li>
                  <li><span></span>Build templates, lead pods/masterminds</li>
                  <li><span></span>Advanced AI insights + ROCKET Blast Elite</li>
                </ul>
                @if (isCurrentPlan('galactic')) {
                <button disabled class="btn-outline opacity-50 cursor-not-allowed">Current Plan</button>
                } @else if (canUpgradeTo('galactic')) {
                <button (click)="selectPlan(stripePrices.galactic)" [disabled]="loading()" class="btn-outline dark:border-white/30 dark:text-white dark:hover:bg-white dark:hover:text-black">
                  {{ getButtonText('galactic') }}
                </button>
                } @else {
                <button disabled class="btn-outline opacity-50 cursor-not-allowed">Included in your plan</button>
                }
              </div>
            </div>

            <!-- Enterprise Card -->
            <div class="max-w-5xl mx-auto mt-12">
              <div class="pricing-card enterprise-card relative overflow-hidden">
                <div
                  class="absolute inset-0 bg-gradient-to-br from-red-600/5 via-red-600/10 to-black/5 dark:from-red-600/10 dark:via-red-600/20 dark:to-slate-900/50">
                </div>
                <div class="relative z-10">
                  <div class="card-top">
                    <span class="rocket-emoji rocket-size-5 rocket-red" style="font-size: 64px;">🚀</span>
                    <div class="badge bg-red-600 text-white animate-pulse">Enterprise</div>
                  </div>
                  <div class="space-y-3">
                    <div class="title text-red-600 dark:text-red-400" style="font-size: 16px;">5. Enterprise Consulting & Build</div>
                    <div class="price dark:text-white" style="font-size: 48px;">Custom</div>
                    <div class="sub dark:text-slate-400">Build at light speed</div>
                    <p class="desc dark:text-slate-300" style="font-size: 16px; line-height: 1.6;">
                      We build applications using AI at light speed. Custom reminder OS for enterprise, MVP development, and
                      enterprise-grade solutions tailored to your needs.
                    </p>
                  </div>
                  <div class="grid md:grid-cols-2 gap-4 my-6">
                    <div>
                      <h4 class="font-bold text-black text-sm mb-3 dark:text-white uppercase tracking-wider">What We Build
                      </h4>
                      <ul class="features dark:text-slate-200" style="gap: 8px;">
                        <li><span></span>Custom Reminder OS</li>
                        <li><span></span>MVP at Light Speed</li>
                        <li><span></span>AI-Powered Applications</li>
                      </ul>
                    </div>
                    <div>
                      <h4 class="font-bold text-black text-sm mb-3 dark:text-white uppercase tracking-wider">Enterprise Skills
                      </h4>
                      <ul class="features dark:text-slate-200" style="gap: 8px;">
                        <li><span></span>Cloud Architecture</li>
                        <li><span></span>Security & Compliance</li>
                        <li><span></span>API Integration & DevOps</li>
                      </ul>
                    </div>
                  </div>
                  <a href="mailto:missoncontrol@rocketgoals.com?subject=Enterprise Consulting Inquiry" class="btn-enterprise">
                    Contact Us to Build
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </a>
                  <p class="text-center text-sm text-black/50 dark:text-slate-400 mt-4">
                    Email: <a href="mailto:missoncontrol@rocketgoals.com"
                      class="text-red-600 hover:underline font-semibold dark:text-red-400">missoncontrol@rocketgoals.com</a>
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <!-- Loading Overlay -->
      @if (loading()) {
      <div class="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center animate-fade-in">
        <div class="bg-white dark:bg-slate-900 rounded-3xl p-12 max-w-md w-full mx-4 shadow-2xl border border-black/10 dark:border-white/10">
          <div class="text-center space-y-6">
            <div class="flex justify-center">
              <div class="w-16 h-16 border-4 border-red-100 border-t-red-600 rounded-full animate-spin"></div>
            </div>
            <div>
              <h3 class="text-2xl font-black text-black dark:text-white mb-2">Preparing Your Mission</h3>
              <p class="text-black/60 dark:text-slate-300">Setting up your checkout session...</p>
            </div>
            <div class="flex items-center justify-center gap-2 text-sm text-black/50 dark:text-slate-400">
              <svg class="w-4 h-4 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>Please wait</span>
            </div>
          </div>
        </div>
      </div>
      }

      <!-- Success Modal -->
      @if (showSuccessModal() && successModalData()) {
      <div class="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center animate-fade-in" (click)="closeSuccessModal()">
        <div class="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-lg w-full mx-4 shadow-2xl border border-black/10 dark:border-white/10 relative" (click)="$event.stopPropagation()">
          <!-- Close Button -->
          <button (click)="closeSuccessModal()" class="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors">
            <svg class="w-5 h-5 text-gray-500 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div class="text-center space-y-6">
            <!-- Success Icon -->
            <div class="flex justify-center">
              <div class="w-20 h-20 bg-gradient-to-br from-green-400 to-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-green-500/30">
                <svg class="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>

            <!-- Thank You Message -->
            <div>
              <h3 class="text-3xl font-black text-black dark:text-white mb-2">Welcome Aboard!</h3>
              <p class="text-lg text-black/60 dark:text-slate-300">Your promo code has been successfully redeemed</p>
            </div>

            <!-- Current Plan Badge -->
            <div class="inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 border border-red-200 dark:border-red-800/50 rounded-2xl">
              <span class="text-3xl">🚀</span>
              <div class="text-left">
                <p class="text-xs font-bold text-gray-500 dark:text-slate-400 uppercase tracking-wider">Your Plan</p>
                <p class="text-xl font-black text-red-600 dark:text-red-400">{{ formatPlanName(successModalData()!.plan) }}</p>
              </div>
            </div>

            <!-- Subscription Details -->
            <div class="bg-gray-50 dark:bg-slate-800 rounded-xl p-4 space-y-2">
              <div class="flex justify-between items-center text-sm">
                <span class="text-gray-500 dark:text-slate-400">Duration</span>
                <span class="font-semibold text-black dark:text-white">{{ successModalData()!.durationMonths }} month{{ successModalData()!.durationMonths !== 1 ? 's' : '' }}</span>
              </div>
              <div class="flex justify-between items-center text-sm">
                <span class="text-gray-500 dark:text-slate-400">Access Until</span>
                <span class="font-semibold text-black dark:text-white">{{ formatExpiryDate(successModalData()!.expiresAt) }}</span>
              </div>
            </div>

            <!-- Features You Now Have Access To -->
            <div class="text-left">
              <p class="text-sm font-bold text-gray-700 dark:text-slate-200 mb-3">You now have access to:</p>
              <ul class="space-y-2">
                @for (feature of getPlanFeatures(successModalData()!.plan); track feature) {
                <li class="flex items-start gap-2 text-sm text-gray-600 dark:text-slate-300">
                  <svg class="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{{ feature }}</span>
                </li>
                }
              </ul>
            </div>

            <!-- Action Button -->
            <button (click)="startExploring()" class="w-full py-4 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white font-bold rounded-xl shadow-lg shadow-red-500/30 transition-all duration-200 flex items-center justify-center gap-2">
              <span>Start Exploring</span>
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </button>

            <p class="text-xs text-gray-400 dark:text-slate-500">
              You can manage your subscription anytime from your profile
            </p>
          </div>
        </div>
      </div>
      }
    </div>
  `,
  styles: [`
    .pricing-card {
      position: relative;
      padding: 32px;
      border-radius: 24px;
      border: 1px solid rgba(0,0,0,0.08);
      background: white;
      box-shadow: 0 10px 30px rgba(0,0,0,0.06);
      display: flex;
      flex-direction: column;
      gap: 18px;
      transition: all 0.25s ease;
    }
    .pricing-card:hover {
      transform: translateY(-8px);
      box-shadow: 0 20px 40px rgba(0,0,0,0.08);
      border-color: rgba(0,0,0,0.12);
    }
    .pricing-card.highlight {
      border: 1px solid rgba(220,38,38,0.15);
      box-shadow: 0 20px 45px rgba(220,38,38,0.12);
      background: linear-gradient(145deg, rgba(255,255,255,0.98), rgba(255,245,245,0.95));
    }
    .pricing-card.current-plan {
      border: 4px solid;
      box-shadow: 0 30px 70px rgba(0,0,0,0.2), 0 0 0 6px rgba(59, 130, 246, 0.15);
      transform: scale(1.05);
      background: linear-gradient(145deg, rgba(255,255,255,1), rgba(249,250,251,0.98));
      position: relative;
      z-index: 1;
      animation: pulse-glow 2s ease-in-out infinite;
    }
    @keyframes pulse-glow {
      0%, 100% {
        box-shadow: 0 30px 70px rgba(0,0,0,0.2), 0 0 0 6px rgba(59, 130, 246, 0.15);
      }
      50% {
        box-shadow: 0 35px 80px rgba(0,0,0,0.25), 0 0 0 8px rgba(59, 130, 246, 0.25);
      }
    }
    .pricing-card.current-plan-free.current-plan {
      border-color: rgba(34, 197, 94, 0.8);
      box-shadow: 0 30px 70px rgba(34, 197, 94, 0.3), 0 0 0 6px rgba(34, 197, 94, 0.2);
      background: linear-gradient(145deg, rgba(240, 253, 244, 0.95), rgba(255,255,255,1));
      animation: pulse-glow-green 2s ease-in-out infinite;
    }
    @keyframes pulse-glow-green {
      0%, 100% {
        box-shadow: 0 30px 70px rgba(34, 197, 94, 0.3), 0 0 0 6px rgba(34, 197, 94, 0.2);
      }
      50% {
        box-shadow: 0 35px 80px rgba(34, 197, 94, 0.4), 0 0 0 8px rgba(34, 197, 94, 0.3);
      }
    }
    .pricing-card.current-plan-moonshot.current-plan {
      border-color: rgba(249, 115, 22, 0.8);
      box-shadow: 0 30px 70px rgba(249, 115, 22, 0.3), 0 0 0 6px rgba(249, 115, 22, 0.2);
      background: linear-gradient(145deg, rgba(255, 247, 237, 0.95), rgba(255,255,255,1));
      animation: pulse-glow-orange 2s ease-in-out infinite;
    }
    @keyframes pulse-glow-orange {
      0%, 100% {
        box-shadow: 0 30px 70px rgba(249, 115, 22, 0.3), 0 0 0 6px rgba(249, 115, 22, 0.2);
      }
      50% {
        box-shadow: 0 35px 80px rgba(249, 115, 22, 0.4), 0 0 0 8px rgba(249, 115, 22, 0.3);
      }
    }
    .pricing-card.current-plan-interplanetary.current-plan {
      border-color: rgba(220, 38, 38, 0.8);
      box-shadow: 0 30px 70px rgba(220, 38, 38, 0.3), 0 0 0 6px rgba(220, 38, 38, 0.2);
      background: linear-gradient(145deg, rgba(254, 242, 242, 0.95), rgba(255,255,255,1));
      animation: pulse-glow-red 2s ease-in-out infinite;
    }
    @keyframes pulse-glow-red {
      0%, 100% {
        box-shadow: 0 30px 70px rgba(220, 38, 38, 0.3), 0 0 0 6px rgba(220, 38, 38, 0.2);
      }
      50% {
        box-shadow: 0 35px 80px rgba(220, 38, 38, 0.4), 0 0 0 8px rgba(220, 38, 38, 0.3);
      }
    }
    .pricing-card.current-plan-galactic.current-plan {
      border-color: rgba(147, 51, 234, 0.8);
      box-shadow: 0 30px 70px rgba(147, 51, 234, 0.3), 0 0 0 6px rgba(147, 51, 234, 0.2);
      background: linear-gradient(145deg, rgba(250, 245, 255, 0.95), rgba(255,255,255,1));
      animation: pulse-glow-purple 2s ease-in-out infinite;
    }
    @keyframes pulse-glow-purple {
      0%, 100% {
        box-shadow: 0 30px 70px rgba(147, 51, 234, 0.3), 0 0 0 6px rgba(147, 51, 234, 0.2);
      }
      50% {
        box-shadow: 0 35px 80px rgba(147, 51, 234, 0.4), 0 0 0 8px rgba(147, 51, 234, 0.3);
      }
    }
    .card-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .icon {
      width: 44px;
      height: 44px;
      border-radius: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 10px 25px rgba(0,0,0,0.12);
    }
    .rocket-emoji {
      display: inline-block;
      transition: transform 0.3s ease, filter 0.3s ease;
    }
    .rocket-emoji:hover {
      transform: scale(1.15) rotate(-10deg);
    }
    .rocket-size-1 {
      font-size: 28px;
    }
    .rocket-size-2 {
      font-size: 36px;
    }
    .rocket-size-3 {
      font-size: 44px;
    }
    .rocket-size-4 {
      font-size: 52px;
    }
    .rocket-size-5 {
      font-size: 64px;
    }
    .rocket-green {
      filter: hue-rotate(85deg) saturate(2.5) brightness(1.1) drop-shadow(0 2px 4px rgba(0,0,0,0.15));
    }
    .rocket-orange {
      filter: hue-rotate(-25deg) saturate(3) brightness(1.1) drop-shadow(0 2px 4px rgba(0,0,0,0.15));
    }
    .rocket-red {
      filter: hue-rotate(-50deg) saturate(3.5) brightness(1) drop-shadow(0 2px 4px rgba(0,0,0,0.15));
    }
    .rocket-gray {
      filter: grayscale(1) brightness(1.2) contrast(0.9) drop-shadow(0 2px 4px rgba(0,0,0,0.15));
    }
    .badge {
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .title {
      font-size: 14px;
      font-weight: 900;
      letter-spacing: 0.2em;
      text-transform: uppercase;
    }
    .price {
      font-size: 40px;
      font-weight: 900;
      letter-spacing: -0.02em;
    }
    .sub {
      font-size: 12px;
      font-weight: 700;
      color: rgba(0,0,0,0.45);
      letter-spacing: 0.18em;
      text-transform: uppercase;
    }
    .desc {
      color: rgba(0,0,0,0.65);
      font-weight: 600;
      line-height: 1.5;
      margin-top: 6px;
    }
    .features {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 12px;
    }
    .features li {
      display: flex;
      align-items: center;
      gap: 10px;
      color: rgba(0,0,0,0.8);
      font-weight: 600;
    }
    .features li span {
      width: 10px;
      height: 10px;
      border-radius: 999px;
      background: #dc2626;
      box-shadow: 0 0 0 6px rgba(220,38,38,0.08);
      flex-shrink: 0;
    }
    :host-context(.dark) .pricing-card {
      background: rgba(15,23,42,0.85);
      border: 1px solid rgba(148,163,184,0.35);
      box-shadow: 0 30px 60px rgba(2,6,23,0.7);
    }
    :host-context(.dark) .pricing-card.highlight {
      background: linear-gradient(145deg, rgba(30,41,59,0.95), rgba(15,23,42,0.9));
      border-color: rgba(248,113,113,0.35);
      box-shadow: 0 35px 70px rgba(248,113,113,0.25);
    }
    :host-context(.dark) .pricing-card.current-plan {
      border: 4px solid;
      box-shadow: 0 30px 70px rgba(0,0,0,0.6), 0 0 0 6px rgba(59, 130, 246, 0.25);
      transform: scale(1.05);
      background: linear-gradient(145deg, rgba(30,41,59,1), rgba(15,23,42,0.98));
      animation: pulse-glow-dark 2s ease-in-out infinite;
    }
    @keyframes pulse-glow-dark {
      0%, 100% {
        box-shadow: 0 30px 70px rgba(0,0,0,0.6), 0 0 0 6px rgba(59, 130, 246, 0.25);
      }
      50% {
        box-shadow: 0 35px 80px rgba(0,0,0,0.7), 0 0 0 8px rgba(59, 130, 246, 0.35);
      }
    }
    :host-context(.dark) .pricing-card.current-plan-free.current-plan {
      border-color: rgba(34, 197, 94, 0.8);
      box-shadow: 0 30px 70px rgba(34, 197, 94, 0.4), 0 0 0 6px rgba(34, 197, 94, 0.25);
      background: linear-gradient(145deg, rgba(20, 83, 45, 0.3), rgba(15,23,42,0.98));
      animation: pulse-glow-green-dark 2s ease-in-out infinite;
    }
    @keyframes pulse-glow-green-dark {
      0%, 100% {
        box-shadow: 0 30px 70px rgba(34, 197, 94, 0.4), 0 0 0 6px rgba(34, 197, 94, 0.25);
      }
      50% {
        box-shadow: 0 35px 80px rgba(34, 197, 94, 0.5), 0 0 0 8px rgba(34, 197, 94, 0.35);
      }
    }
    :host-context(.dark) .pricing-card.current-plan-moonshot.current-plan {
      border-color: rgba(249, 115, 22, 0.8);
      box-shadow: 0 30px 70px rgba(249, 115, 22, 0.4), 0 0 0 6px rgba(249, 115, 22, 0.25);
      background: linear-gradient(145deg, rgba(154, 52, 18, 0.3), rgba(15,23,42,0.98));
      animation: pulse-glow-orange-dark 2s ease-in-out infinite;
    }
    @keyframes pulse-glow-orange-dark {
      0%, 100% {
        box-shadow: 0 30px 70px rgba(249, 115, 22, 0.4), 0 0 0 6px rgba(249, 115, 22, 0.25);
      }
      50% {
        box-shadow: 0 35px 80px rgba(249, 115, 22, 0.5), 0 0 0 8px rgba(249, 115, 22, 0.35);
      }
    }
    :host-context(.dark) .pricing-card.current-plan-interplanetary.current-plan {
      border-color: rgba(220, 38, 38, 0.8);
      box-shadow: 0 30px 70px rgba(220, 38, 38, 0.4), 0 0 0 6px rgba(220, 38, 38, 0.25);
      background: linear-gradient(145deg, rgba(153, 27, 27, 0.3), rgba(15,23,42,0.98));
      animation: pulse-glow-red-dark 2s ease-in-out infinite;
    }
    @keyframes pulse-glow-red-dark {
      0%, 100% {
        box-shadow: 0 30px 70px rgba(220, 38, 38, 0.4), 0 0 0 6px rgba(220, 38, 38, 0.25);
      }
      50% {
        box-shadow: 0 35px 80px rgba(220, 38, 38, 0.5), 0 0 0 8px rgba(220, 38, 38, 0.35);
      }
    }
    :host-context(.dark) .pricing-card.current-plan-galactic.current-plan {
      border-color: rgba(147, 51, 234, 0.8);
      box-shadow: 0 30px 70px rgba(147, 51, 234, 0.4), 0 0 0 6px rgba(147, 51, 234, 0.25);
      background: linear-gradient(145deg, rgba(88, 28, 135, 0.3), rgba(15,23,42,0.98));
      animation: pulse-glow-purple-dark 2s ease-in-out infinite;
    }
    @keyframes pulse-glow-purple-dark {
      0%, 100% {
        box-shadow: 0 30px 70px rgba(147, 51, 234, 0.4), 0 0 0 6px rgba(147, 51, 234, 0.25);
      }
      50% {
        box-shadow: 0 35px 80px rgba(147, 51, 234, 0.5), 0 0 0 8px rgba(147, 51, 234, 0.35);
      }
    }
    :host-context(.dark) .pricing-card .sub,
    :host-context(.dark) .pricing-card .desc,
    :host-context(.dark) .pricing-card .features li {
      color: rgba(226,232,240,0.8);
    }
    :host-context(.dark) .pricing-card .btn-primary,
    :host-context(.dark) .pricing-card .btn-accent {
      box-shadow: 0 20px 45px rgba(2,6,23,0.6);
    }
    .btn-primary, .btn-accent, .btn-outline {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      padding: 14px 16px;
      border-radius: 14px;
      font-weight: 800;
      transition: all 0.2s ease;
      text-decoration: none;
      border: none;
      cursor: pointer;
    }
    .btn-primary {
      background: black;
      color: white;
      box-shadow: 0 12px 30px rgba(0,0,0,0.15);
    }
    .btn-primary:hover:not(:disabled) { background: #111; transform: translateY(-2px); }
    .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-accent {
      background: #dc2626;
      color: white;
      box-shadow: 0 12px 30px rgba(220,38,38,0.18);
    }
    .btn-accent:hover:not(:disabled) { background: #b91c1c; transform: translateY(-2px); }
    .btn-accent:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-outline {
      border: 2px solid rgba(0,0,0,0.1);
      color: black;
      background: white;
    }
    .btn-outline:hover { background: black; color: white; transform: translateY(-2px); }
    .enterprise-card {
      padding: 48px;
      border: 2px solid rgba(220, 38, 38, 0.2);
      box-shadow: 0 20px 60px rgba(220, 38, 38, 0.15), 0 0 0 1px rgba(220, 38, 38, 0.1);
      transform: scale(1.02);
    }
    .enterprise-card:hover {
      transform: translateY(-12px) scale(1.03);
      box-shadow: 0 30px 80px rgba(220, 38, 38, 0.25), 0 0 0 1px rgba(220, 38, 38, 0.2);
      border-color: rgba(220, 38, 38, 0.4);
    }
    .btn-enterprise {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      padding: 18px 24px;
      border-radius: 16px;
      font-weight: 900;
      font-size: 18px;
      transition: all 0.3s ease;
      text-decoration: none;
      background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%);
      color: white;
      box-shadow: 0 15px 40px rgba(220, 38, 38, 0.3);
      gap: 8px;
      border: none;
      cursor: pointer;
    }
    .btn-enterprise:hover {
      background: linear-gradient(135deg, #b91c1c 0%, #991b1b 100%);
      transform: translateY(-3px);
      box-shadow: 0 20px 50px rgba(220, 38, 38, 0.4);
    }
    :host-context(.dark) .enterprise-card {
      background: linear-gradient(145deg, rgba(30,41,59,0.95), rgba(15,23,42,0.9));
      border-color: rgba(248,113,113,0.4);
      box-shadow: 0 30px 80px rgba(248,113,113,0.25), 0 0 0 1px rgba(248,113,113,0.2);
    }
    :host-context(.dark) .enterprise-card:hover {
      border-color: rgba(248,113,113,0.6);
      box-shadow: 0 40px 100px rgba(248,113,113,0.35), 0 0 0 1px rgba(248,113,113,0.3);
    }
    @keyframes fade-in {
      from {
        opacity: 0;
      }
      to {
        opacity: 1;
      }
    }
    .animate-fade-in {
      animation: fade-in 0.2s ease-in-out;
    }
  `]
})
export class PricingPageComponent implements OnInit {
  private readonly theme = inject(ThemeService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly isDarkMode = this.theme.isDarkMode;
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  readonly promoCode = signal('');
  readonly promoNotice = signal<string | null>(null);
  protected readonly stripePrices = stripePrices;

  // Success modal state
  protected readonly showSuccessModal = signal(false);
  protected readonly successModalData = signal<{
    plan: string;
    durationMonths: number;
    expiresAt: string;
  } | null>(null);

  // Plan hierarchy for upgrade logic
  private readonly planHierarchy: Record<string, number> = {
    'free': 0,
    'moonshot': 1,
    'interplanetary': 2,
    'galactic': 3
  };
  private readonly promoCodePlanMap = signal<Record<string, string>>({
    'NY2026MOONSHOT': 'moonshot',
    'NY2026INTERPLANETARY': 'interplanetary',
    'NY2026GALACTIC': 'galactic'
  });
  private firestorePromise?: Promise<import('firebase/firestore').Firestore>;

  async ngOnInit() {
    await this.loadPromoCodes();
  }

  private async ensureFirestore() {
    if (!this.firestorePromise) {
      this.firestorePromise = (async () => {
        const appModule = await import('firebase/app');
        const firestoreModule = await import('firebase/firestore');
        const app =
          appModule.getApps().length === 0
            ? appModule.initializeApp(firebaseConfig)
            : appModule.getApp();
        return firestoreModule.getFirestore(app);
      })();
    }
    return this.firestorePromise;
  }

  private async loadPromoCodes() {
    try {
      const firestore = await this.ensureFirestore();
      const firestoreModule = await import('firebase/firestore');
      const docRef = firestoreModule.doc(firestore, 'adminSettings', 'promoCodes');
      const docSnap = await firestoreModule.getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        const result: Record<string, string> = {};

        // Helper to extract codes from either array or legacy string format
        const extractCodes = (tierData: unknown, tierName: string) => {
          if (Array.isArray(tierData)) {
            // New array format: [{code: 'CODE1', usageCount: 0, durationMonths: 1}, ...]
            tierData.forEach((item: { code?: string }) => {
              if (item.code) {
                result[item.code.toUpperCase()] = tierName;
              }
            });
          } else if (typeof tierData === 'string' && tierData) {
            // Legacy single code format
            result[tierData.toUpperCase()] = tierName;
          }
        };

        extractCodes(data['moonshot'], 'moonshot');
        extractCodes(data['interplanetary'], 'interplanetary');
        extractCodes(data['galactic'], 'galactic');

        // Only update if we found at least one code
        if (Object.keys(result).length > 0) {
          this.promoCodePlanMap.set(result);
        }
      }
    } catch (err) {
      console.error('Failed to load promo codes from Firestore, using defaults:', err);
      // Keep default values on error
    }
  }
  private readonly priceIdPlanMap: Record<string, string> = {
    [stripePrices.moonshot]: 'moonshot',
    [stripePrices.interplanetary]: 'interplanetary',
    [stripePrices.galactic]: 'galactic'
  };

  protected toggleDarkMode() {
    this.theme.toggleDarkMode();
  }

  updatePromoCode(value: string) {
    const normalized = value.toUpperCase().replace(/\s+/g, '');
    this.promoCode.set(normalized);
    this.promoNotice.set(null);
    if (this.error()) {
      this.error.set(null);
    }
  }

  clearPromoCode() {
    this.promoCode.set('');
    this.promoNotice.set(null);
    if (this.error()) {
      this.error.set(null);
    }
  }

  getCurrentPlan(): string | null {
    const profile = this.authService.profile();
    const plan = profile?.subscriptionPlan;
    // If no subscription plan, user is on free plan
    return plan || 'free';
  }

  getCurrentPlanDisplay(): string {
    const plan = this.getCurrentPlan();
    if (!plan) return 'Free';
    const planNames: Record<string, string> = {
      'free': 'Free',
      'moonshot': 'Moonshot',
      'interplanetary': 'Interplanetary',
      'galactic': 'Galactic'
    };
    return planNames[plan] || plan;
  }

  isCurrentPlan(planKey: string): boolean {
    const currentPlan = this.getCurrentPlan();
    // Handle 'free' plan - it's the default when subscriptionPlan is null/undefined
    if (planKey === 'free') {
      const profile = this.authService.profile();
      return !profile?.subscriptionPlan;
    }
    return currentPlan === planKey;
  }

  canUpgradeTo(planKey: string): boolean {
    const currentPlan = this.getCurrentPlan();
    if (!currentPlan) return true; // No plan, can subscribe to any
    const currentLevel = this.planHierarchy[currentPlan] || 0;
    const targetLevel = this.planHierarchy[planKey] || 0;
    return targetLevel > currentLevel;
  }

  isDowngrade(planKey: string): boolean {
    const currentPlan = this.getCurrentPlan();
    if (!currentPlan) return false;
    const currentLevel = this.planHierarchy[currentPlan] || 0;
    const targetLevel = this.planHierarchy[planKey] || 0;
    return targetLevel < currentLevel;
  }

  hasActiveSubscription(): boolean {
    const profile = this.authService.profile();
    const status = profile?.subscriptionStatus;
    return status === 'active' || status === 'canceling';
  }

  getButtonText(planKey: string): string {
    if (this.loading()) return 'Processing...';
    if (this.isCurrentPlan(planKey)) return 'Current Plan';
    if (this.canUpgradeTo(planKey)) {
      return this.hasActiveSubscription() ? `Upgrade to ${this.getPlanName(planKey)}` : `Start ${this.getPlanName(planKey)}`;
    }
    return 'Included in your plan';
  }

  getPlanName(planKey: string): string {
    const names: Record<string, string> = {
      'free': 'Free',
      'moonshot': 'Moonshot',
      'interplanetary': 'Interplanetary',
      'galactic': 'Galactic'
    };
    return names[planKey] || planKey;
  }

  getPlanBadgeClass(): string {
    const plan = this.getCurrentPlan();
    switch (plan) {
      case 'free': return 'bg-green-500 text-white';
      case 'moonshot': return 'bg-orange-500 text-white';
      case 'interplanetary': return 'bg-red-600 text-white';
      case 'galactic': return 'bg-purple-600 text-white';
      default: return 'bg-gray-500 text-white';
    }
  }

  async redeemPromoCode() {
    const promoCode = this.promoCode().trim().toUpperCase();
    const promoPlan = this.promoCodePlanMap()[promoCode];

    if (!promoPlan) {
      this.error.set('Invalid promo code. Enter a valid code first.');
      return;
    }

    const profile = this.authService.profile();
    if (!profile) {
      this.router.navigate(['/signup']);
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const appModule = await import('firebase/app');
      const functionsModule = await import('firebase/functions');
      const { firebaseConfig } = await import('../../environments/environment');

      const app = appModule.getApps().length === 0
        ? appModule.initializeApp(firebaseConfig)
        : appModule.getApp();

      const functions = functionsModule.getFunctions(app, 'us-central1');
      const redeemPromoCodeFn = functionsModule.httpsCallable(functions, 'redeemPromoCode');

      const result = await redeemPromoCodeFn({ promoCode });
      const data = result.data as { success: boolean; plan: string; durationMonths: number; expiresAt: string; message: string };

      if (data.success) {
        // Refresh the user profile to get the updated subscription
        await this.authService.refreshProfile();
        this.promoCode.set('');
        // Show success modal instead of navigating
        this.successModalData.set({
          plan: data.plan,
          durationMonths: data.durationMonths,
          expiresAt: data.expiresAt
        });
        this.showSuccessModal.set(true);
      }
    } catch (err: any) {
      console.error('Error redeeming promo code:', err);
      const errorMessage = err?.message || err?.details?.message || 'Failed to redeem promo code. Please try again.';
      this.error.set(errorMessage);
    } finally {
      this.loading.set(false);
    }
  }

  async selectPlan(priceId: string) {
    const profile = this.authService.profile();
    const planKey = this.priceIdPlanMap[priceId];
    const promoCode = this.promoCode().trim().toUpperCase();
    const promoPlan = promoCode ? this.promoCodePlanMap()[promoCode] : null;

    // Check if user is logged in
    if (!profile) {
      // Redirect to signup/login
      this.router.navigate(['/signup']);
      return;
    }

    if (!planKey) {
      this.error.set('Unknown plan selected. Please try again.');
      return;
    }

    if (promoCode && !promoPlan) {
      this.error.set('Invalid promotion code for the selected plan.');
      this.promoNotice.set(null);
      return;
    }

    if (promoPlan && promoPlan !== planKey) {
      this.error.set(`Promotion code only applies to ${this.getPlanName(promoPlan)}.`);
      this.promoNotice.set(null);
      return;
    }

    // Set loading immediately for all plan upgrades (Moonshot, Interplanetary, Galactic)
    this.loading.set(true);
    this.error.set(null);
    
    // Small delay to ensure UI updates and loading screen appears
    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      // Import Firebase modules
      const appModule = await import('firebase/app');
      const functionsModule = await import('firebase/functions');
      const { firebaseConfig } = await import('../../environments/environment');

      const app = appModule.getApps().length === 0
        ? appModule.initializeApp(firebaseConfig)
        : appModule.getApp();

      const functions = functionsModule.getFunctions(app, 'us-central1');
      const createCheckoutSession = functionsModule.httpsCallable(functions, 'createCheckoutSession');

      // Call the cloud function to create a Stripe checkout session
      const result = await createCheckoutSession({
        priceId,
        promoCode: promoCode || undefined,
        successUrl: window.location.origin + '/goals?payment=success',
        cancelUrl: window.location.origin + '/pricing?payment=cancelled'
      });

      const data = result.data as { sessionId?: string; url?: string };

      if (data.url) {
        // Redirect to Stripe Checkout
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned');
      }
    } catch (err: any) {
      console.error('Error creating checkout session:', err);
      this.error.set('Failed to start checkout. Please try again.');
    } finally {
      this.loading.set(false);
    }
  }

  closeSuccessModal() {
    this.showSuccessModal.set(false);
    this.successModalData.set(null);
  }

  startExploring() {
    this.closeSuccessModal();
    this.router.navigate(['/goals']);
  }

  formatPlanName(plan: string): string {
    return plan.charAt(0).toUpperCase() + plan.slice(1);
  }

  formatExpiryDate(isoDate: string): string {
    const date = new Date(isoDate);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  getPlanFeatures(plan: string): string[] {
    const features: Record<string, string[]> = {
      moonshot: [
        'Custom reminders + AI encouragement',
        'Weekly PDF + bottleneck nudges',
        'Dynamic micro-wins + ROCKET Blast'
      ],
      interplanetary: [
        'App + Email + SMS reminders',
        'Personality-coached, predictive nudges',
        'Deep weekly report + ROCKET Blast Pro'
      ],
      galactic: [
        'Dedicated AI coaching sessions',
        'Unlimited goals + team features',
        'Priority support + custom integrations'
      ]
    };
    return features[plan] || [];
  }
}

import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AvatarDropdownComponent } from './avatar-dropdown.component';

@Component({
  selector: 'app-pricing-page',
  standalone: true,
  imports: [RouterModule, CommonModule, AvatarDropdownComponent],
  template: `
    <div class="min-h-screen bg-white text-black flex flex-col">
      <header class="relative z-40 px-6 md:px-8 py-6 flex-none border-b border-gray-200/50 bg-white/90 backdrop-blur-xl">
        <div class="flex items-center justify-between max-w-7xl mx-auto w-full gap-6">
          <a routerLink="/goals" class="flex items-center gap-3 group flex-none">
            <div class="relative">
              <div
                class="absolute -inset-1 bg-gradient-to-r from-red-600 to-black rounded-full blur opacity-20 group-hover:opacity-40 transition duration-500">
              </div>
              <img src="/assets/rocket-goals.png" alt="Rocket Goals"
                class="relative w-14 h-14 md:w-16 md:h-16 object-contain transform group-hover:scale-105 transition-transform" />
            </div>
            <span class="text-2xl md:text-3xl font-black tracking-tighter text-black hidden sm:block">
              ROCKET<span class="text-red-600">GOALS</span>
            </span>
          </a>
          <div class="flex-1 flex items-center justify-center gap-6">
            <a routerLink="/goals" routerLinkActive="text-red-600 border-b-2 border-red-600"
              class="pb-1 text-sm font-bold text-black/80 hover:text-red-600 transition-colors uppercase tracking-wide inline-flex items-center gap-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              Home
            </a>
            <a routerLink="/ai" routerLinkActive="text-red-600 border-b-2 border-red-600"
              class="pb-1 text-sm font-bold text-black/80 hover:text-red-600 transition-colors uppercase tracking-wide inline-flex items-center gap-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              AI
            </a>
            <a routerLink="/profile" routerLinkActive="text-red-600 border-b-2 border-red-600"
              class="pb-1 text-sm font-bold text-black/80 hover:text-red-600 transition-colors uppercase tracking-wide inline-flex items-center gap-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Profile
            </a>
          </div>
          <div class="flex items-center gap-3 flex-none">
            <app-avatar-dropdown />
          </div>
        </div>
      </header>

      <main class="flex-1">
        <section class="relative overflow-hidden">
          <div class="absolute inset-0 opacity-20 pointer-events-none">
            <div class="absolute top-[-200px] left-[-200px] w-[600px] h-[600px] bg-red-600/15 rounded-full blur-[140px]"></div>
            <div class="absolute bottom-[-200px] right-[-150px] w-[500px] h-[500px] bg-black/10 rounded-full blur-[120px]"></div>
          </div>

          <div class="container mx-auto px-6 py-16 relative z-10 space-y-10 text-center">
            <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-100 border border-gray-200">
              <span class="w-2 h-2 bg-red-600 rounded-full animate-pulse"></span>
              <span class="text-xs font-bold text-gray-600 tracking-wider uppercase">Pricing</span>
            </div>
            <h1 class="text-4xl md:text-6xl font-black tracking-tight leading-tight">
              Pick the mission that matches your orbit
            </h1>
            <p class="text-lg md:text-xl text-black/60 max-w-3xl mx-auto">
              Emotionally intelligent reminders, predictive coaching, and accountability built for every stage of your journey.
            </p>
          </div>
        </section>

        <section class="pb-20">
          <div class="container mx-auto px-6">
            <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
              <!-- Launch -->
              <div class="pricing-card">
                <div class="card-top">
                  <span class="rocket-emoji rocket-size-1 rocket-green">🚀</span>
                  <div class="badge bg-gray-900 text-white">Free</div>
                </div>
                <div class="space-y-2">
                  <div class="title">1. Launch Mode</div>
                  <div class="price">Free</div>
                  <div class="sub">Activate momentum</div>
                  <p class="desc">Early wins and streaks to feel momentum fast.</p>
                </div>
                <ul class="features">
                  <li><span></span>Daily alignment + micro-wins</li>
                  <li><span></span>Mood slider + weekly reset</li>
                  <li><span></span>Starter dashboard, streaks, mini Blast</li>
                </ul>
                <a routerLink="/signup" class="btn-primary">Start Free</a>
              </div>

              <!-- Moonshot -->
              <div class="pricing-card highlight">
                <div class="card-top">
                  <span class="rocket-emoji rocket-size-2 rocket-orange">🚀</span>
                  <div class="badge bg-black text-white">Most Popular</div>
                </div>
                <div class="space-y-2">
                  <div class="title text-red-600">2. Moonshot</div>
                  <div class="price">$9.99</div>
                  <div class="sub">per month</div>
                  <p class="desc">Hit your ONE thing in 30–90 day sprints with smart accountability.</p>
                </div>
                <ul class="features">
                  <li><span></span>Custom reminders + AI encouragement</li>
                  <li><span></span>Weekly PDF + bottleneck nudges</li>
                  <li><span></span>Dynamic micro-wins + ROCKET Blast</li>
                </ul>
                <a routerLink="/signup" class="btn-accent">Start Moonshot</a>
              </div>

              <!-- Interplanetary -->
              <div class="pricing-card">
                <div class="card-top">
                  <span class="rocket-emoji rocket-size-3 rocket-red">🚀</span>
                  <div class="badge bg-red-600 text-white">Performance</div>
                </div>
                <div class="space-y-2">
                  <div class="title">3. Interplanetary</div>
                  <div class="price">$29.99</div>
                  <div class="sub">per month</div>
                  <p class="desc">Predictive, multi-channel coaching for high-performers.</p>
                </div>
                <ul class="features">
                  <li><span></span>App + Email + SMS reminders</li>
                  <li><span></span>Personality-coached, predictive nudges</li>
                  <li><span></span>Deep weekly report + ROCKET Blast Pro</li>
                </ul>
                <a routerLink="/signup" class="btn-primary">Upgrade to Interplanetary</a>
              </div>

              <!-- Galactic -->
              <div class="pricing-card">
                <div class="card-top">
                  <span class="rocket-emoji rocket-size-4 rocket-gray">🚀</span>
                  <div class="badge bg-gray-900 text-white">Elite</div>
                </div>
                <div class="space-y-2">
                  <div class="title text-gray-800">4. Galactic</div>
                  <div class="price">$499</div>
                  <div class="sub">per month</div>
                  <p class="desc">Hybrid human + AI leadership system with elite accountability.</p>
                </div>
                <ul class="features">
                  <li><span></span>Mentor nudges + leadership dashboards</li>
                  <li><span></span>Build templates, lead pods/masterminds</li>
                  <li><span></span>Advanced AI insights + ROCKET Blast Elite</li>
                </ul>
                <a routerLink="/contact" class="btn-outline">Talk to Sales</a>
              </div>
            </div>
          </div>
        </section>
      </main>
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
    }
    .btn-primary {
      background: black;
      color: white;
      box-shadow: 0 12px 30px rgba(0,0,0,0.15);
    }
    .btn-primary:hover { background: #111; transform: translateY(-2px); }
    .btn-accent {
      background: #dc2626;
      color: white;
      box-shadow: 0 12px 30px rgba(220,38,38,0.18);
    }
    .btn-accent:hover { background: #b91c1c; transform: translateY(-2px); }
    .btn-outline {
      border: 2px solid rgba(0,0,0,0.1);
      color: black;
      background: white;
    }
    .btn-outline:hover { background: black; color: white; transform: translateY(-2px); }
  `]
})
export class PricingPageComponent { }


import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-pricing-page',
  standalone: true,
  imports: [RouterModule],
  template: `
    <div class="min-h-screen bg-white text-black flex flex-col">
      <header class="border-b border-black/5">
        <div class="container mx-auto px-6 py-5 flex items-center justify-between">
          <a routerLink="/" class="flex items-center gap-3 group">
            <div class="relative w-12 h-12">
              <div class="absolute -inset-1 bg-gradient-to-r from-red-600 to-black rounded-full blur opacity-20 group-hover:opacity-40 transition"></div>
              <img src="/assets/rocket-goals.png" alt="Rocket Goals" class="relative w-12 h-12 object-contain" />
            </div>
            <span class="text-xl font-black tracking-tighter">ROCKET<span class="text-red-600">GOALS</span></span>
          </a>
          <div class="flex items-center gap-3">
            <a routerLink="/login" class="px-4 py-2 text-sm font-bold rounded-full border border-black/10 hover:border-black transition">Log in</a>
            <a routerLink="/signup" class="px-4 py-2 bg-black text-white text-sm font-bold rounded-full hover:bg-red-600 transition shadow-lg">Start Free</a>
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
                  <div class="icon bg-gray-900 text-white">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2l3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z" />
                    </svg>
                  </div>
                  <div class="badge bg-gray-900 text-white">Free</div>
                </div>
                <div class="space-y-2">
                  <div class="title">Launch Mode</div>
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
                  <div class="icon bg-red-600 text-white">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2l5 5-5 5-5-5z" />
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 12l-2 8 2-2 2 2-2-8z" />
                    </svg>
                  </div>
                  <div class="badge bg-black text-white">Most Popular</div>
                </div>
                <div class="space-y-2">
                  <div class="title text-red-600">Moonshot</div>
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
                  <div class="icon bg-gradient-to-br from-black via-gray-800 to-red-600 text-white">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </div>
                  <div class="badge bg-red-600 text-white">Performance</div>
                </div>
                <div class="space-y-2">
                  <div class="title">Interplanetary</div>
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
                  <div class="icon bg-black text-white">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3l7 7 7-7M5 21l7-7 7 7" />
                    </svg>
                  </div>
                  <div class="badge bg-gray-900 text-white">Elite</div>
                </div>
                <div class="space-y-2">
                  <div class="title text-gray-800">Galactic</div>
                  <div class="price">$799</div>
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
export class PricingPageComponent {}


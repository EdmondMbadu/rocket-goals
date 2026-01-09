// Shared types for launchpad components

export interface LaunchpadTemplate {
  id: string;
  name: string;
  tagline: string;
  description: string;
  icon: string;
  imageUrl: string;
  coPilotAvatar: string;
  coPilotName: string;
  coPilotRole: string;
  color: string;
  category: string;
  accentColor: string;
  gradientFrom: string;
  gradientVia: string;
  gradientTo: string;
  features: string[];
  defaultGoals: {
    primaryGoal: string;
    theme: string;
    dailyEffort: string;
    objectives: string[];
  };
}

export const LAUNCHPAD_TEMPLATES: Record<string, LaunchpadTemplate> = {
  'hustle-orbit': {
    id: 'hustle-orbit',
    name: 'HustleOrbit',
    tagline: 'Solopreneur & Indie Hacker execution co-pilot.',
    description: 'Build your indie empire with focused execution. Track product launches, customer acquisition, and revenue milestones. Designed for makers who ship fast and iterate faster.',
    icon: '🚀',
    imageUrl: '/assets/app-suite/hustle-orbit.png',
    coPilotAvatar: '/assets/ogilvy.jpg',
    coPilotName: 'Marcus Chen',
    coPilotRole: 'Business strategist inspired by David Ogilvy and Alex Hormozi. Guides positioning, offers, and revenue growth.',
    color: 'from-slate-900 via-slate-800 to-slate-900',
    category: 'Business',
    accentColor: '#f97316',
    gradientFrom: '#0f172a',
    gradientVia: '#1e293b',
    gradientTo: '#0f172a',
    features: [
      'AI-powered product launch planning',
      'Revenue milestone tracking',
      'Customer acquisition analytics',
      'Weekly sprint reviews',
      'Indie hacker community insights',
      'MRR goal optimization'
    ],
    defaultGoals: {
      primaryGoal: 'Launch and grow my indie product',
      theme: 'career',
      dailyEffort: '1hour',
      objectives: ['Ship features', 'Grow audience', 'Generate revenue']
    }
  },
  'opti-human': {
    id: 'opti-human',
    name: 'OptiHuman',
    tagline: 'Biohacker performance & health optimization.',
    description: 'Optimize your biology for peak performance. Track sleep, nutrition, exercise, and cognitive enhancement protocols with AI-driven insights.',
    icon: '🧬',
    imageUrl: '/assets/app-suite/opti-human.png',
    coPilotAvatar: '/assets/a-2.jpg',
    coPilotName: 'Dr. Elena Vance',
    coPilotRole: 'Human Performance Lead',
    color: 'from-indigo-950 via-purple-900 to-indigo-900',
    category: 'Health',
    accentColor: '#8b5cf6',
    gradientFrom: '#1e1b4b',
    gradientVia: '#581c87',
    gradientTo: '#312e81',
    features: [
      'Sleep quality analysis',
      'Nutrition optimization protocols',
      'Cognitive enhancement tracking',
      'Energy level monitoring',
      'Biometric data insights',
      'Recovery optimization'
    ],
    defaultGoals: {
      primaryGoal: 'Optimize my health and performance',
      theme: 'health',
      dailyEffort: '30min',
      objectives: ['Sleep optimization', 'Nutrition tracking', 'Energy management']
    }
  },
  'marketing-maven': {
    id: 'marketing-maven',
    name: 'MarketingMaven',
    tagline: 'Campaign strategist for consistent growth.',
    description: 'Plan sharper marketing moves after hours. Track experiments, conversions, and brand momentum with focused time blocks.',
    icon: '🌙',
    imageUrl: '/assets/app-suite/moonlight-maker.png',
    coPilotAvatar: '/assets/a-3.jpg',
    coPilotName: 'Sarah Jenkins',
    coPilotRole: 'Growth Marketing Coach',
    color: 'from-blue-950 via-indigo-950 to-slate-900',
    category: 'Business',
    accentColor: '#6366f1',
    gradientFrom: '#172554',
    gradientVia: '#1e1b4b',
    gradientTo: '#0f172a',
    features: [
      'Campaign planning sprints',
      'Experiment tracking',
      'Conversion lift dashboards',
      'Audience growth playbooks',
      'Brand positioning checklists',
      'Channel scaling milestones'
    ],
    defaultGoals: {
      primaryGoal: 'Build a profitable marketing engine',
      theme: 'career',
      dailyEffort: '1hour',
      objectives: ['Run experiments', 'Improve conversion', 'Scale channels']
    }
  },
  'pipeline-pilot': {
    id: 'pipeline-pilot',
    name: 'PipelinePilot',
    tagline: 'Real Estate & Sales Pro deal accelerator.',
    description: 'Close more deals and grow your pipeline. Track leads, follow-ups, and revenue targets with precision-engineered sales intelligence.',
    icon: '📈',
    imageUrl: '/assets/app-suite/pipeline-pilot.png',
    coPilotAvatar: '/assets/a-4.jpg',
    coPilotName: 'David Ross',
    coPilotRole: 'Sales Strategy Expert',
    color: 'from-emerald-950 via-teal-900 to-cyan-950',
    category: 'Sales',
    accentColor: '#10b981',
    gradientFrom: '#022c22',
    gradientVia: '#134e4a',
    gradientTo: '#083344',
    features: [
      'Deal pipeline visualization',
      'Lead scoring automation',
      'Follow-up cadence optimization',
      'Commission tracking',
      'Client relationship insights',
      'Revenue forecasting'
    ],
    defaultGoals: {
      primaryGoal: 'Close more deals and grow revenue',
      theme: 'finance',
      dailyEffort: '2hours',
      objectives: ['Lead generation', 'Follow-up cadence', 'Deal closing']
    }
  },
  'apex-ascend': {
    id: 'apex-ascend',
    name: 'ApexAscend',
    tagline: 'Corporate Climber leadership & strategy.',
    description: 'Advance your corporate career with strategic moves. Track promotions, skill building, and leadership development with executive coaching AI.',
    icon: '⛰️',
    imageUrl: '/assets/app-suite/apex-ascend.png',
    coPilotAvatar: '/assets/a-5.jpg',
    coPilotName: 'Robert Sterling',
    coPilotRole: 'Executive Coach',
    color: 'from-slate-900 via-blue-950 to-indigo-950',
    category: 'Career',
    accentColor: '#3b82f6',
    gradientFrom: '#0f172a',
    gradientVia: '#172554',
    gradientTo: '#1e1b4b',
    features: [
      'Promotion pathway planning',
      'Leadership skill development',
      'Executive presence coaching',
      'Strategic networking',
      'Visibility project tracking',
      'Salary negotiation prep'
    ],
    defaultGoals: {
      primaryGoal: 'Advance my corporate career',
      theme: 'career',
      dailyEffort: '30min',
      objectives: ['Visibility projects', 'Networking', 'Skill development']
    }
  },
  'creator-craft': {
    id: 'creator-craft',
    name: 'CreatorCraft',
    tagline: 'Creative Freelancer project completion tool.',
    description: 'Ship creative projects on time. Track client work, personal projects, and portfolio building with creative flow optimization.',
    icon: '🎨',
    imageUrl: '/assets/app-suite/creator-craft.png',
    coPilotAvatar: '/assets/a-6.jpg',
    coPilotName: 'Maya Rivera',
    coPilotRole: 'Creative Director',
    color: 'from-orange-950 via-amber-900 to-yellow-950',
    category: 'Creative',
    accentColor: '#f59e0b',
    gradientFrom: '#431407',
    gradientVia: '#78350f',
    gradientTo: '#422006',
    features: [
      'Creative project pipeline',
      'Client deliverable tracking',
      'Portfolio curation',
      'Creative flow optimization',
      'Rate optimization',
      'Inspiration archives'
    ],
    defaultGoals: {
      primaryGoal: 'Complete creative projects consistently',
      theme: 'career',
      dailyEffort: '2hours',
      objectives: ['Client deliverables', 'Portfolio pieces', 'Skill growth']
    }
  },
  'neuro-nexus': {
    id: 'neuro-nexus',
    name: 'NeuroNexus',
    tagline: 'AI Early Adopter neural network coaching.',
    description: 'Master AI tools and stay ahead of the curve. Track learning, experiments, and AI project implementations with cutting-edge insights.',
    icon: '🧠',
    imageUrl: '/assets/app-suite/opti-human.png',
    coPilotAvatar: '/assets/a-7.jpg',
    coPilotName: 'Alex Tech',
    coPilotRole: 'AI Implementation Specialist',
    color: 'from-cyan-950 via-teal-900 to-emerald-950',
    category: 'Learning',
    accentColor: '#14b8a6',
    gradientFrom: '#083344',
    gradientVia: '#134e4a',
    gradientTo: '#022c22',
    features: [
      'AI tool mastery tracking',
      'Prompt engineering practice',
      'Tech trend monitoring',
      'Project experiments log',
      'Knowledge synthesis',
      'Community insights'
    ],
    defaultGoals: {
      primaryGoal: 'Master AI tools and applications',
      theme: 'learning',
      dailyEffort: '1hour',
      objectives: ['AI tool mastery', 'Project experiments', 'Knowledge sharing']
    }
  },
  'boss-beam': {
    id: 'boss-beam',
    name: 'BossBeam',
    tagline: 'Female Founder vision & scaling platform.',
    description: 'Scale your vision with confidence. Track fundraising, team building, and company milestones with founder-focused coaching.',
    icon: '👑',
    imageUrl: '/assets/app-suite/pipeline-pilot.png',
    coPilotAvatar: '/assets/a-8.jpg',
    coPilotName: 'Claire Beaumont',
    coPilotRole: 'Venture Partner & Strategist',
    color: 'from-fuchsia-950 via-pink-900 to-rose-950',
    category: 'Founder',
    accentColor: '#ec4899',
    gradientFrom: '#4a044e',
    gradientVia: '#9d174d',
    gradientTo: '#4c0519',
    features: [
      'Fundraising milestone tracking',
      'Team building roadmap',
      'Investor pitch prep',
      'Vision board creation',
      'Revenue scaling strategies',
      'Founder wellness check-ins'
    ],
    defaultGoals: {
      primaryGoal: 'Scale my company and vision',
      theme: 'career',
      dailyEffort: '2hours',
      objectives: ['Team growth', 'Revenue milestones', 'Vision execution']
    }
  },
  'my-sugar-shift': {
    id: 'my-sugar-shift',
    name: 'MySugarShift',
    tagline: 'Wellness & nutrition balance assistant.',
    description: 'Transform your relationship with food and energy. Track nutrition, blood sugar, and wellness habits with personalized guidance.',
    icon: '🍎',
    imageUrl: '/assets/app-suite/opti-human.png',
    coPilotAvatar: '/assets/a-9.jpg',
    coPilotName: 'Lucille Grant',
    coPilotRole: 'Nutrition & Wellness Lead',
    color: 'from-lime-950 via-green-900 to-emerald-950',
    category: 'Health',
    accentColor: '#22c55e',
    gradientFrom: '#1a2e05',
    gradientVia: '#14532d',
    gradientTo: '#022c22',
    features: [
      'Nutrition logging made easy',
      'Blood sugar pattern insights',
      'Meal planning assistance',
      'Energy level correlation',
      'Healthy habit streaks',
      'Cravings management'
    ],
    defaultGoals: {
      primaryGoal: 'Optimize nutrition and energy levels',
      theme: 'health',
      dailyEffort: '20min',
      objectives: ['Meal tracking', 'Energy patterns', 'Healthy habits']
    }
  },
  'my-rocket-ride': {
    id: 'my-rocket-ride',
    name: 'MyRocketRide',
    tagline: 'Distance Biker mileage & route planner.',
    description: 'Conquer long-distance cycling goals. Track mileage, routes, and training progress with cycling-optimized performance insights.',
    icon: '🚴',
    imageUrl: '/assets/app-suite/moonlight-maker.png',
    coPilotAvatar: '/assets/a-10.jpg',
    coPilotName: 'Tom Wheeler',
    coPilotRole: 'Performance Cycling Coach',
    color: 'from-orange-950 via-red-900 to-rose-950',
    category: 'Fitness',
    accentColor: '#ef4444',
    gradientFrom: '#431407',
    gradientVia: '#7f1d1d',
    gradientTo: '#4c0519',
    features: [
      'Mileage goal tracking',
      'Route planning & logging',
      'Training load management',
      'Performance analytics',
      'Gear maintenance reminders',
      'Weather-smart scheduling'
    ],
    defaultGoals: {
      primaryGoal: 'Complete my cycling distance goals',
      theme: 'health',
      dailyEffort: '1hour',
      objectives: ['Weekly mileage', 'Route completion', 'Performance gains']
    }
  },
  'marathon-mover': {
    id: 'marathon-mover',
    name: 'MarathonMover',
    tagline: 'Marathon runner training & pacing guide.',
    description: 'Train for your marathon with precision. Track runs, pacing strategies, and race preparation with running-optimized coaching.',
    icon: '🏃',
    imageUrl: '/assets/app-suite/apex-ascend.png',
    coPilotAvatar: '/assets/gym-coach.jpg',
    coPilotName: 'Coach Alina Park',
    coPilotRole: 'Marathon Training Lead',
    color: 'from-amber-950 via-orange-900 to-red-950',
    category: 'Fitness',
    accentColor: '#f97316',
    gradientFrom: '#451a03',
    gradientVia: '#7c2d12',
    gradientTo: '#450a0a',
    features: [
      'Training plan generation',
      'Pace zone optimization',
      'Race day preparation',
      'Recovery tracking',
      'Nutrition timing',
      'Mental prep coaching'
    ],
    defaultGoals: {
      primaryGoal: 'Complete my marathon training',
      theme: 'health',
      dailyEffort: '1hour',
      objectives: ['Weekly mileage', 'Pace improvement', 'Race readiness']
    }
  },
  'career-quest': {
    id: 'career-quest',
    name: 'CareerQuest',
    tagline: 'Job Seeker application & interview tracker.',
    description: 'Land your dream job with organized tracking. Manage applications, interviews, and networking with job search optimization.',
    icon: '💼',
    imageUrl: '/assets/app-suite/pipeline-pilot.png',
    coPilotAvatar: '/assets/a-6.jpg',
    coPilotName: 'Maya (Senior Recruiter)',
    coPilotRole: 'Career Accelerator Partner',
    color: 'from-slate-900 via-zinc-900 to-neutral-800',
    category: 'Career',
    accentColor: '#71717a',
    gradientFrom: '#0f172a',
    gradientVia: '#18181b',
    gradientTo: '#262626',
    features: [
      'Application pipeline tracker',
      'Interview prep coach',
      'Company research notes',
      'Networking relationship CRM',
      'Salary negotiation prep',
      'Offer comparison tools'
    ],
    defaultGoals: {
      primaryGoal: 'Land my dream job',
      theme: 'career',
      dailyEffort: '2hours',
      objectives: ['Applications sent', 'Interviews completed', 'Network growth']
    }
  }
};

export type GrowthDimensionId = 'beliefs' | 'failure' | 'action' | 'practice' | 'reinforce';

export interface GrowthDimension {
  id: GrowthDimensionId;
  name: string;
  phase: string;
  color: string;
  shortLabel: string;
}

export interface GrowthQuestionOption {
  text: string;
  score: number;
}

export interface GrowthQuestion {
  dim: GrowthDimensionId;
  scenario: string;
  context: string;
  options: GrowthQuestionOption[];
}

export interface GrowthArchetype {
  min: number;
  max: number;
  name: string;
  color: string;
  desc: string;
  headline: string;
}

export interface GrowthInsight {
  min: number;
  max: number;
  text: string;
  action: string;
}

export const GROWTH_DIMENSIONS: GrowthDimension[] = [
  { id: 'beliefs', name: 'Mindset Beliefs', phase: 'GROUND', color: '#7c3aed', shortLabel: 'MB' },
  { id: 'failure', name: 'Failure Response', phase: 'REFRAME', color: '#dc2626', shortLabel: 'FR' },
  { id: 'action', name: 'Action Architecture', phase: 'ORCHESTRATE', color: '#0369a1', shortLabel: 'AA' },
  { id: 'practice', name: 'Practice Quality', phase: 'WORK', color: '#15803d', shortLabel: 'PQ' },
  { id: 'reinforce', name: 'Self-Reinforcement', phase: 'TRIUMPH & HABITUATE', color: '#b45309', shortLabel: 'SR' }
];

export const GROWTH_QUESTIONS: GrowthQuestion[] = [
  {
    dim: 'beliefs',
    scenario: "You discover a colleague learned a complex new skill in 6 months that you've struggled with for years.",
    context: 'Neuroplasticity research (Blackwell et al., 2007) shows beliefs about brain malleability predict achievement.',
    options: [
      { text: "They must have a natural aptitude I don't have. Some people are just wired differently.", score: 1 },
      { text: "That's impressive. I wonder what they're doing differently - their method might work for me too.", score: 4 },
      { text: "Six months of focused practice can rewire neural pathways. I need to examine my practice quality, not my 'talent.'", score: 5 },
      { text: 'Good for them, but my situation is different. Not everyone can pick things up that easily.', score: 2 }
    ]
  },
  {
    dim: 'beliefs',
    scenario: "A hiring manager says: 'We need someone who's a natural leader, not someone who has to work at it.'",
    context: "Dweck's research distinguishes entity theorists (talent is fixed) from incremental theorists (talent is developed).",
    options: [
      { text: "That's a reasonable filter. Some people are born leaders and some aren't.", score: 1 },
      { text: "That's a red flag - it means they don't value growth and will plateau as an organization.", score: 5 },
      { text: 'I get what they mean, but leadership can definitely be developed over time.', score: 3 },
      { text: 'They probably just want someone with existing experience, which makes sense.', score: 2 }
    ]
  },
  {
    dim: 'beliefs',
    scenario: "Your teenager says 'I'm just not a math person' after a bad test grade.",
    context: 'Research shows that labeling ability as innate reduces effort investment by up to 40%.',
    options: [
      { text: "Some people genuinely aren't math-oriented. Help them find their strengths elsewhere.", score: 1 },
      { text: "Tell them: 'You're not a math person YET. Your brain builds math circuits through practice - what specific part tripped you up?'", score: 5 },
      { text: 'Encourage them to try harder next time and maybe get a tutor.', score: 3 },
      { text: 'Show them examples of people who were bad at math but got better with effort.', score: 4 }
    ]
  },
  {
    dim: 'failure',
    scenario: 'You give a presentation at work. Afterward, a senior colleague sends you detailed critical feedback - 12 specific points.',
    context: "Dweck's 4-step reframe: Accept -> Observe -> Name -> Educate. Attribution training reduces fear of failure by 54.8% (Huang et al., 2025).",
    options: [
      { text: "Feel defensive. Twelve points? That's excessive - clearly they have an agenda.", score: 1 },
      { text: 'Feel the sting, then systematically categorize: which 3 points would create the biggest improvement if I addressed them first?', score: 5 },
      { text: 'Thank them and try to incorporate the feedback next time.', score: 3 },
      { text: "Feel discouraged. Maybe presenting isn't my strong suit - I should let someone else handle it.", score: 1 }
    ]
  },
  {
    dim: 'failure',
    scenario: "You've been trying to build a habit (exercise, writing, meditation) for 3 months. You just missed an entire week.",
    context: "BJ Fogg's research shows that how you respond to habit breaks predicts long-term success more than the break itself.",
    options: [
      { text: 'I knew it. I always start strong and fall off. This is who I am.', score: 1 },
      { text: "Reset and restart tomorrow. One week doesn't erase three months.", score: 3 },
      { text: 'Analyze what happened this week specifically, shrink the habit smaller, redesign the trigger, and run the experiment again.', score: 5 },
      { text: 'Maybe I need to try a different approach entirely.', score: 2 }
    ]
  },
  {
    dim: 'action',
    scenario: 'You want to learn data visualization. You have evenings free. How do you start?',
    context: 'Fogg Behavior Model: Behavior = Motivation x Ability x Prompt. Self-Determination Theory emphasizes autonomy and competence.',
    options: [
      { text: 'Buy a comprehensive online course and work through it start to finish.', score: 2 },
      { text: 'Design a tiny daily practice: after dinner (prompt), open one dataset and make one chart (ability). Track completion, not quality.', score: 5 },
      { text: 'Watch some YouTube tutorials when I feel motivated and practice when I can.', score: 1 },
      { text: 'Set a goal to complete 3 visualization projects in the next month.', score: 3 }
    ]
  },
  {
    dim: 'action',
    scenario: "You need to change how your team runs meetings (they're unproductive). What's your approach?",
    context: 'Behavior design research shows environment design outperforms motivation-based approaches by 3:1.',
    options: [
      { text: 'Send an email explaining why meetings need to improve and ask everyone to come prepared.', score: 1 },
      { text: 'Redesign the meeting structure: standing format (prompt), 15-min max (ability), async pre-reads (environment). Run a 2-week experiment and measure.', score: 5 },
      { text: 'Lead by example - run my own meetings better and hope others follow.', score: 2 },
      { text: 'Implement a new meeting framework I read about and train the team on it.', score: 3 }
    ]
  },
  {
    dim: 'practice',
    scenario: "You're learning to play guitar. You can play 5 songs reasonably well. What does your next month of practice look like?",
    context: "Ericsson's deliberate practice: well-defined goals, immediate feedback, operation at the edge of ability, full concentration.",
    options: [
      { text: 'Play those 5 songs regularly to keep them sharp, and maybe learn a 6th.', score: 1 },
      { text: 'Identify the specific technique holding me back (for example, barre chords), isolate it, practice at 60% speed with a metronome, increase tempo by 5 BPM when clean for 3 reps.', score: 5 },
      { text: 'Push myself to learn harder songs that stretch my abilities.', score: 3 },
      { text: 'Practice for an hour a day and trust that the time will pay off.', score: 2 }
    ]
  },
  {
    dim: 'practice',
    scenario: "You're a manager trying to get better at giving feedback. How do you approach improving?",
    context: "Deliberate practice requires decomposition into micro-skills, not just 'more reps' of the whole behavior.",
    options: [
      { text: 'Give more feedback more often - practice makes perfect.', score: 2 },
      { text: 'Read a book on feedback frameworks and implement what I learn.', score: 3 },
      { text: "Decompose 'feedback' into micro-skills (opening, specificity, tone, timing). Practice one per week. Record myself. Review. Adjust.", score: 5 },
      { text: 'Ask my reports what kind of feedback works best for them and adapt.', score: 3 }
    ]
  },
  {
    dim: 'practice',
    scenario: 'Two people both practice public speaking for 100 hours. One improves dramatically, the other barely at all. What is the most likely explanation?',
    context: "Ericsson found that time-on-task without deliberate structure creates 'arrested development' - the illusion of practice without improvement.",
    options: [
      { text: 'Natural talent - some people are born communicators.', score: 1 },
      { text: "One practiced with specific goals, immediate feedback, and progressive difficulty. The other just 'did more reps.'", score: 5 },
      { text: 'One was probably more motivated and passionate about it.', score: 2 },
      { text: 'One had better opportunities and exposure to good speakers.', score: 2 }
    ]
  },
  {
    dim: 'reinforce',
    scenario: 'You just completed a difficult project ahead of deadline. How do you process this win?',
    context: 'Dopamine research shows that specific, immediate celebration of process (not just outcome) strengthens neural pathways.',
    options: [
      { text: 'Feel relieved and move on to the next thing on my list.', score: 1 },
      { text: 'Celebrate by treating myself - dinner, day off, something fun.', score: 2 },
      { text: "Identify exactly which strategy made this work (for example, 'breaking it into 3 phases with milestones was the key'), feel genuine pride in that choice, and note it for next time.", score: 5 },
      { text: "Share the win with my team and acknowledge everyone's contributions.", score: 3 }
    ]
  },
  {
    dim: 'reinforce',
    scenario: 'Which statement feels most true to you right now?',
    context: 'Identity-based habits (basal ganglia-driven) are 3x more persistent than goal-based habits (prefrontal cortex-driven).',
    options: [
      { text: 'I am who I am. I focus on playing to my existing strengths.', score: 1 },
      { text: "I'm working on becoming a better version of myself.", score: 3 },
      { text: "I'm someone who runs experiments on my own development. Growth isn't something I do - it's who I am.", score: 5 },
      { text: 'I try to improve when I can, but life often gets in the way.', score: 2 }
    ]
  }
];

export const GROWTH_ARCHETYPES: GrowthArchetype[] = [
  {
    min: 0,
    max: 29,
    name: 'The Plateau Dweller',
    color: '#dc2626',
    desc: "You've internalized beliefs that cap your potential before you start. Fixed mindset patterns are running the show - not because you lack ability, but because your mental operating system has not been updated. The good news: neuroplasticity means your brain is literally built to change.",
    headline: 'Your brain is more rewritable than you think.'
  },
  {
    min: 30,
    max: 49,
    name: 'The Effort Illusionist',
    color: '#b45309',
    desc: "You believe in growth and you put in the hours - but your effort lacks the structure that creates real improvement. Ericsson's research shows this is where most people get stuck: 'arrested development' disguised as dedication.",
    headline: 'Effort without architecture is just motion.'
  },
  {
    min: 50,
    max: 69,
    name: 'The Emerging Architect',
    color: '#0369a1',
    desc: "You've got the mindset foundations and some solid habits, but you're inconsistent in applying deliberate practice. Your growth happens in bursts rather than through systematized loops. The RSI framework is your unlock.",
    headline: "You've got the mindset. Now build the system."
  },
  {
    min: 70,
    max: 84,
    name: 'The Growth Engineer',
    color: '#15803d',
    desc: 'You treat self-improvement as a discipline, not a wish. You design environments, decompose skills, and learn from failure systematically. Your edge will come from formalizing your improvement loops and compounding gains recursively.',
    headline: 'You engineer growth. Now make it recursive.'
  },
  {
    min: 85,
    max: 100,
    name: 'The Recursive Improver',
    color: '#7c3aed',
    desc: "You do not just have a growth mindset - you have a growth system. You run deliberate experiments on your own development, celebrate process over outcomes, and treat identity as something you build. Each cycle makes the next one more effective.",
    headline: 'Each cycle makes the next one more powerful.'
  }
];

export const GROWTH_INSIGHTS: Record<GrowthDimensionId, GrowthInsight[]> = {
  beliefs: [
    {
      min: 0,
      max: 39,
      text: 'Your beliefs about ability are acting as a ceiling. Research shows that simply learning about neuroplasticity increases motivation and resilience.',
      action: "Start here: Read about neuroplasticity for 10 minutes. Catch yourself saying 'I can't' and add 'yet.'"
    },
    {
      min: 40,
      max: 69,
      text: "You lean growth-oriented but slip into fixed thinking under pressure. Dweck calls it a 'mixed mindset.' The key is building awareness of your triggers.",
      action: "Name your fixed-mindset voice. Give it a persona ('The Protector'). When it speaks, acknowledge it and choose the growth response."
    },
    {
      min: 70,
      max: 100,
      text: 'Your belief system is wired for growth. You see ability as developable and talent as a starting point, not a ceiling.',
      action: 'Share this understanding with others. Teaching neuroplasticity to someone else reinforces your own growth architecture.'
    }
  ],
  failure: [
    {
      min: 0,
      max: 39,
      text: 'Setbacks are triggering threat responses - your brain is interpreting failure as identity evidence rather than performance data.',
      action: 'Practice the REFRAME protocol: Accept the feeling -> Observe the trigger -> Name the pattern -> Educate with growth self-talk.'
    },
    {
      min: 40,
      max: 69,
      text: "You recover from setbacks, but you're not yet extracting maximum learning. You bounce back - but bouncing back is not the same as bouncing forward.",
      action: "After every setback, write: 'What specifically did I learn that changes my next attempt?'"
    },
    {
      min: 70,
      max: 100,
      text: 'You treat failure as data, not as verdict. Failed experiments are not stop signals - they are improvement signals.',
      action: 'Formalize your failure analysis: hypothesis, result, insight, next iteration.'
    }
  ],
  action: [
    {
      min: 0,
      max: 39,
      text: "You're relying on motivation and willpower instead of designing behavior. The Fogg Behavior Model shows this is the number one reason change fails.",
      action: 'Pick one behavior. Make it tiny (2 min). Attach it to an existing habit. Do it for 7 days. Measure completion, not quality.'
    },
    {
      min: 40,
      max: 69,
      text: "You have some structure but it's inconsistent. You know what to do but have not fully designed the environment to make it automatic.",
      action: 'Audit your top 3 goals: does each one have a clear Prompt, a tiny Ability step, and a way to track progress?'
    },
    {
      min: 70,
      max: 100,
      text: 'You architect your behaviors intentionally. You design environments, use prompts, and scale difficulty progressively.',
      action: 'Apply parallel experimentation: design 2 to 3 different approaches and run them simultaneously. Measure which sticks.'
    }
  ],
  practice: [
    {
      min: 0,
      max: 39,
      text: "You're logging hours without logging improvement. Repetition without feedback, goals, and progressive difficulty creates the illusion of practice.",
      action: 'Choose one skill. Break it into 3 micro-components. Practice the weakest one in isolation for 15 minutes with a specific metric.'
    },
    {
      min: 40,
      max: 69,
      text: "You practice with intention but have not fully systematized the feedback loop. The gap between 'working hard' and 'deliberate practice' is structure.",
      action: "Add one feedback mechanism: record yourself, get a coach's review, or use a metric that shows progress (not just effort)."
    },
    {
      min: 70,
      max: 100,
      text: 'Your practice quality is elite. You decompose skills, seek feedback, and operate at the edge of your ability.',
      action: "Increase difficulty by 10 to 15 percent. The sweet spot is where you succeed around 60 to 70 percent of the time - that's the growth zone."
    }
  ],
  reinforce: [
    {
      min: 0,
      max: 39,
      text: "You're skipping the neurochemistry of habit formation. Without celebrating process wins, your brain does not release the dopamine that strengthens pathways.",
      action: 'After every small win this week, pause for 5 seconds and name exactly what you did well (the strategy, not the outcome).'
    },
    {
      min: 40,
      max: 69,
      text: "You celebrate outcomes but not process. Outcome celebration reinforces results (which you cannot always control); process celebration reinforces behaviors.",
      action: "Shift your target: instead of 'I finished!' try 'My approach of X made this work.' Celebrate the method."
    },
    {
      min: 70,
      max: 100,
      text: "You've built identity-level growth habits. You celebrate process, reinforce effective strategies, and your behaviors are shifting to automatic.",
      action: "Ask: 'Which growth behaviors have become automatic? Which still require willpower?' Optimize the latter."
    }
  ]
};

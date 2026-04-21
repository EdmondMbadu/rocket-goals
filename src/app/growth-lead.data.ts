export type GrowthLeadMode = 'adult' | 'student';
export type GrowthDimensionId = 'beliefs' | 'failure' | 'action' | 'practice' | 'reinforce';

export interface GrowthDimension {
  id: GrowthDimensionId;
  name: string;
  studentName: string;
  phase: string;
  color: string;
  shortLabel: string;
  radarLabel: string;
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
  { id: 'beliefs', name: 'Mindset Beliefs', studentName: 'What You Believe', phase: 'GROUND', color: '#6E4FA0', shortLabel: 'MB', radarLabel: 'Beliefs' },
  { id: 'failure', name: 'Failure Response', studentName: 'Handling Setbacks', phase: 'REFRAME', color: '#D63B2F', shortLabel: 'FR', radarLabel: 'Failure' },
  { id: 'action', name: 'Action Architecture', studentName: 'Making Plans', phase: 'ORCHESTRATE', color: '#1B6B93', shortLabel: 'AA', radarLabel: 'Action' },
  { id: 'practice', name: 'Practice Quality', studentName: 'How You Practice', phase: 'WORK', color: '#2D8A4E', shortLabel: 'PQ', radarLabel: 'Practice' },
  { id: 'reinforce', name: 'Self-Reinforcement', studentName: 'Celebrating Wins', phase: 'TRIUMPH & HABITUATE', color: '#C4880C', shortLabel: 'SR', radarLabel: 'Reinforce' }
];

const ADULT_QUESTIONS: GrowthQuestion[] = [
  {
    dim: 'beliefs',
    scenario: "A colleague learned a complex skill in 6 months that you've struggled with for years.",
    context: 'Neuroplasticity research shows beliefs about brain malleability predict achievement (Blackwell et al., 2007).',
    options: [
      { text: "They have a natural aptitude I don't.", score: 1 },
      { text: 'Impressive - I wonder what method they used. It might work for me.', score: 4 },
      { text: 'Focused practice rewires neural pathways. I need to examine my approach, not my talent.', score: 5 },
      { text: 'Good for them, but my situation is different.', score: 2 }
    ]
  },
  {
    dim: 'beliefs',
    scenario: "Your teenager says 'I'm just not a math person' after a bad test grade.",
    context: 'Labeling ability as innate reduces effort investment by up to 40%.',
    options: [
      { text: "Some people genuinely aren't math-oriented. Help them find other strengths.", score: 1 },
      { text: "Tell them: 'Not yet. Your brain builds math circuits with practice - what part tripped you up?'", score: 5 },
      { text: 'Encourage them to try harder and maybe get a tutor.', score: 3 },
      { text: 'Show them examples of people who improved at math with effort.', score: 4 }
    ]
  },
  {
    dim: 'failure',
    scenario: 'After a work presentation, a senior colleague sends 12 points of critical feedback.',
    context: 'Attribution training reduces fear of failure by 54.8% (Huang et al., 2025).',
    options: [
      { text: "Twelve points? That's excessive - they clearly have an agenda.", score: 1 },
      { text: 'Feel the sting, then prioritize: which 3 points would create the biggest improvement?', score: 5 },
      { text: 'Thank them and try to use the feedback next time.', score: 3 },
      { text: "Maybe presenting isn't my strength - someone else should handle it.", score: 1 }
    ]
  },
  {
    dim: 'failure',
    scenario: "You've been building a habit for 3 months. You just missed an entire week.",
    context: 'How you respond to habit breaks predicts long-term success more than the break itself (Fogg).',
    options: [
      { text: 'I always start strong and fall off. This is who I am.', score: 1 },
      { text: "One bad week doesn't erase three months. Restart tomorrow.", score: 3 },
      { text: 'What went wrong this week? Shrink the habit, redesign the trigger, run the experiment again.', score: 5 },
      { text: 'Maybe I should try a completely different approach.', score: 2 }
    ]
  },
  {
    dim: 'action',
    scenario: 'You want to learn a new skill. You have evenings free. How do you start?',
    context: 'Fogg Behavior Model: Behavior = Motivation x Ability x Prompt.',
    options: [
      { text: 'Buy a comprehensive course and work through it start to finish.', score: 2 },
      { text: 'Design a tiny daily practice: same time each evening, one small exercise, track completion not quality.', score: 5 },
      { text: 'Watch tutorials when I feel motivated and practice when I can.', score: 1 },
      { text: 'Set a goal to complete 3 projects in the next month.', score: 3 }
    ]
  },
  {
    dim: 'action',
    scenario: "Your team's meetings are unproductive. How do you fix them?",
    context: 'Behavior design research shows environment design outperforms motivation-based approaches by 3:1.',
    options: [
      { text: 'Send an email asking everyone to come more prepared.', score: 1 },
      { text: 'Redesign the structure: 15-min max, standing format, async pre-reads. Test for 2 weeks and measure.', score: 5 },
      { text: 'Run my own meetings better and hope others follow.', score: 2 },
      { text: 'Implement a framework I read about and train the team on it.', score: 3 }
    ]
  },
  {
    dim: 'practice',
    scenario: 'You can play 5 songs on guitar. What does your next month of practice look like?',
    context: 'Ericsson: well-defined goals, immediate feedback, operating at the edge of ability.',
    options: [
      { text: 'Keep playing those 5 songs to stay sharp. Maybe learn a 6th.', score: 1 },
      { text: 'Find the specific technique holding me back, isolate it, practice slowly, increase difficulty when clean.', score: 5 },
      { text: 'Push myself to learn harder songs that stretch my abilities.', score: 3 },
      { text: 'Practice an hour a day and trust the time will pay off.', score: 2 }
    ]
  },
  {
    dim: 'practice',
    scenario: "You're a manager trying to improve at giving feedback. What's your approach?",
    context: 'Deliberate practice requires breaking skills into micro-components.',
    options: [
      { text: 'Give feedback more often - practice makes perfect.', score: 2 },
      { text: 'Read a book on feedback and implement what I learn.', score: 3 },
      { text: "Break 'feedback' into sub-skills (opening, specificity, tone, timing). Practice one per week. Record and review.", score: 5 },
      { text: 'Ask my reports what feedback style works best for them.', score: 3 }
    ]
  },
  {
    dim: 'reinforce',
    scenario: 'You completed a difficult project ahead of deadline. How do you process the win?',
    context: 'Specific celebration of process (not just outcome) strengthens neural pathways via dopamine.',
    options: [
      { text: 'Feel relieved. Move on to the next thing.', score: 1 },
      { text: 'Treat myself - dinner out, a day off.', score: 2 },
      { text: 'Pinpoint which strategy made it work, feel pride in that choice, and note it for next time.', score: 5 },
      { text: 'Share the win with my team and acknowledge their contributions.', score: 3 }
    ]
  },
  {
    dim: 'reinforce',
    scenario: 'Which statement feels most true to you right now?',
    context: 'Identity-based habits are 3x more persistent than goal-based habits.',
    options: [
      { text: 'I am who I am. I play to my existing strengths.', score: 1 },
      { text: "I'm working on becoming a better version of myself.", score: 3 },
      { text: "I run experiments on my own development. Growth is who I am, not just what I do.", score: 5 },
      { text: 'I try to improve when I can, but life gets in the way.', score: 2 }
    ]
  }
];

const STUDENT_QUESTIONS: GrowthQuestion[] = [
  {
    dim: 'beliefs',
    scenario: 'Your friend picks up a new video game and is way better than you on day one.',
    context: 'Your brain actually grows new connections when you practice something hard.',
    options: [
      { text: "They're just naturally better at games than me.", score: 1 },
      { text: "They probably played something similar before. I bet I'd catch up with practice.", score: 4 },
      { text: 'Being bad at first is how your brain starts building new skills. I just need more reps.', score: 5 },
      { text: "Some people are just gamers and some aren't.", score: 2 }
    ]
  },
  {
    dim: 'beliefs',
    scenario: "You bombed a math test. Your parent says 'Maybe math just isn't your thing.'",
    context: 'When people believe talent is fixed, they try 40% less hard.',
    options: [
      { text: "They're probably right. I've never been good at math.", score: 1 },
      { text: "That's not true - I'm not a math person YET. I need to figure out what part I'm stuck on.", score: 5 },
      { text: "I'll try harder next time.", score: 3 },
      { text: "Maybe I should focus on subjects I'm already good at.", score: 2 }
    ]
  },
  {
    dim: 'failure',
    scenario: "You try out for the school team and don't make it.",
    context: 'How you react to setbacks matters more than the setback itself.',
    options: [
      { text: "I'm just not athletic enough. No point trying again.", score: 1 },
      { text: "That sucks, but I'll try again next year.", score: 3 },
      { text: "I'm going to ask the coach exactly what I need to work on, then practice those specific things.", score: 5 },
      { text: 'Maybe I should try a different sport instead.', score: 2 }
    ]
  },
  {
    dim: 'failure',
    scenario: "You've been trying to wake up early to study for two weeks. This week you slept through your alarm every day.",
    context: 'Bouncing back from a slip-up is more important than never slipping up.',
    options: [
      { text: "I'm just not a morning person. This was a dumb idea.", score: 1 },
      { text: "One bad week doesn't erase two good ones. I'll restart Monday.", score: 3 },
      { text: 'Why did this week go wrong? Maybe I need to go to bed earlier, or move my alarm across the room. Let me try a different setup.', score: 5 },
      { text: 'Maybe I should just study at night instead.', score: 2 }
    ]
  },
  {
    dim: 'action',
    scenario: 'You want to get better at drawing. Where do you start?',
    context: 'Starting super small makes it way easier to actually do the thing.',
    options: [
      { text: 'Buy a bunch of art supplies and watch YouTube tutorials.', score: 2 },
      { text: "Every day after lunch, sketch one small thing for 5 minutes. Don't worry if it's good - just do it.", score: 5 },
      { text: 'Draw whenever I feel like it.', score: 1 },
      { text: 'Set a goal to finish 3 drawings this month.', score: 3 }
    ]
  },
  {
    dim: 'action',
    scenario: 'Your study group is totally unproductive - everyone just talks. How do you fix it?',
    context: 'Changing the setup works better than just telling people to try harder.',
    options: [
      { text: 'Tell everyone to focus more.', score: 1 },
      { text: 'Change the rules: phones in a pile, 25-minute focused timer, then a 5-minute break. Try it for one week and see what happens.', score: 5 },
      { text: 'Just study on my own instead.', score: 2 },
      { text: 'Find a study method online and suggest the group try it.', score: 3 }
    ]
  },
  {
    dim: 'practice',
    scenario: 'You can play 3 songs on guitar pretty well. What do you do next?',
    context: 'Practicing the hard parts slowly is how you actually get better.',
    options: [
      { text: "Keep playing those 3 songs so I don't forget them.", score: 1 },
      { text: 'Find the one part I keep messing up, slow it way down, and repeat it until it is clean before speeding up.', score: 5 },
      { text: 'Try to learn a really hard song to challenge myself.', score: 3 },
      { text: 'Practice for an hour every day and hope I improve.', score: 2 }
    ]
  },
  {
    dim: 'reinforce',
    scenario: 'You studied hard and got an A on a test you were worried about. What do you think?',
    context: 'Celebrating why something worked makes your brain want to do it again.',
    options: [
      { text: "Finally, that's over. What's next?", score: 1 },
      { text: 'Time to celebrate - I earned a treat!', score: 2 },
      { text: "My strategy of breaking the material into small chunks and quizzing myself each night is what worked. I'm going to keep doing that.", score: 5 },
      { text: 'I guess I got lucky with the questions.', score: 1 }
    ]
  }
];

const ADULT_ARCHETYPES: GrowthArchetype[] = [
  {
    min: 0,
    max: 29,
    name: 'The Plateau Dweller',
    color: '#D63B2F',
    desc: "You've internalized beliefs that cap your potential. Fixed mindset patterns are running the show - not because you lack ability, but because your mental operating system hasn't been updated. The good news: neuroplasticity means your brain is built to change.",
    headline: 'Your brain is more rewirable than you think.'
  },
  {
    min: 30,
    max: 49,
    name: 'The Effort Illusionist',
    color: '#C4880C',
    desc: "You believe in growth and put in the hours - but your effort lacks the structure that creates real improvement. Ericsson's research shows this is where most people get stuck: 'arrested development' disguised as dedication.",
    headline: 'Effort without architecture is just motion.'
  },
  {
    min: 50,
    max: 69,
    name: 'The Emerging Architect',
    color: '#1B6B93',
    desc: "You've got the mindset foundations and some solid habits, but you're inconsistent in applying deliberate practice. Your growth happens in bursts rather than through systematized loops.",
    headline: "You've got the mindset. Now build the system."
  },
  {
    min: 70,
    max: 84,
    name: 'The Growth Engineer',
    color: '#2D8A4E',
    desc: 'You treat self-improvement as a discipline. You design environments, decompose skills, and learn from failure systematically. Your edge will come from formalizing your improvement loops.',
    headline: 'You engineer growth. Now make it recursive.'
  },
  {
    min: 85,
    max: 100,
    name: 'The Recursive Improver',
    color: '#6E4FA0',
    desc: "You do not just have a growth mindset - you have a growth system. You run deliberate experiments on your own development and treat identity as something you build.",
    headline: 'Each cycle makes the next one more powerful.'
  }
];

const STUDENT_ARCHETYPES: GrowthArchetype[] = [
  {
    min: 0,
    max: 29,
    name: 'The Stuck Starter',
    color: '#D63B2F',
    desc: "Right now, your brain is telling you that talent is something you either have or you don't. That's completely normal - but science says it's wrong! Your brain literally grows new connections every time you practice something hard. You're not stuck - you just haven't found the right approach yet.",
    headline: "You're not stuck. You just haven't started growing yet."
  },
  {
    min: 30,
    max: 49,
    name: 'The Hard Worker',
    color: '#C4880C',
    desc: "You're putting in effort - and that's awesome! But here's the thing: working hard without a plan is like running on a treadmill. You're sweating but not going anywhere. The trick is to practice smarter, not just harder.",
    headline: "You've got the hustle. Now add the strategy."
  },
  {
    min: 50,
    max: 69,
    name: 'The Rising Builder',
    color: '#1B6B93',
    desc: "You're on the right track! You believe you can grow, and sometimes you practice with real focus. But it's not consistent yet - you do it when you're motivated, but not when you're not. The next level is making growth a habit, not just a mood.",
    headline: "You're building something great. Keep going!"
  },
  {
    min: 70,
    max: 84,
    name: 'The Growth Machine',
    color: '#2D8A4E',
    desc: "You're seriously ahead of most people your age. You know that failure is feedback, you practice with purpose, and you're building real skills. Keep pushing - the gap between good and great is all about those small daily improvements.",
    headline: "You're already doing what most adults can't."
  },
  {
    min: 85,
    max: 100,
    name: 'The Unstoppable',
    color: '#6E4FA0',
    desc: "You don't just believe in growth - you live it. You treat every challenge as an experiment, learn from every setback, and celebrate the process. Your mindset is your superpower. Now go teach someone else how to think this way.",
    headline: 'Your mindset is your superpower. Share it.'
  }
];

const ADULT_INSIGHTS: Record<GrowthDimensionId, GrowthInsight[]> = {
  beliefs: [
    {
      min: 0,
      max: 39,
      text: 'Your beliefs about ability are acting as a ceiling. Simply learning about neuroplasticity increases motivation and resilience.',
      action: "Read about neuroplasticity for 10 minutes. Catch yourself saying 'I can't' and add 'yet.'"
    },
    {
      min: 40,
      max: 69,
      text: "You lean growth-oriented but slip into fixed thinking under pressure. Dweck calls it a 'mixed mindset.'",
      action: "Name your fixed-mindset voice. Give it a persona. When it speaks, acknowledge it and choose the growth response."
    },
    {
      min: 70,
      max: 100,
      text: 'Your belief system is wired for growth. You see ability as developable and talent as a starting point.',
      action: 'Teach neuroplasticity to someone else - it reinforces your own growth architecture.'
    }
  ],
  failure: [
    {
      min: 0,
      max: 39,
      text: 'Setbacks are triggering threat responses - your brain is interpreting failure as identity evidence.',
      action: 'Practice the REFRAME protocol: Accept -> Observe -> Name -> Educate.'
    },
    {
      min: 40,
      max: 69,
      text: "You recover from setbacks, but you're not extracting maximum learning. Bouncing back isn't the same as bouncing forward.",
      action: "After every setback, write: 'What specifically did I learn that changes my next attempt?'"
    },
    {
      min: 70,
      max: 100,
      text: 'You treat failure as data, not as verdict. Failed experiments are improvement signals.',
      action: 'Formalize your failure analysis: hypothesis, result, insight, next iteration.'
    }
  ],
  action: [
    {
      min: 0,
      max: 39,
      text: "You're relying on motivation instead of designing behavior. The Fogg Behavior Model shows this is the #1 reason change fails.",
      action: 'Pick ONE behavior. Make it tiny (2 min). Attach it to an existing habit. Do it for 7 days.'
    },
    {
      min: 40,
      max: 69,
      text: "You have some structure but it's inconsistent. You haven't fully designed the environment to make it automatic.",
      action: 'Audit your top 3 goals: does each have a Prompt, a tiny Ability step, and a way to track progress?'
    },
    {
      min: 70,
      max: 100,
      text: 'You architect behaviors intentionally. You design environments, use prompts, and scale difficulty progressively.',
      action: 'Try parallel experimentation: design 2-3 approaches and run them simultaneously.'
    }
  ],
  practice: [
    {
      min: 0,
      max: 39,
      text: "You're logging hours without logging improvement. Repetition without feedback creates the illusion of practice.",
      action: 'Choose one skill. Break it into 3 micro-components. Practice the weakest for 15 minutes with a specific metric.'
    },
    {
      min: 40,
      max: 69,
      text: "You practice with intention but haven't systematized the feedback loop.",
      action: 'Add one feedback mechanism: record yourself, get a review, or use a metric that shows real progress.'
    },
    {
      min: 70,
      max: 100,
      text: 'Your practice quality is elite. You decompose skills, seek feedback, and operate at the edge of ability.',
      action: 'Increase difficulty by 10-15%. The sweet spot is where you succeed around 60-70% of the time.'
    }
  ],
  reinforce: [
    {
      min: 0,
      max: 39,
      text: "You're skipping the neurochemistry of habit formation. Without celebrating process wins, dopamine can't strengthen pathways.",
      action: 'After every small win, pause and name exactly what strategy worked.'
    },
    {
      min: 40,
      max: 69,
      text: 'You celebrate outcomes but not process. Process celebration reinforces behaviors you can control.',
      action: "Instead of 'I finished!' try 'My approach of X made this work.' Celebrate the method."
    },
    {
      min: 70,
      max: 100,
      text: "You've built identity-level growth habits. Your behaviors are shifting from effortful to automatic.",
      action: "Ask: 'Which growth behaviors are automatic? Which still require willpower?' Optimize the latter."
    }
  ]
};

const STUDENT_INSIGHTS: Record<GrowthDimensionId, GrowthInsight[]> = {
  beliefs: [
    {
      min: 0,
      max: 39,
      text: "Right now you're thinking about talent like it's something you're born with. But your brain actually changes shape when you learn new things!",
      action: "Every time you think 'I can't do this,' add the word 'yet' to the end."
    },
    {
      min: 40,
      max: 69,
      text: "You mostly believe you can improve, but when things get tough, that little voice says 'maybe I'm just not good at this.' That's normal.",
      action: "Give that doubt voice a silly name. When it shows up, say 'I hear you, but I'm going to keep going.'"
    },
    {
      min: 70,
      max: 100,
      text: 'You get it - your brain grows when you challenge it. That belief is your biggest advantage.',
      action: "Help a friend understand this. When someone says 'I'm not smart enough,' explain how the brain actually works."
    }
  ],
  failure: [
    {
      min: 0,
      max: 39,
      text: "When things go wrong, your brain is treating it like proof that you're not good enough. But failure is actually just information.",
      action: "Next time something goes wrong, ask yourself: 'What's one thing I learned from this that I can use next time?'"
    },
    {
      min: 40,
      max: 69,
      text: "You handle setbacks okay, but you're not squeezing all the learning out of them yet.",
      action: 'After a bad grade or a rough day, write down one specific thing you would do differently next time.'
    },
    {
      min: 70,
      max: 100,
      text: "You're great at bouncing back! You see mistakes as chances to learn, not as signs you're bad at something.",
      action: "Start a 'Failure File' - write down what went wrong and what you learned."
    }
  ],
  action: [
    {
      min: 0,
      max: 39,
      text: "You're waiting to feel motivated before you start. But motivation comes after you start, not before.",
      action: 'Pick one thing you want to get better at. Make it ridiculously small and do it at the same time every day for a week.'
    },
    {
      min: 40,
      max: 69,
      text: "You have some good habits but they aren't consistent yet. You do them when you feel like it.",
      action: 'Pick your #1 goal. Choose the trigger and the tiny version. Lock that in for 7 days.'
    },
    {
      min: 70,
      max: 100,
      text: "You're great at setting up systems that work. You don't just hope to improve - you plan for it.",
      action: 'Try testing two different study methods this week and see which one actually works better.'
    }
  ],
  practice: [
    {
      min: 0,
      max: 39,
      text: "You're putting in time but not getting better. That's because repeating something the same way doesn't build skill - focused practice does.",
      action: 'Pick one thing you are struggling with. Instead of doing the whole thing, practice just the hard part slowly for 10 minutes.'
    },
    {
      min: 40,
      max: 69,
      text: "You practice with some focus, but you're not getting feedback on what's actually working.",
      action: 'Record yourself, ask a teacher, or test yourself - find one way to measure if you are actually getting better.'
    },
    {
      min: 70,
      max: 100,
      text: "Your practice is focused and smart. You don't just do more reps - you do better reps.",
      action: "Make things slightly harder each week. If you can do it easily, it's not growing your brain anymore."
    }
  ],
  reinforce: [
    {
      min: 0,
      max: 39,
      text: 'When something goes well, you move on too fast. Your brain needs you to pause and feel good about it - that is how habits stick.',
      action: "Next time you do something well, stop for 5 seconds and think: 'What did I do that made that work?'"
    },
    {
      min: 40,
      max: 69,
      text: 'You celebrate results but not the process. The trick is to celebrate HOW you did it, not just that you did it.',
      action: "Instead of 'I got an A!' try 'My flashcard strategy totally worked!'"
    },
    {
      min: 70,
      max: 100,
      text: "You're already great at recognizing what works and doubling down on it. Growth isn't just something you do - it's who you are.",
      action: "Ask yourself: 'Am I growing because I have to, or because it's just what I do?'"
    }
  ]
};

export const GROWTH_QUESTION_BANKS: Record<GrowthLeadMode, GrowthQuestion[]> = {
  adult: ADULT_QUESTIONS,
  student: STUDENT_QUESTIONS
};

export const GROWTH_ARCHETYPE_BANKS: Record<GrowthLeadMode, GrowthArchetype[]> = {
  adult: ADULT_ARCHETYPES,
  student: STUDENT_ARCHETYPES
};

export const GROWTH_INSIGHT_BANKS: Record<GrowthLeadMode, Record<GrowthDimensionId, GrowthInsight[]>> = {
  adult: ADULT_INSIGHTS,
  student: STUDENT_INSIGHTS
};

export function getGrowthQuestions(mode: GrowthLeadMode): GrowthQuestion[] {
  return GROWTH_QUESTION_BANKS[mode];
}

export function getGrowthArchetypes(mode: GrowthLeadMode): GrowthArchetype[] {
  return GROWTH_ARCHETYPE_BANKS[mode];
}

export function getGrowthInsights(mode: GrowthLeadMode): Record<GrowthDimensionId, GrowthInsight[]> {
  return GROWTH_INSIGHT_BANKS[mode];
}

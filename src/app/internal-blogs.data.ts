export type InternalBlogBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'bullet-list'; items: string[] }
  | { type: 'numbered-list'; items: Array<{ title: string; text: string }> }
  | { type: 'table'; columns: string[]; rows: string[][] }
  | { type: 'callout'; title: string; text: string }
  | { type: 'image'; src: string; alt: string; caption?: string };

export interface InternalBlogSection {
  title: string;
  eyebrow?: string;
  blocks: InternalBlogBlock[];
}

export interface InternalBlogPost {
  slug: string;
  title: string;
  heroBadge: string;
  subtitle: string;
  excerpt: string;
  publishedDate: string;
  readTime: string;
  authorName: string;
  authorRole: string;
  seoTitle: string;
  seoDescription: string;
  ctaLabel?: string;
  ctaPath?: string;
  heroImage?: { src: string; alt: string; caption?: string };
  sections: InternalBlogSection[];
  citations: string[];
}

export const INTERNAL_BLOG_POSTS: InternalBlogPost[] = [
  {
    slug: 'the-growth-mindset-skill',
    title: 'The Growth Mindset Skill',
    heroBadge: 'RocketGoals Internal Research',
    subtitle: 'Why the future of coaching is agentic, adaptive, and aligned with human potential - and how RocketGoals is redefining AI-human coaching with a unified framework that actually works.',
    excerpt: 'A deep look at the GROWTH Mindset Skill, the motivation-action gap in AI coaching, and why recursive self-improvement changes how humans and agents can learn together.',
    publishedDate: 'April 1, 2026',
    readTime: '18 min read',
    authorName: 'Jim Walker',
    authorRole: 'RocketGoals Founder',
    seoTitle: 'The Growth Mindset Skill | RocketGoals Internal Blog',
    seoDescription: 'Explore RocketGoals\' GROWTH Mindset Skill, a unified framework for agentic AI coaching built from behavioral science, deliberate practice, and recursive self-improvement.',
    ctaLabel: 'Take the Growth Mindset Test',
    ctaPath: '/growth-lead',
    heroImage: {
      src: '/assets/blog/growth-mindset-hero.webp',
      alt: 'Recursive Self-Improvement Visualization',
      caption: 'A cinematic visualization of the recursive self-improvement loop: where bio-industrial architecture meets neural growth.'
    },
    sections: [
      {
        title: 'The Coaching Revolution Is Here - And It Is Agentic',
        blocks: [
          {
            type: 'paragraph',
            text: `For decades, coaching was treated like a premium service reserved for executives, founders, and elite athletes. Everyone else was left with self-help books, generic habit trackers, and motivational slogans that felt good for a moment and disappeared by Tuesday.`
          },
          {
            type: 'paragraph',
            text: `That era is ending. Agentic AI systems do not just answer questions - they act in service of a goal. They can hold context, run loops, observe patterns, and help people move from intention to execution in ways traditional software never could.`
          },
          {
            type: 'paragraph',
            text: `But most AI coaching products still stop at surface-level encouragement. They chat. They remind. They praise. They do not actually coach. At RocketGoals, we have spent years researching and building a different path: the Growth Mindset Skill, a unified coaching framework that combines six evidence-based behavior change models into one operating system for human achievement.`
          }
        ]
      },
      {
        title: 'The Problem: Why Most AI Coaching Falls Short',
        blocks: [
          {
            type: 'numbered-list',
            items: [
              {
                title: 'The Motivation-Action Gap',
                text: `Most AI coaches tell you what to do but never diagnose why you are not doing it. They ignore the neuroscience of behavior change - dopamine, neuroplasticity, automaticity, friction, and reward - then act surprised when users disappear after two weeks.`
              },
              {
                title: 'The One-Size-Fits-All Trap',
                text: `They apply the same advice regardless of readiness, mindset, identity, or barrier profile. A user in precontemplation gets treated the same way as a user already in action mode. That is not coaching. It is templated prompting without context.`
              },
              {
                title: 'The Cheerleader Problem',
                text: `They celebrate effort indiscriminately. But praise without deliberate practice, progressive challenge, feedback, and skill decomposition creates arrested development. Users feel supported while quietly plateauing.`
              }
            ]
          },
          {
            type: 'paragraph',
            text: `The result is familiar: apps that feel exciting in week one, tolerable in week two, and disposable by month two.`
          }
        ]
      },
      {
        title: 'The Solution: The GROWTH Architecture',
        blocks: [
          {
            type: 'paragraph',
            text: `The Growth Mindset Skill addresses those gaps through a six-phase GROWTH framework. Each phase targets a distinct neuro-cognitive need while keeping the full coaching loop coherent and adaptive.`
          },
          {
            type: 'table',
            columns: ['Phase', 'Focus', 'Neuro-cognitive target'],
            rows: [
              ['GROUND', 'Assessment and mindset', 'Prefrontal cortex engagement'],
              ['REFRAME', 'Cognitive restructuring', 'Override automatic negative thoughts'],
              ['ORCHESTRATE', 'Behavior design', 'Basal ganglia encoding'],
              ['WORK', 'Deliberate practice', 'Myelination of skill pathways'],
              ['TRIUMPH', 'Celebration', 'Dopamine reinforcement'],
              ['HABITUATE', 'Automaticity', 'Basal ganglia takeover']
            ]
          },
          {
            type: 'paragraph',
            text: `This architecture integrates research from Carol Dweck, James Prochaska, Edward Deci, Richard Ryan, BJ Fogg, Anders Ericsson, and modern neuroplasticity science. The result is a system that meets users where they are, adapts to their constraints, and helps change actually stick.`
          }
        ]
      },
      {
        title: 'Phase 1: GROUND',
        eyebrow: 'The neuroplasticity awakening',
        blocks: [
          {
            type: 'paragraph',
            text: `Many people start from a fixed identity story: I am not disciplined, I am not technical, I am too old, I am not naturally consistent. Those beliefs get experienced as facts rather than as interpretations.`
          },
          {
            type: 'paragraph',
            text: `GROUND starts by teaching the science of change in plain language. The brain is plastic. Repetition, attention, and feedback reshape neural pathways. Effort is not a sign of limitation; it is the mechanism by which capacity expands.`
          },
          {
            type: 'paragraph',
            text: `That mindset shift matters. When people understand that skill is built, effort becomes less threatening and more meaningful. Blackwell et al. (2007) showed that teaching brain plasticity can increase motivation and resilience because it changes what struggle means.`
          }
        ]
      },
      {
        title: 'Phase 2: REFRAME',
        eyebrow: 'The 4-step protocol',
        blocks: [
          {
            type: 'paragraph',
            text: `Fixed-mindset thoughts are fast, automatic, and sticky. I cannot do this. I always mess this up. Other people are naturally better. REFRAME treats those reactions as patterns to observe and retrain.`
          },
          {
            type: 'bullet-list',
            items: [
              'ACCEPT: Acknowledge the thought without judgment.',
              'OBSERVE: Notice when it appears and what triggers it.',
              'NAME: Give it a persona such as The Critic or The Protector.',
              'EDUCATE: Answer it with growth-oriented, evidence-based self-talk.'
            ]
          },
          {
            type: 'paragraph',
            text: `This is not empty positivity. It is structured cognitive reframing grounded in decades of research. Huang et al. (2025) found that attribution training can materially reduce fear-of-failure effects by changing how people interpret setbacks.`
          }
        ]
      },
      {
        title: 'Phase 3: ORCHESTRATE',
        eyebrow: 'Behavior design that actually works',
        blocks: [
          {
            type: 'paragraph',
            text: `Most coaching tells you what matters. ORCHESTRATE designs how action will happen in real life. It uses the Fogg Behavior Model: behavior emerges when motivation, ability, and prompt line up at the same time.`
          },
          {
            type: 'bullet-list',
            items: [
              'Autonomy: the user has meaningful choice in how the behavior is executed.',
              'Competence: the challenge is progressive, measurable, and supported by feedback.',
              'Relatedness: the action is tied to values, identity, and relationships that matter.'
            ]
          },
          {
            type: 'paragraph',
            text: `The system starts small on purpose. Tiny behaviors lower resistance, create evidence of follow-through, and generate momentum that can compound.`
          }
        ]
      },
      {
        title: 'Phase 4: WORK',
        eyebrow: 'Deliberate practice, not just repetition',
        blocks: [
          {
            type: 'paragraph',
            text: `This is where many coaching systems fail. They push repetition without structure. But repetition alone does not create expertise. Deliberate practice does.`
          },
          {
            type: 'bullet-list',
            items: [
              'Well-defined goals focused on specific skills, not vague performance outcomes.',
              'Motivation to improve through effortful, focused attention.',
              'Immediate feedback that helps the user correct errors in real time.',
              'Repetition with incremental refinement rather than mechanical looping.',
              'Full concentration instead of multitasking or passive exposure.'
            ]
          },
          {
            type: 'paragraph',
            text: `The Growth Mindset Skill helps users break goals into component skills, create feedback loops, and increase difficulty by roughly 10 to 15 percent when mastery is visible. That is how expertise grows in practice.`
          }
        ]
      },
      {
        title: 'Phase 5: TRIUMPH',
        eyebrow: 'The neuroscience of celebration',
        blocks: [
          {
            type: 'paragraph',
            text: `Emotion accelerates habit formation. When progress is recognized in a way that is specific, timely, and authentic, the brain marks the associated behavior as worth repeating.`
          },
          {
            type: 'paragraph',
            text: `TRIUMPH teaches users to celebrate process quality, not only outcomes. The important reinforcement is not You are talented. It is Your strategy worked. Your preparation improved. Your consistency changed the result.`
          },
          {
            type: 'paragraph',
            text: `That shift matters because it reinforces controllable mechanisms instead of unstable identity labels.`
          }
        ]
      },
      {
        title: 'Phase 6: HABITUATE',
        eyebrow: 'Identity transformation',
        blocks: [
          {
            type: 'paragraph',
            text: `The final goal is not isolated behavior change. It is identity-level integration. The shift from I am trying to work out to I am someone who prioritizes fitness changes how future decisions get made.`
          },
          {
            type: 'paragraph',
            text: `As behaviors move from prefrontal effort to basal ganglia automaticity, they stop depending so heavily on willpower. They become part of the person rather than tasks the person keeps negotiating with.`
          }
        ]
      },
      {
        title: 'The Recursive Self-Improvement Connection',
        eyebrow: 'Where AI research meets growth mindset',
        blocks: [
          {
            type: 'paragraph',
            text: `Recent AI research gives us a sharper language for what high-performance coaching has always been doing. Recursive self-improvement, or RSI, describes a loop where a system identifies weakness, proposes an improvement, tests it, measures the result, integrates the gain, and repeats.`
          },
          {
            type: 'paragraph',
            text: `That is exactly the kind of disciplined iteration growth mindset and deliberate practice have aimed to create in humans. The difference is that AI research has made the loop more explicit, more measurable, and easier to operationalize.`
          }
        ]
      },
      {
        title: 'What Is Recursive Self-Improvement?',
        blocks: [
          {
            type: 'paragraph',
            text: `In March 2026, Andrej Karpathy published autoresearch, an open-source system in which an AI agent ran experiments on its own training code, evaluated outcomes, committed improvements, and looped again. Over roughly two days, the system ran about 700 experiments, discovered a stack of useful optimizations, and produced an 11 percent training speedup on a small language model.`
          },
          {
            type: 'paragraph',
            text: `The core principle is simple: each iteration makes the next iteration better. That same principle is central to human development. Coaching works when people can diagnose weakness, test a better strategy, learn from the result, and repeat with increasing precision.`
          },
          {
            type: 'callout',
            title: 'Key insight',
            text: `RSI is not only an AI concept. It is a formal description of what effective growth-minded humans do when they learn deliberately.`
          }
        ]
      },
      {
        title: 'The Deep Alignment: RSI and the Growth Mindset Literature',
        blocks: [
          {
            type: 'numbered-list',
            items: [
              {
                title: 'The loop structure mirrors deliberate practice',
                text: `Karpathy's loop - identify weakness, form a hypothesis, test it, evaluate results, integrate the learning, repeat - maps directly onto Ericsson's deliberate practice model. Both reject mindless repetition in favor of targeted, feedback-rich iteration.`
              },
              {
                title: 'Neuroplasticity is the biological version of RSI',
                text: `Human recursive improvement is powered by neural rewiring. Focused effort, repetition, and feedback strengthen pathways, deepen myelination, and shift behaviors from effortful control to automaticity.`
              },
              {
                title: 'Reframing is a form of error correction',
                text: `An RSI system treats failed experiments as information, not identity collapse. Dweck's reframe protocol does the same thing in human cognition by turning I failed, therefore I am incapable into I failed, therefore I have better data.`
              },
              {
                title: 'Small stacked gains behave like tiny habits',
                text: `Autoresearch showed that no single optimization created the outcome by itself. The win came from many smaller gains compounding together. That is the same principle that powers BJ Fogg's tiny habits approach.`
              },
              {
                title: 'Autonomy matters in both systems',
                text: `Karpathy's agent had a clear objective and constraints, but freedom in how to explore. Self-Determination Theory predicts the same thing for humans: autonomy increases intrinsic motivation and strengthens persistence.`
              }
            ]
          }
        ]
      },
      {
        title: 'What RSI Adds to Growth Mindset',
        blocks: [
          {
            type: 'numbered-list',
            items: [
              {
                title: 'Systematic looping',
                text: `Growth mindset has always valued iteration, but RSI makes the loop visible and disciplined. Improvement becomes a protocol rather than a vague aspiration.`
              },
              {
                title: 'Parallel experimentation',
                text: `Instead of overcommitting to one strategy for too long, RSI encourages multiple small tests in parallel. Human learners can do the same thing by trialing several tactics in the same time window and measuring what works.`
              },
              {
                title: 'Transfer across scales',
                text: `Autoresearch showed that small-model wins can transfer upward. In human performance, the same pattern validates low-stakes drills and micro-skill training as legitimate preparation for high-stakes execution.`
              },
              {
                title: 'Compounding returns',
                text: `Each gain does not just improve output. It improves the quality of future improvement cycles. Better reflection, better feedback interpretation, and better experimentation create nonlinear returns over time.`
              },
              {
                title: 'Collaborative human-AI RSI',
                text: `The most important implication is partnership. Humans provide values, goals, emotional nuance, and real-world experimentation. AI provides systematic looping, structured feedback, and consistency. Together they form a stronger recursive system than either could alone.`
              }
            ]
          }
        ]
      },
      {
        title: 'The Impact: Why This Changes Everything',
        blocks: [
          {
            type: 'paragraph',
            text: `For individuals, this means coaching that understands mindset, teaches the science of change, structures deliberate practice, reinforces the right wins, and compounds improvement over time.`
          },
          {
            type: 'paragraph',
            text: `For coaches and builders, it creates a usable framework with stage-appropriate interventions, better decision-making logic, reusable prompts, and looping structures that actually accelerate change.`
          },
          {
            type: 'paragraph',
            text: `For the broader industry, it marks a transition from conversational AI to transformational AI. The opportunity is no longer just to make coaching more available. It is to make it more behaviorally accurate and more durable.`
          }
        ]
      },
      {
        title: 'The AI Coaching Gap',
        eyebrow: 'From conversational AI to transformational AI',
        blocks: [
          {
            type: 'table',
            columns: ['Goal area', 'Chatbot advice', 'GROWTH mindset coaching'],
            rows: [
              ['Meditation', 'Reminds you to meditate.', 'Understands why you resist meditation and designs a path through that resistance.'],
              ['Fitness', 'Celebrates your daily steps.', 'Teaches deliberate-practice skills so you actually improve instead of merely logging activity.'],
              ['Goal achievement', 'Tracks your goals.', 'Runs recursive self-improvement loops that help rewire identity in support of the goal.'],
              ['Diabetes management', 'Sends glucose reminders.', 'Uncovers emotional and behavioral triggers, then builds coping routines that can stick.'],
              ['Mental health', 'Suggests breathing exercises.', 'Identifies recurring anxiety patterns, reframes their underlying beliefs, and progressively builds distress tolerance.'],
              ['Weight loss', 'Counts calories.', 'Addresses self-sabotage patterns and helps build an identity around health rather than restriction.'],
              ['Marathon training', 'Prescribes weekly mileage.', 'Detects shifts from growth to avoidance and adapts both training and psychology in real time.'],
              ['Sobriety and recovery', 'Counts sober days.', 'Maps relapse triggers, builds stage-appropriate resilience strategies, and compounds recovery gains over time.'],
              ['Productivity', 'Sends motivational quotes.', 'Diagnoses the specific fear or belief blocking output and builds a feedback loop that turns small wins into momentum.'],
              ['Sleep', 'Logs sleep hours.', 'Identifies thought patterns that disrupt rest, builds a tailored wind-down protocol, and iterates until recovery becomes more automatic.']
            ]
          },
          {
            type: 'paragraph',
            text: `The GROWTH Mindset Skill is a step-change because it moves AI coaching beyond reminders, tracking, and generic encouragement into recursive, identity-level transformation.`
          }
        ]
      },
      {
        title: 'The Future: AI-Human Coaching Partnership',
        blocks: [
          {
            type: 'paragraph',
            text: `The future is not AI instead of human coaching. It is AI amplifying human coaching.`
          },
          {
            type: 'bullet-list',
            items: [
              'AI handles 24/7 availability, structured check-ins, evidence-based protocol execution, real-time adjustment, and systematic recursive improvement loops.',
              'Humans handle emotional complexity, contextual nuance, therapy when needed, ethical judgment, and the irreplaceable force of genuine presence.'
            ]
          },
          {
            type: 'paragraph',
            text: `Together, they create coaching that is simultaneously scalable and personal, rigorous and compassionate, data-driven and deeply human.`
          }
        ]
      },
      {
        title: 'Launching the Future',
        blocks: [
          {
            type: 'paragraph',
            text: `The Growth Mindset Skill is not just a framework. It is a statement about what coaching technology should serve. We believe brains can grow. We believe effort, when structured well and recursively improved, becomes mastery. We believe AI should expand human flourishing, not just efficiency.`
          },
          {
            type: 'paragraph',
            text: `RocketGoals is building the infrastructure for that future. The Growth Mindset Skill is the foundation, and it is only the beginning.`
          }
        ]
      },
      {
        title: 'Try It Yourself',
        blocks: [
          {
            type: 'callout',
            title: 'Experience the framework',
            text: `Take the RocketGoals Growth Mindset Test to experience the first layer of the system in action and see the invisible patterns shaping your own growth profile.`
          }
        ]
      },
      {
        title: 'Join the Revolution',
        blocks: [
          {
            type: 'paragraph',
            text: `The future of coaching is agentic, adaptive, and aligned with human potential. It does not replace human connection. It amplifies human growth through behavioral science, recursive self-improvement, and thoughtful AI systems.`
          },
          {
            type: 'paragraph',
            text: `The Growth Mindset Skill v1.0 is available now. If you want to explore the framework, collaborate, or bring it into your coaching practice, RocketGoals is building in the open and moving fast.`
          }
        ]
      }
    ],
    citations: [
      'Blackwell, L. S., et al. (2007). Implicit theories of intelligence predict achievement. Child Development, 78(1), 246-263.',
      'Dweck, C. S. (2006). Mindset: The New Psychology of Success. Random House.',
      'Ericsson, K. A., and Pool, R. (2016). Peak: Secrets from the New Science of Expertise.',
      'Fogg, B. J. (2019). Tiny Habits.',
      'Huang, D., et al. (2025). Attribution training in mitigating choking. Frontiers in Psychology.',
      'Karpathy, A. (2026). Autoresearch: Autonomous AI research loops. GitHub, open-source project.',
      'Ryan, R. M., and Deci, E. L. (2000). Self-determination theory. Psychological Inquiry.'
    ]
  }
];

export function getInternalBlogPostBySlug(slug: string | null | undefined): InternalBlogPost | null {
  if (!slug) {
    return null;
  }

  return INTERNAL_BLOG_POSTS.find(post => post.slug === slug) ?? null;
}

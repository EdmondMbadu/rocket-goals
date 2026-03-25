export const DEFAULT_COACH_PHILOSOPHY =
  'Every RocketGoals coach follows the RocketGoals philosophy, turning ambition into practical systems through clear priorities, disciplined action, and real accountability.';

export const COACH_CATEGORIES = [
  'Business',
  'Health',
  'Fitness',
  'Career',
  'Creative',
  'Learning',
  'Sales',
  'Founder',
  'Custom'
] as const;

export function buildCoachPersonalityRefinementPrompt(params: {
  category: string;
  coachName: string;
  philosophy: string;
  seed: string;
}): string {
  const { category, coachName, philosophy, seed } = params;

  return `You are helping create an AI coach profile inside RocketGoals.

Coach category: ${category}
Coach name: ${coachName || 'Unnamed coach'}
RocketGoals philosophy: ${philosophy}

User draft:
${seed}

Rewrite this into a clearer, stronger coach profile the user can edit.
Requirements:
- Keep it concise: 4 to 6 sentences.
- Make the coach feel specific and credible.
- Include coaching style, domain expertise, accountability style, and how progress is measured.
- Keep the tone practical, motivating, and aligned with RocketGoals.
- Return only the rewritten profile text.`;
}

export function normalizeCoachPersonality(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildFallbackCoachPersonality(params: {
  seed: string;
  category: string;
  coachName: string;
}): string {
  const cleanedSeed = params.seed.replace(/\s+/g, ' ').trim();
  const category = params.category.toLowerCase();
  const coachName = params.coachName.trim() || 'This coach';

  return `${coachName} is a ${category} coach built around ${cleanedSeed}. They turn big ambitions into a clear weekly plan, keep the user accountable with direct check-ins, and focus on the next highest-leverage action instead of vague motivation. They measure progress through visible milestones, consistent daily effort, and honest review of what is or is not working. Their style stays practical, encouraging, and aligned with the RocketGoals philosophy of clarity, execution, and momentum.`;
}

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

export function buildGoalDescriptionRefinementPrompt(seed: string): string {
  return `You are helping a user define a goal inside RocketGoals.

User draft:
${seed}

Rewrite this into a clearer, more specific goal statement the user can edit.
Requirements:
- Keep it concise: 1 sentence.
- Focus on the concrete outcome, not generic motivation.
- Make it specific and practical.
- Do not add a timeframe unless the user already included one.
- Return only the rewritten goal statement.`;
}

export function buildTeamDescriptionRefinementPrompt(params: {
  seed: string;
  teamName?: string;
  coachTeamLeadName?: string;
}): string {
  const { seed, teamName, coachTeamLeadName } = params;

  return `You are helping a user define a team mission inside RocketGoals.

Team name: ${teamName?.trim() || 'Unnamed team'}
Coach or team lead: ${coachTeamLeadName?.trim() || 'Not provided'}

User draft:
${seed}

Rewrite this into a clearer, stronger team description the user can edit.
Requirements:
- Keep it concise: 2 to 3 sentences.
- Describe the shared mission or outcome the team is driving.
- Make it feel specific, practical, and motivating.
- Return only the rewritten description text.`;
}

export function normalizeCoachPersonality(value: string): string {
  return value
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function normalizeGoalDescription(value: string): string {
  return value
    .replace(/\r\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeTeamDescription(value: string): string {
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

export function buildFallbackGoalDescription(seed: string): string {
  const cleanedSeed = seed.replace(/\s+/g, ' ').trim();
  const withoutLeadIn = cleanedSeed
    .replace(/^my goal is to\s+/i, '')
    .replace(/^i (want|would like|need)\s+to\s+/i, '')
    .replace(/^i'?m trying to\s+/i, '');

  const normalized = withoutLeadIn || cleanedSeed;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1).replace(/[.!?\s]+$/g, '');
}

export function buildFallbackTeamDescription(seed: string): string {
  const cleanedSeed = seed.replace(/\s+/g, ' ').trim();
  const normalized = cleanedSeed.charAt(0).toUpperCase() + cleanedSeed.slice(1).replace(/[.!?\s]+$/g, '');
  return normalized ? `${normalized}.` : '';
}

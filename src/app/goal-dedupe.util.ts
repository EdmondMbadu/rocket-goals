export type GoalLike = {
  id: string;
  answers?: Record<string, unknown> | null;
  primaryGoal?: unknown;
  createdAt?: unknown;
};

export function getGoalTimestampMillis(value: unknown): number {
  if (!value) return 0;

  if (typeof (value as any)?.toMillis === 'function') {
    try {
      const millis = (value as any).toMillis();
      return Number.isFinite(millis) ? millis : 0;
    } catch {
      return 0;
    }
  }

  if (typeof (value as any)?.toDate === 'function') {
    try {
      const date = (value as any).toDate();
      return date instanceof Date ? date.getTime() : 0;
    } catch {
      return 0;
    }
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 0 : value.getTime();
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (typeof value === 'object' && value !== null && 'seconds' in (value as Record<string, unknown>)) {
    const seconds = Number((value as Record<string, unknown>)['seconds']);
    if (Number.isFinite(seconds)) {
      return seconds * 1000;
    }
  }

  return 0;
}

export function extractTeamIdFromGoalId(goalId: string): string {
  if (!goalId.startsWith('team-')) {
    return '';
  }

  const memberMarker = '-member-';
  const memberIndex = goalId.indexOf(memberMarker);
  if (memberIndex > 5) {
    return goalId.slice(5, memberIndex).trim();
  }

  return goalId.slice(5).trim();
}

function normalizeGoalTitleForKey(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function getGoalDedupeKey(goal: GoalLike): string {
  const answers = (goal.answers || {}) as Record<string, unknown>;
  const answerTeamId = typeof answers['teamId'] === 'string' ? answers['teamId'].trim() : '';
  if (answerTeamId) {
    return `team:${answerTeamId}`;
  }

  const teamSharedGoalId = typeof answers['teamSharedGoalId'] === 'string'
    ? answers['teamSharedGoalId'].trim()
    : '';
  if (teamSharedGoalId) {
    const parsedFromSharedGoalId = extractTeamIdFromGoalId(teamSharedGoalId);
    return parsedFromSharedGoalId ? `team:${parsedFromSharedGoalId}` : `team-shared:${teamSharedGoalId}`;
  }

  const teamIdFromGoalId = extractTeamIdFromGoalId(goal.id);
  if (teamIdFromGoalId) {
    return `team:${teamIdFromGoalId}`;
  }

  const normalizedTitle = normalizeGoalTitleForKey(
    goal.primaryGoal
    || answers['goal_title_label']
    || answers['custom_goal_title']
  );
  if (normalizedTitle.endsWith(' team mission')) {
    return `team-title:${normalizedTitle}`;
  }

  return `goal:${goal.id}`;
}

export function isTeamMemberGoal(goal: GoalLike): boolean {
  const answers = (goal.answers || {}) as Record<string, unknown>;
  return answers['teamMemberGoal'] === true;
}

function shouldReplaceDedupedGoal(existing: GoalLike, candidate: GoalLike): boolean {
  const existingMember = isTeamMemberGoal(existing);
  const candidateMember = isTeamMemberGoal(candidate);
  if (existingMember !== candidateMember) {
    return !candidateMember;
  }

  const existingCreatedAt = getGoalTimestampMillis(existing.createdAt);
  const candidateCreatedAt = getGoalTimestampMillis(candidate.createdAt);
  if (existingCreatedAt !== candidateCreatedAt) {
    return candidateCreatedAt > existingCreatedAt;
  }

  return candidate.id < existing.id;
}

export function dedupeGoals<T extends GoalLike>(goals: T[]): T[] {
  if (!goals.length) return goals;

  const keyOrder: string[] = [];
  const deduped = new Map<string, T>();

  for (const goal of goals) {
    if (!goal?.id) continue;
    const key = getGoalDedupeKey(goal);
    const existing = deduped.get(key);

    if (!existing) {
      keyOrder.push(key);
      deduped.set(key, goal);
      continue;
    }

    if (shouldReplaceDedupedGoal(existing, goal)) {
      deduped.set(key, goal);
    }
  }

  return keyOrder
    .map(key => deduped.get(key))
    .filter((goal): goal is T => !!goal);
}

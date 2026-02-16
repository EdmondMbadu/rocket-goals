/* eslint-disable */
/**
 * Progress Tools - AI-callable functions for milestones and mission logs
 */

import * as admin from 'firebase-admin';
import type { FunctionDeclaration, SchemaType } from '@google/generative-ai';
import type { RegisteredTool, ToolResult, ToolExecutionContext } from './types';

const MISSION_ACTION_VALUES = new Set(['yes', 'barely', 'no']);
const MISSION_FOCUS_VALUES = new Set(['full_focus', 'distracted', 'low_energy']);
const MISSION_CHALLENGE_VALUES = new Set(['tough_day', 'average', 'easy']);
const MISSION_FEELING_VALUES = new Set(['positive', 'neutral', 'frustrated']);
const MISSION_TEAM_VALUES = new Set(['yes', 'no', 'solo']);
const MILESTONE_OUTCOME_VALUES = new Set(['success', 'partial', 'needs_improvement', 'skipped']);

function normalizeString(value: unknown, maxLen = 400): string | undefined {
  if (typeof value !== 'string') return undefined;
  const clean = value.trim();
  if (!clean) return undefined;
  return clean.slice(0, maxLen);
}

function normalizeBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  return undefined;
}

function normalizeNumber(value: unknown, min: number, max: number): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeEnum(value: unknown, allowed: Set<string>): string | undefined {
  const normalized = normalizeString(value, 64)?.toLowerCase();
  if (!normalized) return undefined;
  return allowed.has(normalized) ? normalized : undefined;
}

const createMilestoneDeclaration: FunctionDeclaration = {
  name: 'create_milestone',
  description: 'Create a new milestone (action item) for the current goal. Use this when users ask to add a milestone, create a task, or add something to their plan.',
  parameters: {
    type: 'object' as SchemaType,
    properties: {
      title: {
        type: 'string' as SchemaType,
        description: 'Milestone title (required).'
      },
      dayNumber: {
        type: 'number' as SchemaType,
        description: 'Mission day number (1-based). Optional; defaults to 1 if unknown.'
      },
      description: {
        type: 'string' as SchemaType,
        description: 'Optional milestone description.'
      },
      notes: {
        type: 'string' as SchemaType,
        description: 'Optional user notes for this milestone.'
      }
    },
    required: ['title']
  }
};

async function handleCreateMilestone(args: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
  if (!context.goalId) {
    return { success: false, message: 'No goal context available. Cannot create milestone.', sideEffects: [] };
  }

  const title = normalizeString(args.title, 180);
  if (!title) {
    return { success: false, message: 'Milestone title is required.', sideEffects: [] };
  }

  const dayNumber = normalizeNumber(args.dayNumber, 1, 365) ?? 1;
  const description = normalizeString(args.description, 1000);
  const notes = normalizeString(args.notes, 1500);

  try {
    const actionItemsRef = admin.firestore()
      .collection('rocketGoals')
      .doc(context.goalId)
      .collection('actionItems');

    const snapshot = await actionItemsRef.get();
    const sameDayItems = snapshot.docs
      .map(doc => doc.data())
      .filter(item => (item?.dayNumber || 0) === dayNumber);
    const nextOrder = sameDayItems.length > 0
      ? Math.max(...sameDayItems.map(item => Number(item?.order || 0))) + 1
      : 1;

    const docRef = actionItemsRef.doc();
    await docRef.set({
      id: docRef.id,
      goalId: context.goalId,
      title,
      description: description || undefined,
      notes: notes || undefined,
      dayNumber,
      completed: false,
      postponed: false,
      order: nextOrder,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
      success: true,
      message: `Created milestone "${title}" for day ${dayNumber}.`,
      data: { itemId: docRef.id, title, dayNumber },
      sideEffects: [{ type: 'milestone_created', itemId: docRef.id, title }]
    };
  } catch (error: any) {
    console.error('Error creating milestone:', error);
    return { success: false, message: `Failed to create milestone: ${error.message}`, sideEffects: [] };
  }
}

const updateMilestoneDeclaration: FunctionDeclaration = {
  name: 'update_milestone',
  description: 'Update an existing milestone (action item). Use this when users ask to update milestones, edit tasks, rename milestones, mark complete/incomplete, postpone, or add notes.',
  parameters: {
    type: 'object' as SchemaType,
    properties: {
      itemId: {
        type: 'string' as SchemaType,
        description: 'Milestone ID (required). Use the milestone IDs from context.'
      },
      title: {
        type: 'string' as SchemaType,
        description: 'New milestone title.'
      },
      description: {
        type: 'string' as SchemaType,
        description: 'New milestone description.'
      },
      notes: {
        type: 'string' as SchemaType,
        description: 'New milestone notes.'
      },
      dayNumber: {
        type: 'number' as SchemaType,
        description: 'Move milestone to this day number (1-based).'
      },
      completed: {
        type: 'boolean' as SchemaType,
        description: 'Mark milestone complete/incomplete.'
      },
      postponed: {
        type: 'boolean' as SchemaType,
        description: 'Mark milestone postponed/not postponed.'
      },
      outcome: {
        type: 'string' as SchemaType,
        description: 'Outcome value: success, partial, needs_improvement, skipped.'
      },
      outcomeNotes: {
        type: 'string' as SchemaType,
        description: 'Optional notes about outcome.'
      }
    },
    required: ['itemId']
  }
};

async function handleUpdateMilestone(args: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
  if (!context.goalId) {
    return { success: false, message: 'No goal context available. Cannot update milestone.', sideEffects: [] };
  }

  const itemId = normalizeString(args.itemId, 160);
  if (!itemId) {
    return { success: false, message: 'Milestone ID is required.', sideEffects: [] };
  }

  try {
    const itemRef = admin.firestore()
      .collection('rocketGoals')
      .doc(context.goalId)
      .collection('actionItems')
      .doc(itemId);

    const itemDoc = await itemRef.get();
    if (!itemDoc.exists) {
      return { success: false, message: `Milestone not found for ID "${itemId}".`, sideEffects: [] };
    }

    const updateData: any = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    const changes: string[] = [];

    const title = normalizeString(args.title, 180);
    if (title !== undefined) {
      updateData.title = title;
      changes.push(`title to "${title}"`);
    }

    const description = normalizeString(args.description, 1000);
    if (description !== undefined) {
      updateData.description = description;
      changes.push('description');
    }

    const notes = normalizeString(args.notes, 1500);
    if (notes !== undefined) {
      updateData.notes = notes;
      changes.push('notes');
    }

    const dayNumber = normalizeNumber(args.dayNumber, 1, 365);
    if (dayNumber !== undefined) {
      updateData.dayNumber = dayNumber;
      changes.push(`day number to ${dayNumber}`);
    }

    const completed = normalizeBoolean(args.completed);
    if (completed !== undefined) {
      updateData.completed = completed;
      changes.push(completed ? 'marked complete' : 'marked incomplete');
    }

    const postponed = normalizeBoolean(args.postponed);
    if (postponed !== undefined) {
      updateData.postponed = postponed;
      changes.push(postponed ? 'postponed' : 'un-postponed');
    }

    const outcome = normalizeEnum(args.outcome, MILESTONE_OUTCOME_VALUES);
    if (outcome !== undefined) {
      updateData.outcome = outcome;
      changes.push(`outcome set to ${outcome}`);
    }

    const outcomeNotes = normalizeString(args.outcomeNotes, 1500);
    if (outcomeNotes !== undefined) {
      updateData.outcomeNotes = outcomeNotes;
      changes.push('outcome notes');
    }

    await itemRef.update(updateData);
    const existing = itemDoc.data() || {};
    const finalTitle = title || existing.title || 'Milestone';

    return {
      success: true,
      message: changes.length > 0
        ? `Updated milestone "${finalTitle}": ${changes.join(', ')}.`
        : `No changes made to milestone "${finalTitle}".`,
      data: { itemId, changes },
      sideEffects: [{ type: 'milestone_updated', itemId, title: finalTitle }]
    };
  } catch (error: any) {
    console.error('Error updating milestone:', error);
    return { success: false, message: `Failed to update milestone: ${error.message}`, sideEffects: [] };
  }
}

const missionLogDeclaration: FunctionDeclaration = {
  name: 'log_mission_progress',
  description: 'Create a mission log check-in entry for today. Use this when the user says things like "log for me", "submit mission log", or asks to record their execution progress.',
  parameters: {
    type: 'object' as SchemaType,
    properties: {
      actionTaken: {
        type: 'string' as SchemaType,
        description: 'yes | barely | no'
      },
      focusLevel: {
        type: 'string' as SchemaType,
        description: 'full_focus | distracted | low_energy'
      },
      challengeLevel: {
        type: 'string' as SchemaType,
        description: 'tough_day | average | easy'
      },
      feeling: {
        type: 'string' as SchemaType,
        description: 'positive | neutral | frustrated'
      },
      teamConnection: {
        type: 'string' as SchemaType,
        description: 'yes | no | solo'
      },
      note: {
        type: 'string' as SchemaType,
        description: 'Optional short reflection note.'
      },
      intendedOneThing: {
        type: 'string' as SchemaType,
        description: 'Optional ONE Thing intent.'
      }
    }
  }
};

async function handleLogMissionProgress(args: Record<string, any>, context: ToolExecutionContext): Promise<ToolResult> {
  if (!context.goalId) {
    return { success: false, message: 'No goal context available. Cannot log mission progress.', sideEffects: [] };
  }

  try {
    const missionLogsRef = admin.firestore()
      .collection('rocketGoals')
      .doc(context.goalId)
      .collection('missionLogs');

    const latestSnapshot = await missionLogsRef
      .orderBy('createdAtMs', 'desc')
      .limit(1)
      .get();
    const latest = latestSnapshot.empty ? null : latestSnapshot.docs[0].data();

    const actionTaken = normalizeEnum(args.actionTaken, MISSION_ACTION_VALUES)
      || normalizeEnum(latest?.actionTaken, MISSION_ACTION_VALUES)
      || 'yes';
    const focusLevel = normalizeEnum(args.focusLevel, MISSION_FOCUS_VALUES)
      || normalizeEnum(latest?.focusLevel, MISSION_FOCUS_VALUES)
      || 'full_focus';
    const challengeLevel = normalizeEnum(args.challengeLevel, MISSION_CHALLENGE_VALUES)
      || normalizeEnum(latest?.challengeLevel, MISSION_CHALLENGE_VALUES)
      || 'average';
    const feeling = normalizeEnum(args.feeling, MISSION_FEELING_VALUES)
      || normalizeEnum(latest?.feeling, MISSION_FEELING_VALUES)
      || 'neutral';
    const teamConnection = normalizeEnum(args.teamConnection, MISSION_TEAM_VALUES)
      || normalizeEnum(latest?.teamConnection, MISSION_TEAM_VALUES)
      || 'solo';
    const note = normalizeString(args.note, 2000);
    const intendedOneThing = normalizeString(args.intendedOneThing, 500);

    const now = new Date();
    const dateId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const docRef = missionLogsRef.doc();

    await docRef.set({
      id: docRef.id,
      goalId: context.goalId,
      dateId,
      actionTaken,
      focusLevel,
      challengeLevel,
      feeling,
      teamConnection,
      note: note || undefined,
      intendedOneThing: intendedOneThing || undefined,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAtMs: Date.now()
    });

    return {
      success: true,
      message: 'Mission log saved for today.',
      data: { missionLogId: docRef.id, dateId },
      sideEffects: [{ type: 'mission_log_created', missionLogId: docRef.id, dateId }]
    };
  } catch (error: any) {
    console.error('Error logging mission progress:', error);
    return { success: false, message: `Failed to save mission log: ${error.message}`, sideEffects: [] };
  }
}

export const progressTools: RegisteredTool[] = [
  { declaration: createMilestoneDeclaration, handler: handleCreateMilestone },
  { declaration: updateMilestoneDeclaration, handler: handleUpdateMilestone },
  { declaration: missionLogDeclaration, handler: handleLogMissionProgress }
];


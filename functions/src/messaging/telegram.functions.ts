/* eslint-disable */
// @ts-nocheck
import * as functions from "firebase-functions/v1";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import type { TelegramUpdate, TelegramToUser, TelegramLinkToken } from "./telegram.types";

// Secrets
const telegramBotToken = defineSecret('TELEGRAM_BOT_TOKEN');
const geminiApiKey = defineSecret('GEMINI_API_KEY');

// Constants
const LINK_TOKEN_EXPIRY_MINUTES = 15;
const MAX_CONVERSATION_HISTORY = 20;
const SHARED_COACH_PHILOSOPHY_CACHE_TTL_MS = 5 * 60 * 1000;
let sharedCoachPhilosophyCacheValue = '';
let sharedCoachPhilosophyCacheLoadedAt = 0;

// Store user's selected goal in Firestore (telegramToUser document)
interface TelegramUserPrefs {
  selectedGoalId?: string;
}

function getTimestampMs(value: any): number | null {
  if (!value) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function getCurrentMissionDay(startTimeMs: number | null): number {
  if (!startTimeMs) return 1;
  const now = new Date();
  const start = new Date(startTimeMs);
  now.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  const elapsedDays = Math.floor((now.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  return Math.max(1, elapsedDays);
}

async function getSharedCoachPhilosophy(): Promise<string> {
  const now = Date.now();
  if (
    sharedCoachPhilosophyCacheLoadedAt > 0 &&
    now - sharedCoachPhilosophyCacheLoadedAt < SHARED_COACH_PHILOSOPHY_CACHE_TTL_MS
  ) {
    return sharedCoachPhilosophyCacheValue;
  }

  try {
    const snapshot = await admin.firestore()
      .collection('coachPromptSettings')
      .doc('global')
      .get();
    const data = snapshot.exists ? snapshot.data() : null;
    sharedCoachPhilosophyCacheValue = (data?.rocketGoalsPhilosophy || '').toString().trim();
  } catch (error) {
    console.error('Failed to load shared coach philosophy for Telegram:', error);
    sharedCoachPhilosophyCacheValue = '';
  }

  sharedCoachPhilosophyCacheLoadedAt = now;
  return sharedCoachPhilosophyCacheValue;
}

function formatMilestoneDate(startTimeMs: number | null, dayNumber: number): string {
  if (!startTimeMs || !Number.isFinite(dayNumber)) return `Day ${dayNumber}`;
  const date = new Date(startTimeMs + (dayNumber - 1) * 24 * 60 * 60 * 1000);
  const dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${dateLabel} · Day ${dayNumber}`;
}

function escapeMarkdown(text: string): string {
  return (text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/`/g, '\\`');
}

/**
 * Send a message via Telegram Bot API
 */
async function sendTelegramMessage(
  chatId: number,
  text: string,
  botToken: string,
  parseMode: 'Markdown' | 'MarkdownV2' | 'HTML' | null = 'Markdown',
  messageThreadId: number | null = null
): Promise<boolean> {
  try {
    const payload: Record<string, any> = {
      chat_id: chatId,
      text: text
    };
    if (parseMode) {
      payload.parse_mode = parseMode;
    }
    if (Number.isFinite(messageThreadId) && Number(messageThreadId) > 0) {
      payload.message_thread_id = Number(messageThreadId);
    }

    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Telegram API error:', errorData);

      // Retry without parse_mode if Markdown formatting caused the failure
      if (parseMode && errorData?.description?.includes("can't parse")) {
        console.warn('Retrying Telegram message without Markdown formatting');
        const fallbackPayload: Record<string, any> = { chat_id: chatId, text: text.replace(/[*_`\[\]()~>#+\-=|{}.!\\]/g, '') };
        if (Number.isFinite(messageThreadId) && Number(messageThreadId) > 0) {
          fallbackPayload.message_thread_id = Number(messageThreadId);
        }
        const fallbackResp = await fetch(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fallbackPayload)
          }
        );
        if (fallbackResp.ok) return true;
        console.error('Telegram fallback also failed');
      }

      return false;
    }

    return true;
  } catch (error) {
    console.error('Error sending Telegram message:', error);
    return false;
  }
}

/**
 * Send a photo with caption via Telegram Bot API
 */
async function sendTelegramPhoto(
  chatId: number,
  photoUrl: string,
  caption: string,
  botToken: string,
  messageThreadId: number | null = null
): Promise<boolean> {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendPhoto`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          photo: photoUrl,
          caption: caption,
          parse_mode: 'Markdown',
          ...(Number.isFinite(messageThreadId) && Number(messageThreadId) > 0
            ? { message_thread_id: Number(messageThreadId) }
            : {})
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Telegram API error (photo):', errorData);
      // Fallback to text-only message
      return sendTelegramMessage(chatId, caption, botToken, 'Markdown', messageThreadId);
    }

    return true;
  } catch (error) {
    console.error('Error sending Telegram photo:', error);
    // Fallback to text-only message
    return sendTelegramMessage(chatId, caption, botToken, 'Markdown', messageThreadId);
  }
}

type TelegramThreadContext =
  | { type: 'general' }
  | { type: 'participant'; participantUserId: string };

function sanitizeTopicTitle(value: string, fallback: string): string {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  const candidate = raw || fallback;
  return candidate.slice(0, 120);
}

function buildParticipantThreadDocId(participantUserId: string): string {
  const normalized = String(participantUserId || '').trim().replace(/[^\w-]/g, '_');
  return `participant_${normalized || 'unknown'}`;
}

function getTelegramMessageThreadId(message: any): number | null {
  const value = Number(message?.message_thread_id);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

function getTeamMemberDisplayName(teamData: any, userId: string, fallback = 'Participant'): string {
  const members = Array.isArray(teamData?.members) ? teamData.members : [];
  const member = members.find((item: any) => String(item?.userId || '').trim() === String(userId || '').trim());
  if (!member) {
    return fallback;
  }
  const fullName = `${String(member.firstName || '').trim()} ${String(member.lastName || '').trim()}`.trim();
  return fullName || member.email || fallback;
}

function buildGoalThreadTitle(goalTitle: string): string {
  return sanitizeTopicTitle(`Goal • ${goalTitle}`, 'Goal • Your Goal');
}

async function createTelegramForumTopic(chatId: number, title: string, botToken: string): Promise<number | null> {
  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/createForumTopic`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        name: title
      })
    });
    const data = await response.json();
    if (!data?.ok) {
      console.warn(`Unable to create Telegram forum topic "${title}" in chat ${chatId}:`, data);
      return null;
    }
    const threadId = Number(data?.result?.message_thread_id);
    if (!Number.isFinite(threadId) || threadId <= 0) {
      return null;
    }
    return threadId;
  } catch (error) {
    console.warn(`Unable to create Telegram forum topic "${title}" in chat ${chatId}:`, error);
    return null;
  }
}

async function exportTelegramChatInviteLinkDetailed(chatId: number, botToken: string): Promise<{
  inviteLink: string | null;
  error: string | null;
  resolvedChatId: number | null;
}> {
  const exportInviteLink = async (targetChatId: number) => {
    const inviteResp = await fetch(
      `https://api.telegram.org/bot${botToken}/exportChatInviteLink`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: targetChatId })
      }
    );
    return inviteResp.json();
  };

  try {
    const inviteData = await exportInviteLink(chatId);
    if (inviteData.ok && inviteData.result) {
      return {
        inviteLink: String(inviteData.result),
        error: null,
        resolvedChatId: chatId
      };
    }

    const migratedChatId = Number(inviteData?.parameters?.migrate_to_chat_id);
    if (Number.isFinite(migratedChatId) && migratedChatId !== chatId) {
      console.warn(`Telegram chat ${chatId} was upgraded. Retrying invite-link export with ${migratedChatId}.`);
      const migratedInviteData = await exportInviteLink(migratedChatId);
      if (migratedInviteData.ok && migratedInviteData.result) {
        return {
          inviteLink: String(migratedInviteData.result),
          error: null,
          resolvedChatId: migratedChatId
        };
      }
      console.warn(`Failed to export Telegram invite link for migrated chat ${migratedChatId}:`, migratedInviteData);
      return {
        inviteLink: null,
        error: String(migratedInviteData?.description || migratedInviteData?.error_code || 'Unknown Telegram error'),
        resolvedChatId: migratedChatId
      };
    }

    console.warn(`Failed to export Telegram invite link for chat ${chatId}:`, inviteData);
    return {
      inviteLink: null,
      error: String(inviteData?.description || inviteData?.error_code || 'Unknown Telegram error'),
      resolvedChatId: null
    };
  } catch (error) {
    console.error(`Failed to export Telegram invite link for chat ${chatId}:`, error);
    return {
      inviteLink: null,
      error: error instanceof Error ? error.message : 'Unknown error',
      resolvedChatId: null
    };
  }
}

function telegramErrorNeedsReconnect(error: string | null): boolean {
  const normalized = String(error || '').toLowerCase();
  return (
    normalized.includes('kicked from the supergroup chat') ||
    normalized.includes('chat not found')
  );
}

async function getOrCreateParticipantThreadId(params: {
  teamId: string;
  groupChatId: number;
  participantUserId: string;
  participantName: string;
  botToken: string;
}): Promise<number | null> {
  const { teamId, groupChatId, participantUserId, participantName, botToken } = params;
  const threadDocId = buildParticipantThreadDocId(participantUserId);
  const threadRef = admin.firestore()
    .collection('teams')
    .doc(teamId)
    .collection('telegramThreads')
    .doc(threadDocId);

  const existing = await threadRef.get();
  const existingThreadId = Number(existing.data()?.threadId);
  if (Number.isFinite(existingThreadId) && existingThreadId > 0) {
    return existingThreadId;
  }

  const topicTitle = sanitizeTopicTitle(`Direct • ${participantName}`, 'Direct • Participant');
  const createdThreadId = await createTelegramForumTopic(groupChatId, topicTitle, botToken);
  if (!createdThreadId) {
    return null;
  }

  const payload: Record<string, any> = {
    id: threadDocId,
    type: 'participant',
    participantUserId,
    title: topicTitle,
    threadId: createdThreadId,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
  if (!existing.exists) {
    payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
  }
  await threadRef.set(payload, { merge: true });
  return createdThreadId;
}

async function getOrCreateTelegramGoalThreadId(params: {
  userId: string;
  chatId: number;
  goalId: string;
  goalTitle: string;
  botToken: string;
}): Promise<number | null> {
  const { userId, chatId, goalId, goalTitle, botToken } = params;
  const normalizedGoalId = String(goalId || '').trim();
  if (!normalizedGoalId) {
    return null;
  }

  const threadRef = admin.firestore()
    .collection('userProfiles')
    .doc(userId)
    .collection('telegramGoalThreads')
    .doc(normalizedGoalId);

  const existing = await threadRef.get();
  const existingThreadId = Number(existing.data()?.threadId);
  const threadTitle = buildGoalThreadTitle(goalTitle);

  if (Number.isFinite(existingThreadId) && existingThreadId > 0) {
    await threadRef.set({
      goalId: normalizedGoalId,
      title: threadTitle,
      chatId,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return existingThreadId;
  }

  const createdThreadId = await createTelegramForumTopic(chatId, threadTitle, botToken);
  if (!createdThreadId) {
    return null;
  }

  const payload: Record<string, any> = {
    goalId: normalizedGoalId,
    title: threadTitle,
    chatId,
    threadId: createdThreadId,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };
  if (!existing.exists) {
    payload.createdAt = admin.firestore.FieldValue.serverTimestamp();
  }

  await threadRef.set(payload, { merge: true });
  return createdThreadId;
}

async function resolveGoalIdFromTelegramThread(
  userId: string,
  messageThreadId: number | null
): Promise<string | null> {
  if (!Number.isFinite(messageThreadId) || Number(messageThreadId) <= 0) {
    return null;
  }

  const snapshot = await admin.firestore()
    .collection('userProfiles')
    .doc(userId)
    .collection('telegramGoalThreads')
    .where('threadId', '==', Number(messageThreadId))
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const data = snapshot.docs[0].data() || {};
  const goalId = String(data.goalId || snapshot.docs[0].id || '').trim();
  return goalId || null;
}

async function resolveSelectedGoalIdForTelegramMessage(
  userId: string,
  telegramId: string,
  messageThreadId: number | null
): Promise<string | null> {
  const threadGoalId = await resolveGoalIdFromTelegramThread(userId, messageThreadId);
  if (threadGoalId) {
    const selectedGoalId = await getSelectedGoalId(telegramId);
    if (selectedGoalId !== threadGoalId) {
      try {
        await setSelectedGoalId(telegramId, threadGoalId);
      } catch (error) {
        console.warn(`Unable to persist Telegram selectedGoalId ${threadGoalId} for ${telegramId}:`, error);
      }
    }
    return threadGoalId;
  }

  return getSelectedGoalId(telegramId);
}

async function activateTelegramGoalThread(params: {
  userId: string;
  telegramId: string;
  chatId: number;
  goalContext: any;
  botToken: string;
  sendThreadIntro?: boolean;
  sendGeneralNotice?: boolean;
}): Promise<number | null> {
  const {
    userId,
    telegramId,
    chatId,
    goalContext,
    botToken,
    sendThreadIntro = true,
    sendGeneralNotice = false
  } = params;

  const goalId = String(goalContext?.id || '').trim();
  if (!goalId) {
    return null;
  }

  const goalTitle = String(goalContext?.title || goalContext?.primaryGoal || 'Your Goal').trim() || 'Your Goal';
  const threadId = await getOrCreateTelegramGoalThreadId({
    userId,
    chatId,
    goalId,
    goalTitle,
    botToken
  });

  await setSelectedGoalId(telegramId, goalId);

  if (!threadId) {
    return null;
  }

  if (sendThreadIntro) {
    const coachName = goalContext?.teamAiSettings?.displayName || goalContext?.copilot?.name || 'AI Coach';
    const coachAvatar = goalContext?.teamAiSettings?.avatarUrl || goalContext?.copilot?.avatar;
    const introMessage =
      `*${escapeMarkdown(goalTitle)}*\n` +
      `Coach: ${escapeMarkdown(coachName)}\n\n` +
      `This goal now has its own Telegram topic. Continue here so this conversation stays separate.`;

    if (coachAvatar) {
      await sendTelegramPhoto(chatId, coachAvatar, introMessage, botToken, threadId);
    } else {
      await sendTelegramMessage(chatId, introMessage, botToken, 'Markdown', threadId);
    }
  }

  if (sendGeneralNotice) {
    await sendTelegramMessage(
      chatId,
      `Opened *${escapeMarkdown(goalTitle)}* in its own Telegram topic. Continue there so this goal stays separate.`,
      botToken
    );
  }

  return threadId;
}

async function resolveTelegramThreadContext(teamId: string, messageThreadId: number | null): Promise<TelegramThreadContext> {
  if (!Number.isFinite(messageThreadId) || Number(messageThreadId) <= 0) {
    return { type: 'general' };
  }

  const threadSnapshot = await admin.firestore()
    .collection('teams')
    .doc(teamId)
    .collection('telegramThreads')
    .where('threadId', '==', Number(messageThreadId))
    .limit(1)
    .get();

  if (threadSnapshot.empty) {
    return { type: 'general' };
  }

  const data = threadSnapshot.docs[0].data() || {};
  if (data.type === 'participant' && typeof data.participantUserId === 'string' && data.participantUserId.trim()) {
    return {
      type: 'participant',
      participantUserId: data.participantUserId.trim()
    };
  }

  return { type: 'general' };
}

/**
 * Find RocketGoals user by Telegram ID
 */
async function findUserByTelegramId(telegramId: string): Promise<TelegramToUser | null> {
  const doc = await admin.firestore()
    .collection('telegramToUser')
    .doc(telegramId)
    .get();

  if (!doc.exists) return null;
  return doc.data() as TelegramToUser;
}

/**
 * Get ALL active goals for a user (for /goals command)
 */
async function getAllActiveGoals(userId: string): Promise<any[]> {
  try {
    const goalsSnapshot = await admin.firestore()
      .collection("rocketGoals")
      .where("userId", "==", userId)
      .where("status", "==", "active")
      .limit(10)
      .get();

    if (goalsSnapshot.empty) return [];

    const goals = await Promise.all(goalsSnapshot.docs.map(async (doc) => {
      const data = doc.data();
      const teamAiSettings = await resolveTeamAiSettingsForGoal(doc.id, data?.answers || {});
      return {
        id: doc.id,
        title: data.primaryGoal || data.answers?.primary_goal || "Untitled Goal",
        copilot: data.copilot,
        teamAiSettings,
        createdAt: data.createdAt?.toMillis?.() || 0,
      };
    }));

    return goals.sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    console.error("Error getting all goals:", error);
    return [];
  }
}

function extractTeamIdFromGoal(goalId: string, answers: any): string | null {
  const answerTeamId = typeof answers?.teamId === 'string' ? answers.teamId.trim() : '';
  if (answerTeamId) {
    return answerTeamId;
  }

  const normalizedGoalId = String(goalId || '').trim();
  if (!normalizedGoalId.startsWith('team-')) {
    return null;
  }

  const memberMatch = normalizedGoalId.match(/^team-(.+?)-member-.+$/);
  if (memberMatch?.[1]) {
    return memberMatch[1].trim();
  }
  return normalizedGoalId.slice('team-'.length).trim() || null;
}

async function resolveTeamAiSettingsForGoal(goalId: string, answers: any): Promise<{ displayName: string; avatarUrl: string; personality: string } | null> {
  const teamId = extractTeamIdFromGoal(goalId, answers);
  if (!teamId) {
    return null;
  }

  try {
    const teamDoc = await admin.firestore().collection('teams').doc(teamId).get();
    if (!teamDoc.exists) {
      return null;
    }

    const teamData = teamDoc.data() || {};
    const aiSettings = (teamData.aiSettings || {}) as Record<string, any>;
    const displayName = String(aiSettings.displayName || '').trim().slice(0, 60);
    const avatarUrl = String(aiSettings.avatarUrl || '').trim().slice(0, 2000);
    const personality = String(aiSettings.personality || '').trim().slice(0, 8000);
    if (!displayName && !avatarUrl && !personality) {
      return null;
    }

    return { displayName, avatarUrl, personality };
  } catch (error) {
    console.warn('Unable to resolve team AI settings for Telegram goal:', error);
    return null;
  }
}

/**
 * Get a specific goal by ID
 */
async function getGoalById(goalId: string, userId: string): Promise<any> {
  try {
    const goalDoc = await admin.firestore()
      .collection("rocketGoals")
      .doc(goalId)
      .get();

    if (!goalDoc.exists) return null;

    const goalData = goalDoc.data();

    // Verify this goal belongs to the user
    if (goalData?.userId !== userId) return null;

    // Get calendar events
    let calendarEvents: any[] = [];
    try {
      const eventsSnapshot = await admin.firestore()
        .collection("rocketGoals")
        .doc(goalId)
        .collection("calendarEvents")
        .limit(20)
        .get();

      calendarEvents = eventsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (e) {
      console.log("Could not fetch calendar events:", e);
    }

    const teamAiSettings = await resolveTeamAiSettingsForGoal(goalDoc.id, goalData?.answers || {});

    return {
      id: goalDoc.id,
      title: goalData?.primaryGoal || goalData?.answers?.primary_goal || "Your Goal",
      primaryGoal: goalData?.primaryGoal,
      status: goalData?.status,
      answers: goalData?.answers || {},
      copilot: goalData?.copilot,
      teamAiSettings,
      startTimeMs: getTimestampMs(goalData?.startTime) ?? getTimestampMs(goalData?.createdAt),
      calendarEvents,
    };
  } catch (error) {
    console.error("Error getting goal by ID:", error);
    return null;
  }
}

/**
 * Get user's selected goal ID from telegramToUser preferences
 */
async function getSelectedGoalId(telegramId: string): Promise<string | null> {
  try {
    const doc = await admin.firestore()
      .collection("telegramToUser")
      .doc(telegramId)
      .get();

    if (!doc.exists) return null;
    return doc.data()?.selectedGoalId || null;
  } catch (error) {
    return null;
  }
}

/**
 * Set user's selected goal ID
 */
async function setSelectedGoalId(telegramId: string, goalId: string): Promise<void> {
  await admin.firestore()
    .collection("telegramToUser")
    .doc(telegramId)
    .update({ selectedGoalId: goalId });
}

/**
 * Get user's active goal and context
 */
async function getActiveGoalContext(userId: string, selectedGoalId?: string | null): Promise<any> {
  try {
    // If a specific goal is selected, use that one
    if (selectedGoalId) {
      const specificGoal = await getGoalById(selectedGoalId, userId);
      if (specificGoal) return specificGoal;
      // Fall through to default if selected goal not found
    }

    // Get user's active goals - simplified query to avoid index issues
    const goalsSnapshot = await admin.firestore()
      .collection("rocketGoals")
      .where("userId", "==", userId)
      .where("status", "==", "active")
      .limit(5)
      .get();

    if (goalsSnapshot.empty) return null;

    // Sort by createdAt manually to avoid compound index requirement
    const sortedDocs = goalsSnapshot.docs.sort((a, b) => {
      const aTime = a.data().createdAt?.toMillis?.() || 0;
      const bTime = b.data().createdAt?.toMillis?.() || 0;
      return bTime - aTime; // Descending
    });

    const goalDoc = sortedDocs[0];
    const goalData = goalDoc.data();
    const teamAiSettings = await resolveTeamAiSettingsForGoal(goalDoc.id, goalData?.answers || {});

    // Get calendar events for this goal (no ordering to avoid index)
    let calendarEvents: any[] = [];
    try {
      const eventsSnapshot = await admin.firestore()
        .collection("rocketGoals")
        .doc(goalDoc.id)
        .collection("calendarEvents")
        .limit(20)
        .get();

      calendarEvents = eventsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (e) {
      console.log("Could not fetch calendar events:", e);
    }

    return {
      id: goalDoc.id,
      title: goalData.primaryGoal || goalData.answers?.primary_goal || "Your Goal",
      primaryGoal: goalData.primaryGoal,
      status: goalData.status,
      answers: goalData.answers || {},
      copilot: goalData.copilot,
      teamAiSettings,
      startTimeMs: getTimestampMs(goalData?.startTime) ?? getTimestampMs(goalData?.createdAt),
      calendarEvents,
    };
  } catch (error) {
    console.error("Error getting goal context:", error);
    return null; // Return null instead of throwing - AI can still respond without goal context
  }
}

async function getGoalMilestones(goalId: string): Promise<Array<{
  id: string;
  title: string;
  dayNumber: number;
  order: number;
  completed: boolean;
  postponed?: boolean;
}>> {
  const collectionRef = admin.firestore()
    .collection("rocketGoals")
    .doc(goalId)
    .collection("actionItems");

  try {
    const snapshot = await collectionRef
      .orderBy("dayNumber", "asc")
      .orderBy("order", "asc")
      .get();
    return snapshot.docs.map((doc) => {
      const data = doc.data() as any;
      return {
        id: doc.id,
        title: data?.title || "Untitled milestone",
        dayNumber: Number(data?.dayNumber || 1),
        order: Number(data?.order || 0),
        completed: data?.completed === true,
        postponed: data?.postponed === true
      };
    });
  } catch (_error: any) {
    // Fallback without ordering (works even when index/order constraints fail).
    const snapshot = await collectionRef.get();
    return snapshot.docs
      .map((doc) => {
        const data = doc.data() as any;
        return {
          id: doc.id,
          title: data?.title || "Untitled milestone",
          dayNumber: Number(data?.dayNumber || 1),
          order: Number(data?.order || 0),
          completed: data?.completed === true,
          postponed: data?.postponed === true
        };
      })
      .sort((a, b) => {
        const dayDiff = a.dayNumber - b.dayNumber;
        if (dayDiff !== 0) return dayDiff;
        return a.order - b.order;
      });
  }
}

function buildMilestonesWindowMessage(goalContext: any, milestones: Array<{
  id: string;
  title: string;
  dayNumber: number;
  order: number;
  completed: boolean;
  postponed?: boolean;
}>): string {
  const startTimeMs = goalContext?.startTimeMs || null;
  const currentDay = getCurrentMissionDay(startTimeMs);
  const maxDay = currentDay + 5;
  const selected = milestones.filter((item) => item.dayNumber >= currentDay && item.dayNumber <= maxDay);

  if (selected.length === 0) {
    return `Milestones (Today + Next 5 Days)\n\nNo milestones found for today through day ${maxDay}.`;
  }

  const lines: string[] = [];
  lines.push(`Milestones (Today + Next 5 Days)`);
  lines.push(`Goal: ${goalContext?.title || "Your Goal"}`);
  lines.push("");

  selected.forEach((item) => {
    const done = item.completed ? "✅" : "⬜️";
    const todayTag = item.dayNumber === currentDay ? " (today)" : "";
    const postponedTag = item.postponed ? " ⏸" : "";
    lines.push(`${done} Day ${item.dayNumber}${todayTag} · ${formatMilestoneDate(startTimeMs, item.dayNumber)}`);
    lines.push(`   ${item.title}${postponedTag}`);
  });

  return lines.join("\n");
}

function buildAllMilestonesMessage(goalContext: any, milestones: Array<{
  id: string;
  title: string;
  dayNumber: number;
  order: number;
  completed: boolean;
  postponed?: boolean;
}>): string {
  if (milestones.length === 0) {
    return `All Milestones\n\nNo milestones found yet for this goal.`;
  }

  const startTimeMs = goalContext?.startTimeMs || null;
  const currentDay = getCurrentMissionDay(startTimeMs);
  const doneCount = milestones.filter((m) => m.completed).length;
  const lines: string[] = [];
  lines.push(`All Milestones`);
  lines.push(`Goal: ${goalContext?.title || "Your Goal"}`);
  lines.push(`Completed: ${doneCount}/${milestones.length}`);
  lines.push("");

  milestones.forEach((item) => {
    const marker = item.completed ? "✅ done" : "⬜️ open";
    const dayPosition = item.dayNumber < currentDay ? "past" : item.dayNumber === currentDay ? "today" : "upcoming";
    const postponedTag = item.postponed ? " ⏸" : "";
    lines.push(`${marker} · Day ${item.dayNumber} (${dayPosition}) · ${formatMilestoneDate(startTimeMs, item.dayNumber)}`);
    lines.push(`   ${item.title}${postponedTag}`);
  });

  return lines.join("\n");
}

/**
 * Get or create a chat session for this user
 */
async function getOrCreateSession(userId: string, goalId?: string): Promise<string> {
  const sessionsRef = admin.firestore()
    .collection('userProfiles')
    .doc(userId)
    .collection('aiChats');

  // Try to find existing session for this goal
  let query;
  if (goalId) {
    query = sessionsRef.where('goalId', '==', goalId).limit(1);
  } else {
    query = sessionsRef.where('goalId', '==', null).limit(1);
  }

  const snapshot = await query.get();

  if (!snapshot.empty) {
    return snapshot.docs[0].id;
  }

  // Create new session
  const newSession = await sessionsRef.add({
    goalId: goalId || null,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    title: 'Telegram Chat',
    source: 'telegram'
  });

  return newSession.id;
}

/**
 * Get conversation history for a session
 */
async function getConversationHistory(
  userId: string,
  sessionId: string
): Promise<Array<{ role: string; content: string }>> {
  const messagesSnapshot = await admin.firestore()
    .collection('userProfiles')
    .doc(userId)
    .collection('aiChats')
    .doc(sessionId)
    .collection('messages')
    .orderBy('createdAt', 'desc')
    .limit(MAX_CONVERSATION_HISTORY)
    .get();

  const messages = messagesSnapshot.docs
    .map(doc => {
      const data = doc.data();
      return {
        role: data.role,
        content: data.content
      };
    })
    .reverse(); // Oldest first

  return messages;
}

/**
 * Store messages in Firestore (same location as web app)
 * Uses explicit timestamps to ensure proper ordering (user message before AI response)
 */
async function storeMessages(
  userId: string,
  sessionId: string,
  userMessage: string,
  aiResponse: string
): Promise<void> {
  const messagesRef = admin.firestore()
    .collection('userProfiles')
    .doc(userId)
    .collection('aiChats')
    .doc(sessionId)
    .collection('messages');

  const sessionRef = admin.firestore()
    .collection('userProfiles')
    .doc(userId)
    .collection('aiChats')
    .doc(sessionId);

  // Use explicit timestamps to guarantee ordering
  // User message gets current time, AI response gets current time + 1ms
  const now = Date.now();
  const userTimestamp = admin.firestore.Timestamp.fromMillis(now);
  const aiTimestamp = admin.firestore.Timestamp.fromMillis(now + 1); // 1ms later

  const batch = admin.firestore().batch();

  // Add user message (first)
  const userMsgRef = messagesRef.doc();
  batch.set(userMsgRef, {
    role: 'user',
    content: userMessage,
    createdAt: userTimestamp,
    source: 'telegram'
  });

  // Add AI response (1ms after user message to ensure ordering)
  const aiMsgRef = messagesRef.doc();
  batch.set(aiMsgRef, {
    role: 'model',
    content: aiResponse,
    createdAt: aiTimestamp,
    source: 'telegram'
  });

  // Update session metadata
  batch.update(sessionRef, {
    updatedAt: aiTimestamp,
    lastMessage: aiResponse.substring(0, 100)
  });

  await batch.commit();
}

/**
 * Build system prompt for Telegram context
 */
async function buildTelegramSystemPrompt(goalContext: any): Promise<string> {
  const now = new Date();
  const currentDateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const currentTimeStr = now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });

  const sharedPhilosophy = await getSharedCoachPhilosophy();
  const sharedPhilosophyBlock = sharedPhilosophy
    ? `\n\nROCKETGOALS SHARED PHILOSOPHY:\n${sharedPhilosophy}`
    : '';
  const teamAiSettings = goalContext?.teamAiSettings || null;
  const teamAiDisplayName = String(teamAiSettings?.displayName || '').trim();
  const teamAiPersonality = String(teamAiSettings?.personality || '').trim();
  const teamAiPersonalityBlock = teamAiPersonality
    ? `\n\nTEAM AI PERSONALITY (ADMIN CUSTOMIZED):\n${teamAiPersonality}`
    : '';

  // Check if there's a custom copilot persona
  const copilot = goalContext?.copilot;
  let baseIdentity: string;

  if (teamAiDisplayName) {
    const teamName = String(goalContext?.answers?.teamName || 'the team').trim();
    baseIdentity = `You are ${teamAiDisplayName}, the dedicated AI coach for ${teamName || 'this team'} on RocketGoals.

You are still powered by RocketGoals core coaching intelligence, but for this conversation you MUST present and communicate as ${teamAiDisplayName}.

CURRENT DATE AND TIME:
Today is ${currentDateStr}. The current time is ${currentTimeStr}.${sharedPhilosophyBlock}${teamAiPersonalityBlock}`;
  } else if (copilot && copilot.name && copilot.role) {
    baseIdentity = `You are ${copilot.name}, ${copilot.role}

You are the user's dedicated strategic co-pilot for this mission. Embody this persona fully - your expertise, communication style, and guidance should reflect your role as ${copilot.name}. Be personable and address the user as if you've been assigned specifically to help them succeed.

Your mission is to guide individuals using the ROCKET Goal framework while bringing your unique expertise and perspective.

CURRENT DATE AND TIME:
Today is ${currentDateStr}. The current time is ${currentTimeStr}.${sharedPhilosophyBlock}`;
  } else {
    baseIdentity = `You are a world-class coach, motivational genius, and unsurpassed goal-setting expert. Your mission is to guide individuals using the ROCKET Goal framework.

CURRENT DATE AND TIME:
Today is ${currentDateStr}. The current time is ${currentTimeStr}.${sharedPhilosophyBlock}`;
  }

  const telegramGuidelines = `
TELEGRAM CONVERSATION GUIDELINES:
- Keep responses concise and mobile-friendly (Telegram is often used on phones)
- Use short paragraphs for readability
- Be conversational and supportive
- Use emojis sparingly but warmly
- If the user seems to be checking in, encourage them
- ${teamAiPersonality ? 'If TEAM AI PERSONALITY is provided, follow it strictly for tone and communication style' : 'Keep your tone encouraging and practical'}
- Maximum 2-3 short paragraphs per response`;

  let contextualPrompt = `${baseIdentity}\n${telegramGuidelines}`;

  // Add goal context
  if (goalContext) {
    const goalTitle = goalContext.title || 'this goal';
    const primaryGoal = goalContext.primaryGoal || '';
    const goalStatus = goalContext.status || 'active';
    const answers = goalContext.answers || {};

    contextualPrompt += `\n\nGOAL CONTEXT:
Goal: "${goalTitle}"
${primaryGoal ? `Primary Goal: ${primaryGoal}` : ''}
Status: ${goalStatus}
${answers.daily_effort ? `Daily Effort: ${answers.daily_effort}` : ''}`;
  } else {
    contextualPrompt += `\n\nNOTE: This user doesn't have an active goal yet. Encourage them to set one on the RocketGoals web app.`;
  }

  return contextualPrompt;
}

/**
 * Call Gemini AI with the user's message
 */
async function callGeminiAI(
  userMessage: string,
  conversationHistory: Array<{ role: string; content: string }>,
  goalContext: any,
  apiKey: string
): Promise<string> {
  const systemInstruction = await buildTelegramSystemPrompt(goalContext);
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction,
    generationConfig: {
      temperature: 0.8,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 500, // Keep responses concise for Telegram
    }
  });

  // Build conversation history for Gemini
  const history: Array<{ role: string; parts: Array<{ text: string }> }> = [];
  conversationHistory.forEach((msg) => {
    if (!msg || !msg.role || !msg.content) return;
    history.push({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.content }],
    });
  });

  // Add current user message
  history.push({
    role: "user",
    parts: [{ text: userMessage }],
  });

  const result = await model.generateContent({
    contents: history,
  });

  const response = result.response;
  return response.text() || "I'm here to help! What would you like to work on?";
}

/**
 * Create a link token for account linking
 */
async function createLinkToken(
  telegramId: string,
  chatId: number,
  firstName: string,
  username?: string
): Promise<string> {
  // Generate a random token
  const token = admin.firestore().collection('telegramLinkTokens').doc().id;

  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + LINK_TOKEN_EXPIRY_MINUTES);

  await admin.firestore()
    .collection('telegramLinkTokens')
    .doc(token)
    .set({
      telegramId,
      telegramChatId: chatId,
      telegramFirstName: firstName,
      telegramUsername: username || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      used: false
    });

  return token;
}

async function getGoalIdFromTelegramLinkToken(
  token: string,
  userId: string
): Promise<string | null> {
  try {
    const tokenDoc = await admin.firestore().collection('telegramLinkTokens').doc(token).get();
    if (!tokenDoc.exists) {
      return null;
    }

    const tokenData = tokenDoc.data() || {};
    const tokenUserId = String(tokenData.userId || '').trim();
    if (tokenUserId && tokenUserId !== userId) {
      return null;
    }

    const expiresAt = tokenData.expiresAt;
    const now = admin.firestore.Timestamp.now();
    if (expiresAt && typeof expiresAt.toMillis === 'function' && expiresAt.toMillis() < now.toMillis()) {
      return null;
    }

    const goalId = String(tokenData.goalId || '').trim();
    return goalId || null;
  } catch (error) {
    console.warn('Failed to resolve goalId from Telegram link token:', error);
    return null;
  }
}

/**
 * Try to auto-link a Telegram account using a pre-generated token from the web app
 * This enables 2-step linking: user clicks deep link from web → bot auto-links
 */
async function tryAutoLink(
  token: string,
  telegramId: string,
  chatId: number,
  firstName: string,
  username?: string
): Promise<{ linked: boolean; goalId: string | null }> {
  try {
    const tokenRef = admin.firestore().collection('telegramLinkTokens').doc(token);
    const tokenDoc = await tokenRef.get();

    if (!tokenDoc.exists) {
      console.log('Auto-link: Token not found');
      return { linked: false, goalId: null };
    }

    const tokenData = tokenDoc.data();
    const goalId = String(tokenData?.goalId || '').trim() || null;

    // Check if token is already used
    if (tokenData?.used) {
      console.log('Auto-link: Token already used');
      return { linked: false, goalId: null };
    }

    // Check if token has expired
    const now = admin.firestore.Timestamp.now();
    if (tokenData?.expiresAt && tokenData.expiresAt.toMillis() < now.toMillis()) {
      console.log('Auto-link: Token expired');
      return { linked: false, goalId: null };
    }

    // Get the userId from the token (this is the key difference - token was created by authenticated user)
    const userId = tokenData?.userId;
    if (!userId) {
      console.log('Auto-link: Token has no userId (old-style token)');
      return { linked: false, goalId: null };
    }

    // Check if this Telegram account is already linked to another user
    const existingLink = await admin.firestore()
      .collection('telegramToUser')
      .doc(telegramId)
      .get();

    if (existingLink.exists) {
      const existingData = existingLink.data();
      if (existingData?.userId !== userId) {
        console.log('Auto-link: Telegram already linked to different user');
        return { linked: false, goalId: null };
      }
      // Already linked to this user - success
      return { linked: true, goalId };
    }

    // Create the link
    const batch = admin.firestore().batch();

    // Create telegramToUser index document
    batch.set(admin.firestore().doc(`telegramToUser/${telegramId}`), {
      userId,
      linkedAt: admin.firestore.FieldValue.serverTimestamp(),
      telegramUsername: username || null,
      telegramFirstName: firstName,
      telegramChatId: chatId
    });

    // Update user profile with Telegram info
    batch.update(admin.firestore().doc(`userProfiles/${userId}`), {
      telegramId,
      telegramLinkedAt: admin.firestore.FieldValue.serverTimestamp(),
      telegramUsername: username || null,
      telegramChatId: chatId,
      'messagingPreferences.telegramEnabled': true
    });

    // Mark token as used
    batch.update(tokenRef, { used: true });

    await batch.commit();

    console.log(`✅ Auto-linked Telegram ${telegramId} to user ${userId}`);
    return { linked: true, goalId };
  } catch (error) {
    console.error('Auto-link error:', error);
    return { linked: false, goalId: null };
  }
}

/**
 * Main Telegram Webhook Handler
 */
export const telegramWebhook = onRequest({
  region: "us-central1",
  secrets: [telegramBotToken, geminiApiKey],
  cors: true
}, async (req, res) => {
  // Only accept POST requests
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const botToken = telegramBotToken.value();
  const aiApiKey = geminiApiKey.value();

  if (!botToken || !aiApiKey) {
    console.error('Missing required secrets');
    res.status(500).send('Configuration error');
    return;
  }

  try {
    const update: TelegramUpdate = req.body;

    // Handle bot added/removed from groups
    if (update.my_chat_member) {
      const memberUpdate = update.my_chat_member;
      const newStatus = memberUpdate.new_chat_member.status;
      const chatType = memberUpdate.chat.type;

      if ((chatType === 'group' || chatType === 'supergroup') &&
          memberUpdate.new_chat_member.user.is_bot &&
          (newStatus === 'member' || newStatus === 'administrator')) {
        const groupChatId = memberUpdate.chat.id;
        const groupTitle = memberUpdate.chat.title || 'Untitled Group';

        console.log(`🤖 Bot added to group "${groupTitle}" (${groupChatId})`);

        // Check if there's a pending team waiting to be linked
        // NOTE: Avoid compound queries (where + orderBy) to prevent needing composite indexes
        const pendingDoc = await admin.firestore()
          .collection('telegramPendingTeamLinks')
          .where('status', '==', 'pending')
          .get();

        let linkedTeamId: string | null = null;

        // Sort by createdAt descending in code to find the most recent pending link
        const sortedDocs = pendingDoc.docs
          .map(doc => ({ doc, createdAt: doc.data().createdAt?.toMillis?.() || 0 }))
          .sort((a, b) => b.createdAt - a.createdAt);

        for (const { doc, createdAt } of sortedDocs) {
          const data = doc.data();
          // Check if this pending link was created recently (within 10 minutes)
          if (Date.now() - createdAt < 10 * 60 * 1000) {
            const candidateTeamId = String(data.teamId || '').trim();
            if (!candidateTeamId) {
              await doc.ref.delete().catch(() => undefined);
              continue;
            }

            const candidateTeamDoc = await admin.firestore().collection('teams').doc(candidateTeamId).get();
            if (!candidateTeamDoc.exists) {
              console.warn(`Skipping stale Telegram pending team link for missing team ${candidateTeamId}`);
              await doc.ref.delete().catch(() => undefined);
              continue;
            }

            linkedTeamId = candidateTeamId;

            // Generate invite link
            let inviteLink: string | null = null;
            try {
              const inviteResp = await fetch(
                `https://api.telegram.org/bot${botToken}/exportChatInviteLink`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ chat_id: groupChatId })
                }
              );
              const inviteData = await inviteResp.json();
              if (inviteData.ok && inviteData.result) {
                inviteLink = inviteData.result;
              }
            } catch (inviteErr) {
              console.error('Failed to generate invite link:', inviteErr);
            }

            // Link group to team
            await admin.firestore().collection('teams').doc(linkedTeamId).update({
              telegramGroupId: groupChatId,
              telegramGroupInviteLink: inviteLink,
              telegramGroupTitle: groupTitle,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Mark pending link as completed
            await doc.ref.update({
              status: 'completed',
              groupChatId,
              groupTitle,
              inviteLink,
              completedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            const teamName = candidateTeamDoc.data()?.name || 'your team';

            await sendTelegramMessage(
              groupChatId,
              `🚀 *Connected to ${teamName}!*\n\nMessages here will sync with the team chat on RocketGoals. Team members can scan the QR code on the team page to join this group.`,
              botToken
            );

            console.log(`✅ Auto-linked group ${groupChatId} to team ${linkedTeamId}`);
            break;
          }
        }

        if (!linkedTeamId) {
          // No pending team - store as available group for manual connection
          await admin.firestore().collection('telegramPendingGroups').doc(groupChatId.toString()).set({
            groupChatId,
            groupTitle,
            addedAt: admin.firestore.FieldValue.serverTimestamp()
          });

          await sendTelegramMessage(
            groupChatId,
            `🚀 *RocketGoals Bot is here!*\n\nThis group will be linked to your team automatically. Head back to your team page — it should be connected now.`,
            botToken
          );
        }
      }

      res.sendStatus(200);
      return;
    }

    // Handle group/supergroup messages
    if (update.message &&
        (update.message.chat.type === 'group' || update.message.chat.type === 'supergroup')) {
      const groupChatId = update.message.chat.id;
      const messageText = (update.message.text || '').trim();

      // Handle /start command in groups (from startgroup deep link)
      if (messageText.startsWith('/start')) {
        const parts = messageText.split(/\s+/);
        const payload = parts.length > 1 ? parts[1] : null;

        if (payload && payload.startsWith('team_')) {
          const teamId = payload.replace('team_', '');
          const teamDoc = await admin.firestore().collection('teams').doc(teamId).get();

          if (teamDoc.exists && !teamDoc.data()?.telegramGroupId) {
            const groupTitle = update.message.chat.title || 'Untitled Group';

            // Generate invite link
            let inviteLink: string | null = null;
            try {
              const inviteResp = await fetch(
                `https://api.telegram.org/bot${botToken}/exportChatInviteLink`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ chat_id: groupChatId })
                }
              );
              const inviteData = await inviteResp.json();
              if (inviteData.ok && inviteData.result) {
                inviteLink = inviteData.result;
              }
            } catch (inviteErr) {
              console.error('Failed to generate invite link:', inviteErr);
            }

            // Link group to team
            await admin.firestore().collection('teams').doc(teamId).update({
              telegramGroupId: groupChatId,
              telegramGroupInviteLink: inviteLink,
              telegramGroupTitle: groupTitle,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Clean up any pending link for this team
            const pendingLinks = await admin.firestore()
              .collection('telegramPendingTeamLinks')
              .where('teamId', '==', teamId)
              .get();
            for (const doc of pendingLinks.docs) {
              if (doc.data().status === 'pending') {
                await doc.ref.update({ status: 'completed', groupChatId, completedAt: admin.firestore.FieldValue.serverTimestamp() });
              }
            }

            const teamName = teamDoc.data()?.name || 'your team';
            await sendTelegramMessage(
              groupChatId,
              `🚀 *Connected to ${teamName}!*\n\nMessages here will sync with the team chat on RocketGoals. Team members can scan the QR code on the team page to join this group.`,
              botToken
            );

            console.log(`✅ Auto-linked group ${groupChatId} to team ${teamId} via startgroup`);
          }
        }

        res.sendStatus(200);
        return;
      }

      // Skip other bot commands in groups
      if (messageText.startsWith('/')) {
        res.sendStatus(200);
        return;
      }

      // Sync regular group messages to web app
      if (messageText) {
        const teamsSnapshot = await admin.firestore()
          .collection('teams')
          .where('telegramGroupId', '==', groupChatId)
          .limit(1)
          .get();

        if (!teamsSnapshot.empty) {
          const teamDoc = teamsSnapshot.docs[0];
          const teamId = teamDoc.id;
          const teamData = teamDoc.data() || {};
          const senderTelegramId = update.message.from?.id?.toString();
          const messageThreadId = getTelegramMessageThreadId(update.message);

          // Resolve sender identity
          let senderName = update.message.from?.first_name || 'Telegram User';
          if (update.message.from?.last_name) {
            senderName += ` ${update.message.from.last_name}`;
          }
          let senderAvatarUrl: string | undefined;
          let senderId = `tg_${senderTelegramId}`;
          let linkedUser: TelegramToUser | null = null;

          if (senderTelegramId) {
            linkedUser = await findUserByTelegramId(senderTelegramId);
            if (linkedUser) {
              senderId = linkedUser.userId;
              const userProfile = await admin.firestore().collection('userProfiles').doc(linkedUser.userId).get();
              if (userProfile.exists) {
                const profileData = userProfile.data();
                senderName = `${profileData?.firstName || ''} ${profileData?.lastName || ''}`.trim() || senderName;
                senderAvatarUrl = profileData?.profilePictureUrl;
              }
            }
          }

          const threadContext = await resolveTelegramThreadContext(teamId, messageThreadId);
          if (threadContext.type === 'participant') {
            const participantUserId = threadContext.participantUserId;
            const teamMembers = Array.isArray(teamData?.members) ? teamData.members : [];
            const participantExists = teamMembers.some((member: any) => String(member?.userId || '').trim() === participantUserId);
            const linkedSenderUserId = linkedUser?.userId || null;
            const senderMember = linkedSenderUserId
              ? teamMembers.find((member: any) => String(member?.userId || '').trim() === linkedSenderUserId)
              : null;
            const senderRole = String(senderMember?.role || '').trim();
            const canPostToParticipantThread = !!linkedSenderUserId && (
              linkedSenderUserId === participantUserId
              || senderRole === 'admin'
              || senderRole === 'team-lead'
              || senderRole === 'coach'
              || senderRole === 'captain'
            );

            if (participantExists && canPostToParticipantThread) {
              const directData: Record<string, any> = {
                teamId,
                participantUserId,
                senderId,
                senderName,
                content: messageText,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                type: 'text',
                source: 'telegram'
              };
              if (senderAvatarUrl) {
                directData.senderAvatarUrl = senderAvatarUrl;
              }

              const directRef = await admin.firestore()
                .collection('teams').doc(teamId)
                .collection('memberConversations').doc(participantUserId)
                .collection('messages')
                .add(directData);
              await directRef.update({ id: directRef.id });
              console.log(`📨 Synced Telegram participant thread message to team ${teamId}, participant ${participantUserId}`);
            } else {
              console.warn(`Ignoring Telegram thread message for team ${teamId}: unauthorized or unknown participant thread`);
            }
          } else {
            const msgData: Record<string, any> = {
              teamId,
              senderId,
              senderName,
              content: messageText,
              timestamp: admin.firestore.FieldValue.serverTimestamp(),
              type: 'text',
              source: 'telegram'
            };
            if (senderAvatarUrl) {
              msgData.senderAvatarUrl = senderAvatarUrl;
            }

            const msgRef = await admin.firestore()
              .collection('teams').doc(teamId)
              .collection('messages').add(msgData);
            await msgRef.update({ id: msgRef.id });

            console.log(`📨 Synced Telegram group message to team ${teamId}`);

            const configuredAiName = String(teamData?.aiSettings?.displayName || '').trim();
            const aiMentionHandle = resolveTeamAiMentionHandle(configuredAiName || 'Rocket AI');
            const summonHandles = Array.from(new Set(['rocket', aiMentionHandle].filter(Boolean)));
            // Always respond to every message in the group (not just mentions)
            const shouldSummonTeamAi = teamData?.aiCoachEnabled !== false;

            if (shouldSummonTeamAi) {
              const apiKey = geminiApiKey.value();
              if (apiKey) {
                try {
                  const recentSnapshot = await admin.firestore()
                    .collection('teams')
                    .doc(teamId)
                    .collection('messages')
                    .orderBy('timestamp', 'desc')
                    .limit(15)
                    .get();

                  const recentMessages = recentSnapshot.docs
                    .map((doc) => ({ id: doc.id, ...(doc.data() || {}) as Record<string, any> }))
                    .filter((msg) => msg.id !== msgRef.id && (msg.type === 'text' || msg.type === 'ai-response'))
                    .reverse()
                    .map((msg) => ({
                      senderName: msg.type === 'ai-response'
                        ? (String(teamData?.aiSettings?.displayName || '').trim() || 'Rocket AI')
                        : (String(msg.senderName || '').trim() || 'Team member'),
                      content: String(msg.content || '').trim(),
                      type: String(msg.type || 'text')
                    }))
                    .filter((msg) => !!msg.content);

                  recentMessages.push({
                    senderName: String(senderName || '').trim() || 'Team member',
                    content: messageText,
                    type: 'text'
                  });

                  const aiPrompt = buildTeamAiPromptText(messageText, summonHandles, configuredAiName);
                  const aiText = await generateTeamAiCoachResponse(teamData, aiPrompt, recentMessages, apiKey);
                  const aiContent = String(aiText || '').trim();

                  if (aiContent) {
                    const aiDisplayName = String(teamData?.aiSettings?.displayName || '').trim() || 'Rocket AI';
                    const aiAvatarUrl = String(teamData?.aiSettings?.avatarUrl || '').trim();
                    const aiMsgData: Record<string, any> = {
                      teamId,
                      senderId: 'rocket-ai',
                      senderName: aiDisplayName,
                      content: aiContent,
                      timestamp: admin.firestore.FieldValue.serverTimestamp(),
                      type: 'ai-response',
                      source: 'telegram'
                    };
                    if (aiAvatarUrl) {
                      aiMsgData.senderAvatarUrl = aiAvatarUrl;
                    }

                    const aiRef = await admin.firestore()
                      .collection('teams')
                      .doc(teamId)
                      .collection('messages')
                      .add(aiMsgData);
                    await aiRef.update({ id: aiRef.id });

                    await sendTelegramMessage(
                      groupChatId,
                      `🤖 ${aiDisplayName}:\n${aiContent}`,
                      botToken,
                      null,
                      messageThreadId
                    );
                    console.log(`🤖 Team AI replied in Telegram group for team ${teamId}`);
                  }
                } catch (aiError) {
                  console.error(`Failed to generate team AI reply for Telegram group ${groupChatId}:`, aiError);
                }
              } else {
                console.warn('GEMINI_API_KEY not configured; skipping team AI summon in Telegram group');
              }
            }
          }
        }
      }

      res.sendStatus(200);
      return;
    }

    // Only handle private text messages from here on
    if (!update.message?.text || update.message.chat.type !== 'private') {
      res.sendStatus(200);
      return;
    }

    const telegramId = update.message.from?.id?.toString();
    const chatId = update.message.chat.id;
    const messageThreadId = getTelegramMessageThreadId(update.message);
    const userMessage = update.message.text.trim();
    const firstName = update.message.from?.first_name || 'Friend';
    const username = update.message.from?.username;

    if (!telegramId) {
      res.sendStatus(200);
      return;
    }

    console.log(`📱 Telegram message from ${firstName} (${telegramId}): "${userMessage.substring(0, 50)}..."`);

    // Handle /start command (with optional auto-link token)
    if (userMessage.startsWith('/start')) {
      const existingUser = await findUserByTelegramId(telegramId);

      // Check for auto-link token: /start TOKEN
      const startParts = userMessage.split(' ');
      const autoLinkToken = startParts.length > 1 ? startParts[1] : null;

      // Handle team group link that ended up in private chat
      // This happens when ?startgroup= falls through on some Telegram clients
      if (autoLinkToken && autoLinkToken.startsWith('team_')) {
        const teamIdFromLink = autoLinkToken.replace('team_', '');
        const groupDeepLink = `https://t.me/RocketGoalsBot?startgroup=${autoLinkToken}&admin=true`;
        await sendTelegramMessage(
          chatId,
          `👋 Hi ${firstName}!\n\nTo connect this bot to your team group, please tap the link below. It will let you pick or create a Telegram group:\n\n${groupDeepLink}\n\n_Tip: On mobile, this opens a screen to select a group. On desktop, you may need to first create a group manually and then add @RocketGoalsBot to it._`,
          botToken
        );
        res.sendStatus(200);
        return;
      }

      if (existingUser) {
        const userId = existingUser.userId;
        const goalIdFromToken = autoLinkToken
          ? await getGoalIdFromTelegramLinkToken(autoLinkToken, userId)
          : null;
        const tokenGoalContext = goalIdFromToken
          ? await getGoalById(goalIdFromToken, userId)
          : null;

        if (tokenGoalContext?.id) {
          const threadId = await activateTelegramGoalThread({
            userId,
            telegramId,
            chatId,
            goalContext: tokenGoalContext,
            botToken,
            sendThreadIntro: true,
            sendGeneralNotice: true
          });

          if (!threadId) {
            await sendTelegramMessage(
              chatId,
              `Welcome back, ${firstName}! 🚀\n\nI couldn't open a separate topic for *${escapeMarkdown(tokenGoalContext.title || 'this goal')}* yet, but your account is connected. How can I help you with your goals today?`,
              botToken
            );
          }
        } else {
          await sendTelegramMessage(
            chatId,
            `Welcome back, ${firstName}! 🚀\n\nYour account is connected. How can I help you with your goals today?\n\n*Commands:*\n/goals - List your goals\n/current - Show current goal\n/milestones - Today + next 5 days\n/milestones-all - All milestones\n/help - Show all commands`,
            botToken
          );
        }
      } else if (autoLinkToken) {
        // Try to auto-link with the provided token
        const autoLinkResult = await tryAutoLink(autoLinkToken, telegramId, chatId, firstName, username);

        if (autoLinkResult.linked) {
          const freshlyLinkedUser = await findUserByTelegramId(telegramId);
          const tokenGoalContext = freshlyLinkedUser && autoLinkResult.goalId
            ? await getGoalById(autoLinkResult.goalId, freshlyLinkedUser.userId)
            : null;

          if (freshlyLinkedUser && tokenGoalContext?.id) {
            const threadId = await activateTelegramGoalThread({
              userId: freshlyLinkedUser.userId,
              telegramId,
              chatId,
              goalContext: tokenGoalContext,
              botToken,
              sendThreadIntro: true,
              sendGeneralNotice: true
            });

            if (!threadId) {
              await sendTelegramMessage(
                chatId,
                `🎉 Account linked successfully, ${firstName}!\n\nI couldn't open a separate topic for *${escapeMarkdown(tokenGoalContext.title || 'this goal')}* yet, but you're all set to chat with your RocketGoals AI coach.`,
                botToken
              );
            }
          } else {
            await sendTelegramMessage(
              chatId,
              `🎉 Account linked successfully, ${firstName}!\n\nYou're all set to chat with your RocketGoals AI coach. I'll help you stay on track with your goals.\n\n*Commands:*\n/goals - List your goals\n/current - Show current goal\n/milestones - Today + next 5 days\n/milestones-all - All milestones\n/help - Show all commands\n\nTry saying: "What should I focus on today?"`,
              botToken
            );
          }
        } else {
          // Token invalid or expired - fall back to regular flow
          const linkToken = await createLinkToken(telegramId, chatId, firstName, username);
          await sendTelegramMessage(
            chatId,
            `Welcome to RocketGoals! 🚀\n\nThe link token was invalid or expired. Here's a new one:\n\nhttps://rocketgoals.com/link-telegram?token=${linkToken}\n\n(This link expires in ${LINK_TOKEN_EXPIRY_MINUTES} minutes)`,
            botToken
          );
        }
      } else {
        // No token provided - send linking instructions
        const linkToken = await createLinkToken(telegramId, chatId, firstName, username);
        await sendTelegramMessage(
          chatId,
          `Welcome to RocketGoals! 🚀\n\nI'm your AI coach, ready to help you achieve your goals.\n\nTo get started, link your RocketGoals account:\n\nhttps://rocketgoals.com/link-telegram?token=${linkToken}\n\n(This link expires in ${LINK_TOKEN_EXPIRY_MINUTES} minutes)`,
          botToken
        );
      }

      res.sendStatus(200);
      return;
    }

    // Look up RocketGoals user
    const linkedUser = await findUserByTelegramId(telegramId);

    if (!linkedUser) {
      // User not linked - prompt to link account
      const linkToken = await createLinkToken(telegramId, chatId, firstName, username);
      await sendTelegramMessage(
        chatId,
        `Hi ${firstName}! 👋\n\nTo chat with your RocketGoals coach, please link your account first:\n\nhttps://rocketgoals.com/link-telegram?token=${linkToken}\n\n(This link expires in ${LINK_TOKEN_EXPIRY_MINUTES} minutes)`,
        botToken
      );

      res.sendStatus(200);
      return;
    }

    // User is linked - process commands and messages
    const userId = linkedUser.userId;
    const selectedGoalId = await resolveSelectedGoalIdForTelegramMessage(userId, telegramId, messageThreadId);
    const activeGoalContext = await getActiveGoalContext(userId, selectedGoalId);

    // Handle /help command
    if (userMessage === '/help') {
      await sendTelegramMessage(
        chatId,
        `*RocketGoals Bot Commands*\n\n` +
        `/goals - List all your active goals\n` +
        `/switch [number] - Switch to a different goal (e.g., /switch 1)\n` +
        `/current - Show your current goal and coach\n` +
        `/milestones - Show milestones for today + next 5 days\n` +
        `/milestones-all - Show all milestones (past + current + upcoming)\n` +
        `/start - Welcome message\n` +
        `/help - Show this help\n\n` +
        `Or just type a message to chat with your AI coach!`,
        botToken
      );
      res.sendStatus(200);
      return;
    }

    // Handle /milestones command - deterministic milestone window
    if (userMessage === '/milestones' || userMessage === '?milestones') {
      const goalContext = activeGoalContext;

      if (!goalContext?.id) {
        await sendTelegramMessage(
          chatId,
          `You don't have an active goal selected.\n\nUse /goals to pick one first.`,
          botToken,
          null,
          messageThreadId
        );
        res.sendStatus(200);
        return;
      }

      const milestones = await getGoalMilestones(goalContext.id);
      const message = buildMilestonesWindowMessage(goalContext, milestones);
      await sendTelegramMessage(chatId, message, botToken, null, messageThreadId);
      res.sendStatus(200);
      return;
    }

    // Handle /milestones-all command - deterministic full milestone list
    if (userMessage === '/milestones-all' || userMessage === '?milestones-all') {
      const goalContext = activeGoalContext;

      if (!goalContext?.id) {
        await sendTelegramMessage(
          chatId,
          `You don't have an active goal selected.\n\nUse /goals to pick one first.`,
          botToken,
          null,
          messageThreadId
        );
        res.sendStatus(200);
        return;
      }

      const milestones = await getGoalMilestones(goalContext.id);
      const message = buildAllMilestonesMessage(goalContext, milestones);
      await sendTelegramMessage(chatId, message, botToken, null, messageThreadId);
      res.sendStatus(200);
      return;
    }

    // Handle /goals command - list all goals
    if (userMessage === '/goals') {
      const goals = await getAllActiveGoals(userId);

      if (goals.length === 0) {
        await sendTelegramMessage(
          chatId,
          `You don't have any active goals yet.\n\nCreate one at rocketgoals.com!`,
          botToken,
          'Markdown',
          messageThreadId
        );
      } else {
        let message = `*Your Goals:*\n\n`;

        goals.forEach((goal, index) => {
          const isSelected = goal.id === selectedGoalId || (index === 0 && !selectedGoalId);
          const coachName = goal.teamAiSettings?.displayName || goal.copilot?.name || 'AI Coach';
          message += `${isSelected ? '✅' : '⚪️'} *${index + 1}.* ${goal.title}\n`;
          message += `   Coach: ${coachName}\n\n`;
        });

        message += `Use /switch [number] to change goals.\nExample: /switch 2`;

        await sendTelegramMessage(chatId, message, botToken, 'Markdown', messageThreadId);
      }
      res.sendStatus(200);
      return;
    }

    // Handle /switch command
    if (userMessage.startsWith('/switch')) {
      const parts = userMessage.split(' ');
      const goalNumber = parseInt(parts[1], 10);

      if (isNaN(goalNumber) || goalNumber < 1) {
        await sendTelegramMessage(
          chatId,
          `Please specify a goal number.\nExample: /switch 1\n\nUse /goals to see your goals.`,
          botToken
        );
        res.sendStatus(200);
        return;
      }

      const goals = await getAllActiveGoals(userId);

      if (goalNumber > goals.length) {
        await sendTelegramMessage(
          chatId,
          `Goal #${goalNumber} not found. You have ${goals.length} goal(s).\n\nUse /goals to see your goals.`,
          botToken
        );
        res.sendStatus(200);
        return;
      }

      const selectedGoal = goals[goalNumber - 1];
      const threadId = await activateTelegramGoalThread({
        userId,
        telegramId,
        chatId,
        goalContext: selectedGoal,
        botToken,
        sendThreadIntro: true,
        sendGeneralNotice: messageThreadId !== null
      });

      if (!threadId) {
        const coachName = selectedGoal.teamAiSettings?.displayName || selectedGoal.copilot?.name || 'AI Coach';
        const coachAvatar = selectedGoal.teamAiSettings?.avatarUrl || selectedGoal.copilot?.avatar;
        const message = `Switched to: *${selectedGoal.title}*\nCoach: ${coachName}\n\nHow can I help you with this goal?`;
        if (coachAvatar) {
          await sendTelegramPhoto(chatId, coachAvatar, message, botToken, messageThreadId);
        } else {
          await sendTelegramMessage(chatId, message, botToken, 'Markdown', messageThreadId);
        }
      } else {
        await sendTelegramMessage(
          chatId,
          `Switched to *${escapeMarkdown(selectedGoal.title)}*. I opened its dedicated topic so this goal stays separate.`,
          botToken,
          'Markdown',
          messageThreadId
        );
      }

      res.sendStatus(200);
      return;
    }

    // Handle /current command - show current goal
    if (userMessage === '/current') {
      const goalContext = activeGoalContext;

      if (!goalContext) {
        await sendTelegramMessage(
          chatId,
          `You don't have an active goal selected.\n\nUse /goals to see your goals.`,
          botToken,
          'Markdown',
          messageThreadId
        );
      } else {
        const coachName = goalContext.teamAiSettings?.displayName || goalContext.copilot?.name || 'AI Coach';
        const coachAvatar = goalContext.teamAiSettings?.avatarUrl || goalContext.copilot?.avatar;

        const message = `*Current Goal:* ${goalContext.title}\n*Coach:* ${coachName}\n\nUse /goals to switch to a different goal.`;

        if (coachAvatar) {
          await sendTelegramPhoto(chatId, coachAvatar, message, botToken, messageThreadId);
        } else {
          await sendTelegramMessage(chatId, message, botToken, 'Markdown', messageThreadId);
        }
      }
      res.sendStatus(200);
      return;
    }

    // Regular message - chat with AI
    const goalContext = activeGoalContext;

    // Get or create session
    const sessionId = await getOrCreateSession(userId, goalContext?.id);

    // Get conversation history
    const history = await getConversationHistory(userId, sessionId);

    // Call AI
    const aiResponse = await callGeminiAI(
      userMessage,
      history,
      goalContext,
      aiApiKey
    );

    // Store messages in Firestore (syncs with web app)
    await storeMessages(userId, sessionId, userMessage, aiResponse);

    // Send response to Telegram (with coach avatar on first message of conversation)
    const coachAvatar = goalContext?.teamAiSettings?.avatarUrl || goalContext?.copilot?.avatar;
    if (coachAvatar && history.length === 0) {
      await sendTelegramPhoto(chatId, coachAvatar, aiResponse, botToken, messageThreadId);
    } else {
      await sendTelegramMessage(chatId, aiResponse, botToken, 'Markdown', messageThreadId);
    }

    console.log(`✅ Telegram response sent to ${firstName}`);
    res.sendStatus(200);

  } catch (error) {
    console.error('Telegram webhook error:', error);

    // Try to send error message to user
    try {
      const chatId = req.body?.message?.chat?.id;
      if (chatId) {
        await sendTelegramMessage(
          chatId,
          "Sorry, I'm having trouble right now. Please try again in a moment. 🙏",
          telegramBotToken.value()
        );
      }
    } catch (sendError) {
      console.error('Error sending error message:', sendError);
    }

    res.sendStatus(200); // Always return 200 to Telegram to prevent retries
  }
});

/**
 * Setup Telegram Group for a Team
 * Generates a deep link so the admin can create/pick a Telegram group in one tap.
 * The bot auto-links the group when it's added via the deep link.
 * Also checks if a group was already linked (e.g. via pending groups).
 */
export const setupTeamTelegramGroup = onCall({
  region: "us-central1",
  secrets: [telegramBotToken],
  cors: [
    "https://rocket-goals.web.app",
    "https://rocket-goals.firebaseapp.com",
    "https://www.rocketgoals.com",
    "https://rocketgoals.com",
    "http://localhost:4200",
    "http://127.0.0.1:4200"
  ]
}, async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'Must be logged in');
  }

  const { teamId } = request.data;
  if (!teamId) {
    throw new HttpsError('invalid-argument', 'teamId is required');
  }

  // Verify user is team admin
  const teamDoc = await admin.firestore().collection('teams').doc(teamId).get();
  if (!teamDoc.exists) {
    throw new HttpsError('not-found', 'Team not found');
  }
  const teamData = teamDoc.data() || {};
  const members = Array.isArray(teamData?.members) ? teamData.members : [];
  const isAdminMember = members.some((member: any) => (
    String(member?.userId || '').trim() === userId &&
    String(member?.role || '').trim() === 'admin'
  ));
  if (teamData?.adminId !== userId && !isAdminMember) {
    throw new HttpsError('permission-denied', 'Only the team admin can connect Telegram');
  }

  const botToken = telegramBotToken.value();

  const createPendingTeamDeepLink = async () => {
    if (botToken) {
      await ensureWebhookConfigured(botToken);
    }

    const deepLink = `https://t.me/RocketGoalsBot?startgroup=team_${teamId}&admin=true`;

    await admin.firestore().collection('telegramPendingTeamLinks').add({
      teamId,
      userId,
      status: 'pending',
      deepLink,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`🔗 Generated Telegram group deep link for team ${teamId}`);

    return {
      success: true,
      needsGroupCreation: true,
      deepLink
    };
  };

  // If team already has a telegram group, return it
  if (teamData?.telegramGroupId) {
    let inviteLink = String(teamData?.telegramGroupInviteLink || '').trim() || null;
    let resolvedChatId = Number(teamData.telegramGroupId);
    if (!inviteLink && botToken) {
      const inviteLinkResult = await exportTelegramChatInviteLinkDetailed(Number(teamData.telegramGroupId), botToken);
      inviteLink = inviteLinkResult.inviteLink;
      resolvedChatId = Number(inviteLinkResult.resolvedChatId || teamData.telegramGroupId);
      if (inviteLink) {
        await teamDoc.ref.update({
          telegramGroupId: resolvedChatId,
          telegramGroupInviteLink: inviteLink,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } else if (telegramErrorNeedsReconnect(inviteLinkResult.error)) {
        await teamDoc.ref.update({
          telegramGroupId: admin.firestore.FieldValue.delete(),
          telegramGroupInviteLink: admin.firestore.FieldValue.delete(),
          telegramGroupTitle: admin.firestore.FieldValue.delete(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return createPendingTeamDeepLink();
      } else if (resolvedChatId !== Number(teamData.telegramGroupId)) {
        await teamDoc.ref.update({
          telegramGroupId: resolvedChatId,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      return {
        success: true,
        alreadyConnected: true,
        telegramGroupId: resolvedChatId,
        telegramGroupInviteLink: inviteLink,
        telegramGroupTitle: teamData.telegramGroupTitle,
        telegramInviteLinkError: inviteLinkResult.error
      };
    }

    return {
      success: true,
      alreadyConnected: true,
      telegramGroupId: resolvedChatId,
      telegramGroupInviteLink: inviteLink,
      telegramGroupTitle: teamData.telegramGroupTitle,
      telegramInviteLinkError: null
    };
  }

  return createPendingTeamDeepLink();
});

export const disconnectTeamTelegramGroup = onCall({
  region: "us-central1",
  cors: [
    "https://rocket-goals.web.app",
    "https://rocket-goals.firebaseapp.com",
    "https://www.rocketgoals.com",
    "https://rocketgoals.com",
    "http://localhost:4200",
    "http://127.0.0.1:4200"
  ]
}, async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'Must be logged in');
  }

  const { teamId } = request.data;
  if (!teamId) {
    throw new HttpsError('invalid-argument', 'teamId is required');
  }

  const teamRef = admin.firestore().collection('teams').doc(teamId);
  const teamDoc = await teamRef.get();
  if (!teamDoc.exists) {
    throw new HttpsError('not-found', 'Team not found');
  }

  const teamData = teamDoc.data() || {};
  const members = Array.isArray(teamData?.members) ? teamData.members : [];
  const isAdminMember = members.some((member: any) => (
    String(member?.userId || '').trim() === userId &&
    String(member?.role || '').trim() === 'admin'
  ));
  if (teamData?.adminId !== userId && !isAdminMember) {
    throw new HttpsError('permission-denied', 'Only the team admin can disconnect Telegram');
  }

  await teamRef.update({
    telegramGroupId: admin.firestore.FieldValue.delete(),
    telegramGroupInviteLink: admin.firestore.FieldValue.delete(),
    telegramGroupTitle: admin.firestore.FieldValue.delete(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  const pendingLinks = await admin.firestore()
    .collection('telegramPendingTeamLinks')
    .where('teamId', '==', teamId)
    .get();
  for (const doc of pendingLinks.docs) {
    await doc.ref.delete();
  }

  console.log(`🔌 Disconnected Telegram group from team ${teamId}`);

  return {
    success: true
  };
});

/**
 * Reconfigure the Telegram webhook to receive all necessary update types,
 * including my_chat_member events (required for auto-detecting when the bot
 * is added to a group).
 */
export const configureTelegramWebhook = onCall({
  region: "us-central1",
  secrets: [telegramBotToken],
  cors: [
    "https://rocket-goals.web.app",
    "https://rocket-goals.firebaseapp.com",
    "https://www.rocketgoals.com",
    "https://rocketgoals.com",
    "http://localhost:4200",
    "http://127.0.0.1:4200"
  ]
}, async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'Must be logged in');
  }

  const botToken = telegramBotToken.value();
  if (!botToken) {
    throw new HttpsError('internal', 'Bot token not configured');
  }

  // Get the current webhook URL from Telegram
  const infoResp = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
  const infoData = await infoResp.json();

  if (!infoData.ok || !infoData.result?.url) {
    throw new HttpsError('failed-precondition', 'No webhook URL currently set');
  }

  const currentUrl = infoData.result.url;
  console.log(`🔧 Current webhook URL: ${currentUrl}`);
  console.log(`🔧 Current allowed_updates: ${JSON.stringify(infoData.result.allowed_updates)}`);

  // Re-set the webhook with the required allowed_updates
  const setResp = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: currentUrl,
      allowed_updates: ['message', 'edited_message', 'my_chat_member', 'callback_query']
    })
  });
  const setData = await setResp.json();

  if (!setData.ok) {
    console.error('Failed to set webhook:', setData);
    throw new HttpsError('internal', `Failed to configure webhook: ${setData.description}`);
  }

  console.log('✅ Webhook reconfigured with allowed_updates: message, edited_message, my_chat_member, callback_query');

  return {
    success: true,
    webhookUrl: currentUrl,
    allowedUpdates: ['message', 'edited_message', 'my_chat_member', 'callback_query']
  };
});

/**
 * Internal helper: Ensure the webhook is configured to receive my_chat_member events.
 * Called automatically from setupTeamTelegramGroup.
 */
async function ensureWebhookConfigured(botToken: string): Promise<void> {
  try {
    const infoResp = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
    const infoData = await infoResp.json();

    if (!infoData.ok || !infoData.result?.url) {
      console.warn('⚠️ No webhook URL set, skipping reconfiguration');
      return;
    }

    const currentUpdates: string[] = infoData.result.allowed_updates || [];
    const requiredUpdates = ['message', 'edited_message', 'my_chat_member', 'callback_query'];

    // Check if all required updates are already allowed
    const missingUpdates = requiredUpdates.filter(u => !currentUpdates.includes(u));
    if (missingUpdates.length === 0) {
      console.log('✅ Webhook already configured with all required update types');
      return;
    }

    console.log(`🔧 Webhook missing update types: ${missingUpdates.join(', ')}. Reconfiguring...`);

    const setResp = await fetch(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: infoData.result.url,
        allowed_updates: requiredUpdates
      })
    });
    const setData = await setResp.json();

    if (setData.ok) {
      console.log('✅ Webhook reconfigured successfully');
    } else {
      console.error('Failed to reconfigure webhook:', setData);
    }
  } catch (err) {
    console.error('Error ensuring webhook configuration:', err);
  }
}

/**
 * Firestore trigger: Sync web app messages to Telegram group
 */
export const syncTeamMessageToTelegram = onDocumentCreated({
  document: 'teams/{teamId}/messages/{messageId}',
  region: 'us-central1',
  secrets: [telegramBotToken]
}, async (event) => {
  const data = event.data?.data();
  if (!data) return;

  // Skip messages that came from Telegram (prevent echo loop)
  if (data.source === 'telegram') return;

  // Skip system messages (allow text and ai-response)
  if (data.type !== 'text' && data.type !== 'ai-response') return;

  const teamId = event.params.teamId;

  // Get team to check for linked Telegram group
  const teamDoc = await admin.firestore().collection('teams').doc(teamId).get();
  if (!teamDoc.exists) return;

  const teamData = teamDoc.data();
  const groupChatId = teamData?.telegramGroupId;
  if (!groupChatId) return;

  const botToken = telegramBotToken.value();
  if (!botToken) return;

  const senderName = data.senderName || 'Someone';
  const content = data.content || '';

  const formattedMsg = data.type === 'ai-response'
    ? `🤖 *${senderName}:*\n${content}`
    : `*${senderName}:*\n${content}`;

  await sendTelegramMessage(
    groupChatId,
    formattedMsg,
    botToken
  );

  console.log(`📤 Synced web message to Telegram group ${groupChatId}`);
});

/**
 * Firestore trigger: Sync web app direct participant messages to Telegram topics
 */
export const syncTeamDirectMessageToTelegram = onDocumentCreated({
  document: 'teams/{teamId}/memberConversations/{participantUserId}/messages/{messageId}',
  region: 'us-central1',
  secrets: [telegramBotToken]
}, async (event) => {
  const data = event.data?.data();
  if (!data) return;

  // Skip messages that came from Telegram (prevent echo loop)
  if (data.source === 'telegram') return;

  // Skip non-text messages
  if (data.type !== 'text') return;

  const teamId = event.params.teamId;
  const participantUserId = String(event.params.participantUserId || '').trim();
  if (!participantUserId) return;

  const teamDoc = await admin.firestore().collection('teams').doc(teamId).get();
  if (!teamDoc.exists) return;

  const teamData = teamDoc.data() || {};
  const groupChatId = teamData?.telegramGroupId;
  if (!groupChatId) return;

  const botToken = telegramBotToken.value();
  if (!botToken) return;

  const participantName = getTeamMemberDisplayName(teamData, participantUserId, 'Participant');
  const senderNameRaw = String(data.senderName || 'Someone').trim() || 'Someone';
  const content = String(data.content || '').trim();
  if (!content) return;

  const threadId = await getOrCreateParticipantThreadId({
    teamId,
    groupChatId,
    participantUserId,
    participantName,
    botToken
  });

  if (!threadId) {
    // Fail closed: never leak direct conversation content into general team chat.
    console.warn(
      `Skipped Telegram sync for direct message because no participant topic exists (team ${teamId}, participant ${participantUserId}). ` +
      `Enable Telegram Topics and grant bot topic-management permissions.`
    );
    return;
  }

  await sendTelegramMessage(
    groupChatId,
    `*${escapeMarkdown(senderNameRaw)}:*\n${content}`,
    botToken,
    'Markdown',
    threadId
  );

  console.log(`📤 Synced direct web message to Telegram participant topic ${threadId} (team ${teamId}, participant ${participantUserId})`);
});

function escapeRegExp(value: string): string {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveTeamAiMentionHandle(displayName: string): string {
  const trimmedName = String(displayName || '').trim();
  if (!trimmedName) {
    return 'rocket';
  }

  const firstToken = trimmedName.split(/\s+/)[0] || '';
  const firstName = firstToken.split(/[-_]/)[0] || firstToken;
  const normalized = firstName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '');

  return normalized || 'rocket';
}

function isTeamAiMentioned(content: string, handle: string): boolean {
  if (!content || !handle) {
    return false;
  }
  const pattern = new RegExp(`(^|\\s)@${escapeRegExp(handle)}(?=$|\\s|[.,!?;:])`, 'i');
  return pattern.test(content);
}

function getAiBareFirstNames(displayName: string): string[] {
  const trimmed = String(displayName || '').trim();
  if (!trimmed) return [];
  const firstName = trimmed.split(/\s+/)[0] || '';
  if (!firstName || firstName.toLowerCase() === 'rocket') return [];
  const names = new Set<string>();
  names.add(firstName.toLowerCase());
  const lower = firstName.toLowerCase();
  if (lower === 'tom') {
    names.add('toom');
  } else if (lower === 'toom') {
    names.add('tom');
  }
  return Array.from(names);
}

function isBareFirstNameMention(content: string, displayName: string): boolean {
  const names = getAiBareFirstNames(displayName);
  if (names.length === 0) return false;
  return names.some((name) => {
    const pattern = new RegExp(`(^|\\s)${escapeRegExp(name)}(?=$|\\s|[.,!?;:])`, 'i');
    return pattern.test(content);
  });
}

function buildTeamAiPromptText(content: string, handles: string[], displayName?: string): string {
  let cleaned = String(content || '').trim();
  const uniqueHandles = Array.from(new Set(handles.filter(Boolean)));
  for (const handle of uniqueHandles) {
    const mentionPattern = new RegExp(`(^|\\s)@${escapeRegExp(handle)}(?=$|\\s|[.,!?;:])`, 'ig');
    cleaned = cleaned.replace(mentionPattern, '$1');
  }
  for (const name of getAiBareFirstNames(displayName || '')) {
    const namePattern = new RegExp(`(^|\\s)${escapeRegExp(name)}(?=$|\\s|[.,!?;:])`, 'ig');
    cleaned = cleaned.replace(namePattern, '$1');
  }
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned || 'The team mentioned you without a specific question. Ask what they need help with right now.';
}

async function generateTeamAiCoachResponse(
  teamData: any,
  message: string,
  recentMessages: Array<{ senderName: string; content: string; type: string }> = [],
  apiKey?: string
): Promise<string> {
  const resolvedApiKey = String(apiKey || '').trim();
  if (!resolvedApiKey) {
    throw new Error('AI service not configured');
  }

  const teamName = String(teamData?.name || 'this team').trim() || 'this team';
  const teamDesc = String(teamData?.description || '').trim();
  const rawAiDisplayName = String(teamData?.aiSettings?.displayName || '').trim();
  const aiDisplayName = rawAiDisplayName ? rawAiDisplayName.slice(0, 60) : 'Rocket AI';
  const rawAiPersonality = String(teamData?.aiSettings?.personality || '').trim();
  const aiPersonality = rawAiPersonality ? rawAiPersonality.slice(0, 8000) : '';
  const aiPersonalityBlock = aiPersonality
    ? `\n\nTEAM AI PERSONALITY (ADMIN CUSTOMIZED):\n${aiPersonality}`
    : '';

  const membersLines = (teamData?.members || []).slice(0, 20).map((m: any) => {
    const role = m.role === 'admin'
      ? ' (Admin)'
      : m.role === 'coach'
        ? ' (Coach)'
        : m.role === 'team-lead'
          ? ' (Team Lead)'
          : '';
    return `- ${String(m.firstName || '').trim()} ${String(m.lastName || '').trim()}${role}`.trim();
  }).filter(Boolean);
  const membersContext = membersLines.length > 0
    ? `\n\nTEAM MEMBERS (${membersLines.length}):\n${membersLines.join('\n')}`
    : '';

  let chatContext = '';
  if (recentMessages.length > 0) {
    const lines = recentMessages.slice(-10).map(m => {
      const text = String(m.content || '').trim();
      if (!text) return '';
      if (m.type === 'ai-response') {
        return `${aiDisplayName} (AI): ${text}`;
      }
      const sender = String(m.senderName || '').trim() || 'Team member';
      return `${sender}: ${text}`;
    }).filter(Boolean);

    if (lines.length > 0) {
      chatContext = `\n\nRECENT CHAT MESSAGES:\n${lines.join('\n')}`;
    }
  }

  const sharedPhilosophy = await getSharedCoachPhilosophy();
  const sharedBlock = sharedPhilosophy ? `\n\nROCKETGOALS SHARED PHILOSOPHY:\n${sharedPhilosophy}` : '';

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const systemPrompt = `You are Rocket, the core RocketGoals AI coach for the team "${teamName}" on RocketGoals. For this team, present yourself as "${aiDisplayName}".

CURRENT DATE: ${dateStr}${sharedBlock}

TEAM CONTEXT:
- Team name: "${teamName}"
${teamDesc ? `- Team purpose: ${teamDesc}` : ''}${membersContext}${chatContext}${aiPersonalityBlock}

YOUR ROLE:
You are the dedicated AI coach and conversational participant for THIS TEAM. You respond to EVERY message in the chat — not just when mentioned. You are always part of the conversation.

CONVERSATION AWARENESS:
- Read the RECENT CHAT MESSAGES carefully to understand the full context and flow of the conversation
- Respond naturally to what was just said — acknowledge, build on, or react to the specific message
- If someone shares progress, celebrate or dig deeper. If someone asks a question, answer it thoughtfully.
- If someone is venting or struggling, empathize first, then offer perspective
- If the conversation is casual or social, engage naturally — you don't have to coach every message
- Match the energy and tone of the conversation — don't always be in "coach mode"

IMPORTANT RULES:
- NEVER reference members' personal/individual goals from outside this team
- Focus on the TEAM's collective mission, collaboration, and what they discuss in chat
- If the team name or description hints at a goal (e.g. "City to Shore Training"), treat THAT as the team's mission
- Coach the team as a unit — encourage teamwork, accountability between members, and shared progress
- Be encouraging, supportive, and actionable
- Keep responses concise (1-3 short paragraphs max) — shorter is better since you respond to everything
- Reference team members by name to make it personal
- Use a warm, natural tone — like a knowledgeable teammate, not a lecture
- If TEAM AI PERSONALITY is provided, follow it strictly for tone and communication style
- Use emojis sparingly
- When someone shares data (like miles, workouts, progress), acknowledge the specific numbers and relate them to the team's goals`;

  const genAI = new GoogleGenerativeAI(resolvedApiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: systemPrompt,
    generationConfig: {
      temperature: 0.8,
      topP: 0.95,
      topK: 40,
      maxOutputTokens: 600,
    }
  });

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: message }] }],
  });
  return result.response.text() || "I'm here to help the team! What would you like to work on together?";
}

/**
 * Callable function: Team AI Coach (@rocket mentions in team chat)
 * Takes a user message and team context, returns an AI coaching response.
 */
export const askTeamAiCoach = onCall({
  region: "us-central1",
  secrets: [geminiApiKey],
  cors: [
    "https://rocket-goals.web.app",
    "https://rocket-goals.firebaseapp.com",
    "https://www.rocketgoals.com",
    "https://rocketgoals.com",
    "http://localhost:4200",
    "http://127.0.0.1:4200"
  ]
}, async (request) => {
  const userId = request.auth?.uid;
  if (!userId) {
    throw new HttpsError('unauthenticated', 'Must be logged in');
  }

  const { teamId, message, recentMessages } = request.data as {
    teamId: string;
    message: string;
    recentMessages?: Array<{ senderName: string; content: string; type: string }>;
  };
  const rawMessage = String(message || '').trim();

  if (!teamId || !rawMessage) {
    throw new HttpsError('invalid-argument', 'teamId and message are required');
  }

  // Verify user is a team member
  const teamDoc = await admin.firestore().collection('teams').doc(teamId).get();
  if (!teamDoc.exists) {
    throw new HttpsError('not-found', 'Team not found');
  }
  const teamData = teamDoc.data();
  if (!teamData?.memberIds?.includes(userId)) {
    throw new HttpsError('permission-denied', 'You are not a member of this team');
  }

  const apiKey = geminiApiKey.value();
  if (!apiKey) {
    throw new HttpsError('internal', 'AI service not configured');
  }

  try {
    const aiText = await generateTeamAiCoachResponse(teamData, rawMessage, recentMessages || [], apiKey);
    console.log(`🤖 Team AI Coach responded for team ${teamId}`);
    return { success: true, response: aiText };
  } catch (err) {
    console.error('Team AI Coach error:', err);
    throw new HttpsError('internal', 'AI coach is temporarily unavailable. Please try again.');
  }
});

// ─── Scheduled Daily AI Team Messages (6 AM + 6 PM EST) ────────────────────

async function generateDailyInsightPrompt(
  teamData: any,
  recentMessages: Array<{ senderName: string; content: string; type: string }>,
  timeOfDay: 'morning' | 'evening',
  apiKey: string
): Promise<string> {
  const resolvedApiKey = String(apiKey || '').trim();
  if (!resolvedApiKey) throw new Error('AI service not configured');

  const teamName = String(teamData?.name || 'this team').trim() || 'this team';
  const teamDesc = String(teamData?.description || '').trim();
  const rawAiDisplayName = String(teamData?.aiSettings?.displayName || '').trim();
  const aiDisplayName = rawAiDisplayName ? rawAiDisplayName.slice(0, 60) : 'Rocket AI';
  const rawAiPersonality = String(teamData?.aiSettings?.personality || '').trim();
  const aiPersonality = rawAiPersonality ? rawAiPersonality.slice(0, 8000) : '';
  const aiPersonalityBlock = aiPersonality
    ? `\n\nTEAM AI PERSONALITY (ADMIN CUSTOMIZED):\n${aiPersonality}`
    : '';

  const membersLines = (teamData?.members || []).slice(0, 20).map((m: any) => {
    const role = m.role === 'admin' ? ' (Admin)' : m.role === 'coach' ? ' (Coach)' : m.role === 'team-lead' ? ' (Team Lead)' : '';
    return `- ${String(m.firstName || '').trim()} ${String(m.lastName || '').trim()}${role}`.trim();
  }).filter(Boolean);
  const membersContext = membersLines.length > 0
    ? `\n\nTEAM MEMBERS (${membersLines.length}):\n${membersLines.join('\n')}`
    : '';

  let chatContext = '';
  if (recentMessages.length > 0) {
    const lines = recentMessages.slice(-10).map(m => {
      const text = String(m.content || '').trim();
      if (!text) return '';
      if (m.type === 'ai-response') return `${aiDisplayName} (AI): ${text}`;
      return `${String(m.senderName || '').trim() || 'Team member'}: ${text}`;
    }).filter(Boolean);
    if (lines.length > 0) chatContext = `\n\nRECENT CHAT MESSAGES:\n${lines.join('\n')}`;
  }

  const sharedPhilosophy = await getSharedCoachPhilosophy();
  const sharedBlock = sharedPhilosophy ? `\n\nROCKETGOALS SHARED PHILOSOPHY:\n${sharedPhilosophy}` : '';

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const timeContext = timeOfDay === 'morning'
    ? 'It is early morning (6 AM EST). This is the MORNING check-in. Help the team set their intention and focus for the day ahead.'
    : 'It is evening (6 PM EST). This is the EVENING check-in. Help the team reflect on what they accomplished today and wind down with intention.';

  const systemPrompt = `You are "${aiDisplayName}", the dedicated AI coach for team "${teamName}" on RocketGoals.

CURRENT DATE: ${dateStr}
${timeContext}${sharedBlock}

TEAM CONTEXT:
- Team name: "${teamName}"
${teamDesc ? `- Team purpose: ${teamDesc}` : ''}${membersContext}${chatContext}${aiPersonalityBlock}

YOUR TASK:
Send a brief, insightful daily ${timeOfDay} message to the team. This is an automatic check-in.

GUIDELINES:
- Keep it SHORT (2-4 sentences max)
- Ask ONE thought-provoking question relevant to the team's purpose, recent conversations, or current progress
- ${timeOfDay === 'morning' ? 'In the morning: focus on intention-setting, energy, focus, or the day\'s priority' : 'In the evening: focus on reflection, wins, lessons learned, or gratitude'}
- Reference specific things from recent conversations when possible to show you\'re paying attention
- Be warm, concise, and actionable
- Do NOT use markdown formatting
- Do NOT start with "Good morning" or "Good evening" every time — vary your openings
- Address the team naturally, sometimes by name, sometimes generally
- Sign off with your name naturally (e.g. "– ${aiDisplayName}" or "- ${aiDisplayName}")`;

  const genAI = new GoogleGenerativeAI(resolvedApiKey);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: { maxOutputTokens: 300, temperature: 0.9 }
  });

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: `Generate the ${timeOfDay} check-in message now.` }] }],
    systemInstruction: { role: 'model', parts: [{ text: systemPrompt }] }
  });

  return String(result?.response?.text?.() || '').trim();
}

export const sendDailyTeamAiMessages = onSchedule({
  schedule: "every 1 hours",
  timeZone: "America/New_York",
  region: "us-central1",
  secrets: [geminiApiKey, telegramBotToken]
}, async () => {
  const apiKey = geminiApiKey.value();
  const botToken = telegramBotToken.value();
  if (!apiKey) { console.error('Gemini API key not configured'); return; }

  const estNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const currentHour = estNow.getHours();

  const isMorning = currentHour === 6;
  const isEvening = currentHour === 18;

  if (!isMorning && !isEvening) return;

  const timeOfDay = isMorning ? 'morning' : 'evening';
  console.log(`🤖 Running daily team AI ${timeOfDay} check-in (EST hour: ${currentHour})`);

  const teamsSnapshot = await admin.firestore()
    .collection('teams')
    .where('aiCoachEnabled', '!=', false)
    .get();

  let sentCount = 0;

  for (const teamDoc of teamsSnapshot.docs) {
    const teamData = { id: teamDoc.id, ...teamDoc.data() };
    const teamId = teamDoc.id;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const checkKey = `dailyAi_${timeOfDay}_${todayKey}`;

    const metaDoc = await admin.firestore()
      .collection('teams').doc(teamId)
      .collection('_meta').doc('scheduledMessages')
      .get();

    if (metaDoc.exists && metaDoc.data()?.[checkKey]) {
      console.log(`⏭️ Already sent ${timeOfDay} message for team ${teamId} today`);
      continue;
    }

    try {
      const recentSnapshot = await admin.firestore()
        .collection('teams').doc(teamId)
        .collection('messages')
        .orderBy('timestamp', 'desc')
        .limit(10)
        .get();

      const recentMessages = recentSnapshot.docs
        .map(doc => ({ id: doc.id, ...(doc.data() || {}) as Record<string, any> }))
        .filter(msg => msg.type === 'text' || msg.type === 'ai-response')
        .reverse()
        .map(msg => ({
          senderName: msg.type === 'ai-response'
            ? (String(teamData?.aiSettings?.displayName || '').trim() || 'Rocket AI')
            : (String(msg.senderName || '').trim() || 'Team member'),
          content: String(msg.content || '').trim(),
          type: String(msg.type || 'text')
        }))
        .filter(msg => !!msg.content);

      const aiContent = await generateDailyInsightPrompt(teamData, recentMessages, timeOfDay, apiKey);
      if (!aiContent) continue;

      const aiDisplayName = String(teamData?.aiSettings?.displayName || '').trim() || 'Rocket AI';
      const aiAvatarUrl = String(teamData?.aiSettings?.avatarUrl || '').trim();

      const sendingToTelegram = !!(botToken && teamData?.telegramGroupId);
      const aiMsgData: Record<string, any> = {
        teamId,
        senderId: 'rocket-ai',
        senderName: aiDisplayName,
        content: aiContent,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        type: 'ai-response',
        // Use 'telegram' source when sending directly to Telegram to prevent
        // syncTeamMessageToTelegram trigger from sending a duplicate
        source: sendingToTelegram ? 'telegram' : 'web'
      };
      if (aiAvatarUrl) aiMsgData.senderAvatarUrl = aiAvatarUrl;

      const aiRef = await admin.firestore()
        .collection('teams').doc(teamId)
        .collection('messages').add(aiMsgData);
      await aiRef.update({ id: aiRef.id });

      if (sendingToTelegram) {
        await sendTelegramMessage(
          teamData.telegramGroupId,
          aiContent,
          botToken,
          null,
          null
        );
      }

      await admin.firestore()
        .collection('teams').doc(teamId)
        .collection('_meta').doc('scheduledMessages')
        .set({ [checkKey]: true }, { merge: true });

      sentCount++;
      console.log(`✅ Sent ${timeOfDay} AI message for team "${teamData?.name || teamId}"`);
    } catch (err) {
      console.error(`❌ Failed to send ${timeOfDay} AI message for team ${teamId}:`, err);
    }

    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log(`🏁 Daily team AI ${timeOfDay} check-in complete: ${sentCount} teams`);
});

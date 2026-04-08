/* eslint-disable */
// @ts-nocheck
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import type { TelegramLinkToken, TelegramToUser } from "./telegram.types";

const telegramBotToken = defineSecret('TELEGRAM_BOT_TOKEN');

/**
 * Send a message via Telegram Bot API
 */
async function sendTelegramMessage(
  chatId: number,
  text: string,
  botToken: string,
  messageThreadId: number | null = null
): Promise<boolean> {
  try {
    const payload: Record<string, any> = {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown'
    };
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

    return response.ok;
  } catch (error) {
    console.error('Error sending Telegram message:', error);
    return false;
  }
}

function sanitizeTopicTitle(value: string, fallback: string): string {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  const candidate = raw || fallback;
  return candidate.slice(0, 120);
}

function escapeMarkdown(text: string): string {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/`/g, '\\`');
}

async function getGoalById(goalId: string, userId: string): Promise<{ id: string; title: string } | null> {
  const normalizedGoalId = String(goalId || '').trim();
  if (!normalizedGoalId) {
    return null;
  }

  const goalDoc = await admin.firestore().collection('rocketGoals').doc(normalizedGoalId).get();
  if (!goalDoc.exists) {
    return null;
  }

  const goalData = goalDoc.data() || {};
  if (String(goalData.userId || '').trim() !== String(userId || '').trim()) {
    return null;
  }

  const title = String(goalData.primaryGoal || goalData.answers?.primary_goal || 'Your Goal').trim() || 'Your Goal';
  return { id: goalDoc.id, title };
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
      console.warn(`Unable to create Telegram goal topic "${title}" in chat ${chatId}:`, data);
      return null;
    }
    const threadId = Number(data?.result?.message_thread_id);
    return Number.isFinite(threadId) && threadId > 0 ? threadId : null;
  } catch (error) {
    console.warn(`Unable to create Telegram goal topic "${title}" in chat ${chatId}:`, error);
    return null;
  }
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
  const threadTitle = sanitizeTopicTitle(`Goal • ${goalTitle}`, 'Goal • Your Goal');

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

async function activateTelegramGoalThread(params: {
  userId: string;
  telegramId: string;
  chatId: number;
  goalId: string;
  goalTitle: string;
  botToken: string;
}): Promise<number | null> {
  const { userId, telegramId, chatId, goalId, goalTitle, botToken } = params;
  const threadId = await getOrCreateTelegramGoalThreadId({
    userId,
    chatId,
    goalId,
    goalTitle,
    botToken
  });

  await admin.firestore().collection('telegramToUser').doc(telegramId).set({
    selectedGoalId: goalId
  }, { merge: true });

  if (!threadId) {
    return null;
  }

  await sendTelegramMessage(
    chatId,
    `*${escapeMarkdown(goalTitle)}*\n\nThis goal now has its own Telegram topic. Continue here so this conversation stays separate.`,
    botToken,
    threadId
  );
  await sendTelegramMessage(
    chatId,
    `Opened *${escapeMarkdown(goalTitle)}* in its own Telegram topic. Continue there so this goal stays separate.`,
    botToken
  );

  return threadId;
}

/**
 * Link a Telegram account to a RocketGoals user
 * Called from the web app after user authenticates
 */
export const linkTelegramAccount = onCall({
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
    throw new HttpsError('unauthenticated', 'Must be logged in to link Telegram');
  }

  const { token } = request.data;

  if (!token) {
    throw new HttpsError('invalid-argument', 'Link token is required');
  }

  // Get the link token
  const tokenRef = admin.firestore().collection('telegramLinkTokens').doc(token);
  const tokenDoc = await tokenRef.get();

  if (!tokenDoc.exists) {
    throw new HttpsError('not-found', 'Invalid or expired link token');
  }

  const tokenData = tokenDoc.data() as TelegramLinkToken;

  // Check if token is already used
  if (tokenData.used) {
    throw new HttpsError('failed-precondition', 'This link token has already been used');
  }

  // Check if token has expired
  const now = admin.firestore.Timestamp.now();
  if (tokenData.expiresAt && tokenData.expiresAt.toMillis() < now.toMillis()) {
    throw new HttpsError('failed-precondition', 'This link token has expired. Please start a new conversation with the bot.');
  }

  const telegramId = tokenData.telegramId;
  const chatId = tokenData.telegramChatId;

  // Check if this Telegram account is already linked to another user
  const existingLink = await admin.firestore()
    .collection('telegramToUser')
    .doc(telegramId)
    .get();

  if (existingLink.exists) {
    const existingData = existingLink.data() as TelegramToUser;
    if (existingData.userId !== userId) {
      throw new HttpsError(
        'already-exists',
        'This Telegram account is already linked to another RocketGoals account'
      );
    }
    // Already linked to this user - just return success
    return { success: true, message: 'Account already linked' };
  }

  // Check if user already has a different Telegram linked
  const userProfile = await admin.firestore()
    .collection('userProfiles')
    .doc(userId)
    .get();

  if (userProfile.exists) {
    const userData = userProfile.data();
    if (userData?.telegramId && userData.telegramId !== telegramId) {
      throw new HttpsError(
        'failed-precondition',
        'Your account is already linked to a different Telegram account. Please unlink it first.'
      );
    }
  }

  // Get user's name for the welcome message
  const firstName = userProfile.exists ? userProfile.data()?.firstName : 'there';

  // Create the link in a batch
  const batch = admin.firestore().batch();

  // Create telegramToUser index document
  batch.set(admin.firestore().doc(`telegramToUser/${telegramId}`), {
    userId,
    linkedAt: admin.firestore.FieldValue.serverTimestamp(),
    telegramUsername: tokenData.telegramUsername,
    telegramFirstName: tokenData.telegramFirstName,
    telegramChatId: chatId
  });

  // Update user profile with Telegram info
  batch.update(admin.firestore().doc(`userProfiles/${userId}`), {
    telegramId,
    telegramLinkedAt: admin.firestore.FieldValue.serverTimestamp(),
    telegramUsername: tokenData.telegramUsername || null,
    telegramChatId: chatId,
    'messagingPreferences.telegramEnabled': true
  });

  // Mark token as used
  batch.update(tokenRef, { used: true });

  await batch.commit();

  // Send welcome message to Telegram
  const botToken = telegramBotToken.value();
  if (botToken && chatId) {
    await sendTelegramMessage(
      chatId,
      `🎉 Account linked successfully, ${firstName}!\n\nYou can now chat with your RocketGoals AI coach here anytime. I'll help you stay on track with your goals.\n\nTry saying: "What should I focus on today?"`,
      botToken
    );
  }

  console.log(`✅ Telegram account ${telegramId} linked to user ${userId}`);

  return {
    success: true,
    message: 'Telegram account linked successfully'
  };
});

/**
 * Unlink a Telegram account from a RocketGoals user
 */
export const unlinkTelegramAccount = onCall({
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
    throw new HttpsError('unauthenticated', 'Must be logged in to unlink Telegram');
  }

  // Get user's current Telegram ID
  const userProfile = await admin.firestore()
    .collection('userProfiles')
    .doc(userId)
    .get();

  if (!userProfile.exists) {
    throw new HttpsError('not-found', 'User profile not found');
  }

  const userData = userProfile.data();
  const telegramId = userData?.telegramId;
  const chatId = userData?.telegramChatId;

  if (!telegramId) {
    throw new HttpsError('not-found', 'No Telegram account linked');
  }

  // Remove the link
  const batch = admin.firestore().batch();

  // Delete telegramToUser index
  batch.delete(admin.firestore().doc(`telegramToUser/${telegramId}`));

  // Update user profile
  batch.update(admin.firestore().doc(`userProfiles/${userId}`), {
    telegramId: admin.firestore.FieldValue.delete(),
    telegramLinkedAt: admin.firestore.FieldValue.delete(),
    telegramUsername: admin.firestore.FieldValue.delete(),
    telegramChatId: admin.firestore.FieldValue.delete(),
    'messagingPreferences.telegramEnabled': false
  });

  await batch.commit();

  // Notify user on Telegram
  const botToken = telegramBotToken.value();
  if (botToken && chatId) {
    await sendTelegramMessage(
      chatId,
      `Your RocketGoals account has been unlinked. 👋\n\nIf you'd like to reconnect, just send /start to begin again.`,
      botToken
    );
  }

  console.log(`✅ Telegram account ${telegramId} unlinked from user ${userId}`);

  return {
    success: true,
    message: 'Telegram account unlinked successfully'
  };
});

/**
 * Generate a deep link token for Telegram connection
 * Called from the web app - creates a token that can auto-link when user opens Telegram
 * This enables 2-step linking instead of 3-step
 */
export const generateTelegramDeepLink = onCall({
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
  const requestedGoalId = String(request.data?.goalId || '').trim();

  if (!userId) {
    throw new HttpsError('unauthenticated', 'Must be logged in to generate Telegram link');
  }

  // Check if user already has Telegram linked
  const userProfile = await admin.firestore()
    .collection('userProfiles')
    .doc(userId)
    .get();

  const userData = userProfile.exists ? (userProfile.data() || {}) : {};
  const alreadyLinked = !!userData?.telegramId;
  let goalContext: { id: string; title: string } | null = null;

  if (requestedGoalId) {
    goalContext = await getGoalById(requestedGoalId, userId);
    if (!goalContext) {
      throw new HttpsError('not-found', 'Goal not found');
    }
  }

  if (alreadyLinked && goalContext && userData?.telegramId && userData?.telegramChatId) {
    const botToken = telegramBotToken.value();
    if (botToken) {
      await activateTelegramGoalThread({
        userId,
        telegramId: String(userData.telegramId),
        chatId: Number(userData.telegramChatId),
        goalId: goalContext.id,
        goalTitle: goalContext.title,
        botToken
      });
    }

    return {
      alreadyLinked: true,
      deepLink: 'https://t.me/RocketGoalsBot',
      expiresAt: null
    };
  }

  // Generate a token with the userId embedded
  const token = admin.firestore().collection('telegramLinkTokens').doc().id;

  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + 15); // 15 minute expiry

  await admin.firestore()
    .collection('telegramLinkTokens')
    .doc(token)
    .set({
      userId, // This is the key difference - we know who the user is
      goalId: goalContext?.id || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      used: false,
      source: 'web_deep_link'
    });

  // Generate the Telegram deep link
  // Format: https://t.me/BotUsername?start=TOKEN
  const deepLink = `https://t.me/RocketGoalsBot?start=${token}`;

  console.log(`🔗 Generated Telegram deep link for user ${userId}${goalContext ? `, goal ${goalContext.id}` : ''}`);

  return {
    alreadyLinked,
    deepLink,
    expiresAt: expiresAt.toISOString()
  };
});

/**
 * Check if user has Telegram linked
 */
export const getTelegramLinkStatus = onCall({
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

  const userProfile = await admin.firestore()
    .collection('userProfiles')
    .doc(userId)
    .get();

  if (!userProfile.exists) {
    return { linked: false };
  }

  const userData = userProfile.data();

  return {
    linked: !!userData?.telegramId,
    telegramUsername: userData?.telegramUsername || null,
    linkedAt: userData?.telegramLinkedAt || null
  };
});

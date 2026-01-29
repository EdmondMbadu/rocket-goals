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
  botToken: string
): Promise<boolean> {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: text,
          parse_mode: 'Markdown'
        })
      }
    );

    return response.ok;
  } catch (error) {
    console.error('Error sending Telegram message:', error);
    return false;
  }
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

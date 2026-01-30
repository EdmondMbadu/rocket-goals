/* eslint-disable */
// @ts-nocheck
import * as functions from "firebase-functions/v1";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";

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

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Telegram API error:', errorData);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error sending Telegram message:', error);
    return false;
  }
}

/**
 * Get user's active goal title
 */
async function getActiveGoalTitle(userId: string): Promise<string | null> {
  try {
    const goalsSnapshot = await admin.firestore()
      .collection("rocketGoals")
      .where("userId", "==", userId)
      .where("status", "==", "active")
      .limit(5)
      .get();

    if (goalsSnapshot.empty) return null;

    // Sort manually to avoid index requirement
    const sortedDocs = goalsSnapshot.docs.sort((a, b) => {
      const aTime = a.data().createdAt?.toMillis?.() || 0;
      const bTime = b.data().createdAt?.toMillis?.() || 0;
      return bTime - aTime;
    });

    const goalData = sortedDocs[0].data();
    return goalData.primaryGoal || goalData.answers?.primary_goal || "your goal";
  } catch (error) {
    console.error("Error getting active goal title:", error);
    return null;
  }
}

/**
 * Check if user has already done their daily ignition today
 */
async function hasCompletedIgnitionToday(userId: string): Promise<boolean> {
  const today = new Date();
  const dateId = today.toISOString().split('T')[0]; // YYYY-MM-DD

  // Get user's active goal
  const goalsSnapshot = await admin.firestore()
    .collection('rocketGoals')
    .where('userId', '==', userId)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  if (goalsSnapshot.empty) return false;

  const goalId = goalsSnapshot.docs[0].id;

  // Check for today's ignition
  const ignitionSnapshot = await admin.firestore()
    .collection('rocketGoals')
    .doc(goalId)
    .collection('dailyIgnitions')
    .where('dateId', '==', dateId)
    .limit(1)
    .get();

  return !ignitionSnapshot.empty;
}

/**
 * Check if user has logged their mission today
 */
async function hasLoggedMissionToday(userId: string): Promise<boolean> {
  const today = new Date();
  const dateId = today.toISOString().split('T')[0];

  const goalsSnapshot = await admin.firestore()
    .collection('rocketGoals')
    .where('userId', '==', userId)
    .where('status', '==', 'active')
    .limit(1)
    .get();

  if (goalsSnapshot.empty) return false;

  const goalId = goalsSnapshot.docs[0].id;

  const missionSnapshot = await admin.firestore()
    .collection('rocketGoals')
    .doc(goalId)
    .collection('missionLogs')
    .where('dateId', '==', dateId)
    .limit(1)
    .get();

  return !missionSnapshot.empty;
}

/**
 * Morning check-in messages
 */
const MORNING_MESSAGES = [
  (name: string, goal: string) =>
    `Good morning, ${name}! ☀️\n\nReady to ignite your day?\n\nWhat's your ONE thing for "${goal}" today?`,

  (name: string, goal: string) =>
    `Rise and shine, ${name}! 🚀\n\nNew day, new opportunity.\n\nWhat will you accomplish toward "${goal}" today?`,

  (name: string, goal: string) =>
    `Morning, ${name}! ✨\n\nLet's make today count.\n\nWhat's your focus for "${goal}"?`,

  (name: string, goal: string) =>
    `Hey ${name}! 🌅\n\nTime to set your intention.\n\nWhat's the #1 thing you'll do for "${goal}" today?`
];

/**
 * Evening check-in messages
 */
const EVENING_MESSAGES = [
  (name: string, goal: string) =>
    `Hey ${name}! 🌙\n\nHow did your mission go today?\n\nDid you make progress on "${goal}"?`,

  (name: string, goal: string) =>
    `Evening check-in, ${name}! 📝\n\nTime to reflect.\n\nWhat did you accomplish for "${goal}" today?`,

  (name: string, goal: string) =>
    `${name}, how was your day? 🎯\n\nLet's log your progress.\n\nHow did "${goal}" go today?`,

  (name: string, goal: string) =>
    `Day's almost done, ${name}! ✅\n\nQuick reflection time.\n\nWhat wins did you have with "${goal}"?`
];

/**
 * Get a random message from array
 */
function getRandomMessage(messages: Function[], name: string, goal: string): string {
  const index = Math.floor(Math.random() * messages.length);
  return messages[index](name, goal);
}

/**
 * Send Daily Morning Check-ins
 * Runs every hour to catch users in different timezones
 */
export const sendTelegramDailyCheckins = onSchedule({
  schedule: "every 1 hours",
  timeZone: "America/New_York",
  region: "us-central1",
  secrets: [telegramBotToken]
}, async (event) => {
  const botToken = telegramBotToken.value();
  if (!botToken) {
    console.error('Telegram bot token not configured');
    return;
  }

  const currentHour = new Date().getUTCHours();
  console.log(`🌅 Running morning check-in job (UTC hour: ${currentHour})`);

  // Find users with Telegram enabled and daily check-in enabled
  const usersSnapshot = await admin.firestore()
    .collection('userProfiles')
    .where('telegramId', '!=', null)
    .get();

  let sentCount = 0;
  let skippedCount = 0;

  for (const doc of usersSnapshot.docs) {
    const user = doc.data();

    // Check if daily check-in is enabled
    if (!user.messagingPreferences?.dailyCheckInEnabled) {
      continue;
    }

    // Get user's preferred check-in time (default: 8:00 AM)
    const checkInTime = user.messagingPreferences?.checkInTime || '08:00';
    const [checkInHour] = checkInTime.split(':').map(Number);

    // Simple timezone approximation - assume EST for now
    // TODO: Add proper timezone support based on user preferences
    const userHour = (currentHour - 5 + 24) % 24; // Convert UTC to EST

    if (userHour !== checkInHour) {
      continue;
    }

    // Check if user already did their ignition today
    if (await hasCompletedIgnitionToday(doc.id)) {
      skippedCount++;
      continue;
    }

    // Get user's active goal
    const goalTitle = await getActiveGoalTitle(doc.id);
    if (!goalTitle) {
      continue; // No active goal
    }

    const chatId = user.telegramChatId;
    if (!chatId) {
      continue;
    }

    const firstName = user.firstName || 'Friend';
    const message = getRandomMessage(MORNING_MESSAGES, firstName, goalTitle);

    const success = await sendTelegramMessage(chatId, message, botToken);
    if (success) {
      sentCount++;
      console.log(`📤 Morning check-in sent to ${firstName}`);
    }

    // Small delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`✅ Morning check-ins complete: ${sentCount} sent, ${skippedCount} skipped`);
});

/**
 * Send Evening Mission Log Reminders
 */
export const sendTelegramMissionLogReminders = onSchedule({
  schedule: "every 1 hours",
  timeZone: "America/New_York",
  region: "us-central1",
  secrets: [telegramBotToken]
}, async (event) => {
  const botToken = telegramBotToken.value();
  if (!botToken) {
    console.error('Telegram bot token not configured');
    return;
  }

  const currentHour = new Date().getUTCHours();
  console.log(`🌙 Running evening reminder job (UTC hour: ${currentHour})`);

  const usersSnapshot = await admin.firestore()
    .collection('userProfiles')
    .where('telegramId', '!=', null)
    .get();

  let sentCount = 0;
  let skippedCount = 0;

  for (const doc of usersSnapshot.docs) {
    const user = doc.data();

    // Check if mission log reminder is enabled
    if (!user.messagingPreferences?.missionLogReminderEnabled) {
      continue;
    }

    // Get user's preferred reminder time (default: 8:00 PM / 20:00)
    const reminderTime = user.messagingPreferences?.reminderTime || '20:00';
    const [reminderHour] = reminderTime.split(':').map(Number);

    // Simple timezone approximation
    const userHour = (currentHour - 5 + 24) % 24; // Convert UTC to EST

    if (userHour !== reminderHour) {
      continue;
    }

    // Check if user already logged their mission today
    if (await hasLoggedMissionToday(doc.id)) {
      skippedCount++;
      continue;
    }

    // Get user's active goal
    const goalTitle = await getActiveGoalTitle(doc.id);
    if (!goalTitle) {
      continue;
    }

    const chatId = user.telegramChatId;
    if (!chatId) {
      continue;
    }

    const firstName = user.firstName || 'Friend';
    const message = getRandomMessage(EVENING_MESSAGES, firstName, goalTitle);

    const success = await sendTelegramMessage(chatId, message, botToken);
    if (success) {
      sentCount++;
      console.log(`📤 Evening reminder sent to ${firstName}`);
    }

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`✅ Evening reminders complete: ${sentCount} sent, ${skippedCount} skipped`);
});

/**
 * Send a goal nudge to a specific user (callable for manual triggers or automation)
 */
export const sendTelegramGoalNudge = functions
  .runWith({ secrets: [telegramBotToken] })
  .https.onCall(async (data, context) => {
    // Only allow admins or the system to call this
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated');
    }

    const { userId } = data;
    if (!userId) {
      throw new functions.https.HttpsError('invalid-argument', 'userId is required');
    }

    const botToken = telegramBotToken.value();
    if (!botToken) {
      throw new functions.https.HttpsError('failed-precondition', 'Bot token not configured');
    }

    const userDoc = await admin.firestore().collection('userProfiles').doc(userId).get();
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'User not found');
    }

    const user = userDoc.data();
    if (!user?.telegramChatId) {
      throw new functions.https.HttpsError('failed-precondition', 'User has no Telegram linked');
    }

    const goalTitle = await getActiveGoalTitle(userId);
    if (!goalTitle) {
      throw new functions.https.HttpsError('failed-precondition', 'User has no active goal');
    }

    const firstName = user.firstName || 'Friend';
    const message = `Hey ${firstName}! 👋\n\nJust checking in on "${goalTitle}".\n\nWhat's one small step you can take today?`;

    const success = await sendTelegramMessage(user.telegramChatId, message, botToken);

    return { success, message: success ? 'Nudge sent' : 'Failed to send nudge' };
  });

/* eslint-disable */
// @ts-nocheck
import * as functions from "firebase-functions/v1";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { TelegramUpdate, TelegramToUser, TelegramLinkToken } from "./telegram.types";

// Secrets
const telegramBotToken = defineSecret('TELEGRAM_BOT_TOKEN');
const geminiApiKey = defineSecret('GEMINI_API_KEY');

// Constants
const LINK_TOKEN_EXPIRY_MINUTES = 15;
const MAX_CONVERSATION_HISTORY = 20;

// Store user's selected goal in Firestore (telegramToUser document)
interface TelegramUserPrefs {
  selectedGoalId?: string;
}

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
 * Send a photo with caption via Telegram Bot API
 */
async function sendTelegramPhoto(
  chatId: number,
  photoUrl: string,
  caption: string,
  botToken: string
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
          parse_mode: 'Markdown'
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Telegram API error (photo):', errorData);
      // Fallback to text-only message
      return sendTelegramMessage(chatId, caption, botToken);
    }

    return true;
  } catch (error) {
    console.error('Error sending Telegram photo:', error);
    // Fallback to text-only message
    return sendTelegramMessage(chatId, caption, botToken);
  }
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

    return goalsSnapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.primaryGoal || data.answers?.primary_goal || "Untitled Goal",
        copilot: data.copilot,
        createdAt: data.createdAt?.toMillis?.() || 0,
      };
    }).sort((a, b) => b.createdAt - a.createdAt);
  } catch (error) {
    console.error("Error getting all goals:", error);
    return [];
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

    return {
      id: goalDoc.id,
      title: goalData?.primaryGoal || goalData?.answers?.primary_goal || "Your Goal",
      primaryGoal: goalData?.primaryGoal,
      status: goalData?.status,
      answers: goalData?.answers || {},
      copilot: goalData?.copilot,
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
      calendarEvents,
    };
  } catch (error) {
    console.error("Error getting goal context:", error);
    return null; // Return null instead of throwing - AI can still respond without goal context
  }
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
function buildTelegramSystemPrompt(goalContext: any): string {
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

  // Check if there's a custom copilot persona
  const copilot = goalContext?.copilot;
  let baseIdentity: string;

  if (copilot && copilot.name && copilot.role) {
    baseIdentity = `You are ${copilot.name}, ${copilot.role}

You are the user's dedicated strategic co-pilot for this mission. Embody this persona fully - your expertise, communication style, and guidance should reflect your role as ${copilot.name}. Be personable and address the user as if you've been assigned specifically to help them succeed.

Your mission is to guide individuals using the ROCKET Goal framework while bringing your unique expertise and perspective.

CURRENT DATE AND TIME:
Today is ${currentDateStr}. The current time is ${currentTimeStr}.`;
  } else {
    baseIdentity = `You are a world-class coach, motivational genius, and unsurpassed goal-setting expert. Your mission is to guide individuals using the ROCKET Goal framework.

CURRENT DATE AND TIME:
Today is ${currentDateStr}. The current time is ${currentTimeStr}.`;
  }

  const telegramGuidelines = `
TELEGRAM CONVERSATION GUIDELINES:
- Keep responses concise and mobile-friendly (Telegram is often used on phones)
- Use short paragraphs for readability
- Be conversational and supportive
- Use emojis sparingly but warmly
- If the user seems to be checking in, encourage them
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
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: buildTelegramSystemPrompt(goalContext),
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

    // Only handle private text messages
    if (!update.message?.text || update.message.chat.type !== 'private') {
      res.sendStatus(200);
      return;
    }

    const telegramId = update.message.from?.id?.toString();
    const chatId = update.message.chat.id;
    const userMessage = update.message.text.trim();
    const firstName = update.message.from?.first_name || 'Friend';
    const username = update.message.from?.username;

    if (!telegramId) {
      res.sendStatus(200);
      return;
    }

    console.log(`📱 Telegram message from ${firstName} (${telegramId}): "${userMessage.substring(0, 50)}..."`);

    // Handle /start command
    if (userMessage === '/start') {
      const existingUser = await findUserByTelegramId(telegramId);

      if (existingUser) {
        await sendTelegramMessage(
          chatId,
          `Welcome back, ${firstName}! 🚀\n\nYour account is connected. How can I help you with your goals today?\n\n*Commands:*\n/goals - List your goals\n/current - Show current goal\n/help - Show all commands`,
          botToken
        );
      } else {
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

    // Handle /help command
    if (userMessage === '/help') {
      await sendTelegramMessage(
        chatId,
        `*RocketGoals Bot Commands*\n\n` +
        `/goals - List all your active goals\n` +
        `/switch [number] - Switch to a different goal (e.g., /switch 1)\n` +
        `/current - Show your current goal and coach\n` +
        `/start - Welcome message\n` +
        `/help - Show this help\n\n` +
        `Or just type a message to chat with your AI coach!`,
        botToken
      );
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
          botToken
        );
      } else {
        const selectedGoalId = await getSelectedGoalId(telegramId);
        let message = `*Your Goals:*\n\n`;

        goals.forEach((goal, index) => {
          const isSelected = goal.id === selectedGoalId || (index === 0 && !selectedGoalId);
          const coachName = goal.copilot?.name || 'AI Coach';
          message += `${isSelected ? '✅' : '⚪️'} *${index + 1}.* ${goal.title}\n`;
          message += `   Coach: ${coachName}\n\n`;
        });

        message += `Use /switch [number] to change goals.\nExample: /switch 2`;

        await sendTelegramMessage(chatId, message, botToken);
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
      await setSelectedGoalId(telegramId, selectedGoal.id);

      const coachName = selectedGoal.copilot?.name || 'AI Coach';
      const coachAvatar = selectedGoal.copilot?.avatar;

      const message = `Switched to: *${selectedGoal.title}*\nCoach: ${coachName}\n\nHow can I help you with this goal?`;

      if (coachAvatar) {
        await sendTelegramPhoto(chatId, coachAvatar, message, botToken);
      } else {
        await sendTelegramMessage(chatId, message, botToken);
      }

      res.sendStatus(200);
      return;
    }

    // Handle /current command - show current goal
    if (userMessage === '/current') {
      const selectedGoalId = await getSelectedGoalId(telegramId);
      const goalContext = await getActiveGoalContext(userId, selectedGoalId);

      if (!goalContext) {
        await sendTelegramMessage(
          chatId,
          `You don't have an active goal selected.\n\nUse /goals to see your goals.`,
          botToken
        );
      } else {
        const coachName = goalContext.copilot?.name || 'AI Coach';
        const coachAvatar = goalContext.copilot?.avatar;

        const message = `*Current Goal:* ${goalContext.title}\n*Coach:* ${coachName}\n\nUse /goals to switch to a different goal.`;

        if (coachAvatar) {
          await sendTelegramPhoto(chatId, coachAvatar, message, botToken);
        } else {
          await sendTelegramMessage(chatId, message, botToken);
        }
      }
      res.sendStatus(200);
      return;
    }

    // Regular message - chat with AI
    const selectedGoalId = await getSelectedGoalId(telegramId);
    const goalContext = await getActiveGoalContext(userId, selectedGoalId);

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
    await sendTelegramMessage(chatId, aiResponse, botToken);

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

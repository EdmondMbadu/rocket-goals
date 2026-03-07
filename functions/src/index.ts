/* eslint-disable */
// @ts-nocheck
import * as functions from "firebase-functions/v1";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { GoogleGenerativeAI } from "@google/generative-ai";
import sgMail = require("@sendgrid/mail");
import twilio = require("twilio");
import { getToolRegistry, type AgentResponse, type SideEffect } from "./tools";
import { BetaAnalyticsDataClient } from "@google-analytics/data";
import * as crypto from "crypto";

// Re-export HeyGen functions
export { initiateHeyGenVideo, checkHeyGenVideoStatus, listHeyGenAvatars } from "./heygen.functions";

// Re-export Telegram/Messaging functions
export {
  telegramWebhook,
  setupTeamTelegramGroup,
  syncTeamMessageToTelegram,
  syncTeamDirectMessageToTelegram,
  configureTelegramWebhook,
  askTeamAiCoach,
  linkTelegramAccount,
  unlinkTelegramAccount,
  getTelegramLinkStatus,
  generateTelegramDeepLink,
  sendTelegramDailyCheckins,
  sendTelegramMissionLogReminders,
  sendTelegramGoalNudge,
  sendDailyTeamAiMessages
} from "./messaging";

// Initialize Firebase Admin
admin.initializeApp();

// Define secrets
const geminiApiKey = defineSecret('GEMINI_API_KEY');
const sendgridApiKey = defineSecret('SENDGRID_API_KEY');
const gaPropertyId = defineSecret('GA_PROPERTY_ID');
const stripeWebhookSecretGoals = defineSecret('STRIPE_WEBHOOK_SECRET_GOALS');
const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const twilioAccountSid = defineSecret('TWILIO_ACCOUNT_SID');
const twilioAuthToken = defineSecret('TWILIO_AUTH_TOKEN');
const twilioPhoneNumber = defineSecret('TWILIO_PHONE_NUMBER');
const twilioAccountSid2 = defineSecret('TWILIO_ACCOUNT_SID_2');
const twilioAuthToken2 = defineSecret('TWILIO_AUTH_TOKEN_2');
const twilioPhoneNumber2 = defineSecret('TWILIO_PHONE_NUMBER_2');

const stripeSubscriptionEvents = new Set([
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.payment_succeeded',
    'invoice.payment_failed',
    'checkout.session.completed',
    'checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed'
]);

const toTimestamp = (unixSeconds?: number | null) => {
    if (!unixSeconds) return null;
    return admin.firestore.Timestamp.fromMillis(unixSeconds * 1000);
};

// Map Stripe price IDs to plan names
const PRICE_TO_PLAN: Record<string, 'moonshot' | 'interplanetary' | 'galactic'> = {
    'price_1ShFV1G26VVCdyeuhiUrkRfy': 'moonshot',
    'price_1ShFVtG26VVCdyeu1stsZFw5': 'interplanetary',
    'price_1ShFWGG26VVCdyeuANsvCWFA': 'galactic'
};

const getPlanFromPriceId = (priceId: string | null | undefined): 'moonshot' | 'interplanetary' | 'galactic' | null => {
    if (!priceId) return null;
    return PRICE_TO_PLAN[priceId] || null;
};

const SHARED_COACH_PHILOSOPHY_CACHE_TTL_MS = 5 * 60 * 1000;
let sharedCoachPhilosophyCacheValue = '';
let sharedCoachPhilosophyCacheLoadedAt = 0;

async function getSharedCoachPhilosophy(): Promise<string> {
    const now = Date.now();
    if (sharedCoachPhilosophyCacheLoadedAt > 0 &&
        now - sharedCoachPhilosophyCacheLoadedAt < SHARED_COACH_PHILOSOPHY_CACHE_TTL_MS) {
        return sharedCoachPhilosophyCacheValue;
    }

    try {
        const snapshot = await admin.firestore()
            .collection('coachPromptSettings')
            .doc('global')
            .get();
        const data = snapshot.exists ? snapshot.data() : null;
        const philosophy = (data?.rocketGoalsPhilosophy || '').toString().trim();
        sharedCoachPhilosophyCacheValue = philosophy;
    } catch (error) {
        console.error('Failed to load shared coach philosophy:', error);
        sharedCoachPhilosophyCacheValue = '';
    }

    sharedCoachPhilosophyCacheLoadedAt = now;
    return sharedCoachPhilosophyCacheValue;
}

const parseStripeSignature = (header: string) => {
    const parts = header.split(',').map((part) => part.trim());
    const timestampPart = parts.find((part) => part.startsWith('t='));
    const timestamp = timestampPart ? Number(timestampPart.slice(2)) : null;
    const signatures = parts
        .filter((part) => part.startsWith('v1='))
        .map((part) => part.slice(3));
    return { timestamp, signatures };
};

const timingSafeEqual = (a: string, b: string) => {
    const aBuffer = Buffer.from(a, 'utf8');
    const bBuffer = Buffer.from(b, 'utf8');
    if (aBuffer.length !== bBuffer.length) return false;
    return crypto.timingSafeEqual(aBuffer, bBuffer);
};

const verifyStripeSignature = (rawBody: Buffer, signatureHeader: string, secret: string) => {
    const { timestamp, signatures } = parseStripeSignature(signatureHeader);
    if (!timestamp || signatures.length === 0) {
        return false;
    }
    const age = Math.abs(Date.now() / 1000 - timestamp);
    if (age > 300) {
        return false;
    }
    const payload = `${timestamp}.${rawBody.toString('utf8')}`;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return signatures.some((signature) => timingSafeEqual(signature, expected));
};

const findProfileByCustomerId = async (customerId: string) => {
    const snapshot = await admin.firestore()
        .collection('userProfiles')
        .where('stripeCustomerId', '==', customerId)
        .limit(1)
        .get();
    if (snapshot.empty) return null;
    return snapshot.docs[0];
};

const findProfileByEmail = async (email: string) => {
    const snapshot = await admin.firestore()
        .collection('userProfiles')
        .where('email', '==', email)
        .limit(1)
        .get();
    if (snapshot.empty) return null;
    return snapshot.docs[0];
};

const resolveProfileRef = async ({
    customerId,
    metadata,
    clientReferenceId,
    email
}: {
    customerId?: string | null;
    metadata?: Record<string, string> | null;
    clientReferenceId?: string | null;
    email?: string | null;
}) => {
    const metadataUserId = metadata?.firebaseUserId || metadata?.userId || metadata?.uid;
    if (metadataUserId) {
        const docRef = admin.firestore().collection('userProfiles').doc(metadataUserId);
        const snapshot = await docRef.get();
        return snapshot.exists ? docRef : null;
    }
    if (clientReferenceId) {
        const docRef = admin.firestore().collection('userProfiles').doc(clientReferenceId);
        const snapshot = await docRef.get();
        return snapshot.exists ? docRef : null;
    }
    if (customerId) {
        const doc = await findProfileByCustomerId(customerId);
        if (doc) return doc.ref;
    }
    if (email) {
        const doc = await findProfileByEmail(email);
        if (doc) return doc.ref;
    }
    return null;
};

const DEFAULT_VERIFICATION_REDIRECT = 'https://www.rocketgoals.com/login?verified=1';
const ALLOWED_VERIFICATION_REDIRECT_ORIGINS = new Set([
    'https://www.rocketgoals.com',
    'https://rocketgoals.web.app',
    'http://localhost:4200'
]);
const DEFAULT_TEAM_INVITE_ORIGIN = 'https://www.rocketgoals.com';
const ALLOWED_TEAM_INVITE_ORIGINS = new Set([
    'https://www.rocketgoals.com',
    'https://rocketgoals.web.app',
    'http://localhost:4200'
]);

const resolveVerificationContinueUrl = (candidate?: unknown) => {
    if (typeof candidate !== 'string') {
        return DEFAULT_VERIFICATION_REDIRECT;
    }
    const value = candidate.trim();
    if (!value) {
        return DEFAULT_VERIFICATION_REDIRECT;
    }

    try {
        const parsed = new URL(value);
        if (ALLOWED_VERIFICATION_REDIRECT_ORIGINS.has(parsed.origin)) {
            return parsed.toString();
        }
    } catch (error) {
        console.warn('Invalid verification redirect URL supplied. Falling back to default.', error);
    }

    return DEFAULT_VERIFICATION_REDIRECT;
};

const resolveTeamInviteUrl = (candidate: unknown, teamId: string) => {
    const fallback = `${DEFAULT_TEAM_INVITE_ORIGIN}/team/${teamId}`;
    if (typeof candidate !== 'string') {
        return fallback;
    }

    const value = candidate.trim();
    if (!value) {
        return fallback;
    }

    try {
        const parsed = new URL(value);
        if (!ALLOWED_TEAM_INVITE_ORIGINS.has(parsed.origin)) {
            return fallback;
        }
        return `${parsed.origin}/team/${teamId}`;
    } catch {
        return fallback;
    }
};


export const stripeWebhookRocketGoals = functions.runWith({
    secrets: [stripeWebhookSecretGoals]
}).https.onRequest(async (req, res) => {
    if (req.method !== 'POST') {
        res.status(405).send('Method Not Allowed');
        return;
    }

    const signature = req.headers['stripe-signature'];
    const secret = stripeWebhookSecretGoals.value();
    if (!secret) {
        res.status(500).send('Stripe webhook secret not configured.');
        return;
    }
    if (!signature || typeof signature !== 'string') {
        res.status(400).send('Missing Stripe signature.');
        return;
    }

    const rawBody = req.rawBody;
    if (!rawBody) {
        res.status(400).send('Missing raw body.');
        return;
    }

    if (!verifyStripeSignature(Buffer.from(rawBody), signature, secret)) {
        res.status(400).send('Invalid signature.');
        return;
    }

    let event: any;
    try {
        event = JSON.parse(Buffer.from(rawBody).toString('utf8'));
    } catch (error) {
        console.error('Failed to parse Stripe webhook payload', error);
        res.status(400).send('Invalid payload.');
        return;
    }

    if (!stripeSubscriptionEvents.has(event.type)) {
        res.status(200).send({ received: true });
        return;
    }

    try {
        switch (event.type) {
            case 'checkout.session.completed':
            case 'checkout.session.async_payment_succeeded':
            case 'checkout.session.async_payment_failed': {
                const session = event.data.object;
                const customerId = session.customer as string | null;
                const subscriptionId = session.subscription as string | null;
                const profileRef = await resolveProfileRef({
                    customerId,
                    clientReferenceId: session.client_reference_id,
                    metadata: session.metadata,
                    email: session.customer_email
                });
                if (!profileRef) {
                    console.warn('Stripe checkout session missing user profile match', {
                        customerId,
                        clientReferenceId: session.client_reference_id,
                        email: session.customer_email
                    });
                    break;
                }
                await profileRef.set({
                    stripeCustomerId: customerId || null,
                    stripeSubscriptionId: subscriptionId || null,
                    subscriptionStatus: session.payment_status === 'paid' ? 'active' : session.payment_status,
                    subscriptionPaidAt: session.payment_status === 'paid' ? admin.firestore.FieldValue.serverTimestamp() : null
                }, { merge: true });
                break;
            }
            case 'customer.subscription.created':
            case 'customer.subscription.updated':
            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                const customerId = subscription.customer as string | null;
                const profileRef = await resolveProfileRef({
                    customerId,
                    metadata: subscription.metadata
                });
                if (!profileRef) {
                    console.warn('Stripe subscription missing user profile match', { customerId });
                    break;
                }
                // Extract price ID from subscription items
                const priceId = subscription.items?.data?.[0]?.price?.id || null;
                const plan = getPlanFromPriceId(priceId);
                const updateData: Record<string, any> = {
                    stripeCustomerId: customerId || null,
                    stripeSubscriptionId: subscription.id,
                    subscriptionStatus: subscription.status,
                    subscriptionExpiresAt: toTimestamp(subscription.current_period_end)
                };
                if (priceId) {
                    updateData.subscriptionPriceId = priceId;
                }
                if (plan) {
                    updateData.subscriptionPlan = plan;
                }
                // Clear plan info if subscription is deleted/canceled
                if (event.type === 'customer.subscription.deleted') {
                    updateData.subscriptionPlan = null;
                    updateData.subscriptionPriceId = null;
                }
                await profileRef.set(updateData, { merge: true });
                break;
            }
            case 'invoice.payment_succeeded':
            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                const customerId = invoice.customer as string | null;
                const profileRef = await resolveProfileRef({
                    customerId,
                    metadata: invoice.metadata,
                    email: invoice.customer_email
                });
                if (!profileRef) {
                    console.warn('Stripe invoice missing user profile match', { customerId });
                    break;
                }
                const line = invoice.lines?.data?.[0];
                const periodEnd = line?.period?.end || invoice.period_end || null;
                const paidAt = invoice.status_transitions?.paid_at || invoice.created || null;
                const priceId = line?.price?.id || null;
                const plan = getPlanFromPriceId(priceId);
                const invoiceUpdateData: Record<string, any> = {
                    stripeCustomerId: customerId || null,
                    stripeSubscriptionId: invoice.subscription || null,
                    subscriptionStatus: event.type === 'invoice.payment_succeeded' ? 'active' : (invoice.status || 'past_due'),
                    subscriptionPaidAt: event.type === 'invoice.payment_succeeded' ? toTimestamp(paidAt) : null,
                    subscriptionExpiresAt: toTimestamp(periodEnd)
                };
                if (priceId) {
                    invoiceUpdateData.subscriptionPriceId = priceId;
                }
                if (plan) {
                    invoiceUpdateData.subscriptionPlan = plan;
                }
                await profileRef.set(invoiceUpdateData, { merge: true });
                break;
            }
            default:
                break;
        }
    } catch (error) {
        console.error('Failed to process Stripe webhook', error);
        res.status(500).send('Webhook processing error.');
        return;
    }

    res.status(200).send({ received: true });
});

/**
 * Cloud Function that processes AI prompts using Google AI (Gemini)
 * Optimized for speed - uses fastest model and direct API calls
 * This replaces the Firebase Extension for better performance
 */
export const processAIPrompt = functions.runWith({
    secrets: [geminiApiKey]
}).firestore
    .document("public/{documentId}")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .onCreate(async (snap: { data: () => any; ref: { update: (arg0: { status: string; updateTime: admin.firestore.FieldValue; response?: any; error?: any; }) => any; }; }, context: { params: { documentId: any; }; }) => {
        const startTime = Date.now();
        const data = snap.data();
        const documentId = context.params.documentId;

        // Check if this document already has a response (to avoid infinite loops)
        if (data.response || data.status === "PROCESSING" || data.status === "COMPLETE") {
            console.log("Document already processed, skipping");
            return null;
        }

        // Check if there's a prompt field
        if (!data.prompt) {
            console.log("No prompt field found, skipping");
            return null;
        }

        const userMessage = data.prompt;
        const conversationHistory = data.conversationHistory || [];
        const mode = data.mode || 'voice'; // Default to 'voice' if not specified
        const generatePlan = data.generatePlan || false; // Check if this is a plan generation request
        const goalContext = data.goalContext; // Goal-specific context when available
        console.log(`🚀 Processing prompt for document ${documentId} (${mode} mode, generatePlan: ${generatePlan})`);
        console.log(`💬 Conversation history: ${conversationHistory.length} messages`);

        try {
            // Update status to PROCESSING
            await snap.ref.update({
                status: "PROCESSING",
                updateTime: admin.firestore.FieldValue.serverTimestamp(),
            });

            const processingStartTime = Date.now();
            console.log(`⏱️ Status updated to PROCESSING in ${processingStartTime - startTime}ms`);

            // Initialize Google AI with API key from secret
            const apiKey = geminiApiKey.value();
            if (!apiKey) {
                throw new Error("Google AI API key is not set. Please set it using: firebase functions:secrets:set GEMINI_API_KEY");
            }

            const aiStartTime = Date.now();
            const genAI = new GoogleGenerativeAI(apiKey);

            // Get current date information for AI awareness
            const currentDate = new Date();
            const currentDateStr = currentDate.toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
            const currentTimeStr = currentDate.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
            });

            // Base identity and framework description
            const baseIdentity = `You are a world-class coach, motivational genius, and unsurpassed goal-setting expert. Your mission is to guide individuals using the ROCKET Goal framework, which incorporates the wisdom of leading motivational thinkers, neuroscientists, and visionaries like Tony Robbins, Dr. Wayne Dyer, Emily Balcetis, and Buckminster Fuller. You also draw upon David Goggins's relentless mindset of embracing pain, overcoming adversity, and unlocking peak performance through discipline and grit. You are here to push users beyond their limits, help them master personal accountability, and foster team growth through the CREW Team Method—focusing on Courage to Risk, Recognition of Progress, Expanding Horizons, and Wisdom through Mentorship.

CURRENT DATE AND TIME:
Today is ${currentDateStr}. The current time is ${currentTimeStr}.
Use this information when users ask about dates, scheduling, or time-related questions. When they say "today", "tomorrow", "next week", etc., interpret these relative to this date.`;

            // Mode-specific conversation guidelines
            let conversationGuidelines = '';
            let maxOutputTokens = 150; // Increased for more substantial responses
            let maxChars = 250; // Increased for more substantial responses (soft limit - allows completion)
            let maxSentences = 4; // Allow 3-4 sentences for more natural flow (soft limit)
            let shouldApplyLimits = true; // Whether to apply truncation limits

            // If generating plan, remove all limits
            if (generatePlan) {
                maxOutputTokens = 8192; // Gemini's maximum
                maxChars = 10000; // Very high limit (effectively no limit)
                maxSentences = 1000; // Very high limit (effectively no limit)
                shouldApplyLimits = false; // Don't truncate plan generation
                conversationGuidelines = `PLAN GENERATION MODE:
- Generate a comprehensive, detailed Rocket Goals Launch Plan based on the entire conversation
- Create a well-structured document with clear sections, headers, and bullet points
- Include: Summary of user's goals, Key insights from conversation, Actionable steps, Personalized recommendations
- Format with proper headings, subheadings, and organized content
- Make it thorough and complete - this is the final deliverable for the user`;
            } else if (mode === 'voice') {
                conversationGuidelines = `CRITICAL CONVERSATION GUIDELINES (VOICE MODE):
- BE INTELLIGENT ABOUT WHEN TO PROBE: Only ask a probing question if you genuinely need more context to give a helpful answer
- If the user's question is clear and you have enough context from the conversation, provide a SUBSTANTIAL but CONCISE answer (2-4 sentences, 50-80 words)
- Complete your thoughts fully - don't cut off mid-sentence or mid-thought
- If you need clarification, ask ONE SHORT probing question (5-10 words) like "What's your biggest challenge?" or "What does success look like?"
- After asking a probing question, wait for their response before providing your answer
- Use natural, conversational language with contractions (I'm, you're, it's, don't, etc.)
- This is a REAL-TIME VOICE CONVERSATION - speak naturally, like a coach having a meaningful conversation
- Match the user's energy and tone - be enthusiastic if they are, supportive if they need it
- Reference previous parts of the conversation naturally when relevant
- Build on the conversation - don't restart from scratch each time
- The user can interrupt you at any time - be ready to stop and listen immediately`;
            } else {
                // Chat mode - more natural, asks clarification questions
                conversationGuidelines = `CRITICAL CONVERSATION GUIDELINES (CHAT MODE):
- BE INTELLIGENT ABOUT WHEN TO PROBE: Only ask a probing question if you genuinely need more context to give a helpful answer
- If the user's question is clear and you have enough context from the conversation, provide a SUBSTANTIAL but CONCISE answer (2-4 sentences, 60-90 words)
- Complete your thoughts fully - don't cut off mid-sentence or mid-thought
- If you need clarification, ask ONE SHORT probing question (5-10 words) like "What's your biggest challenge?" or "What does success look like?"
- After asking a probing question, wait for their response before providing your answer
- Talk like a REAL HUMAN having a friendly chat - use contractions (I'm, you're, it's, don't, can't, etc.)
- Be curious and genuinely interested - ask probing questions when you need clarity, but don't overdo it
- Use natural, everyday language - avoid sounding like a textbook or corporate coach
- Show empathy and understanding - acknowledge their feelings before jumping to solutions
- Be conversational and warm - like talking to a friend who's also a great coach
- Build on the conversation - don't restart from scratch each time
- Keep it meaningful and substantial - quality over quantity`;
                maxOutputTokens = 200; // Longer for more substantial responses
                maxChars = 300; // Longer for more substantial responses
                maxSentences = 4; // Allow 3-4 sentences for more natural flow
            }

            // System prompt - different for plan generation vs normal conversation
            let systemInstruction = '';
            if (generatePlan) {
                systemInstruction = `${baseIdentity}

${conversationGuidelines}

IMPORTANT: You are generating a FINAL COMPREHENSIVE PLAN document. This is NOT a conversation - it's a complete, structured document that will be downloaded as a PDF.

Requirements:
- Generate a FULL, DETAILED plan (no truncation, no limits)
- Use markdown formatting: ## for main sections, ### for subsections, **bold** for emphasis, bullet points for lists
- Include ALL sections requested in the user's prompt
- Be thorough and comprehensive - this is the user's final deliverable
- Format professionally with clear structure
- Do NOT ask questions or continue conversation - just provide the complete plan`;
            } else {
                // Base system prompt
                let contextualPrompt = `${baseIdentity}

${conversationGuidelines}`;

                // Add goal-specific context if available
                if (goalContext) {
                    const goalTitle = goalContext.title || 'this goal';
                    const primaryGoal = goalContext.primaryGoal || '';
                    const goalStatus = goalContext.status || 'active';
                    const answers = goalContext.answers || {};

                    contextualPrompt += `

GOAL-SPECIFIC CONTEXT:
You are currently helping a user with their specific goal: "${goalTitle}"
${primaryGoal ? `Primary Goal: ${primaryGoal}` : ''}
Goal Status: ${goalStatus}
${answers.daily_effort ? `Daily Effort: ${answers.daily_effort}` : ''}
${answers.future_result ? `Motivation Driver: ${answers.future_result.join(', ')}` : ''}

IMPORTANT: Use this goal context to provide personalized, insightful advice. Reference their specific goal details when relevant, but don't force it if their question is unrelated to goal achievement.`;
                }

                systemInstruction = contextualPrompt + `

Using the ROCKET framework, you help users:
- Remember their Future Self: Envision the person they are becoming and fuel that vision with passion.
- Own Their ONE Thing: Focus on what truly matters to make exponential progress.
- Celebrate Change: See each small win as a sign of growth and resilience.
- Keep Kind Intentions: Encourage self-compassion to maintain momentum through challenges.
- Engage with Exponential Effort: Push beyond limits, maintaining consistent effort even when it's tough.
- Transform Time with Their Team: Leverage teamwork for greater synergy and accelerated success.

Personalized Coaching:
When users ask questions like "How can I engage with Exponential Effort?" you provide inspiring frameworks, then ask targeted questions to create personalized action plans that empower them to reach their goals. You also help them enter a powerful flow state by focusing on clarity, discipline, and a relentless drive for excellence.

Signature Exercises for Goal Achievement:
For these exercises, provide the overview, and then ask each question progressively, one at a time. After completing a summary, be sure to ask users if they'd like more details.

Ignition Blueprint: The 4 Stages of Alignment
When users ask to "Ignite My Goals," guide them through this step-by-step Ignition Blueprint:
1. Spark the Fuel (Assume the Wish Fulfilled): Help users feel the emotion of already achieving their goal, as Neville Goddard taught. Emotions fuel the journey.
2. Check the Systems (Master Inner Conversations): Encourage users to monitor their inner dialogue, ensuring it aligns with their desired reality.
3. Clear the Path (Revise the Past): Assist them in releasing limiting beliefs and rewriting their story for forward momentum.
4. Liftoff! (Live from the End): Motivate them to act, speak, and think as if their goal is already accomplished, accelerating their momentum.

Instant Shift Playbook
To "Build My Instant Shift Playbook," ask users these 7 questions to drive immediate action:
1. What's one specific area where you urgently need change?
2. What does success in this area look like today?
3. What's holding you back?
4. What is one action that would create the most immediate shift?
5. What can you remove or simplify to free up energy for this shift?
6. Who can support or hold you accountable in this effort?
7. What will you do in the next 60 minutes to take the first step?

This playbook triggers quick, focused action to shift momentum. When users have completed answering the questions, create a custom summary of their Instant Shift Playbook with well ordered headers and bullet points. Include the date and a relevant name for their Instant Shift Playbook. Conclude their Playbook with a personalized inspirational quote and inspiring summary paragraph.

Skill Assessment & Opportunity Analysis:
Help users assess their strengths and uncover opportunities through these steps:
1. Self-Awareness & Skill Assessment: Guide users through a SWOT analysis and help them seek feedback for continual improvement.
2. Market Research & Trend Analysis: Show them how to stay informed and spot opportunities by following industry leaders and using data analytics.
3. Build a Diverse Skill Set: Encourage cross-disciplinary learning and the pursuit of side projects to unlock hidden talents.
4. Cultivate a Growth Mindset: Motivate them to set stretch goals, embrace challenges, and view failures as opportunities for growth.
5. Leverage Mentorship & Collaboration: Advise them to find mentors, join mastermind groups, and collaborate with peers for shared growth.

David Goggins's "Won't Quit" Mindset:
Emphasize Goggins's philosophy of relentless perseverance, mental toughness, and pushing through discomfort to build momentum. Help users callous their minds and cultivate a "Won't Quit" attitude, which is essential to long-term success.

If users prompt to "Build My Opulence Blueprint":
Opulence BluePrint Builder - ask users for input, one question at a time - on these steps:
Step 1: Define Your Unique Opulence
Step 2: Envision the Role of Velocity
Step 3: Cultivate the Patience of Opulence
Step 4: Balance Velocity and Patience
Step 5: Anchor Your Vision in the Present

Final Opulence Blueprint Outline: Your Personalized Opulence Blueprint
Vision of Opulence:
How Velocity Drives Growth:
How Patience Cultivates Lasting Success:
Balancing Velocity and Patience:
Living Your Opulent Life Now:
Summary:

This blueprint embodies your unique approach to achieving opulence through both bold action and mindful patience. Keep this vision close, take consistent steps forward, and celebrate the wealth of progress each day brings.`;
            }

            // Use fastest model for speed
            const model = genAI.getGenerativeModel({
                model: "gemini-3-flash-preview", // Upgraded to Gemini 3 Flash for better reasoning
                systemInstruction: systemInstruction,
                generationConfig: {
                    temperature: mode === 'chat' ? 0.9 : 0.8, // Slightly higher for chat mode for more natural conversation
                    topP: 0.95,
                    topK: 40,
                    maxOutputTokens: maxOutputTokens,
                },
            });

            console.log(`⏱️ Model initialized in ${Date.now() - aiStartTime}ms`);

            // Build conversation history for Gemini API format
            const history: Array<{ role: string, parts: Array<{ text: string }> }> = [];

            // Add conversation history (excluding the current message)
            conversationHistory.forEach((msg: any) => {
                if (msg.role === 'user' || msg.role === 'model') {
                    history.push({
                        role: msg.role === 'user' ? 'user' : 'model',
                        parts: [{ text: msg.message || msg.text || '' }]
                    });
                }
            });

            // Add current user message
            history.push({
                role: 'user',
                parts: [{ text: userMessage }]
            });

            console.log(`📝 Sending ${history.length} messages to AI (including current)`);

            // Generate content with streaming for instant response
            const generateStartTime = Date.now();
            let fullText = '';
            let firstChunkTime: number | null = null;
            let sentenceCount = 0;
            const MAX_SENTENCES = maxSentences; // Mode-specific limit
            const MAX_CHARS = maxChars; // Mode-specific limit

            // Use streaming API with conversation history
            const result = await model.generateContentStream({
                contents: history,
            });

            // Stream responses as they arrive
            let lastUpdateTime = Date.now();
            let lastUpdateLength = 0;

            for await (const chunk of result.stream) {
                const chunkText = chunk.text();
                if (chunkText) {
                    fullText += chunkText;

                    // Only apply limits if not generating plan
                    if (shouldApplyLimits) {
                        // Better sentence detection: count actual sentence endings
                        // Look for sentence-ending punctuation followed by space or end of string
                        const sentencePattern = /[.!?]+(\s+|$)/g;
                        const sentences = fullText.match(sentencePattern) || [];
                        sentenceCount = sentences.length;

                        // Check if we've exceeded limits - but allow completion of current sentence
                        const hasExceededSentenceLimit = sentenceCount > MAX_SENTENCES;
                        const hasExceededCharLimit = fullText.length > MAX_CHARS * 1.3; // Allow 30% over for sentence completion

                        // Only stop if we've exceeded limits AND found a complete sentence boundary
                        if (hasExceededSentenceLimit || hasExceededCharLimit) {
                            // Find the end of the last complete sentence
                            const lastSentenceEnd = Math.max(
                                fullText.lastIndexOf('.'),
                                fullText.lastIndexOf('!'),
                                fullText.lastIndexOf('?')
                            );

                            // Only stop if we have a complete sentence boundary
                            // This ensures we never cut mid-sentence
                            if (lastSentenceEnd > 0 && lastSentenceEnd < fullText.length - 5) {
                                // We have a complete sentence that's not at the very end
                                // Check if we're past our limits
                                const textUpToSentence = fullText.substring(0, lastSentenceEnd + 1);
                                const sentencesUpToBoundary = (textUpToSentence.match(sentencePattern) || []).length;

                                if (sentencesUpToBoundary >= MAX_SENTENCES || textUpToSentence.length >= MAX_CHARS) {
                                    fullText = textUpToSentence.trim();
                                    console.log(`🛑 Stopped at ${sentencesUpToBoundary} sentences, ${fullText.length} chars (natural boundary)`);
                                    break; // Exit the stream loop
                                }
                            }
                            // If no good sentence boundary found, continue to allow completion
                        }
                    }

                    // Track first chunk time
                    if (firstChunkTime === null) {
                        firstChunkTime = Date.now();
                        const timeToFirstChunk = firstChunkTime - generateStartTime;
                        console.log(`⚡ First chunk received in ${timeToFirstChunk}ms`);

                        // Write first chunk immediately for instant TTS
                        await snap.ref.update({
                            response: fullText,
                            status: "STREAMING",
                            updateTime: admin.firestore.FieldValue.serverTimestamp(),
                        });
                        console.log(`📤 First chunk written to Firestore (${fullText.length} chars, ${sentenceCount} sentences)`);
                        lastUpdateTime = Date.now();
                        lastUpdateLength = fullText.length;
                    } else {
                        // Update with accumulated text more frequently (every ~100ms or every 15 chars) for instant feel
                        const timeSinceLastUpdate = Date.now() - lastUpdateTime;
                        const charsSinceLastUpdate = fullText.length - lastUpdateLength;

                        if (timeSinceLastUpdate > 100 || charsSinceLastUpdate >= 15) {
                            await snap.ref.update({
                                response: fullText,
                                updateTime: admin.firestore.FieldValue.serverTimestamp(),
                            });
                            lastUpdateTime = Date.now();
                            lastUpdateLength = fullText.length;
                        }
                    }
                }
            }

            // Final validation - only truncate if significantly over limits and we have a good boundary
            // Skip this entirely if generating plan
            if (shouldApplyLimits) {
                const finalSentenceCount = (fullText.match(/[.!?]+(\s+|$)/g) || []).length;
                const significantlyOverCharLimit = fullText.length > MAX_CHARS * 1.5; // 50% over
                const significantlyOverSentenceLimit = finalSentenceCount > MAX_SENTENCES + 1; // More than 1 sentence over

                if ((significantlyOverCharLimit || significantlyOverSentenceLimit) && fullText.length > 0) {
                    // Find the last sentence boundary
                    const lastSentenceEnd = Math.max(
                        fullText.lastIndexOf('.'),
                        fullText.lastIndexOf('!'),
                        fullText.lastIndexOf('?')
                    );

                    if (lastSentenceEnd > 50) { // Only if we have a substantial sentence
                        const truncated = fullText.substring(0, lastSentenceEnd + 1).trim();
                        const truncatedSentenceCount = (truncated.match(/[.!?]+(\s+|$)/g) || []).length;

                        // Only truncate if the truncated version is within reasonable limits
                        if (truncated.length <= MAX_CHARS * 1.2 && truncatedSentenceCount <= MAX_SENTENCES + 1) {
                            fullText = truncated;
                            console.log(`✂️ Final truncation: ${truncatedSentenceCount} sentences, ${fullText.length} chars (safety check)`);
                        } else {
                            console.log(`ℹ️ Keeping full response: ${finalSentenceCount} sentences, ${fullText.length} chars (within acceptable range)`);
                        }
                    } else {
                        console.log(`ℹ️ Keeping full response: ${finalSentenceCount} sentences, ${fullText.length} chars (no good boundary found)`);
                    }
                }
            } else {
                console.log(`📋 Plan generation complete: ${fullText.length} chars (no limits applied)`);
            }

            // Final update before marking complete (in case last chunk didn't trigger update)
            if (fullText.length > lastUpdateLength) {
                await snap.ref.update({
                    response: fullText,
                    updateTime: admin.firestore.FieldValue.serverTimestamp(),
                });
            }

            const generateTime = Date.now() - generateStartTime;
            console.log(`⏱️ AI generation completed in ${generateTime}ms`);

            // Final update with complete response
            await snap.ref.update({
                response: fullText,
                status: "COMPLETE",
                updateTime: admin.firestore.FieldValue.serverTimestamp(),
            });

            console.log(`✅ AI Response generated (${fullText.length} chars) in ${Date.now() - startTime}ms total`);

            const totalTime = Date.now() - startTime;
            console.log(`✅ Successfully processed document ${documentId} in ${totalTime}ms`);
            return null;
        } catch (error: any) {
            console.error("❌ Error processing AI prompt:", error);

            // Update document with error status
            // eslint-disable-next-line max-len
            const errorMessage = error.message || "An error occurred while processing the prompt";
            await snap.ref.update({
                status: "ERROR",
                error: errorMessage,
                updateTime: admin.firestore.FieldValue.serverTimestamp(),
            });

            return null;
        }
    });

/**
 * Build system prompt for the AI with calendar + progress context
 */
function extractTeamIdFromGoalContext(goalContext: any): string | null {
    if (!goalContext || typeof goalContext !== 'object') {
        return null;
    }

    const answers = goalContext.answers || {};
    const answerTeamId = typeof answers?.teamId === 'string' ? answers.teamId.trim() : '';
    if (answerTeamId) {
        return answerTeamId;
    }

    const goalId = typeof goalContext.id === 'string' ? goalContext.id.trim() : '';
    if (!goalId.startsWith('team-')) {
        return null;
    }

    const memberMatch = goalId.match(/^team-(.+?)-member-.+$/);
    if (memberMatch?.[1]) {
        return memberMatch[1].trim();
    }

    return goalId.slice('team-'.length).trim() || null;
}

async function resolveTeamAiSettingsFromGoalContext(goalContext: any): Promise<{ displayName: string; personality: string } | null> {
    const teamId = extractTeamIdFromGoalContext(goalContext);
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
        const personality = String(aiSettings.personality || '').trim().slice(0, 8000);
        if (!displayName && !personality) {
            return null;
        }

        return { displayName, personality };
    } catch (error) {
        console.warn('Unable to resolve team AI settings for goal context:', error);
        return null;
    }
}

async function buildSystemPrompt(goalContext: any, calendarEvents: any[], actionItems: any[], latestMissionLog: any): Promise<string> {
    // Get current date information for AI awareness
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

    // Shared philosophy (admin-editable)
    const sharedPhilosophy = await getSharedCoachPhilosophy();
    const sharedPhilosophyBlock = sharedPhilosophy
        ? `\n\nROCKETGOALS SHARED PHILOSOPHY:\n${sharedPhilosophy}`
        : '';
    const teamAiSettings = await resolveTeamAiSettingsFromGoalContext(goalContext);
    const teamAiDisplayName = teamAiSettings?.displayName || '';
    const teamAiPersonality = teamAiSettings?.personality || '';
    const teamAiPersonalityBlock = teamAiPersonality
        ? `\n\nTEAM AI PERSONALITY (ADMIN CUSTOMIZED):\n${teamAiPersonality}`
        : '';

    // Check if there's a custom copilot persona from app-suite
    const copilot = goalContext?.copilot;
    let baseIdentity: string;

    if (teamAiDisplayName) {
        const teamName = String(goalContext?.answers?.teamName || 'the team').trim();
        const fallbackRole = (copilot && copilot.role) ? String(copilot.role).trim() : 'the dedicated strategic AI coach';
        baseIdentity = `You are ${teamAiDisplayName}, ${fallbackRole}.

You are still powered by RocketGoals core coaching intelligence, but for this mission you MUST present and communicate as ${teamAiDisplayName}. Be personable and address the user as if you've been assigned specifically to help them succeed.

Your mission is to guide individuals using the ROCKET Goal framework while bringing your unique expertise and perspective. You also help users manage their calendar and schedule for achieving their goals.

${teamName ? `TEAM CONTEXT: This goal is linked to team "${teamName}".` : ''}

CURRENT DATE AND TIME:
Today is ${currentDateStr}. The current time is ${currentTimeStr}.
Use this information when users ask about dates, scheduling, or time-related questions. When they say "today", "tomorrow", "next week", etc., interpret these relative to this date.${sharedPhilosophyBlock}${teamAiPersonalityBlock}`;
    } else if (copilot && copilot.name && copilot.role) {
        // Custom copilot persona from app-suite launch
        baseIdentity = `You are ${copilot.name}, ${copilot.role}

You are the user's dedicated strategic co-pilot for this mission. Embody this persona fully - your expertise, communication style, and guidance should reflect your role as ${copilot.name}. Be personable and address the user as if you've been assigned specifically to help them succeed.

Your mission is to guide individuals using the ROCKET Goal framework while bringing your unique expertise and perspective. You also help users manage their calendar and schedule for achieving their goals.

CURRENT DATE AND TIME:
Today is ${currentDateStr}. The current time is ${currentTimeStr}.
Use this information when users ask about dates, scheduling, or time-related questions. When they say "today", "tomorrow", "next week", etc., interpret these relative to this date.${sharedPhilosophyBlock}`;
    } else {
        // Default RocketGoals AI persona
        baseIdentity = `You are a world-class coach, motivational genius, and unsurpassed goal-setting expert. Your mission is to guide individuals using the ROCKET Goal framework. You also help users manage their calendar and schedule for achieving their goals.

CURRENT DATE AND TIME:
Today is ${currentDateStr}. The current time is ${currentTimeStr}.
Use this information when users ask about dates, scheduling, or time-related questions. When they say "today", "tomorrow", "next week", etc., interpret these relative to this date.${sharedPhilosophyBlock}`;
    }

    const conversationGuidelines = `CRITICAL CONVERSATION GUIDELINES:
- Be helpful, concise, and action-oriented
- When users want to manage their calendar (add, edit, delete events), USE THE PROVIDED TOOLS IMMEDIATELY
- When users ask to update/edit milestones or tasks, USE milestone tools (update_milestone / create_milestone), not calendar tools.
- When users ask to "log for me" or submit a mission check-in, USE log_mission_progress.
- For creating events: use create_calendar_event with title and date
- For updating events: use update_calendar_event with the event's ID from the calendar list
- For deleting events: use delete_calendar_event with the event's ID. Match event names to IDs from the calendar list above.
- For updating milestones: use update_milestone with the milestone ID from the milestone list below.
- For creating milestones: use create_milestone with title and dayNumber.
- For mission log entry: use log_mission_progress.
- If user says "log for me" with no extra detail, still call log_mission_progress with sensible defaults.
- When the user says "delete X" or "remove X" or "cancel X", find the matching event by title and call delete_calendar_event with its ID
- Be conversational and natural - don't be robotic
- If there are multiple events with similar names and it's ambiguous, ask which one
- After taking an action, briefly confirm what was done
${teamAiPersonality ? '- Team AI personality is provided above. Follow it strictly for tone and communication style.' : ''}

IMPORTANT FOR DELETE/UPDATE: You MUST use IDs from the context lists (event IDs for calendar, item IDs for milestones), not titles.`;

    let contextualPrompt = `${baseIdentity}\n\n${conversationGuidelines}`;

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
    }

    // Add calendar events context
    if (calendarEvents && calendarEvents.length > 0) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        // Categorize events
        const todayEvents: any[] = [];
        const tomorrowEvents: any[] = [];
        const upcomingEvents: any[] = [];
        const pastEvents: any[] = [];

        calendarEvents.forEach((event: any) => {
            const eventDate = new Date(event.date);
            const eventDateOnly = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());

            const eventInfo = {
                id: event.id,
                title: event.title,
                date: eventDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
                time: event.time || null,
                duration: event.duration || 60,
                completed: event.completed || false,
                description: event.description || ''
            };

            if (eventDateOnly.getTime() === today.getTime()) {
                todayEvents.push(eventInfo);
            } else if (eventDateOnly.getTime() === tomorrow.getTime()) {
                tomorrowEvents.push(eventInfo);
            } else if (eventDateOnly < today) {
                pastEvents.push(eventInfo);
            } else {
                upcomingEvents.push(eventInfo);
            }
        });

        contextualPrompt += `\n\nCALENDAR EVENTS:`;

        if (todayEvents.length > 0) {
            contextualPrompt += `\n\nToday's Events:`;
            todayEvents.forEach(e => {
                contextualPrompt += `\n- "${e.title}" (ID: ${e.id})${e.time ? ` at ${e.time}` : ''}${e.completed ? ' ✓ completed' : ''}`;
            });
        }

        if (tomorrowEvents.length > 0) {
            contextualPrompt += `\n\nTomorrow's Events:`;
            tomorrowEvents.forEach(e => {
                contextualPrompt += `\n- "${e.title}" (ID: ${e.id})${e.time ? ` at ${e.time}` : ''}`;
            });
        }

        if (upcomingEvents.length > 0) {
            contextualPrompt += `\n\nUpcoming Events:`;
            upcomingEvents.slice(0, 7).forEach(e => {
                contextualPrompt += `\n- "${e.title}" on ${e.date} (ID: ${e.id})${e.time ? ` at ${e.time}` : ''}`;
            });
            if (upcomingEvents.length > 7) {
                contextualPrompt += `\n... and ${upcomingEvents.length - 7} more`;
            }
        }

        if (pastEvents.length > 0) {
            contextualPrompt += `\n\nRecent Past Events:`;
            pastEvents.slice(-3).forEach(e => {
                contextualPrompt += `\n- "${e.title}" on ${e.date} (ID: ${e.id})${e.completed ? ' ✓ completed' : ''}`;
            });
        }

        contextualPrompt += `\n\nIMPORTANT INSTRUCTIONS FOR TOOLS:
- To DELETE an event: Call delete_calendar_event with eventId set to the ID shown in parentheses above (e.g., if event shows "(ID: abc123)", use eventId: "abc123")
- To UPDATE an event: Call update_calendar_event with the eventId plus any fields to change
- To CREATE an event: Call create_calendar_event with title and date (natural language like "tomorrow" works)
- ALWAYS use the exact ID string from the calendar list - do not make up IDs`;
    } else {
        contextualPrompt += `\n\nCALENDAR: No events scheduled yet. The user can ask you to add events to help track their goal progress.`;
    }

    // Add milestone context
    if (actionItems && actionItems.length > 0) {
        const sortedItems = [...actionItems].sort((a: any, b: any) => {
            const dayDelta = Number(a?.dayNumber || 0) - Number(b?.dayNumber || 0);
            if (dayDelta !== 0) return dayDelta;
            return Number(a?.order || 0) - Number(b?.order || 0);
        });
        contextualPrompt += `\n\nMILESTONES (ACTION ITEMS):`;
        sortedItems.slice(0, 40).forEach((item: any) => {
            contextualPrompt += `\n- "${item.title || 'Untitled milestone'}" (ID: ${item.id}) [Day ${item.dayNumber || '?'}]${item.completed ? ' ✓ completed' : ''}${item.postponed ? ' ⏸ postponed' : ''}`;
        });
        if (sortedItems.length > 40) {
            contextualPrompt += `\n... and ${sortedItems.length - 40} more milestones`;
        }
        contextualPrompt += `\n\nMILESTONE TOOL INSTRUCTIONS:
- To UPDATE a milestone: call update_milestone with itemId from the list above and changed fields.
- To CREATE a new milestone: call create_milestone with title and dayNumber.
- Prefer milestone tools when user says "milestone", "task", "plan item", or "update my milestones".`;
    } else {
        contextualPrompt += `\n\nMILESTONES: No milestones listed. If user asks to add one, call create_milestone.`;
    }

    // Add latest mission log snapshot for better defaults
    if (latestMissionLog) {
        contextualPrompt += `\n\nLATEST MISSION LOG SNAPSHOT:
- actionTaken: ${latestMissionLog.actionTaken || 'unknown'}
- focusLevel: ${latestMissionLog.focusLevel || 'unknown'}
- challengeLevel: ${latestMissionLog.challengeLevel || 'unknown'}
- feeling: ${latestMissionLog.feeling || 'unknown'}
- teamConnection: ${latestMissionLog.teamConnection || 'unknown'}
- note: ${latestMissionLog.note || 'none'}`;
    } else {
        contextualPrompt += `\n\nMISSION LOG: No previous mission log found for this goal yet.`;
    }

    return contextualPrompt;
}

const MAX_ATTACHMENT_CONTEXT_CHARS = 12000;

function buildAttachmentContext(attachments: any[]): string | null {
    if (!Array.isArray(attachments) || attachments.length === 0) {
        return null;
    }

    const entries = attachments
        .filter(att => att && typeof att.text === 'string' && att.text.trim().length > 0)
        .map(att => {
            const name = att.name || 'Unnamed file';
            const type = att.mimeType || 'unknown';
            return `File: ${name}\nType: ${type}\nContent:\n${att.text}`;
        });

    if (entries.length === 0) {
        return null;
    }

    let combined = entries.join('\n\n');
    if (combined.length > MAX_ATTACHMENT_CONTEXT_CHARS) {
        combined = `${combined.slice(0, MAX_ATTACHMENT_CONTEXT_CHARS)}\n...[truncated]`;
    }

    return `User attached files (for reference):\n${combined}`;
}

function normalizeStringArray(input: unknown, maxItems: number, maxItemLength = 160): string[] {
    if (!Array.isArray(input)) {
        return [];
    }

    const normalized = input
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
        .slice(0, maxItems)
        .map((item) => item.slice(0, maxItemLength));

    return Array.from(new Set(normalized));
}

function extractJsonPayload(raw: string): any {
    const clean = (raw || '')
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

    if (!clean) {
        throw new Error('Model returned an empty response');
    }

    try {
        return JSON.parse(clean);
    } catch (_firstError) {
        const firstBrace = clean.indexOf('{');
        const lastBrace = clean.lastIndexOf('}');
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            const candidate = clean.slice(firstBrace, lastBrace + 1);
            return JSON.parse(candidate);
        }
        throw new Error('Unable to parse JSON response from model');
    }
}

/**
 * HTTPS callable function for chat-based AI responses with native function calling
 * Uses Gemini's tool/function calling for reliable calendar operations
 */
export const rocketGoalsAI = onCall({
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
}, async (request: any) => {
    const startTime = Date.now();

    try {
        const apiKey = geminiApiKey.value();
        if (!apiKey) {
            throw new HttpsError(
                "failed-precondition",
                "Google AI API key is not configured"
            );
        }

        const data = request?.data || {};
        const userMessage = (data?.message || "").toString().trim();
        const conversationHistory = Array.isArray(data?.conversationHistory) ? data.conversationHistory : [];
        const attachments = Array.isArray(data?.attachments) ? data.attachments : [];
        const goalContext = data?.goalContext;
        const calendarEvents = Array.isArray(data?.calendarEvents) ? data.calendarEvents : [];
        const actionItems = Array.isArray(data?.actionItems) ? data.actionItems : [];
        const latestMissionLog = data?.latestMissionLog && typeof data.latestMissionLog === 'object'
            ? data.latestMissionLog
            : null;

        if (!userMessage) {
            throw new HttpsError(
                "invalid-argument",
                "Message is required"
            );
        }

        console.log(`🚀 rocketGoalsAI called with message: "${userMessage.substring(0, 50)}..."`);
        console.log(`📅 Calendar events: ${calendarEvents.length}, milestones: ${actionItems.length}, Goal ID: ${goalContext?.id || 'none'}`);

        // Get tool registry
        const toolRegistry = getToolRegistry();
        const toolDeclarations = toolRegistry.getFunctionDeclarations();
        console.log(`🔧 Available tools: ${toolRegistry.getToolNames().join(', ')}`);

        // Build system prompt with context
        const systemInstruction = await buildSystemPrompt(goalContext, calendarEvents, actionItems, latestMissionLog);

        // Initialize Gemini with function calling
        const genAI = new GoogleGenerativeAI(apiKey);
        const modelName = "gemini-3-flash-preview"; // Upgraded to Gemini 3 Flash for better reasoning

        const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction,
            generationConfig: {
                temperature: 0.8,
                topP: 0.95,
                topK: 40,
                maxOutputTokens: 8192, // High ceiling - let the AI decide response length naturally
            },
            tools: [{
                functionDeclarations: toolDeclarations
            }]
        });

        // Build conversation history for Gemini
        const history: Array<{ role: string; parts: Array<{ text: string }> }> = [];
        conversationHistory.forEach((msg: any) => {
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

        // Add attachment context if provided
        const attachmentContext = buildAttachmentContext(attachments);
        if (attachmentContext) {
            history.push({
                role: "user",
                parts: [{ text: attachmentContext }],
            });
        }

        console.log(`📝 Sending ${history.length} messages to AI`);

        // Generate content (may include function calls)
        let result = await model.generateContent({
            contents: history,
        });

        let response = result.response;
        let responseText = response.text?.() || "";
        const allSideEffects: SideEffect[] = [];
        const allToolCalls: Array<{ name: string; args: any; result: any }> = [];

        // Check for function calls and execute them
        let functionCalls = response.functionCalls?.() || [];
        let loopCount = 0;
        const MAX_LOOPS = 3; // Prevent infinite loops

        while (functionCalls.length > 0 && loopCount < MAX_LOOPS) {
            loopCount++;
            console.log(`🔄 Processing ${functionCalls.length} function call(s) (loop ${loopCount})`);

            // Execute all function calls
            const functionResults = [];
            for (const fc of functionCalls) {
                console.log(`🔧 Executing: ${fc.name}`, fc.args);

                const toolResult = await toolRegistry.execute(
                    fc.name,
                    fc.args as Record<string, any>,
                    {
                        userId: request.auth?.uid,
                        goalId: goalContext?.id
                    }
                );

                allToolCalls.push({
                    name: fc.name,
                    args: fc.args,
                    result: toolResult
                });

                if (toolResult.sideEffects) {
                    allSideEffects.push(...toolResult.sideEffects);
                }

                functionResults.push({
                    functionResponse: {
                        name: fc.name,
                        response: {
                            success: toolResult.success,
                            message: toolResult.message,
                            data: toolResult.data
                        }
                    }
                });
            }

            // Send function results back to model.
            // IMPORTANT: preserve the original functionCall parts from the model response
            // (including thought_signature) instead of reconstructing them from response.functionCalls().
            const originalFunctionCallParts =
                response?.candidates?.[0]?.content?.parts?.filter((part: any) => part?.functionCall) || [];

            history.push({
                role: "model",
                parts: (originalFunctionCallParts.length > 0
                    ? originalFunctionCallParts
                    : functionCalls.map(fc => ({ functionCall: fc }))) as any
            });

            history.push({
                role: "user",
                parts: functionResults as any
            });

            // Get next response
            result = await model.generateContent({
                contents: history,
            });

            response = result.response;
            responseText = response.text?.() || "";
            functionCalls = response.functionCalls?.() || [];
        }

        if (!responseText && allToolCalls.length > 0) {
            // If no text response but we had tool calls, generate a summary
            const lastResult = allToolCalls[allToolCalls.length - 1].result;
            responseText = lastResult.message || "Done!";
        }

        if (!responseText) {
            throw new HttpsError(
                "internal",
                "Empty response from AI model"
            );
        }

        const totalTime = Date.now() - startTime;
        console.log(`✅ rocketGoalsAI completed in ${totalTime}ms`);
        console.log(`📊 Tool calls: ${allToolCalls.length}, Side effects: ${allSideEffects.length}`);

        // Return structured response
        return {
            response: responseText,
            model: modelName,
            toolCalls: allToolCalls,
            sideEffects: allSideEffects
        };
    } catch (error: any) {
        console.error("❌ rocketGoalsAI error:", error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError(
            "internal",
            error?.message || "Unknown error"
        );
    }
});

/**
 * Admin-only synthetic market simulator for coach-market fit discovery.
 * Uses Gemini 3 to simulate persona-level responses and return structured output.
 */
export const runSyntheticMarketSimulation = onCall({
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
}, async (request: any) => {
    const startTime = Date.now();
    try {
        if (!request.auth?.uid) {
            throw new HttpsError("unauthenticated", "You must be logged in.");
        }

        const userDoc = await admin.firestore()
            .collection('userProfiles')
            .doc(request.auth.uid)
            .get();
        const userData = userDoc.data();
        if (!userData || (userData.role !== 'admin' && userData.admin !== true)) {
            throw new HttpsError("permission-denied", "Only administrators can run synthetic market tests.");
        }

        const apiKey = geminiApiKey.value();
        if (!apiKey) {
            throw new HttpsError("failed-precondition", "Google AI API key is not configured.");
        }

        const data = request?.data || {};
        const coachName = (data.coachName || 'Unnamed coach').toString().trim().slice(0, 120);
        const productDescription = (data.productDescription || '').toString().trim().slice(0, 4000);
        const researchGoal = (data.researchGoal || '').toString().trim().slice(0, 1500);
        const personaSeeds = normalizeStringArray(data.personaSeeds, 50, 260);
        const positioningOptions = normalizeStringArray(data.positioningOptions, 20, 120);
        const coreMessageOptions = normalizeStringArray(data.coreMessageOptions, 20, 120);
        const pricingOptions = normalizeStringArray(data.pricingOptions, 20, 80);
        const targetAudienceOptions = normalizeStringArray(data.targetAudienceOptions, 20, 120);
        const channelOptions = normalizeStringArray(data.channelOptions, 20, 120);

        if (!productDescription) {
            throw new HttpsError("invalid-argument", "productDescription is required.");
        }
        if (personaSeeds.length === 0) {
            throw new HttpsError("invalid-argument", "At least one persona seed is required.");
        }

        const modelName = "gemini-3-flash-preview";
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                temperature: 0.35,
                topP: 0.9,
                maxOutputTokens: 8192,
                responseMimeType: "application/json"
            }
        });

        const instruction = `You are a synthetic market testing engine for early-stage coaching products.
Your job: evaluate market fit and produce precise recommendations.

Scoring:
- intentScore range is 0 to 3 (0=no intent, 1=low, 2=medium, 3=high)
- confidence range is 0 to 1

Return strict JSON only with this schema:
{
  "summary": {
    "bestAudience": "string",
    "bestPositioning": "string",
    "bestCoreMessage": "string",
    "bestPricing": "string",
    "bestChannel": "string",
    "keyObjection": "string",
    "confidence": 0.0
  },
  "winningCombinations": [
    {
      "positioning": "string",
      "coreMessage": "string",
      "pricing": "string",
      "targetAudience": "string",
      "channel": "string",
      "intentScore": 0.0,
      "confidence": 0.0,
      "rationale": "string"
    }
  ],
  "audienceInsights": [
    {
      "audience": "string",
      "averageIntent": 0.0,
      "motivators": ["string"],
      "objections": ["string"]
    }
  ],
  "personaResponses": [
    {
      "personaName": "string",
      "audience": "string",
      "intentScore": 0.0,
      "verdict": "yes|maybe|no",
      "attraction": "string",
      "repellents": "string",
      "questions": ["string"],
      "payTrigger": "string"
    }
  ],
  "nextActions": [
    {
      "priority": 1,
      "action": "string",
      "why": "string",
      "owner": "Founder",
      "timeline": "string"
    }
  ]
}

Rules:
- Use every provided variable list (positioning, core messages, pricing, audiences, channels).
- Be concrete and decision-oriented, not generic.
- Keep winningCombinations length <= 5.
- Keep personaResponses length <= 20.
- Keep nextActions length between 3 and 7.
- Never return markdown, only JSON.`;

        const inputPayload = {
            coachName,
            productDescription,
            researchGoal,
            personaSeeds,
            variableMatrix: {
                positioningOptions,
                coreMessageOptions,
                pricingOptions,
                targetAudienceOptions,
                channelOptions
            }
        };

        const response = await model.generateContent({
            contents: [{
                role: "user",
                parts: [
                    { text: instruction },
                    { text: `INPUT_JSON:\n${JSON.stringify(inputPayload, null, 2)}` }
                ]
            }]
        });

        const responseText = response.response?.text?.() || '';
        const parsed = extractJsonPayload(responseText);
        const totalTime = Date.now() - startTime;

        console.log(`✅ runSyntheticMarketSimulation completed in ${totalTime}ms for coach "${coachName}"`);

        return {
            success: true,
            model: modelName,
            generatedAt: new Date().toISOString(),
            result: parsed
        };
    } catch (error: any) {
        console.error("❌ runSyntheticMarketSimulation error:", error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError("internal", error?.message || "Unable to run synthetic simulation.");
    }
});

/**
 * Admin-only persona seed generator for synthetic market testing.
 * Builds persona lines from product + strategy configuration.
 */
export const generateSyntheticPersonaSeeds = onCall({
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
}, async (request: any) => {
    const startTime = Date.now();
    try {
        if (!request.auth?.uid) {
            throw new HttpsError("unauthenticated", "You must be logged in.");
        }

        const userDoc = await admin.firestore()
            .collection('userProfiles')
            .doc(request.auth.uid)
            .get();
        const userData = userDoc.data();
        if (!userData || (userData.role !== 'admin' && userData.admin !== true)) {
            throw new HttpsError("permission-denied", "Only administrators can generate persona seeds.");
        }

        const apiKey = geminiApiKey.value();
        if (!apiKey) {
            throw new HttpsError("failed-precondition", "Google AI API key is not configured.");
        }

        const data = request?.data || {};
        const coachName = (data.coachName || 'Unnamed coach').toString().trim().slice(0, 120);
        const productDescription = (data.productDescription || '').toString().trim().slice(0, 4000);
        const researchGoal = (data.researchGoal || '').toString().trim().slice(0, 1500);
        const positioningOptions = normalizeStringArray(data.positioningOptions, 20, 120);
        const coreMessageOptions = normalizeStringArray(data.coreMessageOptions, 20, 120);
        const pricingOptions = normalizeStringArray(data.pricingOptions, 20, 80);
        const targetAudienceOptions = normalizeStringArray(data.targetAudienceOptions, 20, 120);
        const channelOptions = normalizeStringArray(data.channelOptions, 20, 120);
        const existingPersonaSeeds = normalizeStringArray(data.existingPersonaSeeds, 30, 260);

        if (!productDescription) {
            throw new HttpsError("invalid-argument", "productDescription is required.");
        }

        const modelName = "gemini-3-flash-preview";
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
                temperature: 0.45,
                topP: 0.9,
                maxOutputTokens: 4096,
                responseMimeType: "application/json"
            }
        });

        const instruction = `You generate realistic synthetic persona seeds for product-market simulation.
Return strict JSON only with this schema:
{
  "personaSeeds": ["string"]
}

Persona seed format (one line each):
"Name, age, role/life context, location, constraints, buying mindset"

Rules:
- Return between 8 and 14 persona seeds.
- Keep each line under 240 characters.
- Make personas diverse across motivation, budget, risk tolerance, life stage, and urgency.
- Incorporate the provided strategy options (positioning, messaging, pricing, audiences, channels) in believable ways.
- Avoid duplicates and generic labels like "Persona 1".
- If existingPersonaSeeds are provided, improve and diversify beyond them instead of repeating them.
- Never return markdown, only JSON.`;

        const inputPayload = {
            coachName,
            productDescription,
            researchGoal,
            positioningOptions,
            coreMessageOptions,
            pricingOptions,
            targetAudienceOptions,
            channelOptions,
            existingPersonaSeeds
        };

        const response = await model.generateContent({
            contents: [{
                role: "user",
                parts: [
                    { text: instruction },
                    { text: `INPUT_JSON:\n${JSON.stringify(inputPayload, null, 2)}` }
                ]
            }]
        });

        const responseText = response.response?.text?.() || '';
        const parsed = extractJsonPayload(responseText);
        const personaSeeds = normalizeStringArray(parsed?.personaSeeds, 14, 260);

        if (personaSeeds.length === 0) {
            throw new Error("Model returned no persona seeds.");
        }

        const totalTime = Date.now() - startTime;
        console.log(`✅ generateSyntheticPersonaSeeds completed in ${totalTime}ms for coach "${coachName}"`);

        return {
            success: true,
            model: modelName,
            generatedAt: new Date().toISOString(),
            personaSeeds
        };
    } catch (error: any) {
        console.error("❌ generateSyntheticPersonaSeeds error:", error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError("internal", error?.message || "Unable to generate persona seeds.");
    }
});

/**
 * Cloud Function to fetch GA4 metrics for the /ai path
 */
export const getAiAnalytics = functions.runWith({
    timeoutSeconds: 30,
    memory: "256MB",
    secrets: [gaPropertyId]
}).https.onCall(async (data: { startDate?: string; endDate?: string } | unknown, context: functions.https.CallableContext) => {
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'You must be logged in to fetch analytics.'
        );
    }

    // Check admin status from Firestore userProfiles
    const userDoc = await admin.firestore()
        .collection('userProfiles')
        .doc(context.auth.uid)
        .get();
    const userData = userDoc.data();
    if (!userData || (userData.role !== 'admin' && userData.admin !== true)) {
        throw new functions.https.HttpsError(
            'permission-denied',
            'Only administrators can fetch analytics.'
        );
    }

    const propertyId = gaPropertyId.value();
    if (!propertyId) {
        throw new functions.https.HttpsError(
            'failed-precondition',
            'GA_PROPERTY_ID is not set. Configure it before calling this function.'
        );
    }

    try {
        const analyticsDataClient = new BetaAnalyticsDataClient();
        // Accept date range from data, default to last 28 days
        console.log('📊 getAiAnalytics received raw data:', JSON.stringify(data));
        console.log('📊 getAiAnalytics data type:', typeof data, 'is object:', typeof data === 'object', 'is null:', data === null);

        // Extract date parameters more explicitly - handle Firebase callable function data format
        let startDate = "28daysAgo";
        let endDate = "today";

        if (data && typeof data === 'object' && data !== null) {
            // Try direct property access first
            const requestData = data as any;
            console.log('📊 requestData keys:', Object.keys(requestData));
            console.log('📊 requestData.startDate:', requestData.startDate, 'type:', typeof requestData.startDate);
            console.log('📊 requestData.endDate:', requestData.endDate, 'type:', typeof requestData.endDate);

            // Check for startDate property
            if ('startDate' in requestData && requestData.startDate) {
                const sd = String(requestData.startDate).trim();
                if (sd) {
                    startDate = sd;
                    console.log('✅ Using startDate from request:', startDate);
                }
            }

            // Check for endDate property
            if ('endDate' in requestData && requestData.endDate) {
                const ed = String(requestData.endDate).trim();
                if (ed) {
                    endDate = ed;
                    console.log('✅ Using endDate from request:', endDate);
                }
            }
        }

        console.log('📊 getAiAnalytics FINAL date range:', { startDate, endDate });
        const aiPageFilter = {
            filter: {
                fieldName: "pagePath",
                stringFilter: {
                    matchType: "EXACT" as const,
                    value: "/ai"
                }
            }
        };

        // Main metrics report
        const [mainReport] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate, endDate }],
            dimensions: [{ name: "pagePath" }],
            dimensionFilter: aiPageFilter,
            metrics: [
                { name: "screenPageViews" },
                { name: "activeUsers" },
                { name: "eventCount" },
                { name: "totalRevenue" },
                { name: "userEngagementDuration" },
                { name: "newUsers" },
                { name: "sessions" },
                { name: "bounceRate" },
                { name: "averageSessionDuration" }
            ],
            limit: 1
        });

        // Countries breakdown
        const [countryReport] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate, endDate }],
            dimensions: [{ name: "country" }],
            dimensionFilter: aiPageFilter,
            metrics: [{ name: "activeUsers" }, { name: "screenPageViews" }],
            orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
            limit: 10
        });

        // Device categories breakdown
        const [deviceReport] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate, endDate }],
            dimensions: [{ name: "deviceCategory" }],
            dimensionFilter: aiPageFilter,
            metrics: [{ name: "activeUsers" }, { name: "screenPageViews" }],
            orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
            limit: 5
        });

        // Browser breakdown
        const [browserReport] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate, endDate }],
            dimensions: [{ name: "browser" }],
            dimensionFilter: aiPageFilter,
            metrics: [{ name: "activeUsers" }, { name: "screenPageViews" }],
            orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
            limit: 5
        });

        // Traffic sources
        const [sourceReport] = await analyticsDataClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate, endDate }],
            dimensions: [{ name: "sessionDefaultChannelGroup" }],
            dimensionFilter: aiPageFilter,
            metrics: [{ name: "activeUsers" }, { name: "screenPageViews" }],
            orderBys: [{ metric: { metricName: "activeUsers" }, desc: true }],
            limit: 10
        });

        const row = mainReport.rows?.[0];
        const metrics = row?.metricValues || [];

        const views = Number(metrics[0]?.value || 0);
        const activeUsers = Number(metrics[1]?.value || 0);
        const eventCount = Number(metrics[2]?.value || 0);
        const totalRevenue = Number(metrics[3]?.value || 0);
        const engagementSeconds = Number(metrics[4]?.value || 0);
        const newUsers = Number(metrics[5]?.value || 0);
        const sessions = Number(metrics[6]?.value || 0);
        const bounceRate = Number(metrics[7]?.value || 0);
        const avgSessionDuration = Number(metrics[8]?.value || 0);

        const viewsPerActiveUser = activeUsers > 0 ? +(views / activeUsers).toFixed(2) : 0;
        const avgEngagementPerActiveUserSeconds = activeUsers > 0 ? +(engagementSeconds / activeUsers).toFixed(1) : 0;

        // Parse breakdown reports
        const countries = (countryReport.rows || []).map(r => ({
            country: r.dimensionValues?.[0]?.value || 'Unknown',
            activeUsers: Number(r.metricValues?.[0]?.value || 0),
            views: Number(r.metricValues?.[1]?.value || 0)
        }));

        const devices = (deviceReport.rows || []).map(r => ({
            device: r.dimensionValues?.[0]?.value || 'Unknown',
            activeUsers: Number(r.metricValues?.[0]?.value || 0),
            views: Number(r.metricValues?.[1]?.value || 0)
        }));

        const browsers = (browserReport.rows || []).map(r => ({
            browser: r.dimensionValues?.[0]?.value || 'Unknown',
            activeUsers: Number(r.metricValues?.[0]?.value || 0),
            views: Number(r.metricValues?.[1]?.value || 0)
        }));

        const trafficSources = (sourceReport.rows || []).map(r => ({
            channel: r.dimensionValues?.[0]?.value || 'Unknown',
            activeUsers: Number(r.metricValues?.[0]?.value || 0),
            views: Number(r.metricValues?.[1]?.value || 0)
        }));

        return {
            path: "/ai",
            propertyId,
            dateRange: { startDate, endDate },
            views,
            activeUsers,
            viewsPerActiveUser,
            avgEngagementPerActiveUserSeconds,
            engagementSeconds,
            eventCount,
            totalRevenue,
            newUsers,
            sessions,
            bounceRate: +(bounceRate * 100).toFixed(1),
            avgSessionDurationSeconds: +avgSessionDuration.toFixed(1),
            countries,
            devices,
            browsers,
            trafficSources
        };
    } catch (error: any) {
        console.error("❌ getAiAnalytics error:", error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError(
            "internal",
            error?.message || "Failed to fetch analytics."
        );
    }
});

/**
 * Cloud Function to send test emails via SendGrid
 * Only accessible by admin users
 */
export const sendTestEmail = functions.runWith({
    secrets: [sendgridApiKey]
}).https.onCall(async (data: { to: string; subject: string; message: string }, context: functions.https.CallableContext) => {
    // Verify the user is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'You must be logged in to send emails.'
        );
    }

    // Check if user is admin
    const userDoc = await admin.firestore()
        .collection('userProfiles')
        .doc(context.auth.uid)
        .get();

    const userData = userDoc.data();
    if (!userData || (userData.role !== 'admin' && !userData.admin)) {
        throw new functions.https.HttpsError(
            'permission-denied',
            'Only administrators can send test emails.'
        );
    }

    // Validate input
    const { to, subject, message } = data;
    if (!to || !subject || !message) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Missing required fields: to, subject, message'
        );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(to)) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Invalid email address format'
        );
    }

    try {
        // Initialize SendGrid with API key
        const apiKey = sendgridApiKey.value();
        if (!apiKey) {
            throw new Error('SendGrid API key is not set. Please set it using: firebase functions:secrets:set SENDGRID_API_KEY');
        }
        sgMail.setApiKey(apiKey);

        const suppressionReason = await getSendgridSuppressionReason(apiKey, email);
        if (suppressionReason) {
            throw new functions.https.HttpsError(
                'failed-precondition',
                `SendGrid suppression prevents delivery to ${email}: ${suppressionReason}. Remove the suppression in SendGrid and retry.`
            );
        }

        // Create email message
        const msg = {
            to: to,
            from: 'missioncontrol@rocketgoals.com', // Verified sender email
            subject: subject,
            text: message,
            html: `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #dc2626 0%, #000000 100%); padding: 30px; border-radius: 16px 16px 0 0;">
                        <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 800;">🚀 Rocket Goals</h1>
                    </div>
                    <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 16px 16px;">
                        <h2 style="color: #111827; margin: 0 0 20px 0; font-size: 22px;">${subject}</h2>
                        <div style="color: #374151; font-size: 16px; line-height: 1.6;">
                            ${message.replace(/\n/g, '<br>')}
                        </div>
                        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                            <p style="color: #9ca3af; font-size: 14px; margin: 0;">
                                This is a test email from Rocket Goals Admin Panel.
                            </p>
                        </div>
                    </div>
                </div>
            `,
        };

        // Send the email
        await sgMail.send(msg);

        console.log(`✅ Test email sent successfully to ${to}`);

        return {
            success: true,
            message: `Email sent successfully to ${to}`
        };
    } catch (error: any) {
        console.error('❌ Error sending email:', error);

        // Handle SendGrid specific errors
        if (error.response) {
            const { body } = error.response;
            throw new functions.https.HttpsError(
                'internal',
                `SendGrid error: ${JSON.stringify(body)}`
            );
        }

        throw new functions.https.HttpsError(
            'internal',
            `Failed to send email: ${error.message}`
        );
    }
});

/**
 * Cloud Function to send test SMS messages via Twilio
 * Only accessible by admin users
 */
export const sendTestSMS = functions.runWith({
    secrets: [
        twilioAccountSid,
        twilioAuthToken,
        twilioPhoneNumber,
        twilioAccountSid2,
        twilioAuthToken2,
        twilioPhoneNumber2
    ]
}).https.onCall(async (
    data: { phoneNumber: string; message: string; credentialSet?: 'primary' | 'alternate' },
    context: functions.https.CallableContext
) => {
    // Verify the user is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'You must be logged in to send SMS messages.'
        );
    }

    // Check if user is admin
    const userDoc = await admin.firestore()
        .collection('userProfiles')
        .doc(context.auth.uid)
        .get();

    const userData = userDoc.data();
    if (!userData || (userData.role !== 'admin' && !userData.admin)) {
        throw new functions.https.HttpsError(
            'permission-denied',
            'Only administrators can send test SMS messages.'
        );
    }

    // Validate input
    const { phoneNumber, message } = data;
    const credentialSet = data?.credentialSet === 'alternate' ? 'alternate' : 'primary';
    if (!phoneNumber || !message) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Missing required fields: phoneNumber, message'
        );
    }

    // Validate phone number format (basic validation - E.164 format preferred)
    // Remove any non-digit characters except + at the start
    const cleanedPhone = phoneNumber.trim();
    if (!cleanedPhone || cleanedPhone.length < 10) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Invalid phone number format. Please use E.164 format (e.g., +1234567890)'
        );
    }

    // Validate message length (SMS limit is 1600 characters for Twilio)
    if (message.length > 1600) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Message is too long. Maximum length is 1600 characters.'
        );
    }

    try {
        // Get Twilio credentials (primary or alternate set)
        const accountSid = credentialSet === 'alternate'
            ? twilioAccountSid2.value()
            : twilioAccountSid.value();
        const authToken = credentialSet === 'alternate'
            ? twilioAuthToken2.value()
            : twilioAuthToken.value();
        const fromNumber = credentialSet === 'alternate'
            ? twilioPhoneNumber2.value()
            : twilioPhoneNumber.value();

        if (!accountSid || !authToken || !fromNumber) {
            const suffix = credentialSet === 'alternate' ? '_2' : '';
            throw new Error(`Twilio credentials are not set for ${credentialSet} set. Please set: TWILIO_ACCOUNT_SID${suffix}, TWILIO_AUTH_TOKEN${suffix}, TWILIO_PHONE_NUMBER${suffix}`);
        }

        // Initialize Twilio client
        const client = twilio(accountSid, authToken);

        // Send SMS
        const result = await client.messages.create({
            body: message,
            from: fromNumber,
            to: cleanedPhone
        });

        console.log(`✅ Test SMS sent successfully using ${credentialSet} credentials to ${cleanedPhone}. SID: ${result.sid}`);

        return {
            success: true,
            message: `SMS sent successfully to ${cleanedPhone} using ${credentialSet} credentials`,
            sid: result.sid,
            status: result.status,
            credentialSet
        };
    } catch (error: any) {
        console.error('❌ Error sending SMS:', error);

        // Handle Twilio specific errors
        if (error.code) {
            let errorMessage = `Twilio error (${error.code}): ${error.message}`;

            // Provide helpful error messages for common issues
            if (error.code === 21211) {
                errorMessage = 'Invalid phone number format. Please use E.164 format (e.g., +1234567890)';
            } else if (error.code === 21608) {
                errorMessage = 'The phone number is not verified for your Twilio account. Please verify it in the Twilio console.';
            } else if (error.code === 21614) {
                errorMessage = 'Invalid "from" phone number. Please check your TWILIO_PHONE_NUMBER secret.';
            }

            throw new functions.https.HttpsError(
                'internal',
                errorMessage
            );
        }

        throw new functions.https.HttpsError(
            'internal',
            `Failed to send SMS: ${error.message}`
        );
    }
});

type MilestoneEmailItem = {
    id: string;
    title: string;
    dayNumber: number;
    dateLabel: string;
    updateUrl: string;
};

type GroupedGoalReminderItem = {
    id: string;
    title: string;
    url: string;
    dedupeKey?: string;
    isTeamMemberGoal?: boolean;
    milestones?: MilestoneEmailItem[];
    activeMilestone?: string;
    oneThing?: string;
    missionLogSummary?: string;
    imageUrl?: string;
    isMyOneThing?: boolean;
    createdAtMs?: number;
    coachName?: string;
    coachAvatarUrl?: string;
};

const APP_SUITE_COACHES: Record<string, { name: string; avatar: string }> = {
    'hustle-orbit': { name: 'Marcus Chen', avatar: '/assets/ogilvy.jpg' },
    'opti-human': { name: 'Dr. Elena Vance', avatar: '/assets/a-2.jpg' },
    'marketing-maven': { name: 'Sarah Jenkins', avatar: '/assets/sarah-jenkins.jpg' },
    'pipeline-pilot': { name: 'David Ross', avatar: '/assets/a-4.jpg' },
    'apex-ascend': { name: 'Robert Sterling', avatar: '/assets/a-5.jpg' },
    'creator-craft': { name: 'Maya Rivera', avatar: '/assets/a-6.jpg' },
    'neuro-nexus': { name: 'Alex Tech', avatar: '/assets/a-7.jpg' },
    'boss-beam': { name: 'Claire Beaumont', avatar: '/assets/a-8.jpg' },
    'my-sugar-shift': { name: 'Lucille Grant', avatar: '/assets/a-9.jpg' },
    'my-rocket-ride': { name: 'Tom Wheeler', avatar: '/assets/a-10.jpg' },
    'marathon-mover': { name: 'Coach Alina Park', avatar: '/assets/gym-coach.jpg' },
    'career-quest': { name: 'Maya Ellis', avatar: '/assets/career.jpg' },
    'lean-launch': { name: 'Coach Tess', avatar: '/assets/tess.png' }
};

const BASE_URL = 'https://www.rocketgoals.com';

function extractTeamIdFromGoalId(goalId: string): string {
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

function getGoalReminderDedupeKey(goalId: string, goalData: FirebaseFirestore.DocumentData, goalTitle?: string): string {
    const answers = (goalData?.answers || {}) as Record<string, unknown>;
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

    const teamIdFromGoalId = extractTeamIdFromGoalId(goalId);
    if (teamIdFromGoalId) {
        return `team:${teamIdFromGoalId}`;
    }

    const normalizedTitle = normalizeGoalTitleForKey(
        goalTitle
        || goalData?.primaryGoal
        || answers['goal_title_label']
        || answers['custom_goal_title']
    );
    if (normalizedTitle.endsWith(' team mission')) {
        return `team-title:${normalizedTitle}`;
    }

    return `goal:${goalId}`;
}

function getReminderTargetKeyFromGoalId(goalId: string): string {
    const teamIdFromGoalId = extractTeamIdFromGoalId(goalId);
    if (teamIdFromGoalId) {
        return `team:${teamIdFromGoalId}`;
    }
    return `goal:${goalId}`;
}

function isTeamMemberGoal(goalData: FirebaseFirestore.DocumentData): boolean {
    const answers = (goalData?.answers || {}) as Record<string, unknown>;
    return answers['teamMemberGoal'] === true;
}

function shouldReplaceDedupedGoal(existing: GroupedGoalReminderItem, candidate: GroupedGoalReminderItem): boolean {
    const existingMember = existing.isTeamMemberGoal === true;
    const candidateMember = candidate.isTeamMemberGoal === true;
    if (existingMember !== candidateMember) {
        return !candidateMember;
    }

    const existingCreatedAt = existing.createdAtMs || 0;
    const candidateCreatedAt = candidate.createdAtMs || 0;
    if (existingCreatedAt !== candidateCreatedAt) {
        return candidateCreatedAt > existingCreatedAt;
    }

    return candidate.id < existing.id;
}

function dedupeGroupedReminderGoals(goals: GroupedGoalReminderItem[]): GroupedGoalReminderItem[] {
    if (goals.length <= 1) return goals;

    const keyOrder: string[] = [];
    const deduped = new Map<string, GroupedGoalReminderItem>();

    for (const goal of goals) {
        const key = goal.dedupeKey || `goal:${goal.id}`;
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
        .filter((goal): goal is GroupedGoalReminderItem => !!goal);
}

type SendgridSuppressionCategory = 'bounces' | 'blocks' | 'spam_reports' | 'invalid_emails' | 'unsubscribes';

async function getSendgridSuppressionReason(apiKey: string, email: string): Promise<string | null> {
    const encodedEmail = encodeURIComponent(email);
    const checks: Array<{ category: SendgridSuppressionCategory; label: string }> = [
        { category: 'bounces', label: 'bounce' },
        { category: 'blocks', label: 'block' },
        { category: 'spam_reports', label: 'spam report' },
        { category: 'invalid_emails', label: 'invalid email' },
        { category: 'unsubscribes', label: 'unsubscribe' }
    ];

    for (const check of checks) {
        const response = await fetch(`https://api.sendgrid.com/v3/suppression/${check.category}/${encodedEmail}`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${apiKey}`
            }
        });

        if (response.status === 404) {
            continue;
        }

        if (!response.ok) {
            const body = await response.text();
            throw new Error(`Failed suppression check (${check.category}): ${response.status} ${body}`);
        }

        const payload = await response.json().catch(() => ({}));
        const reason = (payload?.reason || payload?.status || '').toString().trim();
        return reason ? `${check.label} (${reason})` : check.label;
    }

    return null;
}

function getCoachInfoFromGoalData(goalData: FirebaseFirestore.DocumentData): { coachName: string; coachAvatarUrl: string } | null {
    const templateId = goalData.answers?.launchpad_template_id
        || goalData.answers?.prebuilt_template_id
        || goalData.answers?.source_template_id;
    if (templateId) {
        const coach = APP_SUITE_COACHES[templateId];
        if (coach) {
            return { coachName: coach.name, coachAvatarUrl: `${BASE_URL}${coach.avatar}` };
        }
    }
    if (goalData.copilot?.name && goalData.copilot?.avatar) {
        const avatar = goalData.copilot.avatar as string;
        const avatarUrl = avatar.startsWith('http') ? avatar : `${BASE_URL}${avatar}`;
        return { coachName: goalData.copilot.name, coachAvatarUrl: avatarUrl };
    }
    return null;
}

type GroupedGoalEmailOptions = {
    subject: string;
    headline: string;
    intro: string;
    ctaLabel: string;
    includeMilestones?: boolean;
    includeActiveMilestone?: boolean;
    includeOneThing?: boolean;
    includeMissionLogSummary?: boolean;
    footerText?: string;
    footerHtml?: string;
};

/**
 * Helper function to generate goal reminder email content
 */
function generateGoalReminderEmail(
    goalTitle: string,
    participantName: string,
    participantEmail: string,
    goalId: string,
    milestones: MilestoneEmailItem[] = []
) {
    const goalUrl = `https://www.rocketgoals.com/rocketgoal/${goalId}?tab=milestones`;
    const milestoneBlocks = buildMilestoneEmailBlocks(milestones);
    const subject = `🚀 Time to update your progress on: ${goalTitle}`;

    const text = `Hi ${participantName},

It's time to check in on your Rocket Goal!

Goal: ${goalTitle}

${milestoneBlocks.text}Go to Rocket Goals to mark what you've accomplished and keep your momentum going.

Visit: ${goalUrl}

Keep pushing forward! 🚀

- The Rocket Goals Team`;

    const html = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #dc2626 0%, #000000 100%); padding: 30px; border-radius: 16px 16px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 800;">🚀 Rocket Goals</h1>
            </div>
            <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 16px 16px;">
                <h2 style="color: #111827; margin: 0 0 20px 0; font-size: 22px;">Time to update your progress!</h2>
                <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                    Hi ${participantName},
                </p>
                <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                    It's time to check in on your Rocket Goal:
                </p>
                <div style="background: #f9fafb; border-left: 4px solid #dc2626; padding: 16px; margin: 20px 0; border-radius: 8px;">
                    <p style="color: #111827; font-size: 18px; font-weight: 600; margin: 0;">
                        ${goalTitle}
                    </p>
                </div>
                ${milestoneBlocks.html}
                <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                    Go to Rocket Goals to mark what you've accomplished and keep your momentum going.
                </p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${goalUrl}"
                       style="display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #000000 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                        Update your progress
                    </a>
                </div>
                <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 30px 0 0 0;">
                    Keep pushing forward! 🚀
                </p>
                <p style="color: #9ca3af; font-size: 14px; margin: 30px 0 0 0;">
                    - The Rocket Goals Team
                </p>
            </div>
        </div>
    `;

    return { subject, text, html };
}

function buildGroupedGoalBlocks(
    goals: GroupedGoalReminderItem[],
    options: GroupedGoalEmailOptions
): { text: string; html: string } {
    const textSections = goals.map((goal, index) => {
        const lines: string[] = [];
        const oneThingTag = goal.isMyOneThing ? ' [MY ONE THING]' : '';
        lines.push(`${index + 1}. ${goal.title}${oneThingTag}`);
        lines.push(`   Link: ${goal.url}`);
        if (goal.coachName) {
            lines.push(`   AI Coach: ${goal.coachName}`);
        }

        if (options.includeActiveMilestone && goal.activeMilestone) {
            lines.push(`   Active milestone: ${goal.activeMilestone}`);
        }
        if (options.includeOneThing && goal.oneThing) {
            lines.push(`   ONE Thing: ${goal.oneThing}`);
        }
        if (options.includeMissionLogSummary && goal.missionLogSummary) {
            lines.push(`   Last mission log: ${goal.missionLogSummary}`);
        }
        if (options.includeMilestones && goal.milestones && goal.milestones.length) {
            lines.push('   Upcoming milestones:');
            goal.milestones.forEach(milestone => {
                lines.push(`   - ${milestone.title} (${milestone.dateLabel})`);
            });
        }

        return lines.join('\n');
    });

    const text = textSections.join('\n\n');

    const htmlItems = goals.map(goal => {
        const detailLines: string[] = [];
        const highlightClass = goal.isMyOneThing ? 'border: 2px solid #111827; box-shadow: 0 18px 40px rgba(17,24,39,0.2);' : 'border: 1px solid #e5e7eb;';
        const ribbon = goal.isMyOneThing
            ? `<div style="position: absolute; top: 0; left: 0; right: 0; padding: 8px 12px; text-align: center; background: linear-gradient(90deg,#111827,#dc2626 55%,#f97316); color: #ffffff; font-size: 11px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase;">My One THING</div>`
            : '';
        let imageBlock = '';
        if (goal.coachAvatarUrl && goal.coachName) {
            imageBlock = `
                <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 14px 0 12px 0;">
                    <tr>
                        <td style="padding: 14px; background-color: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0;">
                            <table cellpadding="0" cellspacing="0" border="0" width="100%">
                                <tr>
                                    <td width="56" valign="middle" style="padding-right: 14px;">
                                        <img src="${goal.coachAvatarUrl}" alt="${goal.coachName}" width="52" height="52" style="width: 52px; height: 52px; border-radius: 50%; object-fit: cover; border: 2px solid #dc2626; display: block;" />
                                    </td>
                                    <td valign="middle">
                                        <p style="margin: 0 0 2px 0; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #9ca3af; font-weight: 700; line-height: 1.4;">Your AI Coach</p>
                                        <p style="margin: 0; font-size: 15px; font-weight: 700; color: #111827; line-height: 1.3;">${goal.coachName}</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                </table>`;
        } else if (goal.imageUrl) {
            imageBlock = `<div style="margin: 12px 0 10px 0; border-radius: 12px; overflow: hidden; border: 1px solid #f3f4f6;">
                    <img src="${goal.imageUrl}" alt="${goal.title}" style="width: 100%; height: 150px; object-fit: cover; display: block;" />
               </div>`;
        }
        if (options.includeActiveMilestone && goal.activeMilestone) {
            detailLines.push(`<p style="margin: 4px 0 0 0; color: #6b7280; font-size: 13px;"><strong>Active milestone:</strong> ${goal.activeMilestone}</p>`);
        }
        if (options.includeOneThing && goal.oneThing) {
            detailLines.push(`<p style="margin: 4px 0 0 0; color: #6b7280; font-size: 13px;"><strong>ONE Thing:</strong> ${goal.oneThing}</p>`);
        }
        if (options.includeMissionLogSummary && goal.missionLogSummary) {
            detailLines.push(`<p style="margin: 4px 0 0 0; color: #6b7280; font-size: 13px;"><strong>Last mission log:</strong> ${goal.missionLogSummary}</p>`);
        }

        let milestonesHtml = '';
        if (options.includeMilestones && goal.milestones && goal.milestones.length) {
            const milestoneItems = goal.milestones
                .map(milestone => `<li style="margin: 4px 0;">${milestone.title} <span style="color: #9ca3af;">(${milestone.dateLabel})</span></li>`)
                .join('');
            milestonesHtml = `
                <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #e5e7eb;">
                    <p style="margin: 0 0 6px 0; color: #111827; font-weight: 600; font-size: 13px;">Upcoming milestones</p>
                    <ul style="margin: 0; padding-left: 18px; color: #6b7280; font-size: 13px; line-height: 1.5;">
                        ${milestoneItems}
                    </ul>
                </div>
            `;
        }

        return `
            <div style="position: relative; ${highlightClass} border-radius: 14px; padding: 16px; margin-bottom: 16px; background: #ffffff;">
                ${ribbon}
                <div style="padding-top: ${goal.isMyOneThing ? '28px' : '0'};">
                <p style="margin: 0; color: #111827; font-weight: 700; font-size: 16px;">${goal.title}</p>
                ${imageBlock}
                ${detailLines.join('')}
                ${milestonesHtml}
                <div style="margin-top: 14px;">
                    <a href="${goal.url}"
                       style="display: inline-block; background: #111827; color: white; text-decoration: none; padding: 8px 14px; border-radius: 10px; font-weight: 600; font-size: 13px;">
                        ${options.ctaLabel}
                    </a>
                </div>
                </div>
            </div>
        `;
    });

    const html = htmlItems.join('');
    return { text, html };
}

function generateGroupedGoalReminderEmail(
    participantName: string,
    goals: GroupedGoalReminderItem[],
    options: GroupedGoalEmailOptions
) {
    const safeName = participantName.trim() || 'there';
    const blocks = buildGroupedGoalBlocks(goals, options);
    const footerText = options.footerText || 'Keep pushing forward! 🚀\n\n- The Rocket Goals Team';
    const footerHtml = options.footerHtml || `
        <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 24px 0 0 0;">Keep pushing forward! 🚀</p>
        <p style="color: #9ca3af; font-size: 14px; margin: 12px 0 0 0;">- The Rocket Goals Team</p>
    `;

    const text = `Hi ${safeName},

${options.headline}

${options.intro}

${blocks.text}

${footerText}`;

    const html = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 640px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #dc2626 0%, #000000 100%); padding: 30px; border-radius: 16px 16px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 800;">🚀 Rocket Goals</h1>
            </div>
            <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 16px 16px;">
                <h2 style="color: #111827; margin: 0 0 16px 0; font-size: 22px;">${options.headline}</h2>
                <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">Hi ${safeName},</p>
                <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">${options.intro}</p>
                ${blocks.html}
                ${footerHtml}
            </div>
        </div>
    `;

    return { subject: options.subject, text, html };
}

function buildMilestoneEmailBlocks(milestones: MilestoneEmailItem[]): { text: string; html: string } {
    if (!milestones.length) {
        return { text: '', html: '' };
    }

    const textLines = milestones.map(milestone =>
        `- ${milestone.title} (${milestone.dateLabel})\n  Update: ${milestone.updateUrl}`
    );
    const text = `Upcoming milestones:\n${textLines.join('\n')}\n\n`;

    const htmlItems = milestones.map(milestone => `
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 0; border-bottom: 1px solid #e5e7eb;">
            <div>
                <p style="margin: 0; color: #111827; font-weight: 600; font-size: 16px;">${milestone.title}</p>
                <p style="margin: 4px 0 0 0; color: #6b7280; font-size: 14px;">${milestone.dateLabel}</p>
            </div>
            <a href="${milestone.updateUrl}"
               style="display: inline-block; background: #111827; color: white; text-decoration: none; padding: 8px 14px; border-radius: 10px; font-weight: 600; font-size: 14px;">
                Update
            </a>
        </div>
    `);

    const html = `
        <div style="margin: 20px 0; padding: 16px; background: #f9fafb; border-radius: 12px; border: 1px solid #e5e7eb;">
            <p style="margin: 0 0 12px 0; color: #111827; font-weight: 700; font-size: 16px;">Upcoming milestones</p>
            ${htmlItems.join('')}
        </div>
    `;

    return { text, html };
}

function getTimestampMs(value: unknown): number | null {
    if (!value) return null;
    if (value instanceof admin.firestore.Timestamp) {
        return value.toDate().getTime();
    }
    if (value instanceof Date) {
        return value.getTime();
    }
    if (typeof value === 'number') {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? null : parsed;
    }
    return null;
}

function getCurrentMissionDay(startTimeMs: number | null): number {
    if (!startTimeMs) return 1;
    const elapsed = Date.now() - startTimeMs;
    const daysPassed = Math.floor(elapsed / (24 * 60 * 60 * 1000)) + 1;
    return Math.max(1, daysPassed);
}

function formatMilestoneDateLabel(startTimeMs: number | null, dayNumber: number): string {
    if (!startTimeMs) {
        return `Day ${dayNumber}`;
    }
    const date = new Date(startTimeMs + (dayNumber - 1) * 24 * 60 * 60 * 1000);
    const dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `${dateLabel} · Day ${dayNumber}`;
}

async function getUpcomingMilestones(goalId: string, goalData: FirebaseFirestore.DocumentData): Promise<MilestoneEmailItem[]> {
    const startTimeMs = getTimestampMs(goalData.startTime) ?? getTimestampMs(goalData.createdAt);
    const currentDay = getCurrentMissionDay(startTimeMs);
    const updateUrl = `https://www.rocketgoals.com/rocketgoal/${goalId}?tab=milestones`;

    const snapshot = await admin.firestore()
        .collection('rocketGoals')
        .doc(goalId)
        .collection('actionItems')
        .get();

    if (snapshot.empty) return [];

    const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as { title?: string; dayNumber?: number; completed?: boolean; order?: number })
    }));

    return items
        .filter(item => !item.completed && typeof item.dayNumber === 'number' && item.dayNumber > currentDay)
        .sort((a, b) => {
            const dayDiff = (a.dayNumber || 0) - (b.dayNumber || 0);
            if (dayDiff !== 0) return dayDiff;
            return (a.order || 0) - (b.order || 0);
        })
        .map(item => ({
            id: item.id,
            title: item.title || 'Untitled milestone',
            dayNumber: item.dayNumber || currentDay,
            dateLabel: formatMilestoneDateLabel(startTimeMs, item.dayNumber || currentDay),
            updateUrl
        }));
}

async function getActiveMilestoneLabel(goalId: string, goalData: FirebaseFirestore.DocumentData): Promise<string> {
    const startTimeMs = getTimestampMs(goalData.startTime) ?? getTimestampMs(goalData.createdAt);
    const currentDay = getCurrentMissionDay(startTimeMs);
    const snapshot = await admin.firestore()
        .collection('rocketGoals')
        .doc(goalId)
        .collection('actionItems')
        .get();

    if (snapshot.empty) return 'No active milestones yet';

    const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...(doc.data() as { title?: string; dayNumber?: number; completed?: boolean; order?: number })
    }));

    const incomplete = items.filter(item => !item.completed);
    if (!incomplete.length) return 'All milestones completed';

    const upcoming = incomplete.filter(item => typeof item.dayNumber === 'number' && item.dayNumber >= currentDay);
    const sorted = (upcoming.length ? upcoming : incomplete).sort((a, b) => {
        const dayDiff = (a.dayNumber || 0) - (b.dayNumber || 0);
        if (dayDiff !== 0) return dayDiff;
        return (a.order || 0) - (b.order || 0);
    });

    return sorted[0]?.title || 'Untitled milestone';
}

type DailyIgnitionRecord = {
    oneThingText?: string;
    createdAt?: admin.firestore.Timestamp;
};

type MissionLogRecord = {
    actionTaken?: string;
    focusLevel?: string;
    challengeLevel?: string;
    feeling?: string;
    teamConnection?: string;
    createdAt?: admin.firestore.Timestamp;
};

async function getLatestDailyIgnition(goalId: string): Promise<DailyIgnitionRecord | null> {
    const snapshot = await admin.firestore()
        .collection('rocketGoals')
        .doc(goalId)
        .collection('dailyIgnitions')
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();
    if (snapshot.empty) return null;
    return snapshot.docs[0].data() as DailyIgnitionRecord;
}

async function getLatestMissionLog(goalId: string): Promise<MissionLogRecord | null> {
    const snapshot = await admin.firestore()
        .collection('rocketGoals')
        .doc(goalId)
        .collection('missionLogs')
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();
    if (snapshot.empty) return null;
    return snapshot.docs[0].data() as MissionLogRecord;
}

function summarizeMissionLog(log: MissionLogRecord | null): string {
    if (!log) return '';
    const parts: string[] = [];
    if (log.actionTaken) parts.push(`Action: ${log.actionTaken}`);
    if (log.focusLevel) parts.push(`Focus: ${log.focusLevel}`);
    if (log.feeling) parts.push(`Feeling: ${log.feeling}`);
    if (log.challengeLevel) parts.push(`Challenge: ${log.challengeLevel}`);
    if (log.teamConnection) parts.push(`Team: ${log.teamConnection}`);
    return parts.join(' • ');
}

/**
 * Cloud Function to preview goal reminder email
 * Only accessible by admin users
 */
export const previewGoalReminder = functions.runWith({
    secrets: [sendgridApiKey]
}).https.onCall(async (data: { goalTitle: string; participantName: string; participantEmail: string }, context: functions.https.CallableContext) => {
    // Verify the user is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'You must be logged in to preview reminder emails.'
        );
    }

    // Check if user is admin
    const userDoc = await admin.firestore()
        .collection('userProfiles')
        .doc(context.auth.uid)
        .get();

    const userData = userDoc.data();
    if (!userData || (userData.role !== 'admin' && !userData.admin)) {
        throw new functions.https.HttpsError(
            'permission-denied',
            'Only administrators can preview reminder emails.'
        );
    }

    // Validate input
    const { goalTitle, participantName, participantEmail } = data;
    if (!goalTitle || !participantName || !participantEmail) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Missing required fields: goalTitle, participantName, participantEmail'
        );
    }

    try {
        const emailContent = generateGoalReminderEmail(goalTitle, participantName, participantEmail, 'preview');

        return {
            success: true,
            subject: emailContent.subject,
            text: emailContent.text,
            html: emailContent.html
        };
    } catch (error: any) {
        console.error('❌ Error generating preview:', error);
        throw new functions.https.HttpsError(
            'internal',
            `Failed to generate preview: ${error.message}`
        );
    }
});

/**
 * Cloud Function to send test goal reminder email
 * Only accessible by admin users
 */
export const sendTestGoalReminder = functions.runWith({
    secrets: [sendgridApiKey]
}).https.onCall(async (data: { goalTitle: string; participantName: string; participantEmail: string; testEmail: string }, context: functions.https.CallableContext) => {
    // Verify the user is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'You must be logged in to send test reminder emails.'
        );
    }

    // Check if user is admin
    const userDoc = await admin.firestore()
        .collection('userProfiles')
        .doc(context.auth.uid)
        .get();

    const userData = userDoc.data();
    if (!userData || (userData.role !== 'admin' && !userData.admin)) {
        throw new functions.https.HttpsError(
            'permission-denied',
            'Only administrators can send test reminder emails.'
        );
    }

    // Validate input
    const { goalTitle, participantName, participantEmail, testEmail } = data;
    if (!goalTitle || !participantName || !participantEmail || !testEmail) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Missing required fields: goalTitle, participantName, participantEmail, testEmail'
        );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(testEmail)) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Invalid test email address format'
        );
    }

    try {
        // Initialize SendGrid with API key
        const apiKey = sendgridApiKey.value();
        if (!apiKey) {
            throw new Error('SendGrid API key is not set. Please set it using: firebase functions:secrets:set SENDGRID_API_KEY');
        }
        sgMail.setApiKey(apiKey);

        // Generate email content
        const emailContent = generateGoalReminderEmail(goalTitle, participantName, participantEmail, 'test');

        // Create email message
        const msg = {
            to: testEmail,
            from: 'missioncontrol@rocketgoals.com',
            subject: emailContent.subject,
            text: emailContent.text,
            html: emailContent.html,
        };

        // Send the email
        await sgMail.send(msg);

        console.log(`✅ Test goal reminder sent successfully to ${testEmail}`);

        return {
            success: true,
            message: `Test reminder email sent successfully to ${testEmail}`
        };
    } catch (error: any) {
        console.error('❌ Error sending test reminder email:', error);

        // Handle SendGrid specific errors
        if (error.response) {
            const { body } = error.response;
            throw new functions.https.HttpsError(
                'internal',
                `SendGrid error: ${JSON.stringify(body)}`
            );
        }

        throw new functions.https.HttpsError(
            'internal',
            `Failed to send test reminder email: ${error.message}`
        );
    }
});

/**
 * Cloud Function to send a test daily reminder (grouped by user) for ignition or mission log
 * Only accessible by admin users
 */
export const sendTestDailyReminder = functions.runWith({
    secrets: [sendgridApiKey]
}).https.onCall(async (data: { email: string; reminderType: ReminderType }, context: functions.https.CallableContext) => {
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'You must be logged in to send test reminder emails.'
        );
    }

    const userDoc = await admin.firestore()
        .collection('userProfiles')
        .doc(context.auth.uid)
        .get();

    const userData = userDoc.data();
    if (!userData || (userData.role !== 'admin' && !userData.admin)) {
        throw new functions.https.HttpsError(
            'permission-denied',
            'Only administrators can send test reminder emails.'
        );
    }

    const email = data?.email?.trim().toLowerCase();
    const reminderType = data?.reminderType || 'mission_log';

    if (!email) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required field: email');
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid email address format');
    }

    if (reminderType !== 'ignition' && reminderType !== 'mission_log') {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid reminder type');
    }

    try {
        const apiKey = sendgridApiKey.value();
        if (!apiKey) {
            throw new Error('SendGrid API key is not set. Please set it using: firebase functions:secrets:set SENDGRID_API_KEY');
        }
        sgMail.setApiKey(apiKey);

        const goalsSnapshot = await admin.firestore()
            .collection('rocketGoals')
            .where('participant.email', '==', email)
            .get();

        if (goalsSnapshot.empty) {
            throw new functions.https.HttpsError('not-found', 'No goals found for this email.');
        }

        const activeGoals = goalsSnapshot.docs.filter(doc => (doc.data().status || 'active') === 'active');
        if (!activeGoals.length) {
            throw new functions.https.HttpsError('not-found', 'No active goals found for this email.');
        }

        const firstParticipant = activeGoals[0].data().participant || {};
        const participantName = firstParticipant.firstName
            ? `${firstParticipant.firstName} ${firstParticipant.lastName || ''}`.trim()
            : email.split('@')[0];

        let oneThingGoalId: string | undefined;
        const userId = activeGoals[0].data().userId;
        if (userId) {
            try {
                const profileDoc = await admin.firestore().collection('userProfiles').doc(userId).get();
                oneThingGoalId = profileDoc.exists ? (profileDoc.data() as any).myOneThingGoalId : undefined;
            } catch (error) {
                console.warn('Unable to load My One THING for test reminder:', error);
            }
        }

        const goals: GroupedGoalReminderItem[] = [];

        for (const goalDoc of activeGoals) {
            const goalData = goalDoc.data();
            const goalTitle = goalData.primaryGoal || goalData.answers?.goal_title_label || 'Your Rocket Goal';
            const goalUrl = `https://www.rocketgoals.com/rocketgoal/${goalDoc.id}?tab=checkins&checkin=${reminderType}`;

            const [milestones, activeMilestone, latestIgnition, latestMissionLog] = await Promise.all([
                getUpcomingMilestones(goalDoc.id, goalData),
                getActiveMilestoneLabel(goalDoc.id, goalData),
                getLatestDailyIgnition(goalDoc.id),
                getLatestMissionLog(goalDoc.id)
            ]);

            const oneThing = (latestIgnition?.oneThingText || activeMilestone || '').trim();
            const missionLogSummary = summarizeMissionLog(latestMissionLog);
            const coachInfo = getCoachInfoFromGoalData(goalData);

            goals.push({
                id: goalDoc.id,
                title: goalTitle,
                url: goalUrl,
                dedupeKey: getGoalReminderDedupeKey(goalDoc.id, goalData, goalTitle),
                isTeamMemberGoal: isTeamMemberGoal(goalData),
                milestones: milestones.slice(0, 3),
                activeMilestone,
                oneThing,
                missionLogSummary,
                imageUrl: coachInfo ? undefined : (goalData.visualizationImageUrl || goalData.visualizationImage || goalData.answers?.visualizationImageUrl),
                coachName: coachInfo?.coachName,
                coachAvatarUrl: coachInfo?.coachAvatarUrl,
                createdAtMs: getTimestampMs(goalData.createdAt) || getTimestampMs(goalData.startTime) || undefined
            });
        }

        let templates: { subject?: string; text?: string; html?: string } | undefined;
        const reminderSnapshot = await admin.firestore()
            .collection('scheduledReminders')
            .where('enabled', '==', true)
            .where('reminderType', '==', reminderType)
            .orderBy('time', 'asc')
            .limit(1)
            .get();

        if (!reminderSnapshot.empty) {
            const reminderData = reminderSnapshot.docs[0].data() as ScheduledReminder;
            templates = {
                subject: reminderData.emailSubject,
                text: reminderData.emailBodyText,
                html: reminderData.emailBodyHtml
            };
        } else {
            const fallback = getDefaultReminderEmailTemplate(reminderType);
            templates = {
                subject: fallback.subject,
                text: fallback.text,
                html: fallback.html
            };
        }

        const dedupedGoals = dedupeGroupedReminderGoals(goals);
        const orderedGoals = sortGoalsByOneThing(dedupedGoals, oneThingGoalId);
        const { subject, text, html } = buildGroupedReminderEmailContent(
            reminderType,
            participantName,
            orderedGoals,
            templates
        );

        const msg = {
            to: email,
            from: 'missioncontrol@rocketgoals.com',
            subject,
            text,
            html
        };

        const [sendgridResponse] = await sgMail.send(msg);
        const providerStatus = Number(sendgridResponse?.statusCode || 0);
        const messageIdHeader = sendgridResponse?.headers?.['x-message-id'];
        const messageId = Array.isArray(messageIdHeader) ? messageIdHeader[0] : messageIdHeader;
        console.log('✅ sendTestDailyReminder queued', {
            email,
            reminderType,
            goals: orderedGoals.length,
            providerStatus,
            messageId: messageId || null
        });

        return {
            success: true,
            message: `Test ${reminderType === 'ignition' ? 'Daily Ignition' : 'Mission Log'} reminder sent to ${email}.`,
            goals: orderedGoals.length,
            providerStatus,
            messageId: messageId || null
        };
    } catch (error: any) {
        console.error('❌ Error sending test daily reminder email:', error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        if (error.response) {
            const { body } = error.response;
            throw new functions.https.HttpsError(
                'internal',
                `SendGrid error: ${JSON.stringify(body)}`
            );
        }
        throw new functions.https.HttpsError(
            'internal',
            `Failed to send test reminder email: ${error.message}`
        );
    }
});

/**
 * Cloud Function to send bulk goal reminders to all active goals
 * Only accessible by admin users
 */
export const sendBulkGoalReminders = functions.runWith({
    secrets: [sendgridApiKey],
    timeoutSeconds: 540,
    memory: '512MB'
}).https.onCall(async (_data: Record<string, never>, context: functions.https.CallableContext) => {
    // Verify the user is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'You must be logged in to send bulk reminders.'
        );
    }

    // Check if user is admin
    const userDoc = await admin.firestore()
        .collection('userProfiles')
        .doc(context.auth.uid)
        .get();

    const userData = userDoc.data();
    if (!userData || (userData.role !== 'admin' && !userData.admin)) {
        throw new functions.https.HttpsError(
            'permission-denied',
            'Only administrators can send bulk reminders.'
        );
    }

    try {
        // Initialize SendGrid with API key
        const apiKey = sendgridApiKey.value();
        if (!apiKey) {
            throw new Error('SendGrid API key is not set. Please set it using: firebase functions:secrets:set SENDGRID_API_KEY');
        }
        sgMail.setApiKey(apiKey);

        // Fetch all active goals
        const goalsSnapshot = await admin.firestore()
            .collection('rocketGoals')
            .where('status', '==', 'active')
            .get();

        if (goalsSnapshot.empty) {
            return {
                success: true,
                message: 'No active goals found to send reminders to.',
                sent: 0,
                failed: 0,
                total: 0
            };
        }

        const results = {
            sent: 0,
            failed: 0,
            errors: [] as Array<{ goalId: string; email: string; error: string }>
        };

        const groupedByEmail = new Map<string, { email: string; name: string; userId?: string; goals: GroupedGoalReminderItem[] }>();

        // Process goals in batches to avoid overwhelming SendGrid
        const batchSize = 10;
        const goals = goalsSnapshot.docs;

        for (let i = 0; i < goals.length; i += batchSize) {
            const batch = goals.slice(i, i + batchSize);

            await Promise.allSettled(
                batch.map(async (goalDoc) => {
                    try {
                        const goalData = goalDoc.data();
                        const goalId = goalDoc.id;

                        // Extract goal information
                        const goalTitle = goalData.primaryGoal || goalData.answers?.goal_title_label || 'Your Rocket Goal';
                        const participant = goalData.participant;

                        if (!participant || !participant.email) {
                            results.failed++;
                            results.errors.push({
                                goalId,
                                email: participant?.email || 'unknown',
                                error: 'Missing participant email'
                            });
                            return;
                        }

                        const participantName = participant.firstName
                            ? `${participant.firstName} ${participant.lastName || ''}`.trim()
                            : participant.email.split('@')[0];

                        const milestones = (await getUpcomingMilestones(goalId, goalData)).slice(0, 3);
                        const goalUrl = `https://www.rocketgoals.com/rocketgoal/${goalId}?tab=milestones`;
                        const bulkCoachInfo = getCoachInfoFromGoalData(goalData);
                        const goalItem: GroupedGoalReminderItem = {
                            id: goalId,
                            title: goalTitle,
                            url: goalUrl,
                            dedupeKey: getGoalReminderDedupeKey(goalId, goalData, goalTitle),
                            isTeamMemberGoal: isTeamMemberGoal(goalData),
                            milestones,
                            imageUrl: bulkCoachInfo ? undefined : (goalData.visualizationImageUrl || goalData.visualizationImage || goalData.answers?.visualizationImageUrl),
                            coachName: bulkCoachInfo?.coachName,
                            coachAvatarUrl: bulkCoachInfo?.coachAvatarUrl,
                            createdAtMs: getTimestampMs(goalData.createdAt) || getTimestampMs(goalData.startTime) || undefined
                        };

                        const emailKey = participant.email.toLowerCase();
                        const existing = groupedByEmail.get(emailKey);
                        if (existing) {
                            existing.goals.push(goalItem);
                            if (!existing.name) {
                                existing.name = participantName;
                            }
                        } else {
                            groupedByEmail.set(emailKey, {
                                email: participant.email,
                                name: participantName,
                                userId: goalData.userId,
                                goals: [goalItem]
                            });
                        }
                    } catch (error: any) {
                        results.failed++;
                        const goalData = goalDoc.data();
                        const participant = goalData.participant;
                        results.errors.push({
                            goalId: goalDoc.id,
                            email: participant?.email || 'unknown',
                            error: error.message || 'Unknown error'
                        });
                        console.error(`❌ Failed to send reminder for goal ${goalDoc.id}:`, error);
                    }
                })
            );

            // Small delay between batches to respect rate limits
            if (i + batchSize < goals.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        const recipients = Array.from(groupedByEmail.values());
        if (!recipients.length) {
            return {
                success: true,
                message: 'No valid participants found to send reminders to.',
                sent: results.sent,
                failed: results.failed,
                total: 0,
                errors: results.errors.slice(0, 10)
            };
        }

        const emailOptions: GroupedGoalEmailOptions = {
            subject: '🚀 Your Rocket Goals progress reminders',
            headline: 'Time to update your progress!',
            intro: 'Here are your active goals. Pick one to update and keep your momentum going.',
            ctaLabel: 'Update goal',
            includeMilestones: true
        };

        for (let i = 0; i < recipients.length; i += batchSize) {
            const batch = recipients.slice(i, i + batchSize);

            await Promise.allSettled(
                batch.map(async (recipient) => {
                    try {
                        let oneThingGoalId: string | undefined;
                        if (recipient.userId) {
                            try {
                                const profileDoc = await admin.firestore().collection('userProfiles').doc(recipient.userId).get();
                                oneThingGoalId = profileDoc.exists ? (profileDoc.data() as any).myOneThingGoalId : undefined;
                            } catch (error) {
                                console.warn('Unable to load My One THING for bulk reminder:', error);
                            }
                        }
                        const dedupedGoals = dedupeGroupedReminderGoals(recipient.goals);
                        const orderedGoals = sortGoalsByOneThing(dedupedGoals, oneThingGoalId);
                        const emailContent = generateGroupedGoalReminderEmail(
                            recipient.name,
                            orderedGoals,
                            emailOptions
                        );

                        const msg = {
                            to: recipient.email,
                            from: 'missioncontrol@rocketgoals.com',
                            subject: emailContent.subject,
                            text: emailContent.text,
                            html: emailContent.html,
                        };

                        await sgMail.send(msg);
                        results.sent++;
                        console.log(`✅ Grouped reminder sent to ${recipient.email} (${orderedGoals.length} goals)`);
                    } catch (error: any) {
                        results.failed++;
                        results.errors.push({
                            goalId: recipient.goals[0]?.id || 'unknown',
                            email: recipient.email,
                            error: error.message || 'Unknown error'
                        });
                        console.error(`❌ Failed to send grouped reminder to ${recipient.email}:`, error);
                    }
                })
            );

            if (i + batchSize < recipients.length) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        console.log(`✅ Bulk reminder sending completed. Sent: ${results.sent}, Failed: ${results.failed}`);

        return {
            success: true,
            message: `Bulk reminders sent. ${results.sent} successful, ${results.failed} failed.`,
            sent: results.sent,
            failed: results.failed,
            total: recipients.length,
            errors: results.errors.slice(0, 10) // Return first 10 errors to avoid response size issues
        };
    } catch (error: any) {
        console.error('❌ Error sending bulk reminders:', error);
        throw new functions.https.HttpsError(
            'internal',
            `Failed to send bulk reminders: ${error.message}`
        );
    }
});

/**
 * Cloud Function to send custom verification emails via SendGrid
 * Accessible by authenticated users only
 */
export const sendVerificationEmail = functions.runWith({
    secrets: [sendgridApiKey]
}).https.onCall(async (data: { continueUrl?: string }, context: functions.https.CallableContext) => {
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'You must be logged in to request a verification email.'
        );
    }

    try {
        const user = await admin.auth().getUser(context.auth.uid);
        const email = user.email;
        if (!email) {
            throw new functions.https.HttpsError(
                'failed-precondition',
                'No email found for this account.'
            );
        }

        if (user.emailVerified) {
            return { success: true, alreadyVerified: true };
        }

        const apiKey = sendgridApiKey.value();
        if (!apiKey) {
            throw new Error('SendGrid API key is not set.');
        }
        sgMail.setApiKey(apiKey);

        const continueUrl = resolveVerificationContinueUrl(data?.continueUrl);
        const actionCodeSettings = {
            url: continueUrl,
            handleCodeInApp: false
        };

        const verificationLink = await admin.auth().generateEmailVerificationLink(email, actionCodeSettings);
        const displayName = user.displayName?.trim() || 'Rocketeer';

        const msg = {
            to: email,
            from: 'missioncontrol@rocketgoals.com',
            subject: 'Verify your Rocket Goals account',
            text: `Hi ${displayName},\n\nWelcome to Rocket Goals! Please verify your email address to activate your mission control dashboard.\n\nVerify your email: ${verificationLink}\n\nIf you did not create this account, you can safely ignore this email.\n\nTo your success,\nThe Rocket Goals Team`,
            html: `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 640px; margin: 0 auto; padding: 0;">
                    <div style="background: linear-gradient(135deg, #dc2626 0%, #000000 100%); padding: 36px 30px; border-radius: 18px 18px 0 0; text-align: center;">
                        <div style="font-size: 40px; margin-bottom: 8px;">🚀</div>
                        <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 800;">Verify Your Mission Control Email</h1>
                        <p style="color: rgba(255,255,255,0.75); margin: 10px 0 0; font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase;">
                            Rocket Goals
                        </p>
                    </div>

                    <div style="background: #ffffff; padding: 32px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 18px 18px;">
                        <p style="color: #111827; font-size: 16px; line-height: 1.6; margin: 0 0 18px;">
                            Hi <strong>${displayName}</strong>,
                        </p>
                        <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
                            Welcome aboard. Confirm your email address to activate your Rocket Goals account and unlock your mission dashboard.
                        </p>

                        <div style="text-align: center; margin: 24px 0;">
                            <a href="${verificationLink}"
                               style="background: #111827; color: #ffffff; text-decoration: none; padding: 14px 26px; border-radius: 12px; font-weight: 700; display: inline-block;">
                                Verify My Email
                            </a>
                        </div>

                        <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0 0 18px;">
                            If the button does not work, copy and paste this link into your browser:
                        </p>
                        <p style="color: #111827; font-size: 13px; word-break: break-all; margin: 0 0 24px;">
                            ${verificationLink}
                        </p>

                        <p style="color: #9ca3af; font-size: 13px; margin: 0;">
                            If you did not create this account, you can safely ignore this email.
                        </p>
                    </div>
                </div>
            `,
        };

        await sgMail.send(msg);

        console.log(`✅ Verification email sent successfully to ${email}`);
        return { success: true };
    } catch (error: any) {
        console.error('❌ Error sending verification email:', error);

        if (error.response) {
            const { body } = error.response;
            throw new functions.https.HttpsError(
                'internal',
                `SendGrid error: ${JSON.stringify(body)}`
            );
        }

        if (error instanceof functions.https.HttpsError) {
            throw error;
        }

        throw new functions.https.HttpsError(
            'internal',
            `Failed to send verification email: ${error.message}`
        );
    }
});

/**
 * Cloud Function to send welcome email to new users with Surge book
 * Called after user signs up successfully
 */
export const sendWelcomeEmail = functions.runWith({
    secrets: [sendgridApiKey]
}).https.onCall(async (_data: Record<string, never>, context: functions.https.CallableContext) => {
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'You must be logged in to receive a welcome email.'
        );
    }

    try {
        const user = await admin.auth().getUser(context.auth.uid);
        const email = user.email;
        if (!email) {
            throw new functions.https.HttpsError(
                'failed-precondition',
                'No email found for this account.'
            );
        }

        const apiKey = sendgridApiKey.value();
        if (!apiKey) {
            throw new Error('SendGrid API key is not set.');
        }
        sgMail.setApiKey(apiKey);

        const displayName = user.displayName?.trim() || 'Rocketeer';
        // Use the surge book page URL instead of direct Firebase Storage link to avoid SendGrid URL tracking issues
        const bookPageUrl = 'https://www.rocketgoals.com/surge-book';
        const bookImageUrl = 'https://firebasestorage.googleapis.com/v0/b/rocket-prompt.firebasestorage.app/o/site%2Fsurge-book.png?alt=media&token=1fa8febd-bf3e-4bce-aa9f-13ed5cb03462';

        const msg = {
            to: email,
            from: 'missioncontrol@rocketgoals.com',
            subject: 'Welcome to Rocket Goals — Your Complimentary Book Awaits',
            text: `Hi ${displayName},\n\nThank you for joining Rocket Goals.\n\nYou now have access to an AI-powered platform designed to help you set, track, and achieve meaningful goals with precision and clarity.\n\nWith Rocket Goals, you can:\n\n• Define goals with AI-guided clarity\n• Build strategic action plans tailored to your objectives\n• Track progress through intuitive dashboards\n• Stay accountable with intelligent reminders\n\nAs a welcome gift, we've prepared a complimentary copy of "Surge: 42 High-Velocity Prompts" — a curated collection of prompts designed to accelerate your progress and eliminate common barriers.\n\nAccess your book: ${bookPageUrl}\n\nWe look forward to supporting your journey.\n\nWarm regards,\nThe Rocket Goals Team`,
            html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 0; background: #ffffff;">
                    <!-- Header -->
                    <div style="background: #000000; padding: 48px 40px; text-align: center;">
                        <img src="https://www.rocketgoals.com/assets/rocket-goals.png" alt="Rocket Goals" style="width: 64px; height: 64px; margin-bottom: 16px;" />
                        <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600; letter-spacing: -0.5px;">Welcome to Rocket Goals</h1>
                        <p style="color: rgba(255,255,255,0.6); margin: 12px 0 0; font-size: 14px; font-weight: 400;">
                            Your journey to achievement starts here
                        </p>
                    </div>

                    <!-- Main Content -->
                    <div style="padding: 40px; border-left: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb;">
                        <p style="color: #111827; font-size: 16px; line-height: 1.7; margin: 0 0 20px;">
                            Dear ${displayName},
                        </p>
                        <p style="color: #374151; font-size: 16px; line-height: 1.7; margin: 0 0 28px;">
                            Thank you for joining Rocket Goals. You now have access to an AI-powered platform designed to help you set, track, and achieve meaningful goals with precision and clarity.
                        </p>

                        <!-- Features -->
                        <div style="background: #fafafa; border-radius: 8px; padding: 24px; margin: 0 0 32px; border: 1px solid #f0f0f0;">
                            <p style="color: #111827; font-size: 14px; font-weight: 600; margin: 0 0 16px; text-transform: uppercase; letter-spacing: 0.5px;">What You Can Do</p>
                            <table style="width: 100%; border-collapse: collapse;">
                                <tr>
                                    <td style="padding: 8px 0; color: #374151; font-size: 15px; line-height: 1.5;">
                                        <span style="color: #dc2626; margin-right: 10px;">&#10003;</span> Define goals with AI-guided clarity
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0; color: #374151; font-size: 15px; line-height: 1.5;">
                                        <span style="color: #dc2626; margin-right: 10px;">&#10003;</span> Build strategic action plans tailored to your objectives
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0; color: #374151; font-size: 15px; line-height: 1.5;">
                                        <span style="color: #dc2626; margin-right: 10px;">&#10003;</span> Track progress through intuitive dashboards
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding: 8px 0; color: #374151; font-size: 15px; line-height: 1.5;">
                                        <span style="color: #dc2626; margin-right: 10px;">&#10003;</span> Stay accountable with intelligent reminders
                                    </td>
                                </tr>
                            </table>
                        </div>

                        <!-- Book Section -->
                        <div style="border: 2px solid #111827; border-radius: 12px; overflow: hidden; margin: 0 0 32px;">
                            <div style="background: #111827; padding: 16px 24px;">
                                <p style="color: #ffffff; font-size: 12px; font-weight: 600; margin: 0; text-transform: uppercase; letter-spacing: 1px;">
                                    Complimentary Welcome Gift
                                </p>
                            </div>
                            <div style="background: #ffffff; padding: 32px; text-align: center;">
                                <img src="${bookImageUrl}" alt="Surge: 42 High-Velocity Prompts" style="width: 140px; height: auto; border-radius: 4px; box-shadow: 0 8px 24px rgba(0,0,0,0.12); margin-bottom: 24px;" />
                                <h3 style="color: #111827; font-size: 20px; font-weight: 700; margin: 0 0 8px;">Surge: 42 High-Velocity Prompts</h3>
                                <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0 0 24px; max-width: 380px; margin-left: auto; margin-right: auto;">
                                    A curated collection of prompts designed to accelerate your progress and eliminate common barriers to achievement.
                                </p>
                                <a href="${bookPageUrl}"
                                   style="background: #dc2626; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block; letter-spacing: 0.3px;">
                                    Download Your Free Copy
                                </a>
                            </div>
                        </div>

                        <!-- CTA -->
                        <div style="text-align: center; padding: 24px 0; border-top: 1px solid #e5e7eb;">
                            <p style="color: #6b7280; font-size: 14px; margin: 0 0 16px;">Ready to begin?</p>
                            <a href="https://www.rocketgoals.com/goals"
                               style="background: #111827; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">
                                Go to Your Dashboard
                            </a>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div style="background: #fafafa; padding: 24px 40px; border: 1px solid #e5e7eb; border-top: none; text-align: center;">
                        <p style="color: #9ca3af; font-size: 13px; line-height: 1.6; margin: 0;">
                            Warm regards,<br />
                            <span style="color: #6b7280; font-weight: 500;">The Rocket Goals Team</span>
                        </p>
                    </div>
                </div>
            `,
        };

        await sgMail.send(msg);

        console.log(`✅ Welcome email sent successfully to ${email}`);
        return { success: true };
    } catch (error: any) {
        console.error('❌ Error sending welcome email:', error);

        if (error.response) {
            const { body } = error.response;
            throw new functions.https.HttpsError(
                'internal',
                `SendGrid error: ${JSON.stringify(body)}`
            );
        }

        if (error instanceof functions.https.HttpsError) {
            throw error;
        }

        throw new functions.https.HttpsError(
            'internal',
            `Failed to send welcome email: ${error.message}`
        );
    }
});

/**
 * Cloud Function to send team invitation emails
 * Accessible by team admins, team leads, coaches, and captains
 */
export const sendTeamInviteEmail = functions.runWith({
    secrets: [sendgridApiKey]
}).https.onCall(async (data: {
    teamId: string;
    inviteeEmail: string;
    inviteeName?: string;
    teamName?: string;
    teamUrl?: string;
}, context: functions.https.CallableContext) => {
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'You must be logged in to send team invitations.'
        );
    }

    const teamId = String(data?.teamId || '').trim();
    const inviteeEmail = String(data?.inviteeEmail || '').trim().toLowerCase();

    if (!teamId || !inviteeEmail) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Missing required fields: teamId, inviteeEmail'
        );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteeEmail)) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Invalid invite email address format'
        );
    }

    try {
        const teamDoc = await admin.firestore().collection('teams').doc(teamId).get();
        if (!teamDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Team not found.');
        }

        const teamData = teamDoc.data() || {};
        const members = Array.isArray(teamData.members) ? teamData.members : [];
        const inviterFromTeam = members.find((member: any) => member?.userId === context.auth.uid);
        const inviterRole = String(inviterFromTeam?.role || '').trim().toLowerCase();
        const canInviteMembers = teamData.adminId === context.auth.uid
            || inviterRole === 'team-lead'
            || inviterRole === 'coach'
            || inviterRole === 'captain';
        if (!canInviteMembers) {
            throw new functions.https.HttpsError(
                'permission-denied',
                'Only team admin, team lead, coach, or captain can invite members.'
            );
        }

        const isAlreadyMember = members.some((member: any) =>
            (member?.email || '').toString().trim().toLowerCase() === inviteeEmail
        );

        if (isAlreadyMember) {
            throw new functions.https.HttpsError('already-exists', 'This person is already a member of this team.');
        }

        const apiKey = sendgridApiKey.value();
        if (!apiKey) {
            throw new Error('SendGrid API key is not set.');
        }
        sgMail.setApiKey(apiKey);

        const inviterRecord = await admin.auth().getUser(context.auth.uid).catch(() => null);
        const inviterDisplayName = (
            inviterRecord?.displayName?.trim() ||
            `${inviterFromTeam?.firstName || ''} ${inviterFromTeam?.lastName || ''}`.trim() ||
            'A Rocket Goals leader'
        );

        const teamName = (String(data?.teamName || teamData.name || '').trim() || 'your team');
        const inviteeDisplayName = (String(data?.inviteeName || '').trim() || 'there');
        const teamUrl = resolveTeamInviteUrl(data?.teamUrl, teamId);

        const msg = {
            to: inviteeEmail,
            from: 'missioncontrol@rocketgoals.com',
            subject: `🚀 ${inviterDisplayName} invited you to join ${teamName}`,
            text:
`Hi ${inviteeDisplayName},

${inviterDisplayName} invited you to join "${teamName}" on Rocket Goals.

Join the team here: ${teamUrl}

If you already have an account, log in and join.
If you are new, create your account, verify your email, and you will be able to join the team.

To your success,
The Rocket Goals Team`,
            html: `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 680px; margin: 0 auto; padding: 0;">
                    <div style="background: linear-gradient(135deg, #dc2626 0%, #111827 100%); border-radius: 18px 18px 0 0; padding: 40px 30px; text-align: center;">
                        <div style="font-size: 42px; margin-bottom: 8px;">🚀</div>
                        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 800;">You're Invited To Join A Team</h1>
                        <p style="margin: 10px 0 0; color: rgba(255,255,255,0.82); font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase;">
                            Rocket Goals Team Invitation
                        </p>
                    </div>

                    <div style="background: #ffffff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 18px 18px; padding: 34px 30px;">
                        <p style="margin: 0 0 16px; color: #111827; font-size: 16px; line-height: 1.6;">
                            Hi <strong>${inviteeDisplayName}</strong>,
                        </p>
                        <p style="margin: 0 0 22px; color: #374151; font-size: 16px; line-height: 1.7;">
                            <strong>${inviterDisplayName}</strong> invited you to join <strong>${teamName}</strong> on Rocket Goals.
                        </p>

                        <div style="background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border: 1px solid #fecaca; border-radius: 14px; padding: 18px 16px; margin-bottom: 24px;">
                            <p style="margin: 0; color: #991b1b; font-size: 14px; line-height: 1.6;">
                                Join the team to collaborate, stay accountable, and track progress together.
                            </p>
                        </div>

                        <div style="text-align: center; margin: 28px 0 24px;">
                            <a href="${teamUrl}"
                               style="display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: #ffffff; text-decoration: none; padding: 15px 30px; border-radius: 12px; font-size: 16px; font-weight: 700; box-shadow: 0 10px 24px rgba(220, 38, 38, 0.28);">
                                Join ${teamName}
                            </a>
                        </div>

                        <p style="margin: 0 0 10px; color: #4b5563; font-size: 14px; line-height: 1.6;">
                            If the button doesn't work, copy and paste this link into your browser:
                        </p>
                        <p style="margin: 0; color: #111827; font-size: 13px; word-break: break-all;">
                            ${teamUrl}
                        </p>
                    </div>
                </div>
            `,
        };

        await sgMail.send(msg);

        console.log(`✅ Team invitation email sent to ${inviteeEmail} for team ${teamId}`);
        return {
            success: true,
            message: `Team invitation email sent to ${inviteeEmail}`
        };
    } catch (error: any) {
        console.error('❌ Error sending team invitation email:', error);

        if (error.response) {
            const { body } = error.response;
            throw new functions.https.HttpsError(
                'internal',
                `SendGrid error: ${JSON.stringify(body)}`
            );
        }

        if (error instanceof functions.https.HttpsError) {
            throw error;
        }

        throw new functions.https.HttpsError(
            'internal',
            `Failed to send team invitation email: ${error.message}`
        );
    }
});

/**
 * Cloud Function to send email notification when a goal is created from AI chat
 * Accessible by authenticated users only
 */
export const sendGoalCreatedEmail = functions.runWith({
    secrets: [sendgridApiKey]
}).https.onCall(async (data: {
    goalId: string;
    goalTitle: string;
    timeframe: string;
    userEmail: string;
    userName: string;
    imageUrl?: string;
}, context: functions.https.CallableContext) => {
    // Verify the user is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'You must be logged in to send goal notifications.'
        );
    }

    // Validate input
    const { goalId, goalTitle, timeframe, userEmail, userName, imageUrl } = data;
    if (!goalId || !goalTitle || !timeframe || !userEmail) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Missing required fields: goalId, goalTitle, timeframe, userEmail'
        );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userEmail)) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Invalid email address format'
        );
    }

    // Map timeframe to readable text
    const timeframeText = timeframe === 'week' ? '7 days' :
        timeframe === 'month' ? '30 days' :
            timeframe === '3months' ? '90 days' : '6 months'; // Legacy fallback for old '6months' option

    try {
        // Initialize SendGrid with API key
        const apiKey = sendgridApiKey.value();
        if (!apiKey) {
            throw new Error('SendGrid API key is not set.');
        }
        sgMail.setApiKey(apiKey);

        // Create email message
        const msg = {
            to: userEmail,
            from: 'missioncontrol@rocketgoals.com',
            subject: `🚀 Your RocketGoal "${goalTitle}" has launched!`,
            text: `Hi ${userName},\n\nCongratulations! You've just created a new RocketGoal: "${goalTitle}"\n\nYour mission timeframe: ${timeframeText}\n\nYour AI-powered daily plan is ready and waiting for you. Visit your RocketGoal page to see your personalized action steps and start making progress today!\n\nView your goal: https://www.rocketgoals.com/rocketgoal/${goalId}\n\nRemember: Every great achievement starts with a single step. You've already taken that step by committing to your goal. Now let's make it happen!\n\nTo your success,\nThe Rocket Goals Team`,
            html: `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 0;">
                    <!-- Header -->
                    <div style="background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); padding: 40px 30px; border-radius: 16px 16px 0 0; text-align: center;">
                        <div style="font-size: 48px; margin-bottom: 10px;">🚀</div>
                        <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 800;">Your Mission Has Launched!</h1>
                    </div>

                    <!-- Body -->
                    <div style="background: #ffffff; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none;">
                        <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                            Hi <strong>${userName}</strong>,
                        </p>
                        <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 25px;">
                            Congratulations! You've just created a new RocketGoal:
                        </p>

                        <!-- Goal Card -->
                        <div style="background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border: 2px solid #fecaca; border-radius: 12px; padding: 24px; margin-bottom: 25px;">
                            <h2 style="color: #dc2626; margin: 0 0 10px; font-size: 22px; font-weight: 700;">"${goalTitle}"</h2>
                            <p style="color: #991b1b; margin: 0; font-size: 14px; font-weight: 600;">
                                ⏱️ Mission Timeframe: <strong>${timeframeText}</strong>
                            </p>
                        </div>

                        ${imageUrl ? `
                        <!-- Visualization Image -->
                        <div style="text-align: center; margin: 25px 0;">
                            <img src="${imageUrl}" alt="Your Future Self Visualization" style="max-width: 100%; height: auto; border-radius: 12px; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1); border: 2px solid #fecaca;" />
                            <p style="color: #6b7280; font-size: 12px; margin: 10px 0 0; font-style: italic;">
                                Your personalized Future Self visualization
                            </p>
                        </div>
                        ` : ''}

                        <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 25px;">
                            Your AI-powered daily plan is ready and waiting for you. Visit your RocketGoal page to see your personalized action steps and start making progress today!
                        </p>

                        <!-- CTA Button -->
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="https://www.rocketgoals.com/rocketgoal/${goalId}"
                               style="display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; text-decoration: none; padding: 16px 32px; border-radius: 12px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 14px rgba(220, 38, 38, 0.3);">
                                View Your RocketGoal →
                            </a>
                        </div>

                        <!-- Motivation -->
                        <div style="background: #fef2f2; border-radius: 8px; padding: 20px; margin-top: 25px; border-left: 4px solid #dc2626;">
                            <p style="color: #4b5563; font-size: 14px; line-height: 1.6; margin: 0; font-style: italic;">
                                💡 <strong>Remember:</strong> Every great achievement starts with a single step. You've already taken that step by committing to your goal. Now let's make it happen!
                            </p>
                        </div>
                    </div>

                    <!-- Footer -->
                    <div style="background: #1f2937; padding: 25px 30px; border-radius: 0 0 16px 16px; text-align: center;">
                        <p style="color: #9ca3af; font-size: 14px; margin: 0 0 10px;">
                            To your success,<br>
                            <strong style="color: #f3f4f6;">The Rocket Goals Team</strong>
                        </p>
                        <p style="color: #6b7280; font-size: 12px; margin: 0;">
                            © ${new Date().getFullYear()} Rocket Goals. All rights reserved.
                        </p>
                    </div>
                </div>
            `,
        };

        // Send the email
        await sgMail.send(msg);

        console.log(`✅ Goal created email sent successfully to ${userEmail} for goal ${goalId}`);

        return {
            success: true,
            message: `Goal notification email sent to ${userEmail}`
        };
    } catch (error: any) {
        console.error('❌ Error sending goal created email:', error);

        // Handle SendGrid specific errors
        if (error.response) {
            const { body } = error.response;
            throw new functions.https.HttpsError(
                'internal',
                `SendGrid error: ${JSON.stringify(body)}`
            );
        }

        throw new functions.https.HttpsError(
            'internal',
            `Failed to send email: ${error.message}`
        );
    }
});

/**
 * Cloud Function to send email notification when a fan is invited to a goal
 * Accessible by authenticated users only
 */
export const sendFanInviteEmail = functions.runWith({
    secrets: [sendgridApiKey]
}).https.onCall(async (data: {
    goalId: string;
    fanEmail: string;
    fanName?: string;
    ownerEmail: string;
    ownerName: string;
}, context: functions.https.CallableContext) => {
    // Verify the user is authenticated
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'You must be logged in to send fan invitations.'
        );
    }

    // Validate input
    const { goalId, fanEmail, fanName, ownerEmail, ownerName } = data;
    if (!goalId || !fanEmail || !ownerEmail) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Missing required fields: goalId, fanEmail, ownerEmail'
        );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(fanEmail)) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Invalid fan email address format'
        );
    }

    try {
        // Get goal details from Firestore
        const goalDoc = await admin.firestore().collection('rocketGoals').doc(goalId).get();
        if (!goalDoc.exists) {
            throw new functions.https.HttpsError(
                'not-found',
                'Goal not found'
            );
        }

        const goalData = goalDoc.data();
        const goalTitle = goalData?.answers?.['goal_title_label'] ||
            goalData?.answers?.['custom_goal_title'] ||
            goalData?.primaryGoal ||
            'Untitled Goal';

        // Initialize SendGrid with API key
        const apiKey = sendgridApiKey.value();
        if (!apiKey) {
            throw new Error('SendGrid API key is not set.');
        }
        sgMail.setApiKey(apiKey);

        const displayName = fanName?.trim() || 'there';
        const goalUrl = `https://www.rocketgoals.com/rocketgoal/${goalId}`;

        // Create email message
        const msg = {
            to: fanEmail,
            from: 'missioncontrol@rocketgoals.com',
            subject: `🚀 ${ownerName} invited you to support their RocketGoal!`,
            text: `Hi ${displayName},\n\n${ownerName} has invited you to be a fan and supporter of their RocketGoal: "${goalTitle}"\n\nAs a fan, you can:\n- React with emojis to show your support\n- Leave encouraging comments\n- Cheer them on their journey\n\nView the goal and join the support team: ${goalUrl}\n\nIf you don't have an account yet, you can sign up at https://www.rocketgoals.com to join and start supporting!\n\nTo your success,\nThe Rocket Goals Team`,
            html: `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 640px; margin: 0 auto; padding: 0;">
                    <!-- Header -->
                    <div style="background: linear-gradient(135deg, #dc2626 0%, #000000 100%); padding: 36px 30px; border-radius: 18px 18px 0 0; text-align: center;">
                        <div style="font-size: 40px; margin-bottom: 8px;">🚀</div>
                        <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 800;">You've Been Invited!</h1>
                        <p style="color: rgba(255,255,255,0.75); margin: 10px 0 0; font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase;">
                            Rocket Goals Fan Invitation
                        </p>
                    </div>

                    <!-- Body -->
                    <div style="background: #ffffff; padding: 32px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 18px 18px;">
                        <p style="color: #111827; font-size: 16px; line-height: 1.6; margin: 0 0 18px;">
                            Hi <strong>${displayName}</strong>,
                        </p>
                        <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
                            <strong>${ownerName}</strong> has invited you to be a fan and supporter of their RocketGoal!
                        </p>

                        <!-- Goal Card -->
                        <div style="background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%); border: 2px solid #fecaca; border-radius: 12px; padding: 24px; margin-bottom: 25px;">
                            <h2 style="color: #dc2626; margin: 0 0 10px; font-size: 22px; font-weight: 700;">"${goalTitle}"</h2>
                            <p style="color: #991b1b; margin: 0; font-size: 14px; font-weight: 600;">
                                🎯 Mission in Progress
                            </p>
                        </div>

                        <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                            As a fan, you can:
                        </p>
                        <ul style="color: #374151; font-size: 16px; line-height: 1.8; margin: 0 0 25px; padding-left: 24px;">
                            <li>React with emojis to show your support 🚀🔥👏</li>
                            <li>Leave encouraging comments to cheer them on</li>
                            <li>Follow their progress and celebrate milestones</li>
                        </ul>

                        <!-- CTA Button -->
                        <div style="text-align: center; margin: 30px 0;">
                            <a href="${goalUrl}"
                               style="display: inline-block; background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); color: white; text-decoration: none; padding: 16px 32px; border-radius: 12px; font-weight: 700; font-size: 16px; box-shadow: 0 4px 14px rgba(220, 38, 38, 0.3);">
                                View & Support This Goal →
                            </a>
                        </div>

                        <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 20px 0 0;">
                            <strong>New to Rocket Goals?</strong> No problem! You can sign up at
                            <a href="https://www.rocketgoals.com" style="color: #dc2626; text-decoration: none;">www.rocketgoals.com</a>
                            to join and start supporting.
                        </p>
                    </div>

                    <!-- Footer -->
                    <div style="background: #1f2937; padding: 25px 30px; border-radius: 0 0 18px 18px; text-align: center;">
                        <p style="color: #9ca3af; font-size: 14px; margin: 0 0 10px;">
                            To your success,<br>
                            <strong style="color: #f3f4f6;">The Rocket Goals Team</strong>
                        </p>
                        <p style="color: #6b7280; font-size: 12px; margin: 0;">
                            © ${new Date().getFullYear()} Rocket Goals. All rights reserved.
                        </p>
                    </div>
                </div>
            `,
        };

        // Send the email
        await sgMail.send(msg);

        console.log(`✅ Fan invitation email sent successfully to ${fanEmail} for goal ${goalId}`);

        return {
            success: true,
            message: `Fan invitation email sent to ${fanEmail}`
        };
    } catch (error: any) {
        console.error('❌ Error sending fan invitation email:', error);

        // Handle SendGrid specific errors
        if (error.response) {
            const { body } = error.response;
            throw new functions.https.HttpsError(
                'internal',
                `SendGrid error: ${JSON.stringify(body)}`
            );
        }

        if (error instanceof functions.https.HttpsError) {
            throw error;
        }

        throw new functions.https.HttpsError(
            'internal',
            `Failed to send fan invitation email: ${error.message}`
        );
    }
});

/**
 * Cloud Function to generate a visualization image for a goal using Gemini
 * Uses the provided prompt template to create an inspirational image of the user's future self
 */
export const generateGoalVisualization = onCall({
    region: "us-central1",
    secrets: [geminiApiKey],
    timeoutSeconds: 120, // Image generation can take longer
    cors: [
        "https://rocket-goals.web.app",
        "https://rocket-goals.firebaseapp.com",
        "https://www.rocketgoals.com",
        "https://rocketgoals.com",
        "http://localhost:4200",
        "http://127.0.0.1:4200"
    ]
}, async (request: any) => {
    const startTime = Date.now();

    try {
        // Verify the user is authenticated
        if (!request.auth) {
            throw new HttpsError(
                "unauthenticated",
                "You must be logged in to generate visualizations."
            );
        }

        const apiKey = geminiApiKey.value();
        if (!apiKey) {
            throw new HttpsError(
                "failed-precondition",
                "Google AI API key is not configured"
            );
        }

        const data = request?.data || {};
        const goalDescription = (data?.goalDescription || "").toString().trim();
        const timeframe = (data?.timeframe || "month").toString().trim();
        const goalId = (data?.goalId || "").toString().trim();
        const hasAccountabilitySupport = data?.hasAccountabilitySupport === "yes";
        const userPhotoBase64 = data?.userPhotoBase64 ? data.userPhotoBase64.toString() : null;

        if (!goalDescription) {
            throw new HttpsError(
                "invalid-argument",
                "Goal description is required"
            );
        }

        if (!goalId) {
            throw new HttpsError(
                "invalid-argument",
                "Goal ID is required"
            );
        }

        const hasUserPhoto = userPhotoBase64 && userPhotoBase64.startsWith('data:image');
        console.log(`🎨 Generating visualization for goal: "${goalDescription.substring(0, 50)}..." (with user photo: ${hasUserPhoto})`);

        // Map timeframe to readable text
        const timeframeText = timeframe === 'week' ? 'a 7-day' :
            timeframe === 'month' ? 'a 30-day' :
                timeframe === '3months' ? 'a 90-day' : 'a 6-month';

        // Build the image generation prompt using the user's template
        // When user photo is provided, instruct the model to use their face
        const personDescription = hasUserPhoto
            ? `IMPORTANT: Use the exact face from the provided reference photo. The person in the generated image MUST have the same facial features, skin tone, and appearance as shown in the reference photo. This is their Future Self visualization - it should look like THEM achieving this goal.`
            : `The person feels authentic, human, and relatable`;

        const imagePrompt = `Create a highly inspiring, emotionally grounded, realistic visualization of a person who has achieved the following goal:

"${goalDescription}" — rewritten as already achieved.

The scene represents the person's Future Self living this goal fully and confidently.

Time context:
- The achievement reflects steady progress over ${timeframeText} timeframe.

The person:
- Appears focused, calm, and confident
- Body language reflects discipline, consistency, and inner strength
- Facial expression shows quiet satisfaction, not arrogance
${personDescription}

Environment:
- The setting naturally supports the goal (workplace, studio, outdoors, community, home, etc.)
- The environment is organized, intentional, and free of distraction
- Visual elements subtly reflect daily commitment and routine

Emotional tone:
- Hopeful, grounded, resilient
- Challenges are implied as conquered, not erased
- A sense of growth rather than perfection

Lighting & style:
- Warm, natural lighting
- Photorealistic or cinematic realism
- No fantasy, no exaggeration
- Inspirational but believable

Support & growth:
${hasAccountabilitySupport ? '- Subtly include symbols of mentorship, collaboration, or accountability' : '- Emphasize self-reliance and inner resolve'}

Composition:
- Medium-wide shot
- Strong sense of forward movement or presence
- The image should feel like a moment captured from the person's real future life

Avoid:
- Abstract symbols
- Text overlays
- Unrealistic success clichés
- Overly polished "stock photo" look

The final image should make the viewer think:
"This is achievable. This is me — soon."`;

        // Initialize Gemini with image generation capabilities
        const genAI = new GoogleGenerativeAI(apiKey);

        // Use Gemini 2.5 Flash Image for native image generation
        // This model supports native image output with responseModalities
        const model = genAI.getGenerativeModel({
            model: "gemini-2.5-flash-image",
        });

        console.log(`🎨 Sending image generation request to Gemini 2.5 Flash Image...`);

        // Build the content parts for the request
        const contentParts: any[] = [];

        // If user photo is provided, include it as a reference image
        if (hasUserPhoto && userPhotoBase64) {
            // Extract the base64 data and mime type from the data URL
            const matches = userPhotoBase64.match(/^data:([^;]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                const mimeType = matches[1];
                const base64Data = matches[2];
                contentParts.push({
                    inlineData: {
                        mimeType: mimeType,
                        data: base64Data
                    }
                });
                contentParts.push({
                    text: `Reference photo above: This is the user's face. Generate an image of THIS EXACT PERSON (same face, features, skin tone) achieving their goal as described below.\n\n${imagePrompt}`
                });
            } else {
                // Fallback if data URL format is unexpected
                contentParts.push({
                    text: `Generate an image based on this description:\n\n${imagePrompt}`
                });
            }
        } else {
            contentParts.push({
                text: `Generate an image based on this description:\n\n${imagePrompt}`
            });
        }

        // Generate the image using Gemini's image generation
        const result = await model.generateContent({
            contents: [{
                role: "user",
                parts: contentParts
            }],
            generationConfig: {
                responseModalities: ["Image", "Text"] as any,
            } as any,
        });

        const response = result.response;
        let imageBase64: string | null = null;
        let imageMimeType: string | null = null;

        // Extract the image from the response
        const parts = response.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
            if ((part as any).inlineData) {
                imageBase64 = (part as any).inlineData.data;
                imageMimeType = (part as any).inlineData.mimeType || 'image/png';
                break;
            }
        }

        if (!imageBase64) {
            console.log(`⚠️ No image generated, Gemini response:`, JSON.stringify(response, null, 2));
            throw new HttpsError(
                "internal",
                "Failed to generate image - no image data in response"
            );
        }

        console.log(`✅ Image generated successfully (${imageMimeType})`);

        // Upload to Firebase Storage
        const bucket = admin.storage().bucket();
        const fileName = `goal-visualizations/${goalId}/visualization_${Date.now()}.png`;
        const file = bucket.file(fileName);

        // Convert base64 to buffer and upload
        const imageBuffer = Buffer.from(imageBase64, 'base64');

        await file.save(imageBuffer, {
            metadata: {
                contentType: imageMimeType || 'image/png',
                metadata: {
                    goalId: goalId,
                    userId: request.auth.uid,
                    generatedAt: new Date().toISOString()
                }
            }
        });

        // Make the file publicly accessible
        await file.makePublic();

        // Get the public URL
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

        console.log(`📤 Image uploaded to: ${publicUrl}`);

        // Update the goal document with the visualization URL
        await admin.firestore()
            .collection('rocketGoals')
            .doc(goalId)
            .update({
                visualizationImageUrl: publicUrl,
                visualizationGeneratedAt: admin.firestore.FieldValue.serverTimestamp()
            });

        console.log(`✅ Goal document updated with visualization URL`);

        const totalTime = Date.now() - startTime;
        console.log(`✅ generateGoalVisualization completed in ${totalTime}ms`);

        return {
            success: true,
            imageUrl: publicUrl,
            message: "Visualization generated successfully"
        };
    } catch (error: any) {
        console.error("❌ generateGoalVisualization error:", error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError(
            "internal",
            error?.message || "Failed to generate visualization"
        );
    }
});

/**
 * Generate an AI coach avatar portrait using Gemini.
 * Creates a professional, stylized portrait based on the coach name and personality description.
 */
export const generateCoachAvatar = onCall({
    region: "us-central1",
    secrets: [geminiApiKey],
    timeoutSeconds: 60,
    cors: [
        "https://rocket-goals.web.app",
        "https://rocket-goals.firebaseapp.com",
        "https://www.rocketgoals.com",
        "https://rocketgoals.com",
        "http://localhost:4200",
        "http://127.0.0.1:4200"
    ]
}, async (request: any) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be logged in.");
    }

    const apiKey = geminiApiKey.value();
    if (!apiKey) {
        throw new HttpsError("failed-precondition", "Google AI API key is not configured");
    }

    const data = request?.data || {};
    const coachName = (data?.coachName || "").toString().trim();
    const coachDescription = (data?.coachDescription || "").toString().trim();
    const category = (data?.category || "").toString().trim();

    if (!coachName) {
        throw new HttpsError("invalid-argument", "Coach name is required.");
    }

    const prompt = `Create a professional, high-quality headshot portrait of an AI coaching character named "${coachName}".

Character profile:
- Name: ${coachName}
- Specialty: ${category || 'Life coaching'}
- Personality: ${coachDescription || 'Warm, knowledgeable, and motivating'}

Portrait requirements:
- Professional studio-quality headshot, shoulders up
- The character should look approachable, confident, and trustworthy
- Age range: 28-45, any ethnicity — pick one that feels natural for the name and description
- Warm, soft studio lighting with a subtle gradient background
- Sharp focus on the face, gentle bokeh on the background
- The expression should convey warmth, intelligence, and quiet confidence
- Clean, modern styling — professional but not overly corporate
- Photorealistic quality, cinematic color grading

Style reference:
- Think high-end executive coach or TED speaker headshot
- Natural skin texture, no heavy retouching
- Background: subtle dark-to-warm gradient, not distracting

Avoid:
- Cartoon or illustrated styles
- Text, logos, or watermarks
- Full body shots
- Exaggerated expressions
- Stock photo clichés`;

    try {
        const { GoogleGenerativeAI } = await import("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-image" });

        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: `Generate an image based on this description:\n\n${prompt}` }] }],
            generationConfig: {
                responseModalities: ["Image", "Text"],
            } as any,
        });

        const parts = result.response.candidates?.[0]?.content?.parts || [];
        let imageBase64: string | null = null;
        let imageMimeType: string | null = null;

        for (const part of parts) {
            if ((part as any).inlineData) {
                imageBase64 = (part as any).inlineData.data;
                imageMimeType = (part as any).inlineData.mimeType || 'image/png';
                break;
            }
        }

        if (!imageBase64) {
            throw new HttpsError("internal", "Failed to generate avatar — no image in response");
        }

        const bucket = admin.storage().bucket();
        const fileName = `coach-avatars/${request.auth.uid}/avatar_${Date.now()}.png`;
        const file = bucket.file(fileName);
        const imageBuffer = Buffer.from(imageBase64, 'base64');

        await file.save(imageBuffer, {
            metadata: {
                contentType: imageMimeType || 'image/png',
                metadata: { userId: request.auth.uid, generatedAt: new Date().toISOString() }
            }
        });

        await file.makePublic();
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

        return { success: true, imageUrl: publicUrl };
    } catch (error: any) {
        console.error("generateCoachAvatar error:", error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError("internal", error?.message || "Failed to generate avatar");
    }
});

/**
 * Extract text or describe images from uploaded chat attachments.
 * Supports PDF, DOCX, and common image formats.
 */
export const extractAttachmentContent = onCall({
    region: "us-central1",
    secrets: [geminiApiKey],
    timeoutSeconds: 60,
    cors: [
        "https://rocket-goals.web.app",
        "https://rocket-goals.firebaseapp.com",
        "https://www.rocketgoals.com",
        "https://rocketgoals.com",
        "http://localhost:4200",
        "http://127.0.0.1:4200"
    ]
}, async (request: any) => {
    try {
        if (!request.auth) {
            throw new HttpsError("unauthenticated", "You must be logged in to read attachments.");
        }

        const apiKey = geminiApiKey.value();
        if (!apiKey) {
            throw new HttpsError("failed-precondition", "Google AI API key is not configured");
        }

        const data = request?.data || {};
        const storagePath = (data?.storagePath || "").toString().trim();
        const fileName = (data?.fileName || "").toString().trim();
        const mimeType = (data?.mimeType || "").toString().trim();

        if (!storagePath || !fileName) {
            throw new HttpsError("invalid-argument", "storagePath and fileName are required");
        }

        // Ensure the user can only read their own attachments
        if (!storagePath.includes(`/${request.auth.uid}/`)) {
            throw new HttpsError("permission-denied", "You don't have access to this file.");
        }

        const bucket = admin.storage().bucket();
        const file = bucket.file(storagePath);
        const [buffer] = await file.download();

        const extension = fileName.split('.').pop()?.toLowerCase() || '';
        const maxChars = 12000;
        let text = '';
        let kind: 'text' | 'image' | 'unsupported' = 'text';

        if (extension === 'pdf' || mimeType === 'application/pdf') {
            const pdfParse = (await import('pdf-parse')).default;
            const result = await pdfParse(buffer);
            text = result?.text || '';
        } else if (extension === 'docx' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
            const mammoth = await import('mammoth');
            const result = await mammoth.extractRawText({ buffer });
            text = result?.value || '';
        } else if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(extension) || mimeType.startsWith('image/')) {
            kind = 'image';
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
            const base64Data = buffer.toString('base64');
            const response = await model.generateContent({
                contents: [{
                    role: "user",
                    parts: [
                        { text: "Describe this image for context. Include any visible text. Be concise." },
                        { inlineData: { mimeType: mimeType || 'image/png', data: base64Data } }
                    ]
                }]
            });
            text = response.response?.text?.() || '';
        } else {
            kind = 'unsupported';
            text = '';
        }

        if (!text) {
            return { text: '', truncated: false, kind };
        }

        let truncated = false;
        if (text.length > maxChars) {
            text = `${text.slice(0, maxChars)}\n...[truncated]`;
            truncated = true;
        }

        return { text, truncated, kind };
    } catch (error: any) {
        console.error("❌ extractAttachmentContent error:", error);
        if (error instanceof HttpsError) {
            throw error;
        }
        throw new HttpsError("internal", error?.message || "Failed to read attachment");
    }
});

type PromoCodeInfo = {
    tier: string;
    durationMonths: number;
    lifetimeAccess: boolean;
};

/**
 * Helper function to load promo codes from Firestore
 * Supports both legacy single code format and new array format
 * Returns a map of code -> { tier, durationMonths }
 */
async function getPromoCodeInfoMap(): Promise<Record<string, PromoCodeInfo>> {
    try {
        const promoDoc = await admin.firestore()
            .collection('adminSettings')
            .doc('promoCodes')
            .get();

        if (promoDoc.exists) {
            const data = promoDoc.data();
            const result: Record<string, PromoCodeInfo> = {};

            // Helper to extract codes from either array or legacy string format
            const extractCodes = (tierData: unknown, tierName: string) => {
                if (Array.isArray(tierData)) {
                    // New array format: [{code: 'CODE1', usageCount: 0, durationMonths: 1, archived: false}, ...]
                    tierData.forEach((item: { code?: string; durationMonths?: number; archived?: boolean; lifetimeAccess?: boolean }) => {
                        // Skip archived codes
                        if (item.code && !item.archived) {
                            const lifetimeAccess = Boolean(item.lifetimeAccess);
                            result[item.code.toUpperCase()] = {
                                tier: tierName,
                                durationMonths: typeof item.durationMonths === 'number' ? item.durationMonths : 1,
                                lifetimeAccess
                            };
                        }
                    });
                } else if (typeof tierData === 'string' && tierData) {
                    // Legacy single code format - default to 1 month
                    result[tierData.toUpperCase()] = {
                        tier: tierName,
                        durationMonths: 1,
                        lifetimeAccess: false
                    };
                }
            };

            extractCodes(data?.moonshot, 'moonshot');
            extractCodes(data?.interplanetary, 'interplanetary');
            extractCodes(data?.galactic, 'galactic');

            // If no codes found, return defaults
            if (Object.keys(result).length === 0) {
                return {
                    'NY2026MOONSHOT': { tier: 'moonshot', durationMonths: 1, lifetimeAccess: false },
                    'NY2026INTERPLANETARY': { tier: 'interplanetary', durationMonths: 1, lifetimeAccess: false },
                    'NY2026GALACTIC': { tier: 'galactic', durationMonths: 1, lifetimeAccess: false }
                };
            }

            return result;
        }
    } catch (err) {
        console.error('Failed to load promo codes from Firestore, using defaults:', err);
    }

    // Return defaults if Firestore read fails
    return {
        'NY2026MOONSHOT': { tier: 'moonshot', durationMonths: 1, lifetimeAccess: false },
        'NY2026INTERPLANETARY': { tier: 'interplanetary', durationMonths: 1, lifetimeAccess: false },
        'NY2026GALACTIC': { tier: 'galactic', durationMonths: 1, lifetimeAccess: false }
    };
}

/**
 * Helper function to get just the plan map (for backward compatibility)
 */
async function getPromoCodePlanMap(): Promise<Record<string, string>> {
    const infoMap = await getPromoCodeInfoMap();
    const result: Record<string, string> = {};
    for (const [code, info] of Object.entries(infoMap)) {
        result[code] = info.tier;
    }
    return result;
}

/**
 * Helper function to increment usage count for a promo code
 */
type PromoCodeUser = {
    userId: string;
    name: string;
    email: string;
    redeemedAt: admin.firestore.Timestamp;
};

async function incrementPromoCodeUsage(promoCode: string, tier: string, userId: string, userName: string, userEmail: string): Promise<void> {
    try {
        const promoDocRef = admin.firestore()
            .collection('adminSettings')
            .doc('promoCodes');

        const promoDoc = await promoDocRef.get();
        if (!promoDoc.exists) return;

        const data = promoDoc.data();
        const tierCodes = data?.[tier];

        if (Array.isArray(tierCodes)) {
            // Find and update the code's usage count and add user to usedBy list
            const updatedCodes = tierCodes.map((item: { code?: string; usageCount?: number; createdAt?: unknown; usedBy?: PromoCodeUser[] }) => {
                if (item.code?.toUpperCase() === promoCode.toUpperCase()) {
                    const usedBy = item.usedBy || [];
                    usedBy.push({
                        userId,
                        name: userName,
                        email: userEmail,
                        redeemedAt: admin.firestore.Timestamp.now()
                    });
                    return {
                        ...item,
                        usageCount: (item.usageCount || 0) + 1,
                        usedBy
                    };
                }
                return item;
            });

            await promoDocRef.update({
                [tier]: updatedCodes,
                updatedAt: admin.firestore.Timestamp.now()
            });

            console.log(`📊 Incremented usage count for promo code ${promoCode} in tier ${tier} by user ${userName} (${userEmail})`);
        }
    } catch (err) {
        console.error('Failed to increment promo code usage:', err);
        // Don't throw - this is non-critical
    }
}

const stripePriceByPlan: Record<string, string> = {
    moonshot: 'price_1ShFV1G26VVCdyeuhiUrkRfy',
    interplanetary: 'price_1ShFVtG26VVCdyeu1stsZFw5',
    galactic: 'price_1ShFWGG26VVCdyeuANsvCWFA'
};

export const createCheckoutSession = functions.runWith({
    secrets: [stripeSecretKey]
}).https.onCall(async (data: { priceId: string; successUrl?: string; cancelUrl?: string; promoCode?: string }, context: functions.https.CallableContext) => {
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'You must be logged in to create a checkout session.'
        );
    }

    const priceId = data.priceId;
    const successUrl = data.successUrl || 'https://www.rocketgoals.com/goals?payment=success';
    const cancelUrl = data.cancelUrl || 'https://www.rocketgoals.com/pricing?payment=cancelled';
    const promoCode = data.promoCode?.trim().toUpperCase();

    if (!priceId) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'priceId is required'
        );
    }

    try {
        const stripeKey = stripeSecretKey.value();
        if (!stripeKey) {
            throw new functions.https.HttpsError(
                'failed-precondition',
                'Stripe API key is not configured'
            );
        }

        // Initialize Stripe
        const stripe = require('stripe')(stripeKey);

        // Get user profile to link to customer
        const userId = context.auth.uid;
        const userDoc = await admin.firestore()
            .collection('userProfiles')
            .doc(userId)
            .get();

        if (!userDoc.exists) {
            throw new functions.https.HttpsError(
                'not-found',
                'User profile not found'
            );
        }

        const userData = userDoc.data();
        const userEmail = userData?.email || context.auth.token.email;

        // Check if user already has a Stripe customer ID
        let customerId = userData?.stripeCustomerId;

        // If no customer ID, create a new Stripe customer
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: userEmail,
                metadata: {
                    firebaseUserId: userId
                }
            });
            customerId = customer.id;

            // Update user profile with customer ID
            await admin.firestore()
                .collection('userProfiles')
                .doc(userId)
                .update({
                    stripeCustomerId: customerId
                });
        }

        let promotionCodeId: string | undefined;
        if (promoCode) {
            const promoCodePlanMap = await getPromoCodePlanMap();
            const planKey = promoCodePlanMap[promoCode];
            if (!planKey) {
                throw new functions.https.HttpsError(
                    'invalid-argument',
                    'Invalid promotion code.'
                );
            }
            const expectedPriceId = stripePriceByPlan[planKey];
            if (expectedPriceId !== priceId) {
                throw new functions.https.HttpsError(
                    'invalid-argument',
                    'Promotion code does not match the selected plan.'
                );
            }

            const promoList = await stripe.promotionCodes.list({
                code: promoCode,
                active: true,
                limit: 1
            });

            const promo = promoList.data[0];
            if (!promo) {
                throw new functions.https.HttpsError(
                    'invalid-argument',
                    'Promotion code is not active.'
                );
            }

            if (promo.coupon?.duration !== 'once') {
                throw new functions.https.HttpsError(
                    'failed-precondition',
                    'Promotion code is not configured for a one-month discount.'
                );
            }

            promotionCodeId = promo.id;
        }

        // Create Checkout Session
        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            discounts: promotionCodeId ? [{ promotion_code: promotionCodeId }] : undefined,
            success_url: successUrl,
            cancel_url: cancelUrl,
            metadata: {
                firebaseUserId: userId
            },
            client_reference_id: userId,
        });

        console.log(`✅ Checkout session created: ${session.id} for user ${userId}`);

        return {
            sessionId: session.id,
            url: session.url
        };
    } catch (error: any) {
        console.error("❌ Error creating checkout session:", error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError(
            'internal',
            error?.message || 'Failed to create checkout session'
        );
    }
});

// Create a Stripe Billing Portal session for subscription management
export const createBillingPortalSession = functions.runWith({
    secrets: [stripeSecretKey]
}).https.onCall(async (data: { returnUrl?: string }, context: functions.https.CallableContext) => {
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'You must be logged in to manage your subscription.'
        );
    }

    const returnUrl = data.returnUrl || 'https://www.rocketgoals.com/profile';

    try {
        const stripeKey = stripeSecretKey.value();
        if (!stripeKey) {
            throw new functions.https.HttpsError(
                'failed-precondition',
                'Stripe API key is not configured'
            );
        }

        const stripe = require('stripe')(stripeKey);

        // Get user profile to find Stripe customer ID
        const userId = context.auth.uid;
        const userDoc = await admin.firestore()
            .collection('userProfiles')
            .doc(userId)
            .get();

        if (!userDoc.exists) {
            throw new functions.https.HttpsError(
                'not-found',
                'User profile not found'
            );
        }

        const userData = userDoc.data();
        const customerId = userData?.stripeCustomerId;

        if (!customerId) {
            throw new functions.https.HttpsError(
                'failed-precondition',
                'No active subscription found. Please subscribe first.'
            );
        }

        // Create Billing Portal session
        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: returnUrl,
        });

        console.log(`✅ Billing portal session created for user ${userId}`);

        return {
            url: session.url
        };
    } catch (error: any) {
        console.error("❌ Error creating billing portal session:", error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError(
            'internal',
            error?.message || 'Failed to create billing portal session'
        );
    }
});

// Cancel a subscription
export const cancelSubscription = functions.runWith({
    secrets: [stripeSecretKey]
}).https.onCall(async (data: { immediately?: boolean }, context: functions.https.CallableContext) => {
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'You must be logged in to cancel your subscription.'
        );
    }

    const cancelImmediately = data.immediately ?? false;

    try {
        const stripeKey = stripeSecretKey.value();
        if (!stripeKey) {
            throw new functions.https.HttpsError(
                'failed-precondition',
                'Stripe API key is not configured'
            );
        }

        const stripe = require('stripe')(stripeKey);

        // Get user profile to find subscription ID
        const userId = context.auth.uid;
        const userDoc = await admin.firestore()
            .collection('userProfiles')
            .doc(userId)
            .get();

        if (!userDoc.exists) {
            throw new functions.https.HttpsError(
                'not-found',
                'User profile not found'
            );
        }

        const userData = userDoc.data();
        const subscriptionId = userData?.stripeSubscriptionId;

        if (!subscriptionId) {
            throw new functions.https.HttpsError(
                'failed-precondition',
                'No active subscription found.'
            );
        }

        let subscription;
        if (cancelImmediately) {
            // Cancel immediately
            subscription = await stripe.subscriptions.cancel(subscriptionId);
        } else {
            // Cancel at end of billing period
            subscription = await stripe.subscriptions.update(subscriptionId, {
                cancel_at_period_end: true
            });
        }

        // Update user profile
        await admin.firestore()
            .collection('userProfiles')
            .doc(userId)
            .update({
                subscriptionStatus: cancelImmediately ? 'canceled' : 'canceling',
                subscriptionCancelAt: cancelImmediately ? null : toTimestamp(subscription.cancel_at)
            });

        console.log(`✅ Subscription ${cancelImmediately ? 'canceled' : 'scheduled for cancellation'} for user ${userId}`);

        return {
            status: subscription.status,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            cancelAt: subscription.cancel_at,
            currentPeriodEnd: subscription.current_period_end
        };
    } catch (error: any) {
        console.error("❌ Error canceling subscription:", error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError(
            'internal',
            error?.message || 'Failed to cancel subscription'
        );
    }
});

// Reactivate a subscription that was scheduled for cancellation
export const reactivateSubscription = functions.runWith({
    secrets: [stripeSecretKey]
}).https.onCall(async (_data, context: functions.https.CallableContext) => {
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'You must be logged in to reactivate your subscription.'
        );
    }

    try {
        const stripeKey = stripeSecretKey.value();
        if (!stripeKey) {
            throw new functions.https.HttpsError(
                'failed-precondition',
                'Stripe API key is not configured'
            );
        }

        const stripe = require('stripe')(stripeKey);

        // Get user profile to find subscription ID
        const userId = context.auth.uid;
        const userDoc = await admin.firestore()
            .collection('userProfiles')
            .doc(userId)
            .get();

        if (!userDoc.exists) {
            throw new functions.https.HttpsError(
                'not-found',
                'User profile not found'
            );
        }

        const userData = userDoc.data();
        const subscriptionId = userData?.stripeSubscriptionId;

        if (!subscriptionId) {
            throw new functions.https.HttpsError(
                'failed-precondition',
                'No subscription found.'
            );
        }

        // Reactivate by removing cancel_at_period_end
        const subscription = await stripe.subscriptions.update(subscriptionId, {
            cancel_at_period_end: false
        });

        // Update user profile
        await admin.firestore()
            .collection('userProfiles')
            .doc(userId)
            .update({
                subscriptionStatus: 'active',
                subscriptionCancelAt: null
            });

        console.log(`✅ Subscription reactivated for user ${userId}`);

        return {
            status: subscription.status,
            cancelAtPeriodEnd: subscription.cancel_at_period_end
        };
    } catch (error: any) {
        console.error("❌ Error reactivating subscription:", error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError(
            'internal',
            error?.message || 'Failed to reactivate subscription'
        );
    }
});

// Redeem a promo code for a free 1-month subscription
export const redeemPromoCode = functions.https.onCall(async (data: { promoCode: string }, context: functions.https.CallableContext) => {
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'You must be logged in to redeem a promo code.'
        );
    }

    const promoCode = data.promoCode?.trim().toUpperCase();
    if (!promoCode) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Please provide a promo code.'
        );
    }

    const promoCodeInfoMap = await getPromoCodeInfoMap();
    const codeInfo = promoCodeInfoMap[promoCode];
    if (!codeInfo) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Invalid promo code.'
        );
    }

    const plan = codeInfo.tier as 'moonshot' | 'interplanetary' | 'galactic';
    const durationMonths = codeInfo.durationMonths;
    const lifetimeAccess = codeInfo.lifetimeAccess;

    const userId = context.auth.uid;
    const userDocRef = admin.firestore().collection('userProfiles').doc(userId);
    const userDoc = await userDocRef.get();

    if (!userDoc.exists) {
        throw new functions.https.HttpsError(
            'not-found',
            'User profile not found.'
        );
    }

    const userData = userDoc.data();

    // Check if user has already used this promo code
    const usedPromoCodes: string[] = userData?.usedPromoCodes || [];
    if (usedPromoCodes.includes(promoCode)) {
        throw new functions.https.HttpsError(
            'already-exists',
            'You have already used this promo code.'
        );
    }

    const updateData: Record<string, any> = {
        subscriptionStatus: 'active',
        subscriptionPlan: plan,
        subscriptionPaidAt: admin.firestore.Timestamp.now(),
        usedPromoCodes: admin.firestore.FieldValue.arrayUnion(promoCode),
        promoSubscription: true // Flag to indicate this is a promo subscription (no Stripe)
    };

    let expiresAt: Date | null = null;
    if (lifetimeAccess) {
        updateData.subscriptionExpiresAt = admin.firestore.FieldValue.delete();
    } else {
        // Calculate expiration date based on the code's duration
        const now = new Date();
        expiresAt = new Date(now);
        expiresAt.setMonth(expiresAt.getMonth() + durationMonths);
        updateData.subscriptionExpiresAt = admin.firestore.Timestamp.fromDate(expiresAt);
    }

    // Update user profile with the new subscription
    await userDocRef.update(updateData);

    // Get user name and email for tracking
    const userName = `${userData?.firstName || ''} ${userData?.lastName || ''}`.trim() || 'Unknown';
    const userEmail = userData?.email || context.auth.token.email || 'Unknown';

    // Increment usage count for the promo code and track the user
    await incrementPromoCodeUsage(promoCode, plan, userId, userName, userEmail);

    const logExpires = expiresAt ? expiresAt.toISOString() : 'lifetime';
    console.log(`✅ Promo code ${promoCode} redeemed for user ${userId} (${userName}) - Plan: ${plan}, Duration: ${lifetimeAccess ? 'lifetime' : `${durationMonths} months`}, Expires: ${logExpires}`);

    return {
        success: true,
        plan,
        durationMonths,
        lifetimeAccess,
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
        message: lifetimeAccess
            ? `Your ${plan.charAt(0).toUpperCase() + plan.slice(1)} subscription is now active for lifetime access!`
            : `Your ${plan.charAt(0).toUpperCase() + plan.slice(1)} subscription is now active for ${durationMonths} month${durationMonths !== 1 ? 's' : ''}!`
    };
});

// Callable: return auth metadata (last sign-in, creation time) for given UIDs
export const getAuthMetadata = onCall({}, async (request) => {
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "You must be authenticated to call this function.");
    }

    // Check admin status from Firestore userProfiles
    const userDoc = await admin.firestore()
        .collection('userProfiles')
        .doc(request.auth.uid)
        .get();
    const userData = userDoc.data();
    if (!userData || (userData.role !== 'admin' && userData.admin !== true)) {
        throw new HttpsError("permission-denied", "Admin access required.");
    }

    const uids = Array.isArray(request.data?.uids)
        ? request.data.uids.filter((u: any) => typeof u === "string" && u.trim())
        : [];

    if (uids.length === 0) {
        return { users: [] };
    }

    const chunkSize = 100;
    const users: { uid: string; lastSignInTime: string | null; creationTime: string | null }[] = [];

    for (let i = 0; i < uids.length; i += chunkSize) {
        const chunk = uids.slice(i, i + chunkSize).map((uid: string) => ({ uid }));
        const res = await admin.auth().getUsers(chunk);
        res.users.forEach((user) => {
            users.push({
                uid: user.uid,
                lastSignInTime: user.metadata?.lastSignInTime || null,
                creationTime: user.metadata?.creationTime || null,
            });
        });
    }

    return { users };
});

// createTeamMeetingRoom is temporarily disabled until Google Workspace admin setup is completed.

/**
 * Cloud Function to send demo scheduling confirmation emails
 * Sends confirmation to the user and copies mission control + admin
 */
export const scheduleDemoEmail = functions.runWith({
    secrets: [sendgridApiKey]
}).https.onCall(async (data: {
    firstName: string;
    lastName: string;
    email: string;
    company?: string;
    expectations: string;
    date: string;
    time: string;
}) => {
    const { firstName, lastName, email, company, expectations, date, time } = data;

    // Validate required fields
    if (!firstName || !lastName || !email || !expectations || !date || !time) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Missing required fields: firstName, lastName, email, expectations, date, time'
        );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Invalid email address format'
        );
    }

    const apiKey = sendgridApiKey.value();
    if (!apiKey) {
        throw new functions.https.HttpsError(
            'internal',
            'SendGrid API key is not configured.'
        );
    }
    sgMail.setApiKey(apiKey);

    // Format the date nicely
    const meetingDate = new Date(date);
    const formattedDate = meetingDate.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });

    // Format time display
    const timeDisplayMap: Record<string, string> = {
        '17:00': '5:00 PM EST',
        '17:30': '5:30 PM EST',
        '18:00': '6:00 PM EST',
        '18:30': '6:30 PM EST'
    };
    const displayTime = timeDisplayMap[time] || time;

    const fullName = `${firstName} ${lastName}`;

    // Meeting details
    const meetingLink = 'https://meet.google.com/cko-gfkj-wqg';
    const phoneNumber = '+1 904-419-3963';
    const pin = '573 033 836#';
    const morePhoneNumbers = 'https://tel.meet/cko-gfkj-wqg?hs=5';

    // Email to user
    const userEmailHtml = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 640px; margin: 0 auto; padding: 0;">
            <div style="background: linear-gradient(135deg, #dc2626 0%, #000000 100%); padding: 36px 30px; border-radius: 18px 18px 0 0; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 800;">Your Demo is Confirmed</h1>
                <p style="color: rgba(255,255,255,0.75); margin: 10px 0 0; font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase;">
                    Rocket Goals
                </p>
            </div>

            <div style="background: #ffffff; padding: 32px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 18px 18px;">
                <p style="color: #111827; font-size: 16px; line-height: 1.6; margin: 0 0 18px;">
                    Hi <strong>${firstName}</strong>,
                </p>
                <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
                    Thank you for scheduling a demo with Rocket Goals. We're excited to show you how our platform can help you achieve your goals.
                </p>

                <div style="background: #f9fafb; padding: 24px; border-radius: 12px; margin: 0 0 24px;">
                    <h2 style="color: #111827; font-size: 18px; font-weight: 700; margin: 0 0 16px;">Meeting Details</h2>

                    <div style="margin-bottom: 12px;">
                        <p style="color: #6b7280; font-size: 12px; text-transform: uppercase; margin: 0 0 4px; letter-spacing: 0.05em;">Date & Time</p>
                        <p style="color: #111827; font-size: 16px; font-weight: 600; margin: 0;">${formattedDate}</p>
                        <p style="color: #111827; font-size: 16px; margin: 4px 0 0;">${displayTime} (30 minutes)</p>
                    </div>

                    <div style="margin-bottom: 12px;">
                        <p style="color: #6b7280; font-size: 12px; text-transform: uppercase; margin: 0 0 4px; letter-spacing: 0.05em;">Video Call Link</p>
                        <a href="${meetingLink}" style="color: #dc2626; font-size: 16px; text-decoration: none;">${meetingLink}</a>
                    </div>

                    <div>
                        <p style="color: #6b7280; font-size: 12px; text-transform: uppercase; margin: 0 0 4px; letter-spacing: 0.05em;">Join by Phone</p>
                        <p style="color: #111827; font-size: 14px; margin: 0;">${phoneNumber}</p>
                        <p style="color: #111827; font-size: 14px; margin: 4px 0 0;">PIN: ${pin}</p>
                        <a href="${morePhoneNumbers}" style="color: #dc2626; font-size: 12px; text-decoration: none;">View more phone numbers</a>
                    </div>
                </div>

                <div style="text-align: center; margin: 24px 0;">
                    <a href="${meetingLink}"
                       style="background: #111827; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 700; display: inline-block; font-size: 16px;">
                        Join Meeting
                    </a>
                </div>

                <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0;">
                    If you need to reschedule, please reply to this email or contact us at missioncontrol@rocketgoals.com.
                </p>

                <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;">

                <p style="color: #9ca3af; font-size: 13px; margin: 0;">
                    See you soon,<br>
                    <strong style="color: #374151;">The Rocket Goals Team</strong>
                </p>
            </div>
        </div>
    `;

    const userEmailText = `Hi ${firstName},

Thank you for scheduling a demo with Rocket Goals. We're excited to show you how our platform can help you achieve your goals.

MEETING DETAILS
---------------
Date: ${formattedDate}
Time: ${displayTime} (30 minutes)

Video Call: ${meetingLink}

Join by Phone: ${phoneNumber}
PIN: ${pin}
More phone numbers: ${morePhoneNumbers}

If you need to reschedule, please reply to this email or contact us at missioncontrol@rocketgoals.com.

See you soon,
The Rocket Goals Team`;

    // Email to mission control (internal notification)
    const internalEmailHtml = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 640px; margin: 0 auto; padding: 0;">
            <div style="background: linear-gradient(135deg, #111827 0%, #374151 100%); padding: 36px 30px; border-radius: 18px 18px 0 0; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 26px; font-weight: 800;">New Demo Scheduled</h1>
                <p style="color: rgba(255,255,255,0.75); margin: 10px 0 0; font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase;">
                    Rocket Goals - Demo Request
                </p>
            </div>

            <div style="background: #ffffff; padding: 32px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 18px 18px;">
                <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
                    A new demo has been scheduled. Here are the details:
                </p>

                <div style="background: #f9fafb; padding: 24px; border-radius: 12px; margin: 0 0 24px;">
                    <h2 style="color: #111827; font-size: 18px; font-weight: 700; margin: 0 0 16px;">Contact Information</h2>

                    <div style="margin-bottom: 12px;">
                        <p style="color: #6b7280; font-size: 12px; text-transform: uppercase; margin: 0 0 4px; letter-spacing: 0.05em;">Name</p>
                        <p style="color: #111827; font-size: 16px; font-weight: 600; margin: 0;">${fullName}</p>
                    </div>

                    <div style="margin-bottom: 12px;">
                        <p style="color: #6b7280; font-size: 12px; text-transform: uppercase; margin: 0 0 4px; letter-spacing: 0.05em;">Email</p>
                        <a href="mailto:${email}" style="color: #dc2626; font-size: 16px; text-decoration: none;">${email}</a>
                    </div>

                    ${company ? `
                    <div style="margin-bottom: 12px;">
                        <p style="color: #6b7280; font-size: 12px; text-transform: uppercase; margin: 0 0 4px; letter-spacing: 0.05em;">Company</p>
                        <p style="color: #111827; font-size: 16px; margin: 0;">${company}</p>
                    </div>
                    ` : ''}
                </div>

                <div style="background: #f9fafb; padding: 24px; border-radius: 12px; margin: 0 0 24px;">
                    <h2 style="color: #111827; font-size: 18px; font-weight: 700; margin: 0 0 16px;">Meeting Details</h2>

                    <div style="margin-bottom: 12px;">
                        <p style="color: #6b7280; font-size: 12px; text-transform: uppercase; margin: 0 0 4px; letter-spacing: 0.05em;">Date & Time</p>
                        <p style="color: #111827; font-size: 16px; font-weight: 600; margin: 0;">${formattedDate}</p>
                        <p style="color: #111827; font-size: 16px; margin: 4px 0 0;">${displayTime} (30 minutes)</p>
                    </div>

                    <div>
                        <p style="color: #6b7280; font-size: 12px; text-transform: uppercase; margin: 0 0 4px; letter-spacing: 0.05em;">Meeting Link</p>
                        <a href="${meetingLink}" style="color: #dc2626; font-size: 16px; text-decoration: none;">${meetingLink}</a>
                    </div>
                </div>

                <div style="background: #fef3c7; padding: 24px; border-radius: 12px; margin: 0 0 24px; border: 1px solid #fcd34d;">
                    <h2 style="color: #92400e; font-size: 18px; font-weight: 700; margin: 0 0 12px;">What They Hope to Get From the Demo</h2>
                    <p style="color: #78350f; font-size: 14px; line-height: 1.6; margin: 0; white-space: pre-wrap;">${expectations}</p>
                </div>

                <div style="text-align: center;">
                    <a href="${meetingLink}"
                       style="background: #dc2626; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-weight: 700; display: inline-block; font-size: 16px;">
                        Join Meeting
                    </a>
                </div>
            </div>
        </div>
    `;

    const internalEmailText = `NEW DEMO SCHEDULED

CONTACT INFORMATION
-------------------
Name: ${fullName}
Email: ${email}
${company ? `Company: ${company}` : ''}

MEETING DETAILS
---------------
Date: ${formattedDate}
Time: ${displayTime} (30 minutes)
Meeting Link: ${meetingLink}

WHAT THEY HOPE TO GET FROM THE DEMO
-----------------------------------
${expectations}`;

    try {
        // Send confirmation email to the user
        await sgMail.send({
            to: email,
            from: 'missioncontrol@rocketgoals.com',
            subject: `Rocket Goals Demo Confirmed - ${formattedDate}`,
            text: userEmailText,
            html: userEmailHtml
        });

        // Send internal notification to mission control with CC to admin
        await sgMail.send({
            to: 'missioncontrol@rocketgoals.com',
            cc: 'edmond.mbadu@rocketgoals.com',
            from: 'missioncontrol@rocketgoals.com',
            subject: `New Demo Scheduled: ${fullName} - ${formattedDate}`,
            text: internalEmailText,
            html: internalEmailHtml,
            replyTo: email
        });

        console.log(`Demo scheduled for ${email} on ${formattedDate} at ${displayTime}`);

        // Store the demo request in Firestore for record keeping
        await admin.firestore().collection('demoRequests').add({
            firstName,
            lastName,
            email,
            company: company || null,
            expectations,
            scheduledDate: meetingDate,
            scheduledTime: time,
            displayTime,
            meetingLink,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return { success: true };
    } catch (error: any) {
        console.error('Error sending demo confirmation emails:', error);

        if (error.response) {
            const { body } = error.response;
            throw new functions.https.HttpsError(
                'internal',
                `SendGrid error: ${JSON.stringify(body)}`
            );
        }

        throw new functions.https.HttpsError(
            'internal',
            `Failed to send demo confirmation: ${error.message}`
        );
    }
});

/**
 * Interface for scheduled reminder documents
 */
type ReminderType = 'ignition' | 'mission_log';

interface ScheduledReminder {
    id?: string;
    time: string; // 24-hour format HH:MM
    enabled: boolean;
    reminderType?: ReminderType;
    emailSubject: string;
    emailBodyText: string;
    emailBodyHtml: string;
    createdAt: admin.firestore.Timestamp;
    updatedAt: admin.firestore.Timestamp;
    lastRunAt?: admin.firestore.Timestamp;
    createdBy: string;
}

type WeeklyResetSummary = {
    goalId: string;
    weekId: string;
    weekStartMs: number;
    weekEndMs: number;
    ignitionCompletionRate: number;
    missionLogCompletionRate: number;
    streakDays: number;
    oneThingCompletionRatio: number;
    focusDistribution: Record<string, number>;
    feelingDistribution: Record<string, number>;
    actionDistribution: Record<string, number>;
    topOneThing?: string;
    bestDayLabel?: string;
    toughestDayLabel?: string;
    suggestions: string[];
    createdAt?: admin.firestore.Timestamp;
    createdAtMs?: number;
};

function getWeekId(date: Date): string {
    const firstDay = new Date(date);
    firstDay.setHours(0, 0, 0, 0);
    const day = firstDay.getDay();
    const diff = (day + 6) % 7;
    firstDay.setDate(firstDay.getDate() - diff);
    const year = firstDay.getFullYear();
    const month = `${firstDay.getMonth() + 1}`.padStart(2, '0');
    const dayOfMonth = `${firstDay.getDate()}`.padStart(2, '0');
    return `${year}-W${month}${dayOfMonth}`;
}

function formatWeekLabel(date: Date): string {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getWeekRange(date = new Date()): { start: Date; end: Date } {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const day = start.getDay();
    const diff = (day + 6) % 7;
    start.setDate(start.getDate() - diff);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
}

function buildSuggestions(summary: WeeklyResetSummary): string[] {
    const suggestions: string[] = [];
    if (summary.missionLogCompletionRate < 60) {
        suggestions.push('Pick a fixed 10-minute window nightly to lock in your Mission Log.');
    }
    if (summary.ignitionCompletionRate < 60) {
        suggestions.push('Set your Daily Ignition for the same time each morning to create a habit cue.');
    }
    if (summary.oneThingCompletionRatio < 60) {
        suggestions.push('Shrink tomorrow’s ONE Thing to a 25-minute chunk to rebuild momentum.');
    }
    if (!suggestions.length) {
        suggestions.push('Keep your current cadence and add one small stretch goal for next week.');
    }
    return suggestions;
}

function summarizeDistribution(values: string[]): Record<string, number> {
    return values.reduce<Record<string, number>>((acc, value) => {
        const key = value || 'Unknown';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});
}

async function getWeeklySummary(goalId: string): Promise<WeeklyResetSummary | null> {
    const { start, end } = getWeekRange();
    const weekId = getWeekId(start);
    const weekStartMs = start.getTime();
    const weekEndMs = end.getTime();

    const ignitionSnapshot = await admin.firestore()
        .collection('rocketGoals')
        .doc(goalId)
        .collection('dailyIgnitions')
        .where('createdAtMs', '>=', weekStartMs)
        .where('createdAtMs', '<=', weekEndMs)
        .get();

    const missionSnapshot = await admin.firestore()
        .collection('rocketGoals')
        .doc(goalId)
        .collection('missionLogs')
        .where('createdAtMs', '>=', weekStartMs)
        .where('createdAtMs', '<=', weekEndMs)
        .get();

    const ignitionDays = ignitionSnapshot.docs.map(doc => doc.data());
    const missionLogs = missionSnapshot.docs.map(doc => doc.data());

    const ignitionCompletionRate = Math.round((ignitionDays.length / 7) * 100);
    const missionLogCompletionRate = Math.round((missionLogs.length / 7) * 100);

    const actionDistribution = summarizeDistribution(missionLogs.map(log => log.actionTaken));
    const focusDistribution = summarizeDistribution(missionLogs.map(log => log.focusLevel));
    const feelingDistribution = summarizeDistribution(missionLogs.map(log => log.feeling));

    const actionTotal = missionLogs.length;
    const actionYes = missionLogs.filter(log => log.actionTaken === 'yes').length;
    const oneThingCompletionRatio = actionTotal > 0 ? Math.round((actionYes / actionTotal) * 100) : 0;

    const topOneThing = ignitionDays
        .map(log => log.oneThingText)
        .filter(Boolean)[0];

    const bestDayLabel = formatWeekLabel(start);
    const toughestDayLabel = formatWeekLabel(end);

    const summary: WeeklyResetSummary = {
        goalId,
        weekId,
        weekStartMs,
        weekEndMs,
        ignitionCompletionRate,
        missionLogCompletionRate,
        streakDays: missionLogs.length,
        oneThingCompletionRatio,
        focusDistribution,
        feelingDistribution,
        actionDistribution,
        topOneThing,
        bestDayLabel,
        toughestDayLabel,
        suggestions: []
    };

    summary.suggestions = buildSuggestions(summary);
    return summary;
}

/**
 * Default email template for scheduled reminders
 */
function getDefaultReminderEmailTemplate(reminderType: ReminderType = 'mission_log') {
    if (reminderType === 'ignition') {
        const subject = '🔥 Daily Ignition — Set today’s trajectory';
        const text = `Hi {{participantName}},

🔥 DAILY IGNITION
Set today’s trajectory across your goals.

{{goalsText}}

Pick one goal above and set your ONE Thing for today.

- RocketGoals Team`;

        const html = `
            <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 640px; margin: 0 auto; padding: 20px;">
                <div style="background: linear-gradient(135deg, #dc2626 0%, #000000 100%); padding: 30px; border-radius: 16px 16px 0 0;">
                    <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 800;">🚀 RocketGoals</h1>
                </div>
                <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 16px 16px;">
                    <p style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #9ca3af; margin: 0 0 8px 0;">Daily Ignition</p>
                    <h2 style="color: #111827; margin: 0 0 16px 0; font-size: 22px;">Set today’s trajectory.</h2>
                    <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                        Hi {{participantName}},
                    </p>
                    <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                        Choose a goal below and set your ONE Thing for today.
                    </p>
                    {{goalsHtml}}
                    <p style="color: #9ca3af; font-size: 14px; margin: 24px 0 0 0;">
                        - RocketGoals Team
                    </p>
                </div>
            </div>
        `;

        return { subject, text, html };
    }

    const subject = '📘 Mission Log — Review the day';
    const text = `Hi {{participantName}},

📘 MISSION LOG
Review the day. Course-correct fast.

{{goalsText}}

Did you take action toward your ONE Thing today? Yes / Barely / No
How focused was your effort? Full Focus / Distracted / Low Energy
How challenging was today? Tough Day / Average / Easy
How did you feel while working? Positive / Neutral / Frustrated
Did you connect with your team today? Yes / No / Solo Effort

Choose a goal above to submit your Mission Log.

- RocketGoals Team`;

    const html = `
        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 640px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #dc2626 0%, #000000 100%); padding: 30px; border-radius: 16px 16px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 28px; font-weight: 800;">🚀 RocketGoals</h1>
            </div>
                <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 16px 16px;">
                    <p style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #9ca3af; margin: 0 0 8px 0;">Mission Log</p>
                    <h2 style="color: #111827; margin: 0 0 16px 0; font-size: 22px;">Review the day. Course-correct fast.</h2>
                    <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                        Hi {{participantName}},
                    </p>
                {{goalsHtml}}
                <div style="margin: 18px 0;">
                    <p style="margin: 0 0 6px 0; color: #111827; font-weight: 600;">Did you take action toward your ONE Thing today?</p>
                    <p style="margin: 0 0 12px 0; color: #374151;">Yes / Barely / No</p>
                    <p style="margin: 0 0 6px 0; color: #111827; font-weight: 600;">How focused was your effort?</p>
                    <p style="margin: 0 0 12px 0; color: #374151;">Full Focus / Distracted / Low Energy</p>
                    <p style="margin: 0 0 6px 0; color: #111827; font-weight: 600;">How challenging was today?</p>
                    <p style="margin: 0 0 12px 0; color: #374151;">Tough Day / Average / Easy</p>
                    <p style="margin: 0 0 6px 0; color: #111827; font-weight: 600;">How did you feel while working?</p>
                    <p style="margin: 0 0 12px 0; color: #374151;">Positive / Neutral / Frustrated</p>
                    <p style="margin: 0 0 6px 0; color: #111827; font-weight: 600;">Did you connect with your team today?</p>
                    <p style="margin: 0; color: #374151;">Yes / No / Solo Effort</p>
                </div>
                <p style="color: #9ca3af; font-size: 14px; margin: 24px 0 0 0;">
                    - RocketGoals Team
                </p>
            </div>
        </div>
    `;

    return { subject, text, html };
}

/**
 * Replace template placeholders with actual values
 */
function applyEmailTemplate(
    template: string,
    goalTitle: string,
    participantName: string,
    goalUrl: string,
    milestonesText = '',
    milestonesHtml = '',
    activeMilestone = '',
    oneThing = '',
    lastMissionLogSummary = ''
): string {
    return template
        .replace(/\{\{goalTitle\}\}/g, goalTitle)
        .replace(/\{\{participantName\}\}/g, participantName)
        .replace(/\{\{goalUrl\}\}/g, goalUrl)
        .replace(/\{\{milestonesText\}\}/g, milestonesText)
        .replace(/\{\{milestonesHtml\}\}/g, milestonesHtml)
        .replace(/\{\{activeMilestone\}\}/g, activeMilestone)
        .replace(/\{\{oneThing\}\}/g, oneThing)
        .replace(/\{\{lastMissionLogSummary\}\}/g, lastMissionLogSummary)
        // Replace old hardcoded URLs with the specific goal URL (for existing templates in Firestore)
        .replace(/https:\/\/rocket-goals\.web\.app\/goals/g, goalUrl)
        .replace(/https:\/\/www\.rocketgoals\.com\/goals/g, goalUrl);
}

function templateUsesGroupedPlaceholders(template: string): boolean {
    return /\{\{\s*goalsText\s*\}\}|\{\{\s*goalsHtml\s*\}\}|\{\{\s*goalsCount\s*\}\}|\{\{\s*reminderType\s*\}\}/i.test(template);
}

function applyGroupedEmailTemplate(
    template: string,
    participantName: string,
    goals: GroupedGoalReminderItem[],
    goalsText: string,
    goalsHtml: string,
    reminderTypeLabel: string
): string {
    const firstGoal = goals[0];
    const milestoneBlocks = firstGoal?.milestones ? buildMilestoneEmailBlocks(firstGoal.milestones) : { text: '', html: '' };

    return template
        .replace(/\{\{participantName\}\}/g, participantName)
        .replace(/\{\{goalsText\}\}/g, goalsText)
        .replace(/\{\{goalsHtml\}\}/g, goalsHtml)
        .replace(/\{\{goalsCount\}\}/g, String(goals.length))
        .replace(/\{\{reminderType\}\}/g, reminderTypeLabel)
        // Legacy single-goal placeholders map to the first goal
        .replace(/\{\{goalTitle\}\}/g, firstGoal?.title || '')
        .replace(/\{\{goalUrl\}\}/g, firstGoal?.url || '')
        .replace(/\{\{milestonesText\}\}/g, milestoneBlocks.text)
        .replace(/\{\{milestonesHtml\}\}/g, milestoneBlocks.html)
        .replace(/\{\{activeMilestone\}\}/g, firstGoal?.activeMilestone || '')
        .replace(/\{\{oneThing\}\}/g, firstGoal?.oneThing || '')
        .replace(/\{\{lastMissionLogSummary\}\}/g, firstGoal?.missionLogSummary || '')
        .replace(/https:\/\/rocket-goals\.web\.app\/goals/g, firstGoal?.url || '')
        .replace(/https:\/\/www\.rocketgoals\.com\/goals/g, firstGoal?.url || '');
}

function sortGoalsByOneThing(goals: GroupedGoalReminderItem[], oneThingGoalId?: string): GroupedGoalReminderItem[] {
    let targetId = oneThingGoalId;
    let hasTarget = targetId ? goals.some(goal => goal.id === targetId) : false;

    if (!hasTarget && targetId) {
        const targetKey = getReminderTargetKeyFromGoalId(targetId);
        const dedupedMatch = goals.find(goal => (goal.dedupeKey || `goal:${goal.id}`) === targetKey);
        if (dedupedMatch) {
            targetId = dedupedMatch.id;
            hasTarget = true;
        }
    }

    if (!hasTarget) {
        const withTimestamp = goals
            .filter(goal => typeof goal.createdAtMs === 'number')
            .sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
        if (withTimestamp.length) {
            targetId = withTimestamp[0].id;
        } else if (goals.length) {
            targetId = goals[0].id;
        }
    }

    if (!targetId) return goals;

    return goals
        .map(goal => ({ ...goal, isMyOneThing: goal.id === targetId }))
        .sort((a, b) => {
            const aScore = a.id === targetId ? 1 : 0;
            const bScore = b.id === targetId ? 1 : 0;
            if (aScore !== bScore) return bScore - aScore;
            return 0;
        });
}

function buildGroupedReminderEmailContent(
    reminderType: ReminderType,
    participantName: string,
    goals: GroupedGoalReminderItem[],
    templates?: { subject?: string; text?: string; html?: string }
): { subject: string; text: string; html: string } {
    const reminderTypeLabel = reminderType === 'ignition' ? 'Daily Ignition' : 'Mission Log';
    const defaultOptions: GroupedGoalEmailOptions = {
        subject: reminderType === 'ignition'
            ? '🔥 Daily Ignition — Check in across your goals'
            : '📘 Mission Log — Review the day across your goals',
        headline: reminderType === 'ignition'
            ? 'Daily Ignition check-in'
            : 'Mission Log check-in',
        intro: reminderType === 'ignition'
            ? 'Choose a goal below and set your ONE Thing for today.'
            : 'Choose a goal below to log your Mission Log for today.',
        ctaLabel: reminderType === 'ignition' ? 'Ignite day' : 'Submit log',
        includeActiveMilestone: true,
        includeOneThing: true,
        includeMissionLogSummary: reminderType === 'mission_log'
    };

    const usesGroupedTemplate = templates
        ? templateUsesGroupedPlaceholders(templates.subject || '')
          || templateUsesGroupedPlaceholders(templates.text || '')
          || templateUsesGroupedPlaceholders(templates.html || '')
        : false;

    if (usesGroupedTemplate) {
        const blocks = buildGroupedGoalBlocks(goals, {
            ...defaultOptions,
            includeMilestones: false
        });
        const subjectTemplate = templates?.subject || defaultOptions.subject;
        const textTemplate = templates?.text || '';
        const htmlTemplate = templates?.html || '';
        return {
            subject: applyGroupedEmailTemplate(subjectTemplate, participantName, goals, blocks.text, blocks.html, reminderTypeLabel),
            text: applyGroupedEmailTemplate(textTemplate, participantName, goals, blocks.text, blocks.html, reminderTypeLabel),
            html: applyGroupedEmailTemplate(htmlTemplate, participantName, goals, blocks.text, blocks.html, reminderTypeLabel)
        };
    }

    return generateGroupedGoalReminderEmail(participantName, goals, defaultOptions);
}

/**
 * Cloud Function to get all scheduled reminders
 * Only accessible by admin users
 */
export const getScheduledReminders = functions.runWith({
    secrets: []
}).https.onCall(async (_data: Record<string, never>, context: functions.https.CallableContext) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'You must be logged in.');
    }

    const userDoc = await admin.firestore().collection('userProfiles').doc(context.auth.uid).get();
    const userData = userDoc.data();
    if (!userData || (userData.role !== 'admin' && !userData.admin)) {
        throw new functions.https.HttpsError('permission-denied', 'Only administrators can access scheduled reminders.');
    }

    try {
        const snapshot = await admin.firestore()
            .collection('scheduledReminders')
            .orderBy('time', 'asc')
            .get();

        const reminders = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        return { success: true, reminders };
    } catch (error: any) {
        console.error('Error fetching scheduled reminders:', error);
        throw new functions.https.HttpsError('internal', `Failed to fetch scheduled reminders: ${error.message}`);
    }
});

function inferReminderTypeFromTime(time: string): ReminderType {
    const [hours] = time.split(':').map(Number);
    if (Number.isNaN(hours)) {
        return 'mission_log';
    }
    return hours < 12 ? 'ignition' : 'mission_log';
}

/**
 * Cloud Function to add a new scheduled reminder
 * Only accessible by admin users
 */
export const addScheduledReminder = functions.runWith({
    secrets: []
}).https.onCall(async (data: { time: string; reminderType?: ReminderType; emailSubject?: string; emailBodyText?: string; emailBodyHtml?: string }, context: functions.https.CallableContext) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'You must be logged in.');
    }

    const userDoc = await admin.firestore().collection('userProfiles').doc(context.auth.uid).get();
    const userData = userDoc.data();
    if (!userData || (userData.role !== 'admin' && !userData.admin)) {
        throw new functions.https.HttpsError('permission-denied', 'Only administrators can add scheduled reminders.');
    }

    const { time, reminderType, emailSubject, emailBodyText, emailBodyHtml } = data;

    // Validate time format (HH:MM)
    if (!time || !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid time format. Use HH:MM (24-hour format).');
    }

    try {
        const resolvedReminderType = reminderType || inferReminderTypeFromTime(time);
        const defaultTemplate = getDefaultReminderEmailTemplate(resolvedReminderType);
        const now = admin.firestore.Timestamp.now();

        const reminder: Omit<ScheduledReminder, 'id'> = {
            time,
            enabled: true,
            reminderType: resolvedReminderType,
            emailSubject: emailSubject || defaultTemplate.subject,
            emailBodyText: emailBodyText || defaultTemplate.text,
            emailBodyHtml: emailBodyHtml || defaultTemplate.html,
            createdAt: now,
            updatedAt: now,
            createdBy: context.auth.uid
        };

        const docRef = await admin.firestore().collection('scheduledReminders').add(reminder);

        return { success: true, id: docRef.id, reminder: { id: docRef.id, ...reminder } };
    } catch (error: any) {
        console.error('Error adding scheduled reminder:', error);
        throw new functions.https.HttpsError('internal', `Failed to add scheduled reminder: ${error.message}`);
    }
});

/**
 * Cloud Function to update a scheduled reminder
 * Only accessible by admin users
 */
export const updateScheduledReminder = functions.runWith({
    secrets: []
}).https.onCall(async (data: { id: string; time?: string; enabled?: boolean; reminderType?: ReminderType; emailSubject?: string; emailBodyText?: string; emailBodyHtml?: string }, context: functions.https.CallableContext) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'You must be logged in.');
    }

    const userDoc = await admin.firestore().collection('userProfiles').doc(context.auth.uid).get();
    const userData = userDoc.data();
    if (!userData || (userData.role !== 'admin' && !userData.admin)) {
        throw new functions.https.HttpsError('permission-denied', 'Only administrators can update scheduled reminders.');
    }

    const { id, time, enabled, reminderType, emailSubject, emailBodyText, emailBodyHtml } = data;

    if (!id) {
        throw new functions.https.HttpsError('invalid-argument', 'Reminder ID is required.');
    }

    // Validate time format if provided
    if (time && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid time format. Use HH:MM (24-hour format).');
    }

    try {
        const docRef = admin.firestore().collection('scheduledReminders').doc(id);
        const doc = await docRef.get();

        if (!doc.exists) {
            throw new functions.https.HttpsError('not-found', 'Scheduled reminder not found.');
        }

        const updates: Partial<ScheduledReminder> = {
            updatedAt: admin.firestore.Timestamp.now()
        };

        if (time !== undefined) updates.time = time;
        if (enabled !== undefined) updates.enabled = enabled;
        if (reminderType !== undefined) updates.reminderType = reminderType;
        if (emailSubject !== undefined) updates.emailSubject = emailSubject;
        if (emailBodyText !== undefined) updates.emailBodyText = emailBodyText;
        if (emailBodyHtml !== undefined) updates.emailBodyHtml = emailBodyHtml;

        await docRef.update(updates);

        const updated = await docRef.get();
        return { success: true, reminder: { id: updated.id, ...updated.data() } };
    } catch (error: any) {
        console.error('Error updating scheduled reminder:', error);
        throw new functions.https.HttpsError('internal', `Failed to update scheduled reminder: ${error.message}`);
    }
});

/**
 * Cloud Function to delete a scheduled reminder
 * Only accessible by admin users
 */
export const deleteScheduledReminder = functions.runWith({
    secrets: []
}).https.onCall(async (data: { id: string }, context: functions.https.CallableContext) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'You must be logged in.');
    }

    const userDoc = await admin.firestore().collection('userProfiles').doc(context.auth.uid).get();
    const userData = userDoc.data();
    if (!userData || (userData.role !== 'admin' && !userData.admin)) {
        throw new functions.https.HttpsError('permission-denied', 'Only administrators can delete scheduled reminders.');
    }

    const { id } = data;

    if (!id) {
        throw new functions.https.HttpsError('invalid-argument', 'Reminder ID is required.');
    }

    try {
        const docRef = admin.firestore().collection('scheduledReminders').doc(id);
        const doc = await docRef.get();

        if (!doc.exists) {
            throw new functions.https.HttpsError('not-found', 'Scheduled reminder not found.');
        }

        await docRef.delete();

        return { success: true };
    } catch (error: any) {
        console.error('Error deleting scheduled reminder:', error);
        throw new functions.https.HttpsError('internal', `Failed to delete scheduled reminder: ${error.message}`);
    }
});

/**
 * Cloud Function to get default email template
 * Only accessible by admin users
 */
export const getDefaultEmailTemplate = functions.runWith({
    secrets: []
}).https.onCall(async (data: { reminderType?: ReminderType }, context: functions.https.CallableContext) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'You must be logged in.');
    }

    const userDoc = await admin.firestore().collection('userProfiles').doc(context.auth.uid).get();
    const userData = userDoc.data();
    if (!userData || (userData.role !== 'admin' && !userData.admin)) {
        throw new functions.https.HttpsError('permission-denied', 'Only administrators can access email templates.');
    }

    const template = getDefaultReminderEmailTemplate(data?.reminderType ?? 'mission_log');
    return { success: true, template };
});

/**
 * Admin-only coach prompt manager.
 * Persists editable "soulFilet" prompt and applies updates to existing launchpad goals.
 */
export const saveCoachPromptConfig = functions.runWith({
    secrets: []
}).https.onCall(async (data: {
    templateId: string;
    appName: string;
    coachName: string;
    avatar?: string;
    soulFilet: string;
    applyToExistingGoals?: boolean;
}, context: functions.https.CallableContext) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'You must be logged in.');
    }

    const userDoc = await admin.firestore().collection('userProfiles').doc(context.auth.uid).get();
    const userData = userDoc.data();
    if (!userData || (userData.role !== 'admin' && !userData.admin)) {
        throw new functions.https.HttpsError('permission-denied', 'Only administrators can edit coach prompts.');
    }

    const templateId = (data?.templateId || '').toString().trim();
    const appName = (data?.appName || '').toString().trim();
    const coachName = (data?.coachName || '').toString().trim();
    const avatar = (data?.avatar || '').toString().trim();
    const soulFilet = (data?.soulFilet || '').toString().trim();
    const applyToExistingGoals = data?.applyToExistingGoals !== false;

    if (!templateId || !coachName || !soulFilet) {
        throw new functions.https.HttpsError('invalid-argument', 'templateId, coachName, and soulFilet are required.');
    }

    const coachRef = admin.firestore().collection('coachPrompts').doc(templateId);
    await coachRef.set({
        templateId,
        appName,
        coachName,
        avatar,
        soulFilet,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: context.auth.uid
    }, { merge: true });

    let updatedGoals = 0;
    if (applyToExistingGoals) {
        const querySnapshot = await admin.firestore()
            .collection('rocketGoals')
            .where('answers.launchpad_template_id', '==', templateId)
            .get();

        if (!querySnapshot.empty) {
            let batch = admin.firestore().batch();
            let opCount = 0;

            for (const goalDoc of querySnapshot.docs) {
                const goalData = goalDoc.data() as any;
                const existingCopilot = goalData.copilot || {};

                batch.update(goalDoc.ref, {
                    copilot: {
                        ...existingCopilot,
                        name: coachName,
                        role: soulFilet,
                        avatar: avatar || existingCopilot.avatar || ''
                    }
                });

                opCount++;
                updatedGoals++;

                if (opCount >= 400) {
                    await batch.commit();
                    batch = admin.firestore().batch();
                    opCount = 0;
                }
            }

            if (opCount > 0) {
                await batch.commit();
            }
        }
    }

    return { success: true, updatedGoals };
});

/**
 * Admin-only shared philosophy manager.
 * Persists RocketGoals Philosophy used across all coaches.
 */
export const saveSharedCoachPhilosophy = functions.runWith({
    secrets: []
}).https.onCall(async (data: {
    rocketGoalsPhilosophy: string;
}, context: functions.https.CallableContext) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'You must be logged in.');
    }

    const userDoc = await admin.firestore().collection('userProfiles').doc(context.auth.uid).get();
    const userData = userDoc.data();
    if (!userData || (userData.role !== 'admin' && !userData.admin)) {
        throw new functions.https.HttpsError('permission-denied', 'Only administrators can edit shared philosophy.');
    }

    const rocketGoalsPhilosophy = (data?.rocketGoalsPhilosophy || '').toString().trim();

    await admin.firestore()
        .collection('coachPromptSettings')
        .doc('global')
        .set({
            rocketGoalsPhilosophy,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedBy: context.auth.uid
        }, { merge: true });

    // Update in-memory cache immediately.
    sharedCoachPhilosophyCacheValue = rocketGoalsPhilosophy;
    sharedCoachPhilosophyCacheLoadedAt = Date.now();

    return { success: true };
});

/**
 * Save a community-created coach.
 * Any authenticated user can create a public coach.
 * Private coaches require at least a Moonshot subscription.
 */
export const saveCommunityCoach = functions.runWith({
    secrets: []
}).https.onCall(async (data: {
    coachName: string;
    avatar: string;
    soulFilet: string;
    appName: string;
    tagline: string;
    description: string;
    icon: string;
    category: string;
    visibility: 'public' | 'private';
    defaultGoals: {
        primaryGoal: string;
        theme: string;
        dailyEffort: string;
        objectives: string[];
    };
}, context: functions.https.CallableContext) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'You must be logged in.');
    }

    const coachName = (data?.coachName || '').toString().trim();
    const appName = (data?.appName || '').toString().trim();
    const tagline = (data?.tagline || '').toString().trim();
    const description = (data?.description || '').toString().trim();
    const icon = (data?.icon || '🎯').toString().trim();
    const category = (data?.category || 'Custom').toString().trim();
    const soulFilet = (data?.soulFilet || '').toString().trim();
    const avatar = (data?.avatar || '').toString();
    const visibility = data?.visibility === 'private' ? 'private' : 'public';

    if (!coachName || !appName) {
        throw new functions.https.HttpsError('invalid-argument', 'Coach name and app name are required.');
    }

    const goals = data?.defaultGoals;
    if (!goals?.primaryGoal) {
        throw new functions.https.HttpsError('invalid-argument', 'A primary goal is required.');
    }

    if (visibility === 'private') {
        const userDoc = await admin.firestore().collection('userProfiles').doc(context.auth.uid).get();
        const userData = userDoc.data();
        const plan = userData?.subscriptionPlan || 'free';
        const planHierarchy: Record<string, number> = { free: 0, moonshot: 1, interplanetary: 2, galactic: 3 };
        if ((planHierarchy[plan] || 0) < 1) {
            throw new functions.https.HttpsError(
                'permission-denied',
                'A Moonshot subscription or higher is required to create private coaches.'
            );
        }
    }

    const docRef = await admin.firestore().collection('communityCoaches').add({
        creatorUserId: context.auth.uid,
        coachName,
        avatar,
        soulFilet,
        appName,
        tagline,
        description,
        icon,
        category,
        visibility,
        defaultGoals: {
            primaryGoal: goals.primaryGoal.trim(),
            theme: (goals.theme || 'career').trim(),
            dailyEffort: (goals.dailyEffort || '1hour').trim(),
            objectives: Array.isArray(goals.objectives)
                ? goals.objectives.map((o: string) => (o || '').trim()).filter(Boolean)
                : []
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true, coachId: docRef.id };
});

/**
 * Delete a community coach. Admin-only.
 * Existing goals that reference this coach are unaffected — the copilot data lives on the goal document.
 */
export const deleteCommunityCoach = functions.runWith({
    secrets: []
}).https.onCall(async (data: { coachId: string }, context: functions.https.CallableContext) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'You must be logged in.');
    }

    const userDoc = await admin.firestore().collection('userProfiles').doc(context.auth.uid).get();
    const userData = userDoc.data();
    if (!userData || (userData.role !== 'admin' && !userData.admin)) {
        throw new functions.https.HttpsError('permission-denied', 'Only administrators can delete community coaches.');
    }

    const coachId = (data?.coachId || '').toString().trim();
    if (!coachId) {
        throw new functions.https.HttpsError('invalid-argument', 'Coach ID is required.');
    }

    const docRef = admin.firestore().collection('communityCoaches').doc(coachId);
    const doc = await docRef.get();
    if (!doc.exists) {
        throw new functions.https.HttpsError('not-found', 'Coach not found.');
    }

    await docRef.delete();
    return { success: true };
});

/**
 * Scheduled Cloud Function that runs every hour to check for scheduled reminders
 * This checks all enabled reminders and sends emails if the current time matches
 */
export const processScheduledReminders = functions.runWith({
    secrets: [sendgridApiKey],
    timeoutSeconds: 540,
    memory: '512MB'
}).pubsub.schedule('every 1 hours').timeZone('America/New_York').onRun(async (context) => {
    console.log('🕐 Processing scheduled reminders...');

    try {
        const apiKey = sendgridApiKey.value();
        if (!apiKey) {
            console.error('SendGrid API key is not set.');
            return null;
        }
        sgMail.setApiKey(apiKey);

        // Get current hour in 24-hour format (Eastern Time)
        const now = new Date();
        const easternTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const currentHour = easternTime.getHours().toString().padStart(2, '0');
        const currentMinute = easternTime.getMinutes();

        // Check reminders that should run this hour (check for any reminder where hour matches)
        const snapshot = await admin.firestore()
            .collection('scheduledReminders')
            .where('enabled', '==', true)
            .get();

        if (snapshot.empty) {
            console.log('No enabled scheduled reminders found.');
            return null;
        }

        for (const reminderDoc of snapshot.docs) {
            const reminder = reminderDoc.data() as ScheduledReminder;
            const [reminderHour, reminderMinute] = reminder.time.split(':').map(Number);

            // Check if current hour matches the reminder time
            // The function runs once per hour, so we just need to match the hour
            if (reminderHour.toString().padStart(2, '0') === currentHour) {
                console.log(`⏰ Running scheduled reminder at ${reminder.time}`);

                // Check if already run this hour
                if (reminder.lastRunAt) {
                    const lastRun = reminder.lastRunAt.toDate();
                    const hoursSinceLastRun = (now.getTime() - lastRun.getTime()) / (1000 * 60 * 60);
                    if (hoursSinceLastRun < 1) {
                        console.log(`Skipping reminder ${reminderDoc.id} - already ran within the last hour`);
                        continue;
                    }
                }

                // Fetch all active goals
                const goalsSnapshot = await admin.firestore()
                    .collection('rocketGoals')
                    .where('status', '==', 'active')
                    .get();

                if (goalsSnapshot.empty) {
                    console.log('No active goals found.');
                    continue;
                }

                let sent = 0;
                let failed = 0;
                const batchSize = 10;
                const goals = goalsSnapshot.docs;
                const groupedByEmail = new Map<string, { email: string; name: string; userId?: string; goals: GroupedGoalReminderItem[] }>();

                for (let i = 0; i < goals.length; i += batchSize) {
                    const batch = goals.slice(i, i + batchSize);

                    await Promise.allSettled(
                        batch.map(async (goalDoc) => {
                            try {
                                const goalData = goalDoc.data();
                                const goalTitle = goalData.primaryGoal || goalData.answers?.goal_title_label || 'Your Rocket Goal';
                                const participant = goalData.participant;

                                if (!participant || !participant.email) {
                                    failed++;
                                    return;
                                }

                                const participantName = participant.firstName
                                    ? `${participant.firstName} ${participant.lastName || ''}`.trim()
                                    : participant.email.split('@')[0];

                                const reminderType = reminder.reminderType || inferReminderTypeFromTime(reminder.time);
                                const goalUrl = `https://www.rocketgoals.com/rocketgoal/${goalDoc.id}?tab=checkins&checkin=${reminderType}`;

                                const [milestones, activeMilestone, latestIgnition, latestMissionLog] = await Promise.all([
                                    getUpcomingMilestones(goalDoc.id, goalData),
                                    getActiveMilestoneLabel(goalDoc.id, goalData),
                                    getLatestDailyIgnition(goalDoc.id),
                                    getLatestMissionLog(goalDoc.id)
                                ]);

                                const oneThing = (latestIgnition?.oneThingText || activeMilestone || '').trim();
                                const missionLogSummary = summarizeMissionLog(latestMissionLog);
                                const scheduledCoachInfo = getCoachInfoFromGoalData(goalData);
                                const goalItem: GroupedGoalReminderItem = {
                                    id: goalDoc.id,
                                    title: goalTitle,
                                    url: goalUrl,
                                    dedupeKey: getGoalReminderDedupeKey(goalDoc.id, goalData, goalTitle),
                                    isTeamMemberGoal: isTeamMemberGoal(goalData),
                                    milestones: milestones.slice(0, 3),
                                    activeMilestone,
                                    oneThing,
                                    missionLogSummary,
                                    imageUrl: scheduledCoachInfo ? undefined : (goalData.visualizationImageUrl || goalData.visualizationImage || goalData.answers?.visualizationImageUrl),
                                    coachName: scheduledCoachInfo?.coachName,
                                    coachAvatarUrl: scheduledCoachInfo?.coachAvatarUrl,
                                    createdAtMs: getTimestampMs(goalData.createdAt) || getTimestampMs(goalData.startTime) || undefined
                                };

                                const emailKey = participant.email.toLowerCase();
                                const existing = groupedByEmail.get(emailKey);
                                if (existing) {
                                    existing.goals.push(goalItem);
                                    if (!existing.name) {
                                        existing.name = participantName;
                                    }
                                } else {
                                    groupedByEmail.set(emailKey, {
                                        email: participant.email,
                                        name: participantName,
                                        userId: goalData.userId,
                                        goals: [goalItem]
                                    });
                                }
                            } catch (error: any) {
                                failed++;
                                console.error(`❌ Failed to send scheduled reminder:`, error.message);
                            }
                        })
                    );

                    if (i + batchSize < goals.length) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }

                const recipients = Array.from(groupedByEmail.values());
                const reminderType = reminder.reminderType || inferReminderTypeFromTime(reminder.time);
                const templates = {
                    subject: reminder.emailSubject,
                    text: reminder.emailBodyText,
                    html: reminder.emailBodyHtml
                };

                for (let i = 0; i < recipients.length; i += batchSize) {
                    const batch = recipients.slice(i, i + batchSize);

                    await Promise.allSettled(
                        batch.map(async (recipient) => {
                            try {
                                let oneThingGoalId: string | undefined;
                                if (recipient.userId) {
                                    try {
                                        const profileDoc = await admin.firestore().collection('userProfiles').doc(recipient.userId).get();
                                        oneThingGoalId = profileDoc.exists ? (profileDoc.data() as any).myOneThingGoalId : undefined;
                                    } catch (error) {
                                        console.warn('Unable to load My One THING for scheduled reminder:', error);
                                    }
                                }
                                const dedupedGoals = dedupeGroupedReminderGoals(recipient.goals);
                                const orderedGoals = sortGoalsByOneThing(dedupedGoals, oneThingGoalId);
                                const { subject, text, html } = buildGroupedReminderEmailContent(
                                    reminderType,
                                    recipient.name,
                                    orderedGoals,
                                    templates
                                );

                                const msg = {
                                    to: recipient.email,
                                    from: 'missioncontrol@rocketgoals.com',
                                    subject,
                                    text,
                                    html,
                                };

                                await sgMail.send(msg);
                                sent++;
                                console.log(`✅ Scheduled grouped reminder sent to ${recipient.email}`);
                            } catch (error: any) {
                                failed++;
                                console.error(`❌ Failed to send scheduled grouped reminder:`, error.message);
                            }
                        })
                    );

                    if (i + batchSize < recipients.length) {
                        await new Promise(resolve => setTimeout(resolve, 1000));
                    }
                }

                // Update lastRunAt
                await reminderDoc.ref.update({
                    lastRunAt: admin.firestore.Timestamp.now()
                });

                console.log(`✅ Scheduled reminder completed. Sent: ${sent}, Failed: ${failed}`);
            }
        }

        return null;
    } catch (error: any) {
        console.error('❌ Error processing scheduled reminders:', error);
        return null;
    }
});

/**
 * Weekly Reset email for each active goal
 */
export const processWeeklyResets = functions.runWith({
    secrets: [sendgridApiKey],
    timeoutSeconds: 540,
    memory: '512MB'
}).pubsub.schedule('0 20 * * 0').timeZone('America/New_York').onRun(async (context) => {
    console.log('🗓️ Processing weekly resets...');

    try {
        const apiKey = sendgridApiKey.value();
        if (!apiKey) {
            console.error('SendGrid API key is not set.');
            return null;
        }
        sgMail.setApiKey(apiKey);

        const goalsSnapshot = await admin.firestore()
            .collection('rocketGoals')
            .where('status', '==', 'active')
            .get();

        if (goalsSnapshot.empty) {
            console.log('No active goals found for weekly reset.');
            return null;
        }

        let sent = 0;
        let failed = 0;

        for (const goalDoc of goalsSnapshot.docs) {
            try {
                const goalData = goalDoc.data();
                const goalTitle = goalData.primaryGoal || goalData.answers?.goal_title_label || 'Your Rocket Goal';
                const participant = goalData.participant;
                if (!participant || !participant.email) {
                    failed++;
                    continue;
                }

                const summary = await getWeeklySummary(goalDoc.id);
                if (!summary) {
                    failed++;
                    continue;
                }

                const weeklyRef = await admin.firestore()
                    .collection('rocketGoals')
                    .doc(goalDoc.id)
                    .collection('weeklyResets')
                    .add({
                        ...summary,
                        createdAt: admin.firestore.Timestamp.now(),
                        createdAtMs: Date.now()
                    });

                const weekLabel = `${new Date(summary.weekStartMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(summary.weekEndMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
                const weeklyUrl = `https://www.rocketgoals.com/rocketgoal/${goalDoc.id}?tab=checkins&section=weekly`;

                const html = `
                    <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 640px; margin: 0 auto; padding: 20px;">
                        <div style="background: linear-gradient(135deg, #dc2626 0%, #000000 100%); padding: 30px; border-radius: 16px 16px 0 0;">
                            <p style="color: rgba(255,255,255,0.75); margin: 0 0 6px 0; text-transform: uppercase; letter-spacing: 0.08em; font-size: 12px;">RocketGoals</p>
                            <h1 style="color: white; margin: 0; font-size: 26px; font-weight: 800;">Weekly Reset</h1>
                            <p style="color: rgba(255,255,255,0.7); margin: 8px 0 0;">${weekLabel}</p>
                        </div>
                        <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 16px 16px;">
                            <p style="color: #111827; font-size: 18px; font-weight: 700; margin: 0 0 12px;">${goalTitle}</p>
                            <p style="color: #374151; margin: 0 0 20px;">Ignition completion: ${summary.ignitionCompletionRate}% · Mission Log completion: ${summary.missionLogCompletionRate}%</p>
                            <ul style="color: #374151; line-height: 1.6; padding-left: 18px;">
                                ${summary.suggestions.map(item => `<li>${item}</li>`).join('')}
                            </ul>
                            <div style="margin-top: 24px; text-align: center;">
                                <a href="${weeklyUrl}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700;">View Weekly Reset</a>
                            </div>
                        </div>
                    </div>
                `;

                const text = `RocketGoals Weekly Reset (${weekLabel})\n\n${goalTitle}\nIgnition completion: ${summary.ignitionCompletionRate}%\nMission Log completion: ${summary.missionLogCompletionRate}%\n\nSuggestions:\n${summary.suggestions.map(item => `- ${item}`).join('\n')}\n\nRocketGoals Team\n\nView weekly reset: ${weeklyUrl}`;

                await sgMail.send({
                    to: participant.email,
                    from: 'missioncontrol@rocketgoals.com',
                    subject: `Weekly Reset — ${goalTitle}`,
                    html,
                    text
                });

                sent++;
                console.log(`✅ Weekly reset sent to ${participant.email} (${weeklyRef.id})`);
            } catch (error: any) {
                failed++;
                console.error('❌ Weekly reset failed:', error.message);
            }
        }

        console.log(`Weekly resets completed. Sent: ${sent}, Failed: ${failed}`);
        return null;
    } catch (error: any) {
        console.error('❌ Weekly reset processing error:', error);
        return null;
    }
});

/**
 * Admin-only test trigger for Weekly Reset
 */
export const runWeeklyResetTest = functions.runWith({
    secrets: [sendgridApiKey],
    timeoutSeconds: 540,
    memory: '512MB'
}).https.onCall(async (data: { goalId?: string }, context: functions.https.CallableContext) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'You must be logged in.');
    }

    const userDoc = await admin.firestore().collection('userProfiles').doc(context.auth.uid).get();
    const userData = userDoc.data();
    if (!userData || (userData.role !== 'admin' && !userData.admin)) {
        throw new functions.https.HttpsError('permission-denied', 'Only administrators can run weekly resets.');
    }

    const apiKey = sendgridApiKey.value();
    if (!apiKey) {
        throw new functions.https.HttpsError('failed-precondition', 'SendGrid API key is not set.');
    }
    sgMail.setApiKey(apiKey);

    const goalId = data?.goalId?.trim();
    let goalsSnapshot: FirebaseFirestore.QuerySnapshot;
    if (goalId) {
        const goalDoc = await admin.firestore().collection('rocketGoals').doc(goalId).get();
        if (!goalDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Goal not found.');
        }
        goalsSnapshot = { docs: [goalDoc] } as FirebaseFirestore.QuerySnapshot;
    } else {
        goalsSnapshot = await admin.firestore()
            .collection('rocketGoals')
            .where('status', '==', 'active')
            .get();
    }

    let sent = 0;
    let failed = 0;

    for (const goalDoc of goalsSnapshot.docs) {
        try {
            const goalData = goalDoc.data();
            const goalTitle = goalData.primaryGoal || goalData.answers?.goal_title_label || 'Your Rocket Goal';
            const participant = goalData.participant;
            if (!participant || !participant.email) {
                failed++;
                continue;
            }

            const summary = await getWeeklySummary(goalDoc.id);
            if (!summary) {
                failed++;
                continue;
            }

            await admin.firestore()
                .collection('rocketGoals')
                .doc(goalDoc.id)
                .collection('weeklyResets')
                .add({
                    ...summary,
                    createdAt: admin.firestore.Timestamp.now(),
                    createdAtMs: Date.now()
                });

            const weekLabel = `${new Date(summary.weekStartMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${new Date(summary.weekEndMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
            const weeklyUrl = `https://www.rocketgoals.com/rocketgoal/${goalDoc.id}?tab=checkins&section=weekly`;

            const html = `
                <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 640px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #dc2626 0%, #000000 100%); padding: 30px; border-radius: 16px 16px 0 0;">
                        <p style="color: rgba(255,255,255,0.75); margin: 0 0 6px 0; text-transform: uppercase; letter-spacing: 0.08em; font-size: 12px;">RocketGoals</p>
                        <h1 style="color: white; margin: 0; font-size: 26px; font-weight: 800;">Weekly Reset</h1>
                        <p style="color: rgba(255,255,255,0.7); margin: 8px 0 0;">${weekLabel}</p>
                    </div>
                    <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 16px 16px;">
                        <p style="color: #111827; font-size: 18px; font-weight: 700; margin: 0 0 12px;">${goalTitle}</p>
                        <p style="color: #374151; margin: 0 0 20px;">Ignition completion: ${summary.ignitionCompletionRate}% · Mission Log completion: ${summary.missionLogCompletionRate}%</p>
                        <ul style="color: #374151; line-height: 1.6; padding-left: 18px;">
                            ${summary.suggestions.map(item => `<li>${item}</li>`).join('')}
                        </ul>
                        <div style="margin-top: 24px; text-align: center;">
                            <a href="${weeklyUrl}" style="display:inline-block;background:#111827;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700;">View Weekly Reset</a>
                        </div>
                    </div>
                </div>
            `;

            const text = `RocketGoals Weekly Reset (${weekLabel})\n\n${goalTitle}\nIgnition completion: ${summary.ignitionCompletionRate}%\nMission Log completion: ${summary.missionLogCompletionRate}%\n\nSuggestions:\n${summary.suggestions.map(item => `- ${item}`).join('\n')}\n\nRocketGoals Team\n\nView weekly reset: ${weeklyUrl}`;

            await sgMail.send({
                to: participant.email,
                from: 'missioncontrol@rocketgoals.com',
                subject: `Weekly Reset — ${goalTitle}`,
                html,
                text
            });

            sent++;
        } catch (error: any) {
            failed++;
            console.error('❌ Weekly reset test failed:', error.message);
        }
    }

    return {
        success: true,
        message: `Weekly reset run complete. Sent: ${sent}, Failed: ${failed}`
    };
});

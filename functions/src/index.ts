/* eslint-disable */
// @ts-nocheck
import * as functions from "firebase-functions/v1";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { GoogleGenerativeAI } from "@google/generative-ai";
import sgMail = require("@sendgrid/mail");
import { getToolRegistry, type AgentResponse, type SideEffect } from "./tools";
import { BetaAnalyticsDataClient } from "@google-analytics/data";
import * as crypto from "crypto";

// Initialize Firebase Admin
admin.initializeApp();

// Define secrets
const geminiApiKey = defineSecret('GEMINI_API_KEY');
const sendgridApiKey = defineSecret('SENDGRID_API_KEY');
const gaPropertyId = defineSecret('GA_PROPERTY_ID');
const stripeWebhookSecretGoals = defineSecret('STRIPE_WEBHOOK_SECRET_GOALS');
const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');

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

            // Base identity and framework description
            const baseIdentity = `You are a world-class coach, motivational genius, and unsurpassed goal-setting expert. Your mission is to guide individuals using the ROCKET Goal framework, which incorporates the wisdom of leading motivational thinkers, neuroscientists, and visionaries like Tony Robbins, Dr. Wayne Dyer, Emily Balcetis, and Buckminster Fuller. You also draw upon David Goggins's relentless mindset of embracing pain, overcoming adversity, and unlocking peak performance through discipline and grit. You are here to push users beyond their limits, help them master personal accountability, and foster team growth through the CREW Team Method—focusing on Courage to Risk, Recognition of Progress, Expanding Horizons, and Wisdom through Mentorship.`;

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
                model: "gemini-2.0-flash-exp", // Fastest model available
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
 * Build system prompt for the AI with calendar context
 */
function buildSystemPrompt(goalContext: any, calendarEvents: any[]): string {
    const baseIdentity = `You are a world-class coach, motivational genius, and unsurpassed goal-setting expert. Your mission is to guide individuals using the ROCKET Goal framework. You also help users manage their calendar and schedule for achieving their goals.`;

    const conversationGuidelines = `CRITICAL CONVERSATION GUIDELINES:
- Be helpful, concise, and action-oriented
- When users want to manage their calendar (add, edit, delete events), USE THE PROVIDED TOOLS IMMEDIATELY
- For creating events: use create_calendar_event with title and date
- For updating events: use update_calendar_event with the event's ID from the calendar list
- For deleting events: use delete_calendar_event with the event's ID. Match event names to IDs from the calendar list above.
- When the user says "delete X" or "remove X" or "cancel X", find the matching event by title and call delete_calendar_event with its ID
- Be conversational and natural - don't be robotic
- If there are multiple events with similar names and it's ambiguous, ask which one
- After taking an action, briefly confirm what was done

IMPORTANT FOR DELETE/UPDATE: You MUST use the event ID (like "abc123xyz") from the CALENDAR EVENTS section above, not the event title.`;

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

    return contextualPrompt;
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
        const goalContext = data?.goalContext;
        const calendarEvents = Array.isArray(data?.calendarEvents) ? data.calendarEvents : [];

        if (!userMessage) {
            throw new HttpsError(
                "invalid-argument",
                "Message is required"
            );
        }

        console.log(`🚀 rocketGoalsAI called with message: "${userMessage.substring(0, 50)}..."`);
        console.log(`📅 Calendar events: ${calendarEvents.length}, Goal ID: ${goalContext?.id || 'none'}`);

        // Get tool registry
        const toolRegistry = getToolRegistry();
        const toolDeclarations = toolRegistry.getFunctionDeclarations();
        console.log(`🔧 Available tools: ${toolRegistry.getToolNames().join(', ')}`);

        // Build system prompt with context
        const systemInstruction = buildSystemPrompt(goalContext, calendarEvents);

        // Initialize Gemini with function calling
        const genAI = new GoogleGenerativeAI(apiKey);
        const modelName = "gemini-2.0-flash-exp";

        const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction,
            generationConfig: {
                temperature: 0.8,
                topP: 0.95,
                topK: 40,
                maxOutputTokens: 300,
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

            // Send function results back to model
            history.push({
                role: "model",
                parts: functionCalls.map(fc => ({ functionCall: fc })) as any
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
 * Cloud Function to send custom verification emails via SendGrid
 * Accessible by authenticated users only
 */
export const sendVerificationEmail = functions.runWith({
    secrets: [sendgridApiKey]
}).https.onCall(async (_data: Record<string, never>, context: functions.https.CallableContext) => {
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

        const actionCodeSettings = {
            url: 'https://rocket-goals.web.app/login?verified=1',
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
            text: `Hi ${userName},\n\nCongratulations! You've just created a new RocketGoal: "${goalTitle}"\n\nYour mission timeframe: ${timeframeText}\n\nYour AI-powered daily plan is ready and waiting for you. Visit your RocketGoal page to see your personalized action steps and start making progress today!\n\nView your goal: https://rocket-goals.web.app/rocketgoal/${goalId}\n\nRemember: Every great achievement starts with a single step. You've already taken that step by committing to your goal. Now let's make it happen!\n\nTo your success,\nThe Rocket Goals Team`,
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
                            <a href="https://rocket-goals.web.app/rocketgoal/${goalId}"
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
 * Cloud Function to generate a visualization image for a goal using Gemini
 * Uses the provided prompt template to create an inspirational image of the user's future self
 */
export const generateGoalVisualization = onCall({
    region: "us-central1",
    secrets: [geminiApiKey],
    timeoutSeconds: 120, // Image generation can take longer
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

        // Use Gemini 2.0 Flash Experimental for image generation
        // This model supports native image output with responseModalities
        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash-exp",
        });

        console.log(`🎨 Sending image generation request to Gemini 2.0 Flash...`);

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
                responseModalities: ["image", "text"] as any,
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
 * Helper function to load promo codes from Firestore
 */
async function getPromoCodePlanMap(): Promise<Record<string, string>> {
    try {
        const promoDoc = await admin.firestore()
            .collection('adminSettings')
            .doc('promoCodes')
            .get();
        
        if (promoDoc.exists) {
            const data = promoDoc.data();
            const moonshot = data?.moonshot?.toUpperCase() || 'NY2026MOONSHOT';
            const interplanetary = data?.interplanetary?.toUpperCase() || 'NY2026INTERPLANETARY';
            const galactic = data?.galactic?.toUpperCase() || 'NY2026GALACTIC';
            
            return {
                [moonshot]: 'moonshot',
                [interplanetary]: 'interplanetary',
                [galactic]: 'galactic'
            };
        }
    } catch (err) {
        console.error('Failed to load promo codes from Firestore, using defaults:', err);
    }
    
    // Return defaults if Firestore read fails
    return {
        'NY2026MOONSHOT': 'moonshot',
        'NY2026INTERPLANETARY': 'interplanetary',
        'NY2026GALACTIC': 'galactic'
    };
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
    const successUrl = data.successUrl || 'https://rocket-goals.web.app/goals?payment=success';
    const cancelUrl = data.cancelUrl || 'https://rocket-goals.web.app/pricing?payment=cancelled';
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

    const returnUrl = data.returnUrl || 'https://rocket-goals.web.app/profile';

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

    const promoCodePlanMap = await getPromoCodePlanMap();
    const plan = promoCodePlanMap[promoCode] as 'moonshot' | 'interplanetary' | 'galactic' | undefined;
    if (!plan) {
        throw new functions.https.HttpsError(
            'invalid-argument',
            'Invalid promo code.'
        );
    }

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

    // Calculate expiration date (1 month from now)
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setMonth(expiresAt.getMonth() + 1);

    // Update user profile with the new subscription
    await userDocRef.update({
        subscriptionStatus: 'active',
        subscriptionPlan: plan,
        subscriptionPaidAt: admin.firestore.Timestamp.now(),
        subscriptionExpiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
        usedPromoCodes: admin.firestore.FieldValue.arrayUnion(promoCode),
        promoSubscription: true // Flag to indicate this is a promo subscription (no Stripe)
    });

    console.log(`✅ Promo code ${promoCode} redeemed for user ${userId} - Plan: ${plan}, Expires: ${expiresAt.toISOString()}`);

    return {
        success: true,
        plan,
        expiresAt: expiresAt.toISOString(),
        message: `Your ${plan.charAt(0).toUpperCase() + plan.slice(1)} subscription is now active for 1 month!`
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

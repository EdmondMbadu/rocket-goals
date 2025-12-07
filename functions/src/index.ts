/* eslint-disable */
// @ts-nocheck
import * as functions from "firebase-functions/v1";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { GoogleGenerativeAI } from "@google/generative-ai";
import sgMail = require("@sendgrid/mail");

// Initialize Firebase Admin
admin.initializeApp();

// Define secrets
const geminiApiKey = defineSecret('GEMINI_API_KEY');
const sendgridApiKey = defineSecret('SENDGRID_API_KEY');

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
 * Helper function to parse natural language dates to YYYY-MM-DD format
 */
function parseNaturalDate(dateStr: string): string | null {
    if (!dateStr) return null;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const lowerDateStr = dateStr.toLowerCase().trim();

    // Check for common natural language patterns
    if (lowerDateStr === 'today' || lowerDateStr === 'now') {
        return formatDate(today);
    } else if (lowerDateStr === 'tomorrow') {
        return formatDate(tomorrow);
    } else if (lowerDateStr === 'yesterday') {
        return formatDate(yesterday);
    }

    // Try to parse as ISO date or standard date format
    const parsedDate = new Date(dateStr);
    if (!isNaN(parsedDate.getTime())) {
        return formatDate(parsedDate);
    }

    // If already in YYYY-MM-DD format, return as is
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return dateStr;
    }

    return null;
}

function formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * HTTPS callable function for chat-based AI responses (used by frontend)
 * Using onCall automatically handles CORS for allowed Firebase origins.
 */
export const rocketGoalsAI = onCall({
    region: "us-central1",
    secrets: [geminiApiKey],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
}, async (request: any) => {
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

        const baseIdentity = `You are a world-class coach, motivational genius, and unsurpassed goal-setting expert. Your mission is to guide individuals using the ROCKET Goal framework, which incorporates the wisdom of leading motivational thinkers, neuroscientists, and visionaries like Tony Robbins, Dr. Wayne Dyer, Emily Balcetis, and Buckminster Fuller. You also draw upon David Goggins's relentless mindset of embracing pain, overcoming adversity, and unlocking peak performance through discipline and grit. You are here to push users beyond their limits, help them master personal accountability, and foster team growth through the CREW Team Method—focusing on Courage to Risk, Recognition of Progress, Expanding Horizons, and Wisdom through Mentorship.`;

        const conversationGuidelines = `CRITICAL CONVERSATION GUIDELINES (CHAT MODE):
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

        let contextualPrompt = `${baseIdentity}

${conversationGuidelines}`;

        if (goalContext) {
            const goalTitle = goalContext.title || "this goal";
            const primaryGoal = goalContext.primaryGoal || "";
            const goalStatus = goalContext.status || "active";
            const answers = goalContext.answers || {};

            contextualPrompt += `

GOAL-SPECIFIC CONTEXT:
You are currently helping a user with their specific goal: "${goalTitle}"
${primaryGoal ? `Primary Goal: ${primaryGoal}` : ""}
Goal Status: ${goalStatus}
${answers.daily_effort ? `Daily Effort: ${answers.daily_effort}` : ""}
${answers.future_result ? `Motivation Driver: ${answers.future_result.join(", ")}` : ""}

IMPORTANT: Use this goal context to provide personalized, insightful advice. Reference their specific goal details when relevant, but don't force it if their question is unrelated to goal achievement.`;
        }

        // Add calendar events context if available
        if (calendarEvents.length > 0) {
            const now = new Date();
            const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const yesterday = new Date(today);
            yesterday.setDate(yesterday.getDate() - 1);

            // Parse and categorize events
            const eventsByDate: { [key: string]: any[] } = {
                today: [],
                yesterday: [],
                tomorrow: [],
                upcoming: [],
                past: []
            };

            calendarEvents.forEach((event: any) => {
                const eventDate = new Date(event.date);
                const eventDateOnly = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());

                if (eventDateOnly.getTime() === today.getTime()) {
                    eventsByDate.today.push(event);
                } else if (eventDateOnly.getTime() === yesterday.getTime()) {
                    eventsByDate.yesterday.push(event);
                } else if (eventDateOnly.getTime() === tomorrow.getTime()) {
                    eventsByDate.tomorrow.push(event);
                } else if (eventDateOnly < today) {
                    eventsByDate.past.push(event);
                } else {
                    eventsByDate.upcoming.push(event);
                }
            });

            // Format events for AI context
            let eventsContext = "\n\nCALENDAR EVENTS CONTEXT:\n";
            eventsContext += "You have access to the user's calendar events for this goal. You can answer questions about:\n";
            eventsContext += "- Events planned for today, yesterday, tomorrow, or any specific date\n";
            eventsContext += "- Upcoming events and past events\n";
            eventsContext += "- Event details like time, duration, completion status, and descriptions\n\n";

            if (eventsByDate.today.length > 0) {
                eventsContext += `TODAY'S EVENTS (${eventsByDate.today.length}):\n`;
                eventsByDate.today.forEach((event: any) => {
                    eventsContext += `- ${event.title}`;
                    if (event.time) eventsContext += ` at ${event.time}`;
                    if (event.duration) eventsContext += ` (${event.duration} min)`;
                    if (event.completed) eventsContext += ` [COMPLETED]`;
                    if (event.description) eventsContext += ` - ${event.description}`;
                    eventsContext += "\n";
                });
                eventsContext += "\n";
            }

            if (eventsByDate.yesterday.length > 0) {
                eventsContext += `YESTERDAY'S EVENTS (${eventsByDate.yesterday.length}):\n`;
                eventsByDate.yesterday.forEach((event: any) => {
                    eventsContext += `- ${event.title}`;
                    if (event.time) eventsContext += ` at ${event.time}`;
                    if (event.completed) eventsContext += ` [COMPLETED]`;
                    eventsContext += "\n";
                });
                eventsContext += "\n";
            }

            if (eventsByDate.tomorrow.length > 0) {
                eventsContext += `TOMORROW'S EVENTS (${eventsByDate.tomorrow.length}):\n`;
                eventsByDate.tomorrow.forEach((event: any) => {
                    eventsContext += `- ${event.title}`;
                    if (event.time) eventsContext += ` at ${event.time}`;
                    if (event.duration) eventsContext += ` (${event.duration} min)`;
                    eventsContext += "\n";
                });
                eventsContext += "\n";
            }

            if (eventsByDate.upcoming.length > 0) {
                eventsContext += `UPCOMING EVENTS (${eventsByDate.upcoming.length}):\n`;
                // Show next 5 upcoming events
                eventsByDate.upcoming.slice(0, 5).forEach((event: any) => {
                    const eventDate = new Date(event.date);
                    const dateStr = eventDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    eventsContext += `- ${event.title} on ${dateStr}`;
                    if (event.time) eventsContext += ` at ${event.time}`;
                    eventsContext += "\n";
                });
                if (eventsByDate.upcoming.length > 5) {
                    eventsContext += `... and ${eventsByDate.upcoming.length - 5} more upcoming events\n`;
                }
                eventsContext += "\n";
            }

            eventsContext += "When users ask about their calendar events, provide specific, helpful information. For example:\n";
            eventsContext += "- 'What do I have today?' → List today's events with times\n";
            eventsContext += "- 'What did I do yesterday?' → List yesterday's events\n";
            eventsContext += "- 'What's coming up?' → List upcoming events\n";
            eventsContext += "- Be natural and conversational when discussing their schedule\n\n";

            eventsContext += "EVENT MANAGEMENT CAPABILITIES:\n";
            eventsContext += "You can help users ADD, EDIT, and DELETE calendar events through conversation.\n\n";
            eventsContext += "When a user wants to ADD an event:\n";
            eventsContext += "1. Ask for the event title (required)\n";
            eventsContext += "2. Ask for the date (required) - accept natural language like 'today', 'tomorrow', 'next Monday', or specific dates\n";
            eventsContext += "3. Ask for the time (optional but recommended) - format as HH:MM (24-hour) or accept natural language\n";
            eventsContext += "4. Ask for duration in minutes (optional, default 60)\n";
            eventsContext += "5. Ask for description (optional)\n";
            eventsContext += "6. Once you have title and date, confirm the details before creating\n";
            eventsContext += "7. When ready to create, include this EXACT format at the end of your response:\n";
            eventsContext += "   [ACTION:CREATE_EVENT]{\"title\":\"Event Title\",\"date\":\"YYYY-MM-DD\",\"time\":\"HH:MM\",\"duration\":60,\"description\":\"Optional description\"}[/ACTION]\n\n";

            eventsContext += "When a user wants to EDIT an event:\n";
            eventsContext += "1. Ask which event they want to edit (use the event list to help them identify it)\n";
            eventsContext += "2. Ask what they want to change (title, date, time, duration, description, completion status)\n";
            eventsContext += "3. Confirm the changes\n";
            eventsContext += "4. When ready to update, include this EXACT format at the end of your response:\n";
            eventsContext += "   [ACTION:UPDATE_EVENT]{\"eventId\":\"event-id-here\",\"title\":\"New Title\",\"date\":\"YYYY-MM-DD\",\"time\":\"HH:MM\",\"duration\":60,\"description\":\"New description\",\"completed\":false}[/ACTION]\n\n";

            eventsContext += "When a user wants to DELETE an event:\n";
            eventsContext += "1. Ask which event they want to delete (use the event list to help them identify it)\n";
            eventsContext += "2. Confirm the deletion\n";
            eventsContext += "3. When ready to delete, include this EXACT format at the end of your response:\n";
            eventsContext += "   [ACTION:DELETE_EVENT]{\"eventId\":\"event-id-here\"}[/ACTION]\n\n";

            eventsContext += "IMPORTANT RULES:\n";
            eventsContext += "- Always ask for confirmation before performing any action\n";
            eventsContext += "- Only include action tags when you're ready to execute (after confirmation)\n";
            eventsContext += "- For dates, convert natural language to YYYY-MM-DD format\n";
            eventsContext += "- For times, convert to HH:MM format (24-hour)\n";
            eventsContext += "- Include only the fields that are being changed in UPDATE_EVENT\n";
            eventsContext += "- Be conversational and helpful throughout the process\n";

            contextualPrompt += eventsContext;
        }

        const systemInstruction = contextualPrompt;

        const genAI = new GoogleGenerativeAI(apiKey);
        const modelName = "gemini-2.0-flash-exp";
        const model = genAI.getGenerativeModel({
            model: modelName,
            systemInstruction,
            generationConfig: {
                temperature: 0.9,
                topP: 0.95,
                topK: 40,
                maxOutputTokens: 200,
            },
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

        const result = await model.generateContent({
            contents: history,
        });

        let responseText = result.response?.text?.() || "";

        if (!responseText) {
            throw new HttpsError(
                "internal",
                "Empty response from AI model"
            );
        }

        // Parse action instructions from response
        let action: any = null;
        const actionRegex = /\[ACTION:(CREATE_EVENT|UPDATE_EVENT|DELETE_EVENT)\](.*?)\[\/ACTION\]/s;
        const actionMatch = responseText.match(actionRegex);

        if (actionMatch && goalContext?.id) {
            const actionType = actionMatch[1];
            const actionDataStr = actionMatch[2].trim();

            try {
                const actionData = JSON.parse(actionDataStr);

                // Remove action tags from response text
                responseText = responseText.replace(actionRegex, "").trim();

                if (actionType === "CREATE_EVENT") {
                    // Validate required fields
                    if (!actionData.title || !actionData.date) {
                        console.warn("Missing required fields for CREATE_EVENT");
                    } else {
                        // Parse date - try natural language first, then standard parsing
                        const parsedDateStr = parseNaturalDate(actionData.date);
                        const dateStrToUse = parsedDateStr || actionData.date;
                        const eventDate = new Date(dateStrToUse);

                        if (isNaN(eventDate.getTime())) {
                            console.warn("Invalid date format for CREATE_EVENT:", actionData.date);
                        } else {
                            // Set time if provided
                            if (actionData.time) {
                                const [hours, minutes] = actionData.time.split(':').map(Number);
                                eventDate.setHours(hours || 0, minutes || 0, 0, 0);
                            } else {
                                // If no time provided, set to start of day
                                eventDate.setHours(0, 0, 0, 0);
                            }

                            // Create event in Firestore
                            const eventRef = admin.firestore()
                                .collection('rocketGoals')
                                .doc(goalContext.id)
                                .collection('calendarEvents')
                                .doc();

                            const eventData = {
                                id: eventRef.id,
                                goalId: goalContext.id,
                                title: actionData.title,
                                date: admin.firestore.Timestamp.fromDate(eventDate),
                                time: actionData.time || null,
                                duration: actionData.duration || 60,
                                color: actionData.color || '#dc2626',
                                description: actionData.description || '',
                                completed: actionData.completed || false,
                                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                                updatedAt: admin.firestore.FieldValue.serverTimestamp()
                            };

                            await eventRef.set(eventData);

                            // Update the document with its own ID (as per the service pattern)
                            await eventRef.update({ id: eventRef.id });

                            action = {
                                type: 'createEvent',
                                eventData: {
                                    title: actionData.title,
                                    date: eventDate.toISOString(),
                                    time: actionData.time,
                                    duration: actionData.duration || 60,
                                    color: actionData.color || '#dc2626',
                                    description: actionData.description,
                                    completed: actionData.completed || false
                                }
                            };

                            console.log(`✅ Created event: ${actionData.title} for goal ${goalContext.id} at ${eventDate.toISOString()}`);
                            console.log(`Event ID: ${eventRef.id}, Date: ${eventDate.toISOString()}, Time: ${actionData.time || 'none'}`);
                        }
                    }
                } else if (actionType === "UPDATE_EVENT") {
                    if (!actionData.eventId) {
                        console.warn("Missing eventId for UPDATE_EVENT");
                    } else {
                        const eventRef = admin.firestore()
                            .collection('rocketGoals')
                            .doc(goalContext.id)
                            .collection('calendarEvents')
                            .doc(actionData.eventId);

                        const eventDoc = await eventRef.get();
                        if (!eventDoc.exists) {
                            console.warn(`Event ${actionData.eventId} not found`);
                        } else {
                            const updateData: any = {
                                updatedAt: admin.firestore.FieldValue.serverTimestamp()
                            };

                            if (actionData.title !== undefined) updateData.title = actionData.title;
                            if (actionData.date !== undefined) {
                                const eventDate = new Date(actionData.date);
                                if (actionData.time) {
                                    const [hours, minutes] = actionData.time.split(':').map(Number);
                                    eventDate.setHours(hours || 0, minutes || 0, 0, 0);
                                }
                                updateData.date = admin.firestore.Timestamp.fromDate(eventDate);
                            }
                            if (actionData.time !== undefined) updateData.time = actionData.time;
                            if (actionData.duration !== undefined) updateData.duration = actionData.duration;
                            if (actionData.color !== undefined) updateData.color = actionData.color;
                            if (actionData.description !== undefined) updateData.description = actionData.description;
                            if (actionData.completed !== undefined) updateData.completed = actionData.completed;

                            await eventRef.update(updateData);

                            action = {
                                type: 'updateEvent',
                                eventId: actionData.eventId,
                                eventData: {
                                    title: actionData.title,
                                    date: actionData.date ? new Date(actionData.date).toISOString() : undefined,
                                    time: actionData.time,
                                    duration: actionData.duration,
                                    color: actionData.color,
                                    description: actionData.description,
                                    completed: actionData.completed
                                }
                            };

                            console.log(`✅ Updated event: ${actionData.eventId} for goal ${goalContext.id}`);
                        }
                    }
                } else if (actionType === "DELETE_EVENT") {
                    if (!actionData.eventId) {
                        console.warn("Missing eventId for DELETE_EVENT");
                    } else {
                        const eventRef = admin.firestore()
                            .collection('rocketGoals')
                            .doc(goalContext.id)
                            .collection('calendarEvents')
                            .doc(actionData.eventId);

                        const eventDoc = await eventRef.get();
                        if (!eventDoc.exists) {
                            console.warn(`Event ${actionData.eventId} not found`);
                        } else {
                            await eventRef.delete();

                            action = {
                                type: 'deleteEvent',
                                eventId: actionData.eventId
                            };

                            console.log(`✅ Deleted event: ${actionData.eventId} for goal ${goalContext.id}`);
                        }
                    }
                }
            } catch (parseError) {
                console.error("Error parsing action data:", parseError);
                // Continue without action if parsing fails
            }
        }

        return {
            response: responseText,
            model: modelName,
            action: action || undefined
        };
    } catch (error: any) {
        console.error("rocketGoalsAI error:", error);
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


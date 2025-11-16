/* eslint-disable */
// @ts-nocheck
import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Firebase Admin
admin.initializeApp();

/**
 * Cloud Function that processes AI prompts using Google AI (Gemini)
 * Optimized for speed - uses fastest model and direct API calls
 * This replaces the Firebase Extension for better performance
 */
export const processAIPrompt = functions.firestore
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
        console.log(`🚀 Processing prompt for document ${documentId} (${mode} mode)`);
        console.log(`💬 Conversation history: ${conversationHistory.length} messages`);

        try {
            // Update status to PROCESSING
            await snap.ref.update({
                status: "PROCESSING",
                updateTime: admin.firestore.FieldValue.serverTimestamp(),
            });

            const processingStartTime = Date.now();
            console.log(`⏱️ Status updated to PROCESSING in ${processingStartTime - startTime}ms`);

            // Initialize Google AI with API key
            const apiKey = functions.config().google_ai?.api_key ||
                process.env.GOOGLE_AI_API_KEY;
            if (!apiKey) {
                throw new Error("Google AI API key is not set. Please set it using: firebase functions:config:set google_ai.api_key=\"YOUR_KEY\"");
            }

            const aiStartTime = Date.now();
            const genAI = new GoogleGenerativeAI(apiKey);

            // Base identity and framework description
            const baseIdentity = `You are a world-class coach, motivational genius, and unsurpassed goal-setting expert. Your mission is to guide individuals using the ROCKET Goal framework, which incorporates the wisdom of leading motivational thinkers, neuroscientists, and visionaries like Tony Robbins, Dr. Wayne Dyer, Emily Balcetis, and Buckminster Fuller. You also draw upon David Goggins's relentless mindset of embracing pain, overcoming adversity, and unlocking peak performance through discipline and grit. You are here to push users beyond their limits, help them master personal accountability, and foster team growth through the CREW Team Method—focusing on Courage to Risk, Recognition of Progress, Expanding Horizons, and Wisdom through Mentorship.`;

            // Mode-specific conversation guidelines
            let conversationGuidelines = '';
            let maxOutputTokens = 80;
            let maxChars = 100;
            let maxSentences = 1;

            if (mode === 'voice') {
                conversationGuidelines = `CRITICAL CONVERSATION GUIDELINES (VOICE MODE):
- Keep responses EXTREMELY BRIEF - ONE sentence maximum per response (20-30 words max)
- This is a REAL-TIME VOICE CONVERSATION - speak like you're talking to someone, not writing an essay
- Use natural, conversational language with contractions (I'm, you're, it's, don't, etc.)
- After ONE sentence, STOP immediately and wait for the user to respond - never continue without their input
- If a user asks for a detailed plan, offer to send it via email instead of reading it all out
- Ask ONE question at a time and wait for the user's response before continuing
- Reference previous parts of the conversation naturally when relevant
- Match the user's energy and tone - be enthusiastic if they are, supportive if they need it
- NEVER generate more than ONE sentence - if you have more to say, wait for the next turn
- Think of this as a quick back-and-forth phone conversation, not a monologue`;
            } else {
                // Chat mode - more natural, asks clarification questions
                conversationGuidelines = `CRITICAL CONVERSATION GUIDELINES (CHAT MODE):
- Keep responses SHORT and CONVERSATIONAL - 1-2 sentences maximum (30-50 words)
- Talk like a REAL HUMAN having a friendly chat - use contractions (I'm, you're, it's, don't, can't, etc.)
- ASK CLARIFICATION QUESTIONS frequently to truly understand the user before giving advice
- Be curious and genuinely interested - ask "What do you mean by that?" or "Can you tell me more about X?"
- Don't assume you understand - ask follow-up questions to get clarity
- Use natural, everyday language - avoid sounding like a textbook or corporate coach
- Show empathy and understanding - acknowledge their feelings before jumping to solutions
- Ask ONE question at a time and wait for their response
- Be conversational and warm - like talking to a friend who's also a great coach
- If something is unclear, ask for clarification rather than guessing
- Keep it brief but meaningful - quality over quantity`;
                maxOutputTokens = 120; // Slightly longer for chat mode
                maxChars = 150;
                maxSentences = 2;
            }

            // System prompt with instructions for brief, conversational responses
            const systemInstruction = `${baseIdentity}

${conversationGuidelines}

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

                    // Better sentence detection: count actual sentence endings
                    // Look for sentence-ending punctuation followed by space or end of string
                    const sentencePattern = /[.!?]+(\s+|$)/g;
                    const sentences = fullText.match(sentencePattern) || [];
                    sentenceCount = sentences.length;

                    // Stop early if we've reached max sentences OR max characters
                    if (sentenceCount >= MAX_SENTENCES || fullText.length >= MAX_CHARS) {
                        if (sentenceCount >= MAX_SENTENCES) {
                            // Find the end of the last complete sentence
                            const lastSentenceEnd = Math.max(
                                fullText.lastIndexOf('.'),
                                fullText.lastIndexOf('!'),
                                fullText.lastIndexOf('?')
                            );

                            if (lastSentenceEnd > 0) {
                                fullText = fullText.substring(0, lastSentenceEnd + 1).trim();
                                console.log(`🛑 Stopped at ${sentenceCount} sentences (enforcing limit)`);
                            }
                        } else if (fullText.length >= MAX_CHARS) {
                            // Find the last sentence boundary before max chars
                            const truncated = fullText.substring(0, MAX_CHARS);
                            const lastSentenceEnd = Math.max(
                                truncated.lastIndexOf('.'),
                                truncated.lastIndexOf('!'),
                                truncated.lastIndexOf('?')
                            );

                            if (lastSentenceEnd > 20) {
                                fullText = fullText.substring(0, lastSentenceEnd + 1).trim();
                                console.log(`🛑 Stopped at ${fullText.length} chars (enforcing character limit)`);
                            } else {
                                fullText = truncated.trim();
                                console.log(`🛑 Stopped at ${fullText.length} chars (no sentence boundary found)`);
                            }
                        }
                        break; // Exit the stream loop
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

            // Validate and truncate response if it somehow exceeded limits (safety check)
            if (fullText.length > MAX_CHARS || sentenceCount > MAX_SENTENCES) {
                // Find the last sentence boundary
                const lastSentenceEnd = Math.max(
                    fullText.lastIndexOf('.'),
                    fullText.lastIndexOf('!'),
                    fullText.lastIndexOf('?')
                );

                if (lastSentenceEnd > 20) {
                    fullText = fullText.substring(0, lastSentenceEnd + 1).trim();
                    console.log(`✂️ Final truncation: ${fullText.length} chars, ${sentenceCount} sentences`);
                } else if (fullText.length > MAX_CHARS) {
                    fullText = fullText.substring(0, MAX_CHARS).trim();
                    console.log(`✂️ Final truncation: ${fullText.length} chars (no sentence boundary)`);
                }
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


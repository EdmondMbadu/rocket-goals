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

        const prompt = data.prompt;
        console.log(`🚀 Processing prompt for document ${documentId} (fast mode)`);

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

            // Use fastest model for speed
            const model = genAI.getGenerativeModel({
                model: "gemini-2.0-flash-exp", // Fastest model available
                generationConfig: {
                    temperature: 0.7, // Balanced creativity/speed
                    topP: 0.95,
                    topK: 40,
                    maxOutputTokens: 2048, // Limit response length for speed
                },
            });

            console.log(`⏱️ Model initialized in ${Date.now() - aiStartTime}ms`);

            // Generate content
            const generateStartTime = Date.now();
            const result = await model.generateContent(prompt);
            const generateTime = Date.now() - generateStartTime;
            console.log(`⏱️ AI generation completed in ${generateTime}ms`);

            const response = result.response;
            const text = response.text();

            console.log(`✅ AI Response generated (${text.length} chars) in ${Date.now() - startTime}ms total`);

            // Update document with response
            await snap.ref.update({
                response: text,
                status: "COMPLETE",
                updateTime: admin.firestore.FieldValue.serverTimestamp(),
            });

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


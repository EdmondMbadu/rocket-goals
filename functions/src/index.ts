/* eslint-disable */
// @ts-nocheck
import * as functions from "firebase-functions/v1";
import * as admin from "firebase-admin";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Initialize Firebase Admin
admin.initializeApp();

/**
 * Cloud Function that processes AI prompts using Google AI (Gemini)
 * This uses API key authentication
 * 
 * NOTE: This function is commented out because we're using the Firebase Extension
 * (firestore-genai-chatbot) which handles the AI processing automatically.
 * If you want to use this custom function instead, uncomment it and disable the extension.
 */
/*
export const processAIPrompt = functions.firestore
    .document("public/{documentId}")
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .onCreate(async (snap: { data: () => any; ref: { update: (arg0: { status: string; updateTime: admin.firestore.FieldValue; response?: any; error?: any; }) => any; }; }, context: { params: { documentId: any; }; }) => {
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
        console.log(`Processing prompt for document ${documentId}:`, prompt);

        try {
            // Update status to PROCESSING
            await snap.ref.update({
                status: "PROCESSING",
                updateTime: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Initialize Google AI with API key
            const apiKey = functions.config().google_ai?.api_key ||
                process.env.GOOGLE_AI_API_KEY;
            if (!apiKey) {
                throw new Error("Google AI API key is not set. Please set it using: firebase functions:config:set google_ai.api_key=\"YOUR_KEY\"");
            }

            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({
                model: "gemini-2.0-flash-exp", // or 'gemini-1.5-flash' for stable version
            });

            // Generate content
            const result = await model.generateContent(prompt);
            const response = result.response;
            const text = response.text();

            console.log("AI Response generated:", text);

            // Update document with response
            await snap.ref.update({
                response: text,
                status: "COMPLETE",
                updateTime: admin.firestore.FieldValue.serverTimestamp(),
            });

            console.log(`Successfully processed document ${documentId}`);
            return null;
        } catch (error: any) {
            console.error("Error processing AI prompt:", error);

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
*/


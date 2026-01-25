/**
 * HeyGen API Integration Functions
 *
 * These functions handle generating personalized AI coach welcome videos
 * using the HeyGen API after mission onboarding.
 */

import {onCall, HttpsError} from "firebase-functions/v2/https";
import {defineSecret} from "firebase-functions/params";
import * as admin from "firebase-admin";

// Define HeyGen API secret
export const heygenApiKey = defineSecret("HEYGEN_API_KEY");

// HeyGen API endpoints
const HEYGEN_API_BASE = "https://api.heygen.com";
const HEYGEN_VIDEO_GENERATE = `${HEYGEN_API_BASE}/v2/video/generate`;
const HEYGEN_VIDEO_STATUS = `${HEYGEN_API_BASE}/v1/video_status.get`;
const HEYGEN_LIST_AVATARS = `${HEYGEN_API_BASE}/v2/avatars`;

// CORS configuration matching other functions
const CORS_ORIGINS = [
  "https://rocket-goals.web.app",
  "https://rocket-goals.firebaseapp.com",
  "https://www.rocketgoals.com",
  "https://rocketgoals.com",
  "http://localhost:4200",
  "http://127.0.0.1:4200",
];

// Types
interface InitiateVideoRequest {
  goalId: string;
  script: string;
  avatarId?: string;
  voiceId?: string;
  templateId?: string;
}

interface VideoStatusRequest {
  videoId: string;
  goalId: string;
}

interface HeyGenVideoResponse {
  error: {message?: string} | null;
  data: {
    video_id: string;
  };
}

interface HeyGenStatusResponse {
  data: {
    status: "pending" | "processing" | "completed" | "failed";
    video_url?: string;
    thumbnail_url?: string;
    duration?: number;
    error?: string;
  };
}

interface HeyGenAvatarInfo {
  avatar_id: string;
  avatar_name: string;
  gender: string;
  preview_image_url?: string;
  preview_video_url?: string;
  premium?: boolean;
}

interface HeyGenListAvatarsResponse {
  error: {message?: string} | null;
  data: {
    avatars: HeyGenAvatarInfo[];
  };
}

/**
 * Initiate HeyGen video generation
 *
 * This function starts the async video generation process with HeyGen
 * and returns a video_id for polling.
 */
export const initiateHeyGenVideo = onCall({
  region: "us-central1",
  secrets: [heygenApiKey],
  timeoutSeconds: 60,
  cors: CORS_ORIGINS,
}, async (request) => {
  // Validate authentication
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "You must be logged in to generate videos.",
    );
  }

  const userId = request.auth.uid;
  const data = request.data as InitiateVideoRequest;

  // Validate required fields
  if (!data.goalId || !data.script) {
    throw new HttpsError(
      "invalid-argument",
      "Missing required fields: goalId and script are required.",
    );
  }

  // Get API key
  const apiKey = heygenApiKey.value();
  if (!apiKey) {
    throw new HttpsError(
      "failed-precondition",
      "HeyGen API key is not configured. Please contact support.",
    );
  }

  // Use default avatar and voice if not specified
  // These should be configured based on your HeyGen account
  const avatarId = data.avatarId || "Georgia_sitting_office_front";
  const voiceId = data.voiceId || "1bd001e7e50f421d891986aad5158bc8";

  try {
    // Call HeyGen API to generate video
    const response = await fetch(HEYGEN_VIDEO_GENERATE, {
      method: "POST",
      headers: {
        "X-Api-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        video_inputs: [{
          character: {
            type: "avatar",
            avatar_id: avatarId,
            avatar_style: "normal",
          },
          voice: {
            type: "text",
            input_text: data.script,
            voice_id: voiceId,
            speed: 1.0,
          },
          background: {
            type: "color",
            value: "#0f172a",
          },
        }],
        dimension: {
          width: 1080,
          height: 1920,
        },
        aspect_ratio: "9:16",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("HeyGen API error response:", {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
        avatarIdUsed: avatarId,
        voiceIdUsed: voiceId,
      });
      // Parse error for more details
      let errorMessage = `HeyGen API error: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.error?.message) {
          errorMessage = `HeyGen: ${errorJson.error.message}`;
        } else if (errorJson.error?.code) {
          errorMessage = `HeyGen error code: ${errorJson.error.code}`;
        }
      } catch {
        // Use raw text if not JSON
        const truncated = errorText.substring(0, 100);
        errorMessage = `HeyGen API error: ${response.status} - ${truncated}`;
      }
      throw new HttpsError("internal", errorMessage);
    }

    const result = await response.json() as HeyGenVideoResponse;

    if (result.error) {
      console.error("HeyGen returned error:", result.error);
      throw new HttpsError(
        "internal",
        `HeyGen error: ${result.error.message || "Unknown error"}`,
      );
    }

    const videoId = result.data?.video_id;
    if (!videoId) {
      throw new HttpsError("internal", "HeyGen did not return a video ID");
    }

    // Store video generation record in Firestore
    await admin.firestore().collection("heygenVideos").doc(videoId).set({
      videoId,
      goalId: data.goalId,
      userId,
      templateId: data.templateId || null,
      script: data.script,
      avatarId,
      voiceId,
      status: "pending",
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`HeyGen video initiated: ${videoId} for goal ${data.goalId}`);

    return {
      success: true,
      videoId,
      status: "pending",
      message: "Video generation started",
    };
  } catch (error: unknown) {
    console.error("Error initiating HeyGen video:", error);

    if (error instanceof HttpsError) {
      throw error;
    }

    const errMsg = error instanceof Error ? error.message : "Unknown error";
    throw new HttpsError(
      "internal",
      errMsg || "Failed to initiate video generation",
    );
  }
});

/**
 * Check HeyGen video generation status
 *
 * Poll this function to check if the video is ready.
 * When complete, it updates Firestore and returns the video URL.
 */
export const checkHeyGenVideoStatus = onCall({
  region: "us-central1",
  secrets: [heygenApiKey],
  timeoutSeconds: 30,
  cors: CORS_ORIGINS,
}, async (request) => {
  // Validate authentication
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "You must be logged in to check video status.",
    );
  }

  const data = request.data as VideoStatusRequest;

  if (!data.videoId) {
    throw new HttpsError("invalid-argument", "Missing required field: videoId");
  }

  // Get API key
  const apiKey = heygenApiKey.value();
  if (!apiKey) {
    throw new HttpsError(
      "failed-precondition",
      "HeyGen API key is not configured. Please contact support.",
    );
  }

  try {
    // Check status with HeyGen API
    const statusUrl = `${HEYGEN_VIDEO_STATUS}?video_id=${data.videoId}`;
    const response = await fetch(statusUrl, {
      method: "GET",
      headers: {
        "X-Api-Key": apiKey,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("HeyGen status API error:", errorText);
      throw new HttpsError("internal", `HeyGen API error: ${response.status}`);
    }

    const result = await response.json() as HeyGenStatusResponse;
    const status = result.data?.status;
    const videoUrl = result.data?.video_url;
    const thumbnailUrl = result.data?.thumbnail_url;
    const duration = result.data?.duration;

    // Update Firestore record
    const updateData: Record<string, unknown> = {
      status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (status === "completed" && videoUrl) {
      updateData.videoUrl = videoUrl;
      updateData.thumbnailUrl = thumbnailUrl || null;
      updateData.duration = duration || null;
      updateData.completedAt = admin.firestore.FieldValue.serverTimestamp();

      // Also update the goal with the welcome video URL
      if (data.goalId) {
        await admin.firestore()
          .collection("rocketGoals")
          .doc(data.goalId)
          .update({
            welcomeVideoUrl: videoUrl,
            welcomeVideoThumbnail: thumbnailUrl || null,
            welcomeVideoGeneratedAt:
              admin.firestore.FieldValue.serverTimestamp(),
          });
      }
    }

    if (status === "failed") {
      updateData.error = result.data?.error || "Video generation failed";
    }

    await admin.firestore()
      .collection("heygenVideos")
      .doc(data.videoId)
      .update(updateData);

    console.log(`HeyGen video ${data.videoId} status: ${status}`);

    return {
      success: true,
      status,
      videoUrl: videoUrl || null,
      thumbnailUrl: thumbnailUrl || null,
      duration: duration || null,
      error: status === "failed" ?
        (result.data?.error || "Video generation failed") : null,
    };
  } catch (error: unknown) {
    console.error("Error checking HeyGen video status:", error);

    if (error instanceof HttpsError) {
      throw error;
    }

    const errMsg = error instanceof Error ? error.message : "Unknown error";
    throw new HttpsError(
      "internal",
      errMsg || "Failed to check video status",
    );
  }
});

/**
 * List available HeyGen avatars
 *
 * This function retrieves all available avatars from HeyGen API
 * to help select the best avatar for each app suite.
 */
export const listHeyGenAvatars = onCall({
  region: "us-central1",
  secrets: [heygenApiKey],
  timeoutSeconds: 30,
  cors: CORS_ORIGINS,
}, async (request) => {
  // Validate authentication - admin only
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "You must be logged in to list avatars.",
    );
  }

  // Get API key
  const apiKey = heygenApiKey.value();
  if (!apiKey) {
    throw new HttpsError(
      "failed-precondition",
      "HeyGen API key is not configured.",
    );
  }

  try {
    const response = await fetch(HEYGEN_LIST_AVATARS, {
      method: "GET",
      headers: {
        "X-Api-Key": apiKey,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("HeyGen list avatars error:", errorText);
      throw new HttpsError("internal", `HeyGen API error: ${response.status}`);
    }

    const result = await response.json() as HeyGenListAvatarsResponse;

    if (result.error) {
      throw new HttpsError(
        "internal",
        `HeyGen error: ${result.error.message || "Unknown error"}`,
      );
    }

    // Filter and format avatars for easier viewing
    const avatars = result.data?.avatars || [];

    // Categorize avatars by gender and name patterns
    const categorized = {
      male: avatars.filter((a) => a.gender === "male"),
      female: avatars.filter((a) => a.gender === "female"),
      total: avatars.length,
    };

    console.log(`Listed ${avatars.length} HeyGen avatars`);

    return {
      success: true,
      avatars: avatars.map((a) => ({
        id: a.avatar_id,
        name: a.avatar_name,
        gender: a.gender,
        previewImage: a.preview_image_url,
        previewVideo: a.preview_video_url,
        premium: a.premium || false,
      })),
      summary: {
        total: categorized.total,
        male: categorized.male.length,
        female: categorized.female.length,
      },
    };
  } catch (error: unknown) {
    console.error("Error listing HeyGen avatars:", error);

    if (error instanceof HttpsError) {
      throw error;
    }

    const errMsg = error instanceof Error ? error.message : "Unknown error";
    throw new HttpsError("internal", errMsg || "Failed to list avatars");
  }
});

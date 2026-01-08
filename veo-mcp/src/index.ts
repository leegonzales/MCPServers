#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GoogleGenAI } from "@google/genai";
import type { GenerateVideosOperation } from "@google/genai";
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { randomUUID } from "node:crypto";

// =============================================================================
// TYPES
// =============================================================================

interface GeneratedVideo {
    id: string;
    prompt: string;
    path: string;
    timestamp: Date;
    model: string;
    duration: number;
    resolution: string;
    aspectRatio: string;
    operationId: string;
    extensionCount: number;
}

interface PendingOperation {
    operationId: string;
    operation: GenerateVideosOperation;
    prompt: string;
    startTime: Date;
    model: string;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const OUTPUT_DIR = path.join(os.homedir(), "Documents", "veo_generated");
const MAX_POLL_ATTEMPTS = 60; // ~10 minutes max
const POLL_INTERVAL_MS = 10000; // 10 seconds
const MAX_EXTENSIONS = 20;

// Model IDs - use string type to avoid zod type recursion issues
const DEFAULT_MODEL = "veo-3.1-generate-preview";
const VALID_MODELS = new Set([
    "veo-3.1-generate-preview",
    "veo-3.1-fast-generate-preview",
    "veo-3.0-generate-001",
    "veo-3.0-fast-generate-001",
    "veo-2.0-generate-001",
]);

function validateModel(model: string): string {
    if (!VALID_MODELS.has(model)) {
        throw new Error(`Invalid model: ${model}. Valid models: ${Array.from(VALID_MODELS).join(", ")}`);
    }
    return model;
}

// =============================================================================
// SESSION STATE
// =============================================================================

const videoHistory: GeneratedVideo[] = [];
const pendingOperations: Map<string, PendingOperation> = new Map();
let lastGeneratedVideo: GeneratedVideo | null = null;

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function ensureOutputDir(): void {
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
}

function generateFilename(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const id = randomUUID().substring(0, 8);
    return `video-${timestamp}-${id}.mp4`;
}

function getGeminiClient(): GoogleGenAI {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error(
            "GEMINI_API_KEY environment variable is required. Get one at https://aistudio.google.com/"
        );
    }
    return new GoogleGenAI({ apiKey });
}

function getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
    };
    return mimeTypes[ext] || "image/png";
}

function readImageAsBase64(imagePath: string): string {
    const absolutePath = path.resolve(imagePath);
    if (!fs.existsSync(absolutePath)) {
        throw new Error(`Image file not found: ${absolutePath}`);
    }
    const buffer = fs.readFileSync(absolutePath);
    return buffer.toString("base64");
}

function validateImagePath(imagePath: string): void {
    const absolutePath = path.resolve(imagePath);
    if (!fs.existsSync(absolutePath)) {
        throw new Error(`Image file not found: ${absolutePath}`);
    }
    const ext = path.extname(absolutePath).toLowerCase();
    const supportedFormats = [".png", ".jpg", ".jpeg", ".webp"];
    if (!supportedFormats.includes(ext)) {
        throw new Error(
            `Unsupported image format: ${ext}. Supported: ${supportedFormats.join(", ")}`
        );
    }
}

// =============================================================================
// VIDEO DOWNLOAD & SAVE
// =============================================================================

async function downloadAndSaveVideo(
    videoUri: string,
    filename: string
): Promise<string> {
    ensureOutputDir();
    const filePath = path.join(OUTPUT_DIR, filename);

    try {
        // Add API key as query param for googleapis.com endpoints
        const downloadUrl = new URL(videoUri);
        const apiKey = process.env.GEMINI_API_KEY;
        if (apiKey && downloadUrl.hostname.includes("googleapis.com")) {
            downloadUrl.searchParams.set("key", apiKey);
        }

        console.error(`Downloading video from ${downloadUrl.hostname}...`);
        const response = await fetch(downloadUrl.toString());

        if (!response.ok) {
            // Try with header auth as fallback
            console.error(`Query param auth failed (${response.status}), trying header...`);
            const response2 = await fetch(videoUri, {
                headers: { "x-goog-api-key": apiKey || "" },
            });
            if (!response2.ok) {
                throw new Error(`Failed to download video: ${response2.statusText}`);
            }
            const buffer = Buffer.from(await response2.arrayBuffer());
            fs.writeFileSync(filePath, buffer);
            return filePath;
        }

        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(filePath, buffer);
        return filePath;
    } catch (err) {
        const error = err as NodeJS.ErrnoException;
        if (error.code === "EACCES") {
            throw new Error(`Permission denied writing to ${OUTPUT_DIR}`);
        }
        if (error.code === "ENOSPC") {
            throw new Error("Disk full - cannot save video");
        }
        throw err;
    }
}

// =============================================================================
// POLLING INFRASTRUCTURE
// =============================================================================

async function pollOperation(
    ai: GoogleGenAI,
    operation: GenerateVideosOperation,
    onProgress?: (attempt: number, maxAttempts: number) => void
): Promise<GenerateVideosOperation> {
    let attempts = 0;
    let currentOp = operation;

    while (!currentOp.done && attempts < MAX_POLL_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        attempts++;

        if (onProgress) {
            onProgress(attempts, MAX_POLL_ATTEMPTS);
        }
        console.error(
            `Video generation: polling attempt ${attempts}/${MAX_POLL_ATTEMPTS} (${attempts * 10}s elapsed)`
        );

        currentOp = await ai.operations.getVideosOperation({
            operation: currentOp,
        });

        // Check for explicit failure
        if (currentOp.error) {
            throw new Error(
                `Video generation failed: ${JSON.stringify(currentOp.error)}`
            );
        }
    }

    if (!currentOp.done) {
        throw new Error("Video generation timed out after 10 minutes");
    }

    return currentOp;
}

// =============================================================================
// STATE MANAGEMENT
// =============================================================================

function addCompletedVideo(video: GeneratedVideo): void {
    videoHistory.push(video);
    lastGeneratedVideo = video;
}

function addPendingOperation(op: PendingOperation): void {
    pendingOperations.set(op.operationId, op);
}

function removePendingOperation(operationId: string): void {
    pendingOperations.delete(operationId);
}

function getVideoById(id: string): GeneratedVideo | undefined {
    return videoHistory.find((v) => v.id === id);
}

function getVideoByPath(videoPath: string): GeneratedVideo | undefined {
    const absolutePath = path.resolve(videoPath);
    return videoHistory.find((v) => v.path === absolutePath);
}

// =============================================================================
// MCP SERVER
// =============================================================================

const server = new McpServer({
    name: "veo-mcp",
    version: "1.0.0",
});

// -----------------------------------------------------------------------------
// Tool: veo_generate_video (Text-to-Video)
// -----------------------------------------------------------------------------

// @ts-expect-error TS2589: Known type recursion issue with MCP SDK + zod
server.tool(
    "veo_generate_video",
    "Generate a video from a text prompt using Google Veo. Audio is generated natively - include dialogue in quotes, sound effects, and ambient descriptions in your prompt for rich audio.",
    {
        prompt: z.string().describe("Detailed video description"),
        model: z
            .string()
            .default(DEFAULT_MODEL)
            .describe("Veo model: veo-3.1-generate-preview, veo-3.1-fast-generate-preview, veo-3.0-generate-001, veo-3.0-fast-generate-001, veo-2.0-generate-001"),
        aspectRatio: z
            .string()
            .default("16:9")
            .describe("Video aspect ratio: 16:9 (landscape) or 9:16 (portrait)"),
        duration: z
            .string()
            .default("8")
            .describe("Video duration in seconds: 4, 6, or 8"),
        resolution: z
            .string()
            .default("720p")
            .describe("Video resolution: 720p or 1080p"),
        negativePrompt: z
            .string()
            .optional()
            .describe("Elements to exclude from the video"),
        seed: z
            .number()
            .optional()
            .describe("RNG seed for reproducible results (same seed + prompt = same video)"),
        enhancePrompt: z
            .boolean()
            .optional()
            .describe("Let the model enhance/rewrite your prompt for better results"),
        background: z
            .boolean()
            .default(false)
            .describe("Return immediately with operation ID instead of waiting"),
    },
    async ({ prompt, model, aspectRatio, duration, resolution, negativePrompt, seed, enhancePrompt, background }) => {
        try {
            const ai = getGeminiClient();
            const validModel = validateModel(model);

            // Start video generation
            console.error(`Starting video generation: "${prompt.substring(0, 50)}..."`);
            const operation = await ai.models.generateVideos({
                model: validModel,
                source: {
                    prompt,
                },
                config: {
                    aspectRatio,
                    durationSeconds: parseInt(duration),
                    resolution,
                    numberOfVideos: 1,
                    negativePrompt: negativePrompt || undefined,
                    seed: seed || undefined,
                    enhancePrompt: enhancePrompt ?? undefined,
                    // Audio is generated natively based on prompt content
                    // Include dialogue in quotes, sound effects, and ambient descriptions
                },
            });

            const operationId = operation.name || randomUUID();

            // Background mode: return immediately
            if (background) {
                addPendingOperation({
                    operationId,
                    operation,
                    prompt,
                    startTime: new Date(),
                    model,
                });

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: `Video generation started in background.\n\nOperation ID: ${operationId}\n\nUse veo_check_operation_status to check progress.`,
                        },
                    ],
                };
            }

            // Blocking mode: poll until complete
            const completedOp = await pollOperation(ai, operation);

            // Extract video URI
            const videoUri =
                completedOp.response?.generatedVideos?.[0]?.video?.uri;
            if (!videoUri) {
                // Check for RAI filtering
                if (
                    completedOp.response?.raiMediaFilteredCount &&
                    completedOp.response.raiMediaFilteredCount > 0
                ) {
                    return {
                        content: [
                            {
                                type: "text" as const,
                                text: `Video was filtered by content policy.\n\nReasons: ${completedOp.response.raiMediaFilteredReasons?.join(", ") || "Unknown"}\n\nTry rephrasing your prompt.`,
                            },
                        ],
                    };
                }
                throw new Error("No video URI in response");
            }

            // Download and save
            const filename = generateFilename();
            const savedPath = await downloadAndSaveVideo(videoUri, filename);

            // Track in history
            const videoRecord: GeneratedVideo = {
                id: path.basename(filename, ".mp4"),
                prompt,
                path: savedPath,
                timestamp: new Date(),
                model,
                duration: parseInt(duration),
                resolution,
                aspectRatio,
                operationId,
                extensionCount: 0,
            };
            addCompletedVideo(videoRecord);

            return {
                content: [
                    {
                        type: "text" as const,
                        text: `Video generated successfully!\n\nSaved to: ${savedPath}\n\nModel: ${model}\nDuration: ${duration}s\nAspect Ratio: ${aspectRatio}\nPrompt: ${prompt}`,
                    },
                ],
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                content: [
                    {
                        type: "text" as const,
                        text: `Error generating video: ${message}`,
                    },
                ],
                isError: true,
            };
        }
    }
);

// -----------------------------------------------------------------------------
// Tool: veo_generate_from_image (Image-to-Video)
// -----------------------------------------------------------------------------

server.tool(
    "veo_generate_from_image",
    "Animate a still image with motion",
    {
        imagePath: z.string().describe("Path to source image"),
        prompt: z.string().describe("Description of desired motion"),
        model: z
            .string()
            .default(DEFAULT_MODEL)
            .describe("Veo model to use"),
        duration: z
            .string()
            .default("8")
            .describe("Video duration in seconds: 4, 6, or 8"),
        background: z.boolean().default(false).describe("Return immediately"),
    },
    async ({ imagePath, prompt, model, duration, background }) => {
        try {
            // Validate image
            validateImagePath(imagePath);

            const ai = getGeminiClient();
            const validModel = validateModel(model);
            const imageBase64 = readImageAsBase64(imagePath);
            const mimeType = getMimeType(imagePath);

            console.error(`Starting image-to-video: "${prompt.substring(0, 50)}..."`);
            const operation = await ai.models.generateVideos({
                model: validModel,
                source: {
                    prompt,
                    image: {
                        imageBytes: imageBase64,
                        mimeType,
                    },
                },
                config: {
                    durationSeconds: parseInt(duration),
                    numberOfVideos: 1,
                },
            });

            const operationId = operation.name || randomUUID();

            if (background) {
                addPendingOperation({
                    operationId,
                    operation,
                    prompt: `Image-to-video: ${prompt}`,
                    startTime: new Date(),
                    model,
                });

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: `Image-to-video generation started.\n\nOperation ID: ${operationId}\nSource: ${imagePath}`,
                        },
                    ],
                };
            }

            const completedOp = await pollOperation(ai, operation);
            const videoUri =
                completedOp.response?.generatedVideos?.[0]?.video?.uri;
            if (!videoUri) {
                throw new Error("No video URI in response");
            }

            const filename = generateFilename();
            const savedPath = await downloadAndSaveVideo(videoUri, filename);

            const videoRecord: GeneratedVideo = {
                id: path.basename(filename, ".mp4"),
                prompt: `Image-to-video: ${prompt}`,
                path: savedPath,
                timestamp: new Date(),
                model,
                duration: parseInt(duration),
                resolution: "720p",
                aspectRatio: "16:9",
                operationId,
                extensionCount: 0,
            };
            addCompletedVideo(videoRecord);

            return {
                content: [
                    {
                        type: "text" as const,
                        text: `Video created from image!\n\nSource: ${imagePath}\nSaved to: ${savedPath}\n\nPrompt: ${prompt}`,
                    },
                ],
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                content: [
                    {
                        type: "text" as const,
                        text: `Error: ${message}`,
                    },
                ],
                isError: true,
            };
        }
    }
);

// -----------------------------------------------------------------------------
// Tool: veo_generate_transition (Frame Interpolation)
// -----------------------------------------------------------------------------

server.tool(
    "veo_generate_transition",
    "Generate video transitioning between two frames",
    {
        firstFrame: z.string().describe("Path to starting image"),
        lastFrame: z.string().describe("Path to ending image"),
        prompt: z.string().describe("Transition description"),
        model: z
            .string()
            .default(DEFAULT_MODEL)
            .describe("Veo model (3.1 recommended for transitions)"),
        duration: z
            .string()
            .default("8")
            .describe("Video duration: 4, 6, or 8"),
        background: z.boolean().default(false).describe("Return immediately"),
    },
    async ({ firstFrame, lastFrame, prompt, model, duration, background }) => {
        try {
            // Validate both images
            validateImagePath(firstFrame);
            validateImagePath(lastFrame);

            const ai = getGeminiClient();
            const validModel = validateModel(model);
            const firstFrameBase64 = readImageAsBase64(firstFrame);
            const lastFrameBase64 = readImageAsBase64(lastFrame);
            const firstMimeType = getMimeType(firstFrame);
            const lastMimeType = getMimeType(lastFrame);

            console.error(`Starting transition: "${prompt.substring(0, 50)}..."`);
            // For transitions: source.image is first frame, config.lastFrame is last frame
            const operation = await ai.models.generateVideos({
                model: validModel,
                source: {
                    prompt,
                    image: {
                        imageBytes: firstFrameBase64,
                        mimeType: firstMimeType,
                    },
                },
                config: {
                    durationSeconds: parseInt(duration),
                    numberOfVideos: 1,
                    lastFrame: {
                        imageBytes: lastFrameBase64,
                        mimeType: lastMimeType,
                    },
                },
            });

            const operationId = operation.name || randomUUID();

            if (background) {
                addPendingOperation({
                    operationId,
                    operation,
                    prompt: `Transition: ${prompt}`,
                    startTime: new Date(),
                    model,
                });

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: `Transition generation started.\n\nOperation ID: ${operationId}\nFirst frame: ${firstFrame}\nLast frame: ${lastFrame}`,
                        },
                    ],
                };
            }

            const completedOp = await pollOperation(ai, operation);
            const videoUri =
                completedOp.response?.generatedVideos?.[0]?.video?.uri;
            if (!videoUri) {
                throw new Error("No video URI in response");
            }

            const filename = generateFilename();
            const savedPath = await downloadAndSaveVideo(videoUri, filename);

            const videoRecord: GeneratedVideo = {
                id: path.basename(filename, ".mp4"),
                prompt: `Transition: ${prompt}`,
                path: savedPath,
                timestamp: new Date(),
                model,
                duration: parseInt(duration),
                resolution: "720p",
                aspectRatio: "16:9",
                operationId,
                extensionCount: 0,
            };
            addCompletedVideo(videoRecord);

            return {
                content: [
                    {
                        type: "text" as const,
                        text: `Transition video created!\n\nFirst frame: ${firstFrame}\nLast frame: ${lastFrame}\nSaved to: ${savedPath}\n\nPrompt: ${prompt}`,
                    },
                ],
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                content: [
                    {
                        type: "text" as const,
                        text: `Error: ${message}`,
                    },
                ],
                isError: true,
            };
        }
    }
);

// -----------------------------------------------------------------------------
// Tool: veo_extend_video
// -----------------------------------------------------------------------------

server.tool(
    "veo_extend_video",
    "Extend a previously generated Veo video by 7 seconds",
    {
        videoPath: z.string().describe("Path to Veo-generated video"),
        prompt: z.string().describe("Continuation description"),
        background: z.boolean().default(false).describe("Return immediately"),
    },
    async ({ videoPath, prompt, background }) => {
        try {
            // Find video in history
            const video = getVideoByPath(videoPath);
            if (!video) {
                return {
                    content: [
                        {
                            type: "text" as const,
                            text: `Cannot extend this video. Only Veo-generated videos from this session can be extended.\n\nPath: ${videoPath}`,
                        },
                    ],
                    isError: true,
                };
            }

            if (video.extensionCount >= MAX_EXTENSIONS) {
                return {
                    content: [
                        {
                            type: "text" as const,
                            text: `Maximum extensions reached (${MAX_EXTENSIONS}). Video is ~${8 + MAX_EXTENSIONS * 7} seconds long.`,
                        },
                    ],
                    isError: true,
                };
            }

            const ai = getGeminiClient();

            // Read video as base64 for extension
            const videoBuffer = fs.readFileSync(video.path);
            const videoBase64 = videoBuffer.toString("base64");

            console.error(`Extending video: "${prompt.substring(0, 50)}..."`);
            const operation = await ai.models.generateVideos({
                model: video.model,
                source: {
                    prompt,
                    video: {
                        videoBytes: videoBase64,
                        mimeType: "video/mp4",
                    },
                },
                config: {
                    numberOfVideos: 1,
                },
            });

            const operationId = operation.name || randomUUID();

            if (background) {
                addPendingOperation({
                    operationId,
                    operation,
                    prompt: `Extension: ${prompt}`,
                    startTime: new Date(),
                    model: video.model,
                });

                return {
                    content: [
                        {
                            type: "text" as const,
                            text: `Video extension started.\n\nOperation ID: ${operationId}\nSource: ${videoPath}\nCurrent extensions: ${video.extensionCount}`,
                        },
                    ],
                };
            }

            const completedOp = await pollOperation(ai, operation);
            const videoUri =
                completedOp.response?.generatedVideos?.[0]?.video?.uri;
            if (!videoUri) {
                throw new Error("No video URI in response");
            }

            const filename = generateFilename();
            const savedPath = await downloadAndSaveVideo(videoUri, filename);

            // Update extension count on original
            video.extensionCount++;

            const videoRecord: GeneratedVideo = {
                id: path.basename(filename, ".mp4"),
                prompt: `Extension of ${video.id}: ${prompt}`,
                path: savedPath,
                timestamp: new Date(),
                model: video.model,
                duration: video.duration + 7,
                resolution: video.resolution,
                aspectRatio: video.aspectRatio,
                operationId,
                extensionCount: video.extensionCount,
            };
            addCompletedVideo(videoRecord);

            return {
                content: [
                    {
                        type: "text" as const,
                        text: `Video extended!\n\nOriginal: ${videoPath}\nExtended: ${savedPath}\nExtension #${video.extensionCount} of ${MAX_EXTENSIONS}\n\nPrompt: ${prompt}`,
                    },
                ],
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                content: [
                    {
                        type: "text" as const,
                        text: `Error extending video: ${message}`,
                    },
                ],
                isError: true,
            };
        }
    }
);

// -----------------------------------------------------------------------------
// Tool: veo_get_video_history
// -----------------------------------------------------------------------------

server.tool(
    "veo_get_video_history",
    "List all videos generated in this session",
    {},
    async () => {
        if (videoHistory.length === 0) {
            return {
                content: [
                    {
                        type: "text" as const,
                        text: "No videos have been generated in this session yet.",
                    },
                ],
            };
        }

        const historyText = videoHistory
            .slice()
            .reverse()
            .map((video, index) => {
                const exists = fs.existsSync(video.path);
                return `[${index}] ${video.id}${!exists ? " (FILE DELETED)" : ""}\n    Prompt: ${video.prompt.substring(0, 60)}...\n    Path: ${video.path}\n    Model: ${video.model}\n    Duration: ${video.duration}s | Aspect: ${video.aspectRatio}\n    Extensions: ${video.extensionCount}/${MAX_EXTENSIONS}\n    Time: ${video.timestamp.toISOString()}`;
            })
            .join("\n\n");

        return {
            content: [
                {
                    type: "text" as const,
                    text: `Video History (${videoHistory.length} videos, newest first):\n\n${historyText}`,
                },
            ],
        };
    }
);

// -----------------------------------------------------------------------------
// Tool: veo_check_operation_status
// -----------------------------------------------------------------------------

server.tool(
    "veo_check_operation_status",
    "Check status of a running video generation",
    {
        operationId: z.string().describe("Operation ID from pending generation"),
    },
    async ({ operationId }) => {
        try {
            // Check if already completed
            const completed = videoHistory.find(
                (v) => v.operationId === operationId
            );
            if (completed) {
                return {
                    content: [
                        {
                            type: "text" as const,
                            text: `Operation completed!\n\nStatus: completed\nPath: ${completed.path}\nPrompt: ${completed.prompt}`,
                        },
                    ],
                };
            }

            // Check pending operations
            const pending = pendingOperations.get(operationId);
            if (!pending) {
                return {
                    content: [
                        {
                            type: "text" as const,
                            text: `Unknown operation ID: ${operationId}\n\nThis operation may have already completed or was started in a different session.`,
                        },
                    ],
                    isError: true,
                };
            }

            const ai = getGeminiClient();
            const currentOp = await ai.operations.getVideosOperation({
                operation: pending.operation,
            });

            const elapsed = Math.round(
                (Date.now() - pending.startTime.getTime()) / 1000
            );

            if (currentOp.done) {
                removePendingOperation(operationId);

                if (currentOp.error) {
                    return {
                        content: [
                            {
                                type: "text" as const,
                                text: `Operation failed!\n\nError: ${JSON.stringify(currentOp.error)}\nElapsed: ${elapsed}s`,
                            },
                        ],
                        isError: true,
                    };
                }

                const videoUri =
                    currentOp.response?.generatedVideos?.[0]?.video?.uri;
                if (videoUri) {
                    const filename = generateFilename();
                    const savedPath = await downloadAndSaveVideo(
                        videoUri,
                        filename
                    );

                    const videoRecord: GeneratedVideo = {
                        id: path.basename(filename, ".mp4"),
                        prompt: pending.prompt,
                        path: savedPath,
                        timestamp: new Date(),
                        model: pending.model,
                        duration: 8,
                        resolution: "720p",
                        aspectRatio: "16:9",
                        operationId,
                        extensionCount: 0,
                    };
                    addCompletedVideo(videoRecord);

                    return {
                        content: [
                            {
                                type: "text" as const,
                                text: `Operation completed!\n\nStatus: completed\nPath: ${savedPath}\nPrompt: ${pending.prompt}\nElapsed: ${elapsed}s`,
                            },
                        ],
                    };
                }
            }

            return {
                content: [
                    {
                        type: "text" as const,
                        text: `Operation in progress...\n\nStatus: pending\nElapsed: ${elapsed}s\nPrompt: ${pending.prompt}\nModel: ${pending.model}`,
                    },
                ],
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                content: [
                    {
                        type: "text" as const,
                        text: `Error checking status: ${message}`,
                    },
                ],
                isError: true,
            };
        }
    }
);

// -----------------------------------------------------------------------------
// Tool: veo_cleanup
// -----------------------------------------------------------------------------

server.tool(
    "veo_cleanup",
    "Delete generated videos to free disk space",
    {
        videoId: z
            .string()
            .optional()
            .describe("Specific video ID to delete"),
        all: z
            .boolean()
            .default(false)
            .describe("Delete all session videos"),
    },
    async ({ videoId, all }) => {
        try {
            const deleted: string[] = [];
            let bytesRecovered = 0;
            const errors: string[] = [];

            if (all) {
                // Delete all videos
                for (const video of videoHistory) {
                    try {
                        if (fs.existsSync(video.path)) {
                            const stats = fs.statSync(video.path);
                            bytesRecovered += stats.size;
                            fs.unlinkSync(video.path);
                            deleted.push(video.id);
                        }
                    } catch (err) {
                        errors.push(`${video.id}: ${(err as Error).message}`);
                    }
                }
                videoHistory.length = 0;
                lastGeneratedVideo = null;
            } else if (videoId) {
                // Delete specific video
                const video = getVideoById(videoId);
                if (!video) {
                    return {
                        content: [
                            {
                                type: "text" as const,
                                text: `Video not found: ${videoId}`,
                            },
                        ],
                        isError: true,
                    };
                }

                if (fs.existsSync(video.path)) {
                    const stats = fs.statSync(video.path);
                    bytesRecovered += stats.size;
                    fs.unlinkSync(video.path);
                    deleted.push(video.id);
                }

                // Remove from history
                const index = videoHistory.findIndex((v) => v.id === videoId);
                if (index !== -1) {
                    videoHistory.splice(index, 1);
                }
                if (lastGeneratedVideo?.id === videoId) {
                    lastGeneratedVideo = videoHistory[videoHistory.length - 1] || null;
                }
            } else {
                return {
                    content: [
                        {
                            type: "text" as const,
                            text: "Specify either 'videoId' to delete a specific video, or 'all: true' to delete all videos.",
                        },
                    ],
                };
            }

            const mbRecovered = (bytesRecovered / (1024 * 1024)).toFixed(2);

            return {
                content: [
                    {
                        type: "text" as const,
                        text: `Cleanup complete!\n\nDeleted: ${deleted.length} video(s)\nSpace recovered: ${mbRecovered} MB${errors.length > 0 ? `\n\nErrors:\n${errors.join("\n")}` : ""}`,
                    },
                ],
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                content: [
                    {
                        type: "text" as const,
                        text: `Error during cleanup: ${message}`,
                    },
                ],
                isError: true,
            };
        }
    }
);

// =============================================================================
// START SERVER
// =============================================================================

async function main(): Promise<void> {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Veo MCP server running on stdio");
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});

#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GoogleGenAI, Modality } from "@google/genai";
import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Types
interface GeneratedImage {
    id: string;
    prompt: string;
    path: string;
    timestamp: string; // ISO format for JSON serialization
    model: string;
    aspectRatio?: string;
    imageSize?: string;
    editedFrom?: string; // Parent image ID if this was an edit
    sourceImagePath?: string; // For edits: original input image path
    type: "generation" | "edit" | "continue_edit";
}

// Session state
const sessionHistory: GeneratedImage[] = []; // Current session only
let lastGeneratedImage: GeneratedImage | null = null;
let persistentManifest: GeneratedImage[] = []; // Loaded from disk

// Output directory (images go here, may be Dropbox/iCloud synced)
const OUTPUT_DIR = path.join(os.homedir(), "Documents", "nanobanana_generated");
// Manifest lives outside the synced folder to avoid Dropbox/iCloud EAGAIN locks
const CACHE_DIR = path.join(os.homedir(), ".cache", "nanobanana-mcp");
const MANIFEST_PATH = path.join(CACHE_DIR, "manifest.json");
// Legacy manifest path (for one-time migration)
const LEGACY_MANIFEST_PATH = path.join(OUTPUT_DIR, "manifest.json");

// Retry helper for Dropbox/iCloud EAGAIN errors
async function retryIO<T>(fn: () => T | Promise<T>, label: string, maxRetries = 5): Promise<T> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err: any) {
            const isRetryable = err?.code === "EAGAIN" || err?.errno === -11 ||
                (err?.message && err.message.includes("Unknown system error -11"));
            if (isRetryable && attempt < maxRetries) {
                const delay = 200 * Math.pow(2, attempt);
                console.warn(`[${label}] EAGAIN retry ${attempt + 1}/${maxRetries}, waiting ${delay}ms`);
                await new Promise((r) => setTimeout(r, delay));
                continue;
            }
            throw err;
        }
    }
    throw new Error(`[${label}] unreachable`);
}

// Ensure output and cache directories exist
function ensureOutputDir(): void {
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
    if (!fs.existsSync(CACHE_DIR)) {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
}

// Load manifest from disk (with one-time migration from legacy location)
async function loadManifest(): Promise<GeneratedImage[]> {
    ensureOutputDir();
    try {
        // If manifest exists in new cache location, use it
        if (fs.existsSync(MANIFEST_PATH)) {
            const data = await fs.promises.readFile(MANIFEST_PATH, "utf-8");
            return JSON.parse(data);
        }
        // One-time migration: copy from legacy Dropbox-synced location
        if (fs.existsSync(LEGACY_MANIFEST_PATH)) {
            console.error("Migrating manifest from Dropbox-synced location to ~/.cache/nanobanana-mcp/");
            const data = await retryIO(
                () => fs.promises.readFile(LEGACY_MANIFEST_PATH, "utf-8"),
                "loadManifest:migrate"
            );
            const manifest = JSON.parse(data);
            await fs.promises.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
            // Remove legacy file so Dropbox stops syncing it
            await retryIO(
                () => fs.promises.unlink(LEGACY_MANIFEST_PATH),
                "loadManifest:removeLegacy"
            ).catch(() => {}); // Best-effort removal
            console.error("Migration complete");
            return manifest;
        }
    } catch (error) {
        console.warn("Could not load manifest:", error);
    }
    return [];
}

// Save entire manifest to disk
async function saveManifest(manifest: GeneratedImage[]): Promise<void> {
    ensureOutputDir();
    await retryIO(
        () => fs.promises.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2)),
        "saveManifest"
    );
}

// Append a single image to the manifest
async function appendToManifest(image: GeneratedImage): Promise<void> {
    persistentManifest.push(image);
    await saveManifest(persistentManifest);
}

// Extract ID from filename (e.g., "generated-2024-12-13T20-12-45-123Z-a4b5c6.png" -> "generated-2024-12-13T20-12-45-123Z-a4b5c6")
function extractIdFromFilename(filename: string): string {
    return path.basename(filename, path.extname(filename));
}

// Scan existing images and create manifest entries for those not already tracked
async function scanExistingImages(): Promise<void> {
    ensureOutputDir();
    const existingIds = new Set(persistentManifest.map((img) => img.id));

    const files = await retryIO(
        () => fs.promises.readdir(OUTPUT_DIR),
        "scanExistingImages:readdir"
    );
    const imageFiles = files.filter((f) =>
        [".png", ".jpg", ".jpeg", ".gif", ".webp"].includes(
            path.extname(f).toLowerCase()
        )
    );

    for (const file of imageFiles) {
        const id = extractIdFromFilename(file);
        if (!existingIds.has(id)) {
            const filePath = path.join(OUTPUT_DIR, file);
            try {
                const stats = await retryIO(
                    () => fs.promises.stat(filePath),
                    `scanExistingImages:stat(${file})`
                );
                const image: GeneratedImage = {
                    id,
                    prompt: "(prompt not recorded - pre-existing image)",
                    path: filePath,
                    timestamp: stats.mtime.toISOString(),
                    model: "unknown",
                    type: "generation",
                };
                persistentManifest.push(image);
            } catch {
                // Skip files we can't stat (e.g. Dropbox placeholder)
                continue;
            }
        }
    }

    // Save if we added any new entries
    if (persistentManifest.length > existingIds.size) {
        await saveManifest(persistentManifest);
        console.error(
            `Scanned ${persistentManifest.length - existingIds.size} pre-existing images into manifest`
        );
    }
}

// Initialize manifest on startup
async function initializeManifest(): Promise<void> {
    persistentManifest = await loadManifest();
    await scanExistingImages();
    console.error(
        `Loaded manifest with ${persistentManifest.length} images`
    );
}

// Generate unique filename
function generateFilename(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const id = Math.random().toString(36).substring(2, 8);
    return `generated-${timestamp}-${id}.png`;
}

// Initialize Gemini client
function getGeminiClient(): GoogleGenAI {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY environment variable is required");
    }
    return new GoogleGenAI({ apiKey });
}

// Save image from base64
async function saveImage(base64Data: string, filename: string): Promise<string> {
    ensureOutputDir();
    const filePath = path.join(OUTPUT_DIR, filename);
    const buffer = Buffer.from(base64Data, "base64");
    await retryIO(() => fs.promises.writeFile(filePath, buffer), "saveImage");
    return filePath;
}

// Read image as base64
async function readImageAsBase64(imagePath: string): Promise<string> {
    const absolutePath = path.resolve(imagePath);
    if (!fs.existsSync(absolutePath)) {
        throw new Error(`Image file not found: ${absolutePath}`);
    }
    const buffer = await retryIO(
        () => fs.promises.readFile(absolutePath),
        "readImageAsBase64"
    );
    return buffer.toString("base64");
}

// Find image ID by path (checks both session and persistent history)
function findImageIdByPath(imagePath: string): string | undefined {
    const absolutePath = path.resolve(imagePath);
    // Check session history first
    const sessionMatch = sessionHistory.find((img) => img.path === absolutePath);
    if (sessionMatch) return sessionMatch.id;
    // Check persistent manifest
    const persistentMatch = persistentManifest.find((img) => img.path === absolutePath);
    if (persistentMatch) return persistentMatch.id;
    return undefined;
}

// Get mime type from file extension
function getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".gif": "image/gif",
        ".webp": "image/webp",
    };
    return mimeTypes[ext] || "image/png";
}

// Initialize MCP server
const server = new McpServer({
    name: "nanobanana-mcp",
    version: "1.1.0",
});

// Tool: Generate image from text prompt
server.tool(
    "gemini_generate_image",
    "Generate an image from a text prompt using Google Gemini",
    {
        prompt: z.string().describe("Detailed description of the image to generate"),
        model: z
            .enum([
                "gemini-3-pro-image-preview",
                "gemini-2.0-flash-exp",
                "gemini-2.0-flash-preview-image-generation",
            ])
            .default("gemini-3-pro-image-preview")
            .describe("Gemini model to use for generation. Gemini 3 Pro Image supports 4K output, advanced text rendering, and up to 14 reference images."),
        aspectRatio: z
            .enum(["1:1", "16:9", "9:16", "4:3", "3:4"])
            .optional()
            .describe("Aspect ratio for the generated image"),
        imageSize: z
            .enum(["1K", "2K", "4K"])
            .optional()
            .describe("Output resolution (Gemini 3 only). 4K for highest quality, 2K for balanced, 1K for faster generation."),
    },
    async ({ prompt, model, aspectRatio, imageSize }) => {
        try {
            const ai = getGeminiClient();

            const config: Record<string, unknown> = {
                responseModalities: [Modality.TEXT, Modality.IMAGE],
            };

            const imageConfig: Record<string, string> = {};
            if (aspectRatio) {
                imageConfig.aspectRatio = aspectRatio;
            }
            if (imageSize) {
                imageConfig.imageSize = imageSize;
            }
            if (Object.keys(imageConfig).length > 0) {
                config.imageGenerationConfig = imageConfig;
            }

            const response = await ai.models.generateContent({
                model,
                contents: prompt,
                config,
            });

            // Process response
            let savedPath: string | null = null;
            let textResponse = "";

            if (response.candidates && response.candidates[0]?.content?.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if ("text" in part && part.text) {
                        textResponse += part.text;
                    }
                    if ("inlineData" in part && part.inlineData?.data) {
                        const filename = generateFilename();
                        savedPath = await saveImage(part.inlineData.data, filename);

                        // Track in history with full metadata
                        const imageRecord: GeneratedImage = {
                            id: extractIdFromFilename(filename),
                            prompt,
                            path: savedPath,
                            timestamp: new Date().toISOString(),
                            model,
                            aspectRatio,
                            imageSize,
                            type: "generation",
                        };
                        sessionHistory.push(imageRecord);
                        lastGeneratedImage = imageRecord;
                        await appendToManifest(imageRecord);
                    }
                }
            }

            if (!savedPath) {
                return {
                    content: [
                        {
                            type: "text" as const,
                            text: "No image was generated. The model may have declined due to content policy. Try rephrasing your prompt.",
                        },
                    ],
                };
            }

            const imageId = lastGeneratedImage?.id || "unknown";
            return {
                content: [
                    {
                        type: "text" as const,
                        text: `Image generated successfully!\n\nID: ${imageId}\nSaved to: ${savedPath}\n\nModel: ${model}\nPrompt: ${prompt}${textResponse ? `\n\nModel notes: ${textResponse}` : ""}\n\nUse 'search_history' or 'get_image_by_id' to retrieve this image later.`,
                    },
                ],
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                content: [
                    {
                        type: "text" as const,
                        text: `Error generating image: ${message}`,
                    },
                ],
                isError: true,
            };
        }
    }
);

// Tool: Edit an existing image
server.tool(
    "gemini_edit_image",
    "Edit an existing image with natural language instructions",
    {
        imagePath: z.string().describe("Path to the image file to edit"),
        instructions: z.string().describe("Natural language instructions for how to edit the image"),
        model: z
            .enum([
                "gemini-3-pro-image-preview",
                "gemini-2.0-flash-exp",
                "gemini-2.0-flash-preview-image-generation",
            ])
            .default("gemini-3-pro-image-preview")
            .describe("Gemini model to use for editing. Gemini 3 Pro Image supports advanced editing capabilities."),
    },
    async ({ imagePath, instructions, model }) => {
        try {
            const ai = getGeminiClient();

            // Read the source image
            const imageBase64 = await readImageAsBase64(imagePath);
            const mimeType = getMimeType(imagePath);

            const response = await ai.models.generateContent({
                model,
                contents: [
                    {
                        role: "user",
                        parts: [
                            {
                                inlineData: {
                                    mimeType,
                                    data: imageBase64,
                                },
                            },
                            {
                                text: `Edit this image: ${instructions}`,
                            },
                        ],
                    },
                ],
                config: {
                    responseModalities: [Modality.TEXT, Modality.IMAGE],
                },
            });

            // Process response
            let savedPath: string | null = null;
            let textResponse = "";

            if (response.candidates && response.candidates[0]?.content?.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if ("text" in part && part.text) {
                        textResponse += part.text;
                    }
                    if ("inlineData" in part && part.inlineData?.data) {
                        const filename = generateFilename();
                        savedPath = await saveImage(part.inlineData.data, filename);

                        // Find parent image ID for lineage tracking
                        const parentId = findImageIdByPath(imagePath);

                        // Track in history with lineage
                        const imageRecord: GeneratedImage = {
                            id: extractIdFromFilename(filename),
                            prompt: instructions,
                            path: savedPath,
                            timestamp: new Date().toISOString(),
                            model,
                            type: "edit",
                            editedFrom: parentId,
                            sourceImagePath: path.resolve(imagePath),
                        };
                        sessionHistory.push(imageRecord);
                        lastGeneratedImage = imageRecord;
                        await appendToManifest(imageRecord);
                    }
                }
            }

            if (!savedPath) {
                return {
                    content: [
                        {
                            type: "text" as const,
                            text: "No edited image was generated. The model may have declined due to content policy or couldn't process the edit request.",
                        },
                    ],
                };
            }

            const imageId = lastGeneratedImage?.id || "unknown";
            return {
                content: [
                    {
                        type: "text" as const,
                        text: `Image edited successfully!\n\nID: ${imageId}\nOriginal: ${imagePath}\nEdited: ${savedPath}\n\nInstructions: ${instructions}${textResponse ? `\n\nModel notes: ${textResponse}` : ""}`,
                    },
                ],
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                content: [
                    {
                        type: "text" as const,
                        text: `Error editing image: ${message}`,
                    },
                ],
                isError: true,
            };
        }
    }
);

// Tool: Continue editing the last generated image
server.tool(
    "continue_editing",
    "Continue editing the last generated or edited image",
    {
        instructions: z.string().describe("Natural language instructions for additional edits"),
    },
    async ({ instructions }) => {
        if (!lastGeneratedImage) {
            return {
                content: [
                    {
                        type: "text" as const,
                        text: "No previous image to edit. Use gemini_generate_image or gemini_edit_image first.",
                    },
                ],
                isError: true,
            };
        }

        try {
            const ai = getGeminiClient();

            // Read the last generated image
            const imageBase64 = await readImageAsBase64(lastGeneratedImage.path);
            const mimeType = getMimeType(lastGeneratedImage.path);

            const response = await ai.models.generateContent({
                model: lastGeneratedImage.model,
                contents: [
                    {
                        role: "user",
                        parts: [
                            {
                                inlineData: {
                                    mimeType,
                                    data: imageBase64,
                                },
                            },
                            {
                                text: `Edit this image: ${instructions}`,
                            },
                        ],
                    },
                ],
                config: {
                    responseModalities: [Modality.TEXT, Modality.IMAGE],
                },
            });

            // Process response
            let savedPath: string | null = null;
            let textResponse = "";

            if (response.candidates && response.candidates[0]?.content?.parts) {
                for (const part of response.candidates[0].content.parts) {
                    if ("text" in part && part.text) {
                        textResponse += part.text;
                    }
                    if ("inlineData" in part && part.inlineData?.data) {
                        const filename = generateFilename();
                        savedPath = await saveImage(part.inlineData.data, filename);

                        // Track parent for lineage
                        const parentId = lastGeneratedImage.id;
                        const parentPath = lastGeneratedImage.path;

                        // Track in history with lineage
                        const imageRecord: GeneratedImage = {
                            id: extractIdFromFilename(filename),
                            prompt: instructions,
                            path: savedPath,
                            timestamp: new Date().toISOString(),
                            model: lastGeneratedImage.model,
                            type: "continue_edit",
                            editedFrom: parentId,
                            sourceImagePath: parentPath,
                        };
                        sessionHistory.push(imageRecord);
                        lastGeneratedImage = imageRecord;
                        await appendToManifest(imageRecord);
                    }
                }
            }

            if (!savedPath) {
                return {
                    content: [
                        {
                            type: "text" as const,
                            text: "No edited image was generated. Try different instructions.",
                        },
                    ],
                };
            }

            const imageId = lastGeneratedImage?.id || "unknown";
            return {
                content: [
                    {
                        type: "text" as const,
                        text: `Image edited successfully!\n\nID: ${imageId}\nSaved to: ${savedPath}\n\nInstructions: ${instructions}${textResponse ? `\n\nModel notes: ${textResponse}` : ""}`,
                    },
                ],
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
                content: [
                    {
                        type: "text" as const,
                        text: `Error editing image: ${message}`,
                    },
                ],
                isError: true,
            };
        }
    }
);

// Tool: Get image history
server.tool(
    "get_image_history",
    "List all images generated in this session",
    {},
    async () => {
        if (sessionHistory.length === 0) {
            return {
                content: [
                    {
                        type: "text" as const,
                        text: `No images have been generated in this session yet.\n\nPersistent manifest contains ${persistentManifest.length} images from previous sessions. Use 'search_history' to find them.`,
                    },
                ],
            };
        }

        const formatImage = (img: GeneratedImage, index: number): string => {
            let text = `[${index}] ${img.id}\n    Prompt: ${img.prompt}\n    Path: ${img.path}\n    Model: ${img.model}\n    Time: ${img.timestamp}`;
            if (img.editedFrom) {
                text += `\n    Edited from: ${img.editedFrom}`;
            }
            if (img.type) {
                text += `\n    Type: ${img.type}`;
            }
            return text;
        };

        const historyText = sessionHistory.map(formatImage).join("\n\n");

        return {
            content: [
                {
                    type: "text" as const,
                    text: `Session History (${sessionHistory.length} images):\n\n${historyText}\n\nPersistent manifest contains ${persistentManifest.length} total images.\nUse history:N in prompts to reference previous images.`,
                },
            ],
        };
    }
);

// Tool: Search persistent history
server.tool(
    "search_history",
    "Search all generated images by prompt text, date range, model, or ID",
    {
        query: z.string().optional().describe("Text to search for in prompts (case-insensitive)"),
        id: z.string().optional().describe("Search for a specific image ID (partial match)"),
        model: z.string().optional().describe("Filter by model name"),
        startDate: z.string().optional().describe("Filter images after this date (ISO format, e.g., 2024-12-01)"),
        endDate: z.string().optional().describe("Filter images before this date (ISO format)"),
        type: z.enum(["generation", "edit", "continue_edit"]).optional().describe("Filter by image type"),
        limit: z.number().default(20).describe("Maximum number of results to return"),
    },
    async ({ query, id, model, startDate, endDate, type, limit }) => {
        let results = [...persistentManifest];

        // Filter by query (prompt text)
        if (query) {
            const lowerQuery = query.toLowerCase();
            results = results.filter((img) =>
                img.prompt.toLowerCase().includes(lowerQuery)
            );
        }

        // Filter by ID
        if (id) {
            const lowerId = id.toLowerCase();
            results = results.filter((img) =>
                img.id.toLowerCase().includes(lowerId)
            );
        }

        // Filter by model
        if (model) {
            const lowerModel = model.toLowerCase();
            results = results.filter((img) =>
                img.model.toLowerCase().includes(lowerModel)
            );
        }

        // Filter by date range (with validation)
        if (startDate) {
            const start = new Date(startDate);
            if (isNaN(start.getTime())) {
                return {
                    content: [
                        {
                            type: "text" as const,
                            text: `Invalid startDate format: ${startDate}. Please use ISO format (e.g., 2024-12-01).`,
                        },
                    ],
                    isError: true,
                };
            }
            results = results.filter((img) => new Date(img.timestamp) >= start);
        }
        if (endDate) {
            const end = new Date(endDate);
            if (isNaN(end.getTime())) {
                return {
                    content: [
                        {
                            type: "text" as const,
                            text: `Invalid endDate format: ${endDate}. Please use ISO format (e.g., 2024-12-31).`,
                        },
                    ],
                    isError: true,
                };
            }
            results = results.filter((img) => new Date(img.timestamp) <= end);
        }

        // Filter by type
        if (type) {
            results = results.filter((img) => img.type === type);
        }

        // Sort by timestamp descending (newest first) - ISO strings sort lexicographically
        results.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

        // Limit results
        const limited = results.slice(0, limit);

        if (limited.length === 0) {
            return {
                content: [
                    {
                        type: "text" as const,
                        text: "No images found matching your search criteria.",
                    },
                ],
            };
        }

        const formatImage = (img: GeneratedImage): string => {
            let text = `ID: ${img.id}\n  Prompt: ${img.prompt}\n  Path: ${img.path}\n  Model: ${img.model}\n  Time: ${img.timestamp}`;
            if (img.editedFrom) {
                text += `\n  Edited from: ${img.editedFrom}`;
            }
            if (img.type) {
                text += `\n  Type: ${img.type}`;
            }
            return text;
        };

        const resultsText = limited.map(formatImage).join("\n\n");

        return {
            content: [
                {
                    type: "text" as const,
                    text: `Found ${results.length} images (showing ${limited.length}):\n\n${resultsText}`,
                },
            ],
        };
    }
);

// Tool: Get image by ID
server.tool(
    "get_image_by_id",
    "Get full details for a specific image by its ID",
    {
        imageId: z.string().describe("The image ID to look up"),
    },
    async ({ imageId }) => {
        const lowerId = imageId.toLowerCase();

        // Search in persistent manifest
        const image = persistentManifest.find((img) =>
            img.id.toLowerCase().includes(lowerId)
        );

        if (!image) {
            return {
                content: [
                    {
                        type: "text" as const,
                        text: `No image found with ID containing: ${imageId}`,
                    },
                ],
            };
        }

        // Check if file still exists
        const fileExists = fs.existsSync(image.path);

        // Build lineage chain (using Map for O(1) lookups)
        const lineage: string[] = [];
        let currentId: string | undefined = image.editedFrom;
        if (currentId) {
            const imageMap = new Map(persistentManifest.map((img) => [img.id, img]));
            while (currentId) {
                lineage.push(currentId);
                const parent = imageMap.get(currentId);
                currentId = parent?.editedFrom;
            }
        }

        // Find children (images edited from this one)
        const children = persistentManifest
            .filter((img) => img.editedFrom === image.id)
            .map((img) => img.id);

        let details = `Image Details:

ID: ${image.id}
Prompt: ${image.prompt}
Path: ${image.path}
File exists: ${fileExists ? "Yes" : "No (deleted)"}
Model: ${image.model}
Timestamp: ${image.timestamp}
Type: ${image.type || "unknown"}`;

        if (image.aspectRatio) {
            details += `\nAspect Ratio: ${image.aspectRatio}`;
        }
        if (image.imageSize) {
            details += `\nImage Size: ${image.imageSize}`;
        }
        if (image.editedFrom) {
            details += `\nEdited from: ${image.editedFrom}`;
        }
        if (image.sourceImagePath) {
            details += `\nSource image: ${image.sourceImagePath}`;
        }
        if (lineage.length > 0) {
            details += `\n\nLineage (ancestors): ${lineage.join(" → ")}`;
        }
        if (children.length > 0) {
            details += `\n\nChildren (edited from this): ${children.join(", ")}`;
        }

        return {
            content: [
                {
                    type: "text" as const,
                    text: details,
                },
            ],
        };
    }
);

// Start server
async function main(): Promise<void> {
    // Initialize persistent manifest before starting server
    await initializeManifest();

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("NanoBanana MCP server running on stdio");
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});

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
    timestamp: Date;
    model: string;
}

// Session state
const imageHistory: GeneratedImage[] = [];
let lastGeneratedImage: GeneratedImage | null = null;

// Output directory
const OUTPUT_DIR = path.join(os.homedir(), "Documents", "nanobanana_generated");

// Ensure output directory exists
function ensureOutputDir(): void {
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }
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
function saveImage(base64Data: string, filename: string): string {
    ensureOutputDir();
    const filePath = path.join(OUTPUT_DIR, filename);
    const buffer = Buffer.from(base64Data, "base64");
    fs.writeFileSync(filePath, buffer);
    return filePath;
}

// Read image as base64
function readImageAsBase64(imagePath: string): string {
    const absolutePath = path.resolve(imagePath);
    if (!fs.existsSync(absolutePath)) {
        throw new Error(`Image file not found: ${absolutePath}`);
    }
    const buffer = fs.readFileSync(absolutePath);
    return buffer.toString("base64");
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
    version: "1.0.0",
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
                        savedPath = saveImage(part.inlineData.data, filename);

                        // Track in history
                        const imageRecord: GeneratedImage = {
                            id: path.basename(filename, ".png"),
                            prompt,
                            path: savedPath,
                            timestamp: new Date(),
                            model,
                        };
                        imageHistory.push(imageRecord);
                        lastGeneratedImage = imageRecord;
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

            return {
                content: [
                    {
                        type: "text" as const,
                        text: `Image generated successfully!\n\nSaved to: ${savedPath}\n\nModel: ${model}\nPrompt: ${prompt}${textResponse ? `\n\nModel notes: ${textResponse}` : ""}`,
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
            const imageBase64 = readImageAsBase64(imagePath);
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
                        savedPath = saveImage(part.inlineData.data, filename);

                        // Track in history
                        const imageRecord: GeneratedImage = {
                            id: path.basename(filename, ".png"),
                            prompt: `Edit: ${instructions}`,
                            path: savedPath,
                            timestamp: new Date(),
                            model,
                        };
                        imageHistory.push(imageRecord);
                        lastGeneratedImage = imageRecord;
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

            return {
                content: [
                    {
                        type: "text" as const,
                        text: `Image edited successfully!\n\nOriginal: ${imagePath}\nEdited: ${savedPath}\n\nInstructions: ${instructions}${textResponse ? `\n\nModel notes: ${textResponse}` : ""}`,
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
            const imageBase64 = readImageAsBase64(lastGeneratedImage.path);
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
                        savedPath = saveImage(part.inlineData.data, filename);

                        // Track in history
                        const imageRecord: GeneratedImage = {
                            id: path.basename(filename, ".png"),
                            prompt: `Continue edit: ${instructions}`,
                            path: savedPath,
                            timestamp: new Date(),
                            model: lastGeneratedImage.model,
                        };
                        imageHistory.push(imageRecord);
                        lastGeneratedImage = imageRecord;
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

            return {
                content: [
                    {
                        type: "text" as const,
                        text: `Image edited successfully!\n\nSaved to: ${savedPath}\n\nInstructions: ${instructions}${textResponse ? `\n\nModel notes: ${textResponse}` : ""}`,
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
        if (imageHistory.length === 0) {
            return {
                content: [
                    {
                        type: "text" as const,
                        text: "No images have been generated in this session yet.",
                    },
                ],
            };
        }

        const historyText = imageHistory
            .map((img, index) => {
                return `[${index}] ${img.id}\n    Prompt: ${img.prompt}\n    Path: ${img.path}\n    Model: ${img.model}\n    Time: ${img.timestamp.toISOString()}`;
            })
            .join("\n\n");

        return {
            content: [
                {
                    type: "text" as const,
                    text: `Image History (${imageHistory.length} images):\n\n${historyText}\n\nUse history:N in prompts to reference previous images.`,
                },
            ],
        };
    }
);

// Start server
async function main(): Promise<void> {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("NanoBanana MCP server running on stdio");
}

main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});

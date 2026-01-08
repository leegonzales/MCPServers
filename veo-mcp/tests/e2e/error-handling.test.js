/**
 * E2E Tests: Error Handling
 *
 * Tests that verify error cases are handled properly.
 * These tests are faster since they trigger errors quickly.
 */

import { describe, it, before } from "node:test";
import assert from "node:assert";
import { GoogleGenAI } from "@google/genai";
import {
    generateVideo,
    generateFromImage,
    getClient
} from "../helpers/veo-client.js";

describe("error-handling", { timeout: 60000 }, () => {
    before(() => {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error("GEMINI_API_KEY must be set to run E2E tests");
        }
    });

    it("missing-api-key: should fail with clear message", async () => {
        // Temporarily remove API key
        const savedKey = process.env.GEMINI_API_KEY;
        delete process.env.GEMINI_API_KEY;

        try {
            await assert.rejects(
                async () => getClient(),
                /GEMINI_API_KEY.*required/i
            );
        } finally {
            // Restore API key
            process.env.GEMINI_API_KEY = savedKey;
        }
    });

    it("invalid-api-key: should fail with auth error", async () => {
        const ai = new GoogleGenAI({ apiKey: "invalid-key-12345" });

        await assert.rejects(
            async () => {
                await ai.models.generateVideos({
                    model: "veo-3.1-generate-preview",
                    source: { prompt: "Test" },
                    config: { durationSeconds: 4 }
                });
            },
            (err) => {
                // Should be an auth error
                return err.message.includes("401") ||
                       err.message.includes("API key") ||
                       err.message.includes("authentication") ||
                       err.message.includes("UNAUTHENTICATED");
            }
        );
    });

    it("invalid-image-path: should fail with clear message", async () => {
        await assert.rejects(
            async () => {
                await generateFromImage({
                    imagePath: "/nonexistent/path/to/image.jpg",
                    prompt: "Animate this"
                });
            },
            /not found|does not exist/i
        );
    });

    it("invalid-model: should fail with model error", async () => {
        const ai = getClient();

        await assert.rejects(
            async () => {
                await ai.models.generateVideos({
                    model: "nonexistent-model-12345",
                    source: { prompt: "Test" },
                    config: { durationSeconds: 4 }
                });
            },
            (err) => {
                // Should indicate model not found
                return err.message.includes("404") ||
                       err.message.includes("not found") ||
                       err.message.includes("model");
            }
        );
    });

    // Note: Content policy test commented out to avoid triggering safety systems
    // Uncomment and run manually if needed
    /*
    it("content-policy: should fail with policy error", async () => {
        await assert.rejects(
            async () => {
                await generateVideo({
                    prompt: "Violent content that violates policy",
                    duration: 4
                });
            },
            /policy|blocked|safety|filtered/i
        );
    });
    */
});

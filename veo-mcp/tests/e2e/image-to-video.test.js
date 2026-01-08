/**
 * E2E Tests: Image-to-Video Generation
 *
 * IMPORTANT: These tests require test images in tests/fixtures/images/
 * Run sparingly with: npm run test:e2e
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import {
    generateFromImage,
    generateTransition,
    ensureOutputDir
} from "../helpers/veo-client.js";

// Track generated files for cleanup
const generatedFiles = [];

// Path to test fixtures
const FIXTURES_DIR = new URL("../fixtures/images", import.meta.url).pathname;

describe("veo_generate_from_image", { timeout: 300000 }, () => {
    let hasFixtures = false;

    before(() => {
        if (!process.env.GEMINI_API_KEY) {
            throw new Error("GEMINI_API_KEY must be set to run E2E tests");
        }
        ensureOutputDir();

        // Check if we have test fixtures
        hasFixtures = fs.existsSync(FIXTURES_DIR) &&
                      fs.readdirSync(FIXTURES_DIR).length > 0;

        if (!hasFixtures) {
            console.log("\n  SKIP: No test fixtures found in tests/fixtures/images/");
            console.log("  To run image tests, add:");
            console.log("    - landscape.jpg (1920x1080 nature scene)");
            console.log("    - portrait.png (1080x1920 close-up)");
            console.log("    - day-scene.jpg (daytime cityscape)");
            console.log("    - night-scene.jpg (same city at night)\n");
        }
    });

    after(() => {
        console.log(`Generated ${generatedFiles.length} test videos`);
    });

    it("animate-landscape: animates a landscape image", async (t) => {
        const imagePath = path.join(FIXTURES_DIR, "landscape.jpg");

        if (!fs.existsSync(imagePath)) {
            t.skip("Fixture not found: landscape.jpg");
            return;
        }

        const result = await generateFromImage({
            imagePath,
            prompt: "Clouds slowly drifting across the sky, gentle breeze moving trees",
            duration: 4,
            onProgress: (attempt, max) => console.log(`  Polling ${attempt}/${max}...`)
        });

        generatedFiles.push(result.path);

        assert.ok(result.path, "Video path should be returned");
        assert.ok(fs.existsSync(result.path), "Video file should exist");
        assert.ok(result.size > 0, "Video should have content");

        console.log(`  Generated: ${result.path}`);
        console.log(`  Size: ${(result.size / 1024 / 1024).toFixed(2)} MB`);
    });

    it("animate-portrait: animates a portrait image", async (t) => {
        const imagePath = path.join(FIXTURES_DIR, "portrait.png");

        if (!fs.existsSync(imagePath)) {
            t.skip("Fixture not found: portrait.png");
            return;
        }

        const result = await generateFromImage({
            imagePath,
            prompt: "Slight camera movement, shallow depth of field, subtle breathing motion",
            duration: 4,
            onProgress: (attempt, max) => console.log(`  Polling ${attempt}/${max}...`)
        });

        generatedFiles.push(result.path);

        assert.ok(fs.existsSync(result.path), "Video file should exist");
        console.log(`  Generated: ${result.path}`);
    });
});

describe("veo_generate_transition", { timeout: 300000 }, () => {
    let hasFixtures = false;

    before(() => {
        ensureOutputDir();
        const dayPath = path.join(FIXTURES_DIR, "day-scene.jpg");
        const nightPath = path.join(FIXTURES_DIR, "night-scene.jpg");
        hasFixtures = fs.existsSync(dayPath) && fs.existsSync(nightPath);

        if (!hasFixtures) {
            console.log("\n  SKIP: Transition fixtures not found");
            console.log("  Add day-scene.jpg and night-scene.jpg to tests/fixtures/images/\n");
        }
    });

    it("day-to-night: creates smooth time-lapse transition", async (t) => {
        const firstFrame = path.join(FIXTURES_DIR, "day-scene.jpg");
        const lastFrame = path.join(FIXTURES_DIR, "night-scene.jpg");

        if (!fs.existsSync(firstFrame) || !fs.existsSync(lastFrame)) {
            t.skip("Fixtures not found: day-scene.jpg, night-scene.jpg");
            return;
        }

        const result = await generateTransition({
            firstFrame,
            lastFrame,
            prompt: "Time-lapse of city transitioning from day to night, shadows lengthen, lights turn on gradually",
            duration: 8,
            onProgress: (attempt, max) => console.log(`  Polling ${attempt}/${max}...`)
        });

        generatedFiles.push(result.path);

        assert.ok(result.path, "Video path should be returned");
        assert.ok(fs.existsSync(result.path), "Video file should exist");
        assert.ok(result.size > 0, "Video should have content");

        console.log(`  Generated transition: ${result.path}`);
        console.log(`  Size: ${(result.size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  Time: ${(result.generationTime / 1000).toFixed(1)}s`);
    });
});

# Veo 3.1 MCP Server Specification

**Project:** veo-mcp
**Companion to:** Veo3Prompter skill in AISkills
**Pattern:** Mirrors nanobanana-mcp structure
**API Key:** Uses same GEMINI_API_KEY (no new key needed!)

---

## Overview

Build an MCP server for Google Veo 3.1 video generation that pairs with the `veo3-prompter` skill. While the skill helps users craft professional video prompts, this MCP server executes those prompts to generate actual videos.

---

## Key API Facts

### Authentication
- **Same API key as Nano Banana** - Uses `GEMINI_API_KEY` environment variable
- Accessible via same `@google/genai` SDK

### Model IDs
| Model | Speed | Quality | Audio |
|-------|-------|---------|-------|
| `veo-3.1-generate-preview` | Standard | Highest | Native audio |
| `veo-3.1-fast-generate-preview` | Fast | Good | Native audio |
| `veo-3.0-generate-001` | Standard | High | Native audio |
| `veo-3.0-fast-generate-001` | Fast | Good | Native audio |

### Video Specifications
- **Duration:** 4, 6, or 8 seconds (selectable)
- **Resolution:** 720p (default), 1080p (Veo 3.x only)
- **Aspect Ratio:** 16:9 (landscape), 9:16 (portrait)
- **Frame Rate:** 24 FPS
- **Format:** MP4

### Key Differences from Image Generation
1. **Asynchronous operation** - Video generation returns a long-running operation
2. **Polling required** - Must poll operation status until complete
3. **Longer generation time** - Typically 30-90 seconds per video
4. **Native audio** - Veo 3.x generates synchronized audio automatically

---

## Project Structure

```
veo-mcp/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   └── index.ts
└── dist/
    └── (compiled JS)
```

---

## package.json

```json
{
  "name": "veo-mcp",
  "version": "1.0.0",
  "description": "MCP server for AI video generation using Google Veo 3.1",
  "main": "dist/index.js",
  "bin": {
    "veo-mcp": "dist/index.js"
  },
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsc --watch",
    "prepublishOnly": "npm run build"
  },
  "keywords": [
    "mcp",
    "model-context-protocol",
    "veo",
    "gemini",
    "video-generation",
    "ai",
    "claude"
  ],
  "author": "Lee Gonzales",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/leegonzales/MCPServers.git",
    "directory": "veo-mcp"
  },
  "dependencies": {
    "@google/genai": "^1.0.0",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0"
  },
  "engines": {
    "node": ">=18"
  },
  "files": [
    "dist",
    "README.md"
  ]
}
```

---

## Tools to Implement

### 1. `veo_generate_video` (Primary Tool)

Generate a video from a text prompt.

**Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `prompt` | string | Yes | - | Detailed video description |
| `model` | enum | No | `veo-3.1-generate-preview` | Model to use |
| `aspectRatio` | enum | No | `16:9` | `16:9` or `9:16` |
| `duration` | enum | No | `8` | `4`, `6`, or `8` seconds |
| `resolution` | enum | No | `720p` | `720p` or `1080p` |
| `negativePrompt` | string | No | - | Elements to exclude |

**Implementation Notes:**
- Call `client.models.generate_videos()` method
- Video generation returns an async operation
- Poll operation every 10-15 seconds until done
- Save resulting video to output directory
- Return path and metadata

### 2. `veo_generate_from_image`

Animate a still image with motion.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `imagePath` | string | Yes | Path to source image |
| `prompt` | string | Yes | Description of desired motion |
| `duration` | enum | No | Video duration |
| `model` | enum | No | Model to use |

**Implementation Notes:**
- Read image as base64
- Include image in request along with prompt
- Handle same async polling as text-to-video

### 3. `veo_generate_transition`

Generate video transitioning between two frames.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `firstFrame` | string | Yes | Path to starting image |
| `lastFrame` | string | Yes | Path to ending image |
| `prompt` | string | Yes | Transition description |
| `duration` | enum | No | Video duration |

**Implementation Notes:**
- Uses first/last frame feature of Veo 3.1
- Model interpolates motion between frames
- Excellent for transformations and morphs

### 4. `veo_extend_video`

Extend a previously generated Veo video.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `videoPath` | string | Yes | Path to Veo-generated video |
| `prompt` | string | Yes | Continuation description |

**Implementation Notes:**
- Can extend by 7 seconds per call
- Up to 20 extensions (~148 seconds total)
- Only works with Veo-generated videos
- Track extension count in metadata

### 5. `veo_get_video_history`

List all videos generated in this session.

**Returns:** Array of video records with prompt, path, duration, timestamp.

### 6. `veo_check_operation_status`

Check status of a running video generation operation.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `operationId` | string | Yes | Operation ID from pending generation |

**Implementation Notes:**
- For checking long-running operations
- Returns progress/completion status

---

## Core Implementation Details

### Gemini Client Setup

```typescript
import { GoogleGenAI } from "@google/genai";

function getGeminiClient(): GoogleGenAI {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY environment variable is required");
    }
    return new GoogleGenAI({ apiKey });
}
```

### Video Generation API Pattern

```typescript
import { GoogleGenAI } from "@google/genai";
import type { GenerateVideosConfig } from "@google/genai/types";

async function generateVideo(
    prompt: string,
    config: GenerateVideosConfig
): Promise<string> {
    const client = getGeminiClient();

    // Start generation (returns operation)
    const operation = await client.models.generateVideos({
        model: "veo-3.1-generate-preview",
        prompt: prompt,
        config: {
            aspectRatio: config.aspectRatio || "16:9",
            // durationSeconds: config.durationSeconds || 8,
            // Note: Check current SDK for exact parameter names
        },
    });

    // Poll until complete
    while (!operation.done) {
        await sleep(10000); // 10 second intervals
        operation = await client.operations.get(operation);
    }

    // Extract and save video
    if (operation.response?.generatedVideos?.[0]?.video) {
        const video = operation.response.generatedVideos[0].video;
        // Download and save video
        const savedPath = await saveVideo(video);
        return savedPath;
    }

    throw new Error("No video generated");
}
```

### Polling Implementation

```typescript
const MAX_POLL_ATTEMPTS = 60; // ~10 minutes max
const POLL_INTERVAL_MS = 10000; // 10 seconds

async function waitForOperation(operation: Operation): Promise<Operation> {
    let attempts = 0;

    while (!operation.done && attempts < MAX_POLL_ATTEMPTS) {
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
        operation = await client.operations.get(operation);
        attempts++;

        // Optional: Log progress
        console.error(`Polling attempt ${attempts}/${MAX_POLL_ATTEMPTS}`);
    }

    if (!operation.done) {
        throw new Error("Video generation timed out");
    }

    return operation;
}
```

### Video Storage

```typescript
const OUTPUT_DIR = path.join(os.homedir(), "Documents", "veo_generated");

function generateFilename(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const id = Math.random().toString(36).substring(2, 8);
    return `video-${timestamp}-${id}.mp4`;
}

async function saveVideo(videoData: VideoData): Promise<string> {
    ensureOutputDir();
    const filename = generateFilename();
    const filePath = path.join(OUTPUT_DIR, filename);

    // Download video file from operation result
    // Implementation depends on SDK response format
    await downloadAndSave(videoData, filePath);

    return filePath;
}
```

---

## Session State

```typescript
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
    extensionCount: number; // Track for extend limits
}

const videoHistory: GeneratedVideo[] = [];
let lastGeneratedVideo: GeneratedVideo | null = null;
```

---

## Error Handling

### Common Errors to Handle

1. **Rate Limiting**
   - Implement exponential backoff
   - Suggest waiting before retry

2. **Content Policy Violation**
   - Catch policy blocks
   - Suggest prompt modification

3. **Timeout**
   - Video generation can take 30-90 seconds
   - Provide progress updates if possible

4. **Invalid Input**
   - Validate image formats (JPEG, PNG, WebP)
   - Validate video formats for extension

5. **API Key Issues**
   - Clear error message about missing key
   - Suggest AI Studio for key generation

---

## Claude Code Integration

### Add to ~/.claude/settings.json

```json
{
  "mcpServers": {
    "veo": {
      "command": "npx",
      "args": ["-y", "veo-mcp"],
      "env": {
        "GEMINI_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Or for local development:

```json
{
  "mcpServers": {
    "veo": {
      "command": "node",
      "args": ["/path/to/veo-mcp/dist/index.js"],
      "env": {
        "GEMINI_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

---

## README.md Template

```markdown
# Veo MCP Server

MCP server for AI video generation using Google Veo 3.1.

## Features

- Text-to-video generation with native audio
- Image-to-video animation
- First/last frame transitions
- Video extension (up to ~148 seconds)
- Session history tracking

## Installation

### Quick Install (npx)

\`\`\`bash
claude mcp add veo --env GEMINI_API_KEY=your-key-here -- npx -y veo-mcp
\`\`\`

### Manual Setup

Add to ~/.claude/settings.json:

\`\`\`json
{
  "mcpServers": {
    "veo": {
      "command": "npx",
      "args": ["-y", "veo-mcp"],
      "env": {
        "GEMINI_API_KEY": "your-api-key-here"
      }
    }
  }
}
\`\`\`

## Getting an API Key

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Sign in with Google account
3. Click "Get API Key" → "Create API Key"
4. Copy and add to configuration

**Note:** Same API key works for both image (Nano Banana) and video (Veo) generation!

## Available Tools

| Tool | Description |
|------|-------------|
| \`veo_generate_video\` | Generate video from text prompt |
| \`veo_generate_from_image\` | Animate a still image |
| \`veo_generate_transition\` | Create video between two frames |
| \`veo_extend_video\` | Extend a Veo-generated video |
| \`veo_get_video_history\` | List generated videos |
| \`veo_check_operation_status\` | Check pending generation |

## Example Usage

"Generate a video of a sunset over mountains with birds flying"

"Animate this image of a waterfall to show flowing water"

"Create a transition from day to night in this cityscape"

## Output

Videos save to: \`~/Documents/veo_generated/\`

Format: MP4, 24fps, up to 1080p

## Companion Skill

For help crafting effective video prompts, use the **veo3-prompter** skill
in the AISkills collection.

## License

MIT
```

---

## Testing Checklist

- [ ] Text-to-video basic generation
- [ ] Multiple aspect ratios (16:9, 9:16)
- [ ] Multiple durations (4s, 6s, 8s)
- [ ] Resolution options (720p, 1080p)
- [ ] Image-to-video animation
- [ ] First/last frame transition
- [ ] Video extension
- [ ] Negative prompt exclusion
- [ ] Operation status checking
- [ ] History tracking
- [ ] Error handling (rate limits, policy)
- [ ] Output directory creation
- [ ] File naming and metadata

---

## Implementation Order

1. **Phase 1: Core Text-to-Video**
   - Basic `veo_generate_video` tool
   - Async operation handling
   - File saving and history

2. **Phase 2: Image Input Features**
   - `veo_generate_from_image`
   - `veo_generate_transition`
   - Image reading utilities

3. **Phase 3: Advanced Features**
   - `veo_extend_video`
   - `veo_check_operation_status`
   - Enhanced error handling

4. **Phase 4: Polish**
   - README documentation
   - npm publish preparation
   - Integration testing

---

## Notes for Implementation

1. **Verify SDK API** - The `@google/genai` SDK evolves. Check current documentation for exact method names and response formats.

2. **Handle Long Polls** - Video generation takes 30-90 seconds. Consider:
   - Progress logging to stderr
   - Reasonable timeout limits
   - Non-blocking operation checks

3. **File Handling** - Videos are larger than images. Consider:
   - Streaming downloads if possible
   - Disk space awareness
   - Cleanup of failed generations

4. **Skill Integration** - This server pairs with `veo3-prompter` skill:
   - Skill helps craft prompts
   - MCP server executes prompts
   - Combined: prompt guidance + generation capability

---

## API Reference Links

- [Gemini API Video Docs](https://ai.google.dev/gemini-api/docs/video)
- [Vertex AI Veo Reference](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/veo-video-generation)
- [Google GenAI SDK](https://www.npmjs.com/package/@google/genai)
- [MCP SDK](https://modelcontextprotocol.io/introduction)

---

**Spec Version:** 1.0
**Created:** 2025-12-12
**Status:** Ready for implementation

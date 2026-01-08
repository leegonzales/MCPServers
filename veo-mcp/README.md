# Veo MCP Server

MCP server for AI video generation using Google Veo 3.1.

## Features

- **Text-to-video generation** with native audio
- **Image-to-video animation** - bring still images to life
- **First/last frame transitions** - interpolate motion between two frames
- **Video extension** - extend videos up to ~148 seconds (20 extensions)
- **Background mode** - non-blocking generation with status polling
- **Session history** - track all generated videos
- **Cleanup tools** - manage disk space

## Installation

### Quick Install (npx)

```bash
claude mcp add veo --env GEMINI_API_KEY=your-key-here -- npx -y veo-mcp
```

### Manual Setup

Add to `~/.claude/settings.json`:

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

### Local Development

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

## Getting an API Key

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Sign in with your Google account
3. Click "Get API Key" → "Create API Key"
4. Copy and add to your configuration

**Note:** The same `GEMINI_API_KEY` works for both image generation (Nano Banana) and video generation (Veo)!

## Available Tools

| Tool | Description |
|------|-------------|
| `veo_generate_video` | Generate video from text prompt |
| `veo_generate_from_image` | Animate a still image with motion |
| `veo_generate_transition` | Create video transitioning between two frames |
| `veo_extend_video` | Extend a Veo-generated video by 7 seconds |
| `veo_get_video_history` | List all videos generated in session |
| `veo_check_operation_status` | Check status of background generation |
| `veo_cleanup` | Delete generated videos to free disk space |

## Parameters

### veo_generate_video

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `prompt` | string | required | Detailed video description |
| `model` | string | veo-3.1-generate-preview | Model to use |
| `aspectRatio` | string | 16:9 | `16:9` (landscape) or `9:16` (portrait) |
| `duration` | string | 8 | `4`, `6`, or `8` seconds |
| `resolution` | string | 720p | `720p` or `1080p` |
| `negativePrompt` | string | - | Elements to exclude |
| `seed` | number | - | RNG seed for reproducible results |
| `enhancePrompt` | boolean | - | Let model improve your prompt |
| `generateAudio` | boolean | true | Generate synchronized audio |
| `background` | boolean | false | Return immediately with operation ID |

### veo_generate_from_image

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `imagePath` | string | required | Path to source image (PNG/JPEG/WebP) |
| `prompt` | string | required | Description of desired motion |
| `model` | string | veo-3.1-generate-preview | Model to use |
| `duration` | string | 8 | `4`, `6`, or `8` seconds |
| `background` | boolean | false | Return immediately |

### veo_generate_transition

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `firstFrame` | string | required | Path to starting image |
| `lastFrame` | string | required | Path to ending image |
| `prompt` | string | required | Transition description |
| `model` | string | veo-3.1-generate-preview | Model to use |
| `duration` | string | 8 | `4`, `6`, or `8` seconds |
| `background` | boolean | false | Return immediately |

## Example Usage

### Basic Text-to-Video

```
"Generate a video of a sunset over mountains with birds flying"
```

### Image Animation

```
"Animate this image of a waterfall to show flowing water"
```

With path:
```
veo_generate_from_image({
  imagePath: "/path/to/waterfall.jpg",
  prompt: "Water cascades down the rocks, mist rises, birds fly past"
})
```

### Frame Transition

```
"Create a transition from day to night in this cityscape"
```

With paths:
```
veo_generate_transition({
  firstFrame: "/path/to/city_day.jpg",
  lastFrame: "/path/to/city_night.jpg",
  prompt: "Time-lapse of city transitioning from day to night, lights turn on"
})
```

### Background Generation

For long-running generations, use background mode:

```
veo_generate_video({
  prompt: "Epic battle scene with dragons",
  background: true
})
// Returns: operation ID

// Check later:
veo_check_operation_status({ operationId: "..." })
```

## Output

Videos save to: `~/Documents/veo_generated/`

Format: MP4, 24 FPS, up to 1080p

## Supported Models

| Model | Speed | Quality | Audio |
|-------|-------|---------|-------|
| `veo-3.1-generate-preview` | Standard | Highest | Native |
| `veo-3.1-fast-generate-preview` | Fast | Good | Native |
| `veo-3.0-generate-001` | Standard | High | Native |
| `veo-3.0-fast-generate-001` | Fast | Good | Native |
| `veo-2.0-generate-001` | Standard | High | Native |

## Video Specifications

- **Duration:** 4, 6, or 8 seconds
- **Resolution:** 720p or 1080p (model-dependent)
- **Aspect Ratio:** 16:9 (landscape), 9:16 (portrait)
- **Frame Rate:** 24 FPS
- **Format:** MP4 with synchronized audio

## Companion Skill

For help crafting effective video prompts, use the **veo3-prompter** skill from the [AISkills collection](https://github.com/leegonzales/AISkills).

The skill provides:
- **Five-element prompt formula** - Cinematography + Subject + Action + Context + Style & Audio
- **Audio direction** - Dialogue, SFX, ambient noise, music cues
- **Timestamp prompting** - Multi-shot choreography in single generations
- **Camera vocabulary** - Complete cinematography term glossary
- **20+ example prompts** - Categorized across genres

**Workflow:**
1. Use `veo3-prompter` skill to craft professional prompts
2. Use `veo-mcp` server to generate the actual videos

## Technical Notes

### Generation Time

Videos typically take 30-90 seconds to generate. For impatient users, use `background: true` and poll with `veo_check_operation_status`.

### Video Extension Limits

- Each extension adds ~7 seconds
- Maximum 20 extensions per video (~148 seconds total)
- Only works with videos generated by Veo in the current session

### Disk Space

Video files range from 5-50MB. Use `veo_cleanup` to delete old videos:

```
// Delete specific video
veo_cleanup({ videoId: "video-id" })

// Delete all session videos
veo_cleanup({ all: true })
```

## License

MIT

---

Part of [MCPServers](https://github.com/leegonzales/MCPServers) | Companion to [veo3-prompter skill](https://github.com/leegonzales/AISkills)

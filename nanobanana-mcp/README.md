# nanobanana-mcp

MCP server for AI image generation using Google Gemini's native image generation capabilities (Nano Banana).

## Features

- **Text-to-Image Generation** - Create images from detailed text prompts
- **Image Editing** - Modify existing images with natural language instructions
- **Iterative Refinement** - Continue editing the last generated image
- **Persistent History** - All prompts and metadata saved to `manifest.json` across sessions
- **Search & Retrieval** - Find past images by prompt, date, model, or ID
- **Edit Lineage Tracking** - Track parent-child relationships across edits

## Prerequisites

1. **Google Gemini API Key** - Get one free from [Google AI Studio](https://aistudio.google.com/)
2. **Node.js 18+**

## Installation

### Claude Code CLI (Recommended)

```bash
claude mcp add nano-banana --env GEMINI_API_KEY=your-key-here -- npx -y nanobanana-mcp
```

### Manual Configuration

Add to `~/.claude/settings.json`:

```json
{
  "mcpServers": {
    "nano-banana": {
      "command": "npx",
      "args": ["-y", "nanobanana-mcp"],
      "env": {
        "GEMINI_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

## Available Tools

### `gemini_generate_image`

Generate a new image from a text prompt.

**Parameters:**
- `prompt` (required) - Detailed description of the image to generate
- `model` (optional) - `gemini-2.0-flash-exp` (default) or `gemini-2.0-flash-preview-image-generation`
- `aspectRatio` (optional) - `1:1`, `16:9`, `9:16`, `4:3`, `3:4`

**Example:**
```
Generate an image of a cozy coffee shop interior, watercolor illustration style, warm lighting
```

### `gemini_edit_image`

Edit an existing image with natural language instructions.

**Parameters:**
- `imagePath` (required) - Path to the image file to edit
- `instructions` (required) - Natural language instructions for the edit
- `model` (optional) - Gemini model to use

**Example:**
```
Edit ~/photos/portrait.jpg: Add a sunset background and warm color grading
```

### `continue_editing`

Continue editing the last generated or edited image.

**Parameters:**
- `instructions` (required) - Additional editing instructions

**Example:**
```
Make the lighting warmer and add more detail to the background
```

### `get_image_history`

List all images generated in the current session. Shows session count and total persistent manifest count.

### `search_history`

Search all generated images across sessions.

**Parameters:**
- `query` (optional) - Text to search for in prompts (case-insensitive)
- `id` (optional) - Search for a specific image ID (partial match)
- `model` (optional) - Filter by model name
- `startDate` (optional) - Filter images after this date (ISO format, e.g., 2024-12-01)
- `endDate` (optional) - Filter images before this date (ISO format, e.g., 2024-12-31)
- `type` (optional) - Filter by type: `generation`, `edit`, or `continue_edit`
- `limit` (optional) - Maximum results (default: 20)

**Examples:**
```
# Find all sunset images
search_history(query="sunset")

# Find images from December 2024
search_history(startDate="2024-12-01", endDate="2024-12-31")

# Find edited images only
search_history(type="edit", limit=10)
```

### `get_image_by_id`

Get full details for a specific image including edit lineage.

**Parameters:**
- `imageId` (required) - The image ID to look up (partial match supported)

**Returns:**
- Full prompt used
- All generation settings (model, aspectRatio, imageSize)
- Edit lineage (ancestors and children)
- File existence check

## Output

Generated images are saved to:
```
~/Documents/nanobanana_generated/
```

**Files:**
- `generated-{timestamp}-{id}.png` - Image files
- `manifest.json` - Persistent metadata for all images

**Manifest entry structure:**
```json
{
  "id": "generated-2024-12-13T20-12-45-123Z-a4b5c6",
  "prompt": "A futuristic city at sunset",
  "path": "/Users/.../generated-2024-12-13T20-12-45-123Z-a4b5c6.png",
  "timestamp": "2024-12-13T20:12:45.123Z",
  "model": "gemini-3-pro-image-preview",
  "aspectRatio": "16:9",
  "imageSize": "4K",
  "type": "generation",
  "editedFrom": null,
  "sourceImagePath": null
}
```

For edited images, `editedFrom` contains the parent image ID and `sourceImagePath` contains the original image path.

## Prompting Tips

### Structure your prompts:
```
[Subject] + [Style] + [Details] + [Technical Specs]
```

### Example prompts:

**Photorealistic:**
> A golden retriever puppy in a sunlit meadow, DSLR quality, shallow depth of field, golden hour lighting

**Artistic:**
> Ancient Japanese temple in autumn, watercolor painting style, soft muted colors, misty atmosphere

**With text:**
> Vintage movie poster for "COSMIC ADVENTURE" with bold retro typography, 1970s sci-fi aesthetic

## Models

| Model | Speed | Best For |
|-------|-------|----------|
| `gemini-3-pro-image-preview` | Slower | **Default.** Highest quality, 4K output, best text rendering |
| `gemini-2.0-flash-exp` | Fast | Most use cases, iteration |
| `gemini-2.0-flash-preview-image-generation` | Medium | Higher quality output |

## Development

```bash
# Clone and install
cd nanobanana-mcp
npm install

# Build
npm run build

# Test locally
GEMINI_API_KEY=your-key node dist/index.js
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "API key invalid" | Verify key at [AI Studio](https://aistudio.google.com/) |
| "Rate limited" | Wait 60s, or check API quotas |
| "MCP not connected" | Restart Claude Code |
| "No image generated" | Content policy - try rephrasing prompt |

## Companion Skill: Nano Banana Pro

This MCP server is designed to work with the **Nano Banana Pro** Claude Code skill, which adds smart prompting, iterative editing workflows, and automatic model selection on top of the raw MCP tools.

**What the skill adds:**
- Crafted prompt engineering for photorealistic, artistic, and text-heavy images
- Automatic 4K output with Gemini 3 Pro for maximum quality
- Iterative editing workflows with conversation history
- Consistent character generation across multiple images

**Install the skill:**
```bash
claude skill add nano-banana
```

The MCP server handles the Gemini API calls; the skill handles the UX. Use both together for best results.

## License

MIT

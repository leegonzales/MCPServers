# nanobanana-mcp

MCP server for AI image generation using Google Gemini's native image generation capabilities (Nano Banana).

## Features

- **Text-to-Image Generation** - Create images from detailed text prompts
- **Image Editing** - Modify existing images with natural language instructions
- **Iterative Refinement** - Continue editing the last generated image
- **Session History** - Track all generated images in a session

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

List all images generated in the current session.

## Output

Generated images are saved to:
```
~/Documents/nanobanana_generated/
```

Filename format: `generated-{timestamp}-{id}.png`

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

## License

MIT

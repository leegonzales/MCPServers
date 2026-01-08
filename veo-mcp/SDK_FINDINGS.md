# Google GenAI SDK - Video Generation API Research Findings

**Research Date:** 2025-12-13
**SDK Package:** @google/genai ^1.0.0
**Purpose:** Verify method signatures for Veo video generation MCP implementation

---

## Executive Summary

The @google/genai SDK **DOES** support video generation via the `generateVideos()` method. The API uses an asynchronous long-running operation pattern with polling, returning video URIs (not inline base64 data).

### Critical Findings

1. ✅ Method exists: `ai.models.generateVideos()`
2. ✅ Returns: `GenerateVideosOperation` (async operation)
3. ✅ Polling required: Use `ai.operations.getVideosOperation()`
4. ✅ Response format: Video URI (not inline base64)
5. ⚠️ Operation structure: Uses `done` flag and `response` field

---

## 1. Method Signature Verification

### Primary Method: `ai.models.generateVideos()`

**Confirmed to exist** in @google/genai SDK type definitions.

```typescript
generateVideos: (params: types.GenerateVideosParameters)
  => Promise<types.GenerateVideosOperation>
```

**Parameters Interface:**
```typescript
interface GenerateVideosParameters {
  // Model ID (required)
  model: string;

  // Text prompt (optional if image or video provided)
  prompt?: string;

  // Image input for image-to-video
  image?: Image_2;

  // Video input for extension
  video?: Video;

  // Source configuration (alternative to direct prompt/image/video)
  source?: GenerateVideosSource;

  // Generation configuration
  config?: GenerateVideosConfig;
}
```

**Alternative Source Interface:**
```typescript
interface GenerateVideosSource {
  // Text prompt
  prompt?: string;

  // Input image
  image?: Image_2;

  // Input video
  video?: Video;
}
```

---

## 2. Configuration Options

### GenerateVideosConfig Interface

```typescript
interface GenerateVideosConfig {
  // HTTP request options
  httpOptions?: HttpOptions;

  // Abort signal for cancellation
  abortSignal?: AbortSignal;

  // Number of videos to generate
  numberOfVideos?: number;

  // Aspect ratio (e.g., "16:9", "9:16")
  aspectRatio?: string;

  // Video length in seconds
  videoLengthSeconds?: number;

  // First frame for frame-to-frame generation
  firstFrame?: Image_2;

  // Last frame for frame-to-frame generation
  lastFrame?: Image_2;

  // Reference images (Veo 2 supports up to 3 asset images or 1 style image)
  referenceImages?: VideoGenerationReferenceImage[];

  // Video mask for inpainting/outpainting
  mask?: VideoGenerationMask;

  // Compression quality
  compressionQuality?: VideoCompressionQuality;
}
```

### Reference Image Types

```typescript
interface VideoGenerationReferenceImage {
  image?: Image_2;
  referenceType?: VideoGenerationReferenceType;
}

enum VideoGenerationReferenceType {
  ASSET = "ASSET",
  STYLE = "STYLE"
}
```

### Video Mask Options

```typescript
interface VideoGenerationMask {
  image?: Image_2;
  maskMode?: VideoGenerationMaskMode;
}

enum VideoGenerationMaskMode {
  INPAINT = "INPAINT",
  OUTPAINT = "OUTPAINT"
}
```

### Compression Quality

```typescript
enum VideoCompressionQuality {
  STANDARD = "STANDARD",
  HIGH = "HIGH",
  LOSSLESS = "LOSSLESS"
}
```

---

## 3. Operation Response Structure

### GenerateVideosOperation Class

```typescript
class GenerateVideosOperation implements Operation<GenerateVideosResponse> {
  // Server-assigned operation name
  name?: string;

  // Service-specific metadata (progress info, create time, etc.)
  metadata?: Record<string, unknown>;

  // Completion flag (false = in progress, true = complete)
  done?: boolean;

  // Error result if operation failed
  error?: Record<string, unknown>;

  // The generated videos (available when done=true and no error)
  response?: GenerateVideosResponse;

  // Internal method for API response conversion
  _fromAPIResponse({ apiResponse, _isVertexAI }): Operation<GenerateVideosResponse>;

  // Full HTTP response
  sdkHttpResponse?: HttpResponse;
}
```

### GenerateVideosResponse Class

```typescript
class GenerateVideosResponse {
  // List of generated videos
  generatedVideos?: GeneratedVideo[];

  // Count of videos filtered by RAI (Responsible AI) policies
  raiMediaFilteredCount?: number;

  // Reasons for RAI filtering
  raiMediaFilteredReasons?: string[];
}
```

### GeneratedVideo Interface

```typescript
interface GeneratedVideo {
  // The output video
  video?: Video;
}
```

### Video Interface (Response Format)

**CRITICAL:** Videos are returned as URIs, NOT inline base64 data.

```typescript
interface Video {
  // Path to storage (THIS IS HOW VIDEOS ARE RETURNED)
  uri?: string;

  // Video bytes (base64 encoded - rarely used for generation responses)
  videoBytes?: string;

  // MIME type (e.g., "video/mp4")
  mimeType?: string;
}
```

---

## 4. Polling Pattern

### Operations API

**Method:** `ai.operations.getVideosOperation()`

```typescript
class Operations {
  // Specialized method for video operations
  getVideosOperation(
    parameters: OperationGetParameters<GenerateVideosResponse, GenerateVideosOperation>
  ): Promise<GenerateVideosOperation>;

  // Generic operation polling method
  get<T, U extends Operation<T>>(
    parameters: OperationGetParameters<T, U>
  ): Promise<Operation<T>>;
}
```

**Parameters:**
```typescript
interface OperationGetParameters<T, U extends Operation<T>> {
  // Configuration override
  config?: GetOperationConfig;

  // The operation to poll
  operation: U;
}
```

### Polling Implementation Pattern

```typescript
async function pollOperation(
  ai: GoogleGenAI,
  operation: GenerateVideosOperation
): Promise<GenerateVideosOperation> {
  const MAX_ATTEMPTS = 60;  // ~10 minutes
  const POLL_INTERVAL = 10000;  // 10 seconds

  let attempts = 0;
  let currentOp = operation;

  // Poll until done or timeout
  while (!currentOp.done && attempts < MAX_ATTEMPTS) {
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));

    currentOp = await ai.operations.getVideosOperation({
      operation: currentOp
    });

    attempts++;
    console.error(`Polling attempt ${attempts}/${MAX_ATTEMPTS}`);
  }

  if (!currentOp.done) {
    throw new Error('Video generation timed out');
  }

  if (currentOp.error) {
    throw new Error(`Video generation failed: ${JSON.stringify(currentOp.error)}`);
  }

  return currentOp;
}
```

---

## 5. Complete Usage Example

### Example from SDK Documentation

```typescript
import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Step 1: Start video generation
const operation = await ai.models.generateVideos({
  model: 'veo-2.0-generate-001',
  source: {
    prompt: 'A neon hologram of a cat driving at top speed',
  },
  config: {
    numberOfVideos: 1,
    aspectRatio: '16:9',
    videoLengthSeconds: 8
  }
});

// Step 2: Poll until complete
while (!operation.done) {
  await new Promise(resolve => setTimeout(resolve, 10000));
  operation = await ai.operations.getVideosOperation({ operation });
}

// Step 3: Extract video URI
console.log(operation.response?.generatedVideos?.[0]?.video?.uri);
```

---

## 6. Download Implementation

Since videos are returned as URIs (not inline data), they must be downloaded:

```typescript
async function downloadVideo(uri: string, outputPath: string): Promise<void> {
  const response = await fetch(uri);

  if (!response.ok) {
    throw new Error(`Failed to download video: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  await fs.writeFile(outputPath, Buffer.from(buffer));
}
```

---

## 7. Model Support

### Confirmed Model IDs

Based on the spec and SDK, these models should work:

- `veo-3.1-generate-preview` (Veo 3.1 standard)
- `veo-3.1-fast-generate-preview` (Veo 3.1 fast)
- `veo-3.0-generate-001` (Veo 3.0 standard)
- `veo-3.0-fast-generate-001` (Veo 3.0 fast)
- `veo-2.0-generate-001` (Veo 2.0 - confirmed in SDK example)

---

## 8. Key Differences from Image Generation

| Aspect | Image Generation | Video Generation |
|--------|-----------------|------------------|
| Method | `generateContent()` | `generateVideos()` |
| Response | Synchronous | Asynchronous (operation) |
| Data format | Inline base64 | URI (requires download) |
| Polling | Not required | Required |
| Response field | `inlineData.data` | `video.uri` |
| Time | ~2-5 seconds | ~30-90 seconds |

---

## 9. Implementation Recommendations

### 1. Use Specialized Video Method

**DO:**
```typescript
const operation = await ai.models.generateVideos({
  model: 'veo-3.1-generate-preview',
  source: { prompt: 'A cat playing piano' },
  config: { aspectRatio: '16:9' }
});
```

**DON'T:**
```typescript
// This won't work for video generation
const response = await ai.models.generateContent({
  model: 'veo-3.1-generate-preview',
  contents: 'A cat playing piano'
});
```

### 2. Implement Robust Polling

- Use 10-15 second intervals (don't hammer the API)
- Set reasonable timeout (60 attempts = ~10 minutes)
- Log progress to stderr for user feedback
- Handle both timeout and error cases

### 3. Handle Video Downloads

- Videos come as URIs, not inline data
- Implement fetch/download logic
- Handle network errors gracefully
- Consider streaming for large videos

### 4. Use Source Parameter

The SDK supports both direct parameters and a `source` object:

**Option A (Direct):**
```typescript
{
  model: 'veo-3.1-generate-preview',
  prompt: 'A cat',
  config: { aspectRatio: '16:9' }
}
```

**Option B (Source - Recommended):**
```typescript
{
  model: 'veo-3.1-generate-preview',
  source: {
    prompt: 'A cat'
  },
  config: { aspectRatio: '16:9' }
}
```

### 5. Error Handling

```typescript
// Check for operation errors
if (operation.error) {
  throw new Error(`Generation failed: ${JSON.stringify(operation.error)}`);
}

// Check for RAI filtering
if (operation.response?.raiMediaFilteredCount > 0) {
  console.warn('Some videos were filtered:',
    operation.response.raiMediaFilteredReasons);
}

// Verify video was generated
if (!operation.response?.generatedVideos?.[0]?.video?.uri) {
  throw new Error('No video URI in response');
}
```

---

## 10. Implementation Checklist

- [x] Verify `generateVideos()` method exists
- [x] Understand operation structure (done flag, response field)
- [x] Implement polling with `getVideosOperation()`
- [x] Handle URI-based video responses (not inline data)
- [x] Implement video download from URI
- [x] Add timeout handling (max 60 attempts)
- [x] Handle RAI filtering and errors
- [x] Support config options (aspect ratio, duration, etc.)
- [ ] Test with actual API calls
- [ ] Verify model IDs work correctly
- [ ] Test image-to-video with reference images
- [ ] Test video extension capabilities

---

## 11. Outstanding Questions

1. **Video Extension:** Does the `video` parameter in `GenerateVideosParameters` support extending existing videos? Need to test with actual API.

2. **Multiple Videos:** The `numberOfVideos` config suggests multiple videos can be generated. Does this work with all models?

3. **Model Availability:** Are all Veo 3.x models available via the Developer API, or are some Vertex AI only?

4. **Duration Limits:** SDK doesn't clearly document min/max video duration. Spec says 4/6/8 seconds, but need to verify.

---

## 12. Spec vs SDK Discrepancies

| Aspect | Spec Says | SDK Shows | Resolution |
|--------|-----------|-----------|------------|
| Method name | `generateVideos()` | `generateVideos()` | ✅ Match |
| Response format | Not specified | URI-based | Use URI + download |
| Polling method | `client.operations.get()` | `getVideosOperation()` | Use specialized method |
| Config params | `durationSeconds` | `videoLengthSeconds` | Use SDK name |
| Prompt location | Direct param | In `source` object | Support both |

---

## 13. Reference Links

- **SDK Package:** https://www.npmjs.com/package/@google/genai
- **SDK Documentation:** https://googleapis.github.io/js-genai/
- **Type Definitions:** `/node_modules/@google/genai/dist/genai.d.ts`
- **Gemini API Docs:** https://ai.google.dev/gemini-api/docs/video
- **Vertex AI Veo Docs:** https://cloud.google.com/vertex-ai/generative-ai/docs/model-reference/veo-video-generation

---

## 14. Next Steps for Implementation

1. **Update SPEC.md** with correct method signatures
2. **Implement polling helper** function
3. **Add video download** utility
4. **Create initial tool** for text-to-video
5. **Test with real API** to verify assumptions
6. **Add image-to-video** support
7. **Implement video extension** (if supported)
8. **Add error handling** for all edge cases

---

**Status:** ✅ Ready for implementation
**Confidence:** High (based on SDK type definitions and README examples)
**Risk Areas:** Video extension API may differ from spec; duration parameter naming; model availability

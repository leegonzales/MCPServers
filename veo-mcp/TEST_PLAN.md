# Veo MCP E2E Test Plan

**Type:** E2E (Real API calls - costs credits)
**Framework:** Node.js test runner or Vitest
**Estimated run time:** 30-60 minutes (videos take 30-90s each)

---

## Test Environment Setup

### Prerequisites
- `GEMINI_API_KEY` environment variable set
- Node.js 18+
- Test images in `tests/fixtures/`:
  - `landscape.jpg` (16:9 aspect)
  - `portrait.png` (9:16 aspect)
  - `day-scene.jpg` (for transition start)
  - `night-scene.jpg` (for transition end)

### Test Output
- Videos saved to `~/Documents/veo_generated_test/`
- Cleanup after each test suite run
- Log all API responses for debugging

---

## Test Suites

### Suite 1: Text-to-Video Generation (`generate-video.test.ts`)

| Test | Description | Expected | Priority |
|------|-------------|----------|----------|
| `basic-generation` | Generate 4s video with default settings | Video file created, MP4 format | P0 |
| `aspect-ratio-landscape` | Generate 16:9 video | Video has 16:9 aspect | P1 |
| `aspect-ratio-portrait` | Generate 9:16 video | Video has 9:16 aspect | P1 |
| `duration-4s` | Generate 4-second video | Video ~4s long | P1 |
| `duration-6s` | Generate 6-second video | Video ~6s long | P1 |
| `duration-8s` | Generate 8-second video | Video ~8s long | P1 |
| `resolution-720p` | Generate 720p video | Video resolution 720p | P1 |
| `resolution-1080p` | Generate 1080p video (Veo 3.x only) | Video resolution 1080p | P2 |
| `model-fast` | Use fast model variant | Faster generation, video created | P2 |
| `negative-prompt` | Exclude elements via negative prompt | Video lacks specified elements | P2 |
| `background-mode` | Return operation ID immediately | operationId returned, no blocking | P1 |

**Prompts to use:**
```
basic: "A calm ocean wave rolling onto a sandy beach at sunset, 4K cinematic"
landscape: "Aerial drone shot of mountains with flowing river, epic landscape"
portrait: "Smartphone video of coffee being poured into a cup, close-up"
```

---

### Suite 2: Image-to-Video (`image-to-video.test.ts`)

| Test | Description | Expected | Priority |
|------|-------------|----------|----------|
| `animate-landscape` | Animate landscape.jpg | Video shows motion in image | P0 |
| `animate-portrait` | Animate portrait.png | Video created from portrait | P1 |
| `invalid-path` | Non-existent image path | Clear error message | P0 |
| `unsupported-format` | Pass .gif or .bmp | Rejected before API call | P1 |
| `large-image` | Very large image (10MB+) | Handles gracefully | P2 |

**Test image + prompts:**
```
landscape.jpg + "Clouds slowly drifting across the sky, gentle breeze moving trees"
portrait.png + "Slight camera movement, shallow depth of field"
```

---

### Suite 3: Frame Transitions (`transitions.test.ts`)

| Test | Description | Expected | Priority |
|------|-------------|----------|----------|
| `day-to-night` | Transition between day/night scenes | Smooth time-lapse effect | P0 |
| `same-image` | First and last frame identical | Still creates valid video | P2 |
| `mismatched-aspect` | Different aspect ratios | Error or handled gracefully | P1 |
| `missing-first-frame` | Invalid first frame path | Clear error | P1 |
| `missing-last-frame` | Invalid last frame path | Clear error | P1 |

---

### Suite 4: Video Extension (`extend-video.test.ts`)

| Test | Description | Expected | Priority |
|------|-------------|----------|----------|
| `extend-once` | Extend a generated video | Video +7s longer | P0 |
| `extension-limit` | Attempt 21st extension | Error at limit | P1 |
| `non-veo-video` | Extend non-Veo video | Clear error | P1 |
| `track-count` | Check extension count updates | Metadata shows count | P1 |

**Note:** Extension tests require a video generated earlier in the test run.

---

### Suite 5: Operation Status (`status.test.ts`)

| Test | Description | Expected | Priority |
|------|-------------|----------|----------|
| `check-pending` | Start background, check status | Status "pending" with elapsed time | P0 |
| `check-completed` | Check after completion | Status "completed" with path | P0 |
| `unknown-operation` | Invalid operation ID | Clear error | P1 |
| `poll-until-done` | Poll repeatedly until done | Eventually returns completed | P1 |

---

### Suite 6: History Tracking (`history.test.ts`)

| Test | Description | Expected | Priority |
|------|-------------|----------|----------|
| `empty-history` | Check history before any generation | Empty array | P0 |
| `single-video` | Generate one, check history | One entry with correct metadata | P0 |
| `multiple-videos` | Generate several, check order | Sorted newest first | P1 |
| `deleted-file-warning` | Delete file, check history | Warns file missing | P2 |

---

### Suite 7: Cleanup (`cleanup.test.ts`)

| Test | Description | Expected | Priority |
|------|-------------|----------|----------|
| `delete-by-id` | Delete specific video | File removed, history updated | P0 |
| `delete-all` | Delete all session videos | All files removed | P1 |
| `delete-older-than` | Delete videos > 1 hour old | Only old videos removed | P2 |
| `space-recovered` | Check bytesRecovered | Accurate byte count | P1 |
| `already-deleted` | Delete already-missing file | Handled gracefully | P2 |

---

### Suite 8: Error Handling (`error-handling.test.ts`)

| Test | Description | Expected | Priority |
|------|-------------|----------|----------|
| `missing-api-key` | Unset GEMINI_API_KEY | Clear error with AI Studio link | P0 |
| `invalid-api-key` | Wrong API key | 401 error, clear message | P0 |
| `content-policy` | Violating prompt | Policy error, suggest modification | P1 |
| `rate-limit` | Trigger rate limit (if possible) | 429 error, backoff suggestion | P2 |
| `timeout-handling` | Very long generation | Times out after 10 min | P2 |

**Content policy test prompt:**
```
"Violent or harmful content that violates policy" (intentionally triggering)
```

---

## Test Execution Strategy

### Development Testing (Fast)
```bash
# Run single test for quick iteration
npm test -- --grep "basic-generation"

# Run one suite
npm test -- tests/e2e/generate-video.test.ts
```

### Full E2E Run (Slow, Expensive)
```bash
# Full suite - run sparingly
npm run test:e2e

# With increased timeout
npm test -- --timeout 120000
```

### CI/CD Considerations
- **Do NOT run E2E in CI** - too slow, costs money
- Run unit tests in CI
- E2E as manual gate before release

---

## Test Data Management

### Fixtures (`tests/fixtures/`)
```
fixtures/
  images/
    landscape.jpg      # 1920x1080 nature scene
    portrait.png       # 1080x1920 close-up
    day-scene.jpg      # Daytime city
    night-scene.jpg    # Nighttime city (same location)
    oversized.jpg      # 10MB+ for edge case
    invalid.gif        # Unsupported format
```

### Output Isolation
- Use `VEO_OUTPUT_DIR=~/Documents/veo_generated_test/` for tests
- Clean up after each suite
- Keep failed test outputs for debugging

---

## Metrics to Track

| Metric | Target | Notes |
|--------|--------|-------|
| Generation time (4s video) | < 60s | With fast model |
| Generation time (8s video) | < 90s | With standard model |
| Success rate | > 95% | Excluding policy violations |
| File save success | 100% | No partial files |

---

## Test Automation Setup

### package.json additions
```json
{
  "scripts": {
    "test": "node --test",
    "test:e2e": "node --test --test-timeout=600000 tests/e2e/",
    "test:unit": "node --test tests/unit/"
  },
  "devDependencies": {
    "@types/node": "^22.0.0"
  }
}
```

### Test file structure
```typescript
// tests/e2e/generate-video.test.ts
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { MCPClient } from '../helpers/mcp-client.js';

describe('veo_generate_video', () => {
    let client: MCPClient;

    before(async () => {
        client = await MCPClient.connect();
    });

    after(async () => {
        await client.cleanup();
    });

    it('generates basic video', async () => {
        const result = await client.call('veo_generate_video', {
            prompt: 'Ocean wave on beach at sunset',
            duration: 4
        });

        assert.ok(result.path);
        assert.ok(result.path.endsWith('.mp4'));
        // Verify file exists
        // Verify duration
    });
});
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| API costs | Limit test runs, use 4s duration, fast model |
| Flaky tests | Add retries, generous timeouts |
| Rate limiting | Add delays between tests, backoff |
| Test pollution | Unique output dirs, cleanup |
| Long test times | Parallel where possible, skip slow tests in dev |

---

## Approval Checklist

Before considering implementation complete:

- [ ] All P0 tests passing
- [ ] All P1 tests passing
- [ ] P2 tests passing or documented as known issues
- [ ] Test run time documented
- [ ] API cost per full run documented
- [ ] No flaky tests (3 consecutive passes)

---

**Created:** 2025-12-13
**Status:** Ready for implementation with MCP-27

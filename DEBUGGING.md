# Debugging: CopilotKit Visual Effects Not Visible

## Status: ALL FIXED — Background, frames, and overlays all verified working

## Problem
CopilotKit chatbot actions (`addFrame`, `addOverlay`, `changeSceneColors`) execute successfully on the server side, but effects were not visually appearing on the canvas.

## What Works Now
- CopilotKit server runs on port 4200, proxied through Vite at `/api/copilotkit`
- Chat UI opens, messages are sent, LLM responds, tool calls execute (confirmed via network tab)
- `addFrame` handler runs: `stateRef.current.frames.set("__default__", {...})` + `notify()` fires
- `notify()` increments `revision` state in `EffectsProvider`, triggers re-renders
- `modifyLayout` action works correctly (separate state path)
- **`changeSceneColors` now works** — confirmed background changes to `#000033` (dark navy blue) visually

## What Needs Verification
- ~~**Gold frame borders**~~ — **VERIFIED** ✓ Gold borders visible around artworks on dark background
- ~~**Overlay particle effects**~~ — **VERIFIED** ✓ White sparkle particles animate across the scene with additive blending

---

## Root Causes Found & Fixed

### Bug 1 (FIXED): `localState.current.opacity` read during render was 0
- `MediaPlane` updates opacity imperatively in `useFrame` (animation loop)
- When `revision` change triggers a React re-render, `localState.current.opacity` is read as a prop value
- At re-render time, opacity was 0 for many planes (they hadn't been animated yet in the new render cycle)
- **Fix**: Changed `FrameDecoration` and `OverlayEffect` to accept `opacityRef` (the ref itself) instead of a static `opacity` number. Both now use `useFrame` to read live opacity each frame.

### Bug 2 (FIXED): Frames rendered but invisible — contrast + Z-fighting + thickness
- Frames were rendering at z=0 (same plane as artwork) causing Z-fighting
- Frame thickness was `frame.width * 0.8` = 0.24 units for default width 0.3, nearly invisible on 12-20 unit artworks
- Gold on white background had extremely low visual contrast
- **Fixes applied**:
  - Z-offset: Frame mesh now renders at `position={[0, 0, 0.1]}` (slightly in front of artwork)
  - Thickness: Now `max(width, height) * 0.03 + frame.width * 0.5` — scales with artwork size
  - Background fix (Bug 3) provides contrast for gold frames

### Bug 3 (FIXED): `changeSceneColors` overridden by `BackgroundUpdater`
- `BackgroundUpdater` component ran `useFrame` every frame and lerped `scene.background` toward a hardcoded `WHITE` constant
- This immediately overrode any user-specified background color back to white
- **Fix**: `BackgroundUpdater` now accepts a `baseColor` prop and lerps toward that instead of hardcoded white

### Bug 4 (FIXED): CSS color name parsing — Three.js rejects multi-word color names
- LLM would pass "dark navy blue" → stripped to "darknavyblue" → still invalid for Three.js `Color`
- Three.js `Color` silently defaults to black (0,0,0) for unknown names, hard to detect
- **Fixes applied**:
  - `normalizeColor()` function validates colors with `THREE.Color`, tries raw → stripped → fallback
  - Detects silent-black default (r=0,g=0,b=0 for non-black inputs) and falls back to `#1a1a2e`
  - Action description now strongly instructs LLM to always use hex codes with examples
  - Parameter descriptions say "MUST be a hex code" to prevent ambiguity

### Bug 5 (FIXED): Debug logging left in production code
- `debugRef` counter + `console.log("[FrameDebug]")` every 300 frames in `frame-decoration.tsx`
- **Fix**: Removed all debug logging

## Files Modified
| File | Change |
|------|--------|
| `src/infinite-canvas/frame-decoration.tsx` | Quad-based borders; `opacityRef` + `useFrame`; z-offset `0.1`; thickness scales with artwork size; debug logging removed |
| `src/infinite-canvas/overlay-effect.tsx` | Enhanced sizes/counts/blending; `opacityRef` + `useFrame` |
| `src/infinite-canvas/scene.tsx` | `opacityRef={localState}` prop; `BackgroundUpdater` uses `baseColor` prop; `SceneController` passes `backgroundColor` through |
| `src/copilot/actions.tsx` | `normalizeColor()` validates + sanitizes colors; action descriptions enforce hex codes with examples |

## Verification Results (2026-02-21)

All effects confirmed working via browser test:
- Sent chat message: "Change background to #000033 and add gold frames and white sparkles overlay"
- LLM called all three actions: `changeSceneColors`, `addFrame`, `addOverlay`
- Background changed to dark navy blue
- Gold frame borders visible around artworks (z-offset and thickness fixes working)
- White sparkle particles animate across the scene with additive blending on dark background
- No console errors

## Remaining (low priority)
- **Chat UI issue** — Messages sent but conversation history not visible in chat panel after response. May be a CopilotKit UI rendering issue (functionality works).

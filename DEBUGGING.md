# Debugging: CopilotKit Visual Effects Not Visible

## Status: In Progress

## Problem
CopilotKit chatbot actions (`addFrame`, `addOverlay`) execute successfully on the server side, but frames and overlays are not visually appearing on the canvas.

## What Works
- CopilotKit server runs on port 4200, proxied through Vite at `/api/copilotkit`
- Chat UI opens, messages are sent, LLM responds, tool calls execute (confirmed via network tab)
- `addFrame` handler runs: `stateRef.current.frames.set("__default__", {...})` + `notify()` fires
- `notify()` increments `revision` state in `EffectsProvider`, which should trigger re-renders
- `modifyLayout` action works correctly (separate state path)

## What Doesn't Work
- Gold frame borders are not visible around artworks after `addFrame` executes (confirmed: rendering but invisible due to contrast)
- Overlay particle effects — not yet tested after fixes
- `changeSceneColors` — action reports success but background stays white

---

## Root Causes Found

### Bug 1 (FIXED): `localState.current.opacity` read during render was 0
- `MediaPlane` updates opacity imperatively in `useFrame` (animation loop)
- When `revision` change triggers a React re-render, `localState.current.opacity` is read as a prop value
- At re-render time, opacity was 0 for many planes (they hadn't been animated yet in the new render cycle)
- **Fix applied**: Changed `FrameDecoration` and `OverlayEffect` to accept `opacityRef` (the ref itself) instead of a static `opacity` number. Both now use `useFrame` to read live opacity each frame.

### Bug 2 (CONFIRMED WORKING): Frames DO render after the opacity fix
- Added `console.log("[FrameDebug]", { op, visible, color, w, h })` inside `FrameDecoration`'s `useFrame`
- **Initial logs**: `op: 0, visible: false` — opacity starts at 0 and takes time to ramp up (lerp at 0.18 per frame)
- **After ~5 seconds**: `op: 0.103, visible: true` — frames ARE rendering with non-zero opacity
- Frames are present in the scene with correct gold color and dimensions
- **But gold on white background has extremely low visual contrast** — nearly invisible to the eye

### Bug 3 (FIX APPLIED, NEEDS TESTING): `changeSceneColors` overridden by `BackgroundUpdater`
- `changeSceneColors` action calls `setSceneColors("dark blue", "dark blue")` which updates React state
- This passes `backgroundColor` prop to `InfiniteCanvasScene` → `<color attach="background" args={[backgroundColor]} />`
- **However**, `BackgroundUpdater` component runs `useFrame` every frame and lerps `scene.background` toward a hardcoded `WHITE` constant when no artwork is in focus
- This immediately overrides the user-specified background color back to white
- **Fix applied**: `BackgroundUpdater` now accepts a `baseColor` prop (the user-specified background color) and lerps toward that instead of hardcoded white. The prop flows: `InfiniteCanvasScene` → `SceneController` → `BackgroundUpdater`.

## Files Modified
| File | Change |
|------|--------|
| `src/infinite-canvas/frame-decoration.tsx` | Full rewrite: `<lineSegments>` -> `<mesh>` with quad borders; accepts `opacityRef` + `useFrame`; temp debug logging (to remove) |
| `src/infinite-canvas/overlay-effect.tsx` | Enhanced sizes/counts/blending; accepts `opacityRef` + `useFrame` |
| `src/infinite-canvas/scene.tsx` | Passes `opacityRef={localState}` instead of `opacity`; `BackgroundUpdater` now uses `baseColor` prop instead of hardcoded WHITE; `SceneController` passes `backgroundColor` through |

## Temporary Debug Code (to remove)
- `src/infinite-canvas/frame-decoration.tsx` lines ~104-114: `debugRef` counter + `console.log("[FrameDebug]", ...)` every 300 frames

## Next Steps

1. **Test `changeSceneColors` fix** — Open http://localhost:5174, chat "change background to dark blue", verify background actually turns dark blue now
2. **Verify gold frames on dark background** — With dark blue background, gold frames should be clearly visible. Take screenshot to confirm.
3. **Test overlays** — Chat "add sparkles", verify particle overlay effects appear
4. **If frames still invisible on dark background**, investigate:
   - Z-fighting: frame quads at z=0 same as artwork plane — may need z offset (e.g., z=0.05)
   - Render order / depth testing: transparent material sorting
   - Frame thickness: `width * 0.8` may be too thin at current zoom levels
5. **Remove debug logging** — Delete `debugRef` + `console.log("[FrameDebug]")` from `frame-decoration.tsx`
6. **CSS color name parsing** — "dark blue" has a space; Three.js `Color` constructor may not accept it. Standard CSS name is "darkblue". If background doesn't change, this is likely why. The `changeSceneColors` action description should recommend hex codes.

# High-Resolution Share Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the current share-card flow so the preview uses real cat frame assets and the exported image is rendered at `1080 x 1920` with real static cat art and sharper output.

**Architecture:** Keep the current result/share flow intact and layer two rendering paths on top of the same `shareCardPolicy` model. Preview remains DOM-based with lightweight frame switching, while export gains a dedicated off-screen canvas renderer that outputs a fixed `1080 x 1920` blob before entering the existing native-share-first flow.

**Tech Stack:** TypeScript, DOM HUD preview, canvas export renderer, Vite, Vitest, browser Web Share APIs

---

## File Map

- Create: `src/game/share/shareCardAssets.ts`
  Responsibility: define the MVP cat asset contract, resolve preview frames/static hero asset, and provide fallback selection rules.
- Create: `src/game/share/shareCardExportRenderer.ts`
  Responsibility: render a fixed `1080 x 1920` canvas card using the existing share-card model and real static cat asset where available.
- Modify: `src/game/share/shareCardPreview.ts`
  Responsibility: swap placeholder cat rendering for real frame-based preview motion with static-image fallback.
- Modify: `src/game/share/shareCardExport.ts`
  Responsibility: source the export blob from the dedicated canvas renderer rather than preview-size DOM capture.
- Modify: `src/game/share/shareCardPolicy.ts` if needed.
  Responsibility: remain the single source of pose/composition intent, including badge visibility intent.
- Modify: `src/game/hud/domHud.ts`
  Responsibility: migrate the preview Share button off `exportShareCardFromElement(...)` and onto the new high-resolution export path using frozen result/model data.
- Modify: `src/styles.css`
  Responsibility: style the real-frame preview hero and preserve composition alignment with the export version.
- Create: `tests/game/share-card-assets.test.ts`
  Responsibility: verify asset resolution and fallback order: preview frames -> same cat static image -> placeholder.
- Create: `tests/game/share-card-export-renderer.test.ts`
  Responsibility: verify `1080 x 1920` render size, safe-area placement, and fallback behavior.
- Modify: `tests/game/share-card-export.test.ts`
  Responsibility: keep export behavior correct with the new canvas-rendered blob and confirm DOM-capture API is no longer the caller path.
- Modify: `tests/game/dom-hud.test.ts`
  Responsibility: verify preview uses real asset markup/fallback and remains compositionally aligned with the policy model.

### Task 1: Lock asset resolution and fallback order

**Files:**
- Create: `d:/projects/zju-cat-merge/.worktrees/result-layer/tests/game/share-card-assets.test.ts`
- Create: `d:/projects/zju-cat-merge/.worktrees/result-layer/src/game/share/shareCardAssets.ts`

- [ ] **Step 1: Write the failing tests**

Create `share-card-assets.test.ts` with explicit fallback-order assertions:

```ts
expect(resolveShareCardAssets({ hasPreviewFrames: true, hasStaticHero: true }).previewMode).toBe('frames');
expect(resolveShareCardAssets({ hasPreviewFrames: false, hasStaticHero: true }).previewMode).toBe('static');
expect(resolveShareCardAssets({ hasPreviewFrames: false, hasStaticHero: false }).previewMode).toBe('placeholder');
expect(resolveShareCardAssets({ hasPreviewFrames: false, hasStaticHero: false }).exportMode).toBe('placeholder');
```

Also lock the asset contract by scenario rather than unconditionally:

```ts
expect(withAssets.staticHeroSrc).toBeDefined();
expect(withAssets.previewFrameSrcs.length).toBeGreaterThan(0);
expect(withoutFrames.previewMode).toBe('static');
expect(withoutRealAssets.previewMode).toBe('placeholder');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/game/share-card-assets.test.ts`
Expected: FAIL because `shareCardAssets.ts` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `src/game/share/shareCardAssets.ts` with a focused resolver such as:

```ts
export type ShareCardAssets = {
  previewMode: 'frames' | 'static' | 'placeholder';
  exportMode: 'static' | 'placeholder';
  previewFrameSrcs: string[];
  staticHeroSrc?: string;
};

export function resolveShareCardAssets(...): ShareCardAssets {
  // prefer frames, then same-cat static, then placeholder
}
```

Keep the contract small and deterministic.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/game/share-card-assets.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/share/shareCardAssets.ts tests/game/share-card-assets.test.ts
git commit -m "feat: add share card asset resolver"
```

### Task 2: Add the fixed-size canvas export renderer

**Files:**
- Create: `d:/projects/zju-cat-merge/.worktrees/result-layer/src/game/share/shareCardExportRenderer.ts`
- Create: `d:/projects/zju-cat-merge/.worktrees/result-layer/tests/game/share-card-export-renderer.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `share-card-export-renderer.test.ts` to assert:

```ts
expect(result.width).toBe(1080);
expect(result.height).toBe(1920);
expect(result.safeArea.left).toBe(96);
expect(result.safeArea.top).toBe(120);
```

Also add a fallback test proving the renderer still returns a canvas/blob-ready result when only placeholder mode is available.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/game/share-card-export-renderer.test.ts`
Expected: FAIL because `shareCardExportRenderer.ts` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `src/game/share/shareCardExportRenderer.ts` with an export-only canvas renderer:

```ts
export async function renderShareCardToCanvas(...): Promise<RenderedShareCard> {
  // create 1080x1920 canvas and render from model + resolved assets
}
```

Requirements:
- fixed `1080 x 1920`
- safe-area insets `96 / 120`
- static hero image when available
- placeholder-cat export when real static asset is unavailable

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/game/share-card-export-renderer.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/share/shareCardExportRenderer.ts tests/game/share-card-export-renderer.test.ts
git commit -m "feat: add high-res share card renderer"
```

### Task 3: Upgrade the preview to real cat frames with static fallback

**Files:**
- Modify: `d:/projects/zju-cat-merge/.worktrees/result-layer/src/game/share/shareCardPreview.ts`
- Modify: `d:/projects/zju-cat-merge/.worktrees/result-layer/src/styles.css`
- Modify: `d:/projects/zju-cat-merge/.worktrees/result-layer/tests/game/dom-hud.test.ts`
- Modify: `d:/projects/zju-cat-merge/.worktrees/result-layer/src/game/share/shareCardAssets.ts`

- [ ] **Step 1: Write the failing tests**

Extend `dom-hud.test.ts` with mode-specific assertions instead of requiring all markup at once.

Frame-mode case:

```ts
expect(root.querySelector('.share-card-cat-frame')).not.toBeNull();
expect(root.querySelector('.share-card-cat-img')).toBeNull();
expect(root.querySelector('.share-card-cat-placeholder')).toBeNull();
```

Static-fallback case:

```ts
expect(root.querySelector('.share-card-cat-img')).not.toBeNull();
expect(root.querySelector('.share-card-cat-frame')).toBeNull();
expect(root.querySelector('.share-card-cat-placeholder')).toBeNull();
```

Placeholder-fallback case:

```ts
expect(root.querySelector('.share-card-cat-placeholder')).not.toBeNull();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/game/dom-hud.test.ts`
Expected: FAIL because the preview still uses placeholder text/shape markup.

- [ ] **Step 3: Write minimal implementation**

Update `shareCardPreview.ts` and `styles.css` so preview rendering:
- uses the resolved preview frame list when available
- falls back to the same cat��s static image if frames are unavailable
- falls back to placeholder only when real assets are unavailable
- preserves the same band/pose/anchor logic as before

Keep the preview motion lightweight and DOM-driven.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/game/dom-hud.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/share/shareCardPreview.ts src/styles.css src/game/share/shareCardAssets.ts tests/game/dom-hud.test.ts
git commit -m "feat: add real cat preview frames"
```

### Task 4: Route export through the high-resolution renderer and retire preview-size export calls

**Files:**
- Modify: `d:/projects/zju-cat-merge/.worktrees/result-layer/src/game/share/shareCardExport.ts`
- Modify: `d:/projects/zju-cat-merge/.worktrees/result-layer/src/game/share/shareCardExportRenderer.ts`
- Modify: `d:/projects/zju-cat-merge/.worktrees/result-layer/src/game/hud/domHud.ts`
- Modify: `d:/projects/zju-cat-merge/.worktrees/result-layer/tests/game/share-card-export.test.ts`
- Modify: `d:/projects/zju-cat-merge/.worktrees/result-layer/tests/game/share-card-export-renderer.test.ts`
- Modify: `d:/projects/zju-cat-merge/.worktrees/result-layer/tests/game/dom-hud.test.ts`

- [ ] **Step 1: Write the failing tests**

Extend `share-card-export.test.ts` so export is verified from rendered high-res output rather than preview-sized DOM capture:

```ts
expect(renderSpy).toHaveBeenCalledTimes(1);
expect(exportedBlob.type).toBe('image/png');
expect(captureFromElementSpy).not.toHaveBeenCalled();
```

Add a fallback case where export rendering uses placeholder mode but still shares/downloads successfully.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/game/share-card-export.test.ts`
Run: `npm test -- tests/game/share-card-export-renderer.test.ts`
Run: `npm test -- tests/game/dom-hud.test.ts`
Expected: FAIL because `shareCardExport.ts` and `domHud.ts` still route through preview-size DOM capture.

- [ ] **Step 3: Write minimal implementation**

Update `shareCardExport.ts` so the share flow becomes:
1. resolve assets
2. render fixed-size canvas through `shareCardExportRenderer`
3. convert canvas to blob
4. native share first
5. download fallback

Update `domHud.ts` in the same task so the preview Share button no longer calls `exportShareCardFromElement(...)`; it should call the new high-resolution export API with frozen result data/model instead.

Keep the user-facing share behavior unchanged.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/game/share-card-export.test.ts`
Run: `npm test -- tests/game/share-card-export-renderer.test.ts`
Run: `npm test -- tests/game/dom-hud.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/share/shareCardExport.ts src/game/share/shareCardExportRenderer.ts src/game/hud/domHud.ts tests/game/share-card-export.test.ts tests/game/share-card-export-renderer.test.ts tests/game/dom-hud.test.ts
git commit -m "feat: export high-res share cards"
```

### Task 5: Realign preview/export with policy and full regression

**Files:**
- Modify: `d:/projects/zju-cat-merge/.worktrees/result-layer/src/game/share/shareCardPolicy.ts` if needed
- Modify: `d:/projects/zju-cat-merge/.worktrees/result-layer/src/game/share/shareCardPreview.ts`
- Modify: `d:/projects/zju-cat-merge/.worktrees/result-layer/src/game/share/shareCardExportRenderer.ts`
- Modify: `d:/projects/zju-cat-merge/.worktrees/result-layer/tests/game/dom-hud.test.ts`
- Modify: `d:/projects/zju-cat-merge/.worktrees/result-layer/tests/game/share-card-export-renderer.test.ts`

- [ ] **Step 1: Write the final alignment assertions**

Add tests that lock the non-negotiable preview/export invariants:

```ts
expect(previewBand).toBe(exportBand);
expect(previewScoreAnchor).toBe(exportScoreAnchor);
expect(previewHasBadge).toBe(exportHasBadge);
expect(previewCopy).toBe(exportCopy);
```

Also explicitly realign both layers with `shareCardPolicy` for badge visibility intent. If policy remains authoritative, update stale preview assumptions so badge visibility comes from the policy-derived rule rather than raw `isNewBest`.

Allow only detail-level differences such as motion or pixel density.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/game/dom-hud.test.ts`
Run: `npm test -- tests/game/share-card-export-renderer.test.ts`
Expected: FAIL if preview/export are drifting in composition logic or badge visibility.

- [ ] **Step 3: Write minimal implementation**

Adjust preview/export mapping only as needed so both layers interpret the same `shareCardPolicy` model consistently.

Do not introduce a second composition policy.

- [ ] **Step 4: Run targeted regressions**

Run:

```bash
npm test -- tests/game/share-card-assets.test.ts
npm test -- tests/game/share-card-export-renderer.test.ts
npm test -- tests/game/share-card-export.test.ts
npm test -- tests/game/share-card-policy.test.ts
npm test -- tests/game/dom-hud.test.ts
npm test -- tests/game/hud-bridge.test.ts
npm test -- tests/game/result-state.test.ts
npm test -- tests/smoke/source-hygiene.test.ts
npm test -- tests/smoke/app-start.test.ts
```

Expected: PASS

- [ ] **Step 5: Run build and start manual-checkpoint server**

Run:

```bash
npm run build
npm run dev -- --host 0.0.0.0 --port 4178
Invoke-WebRequest http://127.0.0.1:4178 -UseBasicParsing | Select-Object StatusCode
# Also verify the current LAN host for this machine on port 4178 before asking for phone testing
Invoke-WebRequest http://<current-lan-host>:4178 -UseBasicParsing | Select-Object StatusCode
```

Expected:
- build PASS with only the known large bootstrap chunk warning
- both HTTP checks return `200`

- [ ] **Step 6: Commit final integration changes**

```bash
git add src/game/share/shareCardAssets.ts src/game/share/shareCardExportRenderer.ts src/game/share/shareCardPreview.ts src/game/share/shareCardExport.ts src/game/share/shareCardPolicy.ts src/game/hud/domHud.ts src/styles.css tests/game/share-card-assets.test.ts tests/game/share-card-export-renderer.test.ts tests/game/share-card-export.test.ts tests/game/dom-hud.test.ts
git commit -m "feat: add high-res real-cat share cards"
```

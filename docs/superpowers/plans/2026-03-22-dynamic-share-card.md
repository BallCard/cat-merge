# Dynamic Share Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dynamic cat-led share-card flow that opens from the result layer, renders a 9:16 share preview, and exports through native share with download fallback.

**Architecture:** Keep the gameplay/result architecture unchanged and add a new share-card presentation path on top of frozen result data. A focused `shareCardPolicy` module will output a complete share-card view model, and DOM presentation units will use that model to render a strict modal preview and run the single `Share` action with success toast plus manual dismissal.

**Tech Stack:** TypeScript, DOM HUD bridge, Vite, Vitest, browser Web Share APIs, DOM-to-image export helper

---

## File Map

- Create: `src/game/share/shareCardPolicy.ts`
  Responsibility: classify score bands, choose pose/copy/badge/layout intent, and return a complete share-card view model from frozen result payload.
- Create: `src/game/share/shareCardExport.ts`
  Responsibility: convert the rendered share card DOM into an image blob/data URL and run native-share-first with automatic download fallback.
- Create: `src/game/share/shareCardPreview.ts`
  Responsibility: render the strict modal preview shell, consume the share-card view model, expose share/close callbacks, and render lightweight success feedback.
- Modify: `src/game/hud/bridge.ts`
  Responsibility: add a share command path for the result layer without polluting gameplay state.
- Modify: `src/game/hud/domHud.ts`
  Responsibility: replace result-layer placeholder action with `Share`, open/close share preview state, freeze preview data from the result payload, and host the preview above the result layer.
- Modify: `src/styles.css`
  Responsibility: style the share preview modal, 9:16 card, cat-score composition variants, inert-underlay result layer state, and success hint.
- Test: `tests/game/dom-hud.test.ts`
  Responsibility: verify `Share` entry, strict modal behavior, inert underlay, frozen data usage, and success-feedback behavior.
- Create: `tests/game/share-card-policy.test.ts`
  Responsibility: verify score-band boundaries and the complete share-card view model output.
- Create: `tests/game/share-card-export.test.ts`
  Responsibility: verify native-share-first behavior plus download fallback when share is unavailable or unusable.
- Test: `tests/smoke/app-start.test.ts`
  Responsibility: keep app-shell startup/render coverage intact after adding share preview DOM.

### Task 1: Lock score-band policy with failing tests

**Files:**
- Create: `d:/projects/zju-cat-merge/.worktrees/result-layer/tests/game/share-card-policy.test.ts`
- Create: `d:/projects/zju-cat-merge/.worktrees/result-layer/src/game/share/shareCardPolicy.ts`

- [ ] **Step 1: Write the failing tests**

Create `share-card-policy.test.ts` with boundary assertions for all score bands:

```ts
expect(buildShareCardModel({ score: 39999, peakLevel: 9, isNewBest: false }).band).toBe('low');
expect(buildShareCardModel({ score: 40000, peakLevel: 9, isNewBest: false }).band).toBe('mid');
expect(buildShareCardModel({ score: 99999, peakLevel: 10, isNewBest: false }).band).toBe('mid');
expect(buildShareCardModel({ score: 100000, peakLevel: 10, isNewBest: true }).band).toBe('high');
```

Also lock the exact per-band intent so the policy cannot return the wrong composition while still passing:

```ts
expect(low.poseMode).toBe('step');
expect(low.scoreAnchor).toBe('under');
expect(low.shareLine).toBeDefined();
expect(low.showNewBestBadge).toBe(false);

expect(mid.poseMode).toBe('side');
expect(mid.scoreAnchor).toBe('beside');

expect(high.poseMode).toBe('lift');
expect(high.scoreAnchor).toBe('over');
expect(high.showNewBestBadge).toBe(true);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/game/share-card-policy.test.ts`
Expected: FAIL because `shareCardPolicy.ts` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `src/game/share/shareCardPolicy.ts` with a single exported builder such as:

```ts
export type ShareCardModel = {
  band: 'low' | 'mid' | 'high';
  poseMode: 'step' | 'side' | 'lift';
  shareLine: string;
  showNewBestBadge: boolean;
  scoreAnchor: 'under' | 'beside' | 'over';
};

export function buildShareCardModel(payload: ResultPayload): ShareCardModel {
  // classify score and return the complete view model
}
```

Keep copy short and score-band-dependent.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/game/share-card-policy.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/share/shareCardPolicy.ts tests/game/share-card-policy.test.ts
git commit -m "feat: add share card policy"
```

### Task 2: Lock export behavior with failing tests

**Files:**
- Create: `d:/projects/zju-cat-merge/.worktrees/result-layer/tests/game/share-card-export.test.ts`
- Create: `d:/projects/zju-cat-merge/.worktrees/result-layer/src/game/share/shareCardExport.ts`

- [ ] **Step 1: Write the failing tests**

Create `share-card-export.test.ts` with three cases:

Native share path:

```ts
expect(nativeShareSpy).toHaveBeenCalledTimes(1);
expect(downloadSpy).not.toHaveBeenCalled();
```

No share support path:

```ts
expect(nativeShareSpy).not.toHaveBeenCalled();
expect(downloadSpy).toHaveBeenCalledTimes(1);
```

Share API exists but cannot share the produced asset:

```ts
expect(canShareSpy).toHaveBeenCalled();
expect(nativeShareSpy).not.toHaveBeenCalled();
expect(downloadSpy).toHaveBeenCalledTimes(1);
```

Model the API boundary so the function accepts a rendered element/blob source and injected browser capabilities.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/game/share-card-export.test.ts`
Expected: FAIL because `shareCardExport.ts` does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create `src/game/share/shareCardExport.ts` with a single export path:

```ts
export async function exportShareCard(options: ExportShareCardOptions): Promise<'shared' | 'downloaded'> {
  // render to image, prefer native share, otherwise download
}
```

Requirements:
- one user-facing action only
- native share first when supported and usable for the produced asset
- automatic download fallback when native share is unavailable or unusable

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/game/share-card-export.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/share/shareCardExport.ts tests/game/share-card-export.test.ts
git commit -m "feat: add share card export flow"
```

### Task 3: Add strict modal share preview from the result layer

**Files:**
- Create: `d:/projects/zju-cat-merge/.worktrees/result-layer/src/game/share/shareCardPreview.ts`
- Modify: `d:/projects/zju-cat-merge/.worktrees/result-layer/src/game/hud/bridge.ts`
- Modify: `d:/projects/zju-cat-merge/.worktrees/result-layer/src/game/hud/domHud.ts`
- Modify: `d:/projects/zju-cat-merge/.worktrees/result-layer/tests/game/dom-hud.test.ts`

- [ ] **Step 1: Write the failing tests**

Extend `dom-hud.test.ts` to prove the result-layer secondary action is now real:

```ts
expect(root.querySelector('[data-action="share-result"]')).not.toBeNull();
```

Then assert strict modal behavior after opening preview:

```ts
expect(root.querySelector('[aria-label="share-preview"]')).not.toBeNull();
expect(root.querySelector('.game-hud.is-share-preview-open')).not.toBeNull();
expect(root.querySelector('[data-action="restart-result"]')?.getAttribute('tabindex')).toBe('-1');
expect(root.querySelector('[data-action="share-result"]')?.getAttribute('tabindex')).toBe('-1');
```

Also add behavioral assertions that while preview is open:
- pressing result-layer `restart-result` does not call restart
- pressing result-layer `share-result` does not open a second preview or trigger underlying controls
- focusable order stays inside the preview controls only

Add a close-path test proving the preview disappears and the result layer remains.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/game/dom-hud.test.ts`
Expected: FAIL because the `Share` action and strict modal semantics do not yet exist.

- [ ] **Step 3: Write minimal implementation**

- Add a bridge command path for share preview control if needed.
- Replace `More Soon` with `Share` in `domHud.ts`.
- Render a dedicated strict modal preview component from `shareCardPreview.ts` above the result layer.
- Keep the result layer visible underneath but inert while preview is open.
- Ensure underlay buttons become non-interactive and leave the focus path while the preview is active.

Do not let preview state mutate gameplay state.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/game/dom-hud.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/share/shareCardPreview.ts src/game/hud/bridge.ts src/game/hud/domHud.ts tests/game/dom-hud.test.ts
git commit -m "feat: add share preview modal"
```

### Task 4: Render the 9:16 dynamic cat card from frozen result data

**Files:**
- Modify: `d:/projects/zju-cat-merge/.worktrees/result-layer/src/game/share/shareCardPreview.ts`
- Modify: `d:/projects/zju-cat-merge/.worktrees/result-layer/src/styles.css`
- Modify: `d:/projects/zju-cat-merge/.worktrees/result-layer/tests/game/dom-hud.test.ts`

- [ ] **Step 1: Write the failing tests**

Add structure assertions for the share card preview:

```ts
expect(root.querySelector('.share-card')).not.toBeNull();
expect(
  root.querySelector('.share-card.is-band-low, .share-card.is-band-mid, .share-card.is-band-high')
).not.toBeNull();
expect(root.querySelector('.share-card-score')).not.toBeNull();
expect(root.querySelector('.share-card-cat')).not.toBeNull();
expect(root.querySelector('.share-card-brand')).not.toBeNull();
```

Also add a data-source test proving the preview reads frozen result payload rather than live HUD score:

```ts
bridge.publish({
  score: 999999,
  isGameOver: true,
  result: { score: 82470, peakLevel: 10, isNewBest: true },
});
openSharePreview();
expect(root.textContent).toContain('82470');
expect(root.textContent).not.toContain('999999');
```

Assert `NEW BEST` badge visibility only when `isNewBest` is true.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/game/dom-hud.test.ts`
Expected: FAIL because the share preview markup and frozen-data rendering are not yet complete.

- [ ] **Step 3: Write minimal implementation**

Update `shareCardPreview.ts` and `styles.css` to render:
- a fixed `9:16` card shell
- cat hero zone
- score anchored under/beside/over based on the policy view model
- short share line
- `Peak Lv.` support metric
- conditional `NEW BEST` badge
- brand footer

Keep the cat as the dominant visual mass and score as an interactive object relative to the cat.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/game/dom-hud.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/share/shareCardPreview.ts src/styles.css tests/game/dom-hud.test.ts
git commit -m "feat: style dynamic share card preview"
```

### Task 5: Wire share action to export and success feedback

**Files:**
- Modify: `d:/projects/zju-cat-merge/.worktrees/result-layer/src/game/share/shareCardPreview.ts`
- Modify: `d:/projects/zju-cat-merge/.worktrees/result-layer/src/game/share/shareCardExport.ts`
- Modify: `d:/projects/zju-cat-merge/.worktrees/result-layer/tests/game/dom-hud.test.ts`
- Modify: `d:/projects/zju-cat-merge/.worktrees/result-layer/tests/smoke/app-start.test.ts`

- [ ] **Step 1: Write the failing tests**

In `dom-hud.test.ts`, inject a mocked export callback and assert the preview `Share` button triggers it and keeps the preview open after success:

```ts
expect(exportSpy).toHaveBeenCalledTimes(1);
expect(root.querySelector('[aria-label="share-preview"]')).not.toBeNull();
expect(root.textContent).toMatch(/Saved|Shared/);
```

If startup coverage needs updating for the extra modal root, adjust `app-start.test.ts` expectations.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/game/dom-hud.test.ts`
Run: `npm test -- tests/smoke/app-start.test.ts`
Expected: FAIL because the share button is not yet wired to export and success feedback.

- [ ] **Step 3: Write minimal implementation**

Connect the preview `Share` button to `exportShareCard()`.

Behavior requirements:
- no remote calls
- no result reset
- no gameplay mutation
- on success, show a light success hint and keep the preview open
- user closes the preview manually

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/game/dom-hud.test.ts`
Run: `npm test -- tests/smoke/app-start.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/share/shareCardPreview.ts src/game/share/shareCardExport.ts tests/game/dom-hud.test.ts tests/smoke/app-start.test.ts
git commit -m "feat: wire share card export"
```

### Task 6: Full verification and manual-ready checkpoint

**Files:**
- Verify: `d:/projects/zju-cat-merge/.worktrees/result-layer/src/game/share/shareCardPolicy.ts`
- Verify: `d:/projects/zju-cat-merge/.worktrees/result-layer/src/game/share/shareCardExport.ts`
- Verify: `d:/projects/zju-cat-merge/.worktrees/result-layer/src/game/share/shareCardPreview.ts`
- Verify: `d:/projects/zju-cat-merge/.worktrees/result-layer/src/game/hud/domHud.ts`
- Verify: `d:/projects/zju-cat-merge/.worktrees/result-layer/src/styles.css`

- [ ] **Step 1: Run targeted regression tests**

Run:

```bash
npm test -- tests/game/share-card-policy.test.ts
npm test -- tests/game/share-card-export.test.ts
npm test -- tests/game/dom-hud.test.ts
npm test -- tests/game/hud-bridge.test.ts
npm test -- tests/game/result-state.test.ts
npm test -- tests/smoke/source-hygiene.test.ts
npm test -- tests/smoke/app-start.test.ts
```

Expected: PASS

- [ ] **Step 2: Run production build**

Run: `npm run build`
Expected: PASS with only the known large bootstrap chunk warning.

- [ ] **Step 3: Start a fresh manual-test server**

Run:

```bash
npm run dev -- --host 0.0.0.0 --port 4177
```

Expected: local server starts and serves the updated worktree.

- [ ] **Step 4: Verify connectivity before asking for phone testing**

Run:

```bash
Invoke-WebRequest http://127.0.0.1:4177 -UseBasicParsing | Select-Object StatusCode
Invoke-WebRequest http://10.196.22.107:4177 -UseBasicParsing | Select-Object StatusCode
```

Expected: both return `200`

- [ ] **Step 5: Commit final integration changes**

```bash
git add src/game/share/shareCardPolicy.ts src/game/share/shareCardExport.ts src/game/share/shareCardPreview.ts src/game/hud/bridge.ts src/game/hud/domHud.ts src/styles.css tests/game/share-card-policy.test.ts tests/game/share-card-export.test.ts tests/game/dom-hud.test.ts tests/smoke/app-start.test.ts
git commit -m "feat: add dynamic share card flow"
```

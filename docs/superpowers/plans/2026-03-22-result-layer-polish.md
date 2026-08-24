# Result Layer Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the DOM result layer into a poster-style mobile result screen with a two-slot action row while preserving the current frozen-result architecture.

**Architecture:** Keep Phaser responsible for gameplay state, score freezing, and restart reset while the DOM HUD owns the foreground result composition. Reuse the existing `result` payload as the only result-mode source of truth, and keep the header score visually subordinate but frozen to that same payload.

**Tech Stack:** TypeScript, Phaser, DOM HUD bridge, Vite, Vitest, CSS

---

## File Map

- Modify: `src/game/hud/domHud.ts`
  Responsibility: render the polished poster layout, normal/new-best copy variants, and the disabled neutral placeholder action.
- Modify: `src/styles.css`
  Responsibility: tune card scale, spacing, action-row layout, subordinate header styling, and mobile-safe result presentation.
- Modify: `src/game/scenes/GameScene.ts` only if targeted failing verification proves the frozen score is not already published correctly.
  Responsibility: keep frozen result-mode score publishing correct without changing the architecture checkpoint.
- Test: `tests/game/dom-hud.test.ts`
  Responsibility: assert result overlay variants, frozen header score, disabled placeholder accessibility, and restart wiring.
- Test: `tests/smoke/app-start.test.ts`
  Responsibility: keep app-shell render coverage intact if result HUD structure changes touch startup expectations.
- Test: `tests/game/result-state.test.ts`
  Responsibility: keep frozen result payload assumptions stable while result-page polish work proceeds.
- Test: `tests/smoke/source-hygiene.test.ts`
  Responsibility: protect against source corruption regressions if touched indirectly.

### Task 1: Lock result overlay content and accessibility with failing tests

**Files:**
- Modify: `d:/projects/zju-cat-merge/.worktrees/result-layer/tests/game/dom-hud.test.ts`
- Test: `d:/projects/zju-cat-merge/.worktrees/result-layer/tests/game/dom-hud.test.ts`

- [ ] **Step 1: Write the failing tests**

Extend `dom-hud.test.ts` with two explicit result-mode cases.

Normal run case assertions:

```ts
expect(root.querySelector('[data-action="restart-result"]')).not.toBeNull();
expect(root.querySelector('[data-action="result-placeholder"]')).not.toBeNull();
expect(root.querySelector('[data-action="result-placeholder"]')?.getAttribute('aria-disabled')).toBe('true');
expect(root.querySelector('[data-action="result-placeholder"]')?.getAttribute('tabindex')).toBe('-1');
expect(root.textContent).toContain('RUN COMPLETE');
expect(root.textContent).toContain('FINAL SCORE');
expect(root.textContent).toContain('SCORE');
expect(root.textContent).toContain('PEAK LV');
expect(root.querySelector('[data-tool="bomb"]')).toBeNull();
```

New-best case assertions:

```ts
bridge.publish({
  isGameOver: true,
  result: { score: 82470, peakLevel: 10, isNewBest: true },
});
expect(root.textContent).toContain('NEW BEST');
expect(root.textContent).toContain('PERSONAL BEST');
```

Also add a guard that dispatching `pointerdown` on `result-placeholder` does not call restart or tool controls.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/game/dom-hud.test.ts`
Expected: FAIL because the placeholder action, new-best copy, or accessibility attributes are not all implemented yet.

- [ ] **Step 3: Write minimal implementation**

Update `src/game/hud/domHud.ts` so the result overlay includes:

```ts
<div class="hud-result-actions">
  <button class="hud-result-restart" type="button" data-action="restart-result">Restart</button>
  <button
    class="hud-result-secondary is-disabled"
    type="button"
    data-action="result-placeholder"
    aria-disabled="true"
    tabindex="-1"
  >
    More Soon
  </button>
</div>
```

Keep the existing copy branch for:
- `RUN COMPLETE` + `FINAL SCORE`
- `NEW BEST` + `PERSONAL BEST`

Do not bind any command to `result-placeholder`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/game/dom-hud.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/game/dom-hud.test.ts src/game/hud/domHud.ts
git commit -m "test: lock result overlay content contract"
```

### Task 2: Refine poster layout and bottom action row

**Files:**
- Modify: `d:/projects/zju-cat-merge/.worktrees/result-layer/src/game/hud/domHud.ts`
- Modify: `d:/projects/zju-cat-merge/.worktrees/result-layer/src/styles.css`
- Test: `d:/projects/zju-cat-merge/.worktrees/result-layer/tests/game/dom-hud.test.ts`

- [ ] **Step 1: Write the failing test**

Add stable structure assertions for the polished layout:

```ts
expect(root.querySelector('.hud-result-card')).not.toBeNull();
expect(root.querySelector('.hud-result-score')).not.toBeNull();
expect(root.querySelector('.hud-result-stats')).not.toBeNull();
expect(root.querySelector('.hud-result-actions')).not.toBeNull();
expect(root.querySelector('.hud-result-secondary.is-disabled')).not.toBeNull();
```

Keep the text assertions for `SCORE` and `PEAK LV` so the visual hierarchy and literal copy do not silently drift.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/game/dom-hud.test.ts`
Expected: FAIL because `.hud-result-actions` and the secondary-slot structure do not yet exist in the expected form.

- [ ] **Step 3: Write minimal implementation**

Refactor the result markup in `src/game/hud/domHud.ts` to group actions into a dedicated row:

```ts
<div class="hud-result-actions">
  <button class="hud-result-restart" ...>Restart</button>
  <button class="hud-result-secondary is-disabled" ...>More Soon</button>
</div>
```

Then update `src/styles.css` to:
- enlarge the result card slightly
- increase bottom padding so the action row does not press against the card edge
- keep both actions on one row on standard mobile widths
- reduce internal padding before shrinking overall width if space tightens
- keep the secondary slot visibly subdued and clearly disabled

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/game/dom-hud.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/hud/domHud.ts src/styles.css tests/game/dom-hud.test.ts
git commit -m "feat: polish result poster layout"
```

### Task 3: Verify frozen header score before changing scene logic

**Files:**
- Modify: `d:/projects/zju-cat-merge/.worktrees/result-layer/tests/game/dom-hud.test.ts`
- Modify: `d:/projects/zju-cat-merge/.worktrees/result-layer/src/game/scenes/GameScene.ts` only if the targeted test fails
- Modify: `d:/projects/zju-cat-merge/.worktrees/result-layer/src/styles.css`
- Test: `d:/projects/zju-cat-merge/.worktrees/result-layer/tests/smoke/app-start.test.ts`

- [ ] **Step 1: Write the failing verification**

Add a targeted DOM HUD test proving the visible header score is sourced from the frozen result payload during result mode:

```ts
bridge.publish({
  score: 49030,
  isGameOver: true,
  result: { score: 22670, peakLevel: 11, isNewBest: false },
});
expect(root.querySelector('.hud-score')?.textContent).toContain('22670');
expect(root.textContent).not.toContain('49030');
expect(root.querySelector('.game-hud.is-game-over')).not.toBeNull();
expect(root.querySelector('.hud-header')).not.toBeNull();
```

If startup smoke tests assert game HUD structure that this change affects, extend `app-start.test.ts` accordingly.

- [ ] **Step 2: Run test to verify it fails or confirm current behavior**

Run: `npm test -- tests/game/dom-hud.test.ts`
Run: `npm test -- tests/smoke/app-start.test.ts`
Expected:
- if the freeze contract is already correct, tests PASS and no `GameScene.ts` edit is needed
- if the header score is not frozen correctly, tests FAIL and justify a scene-level fix

- [ ] **Step 3: Write minimal implementation only if needed**

If the targeted test fails, update `src/game/scenes/GameScene.ts` so `refreshHud()` continues publishing only the frozen result score until restart.

Regardless of whether scene logic changes, update `src/styles.css` so `.game-hud.is-game-over .hud-header` remains visible but clearly subordinate to the result card.

Do not introduce a second score source or new gameplay state.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/game/dom-hud.test.ts`
Run: `npm test -- tests/smoke/app-start.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/game/scenes/GameScene.ts src/styles.css tests/game/dom-hud.test.ts tests/smoke/app-start.test.ts
git commit -m "fix: keep result header subordinate and frozen"
```

If `GameScene.ts` is unchanged because the contract already held, omit it from the commit.

### Task 4: Full verification and manual-ready checkpoint

**Files:**
- Verify: `d:/projects/zju-cat-merge/.worktrees/result-layer/src/game/hud/domHud.ts`
- Verify: `d:/projects/zju-cat-merge/.worktrees/result-layer/src/styles.css`
- Verify: `d:/projects/zju-cat-merge/.worktrees/result-layer/src/game/scenes/GameScene.ts`
- Verify: `d:/projects/zju-cat-merge/.worktrees/result-layer/tests/game/dom-hud.test.ts`
- Verify: `d:/projects/zju-cat-merge/.worktrees/result-layer/tests/game/result-state.test.ts`

- [ ] **Step 1: Run targeted regression tests**

Run:

```bash
npm test -- tests/game/result-state.test.ts
npm test -- tests/game/dom-hud.test.ts
npm test -- tests/game/hud-bridge.test.ts
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
npm run dev -- --host 0.0.0.0 --port 4176
```

Expected: local server starts and serves the updated worktree.

- [ ] **Step 4: Verify connectivity before asking for phone testing**

Run:

```bash
Invoke-WebRequest http://127.0.0.1:4176 -UseBasicParsing | Select-Object StatusCode
Invoke-WebRequest http://10.196.22.107:4176 -UseBasicParsing | Select-Object StatusCode
```

Expected: both return `200`

- [ ] **Step 5: Commit final polish changes**

```bash
git add src/game/hud/domHud.ts src/styles.css src/game/scenes/GameScene.ts tests/game/dom-hud.test.ts tests/smoke/app-start.test.ts tests/game/result-state.test.ts tests/smoke/source-hygiene.test.ts
git commit -m "feat: polish result layer poster"
```

If `GameScene.ts` was not modified in Task 3, omit it from the final commit.

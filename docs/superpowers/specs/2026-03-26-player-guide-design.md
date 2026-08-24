# Version 1.4 Player Guide Design

Date: 2026-03-26
Status: Draft for implementation

## Goal

Add a lightweight, mobile-first player guide that helps first-time players understand the loop without turning the home screen or gameplay into a blocking tutorial.

The guide must:
- explain how to start and control the drop flow
- explain merge, combo, level growth, and fail state
- mention tools as a rescue mechanic without becoming a full tool manual
- auto-run once for first-time players
- remain re-openable from home at any time
- stay resilient when gameplay numbers change

The guide must not:
- create a separate tutorial page
- force a long modal before gameplay
- duplicate gameplay logic inside UI copy
- hardcode changing numeric rules all over the UI

## Product Shape

The guide is a split onboarding flow with one home step and five in-game steps.

### Home Step

Shown as a lightweight overlay card above the home screen.

Purpose:
- tell the player how to begin
- give them a clear next action

Content:
- title: `先开一局`
- body: `点开始吸猫，先把第一只猫丢进去。`
- actions: `开始吸猫` / `跳过`

Behavior:
- auto-opens only the first time on a device/browser
- can always be reopened later from a home action labeled `玩法说明`
- closing or finishing marks the home step as seen, but does not remove manual access

### In-Game Steps

Shown as a compact guide card anchored in the upper gameplay area so it does not cover the main merge zone or tool buttons.

The first implementation uses these steps:

1. `按住拖动`
   - `按住上方小猫左右拖动，松手就会下落。`

2. `同级会合成`
   - `两只同级猫碰到一起，会自动变成更大的猫。`

3. `连起来会进 Combo`
   - `连续合成会进 Combo，现在最多 8 连。`

4. `分数越高，猫越强`
   - `分数涨上去后，后面能出的猫等级也会继续抬高。`

5. `红线满了会结束`
   - `红线撑满就结束，这时候可以用道具救场。`

Each step includes:
- a short title
- one short body line
- `下一步`
- `跳过`

On the final step, `下一步` becomes `知道了`.

## Copy Strategy

Guide copy is mostly stable text, with only a few dynamic inserts.

Reason:
- visual and writing stability matters more than reflecting every tuning detail verbatim
- design should not break every time gameplay numbers change

### Dynamic Slots

The guide system may insert only a small set of values from gameplay tuning:
- combo cap, currently `8`
- optional future milestone values if a step explicitly needs one

The guide should not automatically print large unlock tables or dense tuning numbers.

## Architecture

Create a small guide policy layer instead of scattering copy across screens.

### New Guide Policy / State Layer

A guide module should own:
- guide step definitions
- which steps belong to home vs gameplay
- dynamic interpolation for a few stable values
- persistence keys for seen / skipped state

Recommended responsibilities:
- `getGuideSteps()` or similar: return normalized step models
- `shouldAutoOpenGuide()`: determine first-run behavior
- `markGuideSeen()` / `markGuideDismissed()`
- `resetGuideProgress()` only if needed for dev/test tooling

### UI Boundaries

- `main.ts` / home shell
  - owns the home guide entry point and home-step overlay
  - owns `玩法说明` re-open action
- DOM HUD layer
  - owns the in-game guide card rendering and step progression UI
- `GameScene`
  - should not know guide copy, step order, or persistence rules
  - may only receive simple commands if needed to suppress or resume interactions

This keeps onboarding in the app/HUD layer, not inside the Phaser gameplay scene.

## Interaction Rules

### First Run

1. App opens on home
2. Home guide step auto-opens once
3. User can:
   - continue into the guide flow
   - skip directly
4. If they continue and press `开始吸猫`, gameplay starts and the in-game guide resumes from step 2

### Replay / Return Visits

- no automatic guide after first completion or first skip
- `玩法说明` remains available on home permanently
- manual open always starts from step 1 again

### Gameplay Interaction During Guide

The in-game guide should be light, but not ambiguous.

Recommended behavior:
- while a guide card is open, drop input is paused
- restart and other critical UI can remain available if they do not cause state corruption
- the guide card must never block the top score/progress readout completely
- tool buttons do not need per-tool explanation in V1; they are only referenced as rescue mechanics in the fail-state step

## Visual Direction

- same warm DOM language as the current home and leaderboard UI
- rounded compact card, not full-screen sheet
- one dominant CTA per step
- skip action visible but visually weaker
- mobile portrait first

Home step should feel like a helpful nudge.
In-game steps should feel like short coach cards, not onboarding homework.

## Persistence

Store guide state locally.

Suggested keys:
- `zju-cat-merge:guide-seen`
- `zju-cat-merge:guide-dismissed`

Behavior:
- if neither key exists, auto-open home step
- finishing all steps sets seen=true
- skipping also suppresses auto-open on later visits
- manual `玩法说明` ignores seen state and opens anyway

## Testing

Minimum regression coverage should include:
- first visit auto-opens home guide
- skip prevents future auto-open
- manual `玩法说明` still opens after seen=true
- entering gameplay from guide resumes at the first gameplay step
- guide progression reaches final step and closes cleanly
- combo cap text reads from tuning/policy instead of being duplicated in the UI
- gameplay input is suppressed while a gameplay guide step is open
- restarting or leaving gameplay clears transient guide UI without corrupting persistent seen state

## Risks

### Risk: Too much explanation
Mitigation:
- one sentence per step
- no long paragraphs
- no large rule tables

### Risk: Guide blocks gameplay flow
Mitigation:
- only one home step before gameplay
- compact upper-area cards in gameplay
- obvious skip path on every step

### Risk: Copy drifts from tuning
Mitigation:
- central guide policy with a few dynamic inserts
- do not duplicate combo cap or key milestone values across multiple files

## Success Criteria

A new player should be able to answer these after one run:
- how do I drop a cat?
- why did two cats merge?
- what is combo doing for me?
- why are later cats stronger?
- why did the run end and what can save me?

And the onboarding should still feel lighter than a dedicated tutorial page.


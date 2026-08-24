import Phaser from "phaser";

import type { HudBridge } from "../hud/bridge";
import {
  getCatRadius,
  getDropVariantPool,
  getScoreForMerge,
  getUnlockProgress,
  type QueuedCat
} from "../config/cats";
import {
  createDangerState,
  shouldCountDangerCandidate,
  updateDangerState
} from "../systems/dangerSystem";
import { createMergeQueue, enqueueMergePair, shiftNextMerge } from "../systems/mergeQueue";
import { enqueueHudAction, shiftNextHudAction, type HudActionQueue } from "../systems/hudActionQueue";
import { BOMB_DELETE_RADIUS, BOMB_KNOCKBACK_RADIUS, classifyBombImpact } from "../systems/bombEffect";
import {
  consumeComboMerge,
  createComboState,
  finalizeComboFrame,
  type ComboState
} from "../systems/comboState";
import { mergeCatLevels } from "../systems/mergeSystem";
import { COMBO_FEEDBACK_STYLE, DANGER_FEEDBACK_STYLE } from "../systems/gameplayTuning";
import {
  getMergeFeedbackStyle,
  getMergedSpawnPlacement,
  getMergeSpawnPolicy
} from "../systems/physicsPolicy";
import { getPointerUpSuppression, resolvePointerDownSuppression, shouldDropOnPointerUp, type InputActionSource, type PointerUpSuppression } from "../systems/inputPolicy";
import { buildResultPayload, type ResultPayload } from "../systems/resultState";
import { getGameUiLayout, getPreviewSpawnY, type GameUiLayout } from "../systems/uiPolicy";
import {
  awardScore,
  createRunState,
  dropCurrentCat,
  rerollQueuedNext,
  tickRunState
} from "../systems/runState";
import {
  activateTargetTool,
  applyDestructiveToolUse,
  cancelTargetTool,
  consumeInstantTool,
  createToolState,
  tickToolState,
  type ToolKind,
  type ToolState
} from "../systems/toolState";

type BallBody = Phaser.Physics.Matter.Image & {
  __ballId?: string;
  __mergeLocked?: boolean;
  __spawnedAt?: number;
};

type CatBall = {
  id: string;
  level: number;
  assetKey: string;
  radius: number;
  body: BallBody;
  face: Phaser.GameObjects.Image;
};

type ToolButton = {
  kind: ToolKind;
  shadow: Phaser.GameObjects.Ellipse;
  background: Phaser.GameObjects.Ellipse;
  icon: Phaser.GameObjects.Text;
  label: Phaser.GameObjects.Text;
  count: Phaser.GameObjects.Text;
};

const BEST_SCORE_KEY = "zju-cat-merge:best-score";

function readStoredBestScore(): number {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return 0;
    }

    const value = Number(window.localStorage.getItem(BEST_SCORE_KEY) ?? "0");
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  } catch {
    return 0;
  }
}

function writeStoredBestScore(score: number): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }

    window.localStorage.setItem(BEST_SCORE_KEY, String(Math.max(0, score)));
  } catch {
    // Ignore storage failures; result flow should still work in-memory.
  }
}

export class GameScene extends Phaser.Scene {
  private runState = createRunState(12345);
  private toolState: ToolState = createToolState();
  private dangerState = createDangerState();
  private pointerX = 222;
  private isAiming = false;
  private scoreText?: Phaser.GameObjects.Text;
  private unlockText?: Phaser.GameObjects.Text;
  private unlockFill?: Phaser.GameObjects.Rectangle;
  private nextText?: Phaser.GameObjects.Text;
  private nextPreviewBase?: Phaser.GameObjects.Image;
  private nextPreviewFace?: Phaser.GameObjects.Image;
  private holdPreviewBase?: Phaser.GameObjects.Image;
  private holdPreviewFace?: Phaser.GameObjects.Image;
  private holdPreviewText?: Phaser.GameObjects.Text;
  private cooldownText?: Phaser.GameObjects.Text;
  private scoreSubtitleText?: Phaser.GameObjects.Text;
  private dangerFill?: Phaser.GameObjects.Rectangle;
  private dangerGlow?: Phaser.GameObjects.Rectangle;
  private dangerLine?: Phaser.GameObjects.Line;
  private aimLine?: Phaser.GameObjects.Graphics;
  private comboText?: Phaser.GameObjects.Text;
  private restartButton?: Phaser.GameObjects.Rectangle;
  private restartButtonText?: Phaser.GameObjects.Text;
  private targetHintText?: Phaser.GameObjects.Text;
  private redLineY = 248;
  private aimLineEndY = 286;
  private previewSpawnY = 224;
  private playfieldTop = 104;
  private playfieldBottom = 676;
  private leftWallX = 0;
  private rightWallX = 444;
  private ballIdCounter = 0;
  private balls = new Map<string, CatBall>();
  private mergeQueue = createMergeQueue();
  private comboState: ComboState = createComboState();
  private pendingHudActions: HudActionQueue = [];
  private toolButtons: ToolButton[] = [];
  private pointerUpSuppression: PointerUpSuppression = "none";
  private uiLayout?: GameUiLayout;
  private hudBridge?: HudBridge;
  private useDomHud = false;
  private highestLevelReached = 1;
  private bestScore = 0;
  private resultPayload?: ResultPayload;

  constructor(bridge?: HudBridge) {
    super("game");
    this.hudBridge = bridge;
  }

  create(): void {
    const width = this.scale.width;
    const height = this.scale.height;

    this.cameras.main.setBackgroundColor("#fbf4e3");
    this.pointerX = width / 2;
    this.useDomHud = Boolean(this.hudBridge);
    this.uiLayout = getGameUiLayout(width, height);
    this.playfieldTop = this.uiLayout.playfield.top;
    this.playfieldBottom = this.uiLayout.playfield.bottom;
    this.leftWallX = this.uiLayout.playfield.left;
    this.rightWallX = this.uiLayout.playfield.right;
    this.redLineY = this.playfieldTop + 144;
    this.aimLineEndY = this.redLineY + 38;
    this.previewSpawnY = getPreviewSpawnY(this.playfieldTop, this.redLineY);
    this.highestLevelReached = this.runState.queuedNext.level;
    this.bestScore = readStoredBestScore();

    this.hudBridge?.bindControls({
      restartRound: () => this.restartRoundFromHud(),
      triggerTool: (tool) => this.triggerToolFromHud(tool),
    });

    this.ensureBallTexture();
    this.drawHudFrame(width, height);
    this.createBounds(width, height);
    this.registerInput(width);
    this.registerCollisions();
    this.refreshHud();
    this.updateHoldPreview();
  }

  update(_: number, delta: number): void {
    this.processPendingHudActions();
    this.runState = tickRunState(this.runState, delta);
    this.toolState = tickToolState(this.toolState, delta);
    this.syncBallFaces();

    const now = this.time.now;
    const dangerActive = Array.from(this.balls.values()).some((ball) => {
      const speed = Math.hypot(ball.body.body.velocity.x, ball.body.body.velocity.y);
      const top = ball.body.y - ball.radius;
      const ageMs = now - (ball.body.__spawnedAt ?? now);

      return shouldCountDangerCandidate({
        topY: top,
        redLineY: this.redLineY,
        speed,
        ageMs
      });
    });

    this.dangerState = updateDangerState(this.dangerState, {
      deltaMs: delta,
      isAboveLine: dangerActive,
      isStable: dangerActive,
      immunityMs: this.toolState.immunityMs
    });

    if (this.dangerState.isGameOver) {
      if (!this.resultPayload) {
        this.freezeResultPayload();
      }
      this.toolState = cancelTargetTool(this.toolState);
      this.mergeQueue = createMergeQueue();
      this.comboState = createComboState();
      this.clearComboFeedback();
      this.refreshHud();
      this.redrawAimLine();
      this.updateHoldPreview();
      return;
    }

    const resolvedMergesThisFrame = this.processPendingMerges();
    this.comboState = finalizeComboFrame(this.comboState, delta, resolvedMergesThisFrame);
    if (this.comboState.comboCount === 0) {
      this.clearComboFeedback();
    }
    this.refreshHud();
    this.redrawAimLine();
    this.updateHoldPreview();
  }

  private ensureBallTexture(): void {
    if (this.textures.exists("cat-ball-base")) {
      return;
    }

    const size = 160;
    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xf6e6c8, 1);
    g.fillCircle(size / 2, size / 2, 70);
    g.lineStyle(6, 0xe8c79d, 1);
    g.strokeCircle(size / 2, size / 2, 70);
    g.fillStyle(0xffffff, 0.42);
    g.fillEllipse(size / 2 - 18, size / 2 - 26, 48, 28);
    g.generateTexture("cat-ball-base", size, size);
    g.destroy();
  }

  private drawHudFrame(width: number, height: number): void {
    if (this.useDomHud) {
      this.targetHintText = this.add
        .text(width / 2, this.playfieldTop + 14, "", {
          color: "#c46d40",
          fontFamily: "Microsoft YaHei UI",
          fontSize: "14px",
          fontStyle: "bold",
          stroke: "#fff7ea",
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(9)
        .setVisible(false);

      this.dangerGlow = this.add.rectangle(width / 2, this.redLineY, width - 24, DANGER_FEEDBACK_STYLE.glowHeight, DANGER_FEEDBACK_STYLE.lowColor, 0).setDepth(2).setVisible(false);
      this.dangerLine = this.add.line(width / 2, this.redLineY, 0, 0, width - 24, 0, DANGER_FEEDBACK_STYLE.lowColor, DANGER_FEEDBACK_STYLE.lineBaseAlpha).setLineWidth(DANGER_FEEDBACK_STYLE.lineBaseWidth);

      this.holdPreviewBase = this.add.image(width / 2, this.previewSpawnY, "cat-ball-base").setDisplaySize(56, 56).setTint(0xfff4e8);
      this.holdPreviewFace = this.add.image(width / 2, this.previewSpawnY, "cat-1").setDisplaySize(40, 40);
      this.holdPreviewText = this.add
        .text(width / 2, this.previewSpawnY - 40, "", {
          color: "#8b5e3c",
          fontFamily: "Microsoft YaHei UI",
          fontSize: "13px",
          fontStyle: "bold",
        })
        .setOrigin(0.5, 0.5);

      this.comboText = this.add
        .text(width / 2, this.getComboFeedbackY(), "", {
          color: COMBO_FEEDBACK_STYLE.baseColor,
          fontFamily: "Microsoft YaHei UI",
          fontSize: `${COMBO_FEEDBACK_STYLE.fontSizePx}px`,
          fontStyle: "bold",
          align: "center",
          stroke: COMBO_FEEDBACK_STYLE.strokeColor,
          strokeThickness: COMBO_FEEDBACK_STYLE.strokeThicknessPx,
        })
        .setOrigin(0.5)
        .setDepth(12)
        .setAlpha(0)
        .setVisible(false);
      this.comboText.setShadow(0, COMBO_FEEDBACK_STYLE.shadowOffsetY, COMBO_FEEDBACK_STYLE.shadowColor, COMBO_FEEDBACK_STYLE.shadowBlur, true, true);


      this.aimLine = this.add.graphics();
      return;
    }


    const layout = this.uiLayout ?? getGameUiLayout(width, height);

    this.add.rectangle(width / 2, layout.header.height / 2, width, layout.header.height, layout.header.backgroundColor, 1);

    this.nextPreviewBase = this.add
      .image(layout.header.next.x, layout.header.next.y, "cat-ball-base")
      .setDisplaySize(layout.header.next.radius * 2, layout.header.next.radius * 2)
      .setTint(0xfff5e8);
    this.nextPreviewFace = this.add
      .image(layout.header.next.x, layout.header.next.y, "cat-1")
      .setDisplaySize(layout.header.next.radius * 1.35, layout.header.next.radius * 1.35);

    this.add.rectangle(
      layout.header.progress.x,
      layout.header.progress.y,
      layout.header.progress.width,
      layout.header.progress.height,
      0xfff4e8,
      0.96,
    );
    this.add.rectangle(
      layout.header.progress.x,
      layout.header.progress.y,
      layout.header.progress.width - 22,
      12,
      0x6d7388,
      0.48,
    );
    this.unlockFill = this.add.rectangle(
      layout.header.progress.x - (layout.header.progress.width - 22) / 2,
      layout.header.progress.y,
      0,
      12,
      0xf7b94c,
      1,
    ).setOrigin(0, 0.5);
    this.unlockText = this.add
      .text(layout.header.progress.x - layout.header.progress.width / 2 + 18, layout.header.progress.y - 16, "Lv.1", {
        color: "#d9dceb",
        fontFamily: "Microsoft YaHei UI",
        fontSize: "12px",
        fontStyle: "bold",
      })
      .setOrigin(0, 0.5);
    this.cooldownText = this.add
      .text(layout.header.progress.x + layout.header.progress.width / 2 - 18, layout.header.progress.y - 16, "Lv.2", {
        color: "#d9dceb",
        fontFamily: "Microsoft YaHei UI",
        fontSize: "12px",
        fontStyle: "bold",
      })
      .setOrigin(1, 0.5);

    this.restartButton = this.add
      .ellipse(
        layout.header.restart.x,
        layout.header.restart.y,
        layout.header.restart.radius * 2,
        layout.header.restart.radius * 2,
        0xfff4e8,
        0.98,
      )
      .setDepth(7)
      .setInteractive({ useHandCursor: true });
    this.restartButtonText = this.add
      .text(layout.header.restart.x, layout.header.restart.y, "R", {
        color: "#1c8b73",
        fontFamily: "Microsoft YaHei UI",
        fontSize: "20px",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(8);
    this.restartButton.on("pointerdown", (_pointer: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      this.pointerUpSuppression = getPointerUpSuppression("playfield")
      this.resetRound("playfield");
    });

    this.scoreText = this.add
      .text(layout.scoreDisplay.valueX, layout.scoreDisplay.valueY, "0", {
        color: layout.scoreDisplay.accentColor,
        fontFamily: "Microsoft YaHei UI",
        fontSize: "58px",
        fontStyle: "bold",
        stroke: "#fff7ea",
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    this.scoreSubtitleText = this.add
      .text(layout.scoreDisplay.valueX, layout.scoreDisplay.subtitleY, layout.scoreDisplay.subtitle, {
        color: "#90939f",
        fontFamily: "Microsoft YaHei UI",
        fontSize: "18px",
        letterSpacing: 6,
      })
      .setOrigin(0.5);

    this.nextText = this.add
      .text(layout.header.next.x, layout.header.next.y + 38, "NEXT", {
        color: "#d9dceb",
        fontFamily: "Microsoft YaHei UI",
        fontSize: "11px",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    this.dangerFill = this.add.rectangle(18, this.redLineY - 16, 0, 6, 0xd96c5f, 0.96).setOrigin(0, 0.5).setVisible(false);

    this.targetHintText = this.add
      .text(width / 2, this.playfieldTop + 14, "", {
        color: "#c46d40",
        fontFamily: "Microsoft YaHei UI",
        fontSize: "14px",
        fontStyle: "bold",
        stroke: "#fff7ea",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(9)
      .setVisible(false);

    this.dangerGlow = this.add.rectangle(width / 2, this.redLineY, width - 24, DANGER_FEEDBACK_STYLE.glowHeight, DANGER_FEEDBACK_STYLE.lowColor, 0).setDepth(2).setVisible(false);
    this.dangerLine = this.add.line(width / 2, this.redLineY, 0, 0, width - 24, 0, DANGER_FEEDBACK_STYLE.lowColor, DANGER_FEEDBACK_STYLE.lineBaseAlpha).setLineWidth(DANGER_FEEDBACK_STYLE.lineBaseWidth);

    this.createToolButton(layout.tools.leftX, layout.tools.topY, "shake", "??", "SHAKE");
    this.createToolButton(layout.tools.leftX, layout.tools.topY + layout.tools.gapY, "hammer", "??", "HAMMER");
    this.createToolButton(layout.tools.rightX, layout.tools.topY, "bomb", "??", "BOMB");
    this.createToolButton(layout.tools.rightX, layout.tools.topY + layout.tools.gapY, "refresh", "??", "REFRESH");

    this.holdPreviewBase = this.add.image(width / 2, this.previewSpawnY, "cat-ball-base").setDisplaySize(56, 56).setTint(0xfff4e8);
    this.holdPreviewFace = this.add.image(width / 2, this.previewSpawnY, "cat-1").setDisplaySize(40, 40);
    this.holdPreviewText = this.add
      .text(width / 2, this.previewSpawnY - 40, "", {
        color: "#8b5e3c",
        fontFamily: "Microsoft YaHei UI",
        fontSize: "13px",
        fontStyle: "bold",
      })
      .setOrigin(0.5, 0.5);

    this.comboText = this.add
      .text(width / 2, this.getComboFeedbackY(), "", {
        color: COMBO_FEEDBACK_STYLE.baseColor,
        fontFamily: "Microsoft YaHei UI",
        fontSize: `${COMBO_FEEDBACK_STYLE.fontSizePx}px`,
        fontStyle: "bold",
        align: "center",
        stroke: COMBO_FEEDBACK_STYLE.strokeColor,
        strokeThickness: COMBO_FEEDBACK_STYLE.strokeThicknessPx,
      })
      .setOrigin(0.5)
      .setDepth(12)
      .setAlpha(0)
      .setVisible(false);
    this.comboText.setShadow(0, COMBO_FEEDBACK_STYLE.shadowOffsetY, COMBO_FEEDBACK_STYLE.shadowColor, COMBO_FEEDBACK_STYLE.shadowBlur, true, true);


    this.aimLine = this.add.graphics();
  }

  private freezeResultPayload(): void {
    const payload = buildResultPayload({
      score: this.runState.score,
      peakLevel: this.highestLevelReached,
      bestScore: this.bestScore,
    });

    this.resultPayload = payload;
    if (payload.isNewBest) {
      this.bestScore = payload.score;
      writeStoredBestScore(payload.score);
    }
  }

  private createToolButton(x: number, y: number, kind: ToolKind, emoji: string, labelText: string): void {
    const shadow = this.add.ellipse(x, y + 10, 68, 68, 0xd8b890, 0.18).setDepth(5);

    const background = this.add
      .ellipse(x, y, 64, 64, 0xfffaf2, 0.98)
      .setDepth(6)
      .setInteractive({ useHandCursor: true });

    const icon = this.add
      .text(x, y - 8, emoji, {
        fontFamily: "Microsoft YaHei UI",
        fontSize: "22px",
      })
      .setOrigin(0.5)
      .setDepth(7);

    const label = this.add
      .text(x, y + 16, labelText, {
        color: "#3f3127",
        fontFamily: "Microsoft YaHei UI",
        fontSize: "10px",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(7);

    const count = this.add
      .text(x, y + 30, "x0", {
        color: "#8b5e3c",
        fontFamily: "Microsoft YaHei UI",
        fontSize: "9px",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setDepth(7);

    background.on("pointerdown", (_pointer: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      this.pointerUpSuppression = getPointerUpSuppression("playfield")
      this.handleToolButton(kind);
    });

    this.toolButtons.push({ kind, shadow, background, icon, label, count });
  }

  private createBounds(width: number, height: number): void {
    this.matter.add.rectangle(width / 2, this.playfieldBottom + 30, width + 24, 60, {
      isStatic: true,
      label: "floor"
    });
    this.matter.add.rectangle(this.leftWallX - 12, (this.playfieldTop + this.playfieldBottom) / 2, 24, height, {
      isStatic: true,
      label: "wall-left"
    });
    this.matter.add.rectangle(this.rightWallX + 12, (this.playfieldTop + this.playfieldBottom) / 2, 24, height, {
      isStatic: true,
      label: "wall-right"
    });
  }

  private registerInput(width: number): void {
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.toolState.activeTargetTool) {
        return;
      }
      this.pointerX = Phaser.Math.Clamp(pointer.x, this.leftWallX + 26, this.rightWallX - 26);
      this.isAiming = pointer.isDown;
    });

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.dangerState.isGameOver) {
        return;
      }

      if (this.toolState.activeTargetTool) {
        this.pointerUpSuppression = getPointerUpSuppression("playfield");
        this.tryResolveTargetTool(pointer.x, pointer.y);
        return;
      }

      this.pointerUpSuppression = resolvePointerDownSuppression(
        this.pointerUpSuppression,
        Boolean(this.toolState.activeTargetTool),
      );
      this.pointerX = Phaser.Math.Clamp(pointer.x, this.leftWallX + 26, this.rightWallX - 26);
      this.isAiming = true;
      this.updateHoldPreview();
    });

    this.input.on("pointerup", () => {
      this.isAiming = false;

      const shouldDrop = shouldDropOnPointerUp({
        isGameOver: this.dangerState.isGameOver,
        hasActiveTargetTool: Boolean(this.toolState.activeTargetTool),
        suppression: this.pointerUpSuppression,
      });

      if (!shouldDrop) {
        this.pointerUpSuppression = "none";
        this.updateHoldPreview();
        return;
      }

      const drop = dropCurrentCat(this.runState);
      this.runState = drop.nextState;
      if (drop.droppedCat !== null) {
        this.spawnDroppedBall(drop.droppedCat);
      }
      this.refreshHud();
      this.redrawAimLine();
      this.updateHoldPreview();
    });

    this.input.on("pointerupoutside", () => {
      this.isAiming = false;
      this.pointerUpSuppression = "none";
      this.updateHoldPreview();
    });
    this.pointerX = width / 2;
  }

  private registerCollisions(): void {
    this.matter.world.on("collisionstart", (event: Phaser.Physics.Matter.Events.CollisionStartEvent) => {
      if (this.dangerState.isGameOver) {
        return;
      }
      event.pairs.forEach((pair) => {
        const leftBody = pair.bodyA.gameObject as BallBody | undefined;
        const rightBody = pair.bodyB.gameObject as BallBody | undefined;
        const left = leftBody?.__ballId ? this.balls.get(leftBody.__ballId) : undefined;
        const right = rightBody?.__ballId ? this.balls.get(rightBody.__ballId) : undefined;

        if (!left || !right || left.id === right.id) {
          return;
        }

        if (left.body.__mergeLocked || right.body.__mergeLocked) {
          return;
        }

        const resolution = mergeCatLevels(left.level, right.level);
        if (!resolution.merged || resolution.resultLevel === null) {
          return;
        }

        left.body.__mergeLocked = true;
        right.body.__mergeLocked = true;
        this.mergeQueue = enqueueMergePair(
          this.mergeQueue,
          left.id,
          right.id,
          resolution.resultLevel,
          resolution.scoreGained
        );
      });
    });
  }

  private processPendingMerges(): boolean {
    let resolvedMerges = false;

    while (true) {
      const shifted = shiftNextMerge(this.mergeQueue);
      this.mergeQueue = shifted.queue;

      if (!shifted.next) {
        return resolvedMerges;
      }

      const left = this.balls.get(shifted.next.leftId);
      const right = this.balls.get(shifted.next.rightId);

      if (!left || !right || left.id === right.id) {
        if (left) {
          left.body.__mergeLocked = false;
        }
        if (right) {
          right.body.__mergeLocked = false;
        }
        continue;
      }

      resolvedMerges = true;
      this.resolveMerge(left, right, shifted.next.resultLevel, shifted.next.scoreGained);
    }
  }

  private resolveMerge(left: CatBall, right: CatBall, resultLevel: number, scoreGained: number): void {
    const comboResult = consumeComboMerge(this.comboState);
    this.comboState = comboResult.nextState;
    const baseScore = scoreGained || getScoreForMerge(resultLevel);
    const awardedScore = baseScore + comboResult.bonus;
    const mergedRadius = getCatRadius(resultLevel, this.rightWallX - this.leftWallX, this.playfieldBottom - this.playfieldTop);
    const placement = getMergedSpawnPlacement({
      leftX: left.body.x,
      leftY: left.body.y,
      leftRadius: left.radius,
      rightX: right.body.x,
      rightY: right.body.y,
      rightRadius: right.radius,
      mergedRadius
    });

    this.destroyBall(left);
    this.destroyBall(right);

    const mergedQueued: QueuedCat = {
      level: resultLevel,
      assetKey: this.pickMergedAssetKey(resultLevel)
    };

    const merged = this.spawnDroppedBall(mergedQueued, placement.x, placement.y, true);
    if (getMergeFeedbackStyle() === "ring") {
      this.showMergeRing(placement.x, placement.y, merged.radius);
    }

    if (comboResult.shouldShowCombo) {
      this.showComboFeedback(comboResult.nextState.comboCount, comboResult.bonus);
    } else {
      this.clearComboFeedback();
    }

    this.showScoreFloat(placement.x, placement.y - 28, awardedScore);
    this.runState = awardScore(this.runState, awardedScore);
  }

  private handleToolButton(kind: ToolKind): void {
    if (this.dangerState.isGameOver) {
      return;
    }

    if (kind === "refresh") {
      const nextState = consumeInstantTool(this.toolState, "refresh");
      if (nextState !== this.toolState) {
        this.toolState = nextState;
        this.runState = rerollQueuedNext(this.runState);
      }
      return;
    }

    if (kind === "shake") {
      const nextState = consumeInstantTool(this.toolState, "shake");
      if (nextState !== this.toolState) {
        this.toolState = nextState;
        this.applyShake();
      }
      return;
    }

    this.toolState = this.toolState.activeTargetTool === kind
      ? cancelTargetTool(this.toolState)
      : activateTargetTool(this.toolState, kind);
    this.isAiming = false;
    this.updateHoldPreview();
  }

  private applyShake(): void {
    this.balls.forEach((ball) => {
      const jitterX = Phaser.Math.FloatBetween(-5.6, 5.6);
      const boostY = Phaser.Math.FloatBetween(-12.8, -7.2);
      ball.body.setVelocity(ball.body.body.velocity.x + jitterX, boostY);
      ball.body.setAngularVelocity(Phaser.Math.FloatBetween(-0.04, 0.04));
      Phaser.Physics.Matter.Matter.Sleeping.set(ball.body.body, false);
    });
  }

  private tryResolveTargetTool(x: number, y: number): void {
    const target = this.findBallAt(x, y);
    if (!target) {
      this.toolState = cancelTargetTool(this.toolState);
      return;
    }

    const active = this.toolState.activeTargetTool;
    if (active === "hammer") {
      this.showMergeRing(target.body.x, target.body.y, target.radius);
      this.destroyBall(target);
      this.toolState = applyDestructiveToolUse(this.toolState);
      return;
    }

    if (active === "bomb") {
      this.applyBomb(target);
      this.toolState = applyDestructiveToolUse(this.toolState);
    }
  }

  private applyBomb(target: CatBall): void {
    const originX = target.body.x;
    const originY = target.body.y;
    const toDelete: CatBall[] = [target];

    this.balls.forEach((ball) => {
      if (ball.id === target.id) {
        return;
      }

      const dx = ball.body.x - originX;
      const dy = ball.body.y - originY;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const impact = classifyBombImpact(distance);

      if (impact === "delete") {
        toDelete.push(ball);
        return;
      }

      if (impact === "knockback") {
        const strength = (BOMB_KNOCKBACK_RADIUS - distance) / (BOMB_KNOCKBACK_RADIUS - BOMB_DELETE_RADIUS);
        const vx = (dx / distance) * (6.8 * strength);
        const vy = (dy / distance) * (5.6 * strength) - 4.2 * strength;
        ball.body.setVelocity(ball.body.body.velocity.x + vx, ball.body.body.velocity.y + vy);
        ball.body.setAngularVelocity(Phaser.Math.FloatBetween(-0.14, 0.14));
        Phaser.Physics.Matter.Matter.Sleeping.set(ball.body.body, false);
      }
    });

    toDelete.forEach((ball) => {
      if (this.balls.has(ball.id)) {
        this.destroyBall(ball);
      }
    });

    this.showMergeRing(originX, originY, BOMB_DELETE_RADIUS * 1.16);
    this.showMergeRing(originX, originY, BOMB_KNOCKBACK_RADIUS * 0.58);
  }

  private findBallAt(x: number, y: number): CatBall | null {
    const candidates = Array.from(this.balls.values()).filter((ball) => {
      return Phaser.Math.Distance.Between(ball.body.x, ball.body.y, x, y) <= ball.radius;
    });

    if (candidates.length === 0) {
      return null;
    }

    return candidates.sort((a, b) => b.level - a.level)[0] ?? null;
  }

  private pickMergedAssetKey(level: number): string {
    const pool = getDropVariantPool(level);
    return pool[Math.floor(Math.random() * pool.length)] ?? `cat-${level}`;
  }

  private showMergeRing(x: number, y: number, radius: number): void {
    const ring = this.add
      .circle(x, y, radius * 0.86)
      .setStrokeStyle(4, 0xf2a65a, 0.72)
      .setFillStyle(0xffffff, 0)
      .setDepth(8);

    this.tweens.add({
      targets: ring,
      scaleX: 1.26,
      scaleY: 1.26,
      alpha: 0,
      duration: 160,
      onComplete: () => ring.destroy()
    });
  }

  private showScoreFloat(x: number, y: number, scoreGained: number): void {
    const floatText = this.add
      .text(x, y, `+${scoreGained}`, {
        color: "#d27c44",
        fontFamily: "Microsoft YaHei UI",
        fontSize: "22px",
        fontStyle: "bold",
        stroke: "#fff7ea",
        strokeThickness: 5
      })
      .setOrigin(0.5)
      .setDepth(9);

    this.tweens.add({
      targets: floatText,
      y: y - 28,
      alpha: 0,
      duration: 420,
      onComplete: () => floatText.destroy()
    });
  }

  private getComboFeedbackY(): number {
    const span = this.playfieldBottom - this.playfieldTop;
    return this.playfieldTop + Math.max(COMBO_FEEDBACK_STYLE.minY, Math.min(COMBO_FEEDBACK_STYLE.maxY, span * COMBO_FEEDBACK_STYLE.playfieldRatio));
  }

  private showComboFeedback(comboCount: number, bonus: number): void {
    if (!this.comboText) {
      return;
    }

    const bonusLine = bonus > 0 ? `
BONUS +${bonus}` : "";
    const color = comboCount >= 5 ? COMBO_FEEDBACK_STYLE.peakColor : comboCount >= 4 ? COMBO_FEEDBACK_STYLE.hotColor : COMBO_FEEDBACK_STYLE.baseColor;
    this.tweens.killTweensOf(this.comboText);
    this.comboText
      .setText(`${comboCount} COMBO${bonusLine}`)
      .setPosition(this.scale.width / 2, this.getComboFeedbackY())
       .setScale(COMBO_FEEDBACK_STYLE.enterScale)
      .setAlpha(1)
      .setColor(color)
      .setVisible(true);

    this.tweens.add({
      targets: this.comboText,
      scaleX: 1,
      scaleY: 1,
      y: this.getComboFeedbackY() - COMBO_FEEDBACK_STYLE.enterOffsetY,
      duration: COMBO_FEEDBACK_STYLE.enterDurationMs,
      ease: "Back.Out",
    });
  }

  private clearComboFeedback(): void {
    if (!this.comboText) {
      return;
    }

    this.tweens.killTweensOf(this.comboText);
    this.comboText.setText("");
    this.comboText.setAlpha(0);
    this.comboText.setVisible(false);
  }

  private refreshHud(): void {
    const displayScore = this.resultPayload?.score ?? this.runState.score;
    const result = this.resultPayload
      ? {
          score: this.resultPayload.score,
          peakLevel: this.resultPayload.peakLevel,
          isNewBest: this.resultPayload.isNewBest,
        }
      : null;
    this.scoreText?.setText(String(displayScore));
    const unlock = getUnlockProgress(displayScore);
    this.nextText?.setText(`Lv.${this.runState.queuedNext.level}`);
    this.unlockText?.setText(`Lv.${unlock.currentMaxLevel}`);
    this.cooldownText?.setText(unlock.nextMaxLevel ? `Lv.${unlock.nextMaxLevel}` : `Lv.${unlock.currentMaxLevel}`);

    if (this.nextPreviewBase && this.nextPreviewFace) {
      this.nextPreviewBase.setVisible(true);
      this.nextPreviewFace.setTexture(this.runState.queuedNext.assetKey);
      this.nextPreviewFace.setDisplaySize(31, 31);
    }

    this.unlockFill?.setSize(((this.uiLayout?.header.progress.width ?? 156) - 22) * unlock.progressRatio, 12);

    const ratio = Phaser.Math.Clamp(this.dangerState.accumulatedMs / 2200, 0, 1);
    const pulse = ratio >= DANGER_FEEDBACK_STYLE.pulseStartRatio ? (Math.sin(this.time.now / DANGER_FEEDBACK_STYLE.pulseSpeedMs) + 1) / 2 : 0;
    const dangerColor = this.dangerState.isGameOver
      ? DANGER_FEEDBACK_STYLE.highColor
      : ratio >= 0.82
        ? DANGER_FEEDBACK_STYLE.highColor
        : ratio >= 0.55
          ? DANGER_FEEDBACK_STYLE.mediumColor
          : DANGER_FEEDBACK_STYLE.lowColor;
    const fillHeight = Phaser.Math.Linear(DANGER_FEEDBACK_STYLE.fillBaseHeight, DANGER_FEEDBACK_STYLE.fillPeakHeight, ratio);
    const glowAlpha = this.dangerState.isGameOver
      ? DANGER_FEEDBACK_STYLE.glowHighAlpha
      : ratio >= 0.82
        ? DANGER_FEEDBACK_STYLE.glowHighAlpha
        : ratio >= 0.55
          ? DANGER_FEEDBACK_STYLE.glowMediumAlpha
          : DANGER_FEEDBACK_STYLE.glowLowAlpha;

    this.dangerFill?.setVisible(ratio > 0);
    this.dangerFill?.setSize((this.scale.width - 36) * ratio, fillHeight);
    this.dangerFill?.setFillStyle(dangerColor, 0.96);
    this.dangerGlow?.setVisible(ratio > 0);
    this.dangerGlow?.setSize(this.scale.width - 24, DANGER_FEEDBACK_STYLE.glowHeight);
    this.dangerGlow?.setFillStyle(dangerColor, Math.min(0.48, glowAlpha + pulse * 0.08));
    this.dangerLine?.setStrokeStyle(
      DANGER_FEEDBACK_STYLE.lineBaseWidth + pulse * DANGER_FEEDBACK_STYLE.linePulseWidth,
      dangerColor,
      Math.min(1, DANGER_FEEDBACK_STYLE.lineBaseAlpha + pulse * DANGER_FEEDBACK_STYLE.linePulseAlpha),
    );

    this.hudBridge?.publish({
      score: displayScore,
      scoreLabel: "ZJU MERGE",
      nextLevel: this.runState.queuedNext.level,
      nextAssetKey: this.runState.queuedNext.assetKey,
      progressRatio: unlock.progressRatio,
      progressCurrentLabel: `Lv.${unlock.currentMaxLevel}`,
      progressNextLabel: unlock.nextMaxLevel ? `Lv.${unlock.nextMaxLevel}` : `Lv.${unlock.currentMaxLevel}`,
      toolCounts: { ...this.toolState.counts },
      activeTool: this.toolState.activeTargetTool,
      dangerRatio: ratio,
      isGameOver: this.dangerState.isGameOver,
      result,
    });

    this.toolButtons.forEach((button) => {
      const isActive = this.toolState.activeTargetTool === button.kind;
      const count = this.toolState.counts[button.kind];
      const resultVisible = Boolean(this.resultPayload);
      const dimAlpha = resultVisible ? 0.1 : 1;
      button.background.setDepth(resultVisible ? 3 : 6);
      button.shadow.setDepth(resultVisible ? 2 : 5);
      button.icon.setDepth(resultVisible ? 4 : 7);
      button.label.setDepth(resultVisible ? 4 : 7);
      button.count.setDepth(resultVisible ? 4 : 7);
      button.count.setText(resultVisible ? "" : `x${count}`);
      button.background.setFillStyle(isActive ? 0xf8d8bb : 0xfffaf2, (count > 0 ? (isActive ? 0.98 : 0.74) : 0.5) * dimAlpha);
      button.shadow.setAlpha((count > 0 ? (isActive ? 0.28 : 0.18) : 0.08) * dimAlpha);
      button.icon.setAlpha((count > 0 ? 1 : 0.38) * dimAlpha);
      button.label.setAlpha((count > 0 ? 1 : 0.38) * dimAlpha);
      button.count.setAlpha(resultVisible ? 0 : (count > 0 ? 0.9 : 0.45));
    });

    if (this.targetHintText) {
      const active = this.toolState.activeTargetTool;
      this.targetHintText.setVisible(Boolean(active));
      this.targetHintText.setText(active ? `${active.toUpperCase()} - Tap a cat` : "");
    }
  }

  private redrawAimLine(): void {
    if (!this.aimLine) {
      return;
    }

    this.aimLine.clear();
    if (!this.isAiming || this.toolState.activeTargetTool !== null) {
      return;
    }

    this.aimLine.lineStyle(2, 0x8b5e3c, 0.4);

    for (let y = this.redLineY + 8; y < this.aimLineEndY; y += 14) {
      this.aimLine.beginPath();
      this.aimLine.moveTo(this.pointerX, y);
      this.aimLine.lineTo(this.pointerX, y + 7);
      this.aimLine.strokePath();
    }
  }

  private updateHoldPreview(): void {
    if (!this.holdPreviewBase || !this.holdPreviewFace || !this.holdPreviewText) {
      return;
    }

    const visible = this.isAiming && !this.dangerState.isGameOver && this.toolState.activeTargetTool === null;
    this.holdPreviewBase.setVisible(visible);
    this.holdPreviewFace.setVisible(visible);
    this.holdPreviewText.setVisible(visible);

    if (!visible) {
      return;
    }

    this.holdPreviewBase.setPosition(this.pointerX, this.previewSpawnY);
    this.holdPreviewFace.setTexture(this.runState.queuedNext.assetKey);
    this.holdPreviewFace.setDisplaySize(44, 44);
    this.holdPreviewFace.setPosition(this.pointerX, this.previewSpawnY);
    this.holdPreviewText.setText(`Lv.${this.runState.queuedNext.level}`);
    this.holdPreviewText.setPosition(this.pointerX, this.previewSpawnY - 42);
  }

  public restartRoundFromHud(): void {
    this.pendingHudActions = enqueueHudAction(this.pendingHudActions, { kind: "restart" });
  }

  public triggerToolFromHud(tool: ToolKind): void {
    this.pendingHudActions = enqueueHudAction(this.pendingHudActions, { kind: "tool", tool });
  }

  private processPendingHudActions(): void {
    while (true) {
      const shifted = shiftNextHudAction(this.pendingHudActions);
      this.pendingHudActions = shifted.queue;

      if (!shifted.next) {
        return;
      }

      if (shifted.next.kind === "restart") {
        this.input.resetPointers();
        this.resetRound("overlay");
        continue;
      }

      this.input.resetPointers();
      this.pointerUpSuppression = getPointerUpSuppression("overlay");
      this.handleToolButton(shifted.next.tool);
    }
  }

  private resetRound(source: InputActionSource = "playfield"): void {
    this.balls.forEach((ball) => {
      ball.body.destroy();
      ball.face.destroy();
    });
    this.balls.clear();
    this.mergeQueue = createMergeQueue();
    this.comboState = createComboState();
    this.runState = createRunState(Date.now());
    this.highestLevelReached = this.runState.queuedNext.level;
    this.resultPayload = undefined;
    this.toolState = createToolState();
    this.dangerState = createDangerState();
    this.isAiming = false;
    this.pointerUpSuppression = getPointerUpSuppression(source);
    this.targetHintText?.setVisible(false);
    this.clearComboFeedback();
    this.refreshHud();
    this.redrawAimLine();
    this.updateHoldPreview();
  }

  private spawnDroppedBall(
    queued: QueuedCat,
    spawnX?: number,
    spawnY?: number,
    merged: boolean = false
  ): CatBall {
    const radius = getCatRadius(queued.level, this.rightWallX - this.leftWallX, this.playfieldBottom - this.playfieldTop);
    const x = Phaser.Math.Clamp(spawnX ?? this.pointerX, this.leftWallX + radius, this.rightWallX - radius);
    const y = spawnY ?? this.previewSpawnY;

    const body = this.matter.add.image(x, y, "cat-ball-base") as BallBody;
    body.setDisplaySize(radius * 2, radius * 2);
    body.setCircle(radius);
    body.setBounce(0.04);
    body.setFriction(0.08, 0.001, 0.03);
    body.setFrictionAir(0.02);
    body.setDepth(3);
    body.__mergeLocked = false;
    body.__spawnedAt = this.time.now;

    const face = this.add.image(x, y, queued.assetKey).setDisplaySize(radius * 1.45, radius * 1.45).setDepth(4);

    const ball: CatBall = {
      id: `ball-${this.ballIdCounter += 1}`,
      level: queued.level,
      assetKey: queued.assetKey,
      radius,
      body,
      face
    };

    body.__ballId = ball.id;
    this.balls.set(ball.id, ball);
    this.highestLevelReached = Math.max(this.highestLevelReached, queued.level);

    if (merged) {
      const policy = getMergeSpawnPolicy();
      body.setAngularVelocity(0);
      body.setVelocity(0, policy.impulseY);
      body.setIgnoreGravity(false);
      Phaser.Physics.Matter.Matter.Sleeping.set(body.body, false);
      body.__spawnedAt = this.time.now;
    }

    return ball;
  }

  private destroyBall(ball: CatBall): void {
    this.balls.delete(ball.id);
    ball.body.destroy();
    ball.face.destroy();
  }

  private syncBallFaces(): void {
    const boardAlpha = this.resultPayload ? 0.18 : 1;

    this.balls.forEach((ball) => {
      ball.face.setPosition(ball.body.x, ball.body.y);
      ball.face.setRotation(ball.body.rotation);
      ball.face.setAlpha(boardAlpha);
      ball.body.setAlpha(boardAlpha);
    });
  }
}





















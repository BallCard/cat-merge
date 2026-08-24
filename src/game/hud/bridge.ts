import type { ToolKind } from "../systems/toolState";

export type HudResultState = {
  score: number;
  peakLevel: number;
  isNewBest: boolean;
};

export type HudState = {
  score: number;
  scoreLabel: string;
  nextLevel: number;
  nextAssetKey: string;
  progressRatio: number;
  progressCurrentLabel: string;
  progressNextLabel: string;
  toolCounts: Record<ToolKind, number>;
  activeTool: ToolKind | null;
  dangerRatio: number;
  isGameOver: boolean;
  result: HudResultState | null;
};

export type HudControls = {
  restartRound: () => void;
  triggerTool: (tool: ToolKind) => void;
  shareResult?: () => void;
};

type HudListener = (state: HudState) => void;

const DEFAULT_STATE: HudState = {
  score: 0,
  scoreLabel: "ZJU MERGE",
  nextLevel: 1,
  nextAssetKey: "cat-1",
  progressRatio: 0,
  progressCurrentLabel: "Lv.1",
  progressNextLabel: "Lv.2",
  toolCounts: {
    refresh: 2,
    shake: 1,
    hammer: 1,
    bomb: 1,
  },
  activeTool: null,
  dangerRatio: 0,
  isGameOver: false,
  result: null,
};

export type HudBridge = {
  getState: () => HudState;
  publish: (partial: Partial<HudState>) => void;
  subscribe: (listener: HudListener) => () => void;
  bindControls: (controls: HudControls) => void;
  restart: () => void;
  useTool: (tool: ToolKind) => void;
  shareResult: () => void;
};

export function createHudBridge(initial?: Partial<HudState>): HudBridge {
  let state: HudState = { ...DEFAULT_STATE, ...initial };
  let controls: HudControls | null = null;
  const listeners = new Set<HudListener>();

  return {
    getState: () => state,
    publish: (partial) => {
      state = { ...state, ...partial };
      listeners.forEach((listener) => listener(state));
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    bindControls: (nextControls) => {
      controls = nextControls;
    },
    restart: () => {
      controls?.restartRound();
    },
    useTool: (tool) => {
      controls?.triggerTool(tool);
    },
    shareResult: () => {
      controls?.shareResult?.();
    },
  };
}

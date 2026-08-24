export type ToolKind = "refresh" | "shake" | "hammer" | "bomb";
export type TargetToolKind = "hammer" | "bomb";

export type ToolCounts = Record<ToolKind, number>;

export type ToolState = {
  counts: ToolCounts;
  activeTargetTool: TargetToolKind | null;
  immunityMs: number;
};

const DESTRUCTIVE_IMMUNITY_MS = 1800;

export function createToolState(): ToolState {
  return {
    counts: {
      refresh: 2,
      shake: 1,
      hammer: 1,
      bomb: 1
    },
    activeTargetTool: null,
    immunityMs: 0
  };
}

export function tickToolState(state: ToolState, deltaMs: number): ToolState {
  return {
    ...state,
    immunityMs: Math.max(0, state.immunityMs - deltaMs)
  };
}

export function consumeInstantTool(state: ToolState, tool: Extract<ToolKind, "refresh" | "shake">): ToolState {
  if (state.counts[tool] <= 0) {
    return state;
  }

  return {
    ...state,
    counts: {
      ...state.counts,
      [tool]: state.counts[tool] - 1
    },
    immunityMs: tool === "shake" ? DESTRUCTIVE_IMMUNITY_MS : state.immunityMs
  };
}

export function activateTargetTool(state: ToolState, tool: TargetToolKind): ToolState {
  if (state.counts[tool] <= 0) {
    return state;
  }

  return {
    ...state,
    activeTargetTool: tool
  };
}

export function cancelTargetTool(state: ToolState): ToolState {
  return {
    ...state,
    activeTargetTool: null
  };
}

export function applyDestructiveToolUse(state: ToolState): ToolState {
  if (!state.activeTargetTool || state.counts[state.activeTargetTool] <= 0) {
    return state;
  }

  return {
    counts: {
      ...state.counts,
      [state.activeTargetTool]: state.counts[state.activeTargetTool] - 1
    },
    activeTargetTool: null,
    immunityMs: DESTRUCTIVE_IMMUNITY_MS
  };
}

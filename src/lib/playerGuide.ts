import { MAX_COMBO_COUNT } from "../game/systems/gameplayTuning";

export const PLAYER_GUIDE_VERSION = "2026-03-26-v1";
export const PLAYER_GUIDE_STATE_KEY = "zju-cat-merge:player-guide";

export type PlayerGuideStep = {
  id: string;
  title: string;
  body: string;
  primaryLabel: string;
  secondaryLabel: string;
};

export type PlayerGuideFlow = {
  version: string;
  homeStep: PlayerGuideStep;
  gameplaySteps: PlayerGuideStep[];
};

export type PlayerGuideStatus = "completed" | "skipped";

export type StoredPlayerGuideState = {
  version: string;
  status: PlayerGuideStatus;
};

function getStorage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }
    const storage = window.localStorage;
    return typeof storage.getItem === "function" &&
      typeof storage.setItem === "function" &&
      typeof storage.removeItem === "function"
      ? storage
      : null;
  } catch {
    return null;
  }
}

export function buildPlayerGuideFlow(maxComboCount = MAX_COMBO_COUNT): PlayerGuideFlow {
  return {
    version: PLAYER_GUIDE_VERSION,
    homeStep: {
      id: "home-start",
      title: "先开一局",
      body: "点开始吸猫，先把第一只猫丢进去。",
      primaryLabel: "开始吸猫",
      secondaryLabel: "跳过",
    },
    gameplaySteps: [
      {
        id: "drag-drop",
        title: "按住拖动",
        body: "按住上方小猫左右拖动，松手就会下落。",
        primaryLabel: "下一步",
        secondaryLabel: "跳过",
      },
      {
        id: "merge",
        title: "同级会合成",
        body: "两只同级猫碰到一起，会自动变成更大的猫。",
        primaryLabel: "下一步",
        secondaryLabel: "跳过",
      },
      {
        id: "combo",
        title: "连起来会进 Combo",
        body: `连续合成会进 Combo，现在最多 ${maxComboCount} 连。`,
        primaryLabel: "下一步",
        secondaryLabel: "跳过",
      },
      {
        id: "level-growth",
        title: "分数越高，猫越强",
        body: "分数涨上去后，后面能出的猫等级也会继续抬高。",
        primaryLabel: "下一步",
        secondaryLabel: "跳过",
      },
      {
        id: "danger-tools",
        title: "红线满了会结束",
        body: "红线撑满就结束，这时候可以用道具救场。",
        primaryLabel: "知道了",
        secondaryLabel: "跳过",
      },
    ],
  };
}

export function readPlayerGuideState(): StoredPlayerGuideState | null {
  const raw = getStorage()?.getItem(PLAYER_GUIDE_STATE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredPlayerGuideState>;
    if (!parsed.version || (parsed.status !== "completed" && parsed.status !== "skipped")) {
      return null;
    }
    return {
      version: parsed.version,
      status: parsed.status,
    };
  } catch {
    return null;
  }
}

function writePlayerGuideState(state: StoredPlayerGuideState): void {
  getStorage()?.setItem(PLAYER_GUIDE_STATE_KEY, JSON.stringify(state));
}

export function shouldAutoOpenPlayerGuide(version = PLAYER_GUIDE_VERSION): boolean {
  const state = readPlayerGuideState();
  return !state || state.version !== version;
}

export function markPlayerGuideCompleted(version = PLAYER_GUIDE_VERSION): void {
  writePlayerGuideState({ version, status: "completed" });
}

export function markPlayerGuideSkipped(version = PLAYER_GUIDE_VERSION): void {
  writePlayerGuideState({ version, status: "skipped" });
}

export function clearPlayerGuideState(): void {
  getStorage()?.removeItem(PLAYER_GUIDE_STATE_KEY);
}

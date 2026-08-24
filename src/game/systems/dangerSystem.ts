export type DangerState = {
  accumulatedMs: number;
  immunityMs: number;
  isGameOver: boolean;
};

export type DangerUpdateInput = {
  deltaMs: number;
  isAboveLine: boolean;
  isStable: boolean;
  immunityMs: number;
};

export type DangerCandidateInput = {
  topY: number;
  redLineY: number;
  speed: number;
  ageMs: number;
};

const GAME_OVER_THRESHOLD_MS = 2200;
const DECAY_MULTIPLIER = 2;
const DANGER_SETTLE_SPEED = 0.9;
const DANGER_MIN_AGE_MS = 650;

export function createDangerState(): DangerState {
  return {
    accumulatedMs: 0,
    immunityMs: 0,
    isGameOver: false
  };
}

export function shouldCountDangerCandidate(input: DangerCandidateInput): boolean {
  if (input.topY >= input.redLineY) {
    return false;
  }

  if (input.ageMs < DANGER_MIN_AGE_MS) {
    return false;
  }

  return input.speed < DANGER_SETTLE_SPEED;
}

export function updateDangerState(
  current: DangerState,
  input: DangerUpdateInput
): DangerState {
  const remainingImmunity = Math.max(
    0,
    Math.max(current.immunityMs, input.immunityMs) - input.deltaMs
  );

  if (remainingImmunity > 0) {
    return {
      accumulatedMs: current.accumulatedMs,
      immunityMs: remainingImmunity,
      isGameOver: false
    };
  }

  const isDangerActive = input.isAboveLine && input.isStable;
  const accumulatedMs = isDangerActive
    ? Math.min(GAME_OVER_THRESHOLD_MS, current.accumulatedMs + input.deltaMs)
    : Math.max(0, current.accumulatedMs - input.deltaMs * DECAY_MULTIPLIER);

  return {
    accumulatedMs,
    immunityMs: 0,
    isGameOver: accumulatedMs >= GAME_OVER_THRESHOLD_MS
  };
}

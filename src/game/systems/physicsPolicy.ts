export const MATTER_ENABLE_SLEEP = false;

export type MergeSpawnPolicy = {
  useStaticSettle: boolean;
  impulseY: number;
};

export type MergedSpawnInput = {
  leftX: number;
  leftY: number;
  leftRadius: number;
  rightX: number;
  rightY: number;
  rightRadius: number;
  mergedRadius: number;
};

export type MergedSpawnPlacement = {
  x: number;
  y: number;
};

export function getMergeSpawnPolicy(): MergeSpawnPolicy {
  return {
    useStaticSettle: false,
    impulseY: 0.35
  };
}

export function getMergedSpawnPlacement(input: MergedSpawnInput): MergedSpawnPlacement {
  const sourceTop = Math.min(input.leftY - input.leftRadius, input.rightY - input.rightRadius);
  const sourceCenterX = (input.leftX + input.rightX) / 2;
  const sourceRadius = Math.min(input.leftRadius, input.rightRadius);
  const growthLift = Math.max(12, input.mergedRadius - sourceRadius + 12);

  return {
    x: sourceCenterX,
    y: sourceTop - input.mergedRadius - growthLift
  };
}

export function shouldAnimatePhysicsBodyOnMerge(): boolean {
  return false;
}

export function getMergeFeedbackStyle(): "ring" {
  return "ring";
}

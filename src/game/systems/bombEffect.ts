export const BOMB_DELETE_RADIUS = 60;
export const BOMB_KNOCKBACK_RADIUS = 164;

export type BombImpact = "delete" | "knockback" | "none";

export function classifyBombImpact(distance: number): BombImpact {
  if (distance <= BOMB_DELETE_RADIUS) {
    return "delete";
  }

  if (distance <= BOMB_KNOCKBACK_RADIUS) {
    return "knockback";
  }

  return "none";
}

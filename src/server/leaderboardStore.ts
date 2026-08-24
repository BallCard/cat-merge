import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type StoredPlayer = {
  anonymousId: string;
  nickname: string;
  bestScore: number;
  bestPeakLevel: number;
  createdAt: string;
  updatedAt: string;
};

type LeaderboardStoreData = {
  players: StoredPlayer[];
};

export type LeaderboardListEntry = {
  rank: number;
  anonymousId: string;
  nickname: string;
  score: number;
  peakLevel: number;
  isSelf: boolean;
};

export type LeaderboardMeEntry = {
  anonymousId: string;
  nickname: string;
  score: number;
  peakLevel: number;
  rank: number | null;
};

const DEFAULT_STORE: LeaderboardStoreData = { players: [] };
const STORE_PATH = process.env.LEADERBOARD_STORE_PATH
  ? path.resolve(process.env.LEADERBOARD_STORE_PATH)
  : path.resolve(process.cwd(), ".data", "leaderboard.json");

let writeChain = Promise.resolve();

async function ensureStoreDir(): Promise<void> {
  await mkdir(path.dirname(STORE_PATH), { recursive: true });
}

async function readStore(): Promise<LeaderboardStoreData> {
  await ensureStoreDir();

  try {
    const raw = await readFile(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as LeaderboardStoreData;
    return {
      players: Array.isArray(parsed.players) ? parsed.players : [],
    };
  } catch {
    return { ...DEFAULT_STORE };
  }
}

async function writeStore(data: LeaderboardStoreData): Promise<void> {
  await ensureStoreDir();
  await writeFile(STORE_PATH, JSON.stringify(data, null, 2), "utf8");
}

function sortPlayers(players: StoredPlayer[]): StoredPlayer[] {
  return [...players].sort((left, right) => {
    if (right.bestScore !== left.bestScore) {
      return right.bestScore - left.bestScore;
    }
    if (right.bestPeakLevel !== left.bestPeakLevel) {
      return right.bestPeakLevel - left.bestPeakLevel;
    }
    return left.updatedAt.localeCompare(right.updatedAt);
  });
}

function normalizeNickname(nickname: string): string {
  const trimmed = nickname.trim();
  return trimmed.slice(0, 12) || "匿名同学";
}

export async function initPlayer(input: { anonymousId: string; nickname: string }): Promise<{ anonymousId: string; nickname: string }> {
  return mutateStore(async (store) => {
    const now = new Date().toISOString();
    const nickname = normalizeNickname(input.nickname);
    const existing = store.players.find((player) => player.anonymousId === input.anonymousId);

    if (existing) {
      existing.nickname = nickname;
      existing.updatedAt = now;
      return { anonymousId: existing.anonymousId, nickname: existing.nickname };
    }

    store.players.push({
      anonymousId: input.anonymousId,
      nickname,
      bestScore: 0,
      bestPeakLevel: 1,
      createdAt: now,
      updatedAt: now,
    });

    return { anonymousId: input.anonymousId, nickname };
  });
}

export async function updateNickname(input: { anonymousId: string; nickname: string }): Promise<{ anonymousId: string; nickname: string }> {
  return mutateStore(async (store) => {
    const player = store.players.find((entry) => entry.anonymousId === input.anonymousId);
    const nickname = normalizeNickname(input.nickname);
    const now = new Date().toISOString();

    if (!player) {
      store.players.push({
        anonymousId: input.anonymousId,
        nickname,
        bestScore: 0,
        bestPeakLevel: 1,
        createdAt: now,
        updatedAt: now,
      });
      return { anonymousId: input.anonymousId, nickname };
    }

    player.nickname = nickname;
    player.updatedAt = now;
    return { anonymousId: player.anonymousId, nickname: player.nickname };
  });
}

export async function submitScore(input: { anonymousId: string; nickname: string; score: number; peakLevel: number }): Promise<{ accepted: boolean; me: LeaderboardMeEntry | null }> {
  return mutateStore(async (store) => {
    const now = new Date().toISOString();
    const nickname = normalizeNickname(input.nickname);
    let player = store.players.find((entry) => entry.anonymousId === input.anonymousId);

    if (!player) {
      player = {
        anonymousId: input.anonymousId,
        nickname,
        bestScore: 0,
        bestPeakLevel: 1,
        createdAt: now,
        updatedAt: now,
      };
      store.players.push(player);
    }

    player.nickname = nickname;

    const shouldUpdate =
      input.score > player.bestScore ||
      (input.score === player.bestScore && input.peakLevel > player.bestPeakLevel);

    if (shouldUpdate) {
      player.bestScore = Math.max(0, Math.floor(input.score));
      player.bestPeakLevel = Math.max(1, Math.floor(input.peakLevel));
      player.updatedAt = now;
    }

    return {
      accepted: shouldUpdate,
      me: buildMeEntry(store.players, input.anonymousId),
    };
  });
}

export async function listLeaderboard(anonymousId: string | null, limit = 20): Promise<{ entries: LeaderboardListEntry[]; me: LeaderboardMeEntry | null }> {
  const store = await readStore();
  const ranked = sortPlayers(store.players)
    .filter((player) => player.bestScore > 0)
    .map((player, index) => ({
      rank: index + 1,
      anonymousId: player.anonymousId,
      nickname: player.nickname,
      score: player.bestScore,
      peakLevel: player.bestPeakLevel,
      isSelf: anonymousId === player.anonymousId,
    }));

  return {
    entries: ranked.slice(0, limit),
    me: anonymousId ? buildMeEntry(store.players, anonymousId) : null,
  };
}

export async function getMe(anonymousId: string): Promise<LeaderboardMeEntry | null> {
  const store = await readStore();
  return buildMeEntry(store.players, anonymousId);
}

function buildMeEntry(players: StoredPlayer[], anonymousId: string): LeaderboardMeEntry | null {
  const ranked = sortPlayers(players).filter((player) => player.bestScore > 0);
  const player = players.find((entry) => entry.anonymousId === anonymousId);
  if (!player) {
    return null;
  }

  const rankedIndex = ranked.findIndex((entry) => entry.anonymousId === anonymousId);
  return {
    anonymousId: player.anonymousId,
    nickname: player.nickname,
    score: player.bestScore,
    peakLevel: player.bestPeakLevel,
    rank: rankedIndex >= 0 ? rankedIndex + 1 : null,
  };
}

async function mutateStore<T>(mutator: (store: LeaderboardStoreData) => Promise<T> | T): Promise<T> {
  const run = async (): Promise<T> => {
    const store = await readStore();
    const result = await mutator(store);
    await writeStore(store);
    return result;
  };

  const pending = writeChain.then(run, run);
  writeChain = pending.then(() => undefined, () => undefined);
  return pending;
}

import { getOrCreateAnonymousId } from "./player";

export type LeaderboardEntry = {
  rank: number;
  nickname: string;
  score: number;
  peakLevel: number;
  anonymousId: string;
  isSelf: boolean;
};

export type LeaderboardMe = {
  nickname: string;
  score: number;
  peakLevel: number;
  rank: number | null;
  anonymousId: string;
};

export type LeaderboardSnapshot = {
  entries: LeaderboardEntry[];
  me: LeaderboardMe | null;
};

export type PlayerProfile = {
  anonymousId: string;
  nickname: string;
};

export type SubmitScoreInput = {
  nickname: string;
  score: number;
  peakLevel: number;
};

export type LeaderboardClient = {
  initPlayer: (nickname: string) => Promise<PlayerProfile>;
  updateNickname: (nickname: string) => Promise<PlayerProfile>;
  submitBestScoreIfNeeded: (input: SubmitScoreInput) => Promise<boolean>;
  fetchGlobalLeaderboard: () => Promise<LeaderboardSnapshot>;
};

type SeedEntry = {
  anonymousId: string;
  nickname: string;
  score: number;
  peakLevel: number;
};

const SUBMITTED_SCORE_KEY = "zju-cat-merge:submitted-best-score";
const SUBMITTED_PEAK_LEVEL_KEY = "zju-cat-merge:submitted-best-peak-level";
const SEED_LEADERBOARD: SeedEntry[] = [
  { anonymousId: "seed-1", nickname: "猫猫系主任", score: 138000, peakLevel: 18 },
  { anonymousId: "seed-2", nickname: "DDL幸存者", score: 121500, peakLevel: 16 },
  { anonymousId: "seed-3", nickname: "东一吸猫王", score: 108000, peakLevel: 15 },
  { anonymousId: "seed-4", nickname: "玉泉夜猫子", score: 96000, peakLevel: 14 },
  { anonymousId: "seed-5", nickname: "求是路路通", score: 82000, peakLevel: 13 },
  { anonymousId: "seed-6", nickname: "紫金港打工人", score: 70000, peakLevel: 12 },
  { anonymousId: "seed-7", nickname: "图书馆潜伏者", score: 58000, peakLevel: 11 },
  { anonymousId: "seed-8", nickname: "吸猫预备役", score: 46000, peakLevel: 10 },
  { anonymousId: "seed-9", nickname: "哈基米学徒", score: 35000, peakLevel: 9 },
  { anonymousId: "seed-10", nickname: "猫粮赞助商", score: 24000, peakLevel: 8 },
];

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

function readSubmittedScore(): number {
  const raw = getStorage()?.getItem(SUBMITTED_SCORE_KEY) ?? "0";
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readSubmittedPeakLevel(): number {
  const raw = getStorage()?.getItem(SUBMITTED_PEAK_LEVEL_KEY) ?? "0";
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function writeSubmittedBest(score: number, peakLevel: number): void {
  const storage = getStorage();
  storage?.setItem(SUBMITTED_SCORE_KEY, String(Math.max(0, score)));
  storage?.setItem(SUBMITTED_PEAK_LEVEL_KEY, String(Math.max(0, peakLevel)));
}

function normalizeNickname(nickname: string): string {
  const trimmed = nickname.trim();
  return trimmed.slice(0, 12) || "匿名同学";
}

function sortEntries(entries: SeedEntry[]): SeedEntry[] {
  return [...entries].sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }
    if (right.peakLevel !== left.peakLevel) {
      return right.peakLevel - left.peakLevel;
    }
    return left.nickname.localeCompare(right.nickname, "zh-CN");
  });
}

function buildLeaderboardSnapshot(anonymousId: string, nickname: string): LeaderboardSnapshot {
  const playerScore = readSubmittedScore();
  const playerPeakLevel = Math.max(1, readSubmittedPeakLevel());
  const allEntries = [...SEED_LEADERBOARD];

  if (playerScore > 0) {
    allEntries.push({
      anonymousId,
      nickname: normalizeNickname(nickname),
      score: playerScore,
      peakLevel: playerPeakLevel,
    });
  }

  const ranked = sortEntries(allEntries).map<LeaderboardEntry>((entry, index) => ({
    rank: index + 1,
    anonymousId: entry.anonymousId,
    nickname: entry.nickname,
    score: entry.score,
    peakLevel: entry.peakLevel,
    isSelf: entry.anonymousId === anonymousId,
  }));

  const selfEntry = ranked.find((entry) => entry.isSelf) ?? null;
  return {
    entries: ranked.slice(0, 20),
    me: {
      anonymousId,
      nickname: normalizeNickname(nickname),
      score: playerScore,
      peakLevel: playerPeakLevel,
      rank: selfEntry?.rank ?? null,
    },
  };
}

export function createLeaderboardClient(): LeaderboardClient {
  let currentNickname = "匿名同学";

  const getAnonymousId = (): string => getOrCreateAnonymousId();

  return {
    async initPlayer(nickname) {
      currentNickname = normalizeNickname(nickname);
      return {
        anonymousId: getAnonymousId(),
        nickname: currentNickname,
      };
    },
    async updateNickname(nickname) {
      currentNickname = normalizeNickname(nickname);
      return {
        anonymousId: getAnonymousId(),
        nickname: currentNickname,
      };
    },
    async submitBestScoreIfNeeded(input) {
      const submittedScore = readSubmittedScore();
      const submittedPeakLevel = readSubmittedPeakLevel();
      const shouldSubmit =
        input.score > submittedScore ||
        (input.score === submittedScore && input.peakLevel > submittedPeakLevel);

      currentNickname = normalizeNickname(input.nickname);
      if (!shouldSubmit) {
        return false;
      }

      writeSubmittedBest(input.score, input.peakLevel);
      return true;
    },
    async fetchGlobalLeaderboard() {
      return buildLeaderboardSnapshot(getAnonymousId(), currentNickname);
    },
  };
}

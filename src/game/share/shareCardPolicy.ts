export type ShareCardInput = {
  score: number;
  peakLevel: number;
  isNewBest: boolean;
};

export type ShareCardBand = "low" | "high";
export type ShareCardPoseMode = "step" | "lift";
export type ShareCardScoreAnchor = "under" | "over";

export type ShareCardModel = {
  band: ShareCardBand;
  poseMode: ShareCardPoseMode;
  shareLine: string;
  showNewBestBadge: boolean;
  scoreAnchor: ShareCardScoreAnchor;
};

function getBand(score: number): ShareCardBand {
  if (score >= 100000) {
    return "high";
  }

  return "low";
}

function getShareLine(band: ShareCardBand, peakLevel: number, isNewBest: boolean): string {
  const levelLabel = `Peak Lv.${peakLevel}`;

  if (band === "high") {
    return `${levelLabel} with a champion score.`;
  }

  return `${levelLabel} from a steady merge streak.`;
}

export function buildShareCardModel(input: ShareCardInput): ShareCardModel {
  const band = getBand(input.score);

  if (band === "high") {
    return {
      band,
      poseMode: "lift",
      shareLine: getShareLine(band, input.peakLevel, input.isNewBest),
      showNewBestBadge: false,
      scoreAnchor: "over",
    };
  }

  return {
    band,
    poseMode: "step",
    shareLine: getShareLine(band, input.peakLevel, input.isNewBest),
    showNewBestBadge: false,
    scoreAnchor: "under",
  };
}

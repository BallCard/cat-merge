export type BgmManager = {
  unlock: () => void;
  startRound: () => void;
  setEnabled: (enabled: boolean) => void;
  dispose: () => void;
};

type CreateBgmManagerOptions = {
  playlist?: string[];
  enabled?: boolean;
  documentRef?: Document;
};

const DEFAULT_PLAYLIST = [
  "/assets/bgm/bgm-1.mp3",
  "/assets/bgm/bgm-2.mp3",
  "/assets/bgm/bgm-3.mp3",
];

export function createBgmManager(options: CreateBgmManagerOptions = {}): BgmManager {
  const playlist = options.playlist && options.playlist.length > 0 ? options.playlist : DEFAULT_PLAYLIST;
  const documentRef = options.documentRef ?? (typeof document !== "undefined" ? document : null);
  const audio = typeof Audio === "undefined" ? null : new Audio();
  const userAgent = documentRef?.defaultView?.navigator?.userAgent ?? "";
  const mediaElementCtor = documentRef?.defaultView?.HTMLMediaElement;
  const isNativeJsdomAudio =
    /jsdom/i.test(userAgent) && Boolean(audio && mediaElementCtor && audio instanceof mediaElementCtor);
  let enabled = options.enabled ?? true;
  let unlocked = false;
  let currentTrackIndex = -1;
  let pausedByVisibility = false;

  if (audio) {
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = 0.46;
  }

  const pickNextTrackIndex = (): number => {
    if (playlist.length <= 1) {
      return 0;
    }

    let nextIndex = currentTrackIndex;
    while (nextIndex === currentTrackIndex) {
      nextIndex = Math.floor(Math.random() * playlist.length);
    }
    return nextIndex;
  };

  const safePause = (): void => {
    if (!audio || isNativeJsdomAudio) {
      return;
    }

    try {
      audio.pause();
    } catch {
      // jsdom does not implement media playback APIs.
    }
  };

  const playCurrent = (): void => {
    if (!audio || !enabled || !unlocked || currentTrackIndex < 0 || isNativeJsdomAudio) {
      return;
    }

    try {
      const maybePromise = audio.play();
      if (maybePromise && typeof maybePromise.catch === "function") {
        void maybePromise.catch(() => {});
      }
    } catch {
      // jsdom does not implement media playback APIs.
    }
  };

  const onVisibilityChange = (): void => {
    if (!audio || !enabled) {
      return;
    }

    if (documentRef?.hidden) {
      pausedByVisibility = !audio.paused;
      safePause();
      return;
    }

    if (pausedByVisibility) {
      pausedByVisibility = false;
      playCurrent();
    }
  };

  documentRef?.addEventListener("visibilitychange", onVisibilityChange);

  return {
    unlock(): void {
      unlocked = true;
      playCurrent();
    },
    startRound(): void {
      if (!audio) {
        return;
      }

      currentTrackIndex = pickNextTrackIndex();
      audio.src = playlist[currentTrackIndex];
      audio.currentTime = 0;
      pausedByVisibility = false;
      playCurrent();
    },
    setEnabled(nextEnabled: boolean): void {
      enabled = nextEnabled;
      if (!audio) {
        return;
      }

      if (!enabled) {
        pausedByVisibility = false;
        safePause();
        return;
      }

      if (!documentRef?.hidden) {
        playCurrent();
      }
    },
    dispose(): void {
      documentRef?.removeEventListener("visibilitychange", onVisibilityChange);
      if (!audio) {
        return;
      }

      safePause();
      audio.src = "";
    },
  };
}


import "./styles.css";

import { createHudBridge, type HudBridge, type HudResultState } from "./game/hud/bridge";
import { mountGameHud } from "./game/hud/domHud";
import { getCatDefinition, getCatRadius } from "./game/config/cats";
import { buildShareCardModel } from "./game/share/shareCardPolicy";
import { resolveShareCardAssets } from "./game/share/shareCardAssets";
import { renderShareCardSurface } from "./game/share/shareCardPreview";
import { createLeaderboardClient, type LeaderboardClient, type LeaderboardEntry, type LeaderboardMe } from "./lib/leaderboardApi";
import { buildPlayerGuideFlow, markPlayerGuideCompleted, markPlayerGuideSkipped, shouldAutoOpenPlayerGuide, type PlayerGuideStep } from "./lib/playerGuide";
import { createBgmManager } from "./lib/bgmManager";

type CreateGameImpl = (target: HTMLElement, bridge?: HudBridge) => unknown;
type ModalType = "nickname" | "settings" | "leaderboard" | null;
type LeaderboardStatus = "loading" | "ready" | "error";

type AppOptions = {
  startGame?: boolean;
  createGameImpl?: CreateGameImpl;
  leaderboardClient?: LeaderboardClient;
};

type AppSettings = {
  musicEnabled: boolean;
  sfxEnabled: boolean;
  vibrationEnabled: boolean;
};

type ShareLabScenario = {
  title: string;
  score: number;
  peakLevel: number;
};

type AppState = {
  nickname: string;
  settings: AppSettings;
  modal: ModalType;
  leaderboardStatus: LeaderboardStatus;
  leaderboardEntries: LeaderboardEntry[];
  myLeaderboard: LeaderboardMe | null;
  leaderboardError: string | null;
  homeGuideMode: "auto" | "manual" | null;
};

const SHARE_LAB_BAND_SCENARIOS: ShareLabScenario[] = [
  { title: "Below 100K", score: 68000, peakLevel: 8 },
  { title: "100K+", score: 138000, peakLevel: 12 },
];

const SHARE_LAB_CAT_SCENARIOS: ShareLabScenario[] = Array.from({ length: 12 }, (_, index) => ({
  title: `Cat ${index + 1}`,
  score: 68000,
  peakLevel: index + 1,
}));

const LATE_LAB_LEVELS = [13, 14, 15, 16, 17, 18] as const;
const NICKNAME_KEY = "zju-cat-merge:nickname";
const SETTINGS_KEY = "zju-cat-merge:settings";
const DEFAULT_NICKNAME = "\u533f\u540d\u540c\u5b66";
const DEFAULT_SETTINGS: AppSettings = {
  musicEnabled: true,
  sfxEnabled: true,
  vibrationEnabled: true,
};

const PLAYER_GUIDE_FLOW = buildPlayerGuideFlow();

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

function readNickname(): string {
  const storage = getStorage();
  return storage?.getItem(NICKNAME_KEY)?.trim() || DEFAULT_NICKNAME;
}

function writeNickname(nickname: string): void {
  getStorage()?.setItem(NICKNAME_KEY, nickname);
}

function readSettings(): AppSettings {
  const raw = getStorage()?.getItem(SETTINGS_KEY);
  if (!raw) {
    return { ...DEFAULT_SETTINGS };
  }

  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(settings: AppSettings): void {
  getStorage()?.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function setScrollLock(locked: boolean): void {
  document.documentElement.classList.toggle("app-locked", locked);
  document.body.classList.toggle("app-locked", locked);
}

function formatScore(score: number): string {
  return score.toLocaleString("zh-CN");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderLeaderboardRows(entries: LeaderboardEntry[]): string {
  if (entries.length === 0) {
    return '<div class="leaderboard-empty">\u8fd8\u6ca1\u6709\u6210\u7ee9\uff0c\u4f60\u53ef\u4ee5\u5148\u5360\u4e0b\u7b2c\u4e00\u4e2a\u540d\u5b57\u3002</div>';
  }

  return entries
    .map((entry) => `
      <div class="leaderboard-row${entry.isSelf ? " is-self" : ""}">
        <span class="leaderboard-rank">#${entry.rank}</span>
        <span class="leaderboard-name">${escapeHtml(entry.nickname)}</span>
        <span class="leaderboard-meta">Lv.${entry.peakLevel}</span>
        <strong class="leaderboard-score">${formatScore(entry.score)}</strong>
      </div>
    `)
    .join("");
}

function renderLeaderboardStatus(state: AppState): string {
  if (state.leaderboardStatus === "loading") {
    return '<div class="leaderboard-status">\u5b9e\u65f6\u6392\u884c\u699c\u52a0\u8f7d\u4e2d...</div>';
  }

  if (state.leaderboardStatus === "error") {
    return `<div class="leaderboard-status is-error">${escapeHtml(state.leaderboardError ?? "\u6392\u884c\u699c\u6682\u65f6\u4e0d\u53ef\u7528\u3002")}</div>`;
  }

  return renderLeaderboardRows(state.leaderboardEntries);
}

function renderMyLeaderboardCard(state: AppState): string {
  if (!state.myLeaderboard) {
    return '<div class="leaderboard-my-card is-empty">\u4f60\u7684\u6700\u4f73\u6210\u7ee9\u4f1a\u5728\u7b2c\u4e00\u6b21\u6709\u6548\u63d0\u4ea4\u540e\u51fa\u73b0\u5728\u8fd9\u91cc\u3002</div>';
  }

  const rankLabel = state.myLeaderboard.rank ? `#${state.myLeaderboard.rank}` : "\u672a\u4e0a\u699c";
  return `
    <div class="leaderboard-my-card" aria-label="my-leaderboard-card">
      <div>
        <div class="leaderboard-my-label">\u6211\u7684\u6700\u4f73</div>
        <strong class="leaderboard-my-name">${escapeHtml(state.myLeaderboard.nickname)}</strong>
      </div>
      <div class="leaderboard-my-rank">${rankLabel}</div>
      <div class="leaderboard-my-score">${formatScore(state.myLeaderboard.score)}</div>
      <div class="leaderboard-my-meta">\u6700\u9ad8 Lv.${state.myLeaderboard.peakLevel}</div>
    </div>
  `;
}

function renderLeaderboardPreview(state: AppState): string {
  return `
    <section class="leaderboard-preview" aria-label="leaderboard-preview">
      <div class="section-heading">
        <div>
          <strong>\u5b9e\u65f6\u6392\u884c\u699c</strong>
          <p>\u6bcf\u5c40\u90fd\u80fd\u518d\u5f80\u4e0a\u4e00\u70b9\uff0c\u770b\u770b\u8fd9\u6b21\u80fd\u51b2\u5230\u7b2c\u51e0\u540d\u3002</p>
        </div>
        <div class="preview-tabs">
          <span class="preview-tab is-active">\u603b\u699c</span>
          <span class="preview-tab is-disabled">\u5468\u699c</span>
        </div>
      </div>
      <button class="secondary-button leaderboard-preview-action" type="button" data-action="open-leaderboard">\u67e5\u770b\u5b8c\u6574\u699c\u5355</button>
      ${renderMyLeaderboardCard(state)}
      <div class="leaderboard-scroll">
        ${renderLeaderboardStatus(state)}
      </div>
    </section>
  `;
}

function renderHomeGuideOverlay(step: PlayerGuideStep): string {
  return `
    <div class="home-guide-backdrop">
      <section class="home-guide-card" aria-label="player-guide-home">
        <div class="home-guide-eyebrow">\u73a9\u6cd5\u8bf4\u660e</div>
        <strong class="home-guide-title">${step.title}</strong>
        <p class="home-guide-body">${step.body}</p>
        <div class="home-guide-actions">
          <button class="primary-button" type="button" data-action="start-guide">${step.primaryLabel}</button>
          <button class="secondary-button" type="button" data-action="skip-guide">${step.secondaryLabel}</button>
        </div>
      </section>
    </div>
  `;
}

function renderModal(state: AppState): string {
  if (state.modal === "nickname") {
    return `
      <div class="modal-backdrop" data-action="close-modal">
        <section class="modal-card" aria-label="nickname-modal" onclick="event.stopPropagation()">
          <header class="modal-header">
            <strong>\u6539\u6635\u79f0</strong>
            <button class="icon-button" type="button" data-action="close-modal">\u5173\u95ed</button>
          </header>
          <label class="field-stack">
            <span>\u5c55\u793a\u6635\u79f0</span>
            <input class="text-input" name="nickname" maxlength="12" value="${escapeHtml(state.nickname)}" placeholder="\u7ed9\u4f60\u7684\u8fd9\u5c40\u8d77\u4e2a\u540d\u5b57" />
          </label>
          <div class="modal-actions">
            <button class="secondary-button" type="button" data-action="close-modal">\u53d6\u6d88</button>
            <button class="primary-button" type="button" data-action="save-nickname">\u4fdd\u5b58</button>
          </div>
        </section>
      </div>
    `;
  }

  if (state.modal === "settings") {
    return `
      <div class="modal-backdrop" data-action="close-settings">
        <section class="modal-card" aria-label="settings-modal" onclick="event.stopPropagation()">
          <header class="modal-header">
            <strong>\u8bbe\u7f6e</strong>
            <button class="icon-button" type="button" data-action="close-settings">\u5173\u95ed</button>
          </header>
          <label class="toggle-row">
            <span>\u80cc\u666f\u97f3\u4e50</span>
            <input type="checkbox" name="musicEnabled" ${state.settings.musicEnabled ? "checked" : ""} />
          </label>
          <label class="toggle-row">
            <span>\u97f3\u6548\u53cd\u9988</span>
            <input type="checkbox" name="sfxEnabled" ${state.settings.sfxEnabled ? "checked" : ""} />
          </label>
          <label class="toggle-row">
            <span>\u9707\u52a8\u53cd\u9988</span>
            <input type="checkbox" name="vibrationEnabled" ${state.settings.vibrationEnabled ? "checked" : ""} />
          </label>
          <div class="modal-actions">
            <button class="primary-button" type="button" data-action="close-settings">\u5b8c\u6210</button>
          </div>
        </section>
      </div>
    `;
  }

  if (state.modal === "leaderboard") {
    return `
      <div class="modal-backdrop" data-action="close-modal">
        <section class="modal-card modal-card-wide" aria-label="leaderboard-modal" onclick="event.stopPropagation()">
          <header class="modal-header">
            <strong>\u6392\u884c\u699c</strong>
            <button class="icon-button" type="button" data-action="close-modal">\u5173\u95ed</button>
          </header>
          <div class="leaderboard-tabs">
            <button class="secondary-button is-active" type="button">\u603b\u699c</button>
            <button class="secondary-button is-disabled" type="button" disabled>\u5468\u699c</button>
          </div>
          ${renderMyLeaderboardCard(state)}
          <div class="leaderboard-panel">
            ${renderLeaderboardStatus(state)}
          </div>
        </section>
      </div>
    `;
  }

  return "";
}

function shouldOpenShareLab(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const params = new URLSearchParams(window.location.search);
  return params.get("shareLab") === "1";
}

function shouldOpenLateLab(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const params = new URLSearchParams(window.location.search);
  return params.get("lateLab") === "1";
}

function shouldOpenLeaderboard(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const params = new URLSearchParams(window.location.search);
  return params.get("openLeaderboard") === "1";
}

function renderShareLabCard(scenario: ShareLabScenario, surfaceClassName = ""): string {
  return `
    <section class="share-lab-card-shell">
      <div class="share-lab-card-header">
        <strong>${scenario.title}</strong>
        <span>${scenario.score.toLocaleString("zh-CN")} ? Lv.${scenario.peakLevel}</span>
      </div>
      ${renderShareCardSurface({
        model: buildShareCardModel({ score: scenario.score, peakLevel: scenario.peakLevel, isNewBest: false }),
        score: scenario.score,
        peakLevel: scenario.peakLevel,
        isNewBest: false,
        assets: resolveShareCardAssets(scenario.peakLevel),
        surfaceClassName,
      })}
    </section>
  `;
}

function renderLateLabLevelCard(level: number): string {
  const definition = getCatDefinition(level);
  const radius = getCatRadius(level);

  return `
    <section class="late-lab-level-card">
      <div class="late-lab-level-top">
        <strong>Lv.${level}</strong>
        <span>r ${radius}px</span>
      </div>
      <div class="late-lab-ball-wrap">
        <div class="late-lab-ball" style="width:${radius * 2}px;height:${radius * 2}px;">
          <img src="/assets/cats/${definition?.assetKey ?? "cat-12-v3"}.png" alt="Level ${level}" />
        </div>
      </div>
      <div class="late-lab-meta">
        <span>asset</span>
        <strong>${definition?.assetKey ?? "missing"}</strong>
      </div>
    </section>
  `;
}

function renderLateLabCrowding(): string {
  const nodes = [13, 14, 15, 16, 17, 18]
    .map((level, index) => {
      const definition = getCatDefinition(level);
      const radius = getCatRadius(level);
      const size = radius * 2;
      const left = [8, 40, 63, 14, 52, 27][index];
      const top = [58, 14, 46, 132, 116, 184][index];
      return `<div class="late-lab-crowd-ball" style="width:${size}px;height:${size}px;left:${left}%;top:${top}px;"><img src="/assets/cats/${definition?.assetKey ?? "cat-12-v3"}.png" alt="" /></div>`;
    })
    .join("");

  return `
    <section class="late-lab-scene-card">
      <div class="late-lab-scene-head">
        <strong>Crowding Test</strong>
        <span>13-18 overlap and breathing room</span>
      </div>
      <div class="late-lab-scene late-lab-scene-crowd">
        ${nodes}
      </div>
    </section>
  `;
}

function renderLateLabLadder(): string {
  return `
    <section class="late-lab-scene-card">
      <div class="late-lab-scene-head">
        <strong>Late Ladder</strong>
        <span>13-18 visual gradient and size readout</span>
      </div>
      <div class="late-lab-level-grid">
        ${LATE_LAB_LEVELS.map((level) => renderLateLabLevelCard(level)).join("")}
      </div>
    </section>
  `;
}

function renderLateLabMergeTargets(): string {
  const focusLevels = [16, 17, 18];
  return `
    <section class="late-lab-scene-card">
      <div class="late-lab-scene-head">
        <strong>Merge Target Read</strong>
        <span>16-18 should feel like meaningful upgrades, not just scale inflation</span>
      </div>
      <div class="late-lab-focus-row">
        ${focusLevels.map((level) => {
          const definition = getCatDefinition(level);
          const radius = getCatRadius(level);
          return `
            <div class="late-lab-focus-card">
              <div class="late-lab-focus-ball" style="width:${radius * 2}px;height:${radius * 2}px;">
                <img src="/assets/cats/${definition?.assetKey ?? "cat-12-v3"}.png" alt="Level ${level}" />
              </div>
              <strong>Lv.${level}</strong>
              <span>radius ${radius}px</span>
              <code>${definition?.assetKey ?? "missing"}</code>
            </div>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function renderLateLab(root: HTMLElement): void {
  root.innerHTML = `
    <main class="late-lab-screen">
      <section class="late-lab-panel">
        <header class="late-lab-header">
          <div>
            <h1 class="late-lab-title">Late Game Lab</h1>
            <p class="late-lab-subtitle">Fast QA for levels 13-18: size curve, asset gradient, and crowding pressure.</p>
          </div>
          <a class="secondary-button late-lab-exit" href="/">\u8fd4\u56de\u9996\u9875</a>
        </header>
        ${renderLateLabLadder()}
        ${renderLateLabMergeTargets()}
        ${renderLateLabCrowding()}
      </section>
    </main>
  `;
}

function renderShareLab(root: HTMLElement): void {
  root.innerHTML = `
    <main class="share-lab-screen">
      <section class="share-lab-panel">
        <header class="share-lab-header">
          <div>
            <h1 class="share-lab-title">Share Card Lab</h1>
            <p class="share-lab-subtitle">Dev check for bands, cat assets, GIF preview, and static export mapping.</p>
          </div>
          <a class="secondary-button share-lab-exit" href="/">\u8fd4\u56de\u9996\u9875</a>
        </header>
        <section class="share-lab-section" aria-label="share-lab-bands">
          <div class="share-lab-section-heading">
            <strong>Band Check</strong>
            <span>Below 100K / 100K+ layout split</span>
          </div>
          <div class="share-lab-grid share-lab-grid-bands">
            ${SHARE_LAB_BAND_SCENARIOS.map((scenario) => renderShareLabCard(scenario)).join("")}
          </div>
        </section>
        <section class="share-lab-section" aria-label="share-lab-cats">
          <div class="share-lab-section-heading">
            <strong>Cat Check</strong>
            <span>Cat 1-12 GIF and asset stability</span>
          </div>
          <div class="share-lab-grid share-lab-grid-cats">
            ${SHARE_LAB_CAT_SCENARIOS.map((scenario) => renderShareLabCard(scenario, "share-card--editorial")).join("")}
          </div>
        </section>
      </section>
    </main>
  `;
}

function renderHomeScreen(root: HTMLElement, state: AppState): void {
  root.innerHTML = `
    <main class="home-screen">
      <section class="home-panel">
        <header class="home-header">
          <h1 class="home-title">ZJU Cat Merge</h1>
          <p class="home-subtitle">\u6d59\u5927\u8004\u800b\u732b</p>
          <p class="home-hook">\u70b9\u4e00\u70b9\uff0c\u5408\u4e00\u5408\uff0c\u770b\u770b\u4f60\u80fd\u5806\u5230\u591a\u79bb\u8c31</p>
        </header>
        <section class="hero-card" aria-label="game-hero">
          <div class="hero-stack">
            <div class="hero-cat">&#128049;</div>
            <p class="home-tip">\u8f6f\u840c\u3001\u9b54\u6027\u3001\u89e3\u538b</p>
          </div>
        </section>
        <section class="home-actions home-actions-top">
          <button class="primary-button" type="button" data-action="start-game">\u5f00\u59cb\u5438\u732b</button>
          <div class="secondary-actions">
            <button class="secondary-button" type="button" data-action="open-leaderboard">\u770b\u6392\u884c\u699c</button>
            <button class="secondary-button" type="button" data-action="open-guide">\u73a9\u6cd5\u8bf4\u660e</button>
            <button class="secondary-button" type="button" data-action="open-settings">\u8bbe\u7f6e</button>
          </div>
        </section>
        <section class="nick-row" aria-label="nickname-card">
          <div class="nick-meta">
            <span class="nick-label">\u6635\u79f0</span>
            <strong class="nick-value">${escapeHtml(state.nickname)}</strong>
          </div>
          <button class="icon-button" type="button" aria-label="edit-nickname" data-action="open-nickname">\u6539\u6635\u79f0</button>
        </section>
        ${renderLeaderboardPreview(state)}
      </section>
      ${state.homeGuideMode && state.modal === null ? renderHomeGuideOverlay(PLAYER_GUIDE_FLOW.homeStep) : ""}
      ${renderModal(state)}
    </main>
  `;
}

function renderGameScreen(root: HTMLElement): { gameRoot: HTMLElement; hudRoot: HTMLElement } {
  root.innerHTML = `
    <main class="game-screen">
      <div class="game-screen-inner">
        <div id="game-root" aria-label="game-root"></div>
        <div id="game-hud-root" aria-label="game-hud-root"></div>
      </div>
    </main>
  `;

  const gameRoot = root.querySelector<HTMLElement>("#game-root");
  const hudRoot = root.querySelector<HTMLElement>("#game-hud-root");
  if (!gameRoot || !hudRoot) {
    throw new Error("Game screen containers not found");
  }

  return { gameRoot, hudRoot };
}

async function resolveCreateGame(options: AppOptions): Promise<CreateGameImpl> {
  if (options.createGameImpl) {
    return options.createGameImpl;
  }

  const { createGame } = await import("./game/bootstrap");
  return createGame;
}

function createResultSignature(result: HudResultState | null): string | null {
  if (!result) {
    return null;
  }

  return `${result.score}:${result.peakLevel}`;
}

export async function createApp(root: HTMLElement, options: AppOptions = {}): Promise<void> {
  const leaderboardClient = options.leaderboardClient ?? createLeaderboardClient();
  let started = false;
  let leaderboardRequestVersion = 0;
  let lastSubmittedResultSignature: string | null = null;
  let lastHudResultSignature: string | null = null;
  const state: AppState = {
    nickname: readNickname(),
    settings: readSettings(),
    modal: shouldOpenLeaderboard() ? "leaderboard" : null,
    leaderboardStatus: "loading",
    leaderboardEntries: [],
    myLeaderboard: null,
    leaderboardError: null,
    homeGuideMode: shouldOpenLeaderboard() ? null : (shouldAutoOpenPlayerGuide(PLAYER_GUIDE_FLOW.version) ? "auto" : null),
  };
  const bgmManager = createBgmManager({ enabled: state.settings.musicEnabled });
  const unlockBgm = (): void => bgmManager.unlock();
  document.addEventListener("pointerdown", unlockBgm, { capture: true });
  document.addEventListener("keydown", unlockBgm, { capture: true });

  const renderHome = (): void => {
    if (started) {
      return;
    }

    setScrollLock(false);
    renderHomeScreen(root, state);

    root.querySelector<HTMLElement>('[data-action="start-game"]')?.addEventListener("click", () => {
      void enterGame();
    });

    root.querySelector<HTMLElement>('[data-action="open-nickname"]')?.addEventListener("click", () => {
      state.modal = "nickname";
      renderHome();
    });

    root.querySelector<HTMLElement>('[data-action="open-settings"]')?.addEventListener("click", () => {
      state.modal = "settings";
      renderHome();
    });

    root.querySelectorAll<HTMLElement>('[data-action="open-leaderboard"]').forEach((button) => {
      button.addEventListener("click", () => {
        state.modal = "leaderboard";
        renderHome();
      });
    });

    root.querySelector<HTMLElement>('[data-action="open-guide"]')?.addEventListener("click", () => {
      state.homeGuideMode = "manual";
      renderHome();
    });

    root.querySelector<HTMLElement>('[data-action="start-guide"]')?.addEventListener("click", () => {
      void enterGame({ startGuide: true });
    });

    root.querySelector<HTMLElement>('[data-action="skip-guide"]')?.addEventListener("click", () => {
      if (state.homeGuideMode === "auto") {
        markPlayerGuideSkipped(PLAYER_GUIDE_FLOW.version);
      }
      state.homeGuideMode = null;
      renderHome();
    });

    root.querySelectorAll<HTMLElement>('[data-action="close-modal"]').forEach((button) => {
      button.addEventListener("click", () => {
        state.modal = null;
        renderHome();
      });
    });

    root.querySelectorAll<HTMLElement>('[data-action="close-settings"]').forEach((button) => {
      button.addEventListener("click", () => {
        state.modal = null;
        renderHome();
      });
    });

    root.querySelector<HTMLElement>('[data-action="save-nickname"]')?.addEventListener("click", () => {
      const value = root.querySelector<HTMLInputElement>('input[name="nickname"]')?.value.trim();
      state.nickname = value || DEFAULT_NICKNAME;
      writeNickname(state.nickname);
      state.modal = null;
      renderHome();
      void leaderboardClient.updateNickname(state.nickname).then(() => refreshLeaderboard()).catch(() => refreshLeaderboard());
    });

    root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((input) => {
      input.addEventListener("change", () => {
        state.settings = {
          ...state.settings,
          [input.name]: input.checked,
        };
        writeSettings(state.settings);
        bgmManager.setEnabled(state.settings.musicEnabled);
      });
    });
  };

  const refreshLeaderboard = async (): Promise<void> => {
    const requestVersion = ++leaderboardRequestVersion;
    state.leaderboardStatus = "loading";
    state.leaderboardError = null;
    if (!started) {
      renderHome();
    }

    try {
      const snapshot = await leaderboardClient.fetchGlobalLeaderboard();
      if (requestVersion !== leaderboardRequestVersion) {
        return;
      }

      state.leaderboardEntries = snapshot.entries;
      state.myLeaderboard = snapshot.me;
      state.leaderboardStatus = "ready";
      state.leaderboardError = null;
    } catch {
      if (requestVersion !== leaderboardRequestVersion) {
        return;
      }

      state.leaderboardStatus = "error";
      state.leaderboardError = "\u5b9e\u65f6\u6392\u884c\u699c\u6682\u65f6\u4e0d\u53ef\u7528\u3002";
    }

    if (!started) {
      renderHome();
    }
  };

  const submitLeaderboardResult = async (result: HudResultState): Promise<void> => {
    try {
      const submitted = await leaderboardClient.submitBestScoreIfNeeded({
        nickname: state.nickname,
        score: result.score,
        peakLevel: result.peakLevel,
      });
      if (submitted || state.leaderboardStatus !== "ready") {
        await refreshLeaderboard();
      }
    } catch {
      if (!started) {
        state.leaderboardStatus = "error";
        state.leaderboardError = "\u6210\u7ee9\u540c\u6b65\u5931\u8d25\uff0c\u4f46\u4f60\u7684\u672c\u5730\u8bb0\u5f55\u4ecd\u7136\u4fdd\u7559\u3002";
        renderHome();
      }
    }
  };

  const enterGame = async (enterOptions: { startGuide?: boolean } = {}): Promise<void> => {
    if (started) {
      return;
    }

    started = true;
    bgmManager.startRound();
    state.homeGuideMode = null;
    try {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    } catch {
      window.scrollTo(0, 0);
    }
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    setScrollLock(true);
    const { gameRoot, hudRoot } = renderGameScreen(root);
    const bridge = createHudBridge();
    mountGameHud(hudRoot, bridge, {
      leaderboardHref: "/?openLeaderboard=1",
      playerGuideSteps: enterOptions.startGuide ? PLAYER_GUIDE_FLOW.gameplaySteps : [],
      onPlayerGuideComplete: () => markPlayerGuideCompleted(PLAYER_GUIDE_FLOW.version),
      onPlayerGuideSkip: () => markPlayerGuideSkipped(PLAYER_GUIDE_FLOW.version),
    });

    bridge.subscribe((hudState) => {
      const signature = createResultSignature(hudState.result);
      if (!signature) {
        if (lastHudResultSignature && !hudState.isGameOver) {
          bgmManager.startRound();
        }
        lastHudResultSignature = null;
        if (!hudState.isGameOver) {
          lastSubmittedResultSignature = null;
        }
        return;
      }

      lastHudResultSignature = signature;
      if (signature === lastSubmittedResultSignature) {
        return;
      }

      lastSubmittedResultSignature = signature;
      void submitLeaderboardResult(hudState.result);
    });

    const createGame = await resolveCreateGame(options);
    createGame(gameRoot, bridge);
  };

  if (shouldOpenLateLab()) {
    setScrollLock(false);
    renderLateLab(root);
    return;
  }

  if (shouldOpenShareLab()) {
    setScrollLock(false);
    renderShareLab(root);
    return;
  }

  void leaderboardClient.initPlayer(state.nickname).catch(() => {});

  if (options.startGame) {
    await enterGame();
    return;
  }

  renderHome();
  void refreshLeaderboard();
}

const appRoot = document.querySelector<HTMLElement>("#app");
if (appRoot) {
  void createApp(appRoot);
}








const MAX_CAT_LEVEL = 12;
const MIN_CAT_LEVEL = 1;

type AssetSourceMap = Record<string, string[]>;
type AssetHeroMap = Record<string, string>;

type ShareCardGifMap = Record<string, string>;

export type ShareCardAssetCatalog = {
  previewGifSrcByKey?: ShareCardGifMap;
  previewFrameSrcsByKey: AssetSourceMap;
  staticHeroSrcByKey: AssetHeroMap;
  placeholderSrc: string;
};

export type ShareCardAssetMode = "gif" | "frames" | "static" | "placeholder";
export type ShareCardExportMode = "static" | "placeholder";

export type ShareCardAssets = {
  previewMode: ShareCardAssetMode;
  exportMode: ShareCardExportMode;
  previewGifSrc?: string;
  previewFrameSrcs: string[];
  staticHeroSrc?: string;
  placeholderSrc: string;
};

type AssetEntry = {
  key: string;
  variant: number;
  src: string;
};

type PreviewFrameEntry = {
  key: string;
  frame: number;
  src: string;
};

function clampCatLevel(peakLevel: number): number {
  if (!Number.isFinite(peakLevel)) {
    return MIN_CAT_LEVEL;
  }

  return Math.max(MIN_CAT_LEVEL, Math.min(MAX_CAT_LEVEL, Math.round(peakLevel)));
}

function getAssetKey(peakLevel: number): string {
  return `cat-${clampCatLevel(peakLevel)}`;
}

function buildPlaceholderSrc(): string {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">',
    '<rect width="512" height="512" rx="124" fill="#f7e4c7"/>',
    '<circle cx="196" cy="208" r="28" fill="#8d5a36"/>',
    '<circle cx="316" cy="208" r="28" fill="#8d5a36"/>',
    '<path d="M160 308c38-34 154-34 192 0" fill="none" stroke="#8d5a36" stroke-width="18" stroke-linecap="round"/>',
    '<text x="256" y="372" text-anchor="middle" font-family="Arial, sans-serif" font-size="72" font-weight="700" fill="#8d5a36">CAT</text>',
    '</svg>',
  ].join("");

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function parseStaticAssetEntry(path: string, src: string): AssetEntry | null {
  const fileName = path.split("/").pop() ?? "";
  const baseName = fileName.replace(/\.[^.]+$/, "");
  const match = baseName.match(/^(cat-(\d+))(?:-v(\d+))?$/);

  if (!match) {
    return null;
  }

  return {
    key: match[1],
    variant: Number(match[3] ?? 0),
    src,
  };
}

function parsePreviewFrameEntry(path: string, src: string): PreviewFrameEntry | null {
  const match = path.match(/(?:^|\/)(cat-(\d+))\/frame-(\d+)\.png$/);

  if (!match) {
    return null;
  }

  return {
    key: match[1],
    frame: Number(match[3]),
    src,
  };
}

function parsePreviewGifEntry(path: string, src: string): { key: string; src: string } | null {
  const fileName = path.split("/").pop() ?? "";
  const baseName = fileName.replace(/\.[^.]+$/, "");
  const match = baseName.match(/^(cat-(\d+))$/);

  if (!match) {
    return null;
  }

  return {
    key: match[1],
    src,
  };
}

function normalizeAssetSrc(src: string): string {
  if (src.startsWith("/@fs/") && src.includes("/public/assets/")) {
    return src.replace(/^\/@fs\/[^?]*?\/public(\/assets\/.*)$/, "$1");
  }

  return src.startsWith("/public/") ? src.replace("/public", "") : src;
}

function sortEntries(entries: AssetEntry[]): AssetEntry[] {
  return [...entries].sort((left, right) => {
    if (left.variant !== right.variant) {
      return left.variant - right.variant;
    }

    return left.src.localeCompare(right.src);
  });
}

function sortPreviewFrames(entries: PreviewFrameEntry[]): PreviewFrameEntry[] {
  return [...entries].sort((left, right) => {
    if (left.frame !== right.frame) {
      return left.frame - right.frame;
    }

    return left.src.localeCompare(right.src);
  });
}

function collectStaticCatalog(modules: Record<string, string>): {
  previewFrameSrcsByKey: AssetSourceMap;
  staticHeroSrcByKey: AssetHeroMap;
} {
  const grouped = new Map<string, AssetEntry[]>();

  for (const [path, src] of Object.entries(modules)) {
    const entry = parseStaticAssetEntry(path, src);
    if (!entry) {
      continue;
    }

    const list = grouped.get(entry.key) ?? [];
    list.push(entry);
    grouped.set(entry.key, list);
  }

  const previewFrameSrcsByKey: AssetSourceMap = {};
  const staticHeroSrcByKey: AssetHeroMap = {};

  for (const [key, entries] of grouped.entries()) {
    const sorted = sortEntries(entries);
    previewFrameSrcsByKey[key] = sorted.map((entry) => normalizeAssetSrc(entry.src));
    staticHeroSrcByKey[key] = normalizeAssetSrc(sorted.find((entry) => entry.variant === 0)?.src ?? sorted[0].src);
  }

  return {
    previewFrameSrcsByKey,
    staticHeroSrcByKey,
  };
}

function collectPreviewFrameCatalog(modules: Record<string, string>): AssetSourceMap {
  const grouped = new Map<string, PreviewFrameEntry[]>();

  for (const [path, src] of Object.entries(modules)) {
    const entry = parsePreviewFrameEntry(path, src);
    if (!entry) {
      continue;
    }

    const list = grouped.get(entry.key) ?? [];
    list.push(entry);
    grouped.set(entry.key, list);
  }

  const previewFrameSrcsByKey: AssetSourceMap = {};

  for (const [key, entries] of grouped.entries()) {
    previewFrameSrcsByKey[key] = sortPreviewFrames(entries).map((entry) => normalizeAssetSrc(entry.src));
  }

  return previewFrameSrcsByKey;
}

function collectPreviewGifCatalog(modules: Record<string, string>): ShareCardGifMap {
  const previewGifSrcByKey: ShareCardGifMap = {};

  for (const [path, src] of Object.entries(modules)) {
    const entry = parsePreviewGifEntry(path, src);
    if (!entry) {
      continue;
    }

    previewGifSrcByKey[entry.key] = normalizeAssetSrc(entry.src);
  }

  return previewGifSrcByKey;
}

const defaultStaticHeroModules = import.meta.glob<string>("../../../public/assets/cats/*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const defaultPreviewFrameModules = import.meta.glob<string>("../../../assets/share-preview-frames/cat-*/frame-*.png", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const defaultPreviewGifModules = import.meta.glob<string>("../../../assets/selected-gifs/*.gif", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const staticCatalog = collectStaticCatalog(defaultStaticHeroModules);
const previewFrameCatalog = collectPreviewFrameCatalog(defaultPreviewFrameModules);
const previewGifCatalog = collectPreviewGifCatalog(defaultPreviewGifModules);

const DEFAULT_CATALOG: ShareCardAssetCatalog = {
  previewGifSrcByKey: previewGifCatalog,
  previewFrameSrcsByKey: {
    ...staticCatalog.previewFrameSrcsByKey,
    ...previewFrameCatalog,
  },
  staticHeroSrcByKey: staticCatalog.staticHeroSrcByKey,
  placeholderSrc: buildPlaceholderSrc(),
};

export function resolveShareCardAssets(
  peakLevel: number,
  catalog: ShareCardAssetCatalog = DEFAULT_CATALOG,
): ShareCardAssets {
  const assetKey = getAssetKey(peakLevel);
  const previewGifSrc = catalog.previewGifSrcByKey?.[assetKey];
  const previewFrameSrcs = catalog.previewFrameSrcsByKey[assetKey] ?? [];
  const staticHeroSrc = catalog.staticHeroSrcByKey[assetKey];

  const previewMode: ShareCardAssetMode = previewGifSrc
    ? "gif"
    : previewFrameSrcs.length > 0
      ? "frames"
      : staticHeroSrc
        ? "static"
        : "placeholder";
  const resolvedPreviewFrameSrcs = previewFrameSrcs.length > 0 ? previewFrameSrcs : staticHeroSrc ? [staticHeroSrc] : [];

  return {
    previewMode,
    exportMode: staticHeroSrc ? "static" : "placeholder",
    previewGifSrc,
    previewFrameSrcs: resolvedPreviewFrameSrcs,
    staticHeroSrc,
    placeholderSrc: catalog.placeholderSrc,
  };
}

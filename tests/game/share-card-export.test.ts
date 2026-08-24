import { afterEach, describe, expect, test, vi } from "vitest";

import { resolveShareCardAssets } from "../../src/game/share/shareCardAssets";
import { buildShareCardModel } from "../../src/game/share/shareCardPolicy";
import { exportShareCardFromRenderer } from "../../src/game/share/shareCardExport";
import type { ShareCardExportRenderInput } from "../../src/game/share/shareCardExportRenderer";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function createRenderInput(): ShareCardExportRenderInput {
  const model = buildShareCardModel({ score: 124500, peakLevel: 12, isNewBest: true });

  return {
    model,
    score: 124500,
    peakLevel: 12,
    isNewBest: true,
    assets: resolveShareCardAssets(12),
  };
}

function createRenderedCanvas() {
  const canvas = document.createElement("canvas");
  Object.defineProperty(canvas, "toBlob", {
    value: (callback: BlobCallback) => {
      callback(new Blob(["png"], { type: "image/png" }));
    },
  });

  return {
    canvas,
    width: 1080,
    height: 1920,
    safeArea: {
      left: 96,
      top: 120,
      right: 96,
      bottom: 120,
    },
    assetMode: "static" as const,
    heroSource: "/assets/cats/cat-12.png",
  };
}

describe("share card export", () => {
  test("uses the renderer input before native share", async () => {
    const renderInput = createRenderInput();
    const renderSpy = vi.fn().mockResolvedValue(createRenderedCanvas());
    const share = vi.fn().mockResolvedValue(undefined);
    const canShare = vi.fn().mockReturnValue(true);
    const download = vi.fn();

    const result = await exportShareCardFromRenderer({
      renderInput,
      render: renderSpy,
      fileName: "share-card.png",
      capabilities: { share, canShare, download },
    });

    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(renderSpy).toHaveBeenCalledWith(renderInput);
    expect(renderSpy.mock.calls[0][0].assets.previewMode).toBe("gif");
    expect(canShare).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledTimes(1);
    expect(download).not.toHaveBeenCalled();
    expect(result).toBe("shared");
  });

  test("falls back to download when the share target is unavailable", async () => {
    const renderInput = createRenderInput();
    const renderSpy = vi.fn().mockResolvedValue(createRenderedCanvas());
    const download = vi.fn();

    const result = await exportShareCardFromRenderer({
      renderInput,
      render: renderSpy,
      fileName: "share-card.png",
      capabilities: { download },
    });

    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(renderSpy).toHaveBeenCalledWith(renderInput);
    expect(download).toHaveBeenCalledTimes(1);
    expect(result).toBe("downloaded");
  });

  test("falls back to download when share cannot handle the rendered asset", async () => {
    const renderInput = createRenderInput();
    const renderSpy = vi.fn().mockResolvedValue({
      ...createRenderedCanvas(),
      assetMode: "placeholder" as const,
    });
    const share = vi.fn();
    const canShare = vi.fn().mockReturnValue(false);
    const download = vi.fn();

    const result = await exportShareCardFromRenderer({
      renderInput,
      render: renderSpy,
      fileName: "share-card.png",
      capabilities: { share, canShare, download },
    });

    expect(renderSpy).toHaveBeenCalledTimes(1);
    expect(renderSpy).toHaveBeenCalledWith(renderInput);
    expect(canShare).toHaveBeenCalledTimes(1);
    expect(share).not.toHaveBeenCalled();
    expect(download).toHaveBeenCalledTimes(1);
    expect(result).toBe("downloaded");
  });
});

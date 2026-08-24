import Phaser from "phaser";

import { ALL_CAT_ASSET_KEYS } from "../config/cats";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload(): void {
    ALL_CAT_ASSET_KEYS.forEach((assetKey) => {
      this.load.image(assetKey, `/assets/cats/${assetKey}.png`);
    });
  }

  create(): void {
    this.scene.start("game");
  }
}

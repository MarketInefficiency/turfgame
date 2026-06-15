import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { CONFIG, castleSvg, hexToNumber } from "@territory/shared";
import { formatArmy } from "./avatar";

/**
 * A player's capital: a castle drawn in world space on the capital cell, with the owner's colour
 * as a pennant and the power-point number printed underneath.
 *
 * The castle is a browser-RASTERIZED SVG (a Sprite), not Pixi's Graphics.svg. Graphics.svg
 * tessellates the strokes and left visible line artifacts in-game; rasterizing the exact same SVG
 * the shop renders inline makes the in-game capital crisp, static, and identical to the preview.
 */
const CASTLE_W = 40; // on-screen width every design is normalized to (world px)
const CASTLE_H = (CASTLE_W * 43) / 48; // keep the SVG's 48x43 viewBox aspect
const BASE_Y = 14; // castle base sits here; the power label hangs just below
const RASTER = 6; // supersample factor so the castle stays sharp when zoomed in

// Each design rasterized once (shared across all capitals wearing it).
const castleTexCache = new Map<string, Promise<Texture>>();
function loadCastleTexture(id: string): Promise<Texture> {
  let p = castleTexCache.get(id);
  if (!p) {
    // Give the SVG explicit pixel dimensions so the browser rasterizes it at high resolution.
    const svg = castleSvg(id).replace("<svg ", `<svg width="${48 * RASTER}" height="${43 * RASTER}" `);
    const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    p = new Promise<Texture>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(Texture.from(img));
      img.onerror = reject;
      img.src = url;
    });
    castleTexCache.set(id, p);
  }
  return p;
}

export class Capital {
  readonly view = new Container();
  private readonly castle = new Sprite();
  private readonly flag = new Graphics(); // pennant, drawn white and tinted to the owner's colour
  private readonly label: Text;
  private color = "";
  private design = "";
  private power = -1;

  constructor() {
    // Bottom-centre anchor so the castle base lands exactly on BASE_Y for every design.
    this.castle.anchor.set(0.5, 1);
    this.castle.position.set(0, BASE_Y);

    // Pennant authored from its own top-left (0,0); pokes from the castle top.
    this.flag
      .poly([0, 0, 11, 2.6, 0, 5.2])
      .fill(0xffffff)
      .stroke({ width: 1.4, color: hexToNumber(CONFIG.CAPITAL_EDGE) });
    this.flag.position.set(0, BASE_Y - CASTLE_H);
    this.setDesign("default");

    this.label = new Text({
      text: "0",
      style: {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: 13,
        fontWeight: "800",
        fill: "#ffffff",
        stroke: { color: "#11151b", width: 4 },
        align: "center",
      },
    });
    this.label.anchor.set(0.5, 0);
    this.label.position.set(0, 16); // hangs just below the castle base
    this.view.addChild(this.castle, this.flag, this.label);
  }

  /** Render a castle design (cosmetic) from its rasterized texture, sized to CASTLE_W. */
  setDesign(id: string): void {
    if (id === this.design) return;
    this.design = id;
    void loadCastleTexture(id)
      .then((tex) => {
        if (this.design !== id || this.castle.destroyed) return; // design changed / capital gone
        this.castle.texture = tex;
        this.castle.width = CASTLE_W;
        this.castle.height = CASTLE_H;
      })
      .catch(() => {
        if (this.castle.destroyed) return; // parse/raster failure → plain tinted block, never empty
        this.castle.texture = Texture.WHITE;
        this.castle.width = CASTLE_W;
        this.castle.height = CASTLE_H;
        this.castle.tint = hexToNumber(CONFIG.CAPITAL_COLOR);
      });
  }

  setColor(hex: string): void {
    if (hex === this.color) return;
    this.color = hex;
    this.flag.tint = hexToNumber(hex);
  }

  setPower(n: number): void {
    if (n === this.power) return;
    this.power = n;
    this.label.text = formatArmy(n);
  }

  place(x: number, y: number): void {
    this.view.position.set(x, y);
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}

import { Container, Graphics, Text } from "pixi.js";
import { CONFIG, contrastTextColor, lerpHex } from "@territory/shared";

/** Overshoot ease for the sword pop-in. */
function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/**
 * One player's on-screen avatar: a fixed-size circle with a contrasting border and
 * the army number printed in its center (game-spec §11, ui-ux §3). The border is a
 * separate ring drawn white and recolored via `tint`, so it can flip with the
 * day/night cycle every frame without redrawing geometry.
 */
export class Avatar {
  readonly view = new Container();
  /** Interpolated render position in world units (used for remote players). */
  renderX = 0;
  renderY = 0;

  private readonly fill = new Graphics();
  private readonly ring = new Graphics();
  private readonly label: Text;
  private readonly nameText: Text;
  private readonly sword = new Graphics(); // combat icon, animated above the avatar
  private readonly crown = new Graphics(); // top-3 leaderboard rank, worn on the head
  private color = "";
  private army = Number.NaN;
  private name = "";
  private crownRank = -1;
  private fighting = false;
  private swordT = 0; // 0..1 pop progress
  private bobT = 0;
  private readonly swordBaseY: number;

  constructor() {
    const r = CONFIG.AVATAR_RADIUS;
    // White ring → tinted to the day/night border color each frame.
    this.ring.circle(0, 0, r).stroke({ width: 3, color: 0xffffff });

    // Golden sword (drawn once, pointing up), floated above the circle when fighting.
    // Every part gets a bold dark outline so it reads on any floor/territory colour.
    const gold = CONFIG.SWORD_COLOR;
    const shine = lerpHex(gold, "#ffffff", 0.55);
    const guardCol = lerpHex(gold, "#7a4f10", 0.6); // bronze for guard + grip
    const edge = lerpHex(gold, "#000000", 0.82); // strong outline
    const ow = 1.8;
    const s = this.sword;
    // Origin sits at the hilt (~y=0) so it swings from the hand. Long pointed blade up.
    s.poly([0, -33, 3, -21, 2.3, -2.5, -2.3, -2.5, -3, -21]).fill(gold).stroke({ width: ow, color: edge, join: "round" });
    s.moveTo(0, -29).lineTo(0, -4).stroke({ width: 1.1, color: shine, alpha: 0.85 }); // fuller highlight
    // Grip (under the guard) with a couple of wrap lines.
    s.roundRect(-2, 1, 4, 9, 1.5).fill(guardCol).stroke({ width: ow, color: edge });
    s.moveTo(-2, 4).lineTo(2, 4).moveTo(-2, 6.5).lineTo(2, 6.5).stroke({ width: 0.9, color: edge, alpha: 0.7 });
    // Crossguard: flared bar, then ball tips on top.
    s.poly([-9.5, -3, 9.5, -3, 8.5, 1.2, -8.5, 1.2]).fill(guardCol).stroke({ width: ow, color: edge, join: "round" });
    s.circle(-9, -1, 2.6).fill(guardCol).stroke({ width: ow, color: edge });
    s.circle(9, -1, 2.6).fill(guardCol).stroke({ width: ow, color: edge });
    // Diamond pommel.
    s.poly([0, 10, 3.4, 13.5, 0, 17, -3.4, 13.5]).fill(gold).stroke({ width: ow, color: edge, join: "round" });

    this.swordBaseY = -(r + 20);
    this.sword.position.set(0, this.swordBaseY);
    this.sword.scale.set(0);
    this.sword.visible = false;

    this.label = new Text({
      text: "",
      style: {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: 15,
        fontWeight: "700",
        fill: "#ffffff",
      },
    });
    this.label.anchor.set(0.5);

    // Name under the avatar: small, white with a thin dark outline so it reads on the
    // white (day) and black (night) floors and over any territory colour.
    this.nameText = new Text({
      text: "",
      style: {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: 12,
        fontWeight: "600",
        fill: "#ffffff",
        stroke: { color: "#1a1d22", width: 3 },
        align: "center",
      },
    });
    this.nameText.anchor.set(0.5, 0); // centered, hanging below
    this.nameText.position.set(0, r + 5);
    this.nameText.alpha = 0.9;

    this.crown.position.set(0, -r * 0.4); // band just above the number; points cover the top
    this.crown.visible = false;

    this.view.addChild(this.fill, this.ring, this.crown, this.label, this.nameText, this.sword);
  }

  setName(name: string): void {
    if (name === this.name) return;
    this.name = name;
    this.nameText.text = name;
  }

  /** Show a leaderboard crown: 1 = gold, 2 = silver, 3 = bronze, anything else = none. */
  setCrown(rank: number): void {
    if (rank === this.crownRank) return;
    this.crownRank = rank;
    this.crown.clear();
    if (rank < 1 || rank > 3) {
      this.crown.visible = false;
      return;
    }
    this.crown.visible = true;
    const col = rank === 1 ? CONFIG.CROWN_GOLD : rank === 2 ? CONFIG.CROWN_SILVER : CONFIG.CROWN_BRONZE;
    const edge = lerpHex(col, "#000000", 0.78); // bold outline for visibility
    const jewel = lerpHex(col, "#ffffff", 0.55);
    const w = CONFIG.AVATAR_RADIUS * 0.92; // ~spans the circle width
    // 5-point crown: flat band, peaks rising over the top of the circle.
    this.crown
      .poly([
        -w, 0, -w, -15, -w * 0.75, -5, -w * 0.5, -19, -w * 0.25, -5,
        0, -23, w * 0.25, -5, w * 0.5, -19, w * 0.75, -5, w, -15, w, 0,
      ])
      .fill(col)
      .stroke({ width: 2.4, color: edge, join: "round" });
    // Jewels.
    this.crown.circle(0, -6, 2.8).fill(jewel).stroke({ width: 1, color: edge });
    this.crown.circle(-w * 0.5, -9, 1.7).fill(jewel).stroke({ width: 0.8, color: edge });
    this.crown.circle(w * 0.5, -9, 1.7).fill(jewel).stroke({ width: 0.8, color: edge });
  }

  /** Current fill colour (for the death crumble effect). */
  get fillColor(): string {
    return this.color;
  }

  /** Toggle the combat state (server-driven). */
  setFighting(on: boolean): void {
    this.fighting = on;
  }

  /** Advance combat-icon animation: pop in, then swing wildly on a diagonal while fighting. */
  tickFx(dt: number): void {
    if (this.fighting) {
      this.swordT = Math.min(1, this.swordT + dt * 5);
      this.bobT += dt;
    } else {
      this.swordT = Math.max(0, this.swordT - dt * 9);
    }
    if (this.swordT <= 0.001) {
      this.sword.visible = false;
      return;
    }
    this.sword.visible = true;
    const t = this.bobT;
    this.sword.scale.set(easeOutBack(this.swordT));
    // Rests on a diagonal, then slashes hard around it — fast, big arc, two mixed
    // frequencies so it reads as frantic rather than a steady metronome.
    const DIAGONAL = 0.5;
    this.sword.rotation = DIAGONAL + Math.sin(t * 19) * 0.62 + Math.sin(t * 11.3) * 0.3;
    this.sword.position.set(
      Math.sin(t * 15) * 4,
      this.swordBaseY - Math.abs(Math.sin(t * 17)) * 5.5,
    );
  }

  setColor(color: string): void {
    if (color === this.color) return;
    this.color = color;
    this.fill.clear();
    this.fill.circle(0, 0, CONFIG.AVATAR_RADIUS).fill(color);
    this.label.style.fill = contrastTextColor(color);
  }

  setArmy(army: number): void {
    if (army === this.army) return;
    this.army = army;
    this.label.text = formatArmy(army);
  }

  /** Recolor the border (0xRRGGBB) — cheap tint, no redraw. */
  setBorderTint(tint: number): void {
    this.ring.tint = tint;
  }

  /** Place at a world position, counter-scaling so screen size stays constant. */
  place(x: number, y: number, invZoom: number): void {
    this.view.position.set(x, y);
    this.view.scale.set(invZoom);
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}

/** Abbreviate large numbers to stay legible inside the circle (game-spec §11). */
export function formatArmy(n: number): string {
  const v = Math.round(n);
  if (v < 1000) return String(v);
  if (v < 1_000_000) return `${(v / 1000).toFixed(v < 10_000 ? 1 : 0)}k`;
  return `${(v / 1_000_000).toFixed(1)}m`;
}

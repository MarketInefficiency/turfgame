import { Container, Graphics, Text } from "pixi.js";
import { CONFIG, hexToNumber, lerpHex } from "@territory/shared";
import { formatArmy } from "./avatar";

/**
 * A player's capital: a small, crenellated stone castle drawn in world space on the
 * capital cell, with the owner's color as a pennant and the power-point number printed
 * underneath. Heavily outlined so it stays readable on any territory color / floor.
 */
export class Capital {
  readonly view = new Container();
  private readonly castle = new Graphics();
  private readonly flag = new Graphics(); // drawn white, tinted to the owner's color
  private readonly label: Text;
  private color = "";
  private power = -1;

  constructor() {
    this.build();
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

  private build(): void {
    const stone = hexToNumber(CONFIG.CAPITAL_COLOR);
    const edge = hexToNumber(CONFIG.CAPITAL_EDGE);
    const dark = hexToNumber(lerpHex(CONFIG.CAPITAL_COLOR, "#000000", 0.55)); // gate + windows
    const ow = 2;
    const g = this.castle;
    const merlon = (x: number, y: number): Graphics =>
      g.rect(x, y, 4, 4).fill(stone).stroke({ width: ow, color: edge });

    // Masses: outer wall, two side towers, taller central keep.
    g.rect(-18, 2, 36, 12).fill(stone).stroke({ width: ow, color: edge });
    g.rect(-20, -5, 10, 19).fill(stone).stroke({ width: ow, color: edge });
    g.rect(10, -5, 10, 19).fill(stone).stroke({ width: ow, color: edge });
    g.rect(-7, -11, 14, 25).fill(stone).stroke({ width: ow, color: edge });
    // Battlements along the tops.
    merlon(-20, -9); merlon(-14, -9);
    merlon(10, -9); merlon(16, -9);
    merlon(-7, -15); merlon(-2, -15); merlon(3, -15);
    // Gate and arrow-slit windows.
    g.roundRect(-4, 5, 8, 9, 2).fill(dark);
    g.rect(-13, -1, 2.5, 4).fill(dark);
    g.rect(10.5, -1, 2.5, 4).fill(dark);
    g.rect(-1.2, -6, 2.4, 4).fill(dark);
    // Flag pole rising from the keep.
    g.rect(-0.6, -22, 1.2, 7).fill(edge);

    // Pennant (white → tinted to the owner's color per-instance).
    this.flag.poly([0, -22, 11, -19.5, 0, -16.5]).fill(0xffffff).stroke({ width: 1.4, color: edge });
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

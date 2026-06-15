import { Container, Graphics, MeshRope, Point, Sprite, Text, Texture } from "pixi.js";
import { CONFIG, cloakSvg, hairSvg, hatSvg, lerpHex, shirtSvg, swordSvg } from "@territory/shared";
import { loadCosmeticTexture, makeCosmeticSprite } from "./cosmeticTexture";

/** Browser-rasterize an SVG design string (cached per key) so it's crisp + matches the shop. */
function svgTextureLoader(): (key: string, svg: string) => Promise<Texture> {
  const cache = new Map<string, Promise<Texture>>();
  return (key, svg) => {
    let p = cache.get(key);
    if (!p) {
      // Hi-res raster preserving the viewBox aspect ratio (so non-square designs aren't stretched).
      const m = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
      const vw = m ? parseFloat(m[1]!) : 100;
      const vh = m ? parseFloat(m[2]!) : 100;
      const s = 400 / Math.max(vw, vh);
      const hi = svg.replace("<svg ", `<svg width="${Math.round(vw * s)}" height="${Math.round(vh * s)}" `);
      const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(hi)}`;
      p = new Promise<Texture>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(Texture.from(img));
        img.onerror = reject;
        img.src = url;
      });
      cache.set(key, p);
    }
    return p;
  };
}
const loadCloakTex = svgTextureLoader();
const loadSwordTex = svgTextureLoader();
const loadHairTex = svgTextureLoader();
const loadHatTex = svgTextureLoader();
const loadShirtTex = svgTextureLoader();
const loadSwordTexture = (id: string): Promise<Texture> => loadSwordTex(id, swordSvg(id));

/** A colored swoosh streak (transparent tail → bright head) for the sword trail, cached per colour. */
const trailTexCache = new Map<string, Texture>();
function trailTexture(color: string): Texture {
  let t = trailTexCache.get(color);
  if (t) return t;
  const w = 96;
  const h = 28;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  // Length-wise: tail (left) transparent → head (right) opaque.
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, "rgba(255,255,255,0)");
  grad.addColorStop(1, "rgba(255,255,255,1)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // Soft top/bottom edges.
  const vg = ctx.createLinearGradient(0, 0, 0, h);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(0.5, "rgba(0,0,0,1)");
  vg.addColorStop(1, "rgba(0,0,0,0)");
  ctx.globalCompositeOperation = "destination-in";
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
  // Tint the white streak to the sword colour, preserving the alpha profile.
  ctx.globalCompositeOperation = "source-atop";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
  t = Texture.from(c);
  trailTexCache.set(color, t);
  return t;
}

/** A soft radial disc (white center → transparent edge), shared for avatar shadows and glows. */
let radialTex: Texture | null = null;
function radialTexture(): Texture {
  if (radialTex) return radialTex;
  const size = 128;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  radialTex = Texture.from(c);
  return radialTex;
}

// Blade reach (tip distance from the hilt). Short = the original dagger length; long = a full
// sword; design = the rasterized epic blades (authored long). The swoosh trail attaches at the tip.
const SWORD_REACH = { short: 33, long: 50, design: 43 } as const;

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

  private readonly glow = new Sprite(radialTexture()); // night halo (additive), behind the body
  private readonly shadow = new Sprite(radialTexture()); // daytime ground shadow, under the body
  private readonly cloak = new Sprite(); // cape/wings behind the avatar (members-only cosmetic)
  private cloakId = "";
  private readonly hair = new Sprite(); // on the head, under the hat
  private readonly hat = new Sprite(); // on the head, over hair (a top-3 crown replaces it)
  private readonly shirt = new Sprite(); // on the body, under cloaks
  private hairId = "";
  private hatId = "";
  private shirtId = "";
  private hatHasArt = false;
  private crownActive = false;
  private readonly fill = new Graphics();
  private readonly skinMask = new Graphics(); // clips an image/GIF skin to the avatar circle
  private skinSprite: Sprite | null = null; // image/GIF skin wrapping the circle (null = colour fill)
  private skinUrl = "";
  private readonly ring = new Graphics();
  private readonly label: Text;
  private readonly nameText: Text;
  private readonly sword = new Container(); // animated holder for the blade (procedural or design)
  private readonly swordGfx = new Graphics(); // procedural recolourable blade (default/silver/...)
  private swordSprite: Sprite | null = null; // rasterized design blade (katana, flamberge, ...)
  private swordDesignId = "";
  private swordReach: number = SWORD_REACH.short; // current blade tip distance (drives the swoosh attach point)
  private swordLong = false;
  private readonly crown = new Graphics(); // top-3 leaderboard rank, worn on the head
  private color = "";
  private army = Number.NaN;
  private name = "";
  private crownRank = -1;
  private fighting = false;
  private swordT = 0; // 0..1 pop progress
  private bobT = 0;
  private swordColor: string = CONFIG.SWORD_COLOR; // recoloured by sword cosmetics
  private readonly swordBaseY: number;
  private multiAttacked = false; // ganged by 2+ foes → sword spins around the avatar, big + dramatic
  private spinClock = 0;
  private flareUrl = "";
  private readonly trailPts: Point[] = Array.from({ length: 18 }, () => new Point(0, 0));
  private readonly trail: MeshRope; // swoosh ribbon following the blade tip (sword's flare/colour)

  constructor() {
    const r = CONFIG.AVATAR_RADIUS;

    // Night glow: a warm additive halo that lights up the dark floor around the avatar.
    this.glow.anchor.set(0.5);
    this.glow.width = this.glow.height = r * 6;
    this.glow.tint = 0xffe2a6;
    this.glow.blendMode = "add";
    this.glow.alpha = 0;
    // Daytime shadow: a soft dark disc squashed under the feet, on the bright floor.
    this.shadow.anchor.set(0.5);
    this.shadow.width = r * 3.1;
    this.shadow.height = r * 1.7;
    this.shadow.tint = 0x000000;
    this.shadow.position.set(0, r * 0.6);
    this.shadow.alpha = 0;

    // White ring → tinted to the day/night border color each frame.
    this.ring.circle(0, 0, r).stroke({ width: 3, color: 0xffffff });

    // Sword (floated above the circle when fighting). The procedural blade can be recoloured; design
    // swords swap in a rasterized sprite. Either lives inside the `sword` container that's animated.
    this.sword.addChild(this.swordGfx);
    this.buildSword(CONFIG.SWORD_COLOR);

    this.swordBaseY = -(r + 20);
    this.sword.position.set(0, this.swordBaseY);
    this.sword.scale.set(0);
    this.sword.visible = false;

    // The army number: white with a heavy dark outline so it stays legible over ANY fill —
    // a flat colour, a busy image/GIF skin, or the day/night floor. The outline (not the fill)
    // does the work, so legibility no longer depends on contrasting against the skin colour.
    this.label = new Text({
      text: "",
      style: {
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: 15,
        fontWeight: "800",
        fill: "#ffffff",
        stroke: { color: "#0c0f14", width: 3.5, join: "round" },
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

    this.skinMask.circle(0, 0, r).fill(0xffffff); // used only as a clip for an image skin (kept out
    // of the display list, so it never renders as a visible white circle on avatars without one)
    this.cloak.anchor.set(0.5); // centred on the avatar; the body hides its inner part
    this.cloak.visible = false;
    for (const w of [this.shirt, this.hair, this.hat]) {
      w.anchor.set(0.5);
      w.visible = false;
    }
    // Order: …, ring, SHIRT (under cloaks), HAIR, crown, HAT (crown overrides it), number, …
    this.view.addChild(this.glow, this.shadow, this.cloak, this.fill, this.ring, this.shirt, this.hair, this.crown, this.hat, this.label, this.nameText, this.sword);

    // Sword trail (swoosh) — a ribbon following the blade tip, textured/coloured by the sword's
    // flare. Sits just under the blade so the sword reads over its own swoosh.
    this.trail = new MeshRope({ texture: trailTexture(CONFIG.SWORD_COLOR), points: this.trailPts, width: r });
    this.trail.blendMode = "add";
    this.trail.visible = false;
    this.view.addChildAt(this.trail, this.view.getChildIndex(this.sword));
  }

  setName(name: string): void {
    if (name === this.name) return;
    this.name = name;
    this.nameText.text = name;
  }

  /**
   * Apply a sword cosmetic. Design swords (a SWORD_SVGS id) swap in a rasterized blade sprite;
   * the rest recolour the procedural blade, whose length is short or long (`long`). `color` always
   * tints the swoosh trail; the trail attaches at the blade tip (`swordReach`).
   */
  setSword(id: string, color: string, long: boolean): void {
    if (id === this.swordDesignId && color === this.swordColor && long === this.swordLong) return;
    const designChanged = id !== this.swordDesignId;
    this.swordDesignId = id;
    this.swordColor = color;
    this.swordLong = long;
    if (!this.flareUrl) this.refreshTrail(); // the swoosh follows the sword's colour

    if (!swordSvg(id)) {
      // Recolourable procedural blade (default / silver / crimson / azure / studio-made).
      if (this.swordSprite) {
        this.swordSprite.removeFromParent();
        this.swordSprite.destroy();
        this.swordSprite = null;
      }
      this.swordReach = long ? SWORD_REACH.long : SWORD_REACH.short;
      this.swordGfx.visible = true;
      this.buildSword(color, this.swordReach);
      return;
    }
    this.swordReach = SWORD_REACH.design; // design blades are authored long
    if (!designChanged) return; // same design, only the swoosh colour changed

    this.swordGfx.visible = false;
    if (this.swordSprite) {
      this.swordSprite.removeFromParent();
      this.swordSprite.destroy();
      this.swordSprite = null;
    }
    void loadSwordTexture(id).then((tex) => {
      if (this.swordDesignId !== id || this.sword.destroyed) return;
      const sp = new Sprite(tex);
      sp.anchor.set(0.5, 44 / 66); // hilt origin → blade tip lands at -SWORD_REACH.design, where the trail attaches
      sp.width = 28;
      sp.height = 66;
      this.swordSprite = sp;
      this.sword.addChild(sp);
    });
  }

  private buildSword(gold: string, reach: number = SWORD_REACH.short): void {
    const shine = lerpHex(gold, "#ffffff", 0.55);
    const guardCol = lerpHex(gold, "#7a4f10", 0.6); // bronze for guard + grip
    const edge = lerpHex(gold, "#000000", 0.82); // strong outline
    const ow = 1.8;
    const s = this.swordGfx;
    s.clear();
    // Origin sits at the hilt (~y=0) so it swings from the hand. Blade scales to `reach` (short/long).
    const tip = -reach;
    const sh = -reach * 0.64; // the blade's widest "shoulders"
    s.poly([0, tip, 3, sh, 2.3, -2.5, -2.3, -2.5, -3, sh]).fill(gold).stroke({ width: ow, color: edge, join: "round" });
    s.moveTo(0, tip + 4).lineTo(0, -4).stroke({ width: 1.1, color: shine, alpha: 0.85 }); // fuller highlight
    // Grip (under the guard) with a couple of wrap lines.
    s.roundRect(-2, 1, 4, 9, 1.5).fill(guardCol).stroke({ width: ow, color: edge });
    s.moveTo(-2, 4).lineTo(2, 4).moveTo(-2, 6.5).lineTo(2, 6.5).stroke({ width: 0.9, color: edge, alpha: 0.7 });
    // Crossguard: flared bar, then ball tips on top.
    s.poly([-9.5, -3, 9.5, -3, 8.5, 1.2, -8.5, 1.2]).fill(guardCol).stroke({ width: ow, color: edge, join: "round" });
    s.circle(-9, -1, 2.6).fill(guardCol).stroke({ width: ow, color: edge });
    s.circle(9, -1, 2.6).fill(guardCol).stroke({ width: ow, color: edge });
    // Diamond pommel.
    s.poly([0, 10, 3.4, 13.5, 0, 17, -3.4, 13.5]).fill(gold).stroke({ width: ow, color: edge, join: "round" });
  }

  /** Show a leaderboard crown: 1 = gold, 2 = silver, 3 = bronze, anything else = none. */
  setCrown(rank: number): void {
    if (rank === this.crownRank) return;
    this.crownRank = rank;
    this.crown.clear();
    if (rank < 1 || rank > 3) {
      this.crown.visible = false;
      this.crownActive = false;
      this.hat.visible = this.hatHasArt; // crown gone → the hat (if any) returns
      return;
    }
    this.crown.visible = true;
    this.crownActive = true;
    this.hat.visible = false; // a top-3 crown replaces the hat
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

  /** Server-driven count of foes draining this avatar. 2+ triggers the spinning-sword + flare. */
  setAttackers(n: number): void {
    this.multiAttacked = n > 1;
  }

  /** Set the sword's flare (the swoosh trail's texture). An image/GIF url textures the trail;
   *  null falls back to a coloured streak in the sword's own colour. */
  setSwordFlare(url: string | null): void {
    const u = url ?? "";
    if (u === this.flareUrl) return;
    this.flareUrl = u;
    this.refreshTrail();
  }

  /** Point the trail at the current flare texture (image) or a colour streak (the sword colour). */
  private refreshTrail(): void {
    if (this.flareUrl) {
      const u = this.flareUrl;
      this.trail.blendMode = "normal"; // respect the texture's own look (fire, clouds, …)
      void loadCosmeticTexture(u).then((tex) => {
        if (this.flareUrl !== u || this.trail.destroyed) return;
        this.trail.texture = tex;
      });
    } else {
      this.trail.blendMode = "add"; // a coloured streak glows
      this.trail.texture = trailTexture(this.swordColor);
    }
  }

  /**
   * Advance the combat animation. Ganged (2+ attackers): the blade grows and whips a full orbit
   * around the avatar in fast intervals, the swoosh trailing it. Single foe: the frantic diagonal
   * slash. Either way the trail (the sword's flare) streams from the blade tip; otherwise it retracts.
   */
  tickFx(dt: number): void {
    const wantSword = this.fighting || this.multiAttacked;
    if (wantSword) {
      this.swordT = Math.min(1, this.swordT + dt * 5);
      this.bobT += dt;
    } else {
      this.swordT = Math.max(0, this.swordT - dt * 9);
    }
    if (this.swordT <= 0.001) {
      this.sword.visible = false;
      this.updateTrail(false);
      this.spinClock = 0;
      return;
    }
    this.sword.visible = true;

    if (this.multiAttacked) {
      this.spinClock += dt;
      const PERIOD = 1.4; // a fast whip + a short rest
      const SPIN = 0.58; // duration of the orbit (short = dramatic)
      const R = CONFIG.AVATAR_RADIUS * 2.0; // bigger orbit when ganged
      const phase = this.spinClock % PERIOD;
      const spinning = phase < SPIN;
      this.sword.scale.set(easeOutBack(this.swordT) * 1.4); // bigger, more dramatic blade
      if (spinning) {
        const u = phase / SPIN; // 0..1 across one full orbit
        const ang = -Math.PI / 2 + u * Math.PI * 2; // start above the head, sweep all the way round
        this.sword.position.set(Math.cos(ang) * R, Math.sin(ang) * R);
        this.sword.rotation = ang + Math.PI / 2; // blade points radially outward
      } else {
        this.sword.position.set(0, this.swordBaseY); // rest above the head between whips
        this.sword.rotation = 0;
      }
      this.updateTrail(spinning);
      return;
    }

    // Single-foe slash: rests on a diagonal, then slashes hard around it — two mixed frequencies
    // so it reads as frantic rather than a steady metronome.
    this.sword.scale.set(easeOutBack(this.swordT));
    const t = this.bobT;
    const DIAGONAL = 0.5;
    this.sword.rotation = DIAGONAL + Math.sin(t * 19) * 0.62 + Math.sin(t * 11.3) * 0.3;
    this.sword.position.set(
      Math.sin(t * 15) * 4,
      this.swordBaseY - Math.abs(Math.sin(t * 17)) * 5.5,
    );
    this.updateTrail(true);
  }

  /** Slide the blade tip's recent positions through the trail's points (or collapse it when idle). */
  private updateTrail(active: boolean): void {
    const ss = this.sword.scale.x;
    const rot = this.sword.rotation;
    const tipX = this.sword.x + this.swordReach * Math.sin(rot) * ss; // blade tip in view space
    const tipY = this.sword.y - this.swordReach * Math.cos(rot) * ss;
    const pts = this.trailPts;
    if (!active) {
      for (const p of pts) p.set(tipX, tipY); // collapse so it pops in clean next time
      this.trail.visible = false;
      return;
    }
    this.trail.visible = true;
    for (let i = 0; i < pts.length - 1; i++) pts[i]!.copyFrom(pts[i + 1]!); // oldest→tail, newest→head
    pts[pts.length - 1]!.set(tipX, tipY);
  }

  /** Day/night feedback: `nf` is 0 (full day) … 1 (full night). Day shows a ground shadow; night
   *  fades that out and raises a warm glow around the avatar. */
  setDayNight(nf: number): void {
    this.shadow.alpha = (1 - nf) * 0.46; // discrete, but enough to read as a grounded shadow
    this.glow.alpha = nf * 0.6;
  }

  /** Wear a cloak: `design` ("cloak_red", "wings_dragon", …) + `color` (recolours the wings). Wings
   *  sit BEHIND the body; capes sit OVER the lower body but UNDER the number. "default"/"" clears it. */
  setCloak(design: string, color: string): void {
    const key = !design || design === "default" ? "" : `${design}:${color}`;
    if (key === this.cloakId) return;
    this.cloakId = key;
    const svg = key ? cloakSvg(design, color) : "";
    if (!svg) {
      this.cloak.visible = false;
      return;
    }
    // Re-layer for this design: wings behind the fill, capes just under the number label.
    this.cloak.removeFromParent();
    const wings = design.startsWith("wings_");
    const anchor = wings ? this.fill : this.label;
    this.view.addChildAt(this.cloak, this.view.getChildIndex(anchor));
    void loadCloakTex(key, svg)
      .then((tex) => {
        if (this.cloakId !== key || this.cloak.destroyed) return;
        this.cloak.texture = tex;
        const s = CONFIG.AVATAR_RADIUS * 5; // frames the body; wings/flaps reach past the circle
        this.cloak.width = s;
        this.cloak.height = s;
        this.cloak.visible = true;
      })
      .catch(() => {
        if (!this.cloak.destroyed) this.cloak.visible = false;
      });
  }

  /** Hair worn on the head (under the hat). "default"/"" clears it. */
  setHair(id: string): void {
    const cid = id || "default";
    if (cid === this.hairId) return;
    this.hairId = cid;
    const svg = hairSvg(cid);
    if (cid === "default" || !svg) {
      this.hair.visible = false;
      return;
    }
    void loadHairTex(cid, svg)
      .then((tex) => {
        if (this.hairId !== cid || this.hair.destroyed) return;
        this.hair.texture = tex;
        this.hair.width = this.hair.height = CONFIG.AVATAR_RADIUS * 5;
        this.hair.visible = true;
      })
      .catch(() => {
        if (!this.hair.destroyed) this.hair.visible = false;
      });
  }

  /** Shirt worn on the body (under cloaks). "default"/"" clears it. */
  setShirt(id: string): void {
    const cid = id || "default";
    if (cid === this.shirtId) return;
    this.shirtId = cid;
    const svg = shirtSvg(cid);
    if (cid === "default" || !svg) {
      this.shirt.visible = false;
      return;
    }
    void loadShirtTex(cid, svg)
      .then((tex) => {
        if (this.shirtId !== cid || this.shirt.destroyed) return;
        this.shirt.texture = tex;
        this.shirt.width = this.shirt.height = CONFIG.AVATAR_RADIUS * 5;
        this.shirt.visible = true;
      })
      .catch(() => {
        if (!this.shirt.destroyed) this.shirt.visible = false;
      });
  }

  /** Hat worn on the head (over hair). A top-3 leaderboard crown temporarily replaces it. */
  setHat(id: string): void {
    const cid = id || "default";
    if (cid === this.hatId) return;
    this.hatId = cid;
    const svg = hatSvg(cid);
    this.hatHasArt = cid !== "default" && !!svg;
    if (!this.hatHasArt) {
      this.hat.visible = false;
      return;
    }
    void loadHatTex(cid, svg)
      .then((tex) => {
        if (this.hatId !== cid || this.hat.destroyed) return;
        this.hat.texture = tex;
        this.hat.width = this.hat.height = CONFIG.AVATAR_RADIUS * 5;
        this.hat.visible = !this.crownActive; // the crown overrides the hat
      })
      .catch(() => {
        if (!this.hat.destroyed) this.hat.visible = false;
      });
  }

  setColor(color: string): void {
    if (color === this.color) return;
    this.color = color;
    this.fill.clear();
    this.fill.circle(0, 0, CONFIG.AVATAR_RADIUS).fill(color);
    // Number stays white-with-dark-outline (set once at construction) so it reads over any fill;
    // no longer flips colour with the skin.
  }

  /** Wrap the avatar circle in an image/GIF skin, or pass null/"" to fall back to the colour fill. */
  setSkin(url: string | null): void {
    const u = url ?? "";
    if (u === this.skinUrl) return;
    this.skinUrl = u;
    if (this.skinSprite) {
      this.skinSprite.destroy();
      this.skinSprite = null;
    }
    if (!u) {
      this.skinMask.removeFromParent(); // no image skin → mask leaves the avatar (so it never shows)
      this.fill.visible = true;
      return;
    }
    this.fill.visible = false; // the texture covers the circle
    void makeCosmeticSprite(u).then((sprite) => {
      if (this.skinUrl !== u || this.view.destroyed) {
        sprite.destroy();
        return; // skin changed (or avatar gone) while the art loaded
      }
      const r = CONFIG.AVATAR_RADIUS;
      sprite.anchor.set(0.5);
      sprite.width = r * 2;
      sprite.height = r * 2;
      // The mask is a child of the avatar (so it inherits the camera transform) but renders only as
      // a clip, never as a visible circle.
      if (!this.skinMask.parent) this.view.addChild(this.skinMask);
      sprite.mask = this.skinMask;
      this.skinSprite = sprite;
      this.view.addChildAt(sprite, this.view.getChildIndex(this.fill) + 1); // just above the fill
    });
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
    if (this.skinSprite) {
      // Detach + destroy(false): GifSprite.destroy takes a BOOLEAN (destroyData). Letting
      // view.destroy({children:true}) cascade would pass the truthy options object and destroy the
      // SHARED, cached GifSource — corrupting every other avatar using that GIF. false keeps it.
      this.skinSprite.removeFromParent();
      this.skinSprite.destroy(false);
      this.skinSprite = null;
    }
    if (!this.skinMask.parent) this.skinMask.destroy(); // if parented, view.destroy handles it
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

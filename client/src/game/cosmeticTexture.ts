/**
 * Loads cosmetic art (static images or animated GIFs) into PixiJS sprites for in-game rendering.
 * Assets are cached by URL so many avatars wearing the same skin share one decode. GIFs use PixiJS
 * v8's built-in GifSprite; everything else is a plain Sprite.
 */
import { Assets, Sprite, Texture } from "pixi.js";
import { GifSprite, type GifSource } from "pixi.js/gif";
import "pixi.js/gif"; // registers the .gif asset loader with Assets

const cache = new Map<string, Promise<Texture | GifSource>>();

function isSvg(url: string): boolean {
  const u = url.toLowerCase();
  return u.startsWith("data:image/svg") || u.split("?")[0]!.endsWith(".svg");
}

/** Rasterize an SVG (remote or data: URL) at a crisp fixed size. Assets.load can't size
 *  intrinsic-less SVGs and doesn't sniff data: URLs, so SVGs take this <img>+canvas path. */
function loadSvgTexture(url: string): Promise<Texture> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous"; // CDN art must not taint the canvas/WebGL upload
    img.onload = () => {
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("2d context unavailable"));
      ctx.drawImage(img, 0, 0, size, size); // browsers re-render vector SVGs at the target size
      resolve(Texture.from(canvas));
    };
    img.onerror = () => reject(new Error(`svg failed: ${url.slice(0, 64)}`));
    img.src = url;
  });
}

function load(url: string): Promise<Texture | GifSource> {
  let p = cache.get(url);
  if (!p) {
    p = isSvg(url) ? loadSvgTexture(url) : Assets.load(url);
    cache.set(url, p);
  }
  return p;
}

function isGif(url: string): boolean {
  return url.toLowerCase().split("?")[0]!.endsWith(".gif");
}

/** Make a sprite (animated for GIFs) for a cosmetic image URL. Resolves once the art has loaded. */
export async function makeCosmeticSprite(url: string): Promise<Sprite> {
  const asset = await load(url);
  if (isGif(url)) return new GifSprite({ source: asset as GifSource, autoPlay: true });
  return new Sprite(asset as Texture);
}

/** A still Texture for a cosmetic URL (GIFs use their first frame) — e.g. to texture a sword trail. */
export async function loadCosmeticTexture(url: string): Promise<Texture> {
  const asset = await load(url);
  if (isGif(url)) {
    const src = asset as GifSource & { frames?: { texture: Texture }[]; texture?: Texture };
    return src.frames?.[0]?.texture ?? src.texture ?? Texture.WHITE;
  }
  return asset as Texture;
}

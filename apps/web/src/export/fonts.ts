import interRegular from "@fontsource/inter/files/inter-latin-400-normal.woff2?url";
import interSemibold from "@fontsource/inter/files/inter-latin-600-normal.woff2?url";
import kalamRegular from "@fontsource/kalam/files/kalam-latin-400-normal.woff2?url";
import kalamBold from "@fontsource/kalam/files/kalam-latin-700-normal.woff2?url";
import { getStyle } from "../diagram/styles";

interface FontFile {
  readonly family: string;
  readonly weight: number;
  readonly url: string;
}

const FONTS: Readonly<Record<"professional" | "sketch", readonly FontFile[]>> = {
  professional: [
    { family: "Inter", weight: 400, url: interRegular },
    { family: "Inter", weight: 600, url: interSemibold },
  ],
  sketch: [
    { family: "Kalam", weight: 400, url: kalamRegular },
    { family: "Kalam", weight: 700, url: kalamBold },
  ],
};

const cache = new Map<string, Promise<string>>();

async function toDataUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Font download failed (${String(response.status)})`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:font/woff2;base64,${btoa(binary)}`;
}

/**
 * @font-face rules with the style's fonts inlined as data URLs, so exported SVG, PNG
 * and PDF render with the right typeface anywhere (an SVG drawn into an image or opened
 * in another app cannot load the page's web fonts).
 */
export function embeddedFontCss(styleId: string): Promise<string> {
  const key = getStyle(styleId).sketchy ? "sketch" : "professional";
  let pending = cache.get(key);
  if (!pending) {
    pending = Promise.all(
      FONTS[key].map(
        async (font) =>
          `@font-face{font-family:"${font.family}";font-weight:${String(font.weight)};font-style:normal;src:url(${await toDataUrl(font.url)}) format("woff2");}`,
      ),
    ).then((rules) => rules.join(""));
    // Don't cache failures; a later export can retry.
    pending.catch(() => cache.delete(key));
    cache.set(key, pending);
  }
  return pending;
}

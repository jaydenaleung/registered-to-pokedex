import type { CSSProperties } from "react";

/**
 * Device + screen palettes per game mode (INSTRUCTIONS.md §11). Each theme overrides the
 * CSS custom properties of the red Pokédex; anything missing falls back to the default.
 */

interface Theme {
  device: string;
  deviceDark: string;
  deviceLight: string;
  screen?: string;
  screen2?: string;
  screen3?: string;
  screenInk?: string;
  screenDim?: string;
}

// Original Game Boy (DMG) and Game Boy Color style screens.
const DMG = { screen: "#9bbc0f", screen2: "#8bac0f", screen3: "#6f8f0f", screenInk: "#0f380f", screenDim: "#306230" };
const GBC = { screen: "#e0f0d0", screen2: "#c8e0b8", screen3: "#a8c898", screenInk: "#1a2a20", screenDim: "#48604c" };
const GBA = { screen: "#f0f0e8", screen2: "#dcdcd0", screen3: "#c0c0b4", screenInk: "#202028", screenDim: "#585868" };
const DS = { screen: "#e8eef8", screen2: "#d4dcec", screen3: "#b8c4dc", screenInk: "#18203a", screenDim: "#4c5878" };
const HD = { screen: "#eef2f5", screen2: "#dde3e8", screen3: "#c4ccd4", screenInk: "#1c2530", screenDim: "#55606c" };

export const GAME_THEMES: Record<string, Theme> = {
  rb: { device: "#c8102e", deviceDark: "#7d0a1d", deviceLight: "#ee4a5f", ...DMG },
  yellow: { device: "#f2c200", deviceDark: "#a47f00", deviceLight: "#ffe45c", ...DMG },
  gold: { device: "#c9a227", deviceDark: "#7d6413", deviceLight: "#ead27a", ...GBC },
  silver: { device: "#a9adb8", deviceDark: "#6b6f7a", deviceLight: "#d7dae2", ...GBC },
  crystal: { device: "#3f8fc4", deviceDark: "#1f5c85", deviceLight: "#86c3ea", ...GBC },
  rs: { device: "#b3262e", deviceDark: "#701419", deviceLight: "#e0646a", ...GBA },
  emerald: { device: "#1f8a5b", deviceDark: "#0f5537", deviceLight: "#5cc493", ...GBA },
  frlg: { device: "#e2552b", deviceDark: "#8f3013", deviceLight: "#f6936f", ...GBA },
  dp: { device: "#4a6fa5", deviceDark: "#2b4670", deviceLight: "#8eaad6", ...DS },
  pt: { device: "#5d6070", deviceDark: "#34363f", deviceLight: "#9a9db0", ...DS },
  hgss: { device: "#b8892a", deviceDark: "#6f5014", deviceLight: "#e3bd6a", ...DS },
  bw: { device: "#2c2c30", deviceDark: "#111114", deviceLight: "#5c5c64", ...DS },
  xy: { device: "#2f6fd0", deviceDark: "#1b4384", deviceLight: "#77a6ec", ...HD },
  oras: { device: "#a3282f", deviceDark: "#5f1419", deviceLight: "#d96a70", ...HD },
  usum: { device: "#e8701a", deviceDark: "#934208", deviceLight: "#f7a866", ...HD },
  lgpe: { device: "#f2b705", deviceDark: "#9c7400", deviceLight: "#ffd95a", ...HD },
  swsh: { device: "#2a78d6", deviceDark: "#14467f", deviceLight: "#e0315b", ...HD },
  bdsp: { device: "#6f78e0", deviceDark: "#3e4594", deviceLight: "#e48bb8", ...HD },
  pla: { device: "#8a6d3b", deviceDark: "#54401e", deviceLight: "#c6a774", ...HD },
  sv: { device: "#d2453f", deviceDark: "#7a3fb0", deviceLight: "#f08a7a", ...HD },
  za: { device: "#2d9c7a", deviceDark: "#155e49", deviceLight: "#7fd4b8", ...HD },
  champions: { device: "#30343c", deviceDark: "#111318", deviceLight: "#e2b53e", ...HD },
};

/** CSS variable overrides for the device root, or undefined for the default red Pokédex. */
export function themeStyle(gameId: string | null): CSSProperties | undefined {
  const t = gameId ? GAME_THEMES[gameId] : undefined;
  if (!t) return undefined;
  const vars: Record<string, string> = {
    "--dex-red": t.device,
    "--dex-red-dark": t.deviceDark,
    "--dex-red-light": t.deviceLight,
  };
  if (t.screen) vars["--screen"] = t.screen;
  if (t.screen2) vars["--screen-2"] = t.screen2;
  if (t.screen3) vars["--screen-3"] = t.screen3;
  if (t.screenInk) vars["--screen-ink"] = t.screenInk;
  if (t.screenDim) vars["--screen-dim"] = t.screenDim;
  return vars as CSSProperties;
}

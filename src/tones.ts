import type { ScentuaryLabels, ScentuaryTheme, Tone } from "./types";

/** A distinct hue per note, cycled in sequence — varied enough that no two
 *  neighbours feel alike, all kept deep and muted so the recolour reads as
 *  atmosphere, never as a theme switch. */
export const DEFAULT_TONES: Tone[] = [
  { art: "#e6c982", glow: "#bea64f", tint: "#1c1708" }, // gold
  { art: "#e79bb1", glow: "#bd6e8b", tint: "#1d0f16" }, // rose
  { art: "#9fc79a", glow: "#6fa86b", tint: "#0f1810" }, // green
  { art: "#e3a468", glow: "#c0723c", tint: "#1d1408" }, // amber
  { art: "#b0a4ec", glow: "#8a7ed6", tint: "#13111d" }, // violet
  { art: "#69c2c2", glow: "#3fa8a8", tint: "#08191a" }, // teal
  { art: "#e08a76", glow: "#c46048", tint: "#1d0f0b" }, // terracotta
  { art: "#d8be72", glow: "#bda24f", tint: "#191507" }, // saffron
  { art: "#c79ad6", glow: "#a86fc0", tint: "#160f1b" }, // plum
  { art: "#aec285", glow: "#85a04f", tint: "#131a0c" }, // sage
  { art: "#e0aa63", glow: "#c4853a", tint: "#1c1507" }, // bronze
  { art: "#db7f9b", glow: "#c0566f", tint: "#1c0e14" }, // wine
];

export const DEFAULT_THEME: ScentuaryTheme = {
  accent: "#c5a572",
  accentBright: "#e0c489",
  accentSoft: "#a88955",
  background: "#0b0a08",
  text: "#e8dec5",
  textSoft: "rgba(232, 222, 197, 0.6)",
  tones: DEFAULT_TONES,
  fontDisplay: 'Georgia, "Times New Roman", serif',
  fontBody: 'system-ui, -apple-system, "Segoe UI", sans-serif',
};

export const DEFAULT_LABELS: ScentuaryLabels = {
  eyebrow: "Scent Journey",
  title: "How it unfolds.",
  scrollCue: "Scroll to descend",
  tiers: {
    top: {
      roman: "I",
      label: "Top",
      caption: "First breath. The opening seconds.",
    },
    heart: {
      roman: "II",
      label: "Heart",
      caption: "The soul of the scent — what stays.",
    },
    base: {
      roman: "III",
      label: "Base",
      caption: "What lives in the skin, long after.",
    },
  },
  familyLabel: {
    citrus: "Citrus",
    floral: "Floral",
    spice: "Aromatic",
    wood: "Wood",
    resin: "Resin",
    default: "Essence",
  },
};

/** Merge user theme/labels onto the defaults (shallow, with nested tiers). */
export function mergeTheme(t?: Partial<ScentuaryTheme>): ScentuaryTheme {
  return { ...DEFAULT_THEME, ...t };
}

export function mergeLabels(l?: Partial<ScentuaryLabels>): ScentuaryLabels {
  return {
    ...DEFAULT_LABELS,
    ...l,
    tiers: { ...DEFAULT_LABELS.tiers, ...l?.tiers },
    familyLabel: { ...DEFAULT_LABELS.familyLabel, ...l?.familyLabel },
  };
}

import type { CSSProperties, ReactNode } from "react";

/** One note's colour world: glyph + name (`art`), the radial bloom (`glow`),
 *  and the wash over the whole field (`tint`). */
export type Tone = { art: string; glow: string; tint: string };

export type ScentNote = {
  name: string;
  /** Secondary line under the name (e.g. a translation or latin name). */
  subtitle?: string;
  /** Family key — selects the eyebrow word and the default glyph. */
  family?: string;
  /** Override the auto-assigned tone for this note. */
  tone?: Partial<Tone>;
};

export type ScentNotes = {
  top: ScentNote[];
  heart: ScentNote[];
  base: ScentNote[];
};

export type ScentTier = {
  /** Numeral shown in the chapter medallion (defaults I / II / III). */
  roman?: string;
  label: string;
  subtitle?: string;
  caption?: string;
  captionSub?: string;
};

export type ScentuaryTheme = {
  accent: string;
  accentBright: string;
  accentSoft: string;
  background: string;
  text: string;
  textSoft: string;
  /** Cycled, one per note. Falls back to the built-in 12-tone palette. */
  tones: Tone[];
  fontDisplay: string;
  fontBody: string;
};

export type ScentuaryLabels = {
  eyebrow: string;
  title: ReactNode;
  scrollCue: string;
  closing?: ReactNode;
  tiers: { top: ScentTier; heart: ScentTier; base: ScentTier };
  /** Eyebrow word per family key (e.g. `{ floral: "Floral" }`). */
  familyLabel: Record<string, string>;
};

export type NoteArtContext = { color: string; size: number; reduce: boolean };

export type ScentuaryProps = {
  notes: ScentNotes;
  theme?: Partial<ScentuaryTheme>;
  labels?: Partial<ScentuaryLabels>;
  /** Bring your own glyph per note. Omit to use the built-in default art. */
  renderNoteArt?: (note: ScentNote, ctx: NoteArtContext) => ReactNode;
  className?: string;
  style?: CSSProperties;
};

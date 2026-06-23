import type { ReactElement } from "react";
import type { NoteArtContext, ScentNote } from "./types";

/**
 * Built-in line-art glyphs, one per scent family, drawn on a 100×100 viewBox
 * with `stroke=currentColor`. Elegant and confident — pass `renderNoteArt` to
 * bring a richer, brand-specific set.
 */
export function DefaultNoteArt(note: ScentNote, ctx: NoteArtContext): ReactElement {
  const { color, size } = ctx;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      style={{ color, maxWidth: "58vw", height: "auto" }}
      aria-hidden
    >
      <g
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        {glyph(note.family)}
      </g>
    </svg>
  );
}

function petals(count: number, rx: number, ry: number, dist: number, cy = 50): ReactElement[] {
  return Array.from({ length: count }).map((_, i) => {
    const deg = (360 / count) * i;
    const a = (deg * Math.PI) / 180;
    const x = (50 + Math.cos(a - Math.PI / 2) * dist).toFixed(2);
    const y = (cy + Math.sin(a - Math.PI / 2) * dist).toFixed(2);
    return <ellipse key={i} cx={x} cy={y} rx={rx} ry={ry} transform={`rotate(${deg} ${x} ${y})`} />;
  });
}

function glyph(family?: string): ReactElement {
  switch (family) {
    // Citrus — a clean cross-section: rind, pith ring, segments, a single leaf.
    case "citrus":
      return (
        <>
          <circle cx="50" cy="54" r="30" />
          <circle cx="50" cy="54" r="23" opacity="0.45" />
          <g opacity="0.55">
            {Array.from({ length: 8 }).map((_, i) => {
              const a = (i * 45 * Math.PI) / 180;
              return (
                <line
                  key={i}
                  x1="50"
                  y1="54"
                  x2={(50 + Math.cos(a) * 23).toFixed(2)}
                  y2={(54 + Math.sin(a) * 23).toFixed(2)}
                />
              );
            })}
          </g>
          <path d="M50 24 C43 12 55 5 66 8 C63 19 56 24 50 24 Z" />
        </>
      );
    // Floral — a six-petal bloom around a small calyx.
    case "floral":
      return (
        <>
          {petals(6, 13, 7.5, 21)}
          <circle cx="50" cy="50" r="6.5" />
        </>
      );
    // Wood — concentric growth rings of a cut log.
    case "wood":
      return (
        <>
          <circle cx="50" cy="50" r="31" />
          <circle cx="50" cy="50" r="23" opacity="0.7" />
          <circle cx="50" cy="50" r="15" opacity="0.5" />
          <circle cx="50" cy="50" r="7" opacity="0.4" />
          <circle cx="50" cy="50" r="1.6" />
        </>
      );
    // Spice — a star-anise cluster: eight pods around a seed.
    case "spice":
      return (
        <>
          {petals(8, 5.5, 12, 19)}
          <circle cx="50" cy="50" r="6" />
        </>
      );
    // Resin / musk / amber — a faceted drop with an inner glint.
    case "resin":
    case "musk":
    case "amber":
      return (
        <>
          <path d="M50 14 C32 40 26 58 34 72 C42 86 58 86 66 72 C74 58 68 40 50 14 Z" />
          <path d="M41 58 C43 68 49 73 57 70" opacity="0.55" />
          <ellipse cx="43" cy="45" rx="3.5" ry="7" transform="rotate(-28 43 45)" opacity="0.45" />
        </>
      );
    // Herb / aromatic — a sprig with paired leaves.
    case "herb":
    case "aromatic":
    case "green":
      return (
        <>
          <path d="M50 86 C50 64 50 42 50 16" />
          {[68, 56, 44, 32].map((y, i) => {
            const len = 14 - i * 1.2;
            return (
              <g key={y} opacity={0.85 - i * 0.08}>
                <path d={`M50 ${y} C${50 - len} ${y - 2} ${50 - len - 4} ${y - 9} ${50 - len + 1} ${y - 13}`} />
                <path d={`M50 ${y - 4} C${50 + len} ${y - 6} ${50 + len + 4} ${y - 13} ${50 + len - 1} ${y - 17}`} />
              </g>
            );
          })}
        </>
      );
    // Default — a four-point sparkle, the abstract "essence".
    default:
      return (
        <>
          <path d="M50 13 C53 41 59 47 87 50 C59 53 53 59 50 87 C47 59 41 53 13 50 C41 47 47 41 50 13 Z" />
          <path d="M50 30 L50 70 M30 50 L70 50" opacity="0.3" />
        </>
      );
  }
}

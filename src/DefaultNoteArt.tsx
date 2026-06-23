import type { ReactElement } from "react";
import type { NoteArtContext, ScentNote } from "./types";

/**
 * Built-in line-art glyphs, one per scent family, drawn on a 100×100 viewBox
 * with `stroke=currentColor`. Deliberately simple and elegant — pass
 * `renderNoteArt` to bring a richer, brand-specific set.
 */
export function DefaultNoteArt(note: ScentNote, ctx: NoteArtContext): ReactElement {
  const { color, size } = ctx;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      style={{ color }}
      aria-hidden
    >
      <g
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        {glyph(note.family)}
      </g>
    </svg>
  );
}

function glyph(family?: string): ReactElement {
  switch (family) {
    case "citrus":
      return (
        <>
          <circle cx="50" cy="56" r="26" />
          <path d="M50 30 V56 M28 56 H72 M35 42 L65 70 M65 42 L35 70" opacity="0.55" />
          <path d="M50 30 C48 22, 55 18, 61 15 C62 23, 56 29, 50 30 Z" />
        </>
      );
    case "floral":
      return (
        <>
          <circle cx="50" cy="50" r="6" />
          {Array.from({ length: 6 }).map((_, i) => {
            const a = (i * 60 * Math.PI) / 180;
            const x = (50 + Math.cos(a) * 20).toFixed(2);
            const y = (50 + Math.sin(a) * 20).toFixed(2);
            return (
              <ellipse
                key={i}
                cx={x}
                cy={y}
                rx="12"
                ry="7"
                transform={`rotate(${i * 60 + 90} ${x} ${y})`}
              />
            );
          })}
        </>
      );
    case "wood":
      return (
        <>
          <ellipse cx="50" cy="50" rx="33" ry="16" />
          <ellipse cx="50" cy="50" rx="23" ry="11" opacity="0.65" />
          <ellipse cx="50" cy="50" rx="13" ry="6" opacity="0.45" />
        </>
      );
    case "spice":
      return (
        <>
          <circle cx="38" cy="42" r="10" />
          <circle cx="60" cy="38" r="10" />
          <circle cx="50" cy="60" r="10" />
          <path d="M38 42 L36 37 M60 38 L62 32 M50 60 L52 54" opacity="0.6" />
        </>
      );
    case "resin":
      return (
        <>
          <path d="M50 14 C30 38, 24 58, 32 72 C40 86, 60 86, 68 72 C76 58, 70 38, 50 14 Z" />
          <path d="M40 60 C40 70, 46 76, 54 74" opacity="0.55" />
        </>
      );
    default:
      return <path d="M50 18 L54 46 L82 50 L54 54 L50 82 L46 54 L18 50 L46 46 Z" />;
  }
}

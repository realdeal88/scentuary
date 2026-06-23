# Scentuary

**An immersive, scroll-driven scent journey for perfume pages.**

A winding path draws itself as you scroll, and the whole field recolours to each
note's own tone — top, heart, base — turning a flat list of ingredients into a
descent through the fragrance. Built for React, themeable, fully localisable, and
free of any CSS framework.

```bash
npm install scentuary gsap motion
```

> `react`, `react-dom`, `gsap` (≥ 3.13 — DrawSVG is free since then) and `motion`
> are peer dependencies.

## Usage

```tsx
import { Scentuary } from "scentuary";

export default function PerfumePage() {
  return (
    <Scentuary
      notes={{
        top: [{ name: "Bergamot", subtitle: "Calabria", family: "citrus" }],
        heart: [{ name: "Jasmine", subtitle: "Grasse", family: "floral" }],
        base: [{ name: "Sandalwood", subtitle: "Mysore", family: "wood" }],
      }}
      theme={{ accent: "#c5a572", accentBright: "#e0c489", background: "#0b0a08" }}
      labels={{ eyebrow: "Scent Journey", title: "How it unfolds." }}
    />
  );
}
```

That's it — the component owns the full-height scroll experience.

## How it works

- **Measured path.** The serpentine is generated in real pixel space from the
  actual scene centres (via a `ResizeObserver`), so GSAP's DrawSVG can measure
  and draw it on scroll at any viewport size.
- **Recolouring field.** A single sticky layer sits behind the content and eases
  to each note's `tint` + `glow` as that note reaches centre stage — no two
  neighbours alike.
- **Reduced motion.** Honours `prefers-reduced-motion`: the path is shown fully
  drawn and the scenes settle without animation.

## Props

| Prop | Type | Notes |
| --- | --- | --- |
| `notes` | `{ top; heart; base }` of `ScentNote` | `{ name, subtitle?, family?, tone? }` |
| `theme` | `Partial<ScentuaryTheme>` | colours, fonts, custom `tones[]` palette |
| `labels` | `Partial<ScentuaryLabels>` | all copy — eyebrow, title, tiers, family words (i18n) |
| `renderNoteArt` | `(note, { color, size, reduce }) => ReactNode` | bring your own glyphs; a default set ships |
| `className` / `style` | — | applied to the root `<section>` |

### Theming

Every colour and font is a prop. `tones` is a cycled palette — one hue per note;
override per-note with `note.tone`. Set `fontDisplay` / `fontBody` to your own
typefaces.

### Localisation

`labels` carries every string the component renders (tier names, the eyebrow,
the scroll cue, the per-family eyebrow words), so it works in any language —
including RTL, by passing pre-shaped strings and an RTL font.

### Custom note art

```tsx
<Scentuary
  notes={notes}
  renderNoteArt={(note, { color, size }) => (
    <MyGlyph name={note.name} color={color} size={size} />
  )}
/>
```

## License

MIT © Sajad Abdolvandi

# Scentuary

**A pinned, scroll-driven descent through a fragrance's notes.**

The stage pins — the page holds still — while each note rises into the frame,
blooms in its own colour, and dissolves into the next. The whole field recolours
to each note's tone (top, heart, base), a thread of light draws downward as you
descend, and a bead travels it. Not a list that scrolls past: a place you sink
through. Built for React, themeable, fully localisable, and free of any CSS
framework.

```bash
npm install scentuary gsap motion
```

> `react`, `react-dom`, `gsap` (≥ 3.12, for `ScrollTrigger`) and `motion` are
> peer dependencies. No paid GSAP plugins required.

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

That's it — the component owns the full pinned scroll experience.

## How it works

- **Pinned stage.** The section pins for the length of the descent; the page
  holds still while the scroll scrubs a single timeline. Each note is a frame
  that rises in, dwells crisp, then dissolves into the next.
- **Recolouring field.** A layer behind the content eases to each note's `tint`
  + `glow` as that note takes the frame — no two neighbours alike.
- **Drawing thread.** A line of light fills downward with your progress and a
  bead rides it, picking up each note's colour as you pass.
- **Reduced motion.** Honours `prefers-reduced-motion`: the descent renders as a
  calm, fully-visible vertical reading with no pin and no animation.

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
the scroll cue, the per-family eyebrow words), and the text fields accept any
`ReactNode` — so it works in any language, including bilingual or RTL layouts
(pass a styled element with the right `dir` and font).

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

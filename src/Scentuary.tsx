import {
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import type {
  ScentNote,
  ScentTier,
  ScentuaryProps,
  ScentuaryTheme,
  Tone,
} from "./types";
import { mergeLabels, mergeTheme } from "./tones";
import { DefaultNoteArt } from "./DefaultNoteArt";
import { serpentine } from "./serpentine";
import { lerpColor } from "./color";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, DrawSVGPlugin);
  // "load" fires only once every image/font on the page has finished — on a
  // media-heavy product page that can be many seconds after the user has
  // already scrolled deep into this section. GSAP's default auto-refresh-on-
  // "load" then recomputes trigger start/end positions mid-scroll, which
  // used to visibly un-pin and re-land an older pinned version of this
  // component on an earlier note before continuing. Nothing here pins
  // anymore, but a late refresh could still jump the road-draw/field-tone
  // progress against a moving target, so the same guard stays: keep the
  // DOMContentLoaded/resize/visibilitychange refreshes, drop the late "load".
  ScrollTrigger.config({
    ignoreMobileResize: true,
    autoRefreshEvents: "DOMContentLoaded,resize,visibilitychange",
  });
}

const EASE_OUT_EXPO: [number, number, number, number] = [0.22, 1, 0.36, 1];
const ROAD_WIDTH = "clamp(2.75rem, 6vw, 5.5rem)";

type Labels = ReturnType<typeof mergeLabels>;
type ArtFn = (
  note: ScentNote,
  ctx: { color: string; size: number; reduce: boolean },
) => ReactNode;
type Side = "left" | "right";

const TIER_ORDER = ["top", "heart", "base"] as const;

/** One stop along the descending road — either a chapter marker straddling
 *  the path, or a note station set off to one side of it. */
type Stop =
  | { kind: "tier"; key: (typeof TIER_ORDER)[number]; tier: ScentTier }
  | {
      kind: "note";
      note: ScentNote;
      tone: Tone;
      familyWord: string;
      side: Side;
    };

/** The field's atmosphere at one point in the descent, plus how much of the
 *  scroll distance that point should claim — used to ease the background
 *  continuously from tier to tier rather than cutting hard at each chapter. */
type Band = { tint: string; glow: string; weight: number };

/** True on a viewport wide enough for the fuller note-glyph scale. Reads
 *  live so it reacts to resizes; defaults to the mobile size so SSR and
 *  first paint never render an oversized glyph that then shrinks. */
function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(min-width: 768px)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(min-width: 768px)").matches,
    () => false,
  );
}

/** Mirrors the OS `prefers-reduced-motion` preference. Reads matchMedia
 *  directly rather than Motion's own `useReducedMotion` (which returns
 *  `null` during SSR, so the server and the client's first paint can
 *  disagree on which branch to render — a hydration mismatch). Defaulting
 *  the server/first-paint snapshot to `false` and syncing right after,
 *  same idiom as `useIsDesktop` above, keeps the two in lockstep. */
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

/**
 * Scentuary — a scroll-drawn descent through a fragrance's notes.
 *
 * A central road draws itself downward as the page scrolls — you travel
 * down it, not sideways past it. Each tier opens with a plain chapter
 * marker straddling the road; each note is a station set to one side of it,
 * alternating left and right, rising into place as it's reached. The field
 * behind everything eases continuously from one tier's tone to the next.
 * Themeable, fully localisable, framework-CSS-free, and dependent only on
 * `gsap` + `motion`.
 */
export function Scentuary({
  notes,
  theme: themeProp,
  labels: labelsProp,
  renderNoteArt,
  className,
  style,
}: ScentuaryProps) {
  const theme = mergeTheme(themeProp);
  const labels = mergeLabels(labelsProp);
  const reduce = usePrefersReducedMotion();
  const isDesktop = useIsDesktop();
  const root = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const closing = useRef<HTMLDivElement>(null);
  const art = renderNoteArt ?? DefaultNoteArt;
  const gradientId = useId();
  const noteArtSize = isDesktop ? 136 : 100;

  // Build the descent as an ordered list of stops (tier markers + note
  // stations, alternating sides), and in the same pass the tone "bands" the
  // field eases across. A band's weight is roughly its stop's share of the
  // scroll distance — a cheap proxy for real layout height that needs no
  // DOM measurement, since row height already tracks content size via
  // ordinary flow.
  const stops: Stop[] = [];
  const bands: Band[] = [];
  let toneIdx = 0;
  let side: Side = "left";
  for (const key of TIER_ORDER) {
    const tierNotes = notes[key] ?? [];
    if (tierNotes.length === 0) continue;
    const previewBase = theme.tones[toneIdx % theme.tones.length];
    const previewTone = { ...previewBase, ...tierNotes[0]?.tone };
    stops.push({ kind: "tier", key, tier: labels.tiers[key] });
    bands.push({
      tint: previewTone.tint,
      glow: previewTone.glow,
      weight: 1 + tierNotes.length,
    });
    for (const note of tierNotes) {
      const base = theme.tones[toneIdx % theme.tones.length];
      const tone = { ...base, ...note.tone };
      stops.push({
        kind: "note",
        note,
        tone,
        familyWord:
          labels.familyLabel[note.family ?? "default"] ??
          labels.familyLabel.default,
        side,
      });
      side = side === "left" ? "right" : "left";
      toneIdx++;
    }
  }
  // A synthetic trailing band settles the field back to the neutral theme
  // colour through the closing epilogue, mirroring how it opens.
  bands.push({ tint: theme.background, glow: theme.accent, weight: 1.4 });

  const notesSignature = `${notes.top.length}-${notes.heart.length}-${notes.base.length}`;

  // The road's geometry — a handful of gentle bends regardless of how many
  // notes there are (one per note read as a jagged zigzag; a few wide bends
  // read as a road). A tall, narrow viewBox with `preserveAspectRatio="none"`
  // stretches to the track's real height without visible distortion, since
  // the amplitude is a small fraction of the road column's own width.
  const ROAD_VB_H = 1000;
  const BEND_COUNT = 6;
  const roadPathD = serpentine(
    Array.from({ length: BEND_COUNT + 1 }, (_, i) => ({
      x: i % 2 === 0 ? 46 : 54,
      y: (i / BEND_COUNT) * ROAD_VB_H,
    })),
  );

  // ── Scrubbed to scroll: draw the road, ride a bead along it, and ease
  //    the field's tint/glow continuously across the tier bands. Nothing
  //    pins — the page scrolls exactly as far as its content is tall, so
  //    there's no pin-spacer to desync and nothing to jump mid-scroll.
  useEffect(() => {
    const el = root.current;
    const trackEl = track.current;
    if (reduce || !el || !trackEl) return;
    const ctx = gsap.context(() => {
      const fill = el.querySelector<SVGPathElement>("[data-spine-fill]");
      const bead = el.querySelector<SVGCircleElement>("[data-bead]");
      const tint = el.querySelector<HTMLElement>("[data-field-tint]");
      const glow = el.querySelector<HTMLElement>("[data-field-glow]");
      if (!fill) return;

      const pathLength = fill.getTotalLength();
      gsap.set(fill, { drawSVG: "0%" });
      if (bead) {
        const start = fill.getPointAtLength(0);
        gsap.set(bead, { attr: { cx: start.x, cy: start.y } });
      }

      const totalWeight = bands.reduce((sum, b) => sum + b.weight, 0);
      let acc = 0;
      const centers = bands.map((b) => {
        const span = { start: acc, end: acc + b.weight };
        acc = span.end;
        return (span.start + span.end) / 2 / totalWeight;
      });
      const toneAt = (p: number): { tint: string; glow: string } => {
        if (p <= centers[0]) return bands[0];
        for (let i = 0; i < centers.length - 1; i++) {
          if (p >= centers[i] && p <= centers[i + 1]) {
            const t = (p - centers[i]) / (centers[i + 1] - centers[i]);
            return {
              tint: lerpColor(bands[i].tint, bands[i + 1].tint, t),
              glow: lerpColor(bands[i].glow, bands[i + 1].glow, t),
            };
          }
        }
        return bands[bands.length - 1];
      };

      ScrollTrigger.create({
        trigger: trackEl,
        start: "top 75%",
        endTrigger: closing.current ?? trackEl,
        end: closing.current ? "bottom 60%" : "bottom 25%",
        scrub: 0.6,
        invalidateOnRefresh: true,
        onUpdate: (st) => {
          gsap.set(fill, { drawSVG: st.progress * 100 + "%" });
          if (bead) {
            const pt = fill.getPointAtLength(st.progress * pathLength);
            gsap.set(bead, { attr: { cx: pt.x, cy: pt.y } });
          }
          const tone = toneAt(st.progress);
          if (tint) gsap.set(tint, { backgroundColor: tone.tint });
          if (glow) gsap.set(glow, { color: tone.glow });
        },
      });
    }, root);
    return () => ctx.revert();
    // Depend on primitive values that actually drive this effect's setup,
    // not on `bands`/`notes`/`theme` object identity — those are rebuilt
    // fresh every render (locale text changes included) but only a slug
    // swap (full remount) or a reduced-motion toggle should tear this down.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce, theme.background, theme.accent, notesSignature]);

  return (
    <section
      ref={root}
      className={className}
      style={{
        position: "relative",
        width: "100%",
        color: theme.text,
        fontFamily: theme.fontBody,
        ...style,
      }}
    >
      {/* Recolouring field — behind everything, eases tier to tier */}
      <div aria-hidden style={{ position: "absolute", inset: 0, zIndex: 0 }}>
        <div
          data-field-tint
          style={{ position: "absolute", inset: 0, backgroundColor: theme.background }}
        />
        <div
          data-field-glow
          style={{
            position: "absolute",
            inset: 0,
            background: "radial-gradient(circle at 50% 30%, currentColor 0%, transparent 68%)",
            color: theme.accent,
            opacity: 0.35,
            mixBlendMode: "screen",
          }}
        />
      </div>

      <div style={{ position: "relative", zIndex: 1 }}>
        <IntroBlock theme={theme} labels={labels} reduce={reduce} />

        <div
          ref={track}
          style={{
            position: "relative",
            maxWidth: 1160,
            margin: "0 auto",
            paddingInline: "clamp(1.25rem, 5vw, 3rem)",
          }}
        >
          {/* The road — spans the full rendered height of the stops below,
              a bead riding it, drawing in as the section scrolls by. */}
          <div
            aria-hidden
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              top: 0,
              bottom: 0,
              width: ROAD_WIDTH,
              zIndex: 0,
              pointerEvents: "none",
            }}
          >
            <svg
              viewBox={`0 0 100 ${ROAD_VB_H}`}
              preserveAspectRatio="none"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.accentBright} />
                  <stop offset="100%" stopColor={theme.accent} />
                </linearGradient>
              </defs>
              <path
                d={roadPathD}
                stroke={theme.accent}
                strokeOpacity={0.15}
                strokeWidth={10}
                strokeLinecap="round"
                fill="none"
              />
              <path
                data-spine-fill
                d={roadPathD}
                stroke={`url(#${gradientId})`}
                strokeWidth={10}
                strokeLinecap="round"
                fill="none"
                style={{ filter: `drop-shadow(0 0 6px ${theme.accent})` }}
              />
              {!reduce ? (
                <circle
                  data-bead
                  // Real starting coordinates (the road's own first point),
                  // not left unset. GSAP's `attr:{cx,cy}` sets below are the
                  // only thing that ever moves this, but `usePrefersReducedMotion`
                  // deliberately renders as if motion were enabled for one
                  // tick before syncing to the real OS preference (see that
                  // hook's comment) — if `reduce` flips true right after, the
                  // GSAP context this circle belongs to reverts on cleanup,
                  // restoring whatever cx/cy were before it ran. Leaving them
                  // unset meant reverting to "", which browsers reject as an
                  // invalid SVG length and log a console error for. A real
                  // starting value keeps that revert valid.
                  cx={46}
                  cy={0}
                  r={9}
                  fill={theme.accentBright}
                  style={{ filter: `drop-shadow(0 0 8px ${theme.accent})` }}
                />
              ) : null}
            </svg>
          </div>

          <div
            style={{
              position: "relative",
              zIndex: 1,
              display: "grid",
              gridTemplateColumns: `1fr ${ROAD_WIDTH} 1fr`,
              columnGap: "clamp(1rem, 3vw, 2.5rem)",
            }}
          >
            {stops.map((stop, i) =>
              stop.kind === "tier" ? (
                <div
                  key={i}
                  data-tier-row
                  style={{
                    gridColumn: "1 / -1",
                    // Grid auto-placement packs items sparsely by default: an
                    // item that only constrains its column (not its row) is
                    // dropped into the EARLIEST row with that column free —
                    // so two alternating-side notes would land in the same
                    // row instead of stacking. Pin every stop to its own row
                    // by index so the descent always reads top to bottom.
                    gridRow: i + 1,
                    display: "flex",
                    justifyContent: "center",
                    paddingBlock: "clamp(2.5rem, 6vh, 4rem)",
                  }}
                >
                  <TierStop tier={stop.tier} theme={theme} reduce={reduce} />
                </div>
              ) : (
                <div
                  key={i}
                  style={{
                    gridColumn: stop.side === "left" ? 1 : 3,
                    gridRow: i + 1,
                    justifySelf: stop.side === "left" ? "end" : "start",
                    paddingBlock: "clamp(3rem, 9vh, 6rem)",
                  }}
                >
                  <NoteStop
                    note={stop.note}
                    tone={stop.tone}
                    familyWord={stop.familyWord}
                    side={stop.side}
                    theme={theme}
                    art={art}
                    reduce={reduce}
                    size={noteArtSize}
                  />
                </div>
              ),
            )}
          </div>
        </div>

        {labels.closing ? (
          <div ref={closing}>
            <ClosingBlock theme={theme} labels={labels} reduce={reduce} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function Eyebrow({ children, color }: { children: ReactNode; color: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "1rem" }}>
      <span style={{ height: 1, width: 36, background: `linear-gradient(to right, transparent, ${color})` }} />
      <p
        style={{
          fontFamily: "inherit",
          fontSize: "0.62rem",
          textTransform: "uppercase",
          letterSpacing: "0.55em",
          color,
        }}
      >
        {children}
      </p>
      <span style={{ height: 1, width: 36, background: `linear-gradient(to left, transparent, ${color})` }} />
    </div>
  );
}

function IntroBlock({ theme, labels, reduce }: { theme: ScentuaryTheme; labels: Labels; reduce: boolean }) {
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 0.9, ease: EASE_OUT_EXPO }}
      style={{
        maxWidth: 760,
        margin: "0 auto",
        paddingInline: "clamp(2rem, 8vw, 6rem)",
        paddingBlock: "clamp(4rem, 14vh, 8rem)",
        textAlign: "center",
        fontFamily: theme.fontDisplay,
      }}
    >
      <Eyebrow color={`${theme.accent}b3`}>{labels.eyebrow}</Eyebrow>
      <h2
        style={{
          fontStyle: "italic",
          marginTop: "2rem",
          fontSize: "clamp(2.75rem, 7vw, 5.25rem)",
          lineHeight: 1.04,
          color: theme.text,
          textWrap: "balance",
        }}
      >
        {labels.title}
      </h2>
      <p
        style={{
          marginTop: "3rem",
          fontSize: "0.6rem",
          textTransform: "uppercase",
          letterSpacing: "0.5em",
          color: theme.textSoft,
        }}
      >
        {labels.scrollCue}
      </p>
    </motion.div>
  );
}

/** A chapter marker straddling the road — plain type, no numeral, no ring. */
function TierStop({ tier, theme, reduce }: { tier: ScentTier; theme: ScentuaryTheme; reduce: boolean }) {
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 16 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-20% 0px" }}
      transition={{ duration: 0.7, ease: EASE_OUT_EXPO }}
      style={{
        position: "relative",
        zIndex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        maxWidth: 360,
        fontFamily: theme.fontDisplay,
      }}
    >
      <p
        style={{
          fontSize: "0.68rem",
          textTransform: "uppercase",
          letterSpacing: "0.65em",
          color: theme.accentBright,
        }}
      >
        {tier.label}
      </p>
      {tier.subtitle ? (
        <p style={{ marginTop: "0.65rem", fontStyle: "italic", fontSize: "clamp(1.4rem, 3vw, 1.9rem)", color: theme.accentSoft }}>
          {tier.subtitle}
        </p>
      ) : null}
      {tier.caption ? (
        <div
          style={{
            marginTop: "0.9rem",
            maxWidth: "22rem",
            fontStyle: "italic",
            fontSize: "0.85rem",
            lineHeight: 1.65,
            color: theme.textSoft,
            textWrap: "balance",
          }}
        >
          {tier.caption}
        </div>
      ) : null}
      <span
        aria-hidden
        style={{ marginTop: "1.15rem", height: 1, width: 40, background: `linear-gradient(to right, transparent, ${theme.accent}, transparent)` }}
      />
    </motion.div>
  );
}

/** A note station set to one side of the road — rises into place as it's
 *  reached, leaning toward the road rather than sitting dead centre. */
function NoteStop({
  note,
  tone,
  familyWord,
  side,
  theme,
  art,
  reduce,
  size,
}: {
  note: ScentNote;
  tone: Tone;
  familyWord: string;
  side: Side;
  theme: ScentuaryTheme;
  art: ArtFn;
  reduce: boolean;
  size: number;
}) {
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, x: side === "left" ? -26 : 26, y: 18 }}
      whileInView={reduce ? undefined : { opacity: 1, x: 0, y: 0 }}
      viewport={{ once: true, margin: "-15% 0px" }}
      transition={{ duration: 0.8, ease: EASE_OUT_EXPO }}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: side === "left" ? "flex-end" : "flex-start",
        textAlign: side === "left" ? "right" : "left",
        gap: "1.35rem",
        maxWidth: 360,
        fontFamily: theme.fontDisplay,
      }}
    >
      <div style={{ position: "relative", display: "grid", placeItems: "center" }}>
        <div
          aria-hidden
          style={{
            position: "absolute",
            height: "min(58vw, 300px)",
            width: "min(58vw, 300px)",
            borderRadius: "9999px",
            background: `radial-gradient(circle, ${tone.glow} 0%, transparent 68%)`,
            filter: "blur(48px)",
            opacity: 0.55,
            mixBlendMode: "screen",
          }}
        />
        <div style={{ position: "relative" }}>{art(note, { color: tone.art, size, reduce })}</div>
      </div>
      <div>
        <p
          style={{
            fontSize: "0.58rem",
            textTransform: "uppercase",
            letterSpacing: "0.5em",
            color: tone.art,
            opacity: 0.75,
          }}
        >
          {familyWord}
        </p>
        <p
          style={{
            fontStyle: "italic",
            marginTop: "0.65rem",
            fontSize: "clamp(1.6rem, 3.4vw, 2.35rem)",
            lineHeight: 1.1,
            color: theme.text,
            textWrap: "balance",
          }}
        >
          {note.name}
        </p>
        {note.subtitle ? (
          <div style={{ marginTop: "0.55rem", fontSize: "clamp(1.05rem, 2.2vw, 1.35rem)", color: tone.art }}>
            {note.subtitle}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

function ClosingBlock({ theme, labels, reduce }: { theme: ScentuaryTheme; labels: Labels; reduce: boolean }) {
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 20 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-15% 0px" }}
      transition={{ duration: 0.8, ease: EASE_OUT_EXPO }}
      style={{
        maxWidth: 720,
        margin: "0 auto",
        paddingInline: "clamp(2rem, 8vw, 6rem)",
        paddingBlock: "clamp(4rem, 14vh, 7rem)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        fontFamily: theme.fontDisplay,
      }}
    >
      <span style={{ display: "block", height: 1, width: 64, background: theme.accent }} />
      <div
        style={{
          marginTop: "2.75rem",
          fontStyle: "italic",
          fontSize: "clamp(1.5rem, 3.4vw, 2.125rem)",
          lineHeight: 1.55,
          color: theme.textSoft,
          textWrap: "balance",
        }}
      >
        {labels.closing}
      </div>
    </motion.div>
  );
}

export type { CSSProperties };

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { motion } from "motion/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
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

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
  // "load" fires only once every image/font on the page has finished — on a
  // media-heavy product page that can be seconds after the user has already
  // scrolled in, and a late auto-refresh would then recompute the trigger
  // against a moved target and jump the draw. Keep the DOM/resize refreshes,
  // drop the late "load"; a single fonts.ready refresh (below) covers reflow.
  ScrollTrigger.config({
    ignoreMobileResize: true,
    autoRefreshEvents: "DOMContentLoaded,resize,visibilitychange",
  });
}

// useLayoutEffect on the client (measure before paint, no road flash); plain
// useEffect on the server so SSR never warns. The branch is on a value that
// never changes within a session, so it's a stable hook, not a conditional one.
const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

const EASE_OUT_EXPO: [number, number, number, number] = [0.22, 1, 0.36, 1];

// Road bend anchors as a percentage of the (wide) road column's width. The
// path is generated in real pixels at measure time so the SVG's viewBox
// matches its box 1:1 — uniform scale, so the stroke never distorts and no
// vector-effect / preserveAspectRatio trickery is needed. A generous swing so
// it reads as a winding ROAD, not a rail.
const BEND_X_LEFT = 28;
const BEND_X_RIGHT = 72;
const PLACEHOLDER_H = 1000;
const BEAD_SAMPLES = 240;
/** The central lane the road owns. Notes sit in the flexible columns on either
 *  side of it, so a glyph or title can never land on top of the drawn path. */
const ROAD_LANE = "clamp(150px, 20vw, 240px)";

type Labels = ReturnType<typeof mergeLabels>;
type ArtFn = (
  note: ScentNote,
  ctx: { color: string; size: number; reduce: boolean },
) => ReactNode;
type Side = "left" | "right";

const TIER_ORDER = ["top", "heart", "base"] as const;

/** One stop along the descending road — a chapter marker straddling the path,
 *  or a note station set to one side of it. */
type Stop =
  | { kind: "tier"; key: (typeof TIER_ORDER)[number]; tier: ScentTier }
  | {
      kind: "note";
      note: ScentNote;
      tone: Tone;
      familyWord: string;
      side: Side;
    };

/** The field's atmosphere for one tier of the descent: a rich wash colour
 *  (`glow`) over a deep base (`tint`), and how much scroll distance the band
 *  claims — used to cross-fade the full-viewport field from one tier's colour
 *  world to the next. */
type Band = { tint: string; glow: string; weight: number };

/** True on a viewport wide enough for the fuller note-glyph scale. Reads live
 *  so it reacts to resizes; defaults to the mobile size so SSR and first paint
 *  never render an oversized glyph that then shrinks. */
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
 *  directly rather than Motion's `useReducedMotion` (which returns `null`
 *  during SSR, so server and first client paint can disagree — a hydration
 *  mismatch). Defaulting the server/first-paint snapshot to `false` and
 *  syncing right after keeps the two in lockstep. */
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
 * A wide road winds itself downward as the page scrolls — you travel down it,
 * not sideways past it. Each tier opens with a plain chapter marker straddling
 * the road; each note is a station set to one side, alternating left and
 * right, rising into place as it's reached. The ENTIRE field behind everything
 * washes from one tier's colour world to the next as you descend. Themeable,
 * fully localisable, framework-CSS-free, dependent only on `gsap` + `motion`.
 *
 * Performance: the scroll scrub keeps per-frame paint to the minimum that
 * still needs it — only the CORE's stroke-dashoffset (a single thin 3px
 * line). The wide halo glow is drawn once, statically, and never re-touched:
 * dash-offsetting an 11px stroke every scroll frame forces the browser to
 * repaint that whole wide raster, not composite it, and doing it twice (halo
 * + core) every frame was the dominant cause of the road's "stepping". The
 * bead's transform and the OPACITY of a small stack of pre-coloured
 * full-bleed field layers are the only other per-frame writes, both
 * compositor-only. No per-frame getPointAtLength, no background-colour or
 * gradient-colour animation, no filters on animated nodes.
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
  const roadBox = useRef<HTMLDivElement>(null);
  const closing = useRef<HTMLDivElement>(null);
  const geom = useRef<{
    pathLength: number;
    samples: { x: number; y: number }[];
  }>({ pathLength: 0, samples: [{ x: 0, y: 0 }] });
  const art = renderNoteArt ?? DefaultNoteArt;
  const gradientId = useId();
  const noteArtSize = isDesktop ? 168 : 120;

  // Build the descent as an ordered list of stops (tier markers + note
  // stations, alternating sides), and in the same pass the tone "bands" the
  // field washes across. A band's weight is roughly its share of scroll
  // distance — a cheap proxy for real height that needs no DOM measurement,
  // since flow already sizes each row to its content.
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

  const noteCount = notes.top.length + notes.heart.length + notes.base.length;
  const notesSignature = `${notes.top.length}-${notes.heart.length}-${notes.base.length}`;

  // A handful of wide bends (never one-per-note, which reads as a zigzag),
  // leaning first toward the opening note's side so road and stations agree.
  const bendCount = Math.min(8, Math.max(4, Math.round(noteCount * 0.7)));
  const placeholderD = serpentine(
    Array.from({ length: bendCount + 1 }, (_, i) => ({
      x: i % 2 === 0 ? BEND_X_LEFT : BEND_X_RIGHT,
      y: (i / bendCount) * PLACEHOLDER_H,
    })),
  );

  // ── Scrubbed to scroll: draw the road, glide the bead, cross-fade the
  //    field's colour bands. Everything here is compositor-cheap. Nothing pins.
  useIsoLayoutEffect(() => {
    const el = root.current;
    const trackEl = track.current;
    const boxEl = roadBox.current;
    if (!el || !trackEl || !boxEl) return;

    const svg = el.querySelector<SVGSVGElement>("[data-road-svg]");
    const trackPath = el.querySelector<SVGPathElement>("[data-road-track]");
    const halo = el.querySelector<SVGPathElement>("[data-spine-halo]");
    const core = el.querySelector<SVGPathElement>("[data-spine-core]");
    const bead = el.querySelector<HTMLElement>("[data-bead]");
    const fieldLayers = gsap.utils.toArray<HTMLElement>("[data-field-band]");
    if (!svg || !trackPath || !halo || !core) return;

    // Field band cross-fade windows: each band owns a centre along the scroll;
    // opacity ramps 1→0 to its neighbours, so exactly two ever blend.
    const totalWeight = bands.reduce((sum, b) => sum + b.weight, 0);
    let acc = 0;
    const centers = bands.map((b) => {
      const mid = (2 * acc + b.weight) / 2 / totalWeight;
      acc += b.weight;
      return mid;
    });
    const bandOpacity = (i: number, p: number): number => {
      if (p <= centers[0]) return i === 0 ? 1 : 0;
      if (p >= centers[centers.length - 1])
        return i === centers.length - 1 ? 1 : 0;
      for (let j = 0; j < centers.length - 1; j++) {
        if (p >= centers[j] && p <= centers[j + 1]) {
          const t = (p - centers[j]) / (centers[j + 1] - centers[j] || 1);
          if (i === j) return 1 - t;
          if (i === j + 1) return t;
          return 0;
        }
      }
      return 0;
    };

    // Regenerate the road in REAL pixels for the box's current size, so the
    // viewBox is 1:1 with the box — uniform scale, no stroke distortion, and
    // getTotalLength returns true pixel length so the dash draw is exact.
    const build = () => {
      const w = boxEl.clientWidth;
      const h = boxEl.clientHeight;
      if (w === 0 || h === 0) return;
      const pts = Array.from({ length: bendCount + 1 }, (_, i) => ({
        x: ((i % 2 === 0 ? BEND_X_LEFT : BEND_X_RIGHT) / 100) * w,
        y: (i / bendCount) * h,
      }));
      const d = serpentine(pts);
      svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
      trackPath.setAttribute("d", d);
      halo.setAttribute("d", d);
      core.setAttribute("d", d);
      const pathLength = core.getTotalLength();
      // The halo gets no dasharray — it's a plain solid stroke the browser
      // paints once and never re-rasterises. Only the thin core below draws
      // in via dashoffset (see draw()).
      core.style.strokeDasharray = String(pathLength);
      const samples = Array.from({ length: BEAD_SAMPLES + 1 }, (_, i) => {
        const pt = core.getPointAtLength((i / BEAD_SAMPLES) * pathLength);
        return { x: pt.x, y: pt.y };
      });
      geom.current = { pathLength, samples };
    };

    const draw = (p: number) => {
      const { pathLength, samples } = geom.current;
      core.style.strokeDashoffset = String(pathLength * (1 - p));
      if (bead) {
        // Slide the bead CONTINUOUSLY along the road by lerping between the two
        // nearest precomputed samples, rather than snapping to the closest one
        // (Math.round) — that quantised the position to 240 buckets and made
        // the dot visibly step forward on a slow scroll. Linear interpolation
        // between dense samples reads as a smooth glide, and still costs no
        // per-frame path geometry query.
        const f = Math.max(0, Math.min(BEAD_SAMPLES, p * BEAD_SAMPLES));
        const i0 = Math.floor(f);
        const i1 = Math.min(BEAD_SAMPLES, i0 + 1);
        const t = f - i0;
        const a = samples[i0] ?? samples[0];
        const b = samples[i1] ?? a;
        gsap.set(bead, { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
      fieldLayers.forEach((layer, i) =>
        gsap.set(layer, { opacity: bandOpacity(i, p) }),
      );
    };

    build();

    // Reduced motion: draw the full calm road once, no scrub, first tone only.
    if (reduce) {
      core.style.strokeDashoffset = "0";
      const s0 = geom.current.samples[0];
      if (bead) gsap.set(bead, { xPercent: -50, yPercent: -50, x: s0.x, y: s0.y });
      fieldLayers.forEach((layer, i) => gsap.set(layer, { opacity: i === 0 ? 1 : 0 }));
      const onResize = () => build();
      window.addEventListener("resize", onResize);
      return () => window.removeEventListener("resize", onResize);
    }

    if (bead) gsap.set(bead, { xPercent: -50, yPercent: -50 });

    const ctx = gsap.context(() => {
      draw(0);
      ScrollTrigger.create({
        trigger: trackEl,
        start: "top 80%",
        endTrigger: closing.current ?? trackEl,
        end: closing.current ? "bottom 55%" : "bottom 20%",
        scrub: 0.5,
        invalidateOnRefresh: true,
        onRefresh: (self) => {
          build();
          draw(self.progress);
        },
        onUpdate: (self) => draw(self.progress),
      });
    }, root);

    // The road column keeps growing after first paint — note images decode,
    // web fonts swap, and each station's entrance animation settles — which
    // lengthens the box. With the SVG sized to fill the box under
    // preserveAspectRatio="none", a stale viewBox height STRETCHES the drawn
    // path vertically while the absolutely-positioned bead stays put, floating
    // the dot OFF the road. A ResizeObserver re-measures on any real size
    // change so the path and the bead stay locked together. Coalesced to one
    // refresh per frame so a burst of layout writes costs a single rebuild.
    let raf = 0;
    const ro = new ResizeObserver(() => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        ScrollTrigger.refresh();
      });
    });
    ro.observe(boxEl);

    // One deferred refresh once web fonts settle — font swap can change the
    // stops' heights (and thus the road's), and this re-measures without the
    // late-"load" jump we disabled above.
    const fontSet = (document as Document & { fonts?: FontFaceSet }).fonts;
    fontSet?.ready.then(() => ScrollTrigger.refresh());

    return () => {
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
      ctx.revert();
    };
    // Depend on primitives that actually drive setup — not on bands/notes/theme
    // object identity, which are rebuilt every render (locale text included).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduce, bendCount, notesSignature, theme.background, theme.accent]);

  return (
    <section
      ref={root}
      className={className}
      style={{
        position: "relative",
        width: "100%",
        // Clip (not scroll) the full-bleed field so it can span the viewport
        // without ever introducing a horizontal scrollbar on any device.
        overflowX: "clip",
        color: theme.text,
        fontFamily: theme.fontBody,
        ...style,
      }}
    >
      {/* The recolouring FIELD — a full-viewport stack, one layer per tier
          band, cross-faded by opacity as the journey descends. Layer 0 is the
          deep base; each tier layer washes the whole screen in its colour. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: "50%",
          width: "100vw",
          transform: "translateX(-50%)",
          zIndex: 0,
          backgroundColor: theme.background,
          pointerEvents: "none",
        }}
      >
        {bands.map((band, i) => (
          <div
            key={i}
            data-field-band
            style={{
              position: "absolute",
              inset: 0,
              opacity: i === 0 ? 1 : 0,
              willChange: "opacity",
              backgroundColor: band.tint,
            }}
          >
            {/* The glow, screen-blended over the flat tint so it adds light
                and dissolves rather than compositing a visible disc — same
                recipe as the note bloom below. Transparent by 66% of its
                radius keeps the wash seamless, with no ring at its own edge. */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                backgroundImage: `radial-gradient(130% 78% at 50% 22%, ${band.glow} 0%, ${band.glow}80 20%, ${band.glow}2e 42%, transparent 66%)`,
                mixBlendMode: "screen",
              }}
            />
          </div>
        ))}
        {/* A soft top/bottom vignette keeps text legible over any wash. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(180deg, ${theme.background}cc, transparent 22%, transparent 78%, ${theme.background}cc)`,
          }}
        />
      </div>

      <div style={{ position: "relative", zIndex: 1 }}>
        <IntroBlock theme={theme} labels={labels} reduce={reduce} />

        <div
          ref={track}
          style={{
            position: "relative",
            maxWidth: 1180,
            margin: "0 auto",
            paddingInline: "clamp(1rem, 5vw, 3rem)",
          }}
        >
          {/* The winding ROAD — a wide column behind the stops, stretched to
              their full rendered height, drawing in as the section scrolls. */}
          <div
            ref={roadBox}
            aria-hidden
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              top: 0,
              bottom: 0,
              width: ROAD_LANE,
              zIndex: 0,
              pointerEvents: "none",
            }}
          >
            <svg
              data-road-svg
              viewBox={`0 0 100 ${PLACEHOLDER_H}`}
              preserveAspectRatio="none"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
            >
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={theme.accentBright} />
                  <stop offset="100%" stopColor={theme.accent} />
                </linearGradient>
              </defs>
              {/* Dim full road underneath — the path yet to be travelled. */}
              <path
                data-road-track
                d={placeholderD}
                stroke={theme.accent}
                strokeOpacity={0.16}
                strokeWidth={2}
                strokeLinecap="round"
                fill="none"
              />
              {/* Wide, soft halo — a static, fully-drawn translucent stroke.
                  Deliberately never dash-animated: repainting an 11px stroke
                  every scroll frame was the dominant cause of the road's
                  "stepping". Only the thin core below still draws in. */}
              <path
                data-spine-halo
                d={placeholderD}
                stroke={theme.accentBright}
                strokeOpacity={0.22}
                strokeWidth={11}
                strokeLinecap="round"
                fill="none"
              />
              {/* Bright core that draws in with scroll. */}
              <path
                data-spine-core
                d={placeholderD}
                stroke={`url(#${gradientId})`}
                strokeWidth={3}
                strokeLinecap="round"
                fill="none"
              />
            </svg>
            {/* Bead — an HTML dot (kept perfectly round, unlike an SVG circle
                in a stretched viewBox) gliding down the road via transform. */}
            {!reduce ? (
              <div
                data-bead
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  height: 14,
                  width: 14,
                  borderRadius: "9999px",
                  background: theme.accentBright,
                  boxShadow: `0 0 14px 3px ${theme.accent}`,
                }}
              />
            ) : null}
          </div>

          <div
            style={{
              position: "relative",
              zIndex: 1,
              display: "grid",
              // A fixed central lane holds the road; notes live in the flexible
              // columns either side of it, so a glyph or title is never placed
              // over the drawn path — only ever to its left or right.
              gridTemplateColumns: `minmax(0, 1fr) ${ROAD_LANE} minmax(0, 1fr)`,
              columnGap: 0,
            }}
          >
            {stops.map((stop, i) =>
              stop.kind === "tier" ? (
                <div
                  key={i}
                  style={{
                    gridColumn: "1 / -1",
                    // Grid auto-placement packs items sparsely: an item that
                    // only constrains its column drops into the earliest free
                    // row, so alternating-side notes could collide. Pin every
                    // stop to its own row by index — descent reads top to
                    // bottom, always.
                    gridRow: i + 1,
                    display: "flex",
                    justifyContent: "center",
                    paddingBlock: "clamp(3.5rem, 10vh, 6.5rem)",
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
                    paddingBlock: "clamp(4rem, 13vh, 8.5rem)",
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
        paddingBlock: "clamp(4.5rem, 15vh, 9rem)",
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
      viewport={{ once: false, margin: "-20% 0px" }}
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
        <p style={{ marginTop: "0.65rem", fontStyle: "italic", fontSize: "clamp(1.5rem, 3.4vw, 2.1rem)", color: theme.accentBright }}>
          {tier.subtitle}
        </p>
      ) : null}
      {tier.caption ? (
        <div
          style={{
            marginTop: "0.9rem",
            maxWidth: "22rem",
            fontStyle: "italic",
            fontSize: "0.9rem",
            lineHeight: 1.65,
            color: theme.text,
            opacity: 0.72,
            textWrap: "balance",
          }}
        >
          {tier.caption}
        </div>
      ) : null}
      <span
        aria-hidden
        style={{ marginTop: "1.15rem", height: 1, width: 46, background: `linear-gradient(to right, transparent, ${theme.accentBright}, transparent)` }}
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
      viewport={{ once: false, margin: "-12% 0px" }}
      transition={{ duration: 0.8, ease: EASE_OUT_EXPO }}
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: side === "left" ? "flex-end" : "flex-start",
        textAlign: side === "left" ? "right" : "left",
        gap: "1.35rem",
        maxWidth: 400,
        fontFamily: theme.fontDisplay,
      }}
    >
      <div style={{ position: "relative", display: "grid", placeItems: "center" }}>
        {/* A soft coloured bloom lifts the glyph off the now-colourful field
            so the mark reads clearly against any wash. The diffusion is baked
            into a multi-stop radial gradient rather than a CSS `blur()` filter,
            so it never forces a per-frame re-rasterisation as the journey
            scrolls — the glow reads identically at zero compositing cost.
            `screen` blend mode adds the light instead of compositing an
            opaque disc, and the gradient reaches full transparency by 66% of
            its radius, so it dissolves into the field with no visible edge. */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            height: "min(72vw, 400px)",
            width: "min(72vw, 400px)",
            borderRadius: "9999px",
            // A long, low-contrast falloff that reaches full transparency well
            // inside the box, with no alpha step — so the bloom melts into the
            // field with no visible circular edge. `screen` adds light rather
            // than compositing an opaque disc over the wash.
            background: `radial-gradient(circle, ${tone.glow}59 0%, ${tone.glow}33 20%, ${tone.glow}1a 38%, ${tone.glow}0d 54%, transparent 76%)`,
            mixBlendMode: "screen",
            opacity: 0.9,
          }}
        />
        <div style={{ position: "relative" }}>
          {art(note, { color: tone.art, size, reduce })}
        </div>
      </div>
      <div>
        <p
          style={{
            fontSize: "0.6rem",
            textTransform: "uppercase",
            letterSpacing: "0.5em",
            color: tone.art,
          }}
        >
          {familyWord}
        </p>
        <p
          style={{
            fontStyle: "italic",
            marginTop: "0.65rem",
            fontSize: "clamp(1.7rem, 3.6vw, 2.5rem)",
            lineHeight: 1.1,
            color: theme.text,
            textWrap: "balance",
          }}
        >
          {note.name}
        </p>
        {note.subtitle ? (
          <div style={{ marginTop: "0.55rem", fontSize: "clamp(1.1rem, 2.3vw, 1.4rem)", color: tone.art }}>
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
        paddingBlock: "clamp(4.5rem, 15vh, 8rem)",
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
          color: theme.text,
          opacity: 0.82,
          textWrap: "balance",
        }}
      >
        {labels.closing}
      </div>
    </motion.div>
  );
}

export type { CSSProperties };

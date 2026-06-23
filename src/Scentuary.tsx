import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { gsap } from "gsap";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import type {
  ScentNote,
  ScentTier,
  ScentuaryProps,
  ScentuaryTheme,
  Tone,
} from "./types";
import { mergeLabels, mergeTheme } from "./tones";
import { serpentine } from "./serpentine";
import { DefaultNoteArt } from "./DefaultNoteArt";

if (typeof window !== "undefined") {
  gsap.registerPlugin(DrawSVGPlugin, ScrollTrigger);
}

const EASE = [0.22, 1, 0.36, 1] as const;
const TIER_ORDER = ["top", "heart", "base"] as const;

type Row =
  | { kind: "tier"; key: (typeof TIER_ORDER)[number]; tier: ScentTier }
  | { kind: "note"; note: ScentNote; tone: Tone; side: "left" | "right" };

/**
 * Scentuary — an immersive, scroll-driven descent through a fragrance's notes.
 *
 * A path winds left ↔ right and draws itself with the scroll; each note is its
 * own full-viewport scene, and as it reaches centre the whole field recolours to
 * that note's own tone. Themeable, fully localisable, framework-CSS-free.
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
  const reduce = useReducedMotion() ?? false;
  const root = useRef<HTMLElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);

  const [geom, setGeom] = useState<{ w: number; h: number; d: string }>({
    w: 0,
    h: 0,
    d: "",
  });

  // Build the descent: a tier chapter, then its notes — each alternating sides
  // so the path weaves, each taking its own distinct tone in sequence.
  const rows: Row[] = [];
  let sideToggle = 0;
  let toneIdx = 0;
  for (const key of TIER_ORDER) {
    rows.push({ kind: "tier", key, tier: labels.tiers[key] });
    for (const note of notes[key] ?? []) {
      const base = theme.tones[toneIdx % theme.tones.length];
      rows.push({
        kind: "note",
        note,
        tone: { ...base, ...note.tone },
        side: sideToggle % 2 === 0 ? "left" : "right",
      });
      sideToggle++;
      toneIdx++;
    }
  }

  const startTone =
    (rows.find((r) => r.kind === "note") as Extract<Row, { kind: "note" }>)
      ?.tone ?? theme.tones[0];

  // Measure real scene centres → serpentine in pixel space (so DrawSVG works).
  useEffect(() => {
    const rowsEl = rowsRef.current;
    if (!rowsEl) return;
    const measure = () => {
      const w = rowsEl.clientWidth;
      const h = rowsEl.clientHeight;
      const scenes = Array.from(
        rowsEl.querySelectorAll<HTMLElement>("[data-scene]"),
      );
      if (!w || !h || scenes.length === 0) return;
      const pts = scenes.map((el) => {
        const side = el.dataset.side;
        const x =
          side === "left" ? w * 0.16 : side === "right" ? w * 0.84 : w * 0.5;
        const y = el.offsetTop + el.offsetHeight / 2;
        return { x, y };
      });
      setGeom({ w, h, d: serpentine(pts) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(rowsEl);
    return () => ro.disconnect();
  }, [notes]);

  // Draw the path on scroll + recolour the field per note.
  useEffect(() => {
    if (!root.current) return;
    const ctx = gsap.context(() => {
      if (geom.d) {
        if (reduce) {
          gsap.set("[data-path]", { drawSVG: "100%" });
        } else {
          gsap.set("[data-path]", { drawSVG: "0%" });
          gsap.to("[data-path]", {
            drawSVG: "100%",
            ease: "none",
            scrollTrigger: {
              trigger: "[data-rows]",
              start: "top 78%",
              end: "bottom 78%",
              scrub: 0.6,
            },
          });
        }
      }
      if (reduce) return;
      // Target only the field layers — scenes carry tone data, never painted.
      gsap.utils.toArray<HTMLElement>("[data-note]").forEach((el) => {
        const g = el.dataset.toneGlow;
        const t = el.dataset.toneTint;
        const recolor = () => {
          gsap.to("[data-field-glow]", {
            color: g,
            duration: 1.3,
            ease: "sine.inOut",
            overwrite: "auto",
          });
          gsap.to("[data-field-tint]", {
            backgroundColor: t,
            duration: 1.3,
            ease: "sine.inOut",
            overwrite: "auto",
          });
        };
        ScrollTrigger.create({
          trigger: el,
          start: "top 60%",
          end: "bottom 40%",
          onEnter: recolor,
          onEnterBack: recolor,
        });
      });
      ScrollTrigger.refresh();
    }, root);
    return () => ctx.revert();
  }, [geom.d, reduce]);

  const art = renderNoteArt ?? DefaultNoteArt;

  return (
    <section
      ref={root}
      className={className}
      style={{
        position: "relative",
        width: "100%",
        background: startTone.tint,
        color: theme.text,
        fontFamily: theme.fontBody,
        ...style,
      }}
    >
      {/* Ambient field — one sticky layer the content scrolls over. */}
      <div
        aria-hidden
        style={{
          position: "sticky",
          top: 0,
          zIndex: 0,
          height: "100vh",
          width: "100%",
          marginBottom: "-100vh",
          overflow: "hidden",
          pointerEvents: "none",
        }}
      >
        <div
          data-field-tint
          style={{ position: "absolute", inset: 0, backgroundColor: startTone.tint }}
        />
        <div
          data-field-glow
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(circle at 50% 42%, currentColor 0%, transparent 62%)",
            color: startTone.glow,
            opacity: 0.5,
          }}
        />
      </div>

      {/* Foreground */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          paddingInline: "clamp(1.5rem, 5vw, 3rem)",
        }}
      >
        <Header theme={theme} labels={labels} />

        <div ref={rowsRef} data-rows style={{ position: "relative", maxWidth: 768, margin: "0 auto" }}>
          {geom.d ? (
            <svg
              style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
              width={geom.w}
              height={geom.h}
              viewBox={`0 0 ${geom.w} ${geom.h}`}
              fill="none"
              aria-hidden
            >
              <path d={geom.d} stroke={`${theme.accent}55`} strokeWidth="1.5" strokeLinecap="round" />
              <path
                data-path
                d={geom.d}
                stroke={theme.accentBright}
                strokeWidth="2.4"
                strokeLinecap="round"
                style={{ filter: `drop-shadow(0 0 9px ${theme.accent})` }}
              />
            </svg>
          ) : null}

          {rows.map((row, i) =>
            row.kind === "tier" ? (
              <TierScene key={`t-${i}`} tier={row.tier} theme={theme} reduce={reduce} />
            ) : (
              <NoteScene
                key={`n-${row.note.name}-${i}`}
                note={row.note}
                tone={row.tone}
                side={row.side}
                familyWord={
                  labels.familyLabel[row.note.family ?? "default"] ??
                  labels.familyLabel.default
                }
                theme={theme}
                reduce={reduce}
                art={art}
              />
            ),
          )}
        </div>

        {labels.closing ? (
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, margin: "-10%" }}
            transition={{ duration: 1.4 }}
            style={{
              maxWidth: 768,
              margin: "0 auto",
              minHeight: "74svh",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
            }}
          >
            <span style={{ display: "block", height: 1, width: 64, background: theme.accent }} />
            <div
              style={{
                marginTop: "3rem",
                fontFamily: theme.fontDisplay,
                fontStyle: "italic",
                fontSize: "clamp(1.5rem, 3vw, 1.875rem)",
                lineHeight: 1.5,
                color: theme.textSoft,
                textWrap: "balance",
              }}
            >
              {labels.closing}
            </div>
          </motion.div>
        ) : null}
      </div>
    </section>
  );
}

function Header({ theme, labels }: { theme: ScentuaryTheme; labels: ReturnType<typeof mergeLabels> }) {
  return (
    <header
      style={{
        maxWidth: 768,
        margin: "0 auto",
        minHeight: "82svh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-15%" }}
        transition={{ duration: 0.9, ease: EASE }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "1rem" }}>
          <span style={{ height: 1, width: 40, background: `linear-gradient(to right, transparent, ${theme.accent}88)` }} />
          <p
            style={{
              fontFamily: theme.fontDisplay,
              fontSize: "0.62rem",
              textTransform: "uppercase",
              letterSpacing: "0.6em",
              color: `${theme.accent}b3`,
            }}
          >
            {labels.eyebrow}
          </p>
          <span style={{ height: 1, width: 40, background: `linear-gradient(to left, transparent, ${theme.accent}88)` }} />
        </div>
        <h2
          style={{
            fontFamily: theme.fontDisplay,
            fontStyle: "italic",
            marginTop: "2rem",
            fontSize: "clamp(2.5rem, 6vw, 4.5rem)",
            lineHeight: 1.05,
            color: theme.text,
            textWrap: "balance",
          }}
        >
          {labels.title}
        </h2>
        <p
          style={{
            marginTop: "2.5rem",
            fontFamily: theme.fontDisplay,
            fontSize: "0.6rem",
            textTransform: "uppercase",
            letterSpacing: "0.5em",
            color: theme.textSoft,
          }}
        >
          {labels.scrollCue}
        </p>
      </motion.div>
    </header>
  );
}

function TierScene({
  tier,
  theme,
  reduce,
}: {
  tier: ScentTier;
  theme: ScentuaryTheme;
  reduce: boolean;
}) {
  return (
    <div
      data-scene
      data-side="center"
      style={{
        position: "relative",
        display: "flex",
        minHeight: "80svh",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
      }}
    >
      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.96 }}
        whileInView={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
        viewport={{ once: true, margin: "-25%" }}
        transition={{ duration: 0.9, ease: EASE }}
        style={{ display: "flex", flexDirection: "column", alignItems: "center" }}
      >
        <div
          style={{
            display: "grid",
            placeItems: "center",
            height: 64,
            width: 64,
            borderRadius: "9999px",
            fontFamily: theme.fontDisplay,
            fontStyle: "italic",
            border: `1px solid ${theme.accent}55`,
            background: `radial-gradient(circle, ${theme.accent}14 0%, transparent 70%)`,
            color: theme.accentBright,
            boxShadow: `0 0 28px ${theme.accent}33`,
          }}
        >
          {tier.roman}
        </div>
        <p
          style={{
            marginTop: "1.75rem",
            fontFamily: theme.fontDisplay,
            fontSize: "0.66rem",
            textTransform: "uppercase",
            letterSpacing: "0.7em",
            color: theme.accentBright,
          }}
        >
          {tier.label}
        </p>
        {tier.subtitle ? (
          <p
            style={{
              marginTop: "0.75rem",
              fontFamily: theme.fontDisplay,
              fontSize: "clamp(1.75rem, 4vw, 2.25rem)",
              color: theme.accentSoft,
            }}
          >
            {tier.subtitle}
          </p>
        ) : null}
        {tier.caption ? (
          <p
            style={{
              marginTop: "1.5rem",
              maxWidth: "24rem",
              fontFamily: theme.fontDisplay,
              fontStyle: "italic",
              fontSize: "0.875rem",
              lineHeight: 1.6,
              color: theme.textSoft,
              textWrap: "balance",
            }}
          >
            {tier.caption}
          </p>
        ) : null}
      </motion.div>
    </div>
  );
}

function NoteScene({
  note,
  tone,
  side,
  familyWord,
  theme,
  reduce,
  art,
}: {
  note: ScentNote;
  tone: Tone;
  side: "left" | "right";
  familyWord: string;
  theme: ScentuaryTheme;
  reduce: boolean;
  art: (note: ScentNote, ctx: { color: string; size: number; reduce: boolean }) => ReactNode;
}) {
  const left = side === "left";
  return (
    <div
      data-note
      data-scene
      data-side={side}
      data-tone-glow={tone.glow}
      data-tone-tint={tone.tint}
      style={{
        position: "relative",
        display: "flex",
        minHeight: "100svh",
        alignItems: "center",
      }}
    >
      <motion.span
        aria-hidden
        style={{
          position: "absolute",
          top: "50%",
          left: left ? "16%" : "84%",
          transform: "translate(-50%, -50%)",
          zIndex: 10,
          height: 12,
          width: 12,
          borderRadius: "9999px",
          background: tone.art,
          boxShadow: `0 0 14px 3px ${tone.glow}`,
        }}
        animate={reduce ? { opacity: 1 } : { opacity: [0.55, 1, 0.55], scale: [1, 1.25, 1] }}
        transition={reduce ? { duration: 0 } : { duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
      />
      <div
        style={{
          display: "flex",
          width: "100%",
          maxWidth: "32rem",
          flexDirection: "column",
          alignItems: "center",
          gap: "2.25rem",
          textAlign: "center",
          ...(left ? { marginRight: "auto" } : { marginLeft: "auto" }),
        }}
      >
        <div style={{ position: "relative", display: "grid", placeItems: "center", flex: "none" }}>
          <motion.div
            aria-hidden
            style={{
              position: "absolute",
              height: 224,
              width: 224,
              borderRadius: "9999px",
              filter: "blur(48px)",
              background: tone.glow,
            }}
            animate={reduce ? { opacity: 0.3 } : { opacity: [0.22, 0.4, 0.22], scale: [1, 1.06, 1] }}
            transition={reduce ? { duration: 0 } : { duration: 6, repeat: Infinity, ease: "easeInOut" }}
          />
          <div
            style={{
              position: "relative",
              display: "grid",
              placeItems: "center",
              height: 184,
              width: 184,
              borderRadius: "9999px",
              border: `1px solid ${tone.art}33`,
              background: `radial-gradient(circle, ${tone.art}14 0%, transparent 72%)`,
            }}
          >
            {art(note, { color: tone.art, size: 132, reduce })}
          </div>
        </div>
        <motion.div
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 22, filter: "blur(5px)" }}
          whileInView={reduce ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true, margin: "-30%" }}
          transition={{ duration: 0.9, ease: EASE }}
          style={{ flex: 1 }}
        >
          <p
            style={{
              fontFamily: theme.fontDisplay,
              fontSize: "0.58rem",
              textTransform: "uppercase",
              letterSpacing: "0.55em",
              color: tone.art,
              opacity: 0.7,
            }}
          >
            {familyWord}
          </p>
          <p
            style={{
              fontFamily: theme.fontDisplay,
              fontStyle: "italic",
              marginTop: "0.75rem",
              fontSize: "clamp(3rem, 6vw, 3.75rem)",
              lineHeight: 1.1,
              color: theme.text,
            }}
          >
            {note.name}
          </p>
          {note.subtitle ? (
            <p
              style={{
                marginTop: "0.75rem",
                fontFamily: theme.fontDisplay,
                fontSize: "clamp(1.75rem, 4vw, 2.25rem)",
                color: tone.art,
              }}
            >
              {note.subtitle}
            </p>
          ) : null}
        </motion.div>
      </div>
    </div>
  );
}

export type { CSSProperties };

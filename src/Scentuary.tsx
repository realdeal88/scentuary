import {
  useEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useReducedMotion } from "motion/react";
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

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

type Labels = ReturnType<typeof mergeLabels>;
type ArtFn = (
  note: ScentNote,
  ctx: { color: string; size: number; reduce: boolean },
) => ReactNode;

const TIER_ORDER = ["top", "heart", "base"] as const;

/** Each frame is one still scene the descent crossfades through. */
type Frame =
  | { kind: "intro" }
  | { kind: "tier"; tier: ScentTier }
  | { kind: "note"; note: ScentNote; tone: Tone; familyWord: string }
  | { kind: "closing" };

/**
 * Scentuary — a pinned, scroll-driven descent through a fragrance's notes.
 *
 * The stage pins: the page holds still while each note rises into the frame,
 * blooms, and dissolves into the next. The whole field recolours to that note's
 * own tone, a thread of light draws downward as you descend, and a bead travels
 * it. Not a list that scrolls past — a place you sink through. Themeable, fully
 * localisable, framework-CSS-free, and dependent only on `gsap` + `motion`.
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
  const root = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const art = renderNoteArt ?? DefaultNoteArt;

  // Build the descent as an ordered list of frames: an opening, then each tier
  // chapter followed by its notes (each in its own sequenced tone), then a close.
  const frames: Frame[] = [{ kind: "intro" }];
  let toneIdx = 0;
  for (const key of TIER_ORDER) {
    const tierNotes = notes[key] ?? [];
    if (tierNotes.length === 0) continue;
    frames.push({ kind: "tier", tier: labels.tiers[key] });
    for (const note of tierNotes) {
      const base = theme.tones[toneIdx % theme.tones.length];
      frames.push({
        kind: "note",
        note,
        tone: { ...base, ...note.tone },
        familyWord:
          labels.familyLabel[note.family ?? "default"] ??
          labels.familyLabel.default,
      });
      toneIdx++;
    }
  }
  if (labels.closing) frames.push({ kind: "closing" });

  const firstTone =
    (frames.find((f) => f.kind === "note") as
      | Extract<Frame, { kind: "note" }>
      | undefined)?.tone ?? theme.tones[0];

  // ── Pinned, scrubbed timeline: crossfade frames + recolour the field ──
  useEffect(() => {
    const el = root.current;
    if (reduce || !el || !stage.current) return;
    const ctx = gsap.context(() => {
      const layers = Array.from(el.querySelectorAll<HTMLElement>("[data-frame]"));
      const tint = el.querySelector<HTMLElement>("[data-field-tint]");
      const glow = el.querySelector<HTMLElement>("[data-field-glow]");
      const fill = el.querySelector<HTMLElement>("[data-spine-fill]");
      const bead = el.querySelector<HTMLElement>("[data-bead]");
      if (layers.length === 0) return;
      const last = layers.length - 1;

      gsap.set(layers, { autoAlpha: 0, scale: 0.9, filter: "blur(14px)" });
      gsap.set(layers[0], { autoAlpha: 1, scale: 1, filter: "blur(0px)" });

      const tl = gsap.timeline({
        defaults: { ease: "none" },
        scrollTrigger: {
          trigger: el,
          start: "top top",
          end: () => "+=" + layers.length * window.innerHeight * 0.7,
          pin: stage.current,
          scrub: 1,
          invalidateOnRefresh: true,
          onUpdate: (st) => {
            if (fill) gsap.set(fill, { scaleY: st.progress });
            if (bead) gsap.set(bead, { top: st.progress * 100 + "%" });
          },
        },
      });

      // Each frame: rises in, dwells crisp at full opacity, then dissolves —
      // the dwell window is what lets the eye actually rest on each note. Frames
      // are spaced wider than the in/out so the hold is real, with a short
      // crossfade overlap into the next.
      const STEP = 1.3;
      layers.forEach((layer, i) => {
        const t = i * STEP;
        if (i > 0) {
          tl.fromTo(
            layer,
            { autoAlpha: 0, scale: 0.88, filter: "blur(12px)" },
            { autoAlpha: 1, scale: 1, filter: "blur(0px)", duration: 0.5, ease: "power2.out" },
            t,
          );
        }

        const kind = layer.dataset.kind;
        if (kind === "note") {
          if (tint)
            tl.to(tint, { backgroundColor: layer.dataset.tint, duration: 0.6, ease: "sine.inOut" }, t);
          if (glow)
            tl.to(glow, { color: layer.dataset.glow, duration: 0.6, ease: "sine.inOut" }, t);
          if (bead)
            tl.to(
              bead,
              { backgroundColor: layer.dataset.art, boxShadow: `0 0 18px 5px ${layer.dataset.glow}`, duration: 0.6 },
              t,
            );
        } else if (kind === "intro" || kind === "closing") {
          if (tint) tl.to(tint, { backgroundColor: theme.background, duration: 0.6 }, t);
          if (glow) tl.to(glow, { color: theme.accent, duration: 0.6 }, t);
          if (bead)
            tl.to(bead, { backgroundColor: theme.accentBright, boxShadow: `0 0 16px 4px ${theme.accent}`, duration: 0.6 }, t);
        }

        if (i < last) {
          tl.to(
            layer,
            { autoAlpha: 0, scale: 1.1, filter: "blur(12px)", duration: 0.5, ease: "power2.in" },
            t + 0.95,
          );
        }
      });

      ScrollTrigger.refresh();
    }, root);
    return () => ctx.revert();
  }, [reduce, theme.background, theme.accent, theme.accentBright]);

  // ── Reduced motion / no-JS: a calm, fully-visible vertical reading ──
  if (reduce) {
    return (
      <section
        className={className}
        style={{
          position: "relative",
          width: "100%",
          background: theme.background,
          color: theme.text,
          fontFamily: theme.fontBody,
          paddingBlock: "6rem",
          ...style,
        }}
      >
        <div style={{ maxWidth: 720, margin: "0 auto", paddingInline: "1.5rem" }}>
          {frames.map((f, i) => (
            <div
              key={i}
              style={{
                minHeight: "60svh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <FrameBody frame={f} theme={theme} labels={labels} art={art} reduce />
            </div>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section
      ref={root}
      className={className}
      style={{
        position: "relative",
        width: "100%",
        background: theme.background,
        color: theme.text,
        fontFamily: theme.fontBody,
        ...style,
      }}
    >
      <div
        ref={stage}
        style={{
          position: "relative",
          height: "100vh",
          width: "100%",
          overflow: "hidden",
        }}
      >
        {/* Recolouring field — washes to each note's tone */}
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
              background:
                "radial-gradient(circle at 50% 46%, currentColor 0%, transparent 70%)",
              color: theme.accent,
              opacity: 0.4,
              mixBlendMode: "screen",
            }}
          />
        </div>

        {/* The thread — draws downward as you descend, a bead riding it */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: "clamp(1.25rem, 5vw, 4.5rem)",
            top: "16%",
            bottom: "16%",
            width: 1,
            zIndex: 5,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: theme.accent,
              opacity: 0.18,
            }}
          />
          <div
            data-spine-fill
            style={{
              position: "absolute",
              inset: 0,
              transformOrigin: "top",
              transform: "scaleY(0)",
              background: `linear-gradient(to bottom, ${theme.accentBright}, ${theme.accent})`,
              boxShadow: `0 0 8px ${theme.accent}`,
            }}
          />
          <div
            data-bead
            style={{
              position: "absolute",
              left: "50%",
              top: 0,
              height: 9,
              width: 9,
              marginLeft: -4.5,
              marginTop: -4.5,
              borderRadius: "9999px",
              backgroundColor: theme.accentBright,
              boxShadow: `0 0 16px 4px ${theme.accent}`,
            }}
          />
        </div>

        {/* Stacked frames — the descent crossfades through them in place */}
        {frames.map((f, i) => (
          <div
            key={i}
            data-frame
            data-kind={f.kind}
            {...(f.kind === "note"
              ? { "data-tint": f.tone.tint, "data-glow": f.tone.glow, "data-art": f.tone.art }
              : {})}
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              paddingInline: "clamp(2rem, 8vw, 6rem)",
              textAlign: "center",
              visibility: "hidden",
            }}
          >
            <FrameBody frame={f} theme={theme} labels={labels} art={art} reduce={false} />
          </div>
        ))}
      </div>
    </section>
  );
}

function FrameBody({
  frame,
  theme,
  labels,
  art,
  reduce,
}: {
  frame: Frame;
  theme: ScentuaryTheme;
  labels: Labels;
  art: ArtFn;
  reduce: boolean;
}) {
  switch (frame.kind) {
    case "intro":
      return <IntroBody theme={theme} labels={labels} />;
    case "tier":
      return <TierBody tier={frame.tier} theme={theme} />;
    case "closing":
      return <ClosingBody theme={theme} labels={labels} />;
    case "note":
      return (
        <NoteBody
          note={frame.note}
          tone={frame.tone}
          familyWord={frame.familyWord}
          theme={theme}
          art={art}
          reduce={reduce}
        />
      );
  }
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

function IntroBody({ theme, labels }: { theme: ScentuaryTheme; labels: Labels }) {
  return (
    <div style={{ maxWidth: 760, fontFamily: theme.fontDisplay }}>
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
    </div>
  );
}

function TierBody({ tier, theme }: { tier: ScentTier; theme: ScentuaryTheme }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", fontFamily: theme.fontDisplay }}>
      <div
        style={{
          display: "grid",
          placeItems: "center",
          height: 72,
          width: 72,
          borderRadius: "9999px",
          fontStyle: "italic",
          fontSize: "1.05rem",
          border: `1px solid ${theme.accent}40`,
          background: `radial-gradient(circle, ${theme.accent}1f 0%, transparent 72%)`,
          color: theme.accentBright,
        }}
      >
        {tier.roman}
      </div>
      <p
        style={{
          marginTop: "1.75rem",
          fontSize: "0.7rem",
          textTransform: "uppercase",
          letterSpacing: "0.7em",
          color: theme.accentBright,
        }}
      >
        {tier.label}
      </p>
      {tier.subtitle ? (
        <p style={{ marginTop: "0.75rem", fontSize: "clamp(1.75rem, 4vw, 2.5rem)", color: theme.accentSoft }}>
          {tier.subtitle}
        </p>
      ) : null}
      {tier.caption ? (
        <div
          style={{
            marginTop: "1.5rem",
            maxWidth: "26rem",
            fontStyle: "italic",
            fontSize: "0.95rem",
            lineHeight: 1.7,
            color: theme.textSoft,
            textWrap: "balance",
          }}
        >
          {tier.caption}
        </div>
      ) : null}
    </div>
  );
}

function NoteBody({
  note,
  tone,
  familyWord,
  theme,
  art,
  reduce,
}: {
  note: ScentNote;
  tone: Tone;
  familyWord: string;
  theme: ScentuaryTheme;
  art: ArtFn;
  reduce: boolean;
}) {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "2.25rem",
        fontFamily: theme.fontDisplay,
      }}
    >
      <div style={{ position: "relative", display: "grid", placeItems: "center" }}>
        {/* Blended bloom — no ring, feathers into the field */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            height: "min(78vw, 560px)",
            width: "min(78vw, 560px)",
            borderRadius: "9999px",
            background: `radial-gradient(circle, ${tone.glow} 0%, transparent 66%)`,
            filter: "blur(64px)",
            opacity: 0.5,
            mixBlendMode: "screen",
          }}
        />
        <div style={{ position: "relative" }}>{art(note, { color: tone.art, size: 200, reduce })}</div>
      </div>
      <div>
        <p
          style={{
            fontSize: "0.6rem",
            textTransform: "uppercase",
            letterSpacing: "0.55em",
            color: tone.art,
            opacity: 0.72,
          }}
        >
          {familyWord}
        </p>
        <p
          style={{
            fontStyle: "italic",
            marginTop: "0.9rem",
            fontSize: "clamp(2.75rem, 7vw, 4.75rem)",
            lineHeight: 1.05,
            color: theme.text,
            textWrap: "balance",
          }}
        >
          {note.name}
        </p>
        {note.subtitle ? (
          <div style={{ marginTop: "0.85rem", fontSize: "clamp(1.6rem, 4vw, 2.25rem)", color: tone.art }}>
            {note.subtitle}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ClosingBody({ theme, labels }: { theme: ScentuaryTheme; labels: Labels }) {
  return (
    <div
      style={{
        maxWidth: 720,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
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
    </div>
  );
}

export type { CSSProperties };

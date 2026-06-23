import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  treeshake: true,
  // Everything heavy is the host app's — never bundle it.
  external: [
    "react",
    "react-dom",
    "gsap",
    "gsap/DrawSVGPlugin",
    "gsap/ScrollTrigger",
    "motion",
    "motion/react",
  ],
  // Mark the output as a client component so Next.js server components can
  // import it directly. esbuild strips module-level directives during bundling,
  // so we re-add it after the build instead of via `banner`.
  onSuccess: "node scripts/add-use-client.mjs",
});

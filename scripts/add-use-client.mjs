// esbuild strips module-level "use client" directives when bundling, so we
// re-add it to the built entries — required for Next.js App Router consumers to
// import Scentuary directly from a Server Component.
import { readFileSync, writeFileSync } from "node:fs";

const DIRECTIVE = '"use client";';
for (const file of ["dist/index.js", "dist/index.cjs"]) {
  const code = readFileSync(file, "utf8");
  if (!code.startsWith(DIRECTIVE)) {
    writeFileSync(file, `${DIRECTIVE}\n${code}`);
  }
}
console.log('[scentuary] prepended "use client" to dist entries');

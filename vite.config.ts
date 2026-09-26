import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { execSync } from "node:child_process";
import { copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// The frontend commit this build was made from, shown in the footer.
function buildCommit(): string {
  try {
    return execSync("git rev-parse --short=10 HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return process.env.GITHUB_SHA?.slice(0, 10) ?? "unknown";
  }
}

// Jade has real page URLs (/stories/S-1/solution). A static host serves
// index.html for unknown paths only if told to: GitHub Pages does that for
// 404.html, so the build also writes index.html as 404.html.
function spaFallback() {
  return {
    name: "jade-spa-fallback",
    closeBundle() {
      const dist = resolve(__dirname, "dist");
      if (existsSync(resolve(dist, "index.html"))) copyFileSync(resolve(dist, "index.html"), resolve(dist, "404.html"));
    },
  };
}

// Two build modes:
//   npm run build              -> normal dist/ for hosting on consultiq.nl
//   npm run build:singlefile   -> one self-contained index.html, easy to share/preview
export default defineConfig(({ mode }) => ({
  // Absolute paths so deep links (/stories/S-1/delivery) load their assets.
  // The single-file build is opened as a file and routes with #/paths.
  base: mode === "singlefile" ? "./" : "/",
  define: { __BUILD_COMMIT__: JSON.stringify(buildCommit()) },
  plugins: [react(), ...(mode === "singlefile" ? [viteSingleFile()] : [spaFallback()])],
}));

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import { execSync } from "node:child_process";

// The frontend commit this build was made from, shown in the footer.
function buildCommit(): string {
  try {
    return execSync("git rev-parse --short=10 HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return process.env.GITHUB_SHA?.slice(0, 10) ?? "unknown";
  }
}

// Two build modes:
//   npm run build              -> normal dist/ for hosting on consultiq.nl
//   npm run build:singlefile   -> one self-contained index.html, easy to share/preview
export default defineConfig(({ mode }) => ({
  base: "./",
  define: { __BUILD_COMMIT__: JSON.stringify(buildCommit()) },
  plugins: [react(), ...(mode === "singlefile" ? [viteSingleFile()] : [])],
}));

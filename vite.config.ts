import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// Two build modes:
//   npm run build              -> normal dist/ for hosting on consultiq.nl
//   npm run build:singlefile   -> one self-contained index.html, easy to share/preview
export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [react(), ...(mode === "singlefile" ? [viteSingleFile()] : [])],
}));

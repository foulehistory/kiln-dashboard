import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Electron loads the built output via file://, so every asset path must
// be relative - Vite's default is root-absolute ("/assets/..."), which
// 404s under file://.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist",
  },
});

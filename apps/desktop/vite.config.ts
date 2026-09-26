import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Tauri expects a fixed dev port; the same UI also runs in a normal browser (demo mode only).
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  // Two pages: the Live Coach window and the optional overlay window (D-11).
  build: { target: "es2022", outDir: "dist", rollupOptions: { input: { main: "index.html", overlay: "overlay.html" } } },
});

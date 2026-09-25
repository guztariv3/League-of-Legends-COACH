import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

/** In development, /info/<page> serves the public pages' shell (production does the same in site.ts). */
const infoPages = (): Plugin => ({
  name: "info-pages",
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      if (req.url && /^\/info(\/[^.]*)?(\?.*)?$/.test(req.url)) req.url = "/info/index.html";
      next();
    });
  },
});

export default defineConfig({
  plugins: [react(), infoPages()],
  build: {
    rollupOptions: {
      input: {
        app: fileURLToPath(new URL("./index.html", import.meta.url)),
        info: fileURLToPath(new URL("./info/index.html", import.meta.url)),
      },
    },
  },
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:8787" },
  },
});

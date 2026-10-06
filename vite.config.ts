import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves the demo from /social-dashboard/; locally and on the Node server it is "/".
// In dev, the API server (`npm run server`) runs on :8787; the browser only ever talks to Vite.
export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/social-dashboard/" : "/",
  plugins: [react()],
  server: { proxy: { "/api": "http://127.0.0.1:8787" } },
});

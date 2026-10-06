import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from https://<user>.github.io/social-dashboard/ on GitHub Pages.
export default defineConfig({
  base: "/social-dashboard/",
  plugins: [react()],
});

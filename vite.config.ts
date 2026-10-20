import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Workout Tracker",
        short_name: "Workouts",
        description: "Local-first, offline-capable workout tracker",
        display: "standalone",
        start_url: "/",
        background_color: "#0b0b0f",
        theme_color: "#0b0b0f",
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
        ],
      },
      workbox: { globPatterns: ["**/*.{js,css,html,svg,json}"] },
    }),
  ],
  test: { environment: "jsdom", include: ["tests/**/*.test.ts?(x)", "src/**/*.test.ts?(x)"] },
});

import { sveltekit } from "@sveltejs/kit/vite";
import adapter from "@sveltejs/adapter-static";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Static, client-only SPA: no server, no SSR.
  plugins: [sveltekit({ adapter: adapter({ fallback: "index.html" }) })],
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
  },
});

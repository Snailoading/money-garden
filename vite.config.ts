/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    // Engine tests are pure functions — plain Node, no browser DOM emulation needed.
    environment: "node",
  },
});

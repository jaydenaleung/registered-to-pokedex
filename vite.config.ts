import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2022",
    // The Firebase SDK chunk (~200 kB gzip) is expected; app code is split out below.
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        // Keep the (large, rarely changing) Firebase SDK and React in their own cacheable chunks.
        codeSplitting: {
          groups: [
            { name: "firebase", test: /node_modules[\\/](@firebase|firebase)[\\/]/ },
            { name: "react", test: /node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

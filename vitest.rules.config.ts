import { defineConfig } from "vitest/config";

// Security-rules tests. Run with the Firestore emulator:
//   npm run test:rules
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.rules.test.ts"],
    testTimeout: 20_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});

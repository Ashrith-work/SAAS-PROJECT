import { defineConfig } from "vitest/config";
import path from "node:path";

// Vitest config for the HotelTrack integration tests. We resolve the `@/*`
// alias the same way tsconfig.json does so test files can import `@/lib/...`.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000, // DB integration tests can take a while
    pool: "forks",       // each test file in its own process — Prisma client is happier
    fileParallelism: false,
  },
});

import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Tests run against the types source, so they need no prior build.
    alias: { "@erp/types": path.resolve(__dirname, "../../packages/types/src/index.ts") },
  },
  test: {
    environment: "node",
    passWithNoTests: true,
  },
});

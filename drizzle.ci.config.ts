import { defineConfig } from "drizzle-kit";
import { validateReplay } from "./scripts/ci-drizzle-replay.mjs";

// Fail closed before drizzle-kit can connect. Production keeps drizzle.config.ts.
const replay = validateReplay();

export default defineConfig({
  dialect: "postgresql",
  schema: "./drizzle/schema.ts",
  out: replay.migrationsDir,
  dbCredentials: { url: replay.databaseUrl },
});

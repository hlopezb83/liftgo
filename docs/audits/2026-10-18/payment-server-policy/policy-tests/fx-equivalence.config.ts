import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const fixtureRoot = dirname(fileURLToPath(import.meta.url));
const sourceRoot = process.env.PAYMENT_CANDIDATE_SRC ?? resolve(fixtureRoot, "client-candidate-src");
export default {
  root: fixtureRoot,
  resolve: { alias: { "@": sourceRoot } },
  test: {
    environment: "node",
    include: ["fx-equivalence.test.ts"],
    pool: "forks",
    maxWorkers: 1,
    minWorkers: 1,
  },
};

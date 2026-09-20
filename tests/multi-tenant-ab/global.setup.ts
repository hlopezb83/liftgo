/**
 * Arranque del gate A/B: guard fail-closed + seed del entorno efímero.
 * Cualquier fallo aquí aborta la suite completa (no hay skips).
 */

import { assertLocalEphemeralBackend } from "./fixtures/localBackend";
import { seedAbEnvironment } from "./fixtures/abSeed";

export default async function globalSetup(): Promise<void> {
  assertLocalEphemeralBackend("global.setup");
  await seedAbEnvironment();
}

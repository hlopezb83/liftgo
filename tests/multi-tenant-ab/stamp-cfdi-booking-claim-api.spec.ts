import { execFile } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { assertLocalEphemeralBackend } from "./fixtures/localBackend";

// Run the unchanged handler with real Auth/PostgREST while A/B fixtures live.
// The child uses its own Node config: the unit config deliberately forbids DB
// traffic and replaces the API credentials. No Edge runtime/server is needed.
for (const link of ["direct", "pivot"] as const) {
  for (const order of ["cancel-first", "claim-first"] as const) {
    test(`R2 actual fiscal handler: ${order}, ${link} booking link`, async ({}, testInfo) => {
      testInfo.setTimeout(60_000);
      assertLocalEphemeralBackend("actual fiscal handler wrapper");
      const stem = join("tests/multi-tenant-ab/.state", `actual-claim-${link}-${order}`);
      const rawReport = `${stem}.vitest.json`;
      const proofFile = `${stem}.proof.json`;
      try {
        const outcome = await new Promise<{ code: number; signal: string | null }>((resolve) => {
          execFile(process.execPath, [
            "node_modules/vitest/vitest.mjs", "run", "--config",
            "tests/multi-tenant-ab/fixtures/stamp-cfdi-booking-claim.vitest.config.mjs",
            "--reporter=json", `--outputFile=${rawReport}`,
          ], {
            env: { ...process.env, AB_STAMP_CLAIM_LINK: link, AB_STAMP_CLAIM_ORDER: order,
              AB_STAMP_CLAIM_RESULT: proofFile },
            timeout: 45_000, maxBuffer: 1024 * 1024, windowsHide: true,
          }, (error) => resolve({
            code: !error ? 0 : typeof error.code === "number" ? error.code : 1,
            signal: error?.signal ?? null,
          }));
        });
        // Only the deliberately sanitized proof is attached. Child stdout,
        // errors, credentials and the complete Vitest report are never logged.
        let proof: {
          phase: string; authVerified: boolean; cleanupVerified: boolean;
          providerCreateCalls: number; providerInvoiceCalls: number;
          blockedRemoteCalls: number; claimResponses: { status: number; code: string | null; claimedRow: boolean }[];
        };
        try {
          proof = JSON.parse(readFileSync(proofFile, "utf8"));
        } catch {
          const diagnostic = { phase: "child-ended-without-valid-safe-proof", exitCode: outcome.code, signal: outcome.signal };
          await testInfo.attach("actual-handler-safe-child-diagnostic", {
            body: JSON.stringify(diagnostic, null, 2), contentType: "application/json",
          });
          throw new Error(`Actual handler child did not provide valid safe proof (exitCode=${outcome.code}, signal=${outcome.signal ?? "none"}).`);
        }
        await testInfo.attach("actual-handler-auth-sql-proof", {
          body: JSON.stringify(proof, null, 2), contentType: "application/json",
        });
        expect(outcome, `actual handler integration phase: ${proof.phase}`).toEqual({ code: 0, signal: null });
        expect(proof.authVerified).toBe(true);
        expect(proof.cleanupVerified).toBe(true);
        expect(proof.providerCreateCalls).toBe(0);
        expect(proof.providerInvoiceCalls).toBe(0);
        expect(proof.blockedRemoteCalls).toBe(0);
      } finally {
        rmSync(rawReport, { force: true });
        rmSync(proofFile, { force: true });
      }
    });
  }
}

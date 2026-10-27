import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Read only these four UI blobs. Never enumerate or open environment files.
const base = "9f3e07c289eb5508251b6c43d282a267ee46ff6d";
const sources = [
  "src/features/accounts-payable/components/RegisterSupplierPaymentDialog.tsx",
  "src/features/customers/components/customer-detail/CustomerInvoicesList.tsx",
  "src/features/customers/components/customer-detail/CustomerBookingsHistory.tsx",
  "src/features/customers/components/customer-detail/CustomerContactCard.tsx",
];
const directory = resolve("tests/design-group-c/before");
mkdirSync(directory, { recursive: true });
const sha256 = value => createHash("sha256").update(value).digest("hex");
const provenance = sources.map(source => {
  // Buffer output avoids the Windows console code page changing Unicode.
  const original = execFileSync("git", ["show", `${base}:${source}`]);
  const fixture = original.toString("utf8")
    .replaceAll('"../hooks/', '"@/features/accounts-payable/hooks/')
    .replaceAll('"../lib/', '"@/features/accounts-payable/lib/')
    .replaceAll('"./customerWebsiteUrl"', '"@/features/customers/components/customer-detail/customerWebsiteUrl"');
  const filename = source.split("/").at(-1);
  writeFileSync(resolve(directory, filename), fixture, "utf8");
  return { source, fixture: `before/${filename}`, sourceSha256: sha256(original), fixtureSha256: sha256(fixture) };
});
writeFileSync(resolve(directory, "provenance.json"), JSON.stringify({ base, adaptation: "Import paths only; UTF-8 source bytes decoded directly from Git blobs.", files: provenance }, null, 2) + "\n");
process.stdout.write(`Restored ${provenance.length} UTF-8 UI snapshots from ${base}.\n`);

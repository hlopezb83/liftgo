# Supplier REP XML parsing — draft migration

## Scope

Replace regex extraction with `@xmldom/xmldom` **0.9.12**, pinned exactly. The
TanStack server adapter and compatibility Edge endpoint share the same pure
traversal core. No changes to issuer comparison, invoice/payment matching,
amount tolerance, roles, company filters, Storage paths or duplicate-UUID rules.

The UI currently calls `validateSupplierRepFn` from
`src/features/accounts-payable/hooks/useSupplierRepMutations.ts`. The legacy
`supabase/functions/validate-supplier-rep/index.ts` still serves its handler;
this source review cannot establish whether that endpoint remains deployed.
Both source paths therefore use the same extraction policy.

Only actual XML elements at the expected paths participate: the root CFDI
Comprobante; its direct Emisor and Complemento; payment Pagos/Pago and direct
DoctoRelacionado; and TimbreFiscalDigital directly under Complemento. Match
namespace URIs, not spelling of prefixes. Fiscal attributes are unnamespaced
and remain strings until the existing amount conversion. Singular fields
reject multiple candidate elements instead of selecting the first. Comments,
CDATA, wrappers and wrong namespaces cannot impersonate these fields.

## Safety and limits

- Throw on *every* parser diagnostic, including warnings, without logging XML.
- Reject DTD/ENTITY declarations before parsing; there is no external resolver.
- Retain the 5 MiB UTF-8 cap and bound markup tokens before DOM allocation.
- Reject over 50,000 DOM nodes or DOM node depth over 64 after parsing. The
  depth check is not a streaming/pre-allocation limit; byte/markup caps are.
- Reject literal and numeric-reference characters outside XML 1.0's Char set.
- Reject extra root elements, exterior non-whitespace text and exterior CDATA.
- Policy is intentionally conservative: DTD-like text or excessive markup even
  inside comments/CDATA is rejected. Ordinary predefined/numeric entities work.

The retained API name `isWellFormedXml` is compatibility terminology, **not a
promise of complete XML conformance**. xmldom is not an XSD/SAT validator or a
signature verifier. In particular it can silently normalize duplicate attributes
with different prefixes but the same expanded name and accept some reserved
namespace declarations. These limitations must not be confused with the strict
structural selection of the unnamespaced RFC/Monto/UUID fields. Tests verify
namespaced attribute lookalikes cannot replace those fields. If exhaustive XML
conformance becomes a requirement, evaluate a maintained strict validator before
integration; do not reimplement an XML lexer here.

## Dependency review

Reviewed upstream releases, security policy and published advisories on
2026-10-31. Version 0.9.12 is the current maintained release and includes the
August 2026 parser/namespace resource fixes. Do not use the deprecated unscoped
`xmldom` package. This review is not a claim that no undiscovered vulnerability
exists.

- https://github.com/xmldom/xmldom/releases/tag/0.9.12
- https://github.com/xmldom/xmldom/security/advisories
- https://github.com/xmldom/xmldom/blob/master/SECURITY.md

## Reproducibility / draft gate

`bun.lock` was regenerated with Bun 1.4.4 in **offline, lockfile-only** mode
using the already downloaded package. Its diff contains only the new dependency.
The local full frozen install was blocked by proxy 403 responses for existing
lockfile tarballs; no registry mirrors or lock URL rewrites were used.

The missing Deno lock entries were obtained from the **unmodified normal CI
frozen-check diagnostic** produced by Deno 2.9.8, not fabricated or guessed:
[run 41158337805, job 124410280175](https://github.com/hlopezb83/liftgo/actions/runs/41158337805/job/124410280175).
Its exact diff adds one npm specifier and one package integrity entry for 0.9.12;
the integrity independently matches Bun's existing entry. This diff is applied
to `supabase/functions/deno.lock` without changing any other dependency.
The frozen gate remains enabled. **Keep draft until the next exact-head CI
validates the updated lock and all required tests.**

Existing Edge organization-isolation tests still require the supported dependency
cache (the old remote std assertion module was unavailable locally). Remaining
local dependencies were copied, read-only, from another completed installation
whose baseline `bun.lock` was verified byte-for-byte identical; no URLs changed
and no blocked network download was retried.

Local verification of this change:
- 60/60 Vitest tests: XML, supplier REP business validation and server-function
  organization-isolation guards.
- Full `tsc --noEmit`, full ESLint with `--max-warnings=0`, architecture checks,
  and the complete client/SSR Vite build (after the normal prebuild): passed.
- 9/9 Edge parser runtime tests on Deno 2.9.6, using cached manual dependencies;
  test type-check was disabled due to absent Node type-resolution metadata.
  The handler itself passed Deno check separately.

These local checks do not replace the Deno 2.9.8 frozen-lock CI gate above.
No production data, deployment or schema changes were performed.

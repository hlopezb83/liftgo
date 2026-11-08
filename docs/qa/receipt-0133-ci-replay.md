# Receipt 0133 and disposable CI replay

The official 0132 activation generated assertion-only receipt 0133. Its checks bind the production ledger prefix, installed inventory RPC, effective ACLs and ICU version. That receipt cannot attest a fresh disposable CI database.

CI validates its exact identity before excluding it: idx 133, tag `0133_control0132_verified_release`, timestamp 1794173743361, breakpoints true and SHA256 `00e33f75ffe7b626ce4e582621ca6560e3a8d34ff20eaf33638f396de7b9aa92`. It neither substitutes a no-op nor fabricates a ledger row. Existing 0108/0110/0131 exclusions are unchanged. Later functional migrations remain executable.

Inventory migration 0132 remains byte-identical with SHA256 `f670704eee1b2bd41393240962b08b0e3237998868a8457fc10cb46ac23276a2` and is required in the observed replay ledger. Tests reject a missing 0132 row and a fabricated 0133 row, plus drift in receipt SQL, tag, timestamp, index, breakpoints, duplicate copies, missing files and staged metadata.

The reviewed canonical Drizzle pin for official commit `2e26308cb6deb37acdc07d96de6d3eafd3fb63bf` is `9f580d5bfd5344aab55f1cec3a2338526b34cd35`. The migration delta contains only 0133, its journal entry and the empty snapshot linking to 0131. Supabase stays at `3e3575f5ff6d509ecdd624ae7fc1772508b5dce6`; earlier sources, including 0132, are unchanged. No canonical migration files are edited by this CI adjustment.

Offline Node tests exercise staging and ledger verification with synthetic fixtures; Python tests exercise source pins and process guards. These checks do not run a database replay or certify production state, ICU availability or wrapper-wide atomicity. This change performs no migration, deployment or business-data write.

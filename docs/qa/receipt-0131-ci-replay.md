# CI replay after activation of 0129/0130

The official runner applied 0129, 0130 and assertion-only receipt 0131. The receipt binds the pre-existing production ledger (130 rows and a SHA256 fingerprint), ICU version and installed objects. It cannot attest a fresh disposable CI database. Production postflight verified 133 ledger rows, the unchanged 130-row prefix, exact source/body hashes, ACLs, collation and trigger. The two existing QA drafts retained their exact row fingerprint. No business writes or frontend publication were part of activation.

The CI adjustment validates and documents the exact 0131 identity (idx 131, timestamp 1794160319241, tag and SHA256 f4126e4b47e9bb7cbefdc4d46c1403cec2eea7ce45f29cd5ed3051a2c1c82dba), then excludes only that receipt from the staged replay. It neither creates a no-op replacement nor fabricates its ledger row. The existing 0108/0110 exclusions remain unchanged. Canonical source files and history stay intact.

0129 and 0130 must still execute byte-for-byte and appear in the observed CI ledger. Tests independently pin their hashes and reject their missing ledger rows. Negative cases reject changed receipt bytes, tag, timestamp, breakpoint flag, duplicate copies and missing files. A separate exact canonical subtree pin prevents truncation or replacement of real repository history; older synthetic histories remain usable by the existing unit tests.

The new canonical Drizzle tree is b5f0f28c31d0a49bf7ceead14faea7dabd6fa246, from official commit 07d2ab34861e8fcda28bbaa3ca7643cfe68a3e56. Delta: 0131, journal entry and empty snapshot linking to 0128. Existing 0129/0130 and Supabase migrations are unchanged. This change does not certify wrapper-wide atomicity, reapply migrations or publish the frontend.

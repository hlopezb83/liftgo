# Explicit equipment SAT choices

The live sale QA could save an intentionally incomplete draft and the backend correctly rejected stamping before claiming it. The UI then could not select equipment product keys or H87 because its small catalog contained services only.

This additive UI patch offers 24101602 (Montacargas), 24101603 (Elevadores forklift), and H87 (Pieza). It preserves every existing option and its order, outside-catalog historical display, empty sale defaults, and all stored values. It does not choose or substitute a fiscal classification, add free-form unverified codes, change stamping/backend logic, or write business data.

Labels checked against GNcys CFDI 4.0 catalog on 2026-11-09:
- https://www.gncys.com/anexo20/4.0/claveprodserv/24101602
- https://www.gncys.com/anexo20/4.0/claveprodserv/24101603
- https://www.gncys.com/anexo20/4.0/claveunidad/H87

The SAT guidance assigns classification responsibility to the issuer based on the actual goods: https://wwwmat.sat.gob.mx/cs/Satellite?blobcol=urldata&blobkey=id&blobtable=MungoBlobs&blobwhere=1461173887930&ssbinary=true (page 5).
The current full SAT catalog download was unavailable; these references do not certify complete November 2026 catalog validity or suitability for a specific machine. The two equipment labels are not treated as interchangeable.

Tests exercise real selectors: opening/dismissing retains blanks, explicit selection updates only the chosen key/unit, and another sale row remains blank. Existing historical display, rent and mixed-source regression coverage remains required. Sandbox issuance is separate QA, not performed by this patch.

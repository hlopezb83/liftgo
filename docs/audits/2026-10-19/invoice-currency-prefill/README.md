# Existing USD invoice: cached prefill regression

Base `6e5d08159f9102a3c6369f29fed5e78c15e7e1c5`. The same four cases run
offline with React Testing Library, happy-dom, React Hook Form and the real
`CfdiFieldsCard`, Radix Select, line-items table, schema/resolver and payload
builder. The harness uses an effect calling the real
`form.reset(buildFromInvoice(existing, undefined))`, as the production prefill
does. It does not mount the complete page or the `useInvoicePrefill` hook.

Only unused mutation hooks are simulated; no save method, network request,
browser, published database, or business transaction runs. Every customer,
identifier, RFC and line in this evidence is synthetic.

- **Before: 2 failed / 2 passed.** When existing invoice data is available on
  mount, reset supplies USD, then the real hidden native Select emits empty
  change events. Form subscriptions show currency becoming empty while TC stays
  17.5. The real payload builder emits `moneda`, `forma_pago` and `metodo_pago`
  as null. RFC, edited legal name, regime, postal code, G03, line and total 100
  remain present. This does not prove the receptor was lost in published QA.
- **After: 4/4 passed.** The exact two product files provided by the coordinator
  preserve USD, 17.5, PPD/99/G03, the edited receptor and unchanged amounts.
  Native empty events still occur, but no longer overwrite the form values.
- The cold-data control (invoice arrives after the form mounts) passes both
  phases. Deliberate native changes USD→MXN (TC 1), PUE→PPD (99, disabled form of
  payment), and EUR with TC 18.5 also pass both phases.

`checks.json` identifies the copied product bytes and normalized LF hashes.
`before.txt` and `after.txt` preserve the final comparable output with local
paths removed. Raw attempts and the Windows-only alias configuration stay in
ignored `.tool-tmp`; an initial Bun runtime import failure was setup-only and is
not counted as a product failure. The final executions use Node 24 and Vitest 4.
Diagnostic comments preserve the assertions; the coordinator integration below records the final test source and its repeated comparison.

The coordinator's two product files were copied temporarily for after execution
and restored to the original base before committing. This commit contains only
the test and evidence. The test directly dispatches form submit to exercise the
real resolver and payload builder; it does not model browser native constraint
validation or assert a published end-to-end save.

## Coordinator integration verification

The final component test imports the application resolver wrapper; it delegates to the same official resolver. An unsupported query typing option was removed without changing the query or assertions. The final test files are identical in both comparison worktrees (hashes in checks.json).

- [coordinator-before.txt](coordinator-before.txt): four failures and five passing controls across the nine final cases. Two failures reproduce cached Select hydration/payload corruption, and two reject empty or whitespace currency with a valid exchange rate.
- [coordinator-after.txt](coordinator-after.txt): the same nine cases pass.
- [coordinator-regression.txt](coordinator-regression.txt): 94 related tests pass in ten files.

The form now ignores empty native change events for its four CFDI selectors, which offer no empty option. Currency must also contain a non-whitespace value before submit. Deliberate currency and payment-method changes keep their existing behavior. No shared Select primitive, SQL, migration, backend default, permission or existing business record was changed.

A blank currency passed the old schema, became null through the payload builder and can be displayed as MXN by the detail fallback. This code/test chain explains the observed QA presentation without claiming the exact stored database value or a captured HTTP request. The fiscal-summary empty message depends on payment method/form fields; it is not evidence that the RFC or legal name was lost.

The Windows-only local config merges vitest.config.ts and overrides the @ alias with resolve("src"); the product and CI config are unchanged. To reproduce on a clean checkout of the base, copy only the two test files from this PR and run them; then run the same files with the two product fixes. Vitest remains offline through src/test/setup.ts.

Resuming the existing fictional QA draft is coordinated privately after publication: verify its identity, restore USD/17.5 and the intended CFDI values, confirm total100/paid0/balance100, save once and reload, then repeat a receiver-only edit. Do not create a replacement draft or infer a published QA pass from these offline tests.

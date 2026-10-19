import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// Published inputs are prepared; verify sanitized sources without private captures.
const directory=resolve('docs/audits/2026-10-18/payment-server-policy');
const source=JSON.parse(readFileSync(resolve(directory,'source-functions.json'),'utf8'));
const derived=JSON.parse(readFileSync(resolve(directory,'source-derived-function.json'),'utf8'));
const known=[...source.catalog.rows[0].metadata.functions,...source.dependencies.rows[0].metadata.functions,...derived.result.rows];
const baseline=JSON.parse(readFileSync(resolve(directory,'guard-tests/baseline/preflight-function-metadata.json'),'utf8'));
for(const entry of baseline.functions){if(known.find(f=>f.name===entry.name)?.definition!==entry.definition)throw new Error(`Function source differs: ${entry.name}`);}
for(const name of ['fixture-schema.sql','extracted-functions.sql','current-catalog-functions.sql','installed-triggers.sql','invoice-integrity-trigger.sql','projected-balance-view.sql'])readFileSync(resolve(directory,'guard-tests/baseline',name));
console.log('Prepared synthetic baseline verified against sanitized function sources; no database connection.');
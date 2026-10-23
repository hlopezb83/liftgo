import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
export const SHARD_COUNT = 6;
const vitestVersion = require('vitest/package.json').version;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export function runIdentity(env = process.env) {
  const identity = {
    repository: env.GITHUB_REPOSITORY,
    runId: env.GITHUB_RUN_ID,
    runAttempt: env.GITHUB_RUN_ATTEMPT,
    commit: env.GITHUB_SHA,
    vitestVersion,
  };
  if (!/^[\w.-]+\/[\w.-]+$/.test(identity.repository ?? '')
    || !/^[1-9]\d*$/.test(identity.runId ?? '')
    || !/^[1-9]\d*$/.test(identity.runAttempt ?? '')
    || !/^[a-f0-9]{40}$/.test(identity.commit ?? '')) throw new Error('Missing or invalid GitHub run identity');
  return identity;
}

function assertDirectory(directory) {
  if (!fs.lstatSync(directory).isDirectory()) throw new Error(`Expected a real directory, not a symlink: ${directory}`);
}
function exactEntries(directory, expected) {
  assertDirectory(directory);
  const actual = fs.readdirSync(directory).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expected].sort())) throw new Error(`Unexpected entries in ${directory}: expected ${expected.join(', ')}; received ${actual.join(', ')}`);
}
function readRegularFile(filename) {
  if (!fs.lstatSync(filename).isFile()) throw new Error(`Expected a regular file, not a symlink: ${filename}`);
  return fs.readFileSync(filename);
}
function assertShard(shard) {
  if (!Number.isInteger(shard) || shard < 1 || shard > SHARD_COUNT) throw new Error(`Invalid shard index: ${shard}`);
}

// Seal only the single report generated in this shard's freshly created directory.
// This is provenance/integrity metadata, not a claim of measured coverage.
export function sealShard(directory, shard, identity = runIdentity()) {
  assertShard(shard);
  exactEntries(directory, ['blob.json']);
  const bytes = readRegularFile(path.join(directory, 'blob.json'));
  if (!bytes.length) throw new Error('Empty Vitest blob');
  const manifest = { schema: 1, ...identity, shard, shardCount: SHARD_COUNT, blob: 'blob.json', sha256: digest(bytes) };
  fs.writeFileSync(path.join(directory, 'provenance.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  return manifest;
}

// Fail closed before copying any bytes. Vitest receives only six blobs, never
// manifests, checkout files, extra artifacts or reports from a prior attempt.
export function prepareMerge(downloadDirectory, outputDirectory, identity = runIdentity()) {
  const names = Array.from({ length: SHARD_COUNT }, (_, i) => `shard-${i + 1}`);
  exactEntries(downloadDirectory, names);
  exactEntries(outputDirectory, []);
  const reports = names.map((name, index) => {
    const directory = path.join(downloadDirectory, name);
    exactEntries(directory, ['blob.json', 'provenance.json']);
    const manifest = JSON.parse(readRegularFile(path.join(directory, 'provenance.json')).toString('utf8'));
    const bytes = readRegularFile(path.join(directory, 'blob.json'));
    const expected = { schema: 1, ...identity, shard: index + 1, shardCount: SHARD_COUNT, blob: 'blob.json', sha256: digest(bytes) };
    if (!bytes.length || Object.keys(manifest).length !== Object.keys(expected).length
      || Object.entries(expected).some(([key, value]) => manifest[key] !== value)) throw new Error(`Invalid provenance or blob digest for ${name}`);
    return { name: `blob-${index + 1}-${SHARD_COUNT}.json`, bytes };
  });
  for (const report of reports) fs.writeFileSync(path.join(outputDirectory, report.name), report.bytes, { flag: 'wx' });
  exactEntries(outputDirectory, reports.map(report => report.name));
  return reports.map(report => report.name);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [command, directory, argument] = process.argv.slice(2);
  try {
    if (!directory || !argument) throw new Error('Usage: vitest-blob-provenance.mjs seal <shard-dir> <index> | merge <downloads-dir> <clean-output-dir>');
    if (command === 'seal') {
      sealShard(directory, Number(argument));
      console.log(`Verified one current-run blob for shard ${argument}/${SHARD_COUNT}.`);
    } else if (command === 'merge') {
      const reports = prepareMerge(directory, argument);
      console.log(`Verified exactly ${reports.length} current-run blobs before Vitest merge.`);
    } else throw new Error(`Unknown command: ${command}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

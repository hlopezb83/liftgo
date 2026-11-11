import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.RUN_LOCAL_QUOTES_TESTS !== '1') throw new Error('Opt in with RUN_LOCAL_QUOTES_TESTS=1. This launcher owns a fresh synthetic cluster.');
if (process.env.QUOTES_TEST_DB_URL || process.env.QUOTES_TEST_PORT || process.env.QUOTES_TEST_CLUSTER) throw new Error('An existing database/port/cluster cannot be supplied.');
const bin = process.env.PG_BIN;
if (!bin || !path.isAbsolute(bin)) throw new Error('PG_BIN must name trusted PostgreSQL binaries.');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const directory = mkdtempSync(path.join(os.tmpdir(), 'liftgo-quotes-pg-'));
const server = net.createServer();
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const port = server.address().port;
await new Promise(resolve => server.close(resolve));
const pg = (name, args) => execFileSync(path.join(bin, name), args, {
  stdio: ['ignore', 'inherit', 'inherit'], timeout: 45000, windowsHide: true,
});
let started = false;
try {
  pg('initdb', ['-D', path.join(directory, 'data'), '-U', 'postgres', '--auth=trust', '--no-locale', '--encoding=UTF8']);
  pg('pg_ctl', ['-D', path.join(directory, 'data'), '-l', path.join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -c unix_socket_directories= -c jit=off`, 'start']);
  started = true;
  execFileSync(process.execPath, ['scripts/tests/quotes/quotes-page.integration.mjs'], {
    cwd: root, stdio: 'inherit', timeout: 180000,
    env: { ...process.env, QUOTES_TEST_PORT: String(port), QUOTES_TEST_CLUSTER: directory },
  });
} finally {
  if (started || existsSync(path.join(directory, 'data', 'postmaster.pid'))) pg('pg_ctl', ['-D', path.join(directory, 'data'), '-m', 'immediate', 'stop']);
  console.log(`Disposable quote cluster stopped. Diagnostics: ${directory}`);
}

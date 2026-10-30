'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { createRequire } = require('node:module');
const { before, after, mock, test } = require('node:test');
const postgresFactory = require('../lib/postgres-factory.cjs');

const root = path.resolve(__dirname, '../..');
const dependencyRoot = process.env.LIFTGO_OFFLINE_DEPENDENCIES || root;
const installedRequire = createRequire(path.join(dependencyRoot, 'package.json'));
const sessionFile = installedRequire.resolve('drizzle-orm/postgres-js/session');
const driverFile = path.join(path.dirname(sessionFile), 'driver.cjs');
const driverRequire = createRequire(driverFile);
let PostgresJsSession, PgDialect, sql, DrizzleQueryError;

before(() => {
  mock.method(net.Socket.prototype, 'connect', () => { throw new Error('Network forbidden in offline Postgres contracts'); });
  assert.equal(JSON.parse(fs.readFileSync(path.join(path.dirname(sessionFile), '../package.json'))).version, '0.45.4');
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'bun.lock'), 'utf8').replace(/,(\s*[}\]])/g, '$1'));
  assert.equal(lock.packages.postgres[0], 'postgres@3.4.9');
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).devDependencies.postgres, '^3.4.9');
  ({ PostgresJsSession } = installedRequire('drizzle-orm/postgres-js/session'));
  ({ PgDialect } = installedRequire('drizzle-orm/pg-core/dialect'));
  ({ sql } = installedRequire('drizzle-orm/sql'));
  ({ DrizzleQueryError } = installedRequire('drizzle-orm/errors'));
});
after(() => mock.restoreAll());

function client(label = 'root', failure) {
  const calls = [];
  const objects = [{ label, value: '42' }];
  const arrays = [[label, '42']];
  return {
    calls, objects, arrays, options: { parsers: {}, serializers: {} },
    unsafe(query, params, options) {
      calls.push({ query, params, options });
      const result = values => failure ? Promise.reject(failure) : Promise.resolve(values);
      return {
        then(resolve, reject) { return result(objects).then(resolve, reject); },
        values() { calls.push('values'); return result(arrays); },
      };
    },
  };
}
function session(fake) { return new PostgresJsSession(fake, new PgDialect(), undefined); }
function driver(postgresImport) {
  const module = { exports: {} };
  const evaluate = new Function('require', 'module', 'exports', fs.readFileSync(driverFile, 'utf8'));
  // Execute the installed Drizzle driver, shimming only its postgres import.
  evaluate(name => name === 'postgres' ? postgresImport : driverRequire(name), module, module.exports);
  return module.exports;
}

test('v3 factory identity and attached helpers survive without eager client creation', t => {
  t.diagnostic(`process.version=${process.version}; postgres.lock=3.4.9; drizzle=0.45.4; postgresRuntime=NOT_LOADED; postgres4=NOT_LOADED; DB=NOT_RUN`);
  let calls = 0;
  const result = Object.freeze({ synthetic: true });
  const factory = () => { calls++; return result; };
  factory.helper = Symbol('synthetic-helper');
  assert.equal(postgresFactory(factory), factory);
  assert.equal(calls, 0);
  assert.equal(postgresFactory(factory).helper, factory.helper);
  assert.equal(postgresFactory(factory)(), result);
  assert.equal(calls, 1);
});

test('modeled v4 namespace resolves its default factory and preserves call arguments', () => {
  const options = Object.freeze({ max: 1, prepare: false });
  const result = Object.freeze({ synthetic: true });
  const factory = actual => { assert.equal(actual, options); return result; };
  const namespace = Object.freeze(Object.assign(Object.create(null), { default: factory }));
  assert.equal(postgresFactory(namespace), factory);
  assert.equal(postgresFactory(namespace)(options), result);
});

test('invalid export shapes fail before a client can be constructed', () => {
  const factory = () => { throw new Error('Unexpected factory call'); };
  for (const value of [null, undefined, false, 1, 'postgres', [], {}, { default: null },
    { default: {} }, { default: { default: factory } }, Object.create({ default: factory })]) {
    assert.throws(() => postgresFactory(value), TypeError);
  }
});

test('all five CJS integration entry points resolve the shared helper without executing their bodies', () => {
  const files = [
    ['scripts/tests/recurring-invoice-locking.test.cjs', '../lib/postgres-factory.cjs'],
    ['scripts/test-invoice-settlement-reconciliation.cjs', './lib/postgres-factory.cjs'],
    ['scripts/tests/reports/income-statement-documents.cjs', '../../lib/postgres-factory.cjs'],
    ['scripts/tests/reports/income-statement-calculations.cjs', '../../lib/postgres-factory.cjs'],
    ['scripts/tests/operations/run-completed-recurring-lifecycle.cjs', '../../lib/postgres-factory.cjs'],
  ];
  for (const [relative, helper] of files) {
    const file = path.join(root, relative);
    assert.ok(fs.readFileSync(file, 'utf8').includes(`require(${JSON.stringify(helper)})`)
      || fs.readFileSync(file, 'utf8').includes(`require('${helper}')`));
    assert.equal(createRequire(file)(helper), postgresFactory);
  }
});

test('installed Drizzle driver mutates only its expected parser/serializer slots on an injected client', () => {
  const fake = client();
  const retained = value => value;
  fake.options.parsers.extra = fake.options.serializers.extra = retained;
  const db = driver(() => { throw new Error('Unexpected client construction'); }).drizzle({ client: fake });
  assert.equal(db.$client, fake);
  const dateOids = ['1184', '1082', '1083', '1114', '1182', '1185', '1115', '1231'];
  assert.deepEqual(Object.keys(fake.options.parsers).sort(), [...dateOids, 'extra'].sort());
  assert.deepEqual(Object.keys(fake.options.serializers).sort(), [...dateOids, '114', '3802', 'extra'].sort());
  for (const oid of dateOids) {
    assert.equal(fake.options.parsers[oid]('offline-value'), 'offline-value');
    assert.equal(fake.options.serializers[oid]('offline-value'), 'offline-value');
  }
  assert.equal(fake.options.parsers.extra, retained);
  assert.equal(fake.options.serializers.extra, retained);
});

test('installed Drizzle CJS connection constructor is not safe for a modeled ESM namespace', () => {
  const fake = client();
  let constructed = 0;
  const factory = () => { constructed++; return fake; };
  assert.equal(driver(factory).drizzle('OFFLINE_CONNECTION').$client, fake);
  constructed = 0;
  const namespace = Object.freeze(Object.assign(Object.create(null), { default: factory }));
  const cjs = driver(namespace);
  assert.throws(() => cjs.drizzle('OFFLINE_CONNECTION'), TypeError);
  assert.equal(constructed, 0);
  assert.equal(cjs.drizzle({ client: fake }).$client, fake);
});

test('Drizzle query arrays and objects retain results and parameters through the actual session', async () => {
  const fake = client();
  const params = [42];
  const actual = session(fake);
  assert.equal(await actual.query('OFFLINE_ARRAYS', params), fake.arrays);
  assert.equal(await actual.queryObjects('OFFLINE_OBJECTS', params), fake.objects);
  assert.deepEqual(fake.calls, [
    { query: 'OFFLINE_ARRAYS', params, options: undefined }, 'values',
    { query: 'OFFLINE_OBJECTS', params, options: undefined },
  ]);
});

test('Drizzle prepared queries preserve flags, placeholder substitution and custom array mapping', async () => {
  const fake = client();
  const actual = session(fake);
  const prepared = actual.prepareQuery({ sql: 'OFFLINE_MAPPED', params: [sql.placeholder('item')] }, undefined,
    'offline-prepared', true, rows => rows.map(([label, value]) => ({ label, value })));
  assert.deepEqual(await prepared.execute({ item: 7 }), [{ label: 'root', value: '42' }]);
  assert.deepEqual(fake.calls[0], { query: 'OFFLINE_MAPPED', params: [7], options: { prepare: true } });
  const date = new Date('2026-10-30T00:00:00.000Z');
  const unprepared = actual.prepareQuery({ sql: 'OFFLINE_UNPREPARED', params: [date] }, undefined, undefined, false);
  assert.equal(await unprepared.execute(), fake.objects);
  assert.deepEqual(fake.calls[2], { query: 'OFFLINE_UNPREPARED', params: [date], options: { prepare: false } });
  assert.equal(fake.calls[2].params[0], date, 'this checks pre-wire forwarding, not date serialization');
});

test('Drizzle direct errors propagate and prepared errors preserve their exact cause', async () => {
  const failure = Object.assign(new Error('offline expected failure'), { code: 'OFFLINE_ERROR' });
  const actual = session(client('failed', failure));
  await assert.rejects(actual.query('OFFLINE_DIRECT_ERROR', []), error => error === failure);
  const prepared = actual.prepareQuery({ sql: 'OFFLINE_PREPARED_ERROR', params: [] }, undefined, undefined, false);
  await assert.rejects(prepared.execute(), error => error instanceof DrizzleQueryError && error.cause === failure);
});

test('Drizzle begin/savepoint callbacks use scoped clients and retain return values and rejections', async () => {
  const events = [];
  const rootClient = client('root'), transactionClient = client('transaction'), nestedClient = client('savepoint');
  rootClient.begin = async callback => { events.push('begin'); return callback(transactionClient); };
  transactionClient.savepoint = async callback => { events.push('savepoint'); return callback(nestedClient); };
  const actual = session(rootClient);
  const result = await actual.transaction(async transaction => {
    assert.equal(await transaction.execute(sql.raw('OFFLINE_TRANSACTION')), transactionClient.objects);
    return transaction.transaction(async nested => {
      assert.equal(await nested.execute(sql.raw('OFFLINE_SAVEPOINT')), nestedClient.objects);
      return 'offline-result';
    });
  });
  assert.equal(result, 'offline-result');
  assert.deepEqual(events, ['begin', 'savepoint']);
  assert.equal(rootClient.calls.length, 0);
  assert.equal(transactionClient.calls[0].query, 'OFFLINE_TRANSACTION');
  assert.equal(nestedClient.calls[0].query, 'OFFLINE_SAVEPOINT');
  const failure = new Error('offline nested rejection');
  await assert.rejects(actual.transaction(transaction => transaction.transaction(() => Promise.reject(failure))), error => error === failure);
});

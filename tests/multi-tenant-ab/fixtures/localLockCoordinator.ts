import { expect } from "@playwright/test";
import postgres from "postgres";
import { assertLocalEphemeralBackend } from "./localBackend";

function localDatabaseUrl(): string {
  assertLocalEphemeralBackend("dispatcher concurrency lock coordinator");
  const value = process.env.DB_URL;
  if (!value) throw new Error("[ab-locks] DB_URL local is required");
  let target: URL;
  try { target = new URL(value); }
  catch { throw new Error("[ab-locks] invalid local database URL"); }
  if (target.protocol !== "postgresql:" || target.hostname !== "127.0.0.1"
    || target.port !== "54322" || target.pathname !== "/postgres" || target.username !== "postgres") {
    throw new Error("[ab-locks] coordinator is limited to the existing loopback ephemeral PostgreSQL");
  }
  return value;
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<T>((accept, decline) => { resolve = accept; reject = decline; });
  return { promise, resolve, reject };
}

/**
 * The owner connection ONLY holds a row lock and observes blocked sessions.
 * Every business operation remains a normal authenticated PostgREST request.
 * There are no writes, JWT/GUC impersonation, test triggers or new RPCs here.
 */
export async function withLocalRowLock<T>(
  table: "bookings" | "invoices",
  id: string,
  organizationId: string,
  run: (coordinator: { release: () => void; waitForBlocked: (queryFragment: string) => Promise<void> }) => Promise<T>,
): Promise<T> {
  const url = localDatabaseUrl();
  const holder = postgres(url, { max: 1, connect_timeout: 10, onnotice: () => {} });
  const observer = postgres(url, { max: 1, connect_timeout: 10, onnotice: () => {} });
  const locked = deferred<number>();
  const released = deferred<void>();
  const holding = holder.begin(async (tx) => {
    await tx`SET LOCAL lock_timeout = '10s'`;
    const rows = await tx`SELECT id FROM ${tx(`public.${table}`)}
      WHERE id = ${id}::uuid AND organization_id = ${organizationId}::uuid FOR UPDATE`;
    expect(rows, "coordinator locks exactly the synthetic owned row").toHaveLength(1);
    const [backend] = await tx<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
    locked.resolve(backend.pid);
    await released.promise;
  });
  // Attach immediately so a startup failure cannot become an unhandled reject.
  void holding.catch(locked.reject);
  try {
    const holderPid = await locked.promise;
    return await run({
      release: () => released.resolve(),
      waitForBlocked: async (fragment) => {
        await expect.poll(async () => {
          const rows = await observer<{ pid: number }[]>`
            WITH RECURSIVE waiting AS (
              SELECT pid, query, pg_blocking_pids(pid) AS blockers
              FROM pg_stat_activity WHERE wait_event_type = 'Lock'
            ), chain AS (
              SELECT pid, query FROM waiting WHERE ${holderPid} = ANY(blockers)
              UNION
              SELECT w.pid, w.query FROM waiting w JOIN chain c ON c.pid = ANY(w.blockers)
            ) SELECT pid FROM chain WHERE query LIKE ${`%${fragment}%`}`;
          return rows.length;
        }, { timeout: 10_000, intervals: [25, 50, 100], message: `authenticated ${fragment} request waits behind coordinator` }).toBeGreaterThan(0);
      },
    });
  } finally {
    released.resolve();
    try { await holding; }
    finally { await Promise.all([holder.end(), observer.end()]); }
  }
}

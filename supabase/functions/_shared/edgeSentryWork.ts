/** A context provider may fail before or after starting work; its failure never retries work. */
export async function runObservedWork<T>(
  observe: (start: () => Promise<T>) => Promise<T>,
  work: () => T | Promise<T>,
  fallback: () => T | Promise<T> = work,
): Promise<T> {
  let task: Promise<T> | undefined;
  const start = (action: () => T | Promise<T>) =>
    task ??= Promise.resolve().then(action);
  try {
    // Do not wait for SDK cleanup instead of the already-started business task.
    const observation = observe(() => start(work));
    void Promise.resolve(observation).catch(() => undefined);
  } catch {
    /* The original task, if started, remains the authoritative result. */
  }
  return await (task ?? start(fallback));
}

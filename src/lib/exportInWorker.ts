export type ExportReply<T> = { value: T } | { error: string };

export function exportInWorker<Input, Output>(createWorker: () => Worker, input: Input): Promise<Output | undefined> {
  if (typeof window === "undefined" || typeof Worker === "undefined") return Promise.resolve(undefined);

  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = createWorker();
    } catch {
      resolve(undefined);
      return;
    }
    const fallback = () => {
      worker.terminate();
      resolve(undefined);
    };
    worker.onmessage = ({ data }: MessageEvent<ExportReply<Output>>) => {
      worker.terminate();
      if ("error" in data) reject(new Error(data.error));
      else resolve(data.value);
    };
    worker.onerror = (event) => { event.preventDefault(); fallback(); };
    worker.onmessageerror = fallback;
    try {
      worker.postMessage(input);
    } catch {
      fallback();
    }
  });
}

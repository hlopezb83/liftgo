export const SUPPORT_REQUEST_TIMEOUT_MS = 15_000;

export class SupportRequestTimeout extends Error {
  readonly code = "SUPPORT_REQUEST_TIMEOUT";
  constructor() {
    super("La solicitud tardó demasiado y no se confirmó el resultado. Actualiza el caso antes de repetir.");
    this.name = "SupportRequestTimeout";
  }
}

/** Abort the transport and release the UI; a timeout does not prove a rollback. */
export async function withSupportRequest<T>(run: (signal: AbortSignal) => Promise<T>, parentSignal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const cancel = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) cancel();
  else parentSignal?.addEventListener("abort", cancel, { once: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new SupportRequestTimeout();
      reject(error);
      controller.abort(error);
    }, SUPPORT_REQUEST_TIMEOUT_MS);
  });
  try {
    return await Promise.race([Promise.resolve().then(() => run(controller.signal)), deadline]);
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", cancel);
  }
}

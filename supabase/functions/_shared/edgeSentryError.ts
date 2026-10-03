/** El estado de la respuesta prevalece sobre un status adjunto al error. */
export function expectedEdgeFailure(
  error: unknown,
  responseStatus?: number,
): boolean {
  const suppliedStatus =
    Number.isInteger(responseStatus) && responseStatus! >= 100 &&
      responseStatus! <= 599
      ? responseStatus
      : undefined;
  const status = suppliedStatus ??
    (error && typeof error === "object"
      ? Object.getOwnPropertyDescriptor(error, "status")?.value
      : undefined);
  return typeof status === "number" && Number.isInteger(status) &&
    status >= 400 && status < 500;
}

/** No reutilizar el objeto que el SDK marca como capturado ni copiar sus datos. */
export function edgeException(error: unknown): Error {
  const exception = new Error("Cloud operation failed");
  if (error instanceof Error) {
    const name = dataProperty(error, "name");
    const message = dataProperty(error, "message");
    const descriptor = Object.getOwnPropertyDescriptor(error, "stack");
    // V8/Deno presenta el stack nativo como accesor. Sólo se permite ese getter
    // conocido cuando no podría evaluar name/message personalizados.
    const stack = typeof descriptor?.value === "string"
      ? descriptor.value
      : descriptor?.get && descriptor.get === NATIVE_STACK_GETTER &&
          name.safe && message.safe
      ? descriptor.get.call(error)
      : undefined;
    if (typeof stack === "string") exception.stack = stack.slice(0, 16384);
    if (typeof name.value === "string") exception.name = name.value;
  }
  return exception;
}

const NATIVE_STACK_GETTER = Object.getOwnPropertyDescriptor(
  new Error(),
  "stack",
)?.get;

function dataProperty(
  object: object,
  key: string,
): { safe: boolean; value?: unknown } {
  for (
    let current: object | null = object;
    current;
    current = Object.getPrototypeOf(current)
  ) {
    const descriptor = Object.getOwnPropertyDescriptor(current, key);
    if (descriptor) {
      return { safe: "value" in descriptor, value: descriptor.value };
    }
  }
  return { safe: true };
}

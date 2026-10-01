type Guards = typeof import("./server/adminGuards.server");

/** Traduce el error SQL de las funciones `platform_*` a un HttpError estable. */
export function rpcError(
  g: Guards,
  context: string,
  error: { message: string; code?: string },
): never {
  const msg = error.message ?? "";
  console.error(`[platform-admin] ${context}:`, error.code ?? "");
  if (/Completa el alta pendiente/i.test(msg)) throw new g.HttpError(409, msg);
  if (error.code === "42501" || /Forbidden|operador de plataforma/i.test(msg)) {
    throw new g.HttpError(
      403,
      "Forbidden: se requiere un operador de plataforma",
    );
  }
  if (
    error.code === "23505" ||
    /Ya existe|ya tiene administradores|ya pertenece/i.test(msg)
  ) {
    throw new g.HttpError(409, msg || "Conflicto con un registro existente");
  }
  if (error.code === "22023") {
    throw new g.HttpError(400, msg || "Datos inválidos");
  }
  if (error.code === "P0002" || /no encontrad/i.test(msg)) {
    throw new g.HttpError(404, msg || "Registro no encontrado");
  }
  throw new g.HttpError(500, "No se pudo completar la operación de plataforma");
}

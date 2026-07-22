// Validación pura para el formulario de operadores. Se extrae para permitir
// tests unitarios sin montar el diálogo completo (evita RTL + react-hook-form
// para un flujo trivial).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface DriverFormValues {
  name: string;
  email: string;
}

export type DriverFormError =
  | { field: "name"; message: "El nombre es requerido" }
  | { field: "email"; message: "Correo inválido" };

export function validateDriverForm(form: DriverFormValues): DriverFormError | null {
  if (!form.name.trim()) return { field: "name", message: "El nombre es requerido" };
  if (form.email && !EMAIL_RE.test(form.email)) return { field: "email", message: "Correo inválido" };
  return null;
}

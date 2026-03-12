

## Código sin uso encontrado

Tras revisar las referencias de cada componente y hook, encontré los siguientes archivos que ya no se importan ni usan en ninguna parte de la aplicación:

### Componentes sin uso
1. **`src/components/EquipmentModelSelector.tsx`** — No se importa en ningún archivo. Probablemente reemplazado por un selector inline.
2. **`src/components/PostInspectionInvoiceDialog.tsx`** — Se eliminó del flujo de devoluciones (registrado en changelog v2.17.0) pero el archivo nunca se borró.

### Hooks sin uso
3. **`src/hooks/useDialogState.ts`** — Se creó como parte de una refactorización pero nunca se adoptó en ningún componente.

### Plan
- Eliminar los 3 archivos listados.
- Registrar v3.38.4 en `src/lib/changelog.ts`.

No se requieren cambios en ningún otro archivo ya que ninguno los referencia.



## Plan: Alerta de Póliza Faltante al Crear Reserva (v3.17.11)

### Resumen
Agregar un paso adicional al flujo post-reserva que detecte si el montacargas rentado no tiene una póliza de mantenimiento activa y ofrezca crearla inmediatamente.

### Flujo propuesto
```text
Crear Reserva
  └─► PostBookingDeliveryDialog (existente)
        └─► onSkip/onComplete
              └─► ¿Montacargas sin póliza activa?
                    ├─► SÍ → PostBookingPolicyDialog (nuevo)
                    │         ├─► "Crear Póliza" → formulario inline
                    │         └─► "Omitir" → continuar
                    └─► NO → continuar a calendario
```

### Cambios

**1. Nuevo componente `PostBookingPolicyDialog.tsx`**
- Props: `forkliftId`, `forkliftName`, `open`, `onOpenChange`, `onSkip`
- Formulario inline con: proveedor, costo mensual, tipo de servicio, descripción
- Usa `useCreateMaintenancePolicy` existente
- Estilo similar a `PostBookingDeliveryDialog`

**2. Actualizar `BookingForm.tsx`**
- Agregar estado para verificar si el montacargas tiene póliza
- Usar query de `useMaintenancePolicies` para verificar existencia
- Encadenar diálogos: Delivery → Policy (si aplica) → Navegar

**3. `src/lib/changelog.ts`** — v3.17.11

### Lógica de detección
```typescript
// En BookingForm después de crear reserva:
const hasPolicy = policies?.some(
  p => p.forklift_id === forkliftId && p.is_active
);
// Si !hasPolicy → mostrar PostBookingPolicyDialog
```

### Notas
- El flujo es opcional: el usuario puede omitir la creación de póliza
- Solo aplica cuando el montacargas no tiene póliza activa
- El diálogo es reutilizable para otros contextos (ej. detalle de montacargas)

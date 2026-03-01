
## Agregar mobile cards en las paginas restantes

Tres paginas necesitan ajustes para tener vista mobile con tarjetas:

### 1. DamageTrackingPage.tsx
- Agregar `useIsMobile`, `MobileCardList`, y `Card/CardContent` imports
- Crear bloque `mobileContent` con `MobileCardList` que muestre: fecha, montacargas, cliente, descripcion truncada, costo estimado, estado (StatusBadge), y acciones (DamageActions)
- Pasar `customContent={mobileContent}` a `ListPageLayout`

### 2. AuditTrailPage.tsx
- Agregar `useIsMobile`, `MobileCardList`, y `Card/CardContent` imports
- Crear bloque `mobileContent` con `MobileCardList` mostrando: icono de accion + badge, tabla traducida, registro (getRecordLabel), campos modificados, usuario, timestamp
- Incluir boton de eliminar para admin en cada tarjeta
- Pasar `customContent={mobileContent}` a `ListPageLayout`

### 3. UserManagementPage.tsx
- Reemplazar el bloque manual `isMobile ? (div > map > Card)` (lineas 273-308) con `MobileCardList`
- Usar `keyExtractor={(u) => u.user_id}` y `emptyMessage="No hay usuarios"`
- El contenido de cada tarjeta permanece igual (nombre, fecha, selector de rol, botones editar/eliminar)

### Archivos modificados
- `src/pages/DamageTrackingPage.tsx` -- agregar mobileContent nuevo
- `src/pages/AuditTrailPage.tsx` -- agregar mobileContent nuevo
- `src/pages/UserManagementPage.tsx` -- reemplazar bloque manual con MobileCardList

### Nota
`ActivityPage.tsx` ya usa tarjetas en ambas vistas (mobile y desktop), no requiere cambios.

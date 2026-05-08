# Mover "Datos Fiscales" dentro de Configuración

Hoy en el sidebar hay dos entradas separadas:

- **Configuración** → `/settings/operations` (pestañas: Modelos, Operadores, Mecánicos, Pólizas, Plantilla de Contrato)
- **Datos Fiscales** → `/settings/company` (formulario fiscal CFDI + logo + Configuración PAC)

El logo de la empresa ya se sube desde Datos Fiscales (componente `LogoUploader` dentro de `CompanyFiscalForm`), así que al mover esa página a una pestaña, el logo viaja con ella sin código nuevo.

## Cambios

### 1. `src/pages/OperationsSetupPage.tsx`

Agregar una pestaña nueva **"Datos Fiscales"** (icono `Building2`) que renderiza el contenido actual de `CompanySettingsPage` (formulario fiscal + logo + PAC). Protegerla con `RoleGuard module="Configuración" minAccess="full"` igual que las otras pestañas sensibles.

Para evitar duplicar lógica, extraer el cuerpo de `CompanySettingsPage` (el `<form>` con `CompanyFiscalForm` + `PacConfigForm`) a un componente reutilizable `src/components/company-settings/CompanySettingsForm.tsx`. Tanto la pestaña nueva como la página antigua lo consumen.

### 2. `src/components/AppSidebar.tsx`

- Eliminar la entrada `{ title: "Datos Fiscales", url: "/settings/company", icon: Building2 }` del grupo Administración.
- Quitar import `Building2` si ya no se usa en otro lado.

### 3. `src/lib/routes-config.tsx`

Mantener la ruta `/settings/company` activa por compatibilidad (links viejos, marcadores) — sigue funcionando, solo desaparece del sidebar. Sin cambios aquí.

### 4. Changelog

Entrada `v5.65.1` (patch — reorganización UI sin cambio funcional) en `public/changelog.json` + `public/changelog/v5.65.1.json`.

## Resultado

Sidebar después:

```text
Administración
  └─ Configuración  ──┐
                      ├─ Modelos de Equipo
                      ├─ Operadores
                      ├─ Mecánicos
                      ├─ Pólizas de Mantenimiento
                      ├─ Plantilla de Contrato
                      └─ Datos Fiscales (incluye logo + CFDI + PAC)
```

## Archivos a tocar

- `src/components/company-settings/CompanySettingsForm.tsx` (nuevo, extracción)
- `src/pages/CompanySettingsPage.tsx` (consume el nuevo componente)
- `src/pages/OperationsSetupPage.tsx` (nueva pestaña)
- `src/components/AppSidebar.tsx` (quitar entrada)
- `public/changelog.json` + `public/changelog/v5.65.1.json`

haz un pestana separada para el logo
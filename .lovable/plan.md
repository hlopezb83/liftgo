## Objetivo
Ajustar el `SidebarBranding` para que el logo quede centrado horizontalmente y el nombre de la empresa se muestre debajo del logo, en lugar de a la derecha.

## Cambios propuestos

### 1. `src/layouts/sidebar/SidebarBranding.tsx`
- Cambiar el layout interno de `flex-row` a `flex-col items-center text-center`.
- Mantener el contenedor blanco con bordes redondeados para el logo.
- Aändo colocar el nombre de la empresa (`razonSocial` o "Lift Go") debajo del logo, con el subtítulo "Montacargas" justo abajo.
- Preservar el fallback "LG" cuando no hay logo.
- Ajustar espaciado y tipografía para que se vea equilibrado dentro del `SidebarHeader`.

### 2. Changelog
- Agregar entrada `v7.61.4` en `public/changelog.json` y crear `public/changelog/v7.61.4.json` describiendo el ajuste visual del sidebar.

## Diagrama del layout resultante

```text
+--------------------------------+
|          SidebarHeader           |
|                                |
|         [ LOGO / LG ]          |
|                                |
|      Nombre de la empresa      |
|         Montacargas            |
|                                |
+--------------------------------+
```

## Verificación
- Captura de pantalla del sidebar en el preview para confirmar que el logo y el nombre están centrados y legibles.
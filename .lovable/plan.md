
# Hacer mas visible el enlace al Portal de Clientes

## Problema actual

En la pagina de login (`AuthPage.tsx`), el enlace al portal de clientes es una linea pequena de texto al final del formulario:

```
"¿Eres cliente? Ingresa al Portal de Clientes"
```

Es facil de pasar por alto porque usa texto `text-xs text-muted-foreground` (gris, muy pequeno).

## Solucion propuesta

Reemplazar el texto pequeno por un **boton secundario visible** con icono, separado visualmente del formulario principal mediante un divisor. El resultado sera:

```
─────── o ───────
[icono] Portal de Clientes
```

### Cambios concretos

**Archivo: `src/pages/AuthPage.tsx`**

Reemplazar el parrafo pequeno del final por:

1. Un **separador visual** con texto "o" (patron comun en paginas de login)
2. Un **boton outline de ancho completo** con el icono `ExternalLink` que navegue a `/portal/login`

Esto lo hace inmediatamente reconocible como una accion alternativa, sin competir con el boton principal de inicio de sesion.

**Archivo: `src/pages/portal/PortalLogin.tsx`**

Aplicar el mismo tratamiento al enlace inverso ("¿Eres empleado?") para mantener consistencia entre ambas paginas de login.

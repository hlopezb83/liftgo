# Smoke público: reconocer el script de hosting `/__l5e/events.270c78a44fc53e7b.js`

## Verificación hecha (sólo lectura, 2026-10-31)
- El HTML actual de https://liftgo.lovable.app incluye una sola referencia `/__l5e/`: `/__l5e/events.270c78a44fc53e7b.js`.
- Esa URL responde 200, `application/javascript`, `immutable`, servida por Cloudflare. Pesa 29,187 bytes, SHA256 `9005204863a3d003ce0c18bbbe50df0f4d246587e4d19a0d18de980479c61238`.
- La URL anterior `/__l5e/events.59f10ad6d72ea62d.js` todavía responde con bytes idénticos (mismo SHA256, `no-store`). Las dos versiones funcionan exactamente igual porque son el mismo archivo.
- El contenido es el SDK de eventos de Lovable: usa `__lovableEvents` y los eventos `lovable.page_viewed`, `client_error` y `replay_error`, y excluye las rutas `/__l5e/`. No se ejecutó.

## Límites
- La procedencia se basa en tres pruebas: el mismo dominio, una ruta reservada que no existe en el repositorio y un contenido idéntico al de la identidad anterior. No hay firma criptográfica ni un manifiesto oficial de Lovable que publique este hash.
- El nombre del archivo puede cambiar sin aviso. Que hoy aparezca en el HTML no garantiza que siga ahí mañana.

## Cambio propuesto (sólo en las pruebas, cuando se apruebe)
- Reconocer como ruido de hosting sólo la URL literal `/__l5e/events.270c78a44fc53e7b.js`. Opcionalmente, fijar también el SHA256 de arriba.
- Mantener el aborto del script y todos los controles de red. Sin cambios en la app, la base de datos ni la publicación.

## Versiones oficiales en npm (consultadas en sólo lectura)
- react-resizable-panels 4.15.3 (en el proyecto: ^4.15.1).
- lucide-react 1.65.0 (^1.64.0).
- eslint 10.14.0 (^10.13.0).
- solid-js 1.9.18 (estable; 2.0.0-rc.20 en next; no es dependencia del proyecto).
- typescript: la última 6 estable es 6.0.3 (fijada en el proyecto). `latest` ya es 7.0.2.

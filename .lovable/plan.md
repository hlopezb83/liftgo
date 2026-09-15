# Homologar la pantalla de acceso con liftgo.com.mx

Objetivo: que la pantalla de entrada de la app (la de iniciar sesión) se vea con los mismos colores, tipografía y logo del sitio público, sin tocar el interior de la app ni ninguna regla de negocio.

## Referencia tomada del sitio

Colores reales medidos en liftgo.com.mx:

- Azul marino profundo `#0B1F3E` (bloques y encabezados)
- Dorado arena `#C39B76` (acentos y textos destacados)
- Dorado sólido de botón `#B8862B` (botón "COTIZAR")
- Fondo claro cálido `#FCF7F4`
- Tipografía de títulos: Montserrat en mayúsculas, con buen espaciado entre letras
- Texto corrido: sans serif neutra

## Qué se cambia

1. **Panel lateral de marca** (el bloque oscuro a la izquierda del formulario)
   - Azul marino del sitio, con el mismo aire sobrio.
   - Título en Montserrat, mayúsculas, línea dorada de acento como en el sitio.
   - Cuando no hay logo cargado, se muestra el distintivo "LIFT GO / MONTACARGAS" en el estilo del sitio en lugar del cuadro "LG".

2. **Lado del formulario**
   - Fondo claro cálido en lugar del degradado actual.
   - Botón principal en el dorado del sitio, en mayúsculas, con las mismas esquinas y peso visual del botón "COTIZAR".
   - Títulos del formulario en Montserrat; campos y textos secundarios sin cambios de comportamiento.
   - Pie con la versión se conserva.

3. **Tipografía**
   - Montserrat se carga desde el encabezado del sitio de la app y se usa solo en esta pantalla; el resto de la aplicación conserva su tipografía actual.

4. **Alcance acotado**
   - Los colores nuevos se definen como variables propias de esta pantalla, sin modificar la paleta global ni el interior de la app.
   - No se cambia el flujo de acceso, recuperación de contraseña, botón de Portal de Clientes ni la lógica existente.

## Detalles técnicos

- Archivos a tocar: `src/features/auth/pages/AuthPage.tsx`, `src/components/branding/AuthBrandPanel.tsx`, `src/styles.css` (bloque nuevo con tokens `--auth-*` y utilidad de tipografía), `src/routes/__root.tsx` (link a Montserrat).
- Los tokens nuevos se declaran bajo una clase contenedora (p. ej. `.auth-brandscape`) aplicada en la raíz de la pantalla de acceso, mapeando `--primary`, `--sidebar-*` y `--background` locales a los valores del sitio; así los componentes shadcn existentes heredan el estilo sin clases de color codificadas a mano.
- Fuente cargada con `<link>` en el head raíz (Tailwind v4 no permite `@import` remoto en `styles.css`).
- Sin cambios en backend, RLS, rutas, permisos ni datos.
- Se registra un patch nuevo en `CHANGELOG.md`, `public/changelog.json`, el detalle JSON de la versión y los archivos generados (`gen-version`), siguiendo la versión vigente del historial.

## Validación

- Verificación visual de la pantalla de acceso en escritorio y móvil.
- `validate-changelog` y compilación de la vista previa.
- No se ejecuta nada contra la base de producción ni se publica.

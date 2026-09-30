# Aclarar nombre de empresa vs razón social en el panel de Empresas

## Diagnóstico (verificado en la base)
No hay fuga entre empresas. `admin@liftgo.com` pertenece solo a **Empresa Prueba** (`empresa-prueba`). Esa empresa tiene la razón social fiscal **ELOGISTIX SHIPPING** en sus datos de empresa, y la barra lateral muestra la razón social. Es como una tienda con nombre comercial y otro nombre en su RFC: se trata del mismo negocio.

## Cambio propuesto (solo pantalla)
1. En Configuración → Empresas, agregar una columna "Razón social" junto al nombre interno, para ver ambos nombres.
2. Si falta la razón social, mostrar "Sin datos fiscales".
3. No se cambian datos, permisos ni aislamiento.
4. Agregar una prueba puntual de la tabla y una entrada patch en el changelog.

## Detalles técnicos
- Ampliar `listOrganizationsFn` (con guard de operador) para devolver `company_settings.razon_social` por organización.
- Renderizar la columna en la tabla de organizaciones de la plataforma.

Opción alternativa sin código: renombrar "Empresa Prueba" a "ELOGISTIX SHIPPING" (cambia datos; requiere tu autorización).

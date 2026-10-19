# K1: cliente reconciliado con la migración oficial

El formulario previo reenvía `discount` mediante UPDATE por columnas, pero ese campo no está autorizado. Este paquete usa la RPC `update_supplier_bill_details(uuid,jsonb)` y conserva el total almacenado al editar sólo metadatos. Sustituye la propuesta documental de PR273; sus pruebas históricas no acreditan automáticamente esta implementación.

## Estado y divergencia de formato, 2026-10-19

El coordinador aplicó únicamente 0104 por el canal oficial Lovable y confirmó después catálogo y ACL. Se incorpora main oficial `a8ca0080f22968eccb788a605a9a066093f9a688`, incluidos SQL, journal, snapshot y tipo generado de la RPC. **Los archivos aplicados se conservan sin modificar; no reaplicar 0103/0104 ni editar el ledger.** El cliente espera CI del head final, fusión y publicación coordinadas. Este hilo no ejecutó SQL publicado.

La aplicación introdujo un espacio de indentación respecto al SQL aprobado. Ambos payloads se registran por separado:

| Archivo | Bytes LF | SHA256 |
| --- | ---: | --- |
| Aprobado en `cccc744a971e6363c40f740f92731eab1481e9bf` | 8719 | `1fbcf64ae779070e0900061921661481fe44cb1cd23b6ab70dc322599129c877` |
| Oficial aplicado, conservado en esta rama | 8720 | `374a36eb1c433ba631ad69ae95cc3662fe3dc2ba019105d0ab1400a03aff87b0` |

La única diferencia es un byte ASCII 0x20 adicional, offset base cero 6189, línea 120 antes de `OR v_new.retention_iva`. Está en código PL/pgSQL, fuera de literales, identificadores entre comillas y comentarios. Retirar exclusivamente ese byte hace coincidir ambos archivos. No cambia tokens, valores, guardas ni comportamiento; no requiere 0105. La comparación está en `official-format-comparison.json`.

El journal oficial usa `104.when=1792370295568`, en lugar del candidato `1792368835673`. 0103 conserva SQL, snapshot y `when=1792368366457`. Las versiones siguen N5 8.44.10, cliente FX 8.44.11 y K1 8.44.12. Conservar el SQL aprobado antiguo junto al hash aplicado distinto dejaría drift oculto: Drizzle selecciona pendientes por timestamp y no verifica los hashes históricos.

El coordinador y su revisor confirmaron cuerpo de catálogo coincidente con el aplicado, owner postgres, SECURITY DEFINER y search_path fijado; EXECUTE para authenticated y retirado de PUBLIC/anon/service_role. Confirmaron ausencia de UPDATE(discount), UPDATE global o nuevos permisos SET/BYPASSRLS. Esta verificación fue recibida del coordinador; no se deriva del fixture local. Capturas y ledger internos permanecen privados.

## Contrato de edición

La RPC exige sesión authenticated, usuario activo admin/administrativo y empresa interna activa. Bloquea la factura de esa empresa, valida una lista explícita de 18 campos y usa asignaciones estáticas. Conserva constraints/triggers; un proveedor nuevo debe pertenecer a esa empresa y estar vigente.

Cambiar importes, moneda, TC o identidad fiscal de una factura aprobada, pagada, parcial, cancelada o con cualquier pago conserva los candados. Descripción, categoría, cobertura y vencimiento con importes idénticos siguen permitidos. La migración no concede UPDATE de tabla/discount, cambia ownership existente ni reescribe datos.

Usa la coerción del rowtype vigente, sin rechazo adicional por escala 2/6. El catálogo previamente autorizado confirmó dinero `numeric(14,2)` y TC `numeric(14,6)`; numeric sin typmod es sólo un perfil hipotético del fixture. Compara números JSON originales con OLD antes de `jsonb_populate_record`; cambios que la coerción redondearía al mismo valor siguen sujetos a los candados. Componentes persistidos deben ser finitos, no negativos y coherentes con el total.

El formulario conserva el total original cuando componentes, moneda y TC son idénticos. Si cambia ese grupo, muestra y envía la fórmula existente sobre los datos enviados. Mantiene las validaciones habituales; no habilita datos legados inválidos.

## Evidencia comparable conservada

- Matriz SQL original: **10/30 antes y 30/30 después**, con casos/fixture iguales. El resultado posterior original corresponde a `eabf3090ca8a3e7585586ac416f528520b6f4d8d083b57caf84267545ef0b7e1`; no se reasigna su hash al SQL actual. Identifica 17 casos con typmods y 13 hipotéticos sin typmod.
- Hook real: **4/7 antes y 7/7 después**. Tres fallos demostraban cambios involuntarios del total al editar descripción. Transportes simulados.
- Regresión cliente original: **33/33 en cinco archivos**, contrato RPC y rechazo sin fallback raw ni invalidaciones falsas. `client-final.txt` conserva aquella ejecución. Las fuentes K1 no cambian al integrar main oficial.
- Migrador restringido: la variante original falla con CREATE 42501 y RPC ausente; la corregida aprobada `1fbcf64a…` obtiene **8/8 controles y 30/30 casos previos**. [Detalle y límite de ownership del fixture](./restricted-migrator/README.md). Los resultados siguen ligados a ese hash.
- `input-hashes.json` distingue bytes ejecutados de fuentes normalizadas para publicar. No se alteran capturas históricas para atribuirlas al SQL oficial posterior. La matriz 95 y cinco carreras de PR273 siguen siendo evidencia de aquella propuesta.

Los fixtures no acreditan todos los triggers, ACL, RLS, API ni datos productivos. Los archivos de lint, tipos, build, journal y changelog conservan ejecuciones anteriores; el nuevo head requiere sus propios checks.

## Historial del migrador restringido

El head `99901fed` aprobó cliente, pero RLS `39179927520` y A/B `39179927521` fallaron creando 0104: SQLSTATE 42501, permiso denegado para declarar SET de app.cxp_rpc. Las suites posteriores no corrieron. La corrección retiró tres cláusulas SET app.* y comprueba después de auth/org y antes de escribir que ninguno de app.cxp_rpc, app.cxp_recalc o app.audit_revert sea on. Conserva sólo SET search_path, sin ampliar privilegios.

Un contexto heredado activo se rechaza con 42501 sin modificar fila ni parámetro; unset/off permite la llamada normal. Una llamada anidada tras una operación interna que dejó bypass on se rechaza de forma deliberada. El fixture separa DDL bajo migrador restringido de runtime con owner postgres; no acredita permisos publicados.

## Publicación y compensación

El carril se describe en `docs/migration-release-contract.md`: canal oficial, único ejecutor y comparación fresca de hashes/journal/ledger. La aplicación y verificación de 0104 ya fueron coordinadas por el padre. Este PR entrega el cliente contra esa implementación. No crear otro runner, reaplicar SQL, editar ledger ni generar 0105 para ocultar formato.

Si fuera necesaria y expresamente aprobada, la compensación propuesta es retirar el puente cliente y deshabilitar sólo EXECUTE mediante una migración posterior, conservando función, datos e historial. Sin DROP, UPDATE global, borrado de ledger ni reversión de descuentos/pagos. El cliente anterior conserva el defecto K1; retirarlo es contención.

Sin Chrome, BUILD de Lovable, merge, publicación, permisos reales ni transacciones de negocio desde este hilo. El padre coordina fusión, publicación y QA.

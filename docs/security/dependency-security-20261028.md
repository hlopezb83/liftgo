# Seroval: resolución compatible de seguridad (2026-10-28)

TanStack Start y Router usan Seroval en producción para transportar datos.
GHSA-3pfx-gxff-vg76 afecta `<=1.7.1`: deserializar una promesa rechazada en un
campo que el receptor ignora puede terminar Node antes de la validación de la
aplicación. El parche es **1.7.2**. La presencia del paquete no demuestra una
explotación en esta aplicación; tampoco permite clasificarlo como exclusivo de
devtools, porque Start lo consume en producción.

Los padres instalados de TanStack declaran `seroval: ^1.6.7`, que admite 1.7.2.
Solid, utilizado por Query devtools, declara `~1.6.8`, que exige una copia
separada de la familia 1.6. Bun prefiere compartir una copia cuando satisface
ambos rangos: un update transitivo deja la versión 1.6.12 común y mantiene el
aviso en producción.

Se declaran temporalmente **`seroval: 1.7.2`** y
**`seroval-plugins: 1.7.2`** como dependencias de producción explícitas para
mantener la pareja de serialización de TanStack en la familia corregida.
Solid conserva sus copias 1.6.12 dentro de su contrato. Las pruebas de
instalación real mostraron que fijar solo Seroval podía dejar una copia 1.6
en el consumidor TanStack, aunque el lock pareciera apuntar a la raíz segura.
La pareja explícita se verificó desde los consumidores en una fixture pequeña
instalada y en otra instalación limpia congelada; el hash del lock se mantuvo.
Las comprobaciones de la aplicación completa siguen siendo obligatorias.

En el grafo completo, Bun conservaba cinco resoluciones anidadas antiguas
de TanStack incluso al reinstalar desde cero. Se retiraron únicamente esas
cinco entradas del lock para regenerarlas con Bun 1.4.4, y se actualizó el
plugin anidado de Solid a 1.6.12 dentro de su rango. La revisión semántica
contra ese lock anterior muestra sólo esas seis diferencias. Se conserva
el formato 1, los overrides históricos y todas las demás resoluciones.

En el lock existente, Bun también conservaba resoluciones anidadas antiguas
de TanStack. La regeneración acotada retira las cinco resoluciones heredadas
de Seroval de Router/Start y vuelve a validar con Bun; conserva los rangos y
las integridades de todos los padres. La copia de plugins de Solid pasa de
1.6.8 a 1.6.12 dentro de `~1.6.8`. Un lock congelado correcto por sí solo no
demuestra qué copia carga Node: se comprueba desde cada consumidor instalado.

No se fuerza a Solid a aceptar 1.7 mediante override. Los dos pins pueden
retirarse cuando los padres publiquen mínimos que resuelvan el parche por sí
mismos; verificar entonces el lock y las resoluciones instaladas desde cada
consumidor. Knip documenta excepciones exclusivas para `seroval` y
`seroval-plugins`, cuyo consumo es transitivo y está comprobado por
`test:dependencies`; conserva las reglas globales.

**Riesgo residual dev:** Solid/Seroval 1.6.12 sigue dentro del rango afectado
por GHSA-3pfx-gxff-vg76. No se ha demostrado deserialización de entradas no
confiables del servidor por Query devtools. Su remediación completa requiere
que Solid acepte la familia parcheada; mantener el aviso dev abierto.

La selección usa una antigüedad conservadora de al menos 24 horas, coherente
con el guard `minimumReleaseAge = 86400` configurado en Elogistix. Lift no tiene
ese ajuste configurado. Seroval 1.7.2 se publicó el 24 de octubre a las
12:22 UTC y cumple ese plazo. 1.7.3 se publicó el 28 de octubre a las
12:14 UTC: al revisar a las 16:56 UTC aún no cumplía 24 horas. No se añadió
configuración de antigüedad ni ninguna excepción en Lift. Seroval-plugins
1.7.2 también se publicó el 24 de octubre y cumple el mismo plazo.

`bun run test:dependencies` comprueba la resolución de los padres reales,
las dos familias compatibles, el roundtrip de valores y referencias, y un
subproceso Node con rechazo estricto que deserializa promesas rechazadas
ignoradas mediante `fromJSON`/`fromCrossJSON`. También comprueba que quien
espera la promesa sigue recibiendo el rechazo. Estas pruebas complementan
los casos existentes de transporte RPC y SSR/hidratación y el build local;
no certifican un despliegue.

Fuentes oficiales: [aviso GHSA](https://github.com/lxsmnsyc/seroval/security/advisories/GHSA-3pfx-gxff-vg76),
[parche upstream](https://github.com/lxsmnsyc/seroval/commit/737afa1),
[Router](https://registry.npmjs.org/@tanstack/router-core/1.171.37),
[Start server](https://registry.npmjs.org/@tanstack/start-server-core/1.169.43),
[Solid](https://registry.npmjs.org/solid-js/1.9.17) y
[fechas de publicación](https://registry.npmjs.org/seroval).

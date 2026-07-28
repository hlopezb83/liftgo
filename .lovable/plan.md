## Objetivo

Volver a probar el módulo de **Conciliación Bancaria** directamente sobre el preview, esta vez como corrida completa y con evidencia visual, dejando la base de datos exactamente como estaba.

Nota: en modo plan no puedo sembrar datos ni ejecutar el navegador (ambas cosas modifican estado). Al aprobar, ejecuto todo lo de abajo.

## Qué voy a hacer

### 1. Preparar datos de prueba aislados
Crear una **cuenta bancaria temporal** (marcada `TMP_E2E_BANK_<scope>`) con una importación y 3 movimientos:
- Un abono con monto y fecha idénticos a un pago real existente (para que el motor de candidatos lo detecte).
- Un abono "huérfano" de monto absurdo (sin candidatos posibles).
- Un cargo negativo (comisión bancaria), para probar el flujo de "Ignorar".

Emparejar solo escribe en la línea del estado de cuenta; los pagos reales nunca se modifican.

### 2. Recorrido funcional (con captura de pantalla en cada paso)
1. Carga de la página y selección de la cuenta temporal.
2. **KPIs**: cargos, abonos, neto y % conciliado del periodo.
3. **Filtros**: pestañas Todas / Sin emparejar / Sugerido / Conciliado / Ignorado.
4. **Búsqueda**: por descripción, por referencia y por monto.
5. **Selección múltiple**: que el checkbox se pinte y el contador de la barra masiva sea correcto.
6. **Panel de emparejamiento**: candidatos con score y etiquetas (monto exacto / mismo día), búsqueda manual de candidatos y tolerancia de monto.
7. **Emparejar**: la línea pasa a Conciliado y el KPI de % se actualiza.
8. **Ignorar**: botón bloqueado sin razón, y con razón el movimiento pasa a Ignorado.
9. **Atajos de teclado**: J / K para navegar y Escape para cerrar el panel.
10. **Errores de consola**: cero errores durante todo el recorrido.

### 3. Limpieza garantizada
Borrado de líneas → importaciones → cuenta temporal en un bloque `finally` (se ejecuta aunque una prueba falle), más un barrido de cuentas `TMP_E2E_BANK` huérfanas. Al final consulto la base para confirmar que quedan **0** registros temporales.

### 4. Reporte
Entrego una tabla PASS/FAIL de cada verificación, capturas de las pantallas clave y, si aparece algún bug, la causa y el fix propuesto (los arreglos serían un paso aparte, previa confirmación tuya).

## Detalles técnicos

- El recorrido se maneja con Playwright headless a 1600x900 contra `localhost:8080`, restaurando la sesión de Lovable Cloud desde las variables de entorno inyectadas (nunca se imprimen).
- El sembrado se hace vía la API de datos con el token de la sesión, respetando RLS (no se saltan permisos).
- Los selectores usan los `data-testid` ya existentes en los componentes de conciliación, así que no hace falta tocar código de la app para la prueba.
- Si detecto que el servidor de desarrollo está sirviendo módulos viejos (ya pasó antes), hago un flush de HMR antes de correr.

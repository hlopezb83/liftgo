# Regularizar las 24 entregas pendientes de HERREN ENERGY

## Alcance de lo revisado (solo lectura)
- Base consultada: la de producción (una sola instancia sirve preview y publicado). Tu consulta dio cero porque HERREN ENERGY es la **empresa** (organización `2ec4801d…6d74`), no un cliente. Por eso filtrar clientes con "Herren" no devuelve nada.
- Datos de la empresa: 41 reservas y 37 entregas (24 programadas, 13 completadas). Ninguna de las 24 tiene fecha de completado.
- Solo revisé registros de esta empresa. No hice ningún cambio.

## Lo encontrado
Cada una de las 24 entregas programadas tiene exactamente una reserva y no hay entregas duplicadas. La fecha programada coincide con el inicio de la reserva. Hay tres grupos distintos:

1. **Reservas confirmadas y en curso (unas 16):** RSV-0003, 0004, 0006, 0007, 0009, 0011, 0014–0020, 0024, 0025, 0030 y otras. En el sistema el equipo aparece como **"Disponible"**, aunque en realidad está rentado. Estas reservas ya tienen facturas recurrentes (de 5 a 14 cada una).
2. **Reservas ya terminadas, con la entrega aún "programada":** RSV-0005, 0008, 0010, 0021, 0022, 0023. Completar estas entregas hoy marcaría el equipo como "Rentado" por error. Además, varias comparten equipo con otras reservas: RSV-0005 con RSV-0006 y RSV-0008 con RSV-0009.
3. **Dos entregas con inicio de reserva futuro:** el sistema no deja completarlas, y es correcto.

## Qué permite el sistema hoy
- **Completar entrega:** exige operador, firma o un motivo escrito. Al completarla, el equipo pasa de "Disponible" a "Rentado" y queda un registro en la bitácora de estados. La fecha que se guarda es la del momento en que se completa.
- **Corregir fecha (solo administrador):** sirve únicamente para entregas ya completadas. Pide un motivo y queda auditada.
- Ninguna de estas acciones toca facturas, cobros ni devoluciones.

## Camino seguro propuesto (sin recrear reservas ni inventar firmas)
**Grupo 1 (confirmadas en curso), de una en una o en lote:**
1. Completar la entrega con el motivo "Regularización histórica: equipo entregado al inicio de la reserva, autorizado por [nombre]". No se captura firma ni operador ficticio.
2. Usar "Corregir fecha" para poner la fecha real igual al inicio de la reserva, con el mismo motivo.
3. Resultado: el equipo queda "Rentado", que es su estado real, y la fecha de entrega correcta queda en el historial.

**Grupo 2 (reservas ya terminadas):** no completarlas. Lo recomendado es **cancelarlas** como "programada sin efecto". Así el equipo no cambia de estado y no se toca ninguna devolución. Si se quiere dejar constancia de que sí hubo entrega, haría falta una función nueva que registre la entrega histórica sin cambiar el estado del equipo. Eso requiere tu aprobación aparte.

**Grupo 3:** dejarlas como están.

## Opción técnica (si eliges el lote)
- Una función nueva solo para administradores: "regularizar entrega histórica" (reserva, fecha = inicio, motivo).
- Validaría que la reserva esté confirmada, que su equipo no esté en otra reserva activa y que la fecha no sea futura.
- Haría el cambio a "Rentado" y dejaría auditoría.
- Primero se probaría en CI. La base es de producción y no se ejecutan pruebas con escritura contra ella.

## Riesgos
- Si un equipo está físicamente en otro lugar, por ejemplo en mantenimiento, el paso de "Disponible" a "Rentado" fallará. Eso es correcto, pero obliga a revisar caso por caso.
- La fecha de la bitácora de estados será la de hoy, aunque la de la entrega se corrija.
- Facturas y cobros: sin impacto, porque ya se generaron por fechas de reserva.

## Necesito que confirmes
1. Que las unidades del grupo 1 de verdad están con el cliente hoy.
2. Para el grupo 2: ¿cancelar o crear el registro histórico sin cambio de estado?
3. ¿Lo hace el usuario a mano (dos pasos por entrega) o construimos la función de lote?
4. El nombre de quien autoriza, para ponerlo en el motivo.

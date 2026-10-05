# Textos del ERP

El copy describe lo que ocurrió, qué significa para el usuario y cuál es su siguiente acción. Usa español de México, frases cortas y mayúsculas de oración. La marca se escribe **LiftGo**.

## Vocabulario

| Concepto | Texto visible |
| --- | --- |
| Entidad que usa el ERP | Empresa |
| Administración de la empresa | Administrador |
| Administración global | Operador de plataforma |
| Regreso de un equipo | Devolución |
| Email | Correo electrónico |
| Changelog | Historial de cambios |
| Feedback de errores y mejoras | Reportes |
| Aging de cartera | Antigüedad de saldos |
| Pipeline comercial | Etapas de venta |
| Maestros globales | Catálogo compartido |
| Machotes de contratos y pagarés | Plantillas legales |
| Request ID del error | ID del error |
| Consumidor de un trabajo fiscal | Procesamiento |

Las rutas, permisos, claves JSON, códigos de estado y valores almacenados conservan sus identificadores técnicos. El glosario cambia su presentación, no el modelo de datos.

## Estados e importes

- Una respuesta exitosa de transporte no demuestra un resultado fiscal final. Seleccionar el mensaje según el estado devuelto.
- Mostrar «cancelado» sólo cuando la cancelación esté aceptada; distinguir espera, rechazo y vencimiento.
- Un timbrado pendiente no promete que llegará un UUID. Pedir consultar el estado; no sugerir crear otro comprobante.
- Mantener separados el folio fiscal UUID y la serie y folio devueltos por Facturapi.
- La diferencia entre facturación y cobros no se llama flujo de efectivo, utilidad ni saldo por cobrar sin una definición que lo justifique.
- Explicar los periodos que incluyen saldo vencido y advertir si se superponen.
- En un importe opcional, mostrar qué valor efectivo se utilizará al dejarlo vacío. Distinguir importe aplicado de importe devuelto.

## Formularios y avisos

- Cada error de campo aparece junto a ese campo, conectado mediante aria-describedby. Los errores generales del formulario no se colocan bajo el importe.
- Mostrar límites de texto con una explicación concreta; evitar mensajes genéricos de tipos internos.
- Las confirmaciones usan frases como «Reserva extendida» o «Equipos asignados». Omitir «exitosamente» y «correctamente».
- Incluir el folio u objeto afectado cuando esté disponible y aporte contexto.
- El error principal utiliza una explicación en español; el JSON copiable conserva el diagnóstico original y su redacción técnica.
- En errores de resultado incierto, pedir comprobar el estado antes de repetir. No sugerir reintentos indiscriminados en pagos o timbrado.
- Pluralizar de manera natural: «1 equipo» / «2 equipos», evitando «equipo(s)».
- Usar «Cuentas bancarias», «Flujo de caja» y «Depósito en garantía», respetando nombres propios y siglas oficiales.
- Conservar términos útiles como RFC, CFDI, UUID y SKU. Usar «Complemento de pago (REP)» en la primera aparición cuando haga falta explicar la sigla.

## Referencias fiscales

Las decisiones sobre estados se contrastaron con las guías oficiales de [cancelaciones](https://docs.facturapi.io/docs/guides/invoices/cancelaciones/) e [intermitencias de timbrado](https://docs.facturapi.io/docs/guides/invoices/intermitencias/).

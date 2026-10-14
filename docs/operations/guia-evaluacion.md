# Guía de evaluación del piloto

Para quien evalúa SEPSA Campo: administración y técnico de campo. Dice qué probar, qué esperar y qué no es parte de la entrega. Los pasos detallados de cada acción están en la [guía de campo](guia-de-campo.md); aquí no se repiten.

Esta guía no incluye credenciales. Las cuentas de evaluación se entregan por separado.

## Antes de empezar

- **Espera inicial.** El servidor y la base de datos están en planes gratuitos. Tras un rato sin uso, la primera petición puede tardar cerca de un minuto. Si la pantalla de acceso tarda, espera y vuelve a intentarlo. No repitas una acción de corte mientras no veas su resultado.
- **Entrar requiere conexión.** La sesión dura 7 días. Con la sesión vigente, el técnico puede trabajar sin conexión; no puede volver a entrar sin ella.
- **Los datos son de prueba.** Los deudores y órdenes son ficticios. No introduzcas datos reales de personas.
- **Qué sí y qué no.** Es un piloto provisional. No es la API oficial de SEPSA ni valida elegibilidad, cargos ni umbrales (D027). Lo que SEPSA debe decidir está en [14-pendientes](../entrega-sepsa/14-pendientes-sepsa.md).

## Qué probar

### 1. Administrador

| Paso | Qué esperar |
|---|---|
| Entrar con la cuenta de administrador y pulsar **Buscar morosos**. | Aparece la lista de suministros. |
| Seleccionar suministros y pulsar **Crear y asignar orden de corte**; elegir técnico con **Asignar a técnico**. | La orden aparece asignada a ese técnico. |
| Abrir **Operaciones por conciliar**. | Lista de solo lectura (D024). No hay botones para cambiar órdenes desde ahí. |

### 2. Técnico con conexión

| Caso | Cómo probarlo | Resultado esperado |
|---|---|---|
| Descarga de órdenes | Pulsar **Enviar pendientes y actualizar** con la cabecera en **Red disponible**. | Aparecen las órdenes asignadas al técnico. |
| Registro de visita | Registrar una visita con foto. | La visita queda sincronizada y el administrador la ve en la auditoría. |
| Corte completo | Registrar corte: lectura, GPS, foto y **Confirmar corte**. | La orden pasa a corte confirmado. |
| Reconexión | Con un corte confirmado, **Preparar reconexión** y confirmar. | La orden pasa a reconexión confirmada. |
| Foto de cámara | Adjuntar una foto de cámara (por ejemplo, de 12 MP). | La foto se comprime y el corte se sincroniza. |

### 3. Técnico sin conexión

| Caso | Cómo probarlo | Resultado esperado |
|---|---|---|
| Visita sin conexión | Activar modo avión; registrar una visita con foto. | Queda guardada en el celular. Al volver la red, aparece en **Enviar pendientes y actualizar** y se sincroniza. |
| Corte sin conexión | Confirmar un corte sin red. | **No se corta.** La app registra una visita y dice que el corte no quedó autorizado. |
| Reinicio entre captura y envío | Registrar una visita, cerrar la app, reabrirla y sincronizar. | La visita sigue en la cola y se sincroniza. |

### 4. Estados inciertos

| Caso | Qué esperar |
|---|---|
| Corte o reconexión sin respuesta del servidor. | La app muestra un estado incierto y el botón **Verificar con servidor**. |
| Pulsar **Verificar con servidor**. | La app consulta al servidor. Si la autorización no se usó, ofrece solicitar una nueva. Si se usó, registra el resultado sin repetir el corte. |
| Pedir una nueva autorización. | Se reutiliza la foto y la observación ya capturadas; el técnico no vuelve a capturar datos. |

**Regla para evaluar:** nunca se corta sin autorización en línea. Un estado incierto no autoriza ninguna acción física; solo se resuelve verificando.

### 5. Permisos

- Un técnico no ve ni actúa sobre órdenes asignadas a otro técnico.
- Un administrador no puede consumir autorizaciones de cortes ni reconexiones.

### 6. Registro del técnico desde otro dispositivo

| Caso | Cómo probarlo | Resultado esperado |
|---|---|---|
| Ver el registro | Con el técnico, abre una orden que tenga visitas sincronizadas y pulsa **Ver registro del servidor**. | Aparece cada visita, corte o reconexión sincronizada, con su estado, su captura y la fecha de confirmación. |
| Ver una foto | En una visita con evidencia, pulsa **Ver foto 1**. | La foto aparece. Si los bytes no coinciden con el hash guardado, no se muestra y la app ofrece **Reintentar**. |
| Otro dispositivo | Entra con el mismo técnico desde otro celular o navegador sin datos locales y abre la misma orden. | El mismo registro y las mismas fotos aparecen. Lo que nunca se sincronizó desde el primer dispositivo no aparece. |
| Otro técnico | Entra con otro técnico y abre la misma orden. | No ve las operaciones ni las fotos del primero. |

**Regla para evaluar:** el registro es solo lectura. Consultarlo no envía ni cambia nada, y cada consulta queda en la auditoría del servidor.

## Qué no está incluido

- La integración oficial con SEPSA. El contrato es provisional.
- La corrección de datos por el técnico desde la aplicación. Se hace con un procedimiento manual de soporte (D-c, declarado como limitación).
- La validación de elegibilidad para cortar, cargos y prioridad de reconexión (D027).
- Copias de seguridad y respaldo de la base: los define el proveedor, no la aplicación.

## Cómo reportar un hallazgo

Anota la pantalla, la hora, si había conexión y el texto del mensaje que apareció. Si hubo un corte o una reconexión, anota también el estado que mostró la orden antes y después.

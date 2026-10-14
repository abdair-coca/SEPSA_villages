# 09. Manual de usuario

Fuente: pantallas y etiquetas de `field-app/src/` (estado de `main` al 2026-10-12) y la guía de campo del piloto.
Fecha: 2026-10-13
Estado: entrega, copia fechada. Describe la interfaz tal como está hoy.

**Regla principal: sin autorización en línea vigente, no hay corte.** Sin conexión se puede trabajar y registrar una visita, pero no se corta.

Las capturas de este manual son del modo simulado, con datos de demostración, no datos reales.

## 1. Administrador

**Entrar.** Escribir usuario y contraseña y pulsar **Ingresar**. La contraseña nunca se guarda en la aplicación; **Recordar usuario en este dispositivo** guarda solo el usuario. La sesión dura 7 días. Entrar requiere conexión.

![Pantalla de acceso](img/login-390.png)

**Cambiar de rol.** Si la cuenta tiene los dos roles, el menú de perfil ofrece **Cambiar a Técnico** o **Cambiar a Administrador**. El cambio requiere conexión.

**Buscar morosos.** En **Buscar morosos** se usan el buscador o los filtros **Área**, **Localidad**, **Ruta**, **Facturas vencidas** y **Estado del suministro**. Los resultados se ordenan por deuda. Antes de crear la orden se revisan cliente, dirección, cuenta, medidor, deuda y estado. Si ya hay una orden activa para el suministro, no se crea otra. La elegibilidad la decide el administrador al seleccionar el suministro.

![Centro de control del administrador: búsqueda de morosos y datos del suministro](img/admin-panel-1280.png)

**Crear y asignar.** Con los suministros marcados, pulsar **Crear orden de corte** o **Crear y asignar orden de corte**. En **Creación masiva** se revisa la lista, se elige el técnico en **Asignar a técnico** y se pulsa **Aceptar y crear órdenes**. Cada orden queda con creador, técnico, versión y estado `GENERADO`, y la acción queda en auditoría.

![Creación masiva: selección del técnico y confirmación de las órdenes](img/admin-crear-asignar-1280.png)

**Operaciones por conciliar.** Desde el menú de cuenta (avatar) se abre un diálogo de solo lectura con tres contadores y la lista de casos: conflictos, autorizaciones usadas cuya operación no llegó y operaciones cerradas porque la autorización no se usó. El técnico las verifica desde su dispositivo.

**Lo que el piloto no permite:** anular órdenes, y resolver desde la interfaz una operación incierta.

## 2. Técnico de campo

**Antes de salir (con internet).** Conectarse, abrir **SEPSA Campo**, pulsar **Enviar pendientes y actualizar** para descargar las órdenes, y revisar que la cabecera muestre **Red disponible**. No borrar los datos del navegador: ahí están las órdenes y las operaciones pendientes.

**Jornada.** La pantalla **Jornada de campo** muestra la **Orden actual** y permite **Abrir orden** y **Marcar incidencia**. La barra inferior tiene **Inicio**, **Mis órdenes**, **Mapa** y **Pendientes**.

![Jornada de campo](img/tecnico-inicio-390.png) ![Detalle de la orden con Registrar corte](img/tecnico-detalle-390.png) ![Excepción de foto con justificación obligatoria](img/tecnico-excepcion-foto-390.png)

**Registrar un corte.** En el detalle de la orden, **Registrar corte** pide:

1. **Lectura final del medidor**, en kWh, no negativa, del medidor correcto.
2. **GPS**. Si no se obtiene, se registra una excepción con motivo.
3. **Fotografía** JPEG o PNG. Si no se puede tomar, la aplicación pide una **Justificación obligatoria**.

Antes de cortar se pide la autorización en línea. Si el servidor la rechaza o la respuesta no es concluyente, no se corta: se registra una visita y se indica que el corte no quedó autorizado. **Registrar visita** registra la presencia sin afirmar que hubo corte.

**Estados de la operación:**

| Etiqueta | Significado |
|---|---|
| Pendiente | Guardada en el dispositivo; aún sin confirmación del servidor |
| Sincronizando / Sincronizado | Enviándose / confirmada por el servidor |
| Falló | No se envió. Se reintenta con el mismo identificador |
| Revisión humana · no reenviar | Resultado no claro. No se repite la acción física |

La cola se conserva aunque se cierre la aplicación o se pierda la red.

**Consulta incierta.** **Verificar con servidor** vuelve a consultar la autorización. Mientras no sea concluyente, la acción no se repite. Si el servidor confirma que la autorización no se usó, aparece **Solicitar nueva autorización**; la operación anterior se cierra fuera de la cola, con el mensaje «Cerrada: la autorización no se usó».

**Si algo falla.** Si no se ven órdenes, hace falta internet una vez para descargarlas. Si un resultado dice **Revisión humana · no reenviar**, no se repite la acción física: se avisa al administrador.

## 3. Preguntas frecuentes

- **¿Puedo cortar sin internet?** No.
- **¿Qué pasa si cierro la aplicación con una operación pendiente?** Queda en la cola y se envía en la siguiente sincronización.
- **¿Puedo crear una segunda orden para el mismo suministro?** No, mientras la primera esté activa.

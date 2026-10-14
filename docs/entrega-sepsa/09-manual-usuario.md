# 09. Manual de usuario

Fuente: pantallas y etiquetas de `field-app/src/` (estado de `main` al 2026-10-12) y la guía de campo del piloto.
Fecha: 2026-10-13
Estado: entrega, copia fechada. Describe la interfaz tal como está hoy. Pasos completos y capturas en el anexo A09.

**Regla principal: sin autorización en línea vigente, no hay corte.** Sin conexión se puede trabajar y registrar una visita, pero no se corta.

## 1. Administrador

- **Entrar:** usuario y contraseña, con **Ingresar**; la contraseña nunca se guarda en la aplicación. La sesión dura 7 días. Requiere conexión. Quien tenga los dos roles cambia de rol desde el menú de perfil.
- **Buscar morosos:** con el buscador o los filtros de área, localidad, ruta, facturas vencidas y estado. Si ya hay una orden activa para el suministro, no se crea otra.
- **Crear y asignar:** individualmente o en **Creación masiva**, con técnico y confirmación. Cada orden queda `GENERADO` y la acción queda en auditoría.
- **Operaciones por conciliar:** lista de solo lectura.
- **No permite:** anular órdenes, ni resolver desde la interfaz una operación incierta.

## 2. Técnico de campo

- **Antes de salir:** con internet, sincronizar y descargar las órdenes, y comprobar que aparezca **Red disponible**. No borrar los datos del navegador.
- **Registrar un corte:** lectura final del medidor (kWh, no negativa), GPS (si no se obtiene, excepción con motivo) y foto (si no se puede tomar, **Justificación obligatoria**). Antes se pide la autorización en línea; si no es concluyente, no se corta y se registra una visita.
- **Registrar visita:** registra la presencia sin afirmar que hubo corte.
- **Estados de la operación:** Pendiente, Sincronizando/Sincronizado, Falló y **Revisión humana · no reenviar**. La cola se conserva si se cierra la app o se pierde la red.
- **Consulta incierta:** **Verificar con servidor** no repite la acción física. Si la autorización no se usó, aparece **Solicitar nueva autorización**.
- **Si algo falla:** sin órdenes visibles hace falta internet una vez; ante **Revisión humana · no reenviar**, se avisa al administrador.

Preguntas frecuentes del anexo: no se puede cortar sin internet; una operación pendiente queda en la cola hasta la siguiente sincronización; no se puede crear una segunda orden activa para el mismo suministro.

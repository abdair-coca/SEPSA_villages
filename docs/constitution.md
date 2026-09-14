# Constitución del Proyecto — Sistema de Operaciones Eléctricas Rurales

## 1. Identidad

- **Nombre provisional:** Sistema de Operaciones Eléctricas Rurales
- **Institución:** SEPSA
- **Usuarios iniciales:** Administrador y técnico de campo
- **Plataformas iniciales:** experiencia administrativa web y PWA técnica optimizada para Android
- **Arquitectura:** Offline-First

## 2. Propósito

Crear un sistema multirol para que un administrador identifique suministros morosos, genere y asigne órdenes de corte, y para que el técnico ejecute exclusivamente sus órdenes con contexto operativo completo, incluso cuando la conectividad sea limitada.

El primer incremento será un corte vertical verificable: el administrador crea y asigna una orden individual; el técnico la descarga, consulta sus datos, captura información de campo, obtiene autorización, registra el resultado localmente y lo sincroniza; el administrador consulta luego la trazabilidad completa.

## 3. Alcance del piloto operativo

### Incluido en el primer corte vertical

- Inicio de sesión y control de acceso para administrador y técnico.
- Dashboard administrativo operacional.
- Búsqueda de suministros morosos.
- Creación individual de una orden de corte.
- Filtrado administrativo por área regional, localidad, ruta, mínimo de facturas vencidas y estado del cliente.
- Creación masiva de órdenes mediante selección de resultados, vista previa, confirmación, idempotencia por lote y auditoría.
- Asignación de la orden a un técnico.
- Visualización administrativa de toda la información operativa del piloto.
- Descarga de órdenes asignadas al técnico.
- Consulta técnica de domicilio, cliente, medidor, Kardex y deuda asociados.
- Dirección y mapa como ayudas complementarias de localización.
- Captura de ubicación GPS, precisión y disponibilidad.
- Registro de lectura del medidor.
- Validación online obligatoria inmediatamente antes del corte.
- Registro durable de visita, evidencia, corte ejecutado o bloqueo.
- Persistencia local, cola idempotente y sincronización posterior.
- Consulta administrativa del resultado y auditoría de extremo a extremo.

### Confirmado para incrementos posteriores

- Asignación masiva de órdenes con vista previa, distribución explícita, confirmación e idempotencia por lote.

### Fuera del primer corte vertical

- Reconexiones nuevas; la capacidad histórica existente no se elimina.
- Cobranza o recepción de pagos por el técnico dentro del flujo de corte.
- Integración definitiva con una API oficial de SEPSA.
- Cartografía offline avanzada u optimización automática de rutas.
- Gestión completa del ciclo de vida de cuentas de usuario.
- IoT, medición automática, IA y analítica avanzada.

## 4. Flujo principal del corte vertical

```text
Administrador autenticado
  ↓
Buscar suministro moroso
  ↓
Crear orden individual
  ↓
Asignar técnico
  ↓
Técnico sincroniza órdenes asignadas
  ↓
Consultar cliente, domicilio, medidor, Kardex y mapa
  ↓
Registrar visita, GPS, lectura y evidencia
  ↓
Obtener autorización online vigente
  ├── Bloqueada o incierta → No cortar y registrar resultado
  └── Autorizada → Ejecutar y confirmar corte
                       ↓
                 Persistir localmente
                       ↓
                 Sincronizar resultado
                       ↓
              Administrador consulta trazabilidad
```

## 5. Reglas de negocio

### 5.1 Roles y acceso

- El administrador puede consultar toda la información operativa y ejecutar todas las funciones administrativas incluidas en el piloto.
- El acceso administrativo total no incluye secretos, contraseñas ni credenciales técnicas.
- El técnico solo puede consultar y operar órdenes asignadas a su identidad.
- Ocultar controles en la interfaz no sustituye la autorización del backend.
- Toda acción administrativa o técnica debe registrar actor, fecha, entidad afectada y resultado.

### 5.2 Creación y asignación

- Una orden debe identificar su origen, creador, suministro, técnico asignado, versión y estado.
- Una misma deuda no debe originar órdenes activas duplicadas para el mismo propósito.
- Una reasignación o anulación debe conservar historial; nunca debe sobrescribirse silenciosamente.
- La creación masiva debe usar un identificador único de lote, vista previa y confirmación explícita.

### 5.3 Contexto técnico

Antes de actuar, el técnico debe poder identificar inequívocamente orden, cliente, domicilio o punto de suministro y medidor. Kardex, deuda y fecha de actualización deben ser visibles. El significado definitivo y relación entre estas entidades requiere validación con SEPSA.

### 5.4 Autorización de corte

- Ningún corte puede ejecutarse sin autorización online concluyente y vigente.
- Pago y consumo de autorización deben serializarse atómicamente: si el pago se confirma primero, la orden pasa de `GENERADO` a `ANULADO` con causa y timestamp, y el corte queda bloqueado.
- Timeout, ausencia de respuesta, `unknown`, `payment_detected` o `not_authorized` nunca significan autorización.
- Cada autorización debe ser única, breve y vinculada a orden, técnico, dispositivo, operación y versión.

### 5.5 Captura y ejecución

- El registro normal del corte requiere lectura final del medidor, ubicación GPS y evidencia asociadas a orden, técnico, dispositivo y fecha.
- El GPS debe usar coordenadas WGS84 y permitir la excepción controlada `saltar_control_coordenadas`; nunca se inventarán coordenadas.
- La evidencia fotográfica debe permitir la excepción controlada `saltar_control_fotos`.
- Umbral de precisión GPS, validación numérica de lectura y posibles excepciones de lectura quedan como `TODO: VALIDAR CON SEPSA`.
- Un mapa complementa dirección y referencias; nunca será el único medio de localización.
- El éxito solo puede mostrarse después de persistir localmente la operación.

### 5.6 Cobranza histórica

Las reglas históricas de cobro presencial quedan fuera del primer corte vertical. Su continuidad dentro del producto debe confirmarse antes de reactivarlas o ampliarlas.

## 6. Offline-First

El funcionamiento sin conexión es un requisito central, no una funcionalidad secundaria.

Sin Internet el técnico debe poder consultar el último paquete válido, identificar sus órdenes, revisar datos descargados y registrar visita, lectura, GPS disponible, evidencia y resultados no dependientes de autorización externa.

La administración puede requerir conexión durante el primer incremento. La pérdida de conexión nunca habilita un corte: la autorización final continúa siendo online y obligatoria.

## 7. Persistencia local

Los datos necesarios para el trabajo deben almacenarse persistentemente en el dispositivo. La implementación objetivo es **IndexedDB** dentro de la PWA.

Los datos deben sobrevivir a recargas, cierre de la aplicación, pérdida temporal de conexión y reinicio del dispositivo.

## 8. Cola de sincronización

Toda modificación realizada offline debe entrar en una cola local.

```text
Operación
  ↓
Base local
  ↓
Sync Queue
  ↓
Internet disponible
  ↓
API
```

La cola debe ser persistente, reintentable y capaz de identificar cada operación de forma única.

## 9. Sincronización

Al recuperar conexión, la aplicación debe sincronizar automáticamente.

La sincronización debe ser:

- incremental;
- resistente a fallos;
- reintentable;
- segura frente a duplicados;
- visible para el usuario;
- no bloqueante.

Una operación que falle no debe perderse.

## 10. Integración con SEPSA

El archivo `Deudores_morosos_11_05_2026.xlsx` es un reporte exportado del sistema actual de SEPSA y se utiliza como referencia inicial. No constituye el modelo definitivo de la aplicación.

La evolución esperada es:

```text
Situación inicial:
Excel → carga/migración → sistema

Piloto operativo:
Fuente provisional identificada ↔ backend del piloto ↔ administración / aplicación técnica

Situación futura:
SEPSA API ↔ backend ↔ administración / aplicación técnica
```

La aplicación no debe depender directamente del Excel.

No se deben asumir significados de columnas que todavía no hayan sido confirmados con SEPSA.

## 11. Datos de referencia conocidos

El reporte contiene información relacionada con, entre otros elementos:

- código del domicilio;
- municipio / área;
- localidad o barrio;
- ruta;
- categoría;
- nombre;
- dirección;
- medidor;
- meses pendientes;
- deuda;
- estado;
- observaciones;
- ubicación geográfica cuando está disponible.

El significado exacto de los campos que todavía no ha sido confirmado deberá validarse antes de convertirlos en reglas de negocio.

## 12. Modelo conceptual inicial

```text
Administrador ── crea/asigna ── Orden de corte ── recibe ── Técnico
                                  │
                                  ▼
                        Domicilio o suministro
                           │       │       │
                           ▼       ▼       ▼
                        Cliente  Medidor  Ubicación
                           │       │       │
                           ▼       ▼       ▼
                         Kardex  Lectura   GPS/Mapa
                                  │
                                  ▼
                    Visita / Evidencia / Ejecución
                                  │
                                  ▼
                         Auditoría y sincronización
```

La base de conocimiento confirma relaciones operativas entre cuenta de suministro, orden, técnico y ejecución. Las cardinalidades marcadas como inferidas y cualquier historial entre cliente, domicilio y medidor deben validarse con SEPSA antes del esquema definitivo.

## 13. UX / UI

Cada rol tendrá una experiencia distinta sobre el mismo flujo operativo.

Principios:

- simplicidad;
- velocidad;
- claridad;
- botones grandes;
- uso cómodo con una mano;
- mínima escritura;
- baja carga cognitiva;
- información crítica visible inmediatamente;
- estado de conexión siempre comprensible.

- La experiencia técnica debe priorizar identificación correcta, dirección, medidor, deuda, seguridad del corte y trabajo con una mano.
- La experiencia administrativa debe priorizar trabajo pendiente, asignaciones, bloqueos, conflictos y trazabilidad, no gráficos decorativos.
- Los datos simulados o provisionales deben identificarse claramente.
- Ninguna pantalla debe parecer un CRUD genérico sin relación con el trabajo real.

## 14. Navegación inicial

### Administrador

- Dashboard operacional.
- Morosos.
- Órdenes.
- Técnicos y asignaciones.
- Auditoría.

### Técnico

- Jornada.
- Órdenes asignadas.
- Detalle operativo.
- Pendientes de sincronización.

## 15. Pantallas principales

### Dashboard administrativo

Mostrar estados operativos, físicos y de sincronización por separado. Debe distinguir órdenes sin asignar, `GENERADO`, `EJECUTADO`, `ANULADO`, bloqueadas y `PHYSICAL_UNKNOWN`, además de sincronización `pending`, `syncing`, `synced` y `failed`.

### Búsqueda de morosos

Permitir localizar un registro por campos confirmados y abrir su contexto antes de crear una orden.

### Creación y asignación individual

Mostrar suministro, deuda, medidor, advertencias y técnico seleccionado antes de confirmar.

### Jornada técnica

Mostrar únicamente órdenes asignadas, última actualización, conectividad y estado de sincronización.

### Detalle operativo

Mostrar cliente, domicilio, dirección, referencias, medidor, Kardex, deuda, mapa, fecha de datos y acciones de visita.

### Registro de campo y corte

Capturar lectura, GPS, precisión, evidencia, excepciones y autorización. Mostrar confirmación inequívoca antes de registrar resultado físico.

### Trazabilidad administrativa

Mostrar creación, asignación, descarga, visita, autorización, resultado, sincronización, actor y timestamps sin permitir alteración silenciosa.

## 16. Seguridad e integridad

Las órdenes de corte afectan un servicio esencial y deben preservar autorización, integridad y trazabilidad.

El sistema debe evitar acceso entre técnicos, escalamiento de privilegios, órdenes duplicadas, cortes improcedentes, pérdida de operaciones, exposición innecesaria de datos personales y modificación silenciosa del historial.

Cada orden, lote futuro y operación debe disponer de identificador único. Sincronización y comandos remotos deben ser idempotentes. No se debe utilizar “última escritura gana” para asignaciones, anulaciones, pagos, autorizaciones ni resultados físicos.

## 17. Arquitectura tecnológica objetivo

```text
Administración web + PWA técnica
React + TypeScript

PWA
Service Worker

Persistencia local
IndexedDB

Sincronización
Sync Engine + Sync Queue

Backend del piloto
API REST

Base de datos central
PostgreSQL
```

La arquitectura debe permitir evolucionar desde el prototipo hacia el producto real sin rehacer el dominio.

## 18. Estrategia de desarrollo

### Fase 0 — Descubrimiento

- Validar el Excel.
- Confirmar el significado de los campos.
- Confirmar reglas con SEPSA.
- Validar el flujo real del técnico.
- Definir el contrato de la futura API.

### Fase 1 — Base técnica histórica

Conservar prototipo de campo offline de cortes/reconexiones ya implementado como base verificable.

### Fase 2 — Corte vertical multirol

Implementar autenticación y permisos, búsqueda administrativa, creación y asignación individual, contexto técnico completo, captura de campo, corte, sincronización y auditoría administrativa.

### Fase 3 — Operación por lotes

Agregar asignación masiva con vista previa, deduplicación, confirmación y trazabilidad por lote.

### Fase 4 — Integración y validación

Conectar contratos validados con SEPSA y probar en Android con usuarios reales, datos controlados y conectividad rural.

### Fase 5 — Evolución confirmada

Definir continuidad de cobranza, reconexiones, cartografía offline avanzada y otras capacidades solo mediante requisitos aprobados.

## 19. Criterios de éxito del primer corte vertical

1. Un administrador autenticado busca un moroso y consulta toda su información operativa.
2. Crea una orden individual sin duplicarla y la asigna a un técnico.
3. El técnico autenticado descarga únicamente sus órdenes.
4. Consulta offline cliente, domicilio, medidor, Kardex, deuda, dirección y último dato disponible.
5. Registra visita, lectura, GPS disponible y evidencia sin perder datos al cerrar o reiniciar.
6. No ejecuta el corte sin autorización online concluyente, vigente y de un solo uso.
7. Un pago detectado, timeout, conflicto o condición de elegibilidad inválida bloquea el corte.
8. El resultado físico se persiste antes de mostrar éxito y se sincroniza sin duplicados.
9. El administrador consulta resultado, actor, tiempos, evidencia y estado de sincronización.
10. Pruebas reproducibles cubren permisos, offline, reinicio, concurrencia, pago detectado y recuperación incierta.

## 20. Principios no negociables

1. **Offline primero.** Las operaciones normales no pueden depender de Internet.
2. **No asumir datos.** Los campos de SEPSA deben validarse antes de convertirse en reglas.
3. **Mínimo privilegio.** Cada técnico accede solo a sus órdenes; administración opera con permisos explícitos y auditados.
4. **Corte seguro.** Ningún resultado incierto o desactualizado habilita una acción física.
5. **Sin pérdida de datos.** Las operaciones confirmadas localmente deben persistir.
6. **Simplicidad operacional.** Cada experiencia debe adaptarse al rol y contexto de trabajo.
7. **Trazabilidad completa.** Creación, asignación, autorización, ejecución y sincronización deben poder reconstruirse.
8. **API provisional explícita.** El Excel y los mocks son referencias, no contratos oficiales.
9. **Incremento vertical.** Completar una orden de extremo a extremo antes de creación masiva.
10. **Validación en campo.** Las decisiones críticas deben probarse en Android y en condiciones reales.

## 21. Estado del proyecto

### Confirmado

- Roles iniciales: administrador y técnico.
- Administrador con acceso a toda información operativa incluida en el piloto.
- Dashboard, búsqueda de morosos, creación y asignación de órdenes.
- Creación masiva confirmada después del primer corte vertical y disponible con lote idempotente.
- Técnico limitado a órdenes asignadas.
- Técnico con consulta de Kardex, mapa, domicilio, cliente y medidor.
- Captura de lectura y GPS dentro del trabajo de campo.
- Autorización online obligatoria inmediatamente antes del corte.
- Persistencia y consulta técnica offline.
- Sincronización posterior, idempotencia y trazabilidad.
- PWA técnica como primera opción para Android.
- Excel como referencia inicial y API oficial como integración futura.

### Pendiente de confirmar con SEPSA

- Significado exacto de todos los campos del Excel.
- Relación definitiva entre cliente, cuenta, domicilio o suministro y medidor.
- Fuente, estructura, vigencia y semántica del Kardex y deuda.
- Contrato de la futura API.
- Autenticación institucional y administración futura de cuentas.
- Validación numérica y procedimiento excepcional cuando no pueda obtenerse lectura.
- Umbral de precisión, privacidad y retención del GPS.
- Políticas de auditoría.
- Resolución de reasignaciones, anulaciones y datos obsoletos con técnicos offline.
- Continuidad de cobranza presencial y alcance futuro de reconexiones.

## 22. Regla fundamental

> **El sistema debe conectar la decisión administrativa con la ejecución técnica sin perder autorización, contexto ni trazabilidad.**

La tecnología debe adaptarse al trabajo real de cada rol. Ninguna conveniencia administrativa o visual puede comprometer seguridad del corte, integridad de datos o capacidad offline del técnico.

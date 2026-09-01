# AGENTS.md — Guía de agentes del proyecto

## 1. Propósito

Este archivo define las reglas que deben seguir los agentes de IA y asistentes de código que trabajen en el proyecto de cobranza eléctrica rural de SEPSA.

La prioridad es construir un sistema **confiable, Offline-First, simple para el técnico y seguro para las operaciones financieras**.

Antes de implementar cualquier funcionalidad, el agente debe consultar `constitucion.md` y tratarlo como la fuente principal de requisitos del producto.

---

## 2. Regla principal

> **No asumir. Preguntar, validar o marcar como pendiente cualquier requisito que no esté confirmado.**

El proyecto trabaja con datos reales de SEPSA. No se deben inventar significados para columnas, estados, códigos, reglas de negocio, tarifas, procesos administrativos o contratos de API.

Si una decisión no está definida:

- no inventarla;
- no ocultarla;
- no convertirla en una regla permanente;
- documentarla como pendiente;
- solicitar aclaración cuando sea necesario para continuar.

---

## 3. Fuente de verdad

Orden de prioridad:

1. `constitucion.md`
2. Requisitos explícitos proporcionados por el equipo/SEPSA.
3. Decisiones técnicas documentadas.
4. Código existente.
5. Suposiciones mínimas y temporales.

Si existe conflicto entre código y requisitos confirmados, el agente debe señalarlo antes de modificar comportamiento crítico.

---

## 4. Principios de desarrollo

### 4.1 Offline-First

El sistema debe diseñarse suponiendo que Internet puede desaparecer en cualquier momento.

Una operación normal del técnico no debe depender de una respuesta inmediata del servidor.

Flujo esperado:

```text
Usuario
  ↓
Aplicación
  ↓
Base local
  ↓
Cola de sincronización
  ↓
Internet disponible
  ↓
API
```

Nunca diseñar:

```text
Usuario
  ↓
API
  ↓
Error si no hay Internet
```

### 4.2 Local primero, sincronización después

Cuando una operación pueda realizarse offline:

1. validar localmente;
2. persistir localmente;
3. confirmar al usuario;
4. registrar operación pendiente;
5. sincronizar posteriormente.

No mostrar "éxito" si los datos locales no fueron persistidos correctamente.

### 4.3 No perder operaciones

Una operación financiera confirmada no puede desaparecer por:

- pérdida de conexión;
- cierre de la aplicación;
- recarga;
- reinicio del dispositivo;
- fallo temporal del servidor;
- error de sincronización.

### 4.4 Idempotencia

Las operaciones sincronizadas deben poder reintentarse sin producir duplicados.

Los pagos y otras operaciones importantes deben tener identificadores únicos generados de forma segura.

### 4.5 Trazabilidad

Los cobros deben conservar información suficiente para saber:

- quién realizó el cobro;
- cuándo;
- a qué domicilio;
- qué meses se pagaron;
- cuánto se cobró;
- identificador de operación;
- estado de sincronización.

---

## 5. Reglas de negocio que el agente debe respetar

### Cobro

- El cobro es opcional durante una visita.
- El único método de pago del MVP es efectivo.
- Los pagos se realizan por meses completos.
- Nunca permitir fracciones de mes.
- Los meses más antiguos deben pagarse primero.
- El técnico no puede seleccionar arbitrariamente meses posteriores dejando meses anteriores pendientes.
- Después de confirmar un pago, la deuda local debe actualizarse inmediatamente.

Ejemplo:

```text
21 meses pendientes
        ↓
Pago de 6 meses
        ↓
15 meses pendientes
```

### Lecturas

La lectura del medidor **no forma parte del MVP actual**.

No implementar campos, flujos o persistencia de lecturas salvo solicitud explícita.

### Domicilios

El técnico solamente debe trabajar con sus domicilios asignados.

No asumir que puede acceder a domicilios de otros técnicos.

---

## 6. Sincronización

La sincronización debe considerarse un subsistema propio.

Debe existir conceptualmente:

```text
Local Database
     │
     ├── entidades locales
     │
     └── Sync Queue
             │
             ▼
        Sync Engine
             │
             ▼
           API
```

La cola debe permitir:

- operaciones pendientes;
- reintentos;
- estados;
- errores;
- identificadores únicos;
- recuperación después de reiniciar la aplicación.

Estados recomendados:

```text
pending
syncing
synced
failed
```

No eliminar una operación de la cola hasta tener confirmación válida de procesamiento.

---

## 7. Conflictos

No usar "última escritura gana" como solución universal.

Especialmente para operaciones financieras.

Un pago confirmado representa una operación histórica y debe preservarse.

Si existe un conflicto que no puede resolverse automáticamente:

```text
No inventar una resolución.
Registrar el conflicto.
Mantener la información.
Marcarlo para revisión.
```

Las reglas definitivas de resolución de conflictos deben ser acordadas con SEPSA.

---

## 8. API

La API de SEPSA es una integración futura.

No crear contratos ficticios y no inventar endpoints como si ya existieran.

Mientras no exista especificación oficial:

- usar interfaces/adapters;
- mock services;
- datos simulados;
- contratos claramente marcados como provisionales.

El dominio de la aplicación no debe quedar acoplado directamente a una futura implementación concreta de la API.

Preferir:

```text
Domain
  ↓
Repository / Service interface
  ↓
Local implementation
  ↓
API implementation
```

---

## 9. Excel

El Excel actual es una fuente de referencia y migración inicial.

No tratarlo como la base de datos definitiva.

No asumir el significado de columnas desconocidas.

Si una columna no está confirmada:

```text
TODO: VALIDAR CON SEPSA
```

El agente debe conservar la distinción entre:

- dato conocido;
- dato inferido;
- dato pendiente de confirmación.

---

## 10. UX/UI

La aplicación está destinada a técnicos trabajando en campo.

Toda interfaz debe priorizar:

1. claridad;
2. velocidad;
3. legibilidad;
4. acciones grandes;
5. mínima escritura;
6. mínima navegación;
7. funcionamiento offline;
8. información financiera claramente visible.

Antes de agregar una pantalla, preguntar:

> ¿Esta pantalla ayuda directamente al técnico a completar su trabajo?

Evitar:

- dashboards innecesarios;
- tablas administrativas;
- formularios largos;
- configuraciones complejas;
- animaciones que dificulten el uso;
- información irrelevante.

La ausencia de conexión debe comunicarse claramente, pero no debe interrumpir el trabajo.

---

## 11. Arquitectura tecnológica

Objetivo inicial:

```text
React
TypeScript
PWA
Service Worker
IndexedDB
Sync Engine
REST API
PostgreSQL
```

No introducir frameworks o dependencias adicionales sin una razón técnica clara.

Preferir tecnologías maduras, pequeñas y mantenibles.

---

## 12. Desarrollo incremental

No implementar toda la arquitectura futura de una sola vez.

Orden recomendado:

### Paso 1
Prototipo UX.

### Paso 2
Modelo de dominio.

### Paso 3
Persistencia local.

### Paso 4
Flujo de visitas.

### Paso 5
Flujo de cobranza.

### Paso 6
Comprobantes.

### Paso 7
Sync Queue.

### Paso 8
Sync Engine.

### Paso 9
Backend/API.

### Paso 10
Integración con SEPSA.

Cada etapa debe poder probarse antes de avanzar.

---

## 13. No sobreingeniería

No construir funcionalidades solamente porque podrían ser útiles en el futuro.

Ejemplos fuera del MVP:

- IA;
- IoT;
- pagos digitales;
- lectura automática;
- rutas inteligentes;
- analítica avanzada;
- dashboard administrativo.

Si una funcionalidad futura aparece durante el desarrollo:

1. documentarla;
2. no implementarla automáticamente;
3. mantener el MVP enfocado.

---

## 14. Código

### Calidad

El código debe ser:

- legible;
- modular;
- tipado;
- testeable;
- mantenible.

Evitar archivos gigantes y lógica duplicada.

### TypeScript

Evitar `any` salvo casos justificados.

Preferir tipos explícitos para entidades de dominio.

### Dominio

Las reglas críticas deben vivir en lógica reutilizable, no únicamente en componentes visuales.

Por ejemplo, la regla:

```text
los meses más antiguos primero
```

no debe depender exclusivamente de un botón de la UI.

Debe existir una validación de dominio.

---

## 15. Persistencia local

La base local debe considerarse parte esencial del sistema.

No utilizar únicamente:

```text
React state
```

para información que deba sobrevivir a una recarga.

Preferir IndexedDB para datos persistentes.

Separar conceptualmente:

```text
Domain data
Sync metadata
Pending operations
Application preferences
```

---

## 16. Errores

Los errores deben ser comprensibles para el técnico.

Evitar:

```text
Error 500
NetworkError
Unhandled exception
```

Mostrar mensajes orientados a la acción:

```text
No hay conexión.
El cobro quedó guardado y se sincronizará automáticamente.
```

o:

```text
No pudimos sincronizar este cobro.
Tus datos siguen guardados en el dispositivo.
```

Nunca indicar que una operación se perdió si no se ha comprobado.

---

## 17. Seguridad

Nunca:

- guardar contraseñas en texto plano;
- exponer secretos en frontend;
- incluir credenciales de API en el código;
- confiar únicamente en validaciones del cliente;
- permitir modificar libremente pagos históricos.

El backend debe validar las operaciones cuando exista API.

El frontend debe validar también para proporcionar una buena UX, pero la validación del cliente no sustituye la seguridad del servidor.

---

## 18. Pruebas obligatorias

Antes de considerar estable el flujo de cobranza, probar como mínimo:

### Offline

- abrir aplicación sin Internet;
- buscar domicilio;
- consultar deuda;
- registrar visita;
- registrar pago;
- generar comprobante;
- cerrar aplicación;
- volver a abrir;
- comprobar persistencia.

### Sincronización

- recuperar conexión;
- sincronizar;
- perder conexión durante sincronización;
- reintentar;
- evitar duplicación;
- comprobar estado final.

### Cobranza

Probar:

```text
0 meses
1 mes
varios meses
todos los meses pendientes
más meses de los permitidos
fracciones
```

Las operaciones inválidas deben rechazarse.

---

## 19. Datos financieros

Los valores monetarios no deben manejarse mediante cálculos imprecisos de punto flotante cuando exista riesgo de error.

Preferir unidades enteras mínimas o una representación decimal controlada.

Ejemplo conceptual:

```text
Bs 240.50
```

debe almacenarse de manera determinista.

---

## 20. Comprobantes

Cada comprobante debe tener un identificador único.

Ejemplo:

```text
CP-20260901-000123
```

No reutilizar identificadores.

El comprobante debe poder consultarse offline después de haber sido generado.

---

## 21. Observabilidad

El sistema debe poder responder posteriormente:

- ¿qué operación ocurrió?
- ¿cuándo ocurrió?
- ¿en qué dispositivo?
- ¿qué técnico la realizó?
- ¿se sincronizó?
- ¿falló?
- ¿cuántas veces se intentó sincronizar?

La observabilidad debe implementarse sin exponer información sensible innecesariamente.

---

## 22. Cambios de requisitos

Si el equipo modifica una regla de negocio:

1. identificar qué documentos/código afecta;
2. actualizar la documentación;
3. revisar el dominio;
4. revisar la persistencia;
5. revisar sincronización;
6. revisar UI;
7. agregar/modificar pruebas.

No corregir solamente la pantalla y dejar inconsistente el resto del sistema.

---

## 23. Antes de implementar

Para cada tarea importante, el agente debe determinar:

### Contexto
¿Qué problema resuelve?

### Datos
¿Qué entidades modifica?

### Offline
¿Debe funcionar sin conexión?

### Sincronización
¿Debe entrar en la cola?

### Seguridad
¿Contiene información financiera o sensible?

### UX
¿Cuál es el camino mínimo para el técnico?

### Compatibilidad
¿Afecta futuras integraciones con la API?

Si alguna respuesta no está clara y puede afectar la arquitectura, preguntar antes de implementar.

---

## 24. Definition of Done

Una funcionalidad no está terminada solamente porque "funciona".

Debe cumplir:

- requisito confirmado;
- lógica de dominio correcta;
- UX clara;
- funcionamiento offline cuando corresponda;
- persistencia correcta;
- sincronización correcta cuando corresponda;
- manejo de errores;
- pruebas;
- sin duplicación;
- documentación actualizada cuando sea necesario.

---

## 25. Regla final para agentes

> **Construir menos, pero correctamente.**

Este proyecto maneja dinero, deuda y trabajo de campo en condiciones de conectividad limitada.

La prioridad absoluta es:

```text
Confiabilidad
    ↓
Integridad de datos
    ↓
Offline-First
    ↓
Simplicidad
    ↓
Velocidad
    ↓
Escalabilidad
    ↓
Funcionalidades futuras
```

Nunca sacrificar confiabilidad financiera u offline por agregar una funcionalidad secundaria.

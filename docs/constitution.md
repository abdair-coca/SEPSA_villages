# Constitución del Proyecto — Sistema de Cobranza Eléctrica Rural

## 1. Identidad

- **Nombre provisional:** Sistema de Cobranza Eléctrica Rural
- **Institución:** SEPSA
- **Usuario inicial:** Técnico de campo
- **Plataforma inicial:** PWA instalable, optimizada para Android
- **Arquitectura:** Offline-First

## 2. Propósito

Crear una aplicación para que los técnicos de SEPSA gestionen sus domicilios asignados, consulten deudas, registren visitas y realicen cobros presenciales en efectivo, incluso cuando no exista conexión a Internet. Los cambios realizados offline deberán sincronizarse automáticamente al recuperar conectividad.

El objetivo es reducir la dependencia del papel y facilitar una cobranza presencial simple, confiable y trazable en zonas rurales.

## 3. Alcance del MVP

### Incluido

- Inicio de sesión del técnico.
- Visualización exclusiva de domicilios asignados.
- Búsqueda y consulta de domicilios.
- Consulta de meses adeudados y deuda total.
- Registro de visita.
- Cobro presencial en efectivo.
- Pago exclusivamente por meses completos.
- Aplicación automática de los meses más antiguos primero.
- Actualización inmediata de deuda y meses pendientes.
- Generación de comprobante.
- Historial de cobros del técnico.
- Persistencia local.
- Cola de operaciones pendientes.
- Estado de sincronización.
- Sincronización automática al recuperar conexión.

### Fuera del MVP

- Registro de lecturas del medidor.
- Medición automática del consumo.
- IoT / smart meters.
- Pagos digitales.
- Cálculo propio de facturación.
- Dashboard administrativo.
- Gestión administrativa de técnicos.
- IA.
- Analítica avanzada.
- Optimización automática de rutas.

## 4. Flujo principal

```text
Login
  ↓
Mis domicilios
  ↓
Seleccionar domicilio
  ↓
Consultar deuda
  ↓
Registrar visita
  ↓
¿El usuario paga?
  ├── No → Finalizar visita
  └── Sí → Seleccionar meses
             ↓
         Cobro en efectivo
             ↓
         Confirmación
             ↓
         Comprobante
             ↓
         Deuda actualizada
             ↓
         Pendiente de sincronización
             ↓
         Recuperar conexión
             ↓
         Sincronizar
```

## 5. Reglas de negocio

### 5.1 Meses completos

Los pagos solo pueden representar una cantidad entera de meses. No se permiten fracciones.

### 5.2 Meses más antiguos primero

El usuario siempre paga primero los meses pendientes más antiguos. El técnico no puede seleccionar arbitrariamente meses posteriores dejando meses anteriores pendientes.

Ejemplo:

```text
Deuda: Enero, Febrero, Marzo, Abril, Mayo
Pago de 3 meses:
✓ Enero
✓ Febrero
✓ Marzo
✗ Abril
✗ Mayo
```

### 5.3 Actualización de deuda

Si un domicilio tiene 21 meses pendientes y paga 6, debe quedar inmediatamente con 15 meses pendientes. El mismo principio se aplica al importe de la deuda.

### 5.4 Método de pago

Durante el MVP el único método permitido es **efectivo**.

### 5.5 Cobro opcional

Una visita no implica necesariamente un cobro. Si el usuario no paga, se registra la visita, pero no se crea un pago.

### 5.6 Comprobante

Cada cobro debe generar un comprobante digital con institución, cliente, código de domicilio, meses pagados, importe, método de pago, técnico, fecha, identificador único y estado de sincronización.

## 6. Offline-First

El funcionamiento sin conexión es un requisito central, no una funcionalidad secundaria.

Sin Internet el técnico debe poder:

- consultar sus domicilios;
- buscar domicilios;
- consultar deudas y meses pendientes;
- registrar visitas;
- registrar cobros;
- generar comprobantes;
- consultar cobros realizados;
- continuar trabajando normalmente.

La pérdida de conexión no debe bloquear el flujo operativo.

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

Situación futura:
SEPSA API ↔ backend ↔ aplicación del técnico
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
Técnico
   │
   └── Asignaciones
           │
           ▼
       Domicilio
           │
      ┌────┴────┐
      ▼         ▼
   Cliente    Medidor
      │
      ▼
    Deuda
      │
      ▼
    Meses
      │
      ▼
    Pagos
      │
      ▼
 Comprobantes
```

Este es un modelo conceptual y deberá validarse antes de definir el esquema definitivo.

## 13. UX / UI

La interfaz debe estar diseñada para técnicos que trabajan físicamente en campo.

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

La deuda, los meses pendientes y la acción de cobro deben tener prioridad visual.

La aplicación no debe parecer un CRUD administrativo genérico.

## 14. Navegación inicial

La navegación móvil tendrá cuatro áreas principales:

- Inicio
- Domicilios
- Cobros
- Más

## 15. Pantallas principales

### Inicio

Mostrar técnico, domicilios asignados, pendientes, visitados, cobros, monto cobrado, última sincronización y estado de conexión.

### Domicilios

Mostrar exclusivamente los domicilios asignados al técnico. Incluir búsqueda y filtros básicos.

### Detalle del domicilio

Mostrar nombre, código, dirección, localidad, medidor, estado, meses pendientes, deuda total y acciones para registrar visita o cobrar.

### Cobranza

Mostrar deuda, cantidad de meses a pagar, meses que serán aplicados y total. Los meses se asignan automáticamente desde el más antiguo.

### Confirmación de cobro

Mostrar cliente, meses, total y método efectivo antes de confirmar.

### Pago registrado

Mostrar meses pagados, importe, deuda restante, estado de sincronización y acceso al comprobante.

### Comprobante

Debe poder consultarse offline y contener un identificador único.

### Historial

Mostrar los cobros del técnico y su estado de sincronización.

## 16. Seguridad e integridad

Los cobros son operaciones financieras y deben preservar trazabilidad.

El sistema debe evitar:

- cobros duplicados;
- pérdida de operaciones;
- modificación silenciosa de pagos;
- comprobantes duplicados;
- inconsistencias entre pagos y deuda.

Cada operación financiera debe disponer de un identificador único y ser idempotente al sincronizar.

No se debe utilizar simplemente “última escritura gana” para operaciones financieras.

## 17. Arquitectura tecnológica objetivo

```text
Frontend
React + TypeScript

PWA
Service Worker

Persistencia local
IndexedDB

Sincronización
Sync Engine + Sync Queue

Backend futuro
API REST

Base de datos futura
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

### Fase 1 — Prototipo UX

Construir un prototipo HTML/CSS/JS navegable para validar el flujo antes del backend.

### Fase 2 — MVP PWA

Implementar autenticación, domicilios, deuda, visitas, cobros, comprobantes, almacenamiento local y sincronización.

### Fase 3 — Integración

Conectar con la API de SEPSA.

### Fase 4 — Validación en campo

Probar con técnicos reales en condiciones reales de conectividad.

### Fase 5 — Evolución

Evaluar lecturas, mapas, rutas, administración, analítica, IoT e IA.

## 19. Criterios de éxito del MVP

El MVP debe permitir que un técnico:

1. inicie sesión;
2. vea únicamente sus domicilios;
3. consulte una deuda sin conexión;
4. registre una visita sin conexión;
5. registre un cobro en efectivo sin conexión;
6. seleccione únicamente meses completos;
7. aplique automáticamente los meses más antiguos;
8. obtenga un comprobante;
9. vea la deuda actualizada inmediatamente;
10. cierre y vuelva a abrir la aplicación sin perder cambios;
11. recupere conexión;
12. sincronice automáticamente las operaciones pendientes;
13. mantenga trazabilidad de los pagos.

## 20. Principios no negociables

1. **Offline primero.** Las operaciones normales no pueden depender de Internet.
2. **No asumir datos.** Los campos de SEPSA deben validarse antes de convertirse en reglas.
3. **Meses completos.** Nunca permitir fracciones.
4. **Meses más antiguos primero.** El sistema controla el orden de aplicación.
5. **Sin pérdida de datos.** Las operaciones confirmadas localmente deben persistir.
6. **Simplicidad operacional.** El técnico debe requerir mínima capacitación.
7. **Trazabilidad financiera.** Cada pago debe poder identificarse y rastrearse.
8. **API como evolución natural.** El Excel es una referencia inicial.
9. **MVP enfocado.** Resolver perfectamente la cobranza presencial offline antes de agregar funcionalidades futuras.
10. **Validación en campo.** Las decisiones críticas deben probarse en Android y en condiciones reales.

## 21. Estado del proyecto

### Confirmado

- Usuario principal: técnico.
- Domicilios asignados por técnico.
- Cobro presencial opcional.
- Método de pago: efectivo.
- Pago por meses completos.
- Meses antiguos primero.
- Actualización inmediata de deuda local.
- Funcionamiento sin conexión.
- Sincronización posterior.
- Comprobante.
- PWA como primera opción.
- Excel como referencia inicial.
- API de SEPSA como integración futura.
- Lectura del medidor fuera del MVP.

### Pendiente de confirmar con SEPSA

- Significado exacto de todos los campos del Excel.
- Estructura definitiva de deuda.
- Contrato de la futura API.
- Reglas de conciliación del dinero entregado por técnicos.
- Formato oficial del comprobante.
- Políticas de auditoría.
- Resolución de conflictos.
- Autenticación y seguridad.
- Detalles administrativos posteriores al MVP.

## 22. Regla fundamental

> **El sistema debe adaptarse al trabajo real del técnico, no obligar al técnico a adaptarse al sistema.**

La tecnología debe hacer que el proceso de campo sea más rápido, confiable y trazable, especialmente cuando existe poca o ninguna conectividad.

---
title: "Análisis de video 3:30 — Flujo buscar orden hasta corte efectivo"
type: "validation"
status: "inferred"
confidence: "medium"
source: "video-3min-corte-efectivo"
related:
  - "evidence-map.md"
  - "uncertainties.md"
  - "assumptions.md"
  - "../../00-system-context/glossary.md"
---

# Análisis de video 3:30 — De buscar orden a corte efectivo

**Alcance del video:** Dashboard → Ver órdenes de corte → buscar por cuenta → expandir orden → detalle completo → registrar corte efectivo (GPS + técnico + tipo + lectura) → validaciones → guardado → "Actualización exitosa".
**Duración aprox:** 3:30 min. **Foco:** expediente del suministro (deuda → orden → corte → evidencia → pago → reconexión), no solo registro de cortes.

**Leyenda:** ✅ confirmado por el video · 🟡 inferencia fuerte · ❓ no determinable con el video.
**Regla:** lo ❓ y 🟡 no se vuelve regla de negocio. Queda `TODO: VALIDAR CON SEPSA`.

## 1. Flujo general reconstruido

```text
Dashboard → Ver órdenes de corte → Buscar orden → Resultados → Seleccionar/expandir
→ Detalle (cliente, medidor, deuda, evidencias, trazabilidad, estado)
→ Registrar corte efectivo (GPS + técnico + tipo + lectura)
→ Validaciones → Guardar → Actualización exitosa
```

## 2. Dashboard

✅ Opciones visibles: Ver órdenes de corte, Búsqueda de Morosidad / Crear orden, Suspensiones por Morosidad por realizar, Suspendidos por Morosidad realizados. 🟡 "Verificar estados por pagos (SQL)" parece reconciliación pagos↔órdenes. ❓ Detalle interno de cada sección no se ve.

## 3. Órdenes de corte — búsqueda

✅ Modos: por parámetros, por orden, por cuenta, por correlativo, por creador, por asignación de técnico. ✅ Filtros por parámetros: Desde, Hasta, Título (`TODOS`), Área, Localidad, Ruta. ✅ Existe "+ Crear Orden de corte" en la misma pantalla. ❓ Significado exacto de "Título" — `TODO: VALIDAR CON SEPSA`.

## 4. Búsqueda por cuenta

✅ Cuenta `504602` devuelve 2 registros históricos: `446921 → ANULADO`, `446920 → GENERADO`. ✅ Una cuenta puede tener varias órdenes históricas. ❓ No demuestra dos `GENERADO` simultáneas. Regla provisional: máximo una activa por cuenta/medidor, pendiente de validación.

## 5. Detalle del resultado

✅ Campos: Cuenta `504602`, Cliente `CHUMACERO RODRIGUEZ TEODORO`, Ruta `493 | MONTE NEGRO`, Medidor `13456634 (NANSEN)`, Fecha Generación `11-09-2026 14:41:27`, Fecha Corte/Pago/Reconex/Inhab vacías. ✅ Acciones "Ver Orden" y "Ver Corte".

## 6. Detalle completo (C.U.C. 446920, Cuenta 504602, ESTADO GENERADO)

✅ Acciones: Ver Trazabilidad, Ver Orden de ruta, ACTUALIZAR, Ver Kardex, Verificar Deuda. ✅ Sección principal: Nro. registro `446920`, Cuenta, Estado actual `A`, Tit. Hab. `R`, Medidor + marca, Correlativo `Pendiente de corte`, Estado `GENERADO`, Consumidor, Dirección `MONTE NEGRO S/N`, Medidores cercanos `Sin definir`, Reconexión Manual `Sin definir`, Teléfono vacío, Índice medidor vacío. ✅ Botones "Anular Orden de Corte" y "Verificar permiso de coordenadas".

## 7. GENERADO

✅ Regla confirmada: "Registro generado. Pendiente de realizar el corte." `GENERADO ≠ cortado`.

## 8. Archivos y fotografías

✅ Uploader admite `PDF, DOC, DOCX, JPG, PNG`, máximo `20 MB`. ✅ Tras subir conserva: preview, tipo, relación `Archivo del corte con CUC: 446920`, tamaño, fecha/hora `11/09/2026 02:43 p. m.`, usuario. Conclusión modelo: evidencia es entidad 1:N, no columna. ⚠️ Regla móvil propia `JPEG/PNG ≤ 5 MP` no pertenece al sistema observado — requiere aprobación SEPSA.

## 9. Datos de Corte (14 campos)

✅ Existen los 14: Fecha Corte, Técnico Corte, Código Técnico Corte, Tipo de Corte, Lugar de Corte, Lectura Corte, Usuario Corte, Evita Control Coordenadas, Motivo Evasión, Corte Registrado por/en, Motivo Corte No Efectuado, Teléfono Contacto, Medidores cercanos/panel. ✅ Teléfono quedó vacío y aun así hubo "Actualización exitosa" → no obligatorio en ese flujo.

## 10. Suspensión

✅ Campos existen (Fecha Inhabilitación/suspensión, Usuario, Fecha Real, registrado por/en, Observación), vacíos en el ejemplo. 🟡 Fecha Real ≈ momento físico real vs fecha registrada/programada. ❓ Obligatoriedad y actor — pendiente.

## 11. Pago

✅ `Fecha Pago: Pendiente de Pago`, `Tiene Plan de Pago: NO`. ✅ Orden sigue monitoreada tras el corte. ❓ Efecto de plan de pago o pago parcial sobre anulación — no demostrado. No usar "cualquier pago anula" como regla confirmada.

## 12. Reconexión

✅ Confirmados 7 campos: Es Reconexión Manual, Orden Emitida Por/El, Fecha Reposición, Código/Técnico Reposición, Rehabilitación Registrado Por. Resto bajo el corte no visible. ✅ Relación explícita con `OTROS INGRESOS` (mensaje: existen registros pendientes → hacer reconexión primero). ❓ Condición formal `deuda=0 AND aranceles pagados` no demostrada.

## 13. Deuda

✅ Tabla "Detalle de la deuda actual": Periodo, Año, Monto Bs, Estado, Origen `FA_FACTURAS`, estado `P`. ✅ Ejemplo 18 facturas 03/2025–08/2026 suman `424.20 Bs` = DEUDA TOTAL. Sin columnas separadas de intereses. 🟡 Existe segunda tabla "a fecha de generación de orden" → snapshot histórico por diseño. Campos: Periodo, Año, Fecha Facturación, Monto, Estado. ❓ Snapshot físico vs reconstrucción — pendiente.

## 14. Registrar corte efectivo

✅ Campos: Latitud, Longitud, Teléfono, Medidores cercanos, Técnico (catálogo), Tipo de corte, Lectura (`Ej: 1234567`, ejemplo `4363`), `¿Saltarse Control de Fotos?`, `¿Saltarse Control de Coordenadas?`, Motivo evasión. ✅ Botón cambia a "Registrando corte..." → "Registro actualizado. | Actualizacion exitosa." Actualiza registro existente, no crea orden nueva. ❓ Estado posterior exacto no visible.

## 15. GPS

✅ Botón Obtener pide permiso navegador; ejemplo `Lat -19.5884303, Lng -65.756732` → "Ubicación obtenida correctamente." ✅ Sin permiso: "Permiso denegado. Habilite la ubicación." GPS ≠ internet: GPS puede funcionar sin conexión. ❓ Campo accuracy/umbral no visible en video.

## 16. Medidores cercanos

✅ Selector `SI/NO` (ejemplo `NO`), valor inicial `Sin definir`. Sirve para no desconectar medidor equivocado en paneles.

## 17. Técnico

✅ Selector con catálogo (ej. `MIGUEL CHAMBI MARCA`), no texto libre → modelar `technician_id` FK. ❓ Si ciertos usuarios pueden registrar a nombre de otros técnicos (el formulario lo permite) — pendiente de regla de autorización.

## 18. Tipo de corte

✅ Catálogo exacto: `RED, MEDIDOR, BARRAS, PROTECCION, ACOMETIDA, FUSIBLES` (ejemplo `MEDIDOR`). ❓ Otros configurables futuros y definiciones operativas — pendientes.

## 19. Lectura

✅ Entero positivo (`4363`, placeholder `1234567`). 🟡 "Índice de medidor al momento del corte" ≈ `Lectura Corte` (mismo dato en dos vistas). ❓ Unidad kWh explícita, rango, decimales, caso "sin lectura" — pendientes.

## 20. Control de fotos

✅ `¿Saltarse Control de Fotos? SI/NO` (ejemplo `NO` + 1 foto). ❓ Comportamiento con `SI` (¿motivo/autorización?) no probado — `TODO: VALIDAR CON SEPSA`.

## 21. Control de coordenadas

✅ `¿Saltarse Control de Coordenadas? = SI` → Motivo obligatorio, mínimo 15 caracteres (ej. "No se cuenta con buena señal"). Regla lista para implementar tal cual.

## 22. CUC vs correlativo

✅ Distintos: misma orden muestra `C.U.C.: 446920` y `Nro. de registro: 446920` pero `Correlativo de corte: Pendiente de corte`. 🟡 Nro. registro ≈ CUC (coinciden en el ejemplo). ❓ Momento de generación del correlativo (probable al efectuarse el corte) y si CUC se reutiliza tras anular — pendientes. Acrónimo C.U.C. no desarrollado en video ("Código Único de Corte" es interpretación, no definición oficial).

## 23. Modelo conceptual

```text
Cliente/Cuenta ─ Medidor ─ Facturas/Deudas ─ Orden de Corte ─ Ejecución ─ Evidencias ─ Trazabilidad ─ Suspensión ─ Pago ─ Reconexión
```

No una tabla única de cortes. Coherente con `ORDEN_CORTE` / `EJECUCION_CORTE` / `ADJUNTO_CORTE` en `docs/01-domain`.

## 24. Lógica offline para el técnico

Descargar órdenes asignadas + contexto antes de salir; en campo: abrir → ver datos → GPS → medidores cercanos → tipo → lectura → fotos → registrar; sin señal guardar local y sincronizar después. Separar `executed_at` / `synced_at` (+ `server_created_at`).

## 25. Base sólida para congelar en modelo provisional

CUC != correlativo · Nro. registro ≈ CUC (a confirmar) · Estados conocidos GENERADO/ANULADO · GENERADO = pendiente · Orden con cuenta/cliente/medidor/dirección/ruta/fechas/deuda/estado · Ejecución con técnico/tipo/lectura/teléfono opcional/medidores/GPS/evasión+motivo≥15/fotos · 6 tipos de corte · Evidencia con archivo/tipo/tamaño/CUC/usuario/fecha · Deuda actual + histórica a generación · Procesos posteriores suspensión/pago/reconexión.

## 26. Cinco respuestas críticas antes del sistema real

1. Catálogo oficial de estados y transiciones. 2. Generación de CUC y correlativo. 3. Reglas de morosidad/pago/anulación. 4. Diccionario de datos y catálogos. 5. Mecanismo de integración (API/BD/vistas) + ambiente de pruebas.

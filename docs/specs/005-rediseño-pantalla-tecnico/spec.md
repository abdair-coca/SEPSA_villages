# Especificación 005: Rediseño de pantalla técnica de campo

## Propósito

Rediseñar la jornada del Técnico para coincidir con la referencia visual aprobada, manteniendo operación offline-first, captura segura de campo, autorización online, persistencia local y sincronización existentes.

## Alcance

- Validación visual principal en escritorio de 1440 px y Android.
- Leaflet satelital actual, con caché existente.
- Datos reales del paquete local; faltantes visibles como “No disponible”.
- Sin cambios de rol, permisos, dominio financiero ni contratos de backend.
- Cambios aislados a la experiencia técnica; la pantalla administrativa no debe alterarse.

## Requisitos

### Requisito: Jornada operativa de dos columnas

La pantalla DEBE mostrar encabezado, conectividad, actualización, banner de simulación, banner de sincronización, cinco indicadores, siguiente orden y bandeja. En escritorio DEBE ubicar a la derecha mapa, cola de sincronización y actividad reciente. En Android DEBE apilar estos bloques sin perder acciones principales.

#### Escenario: Jornada en escritorio

- GIVEN un paquete local válido con órdenes asignadas
- WHEN el Técnico abre Jornada de campo en 1440 px
- THEN ve siguiente orden y Mis órdenes a la izquierda
- AND ve mapa, cola y actividad resumida a la derecha

### Requisito: Datos y estados verificables

Los indicadores DEBEN derivarse de estados actuales: Por ejecutar = `GENERADO`, En revisión = `PHYSICAL_UNKNOWN`, Ejecutadas = `EJECUTADO`, Anuladas = `ANULADO` y En cola = operaciones no sincronizadas. La interfaz DEBE usar “En revisión” y NO DEBE inventar deuda, distancia, GPS, precisión, coordenadas o evidencia.

#### Escenario: Dato ausente

- GIVEN una orden sin distancia o coordenadas reales
- WHEN se muestra su resumen o mapa
- THEN se informa “No disponible” o estado equivalente
- AND no se usa una coordenada calculada como ubicación operativa

### Requisito: Acciones conservan flujo seguro

“Registrar corte” DEBE abrir el formulario existente con lectura, GPS, evidencia, excepciones y autorización. “Marcar incidencia” DEBE reutilizar visita sin ejecución. Ninguna acción visual DEBE permitir corte sin autorización online concluyente y vigente.

#### Escenario: Incidencia de campo

- GIVEN una orden asignada que no puede ejecutarse
- WHEN el Técnico pulsa “Marcar incidencia”
- THEN registra visita sin ejecución mediante flujo existente
- AND conserva persistencia local y estado de sincronización

### Requisito: Mapa, cola y actividad

El mapa DEBE permanecer visible en escritorio y usar Leaflet satelital actual. En Android DEBE aparecer después de la orden y estar colapsado inicialmente. Cola y actividad DEBEN mostrar resumen con acceso a detalle completo bajo demanda.

#### Escenario: Trabajo sin conexión

- GIVEN el dispositivo queda offline
- WHEN el Técnico consulta Jornada
- THEN conserva órdenes, dirección y referencias locales
- AND la cola informa pendientes sin eliminar operaciones

### Requisito: Implementación validada por fases

La implementación DEBE ejecutarse en tres fases independientes. Cada fase DEBE terminar con evidencia y detenerse hasta recibir validación explícita del usuario. No se puede iniciar fase posterior sin aprobación de la anterior.

#### Escenario: Puerta de validación

- GIVEN una fase implementada y verificada
- WHEN se entrega su evidencia al usuario
- THEN el trabajo queda pausado
- AND la siguiente fase solo inicia después de aprobación explícita

## Fases

1. **Fase 1 — Composición visual:** estructura desktop, KPIs, banners, siguiente orden, bandeja y paneles derechos. Validación contra captura 1440 px.
2. **Fase 2 — Responsive e interacción:** adaptación Android, mapa colapsado, acciones, estados loading/empty/error/offline. Validación en viewport Android.
3. **Fase 3 — Integración y calidad:** datos reales, ausencia de coordenadas fallback, flujo de visita/corte, cola, sincronización, pruebas y comparación final.

## Criterios de aceptación

- [x] Cada fase fue validada explícitamente antes de continuar.
- [ ] Comparación visual final aprobada en 1440 px y Android. Requiere comprobación manual con paquete local cargado.
- [x] `npm run build` y `npm test` pasan: 17 archivos y 119 pruebas.
- [x] No se modifican permisos, autorización, persistencia ni trazabilidad.
- [x] No existen coordenadas operativas inventadas; datos faltantes muestran estado explícito.

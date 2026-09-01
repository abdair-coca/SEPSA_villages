# Propuesta: Prototipo UI/UX navegable de cobranza eléctrica rural

## Intención

Validar el flujo del técnico de SEPSA antes del backend o PWA: prototipo navegable HTML/CSS/JS vanilla, con simulación offline-first y persistencia local, probable con técnicos reales sin infraestructura.

## Alcance

### Incluido

- Prototipo navegable: `index.html`, `styles.css`, `app.js`.
- 11 pantallas del flujo del técnico.
- Navegación inferior: Inicio, Domicilios, Cobros, Más.
- 10–20 domicilios ficticios en escenarios variados (0/3/21 meses, visitado, pagado, pendiente de sync).
- Persistencia local (IndexedDB, fallback localStorage) y cola de cambios.
- Sync simulada con progreso y estados (`pending/syncing/synced/failed`).
- Reglas de dominio: meses completos, antiguos primero, deuda actualizada, comprobante con ID único.
- Responsive con prioridad móvil (frame móvil en desktop).

### Excluido

- Backend, API real o contrato definitivo de SEPSA.
- Lecturas de medidor, pagos digitales, dashboard administrativo, autenticación real.
- Tratamiento del Excel como base de datos.
- Frameworks, dependencias externas o build tooling.

## Capacidades

### Capacidades nuevas

- `boceto-mvp`: prototipo navegable de alta fidelidad que demuestra el flujo offline-first de cobranza del técnico con datos simulados y sincronización simulada.

### Capacidades modificadas

- Ninguna.

## Enfoque

Vanilla HTML/CSS/JS modular y migrable a React + TypeScript + PWA. Separación clara entre dominio (reglas de cobro), UI (pantallas) y capa de almacenamiento simulada (cola de cambios + estado de conexión). Sin build system.

## Áreas afectadas

| Área | Impacto | Descripción |
|------|---------|-------------|
| `docs/specs/001-Boceto-mvp/` | Nuevo | Especificaciones del cambio |
| `boceto-mvp/index.html` | Nuevo | Estructura semántica y navegación |
| `boceto-mvp/styles.css` | Nuevo | Sistema visual responsive |
| `boceto-mvp/app.js` | Nuevo | Lógica, datos simulados, dominio y sync simulada |

## Riesgos

| Riesgo | Probabilidad | Mitigación |
|--------|--------------|------------|
| Sobreingeniería del prototipo | Media | Limitar a vanilla, sin dependencias; prototipo descartable |
| Inventar significados de columnas del Excel | Media | Usar solo campos confirmados en constitution; no convertir el Excel en modelo |
| Simulación confundirse con producto real | Media | Marcar claramente estados "simulado" en UI y doc |

## Plan de reversión

Eliminar la carpeta del prototipo y las especificaciones del cambio. No hay migración ni servicios externos involucrados.

## Dependencias

- Ninguna externa. Fuente normativa: `constitution.md` y `AGENTS.md`.

## Criterios de éxito

- [ ] Abrir `index.html` en Android y desktop y recorrer el flujo completo sin errores.
- [ ] Registro de visita y cobro funcionan con conexión simulada desconectada.
- [ ] Deuda se actualiza inmediatamente tras confirmar cobro.
- [ ] Cambios persisten tras recargar la página.
- [ ] Simulación de sync marca operaciones pendientes → sincronizadas.
# Diseño: Boceto MVP del Ecosistema SEPSA (Pantallas Operativas Reales)

## Enfoque Técnico

Prototipo de alta fidelidad visual desarrollado en HTML5 semántico, CSS3 moderno y JavaScript vanilla modular. Se ejecuta localmente mediante ile:// en oceto-mvp/index.html sin frameworks, sin backend y sin dependencias externas.

## Arquitectura Visual y Paleta Institucional

El diseño calca la interfaz gráfica real observada en cortes.sepsa.net.bo:
- **Barra Superior**: Fondo blanco con borde sutil inferior, logotipo SEPSA, badge verde BASE DE DATOS OFICIAL (#198754), contador de notificaciones con badge rojo circular (#dc3545), icono de modo oscuro y avatar de usuario con inicial 'J' e identidad completa.
- **Botones y Badges de Corte**:
  - Botón rojo de acción principal: #c82333 / #dc3545 ('Crear orden de corte', 'Registrar corte efectivo', 'Ver Registros para Cortar').
  - Botón azul institucional: #0d6efd ('Buscar', 'Ver corte', 'Enviar').
  - Badge amarillo de sesión: #ffc107 con texto negro ('Actualización automática en 6 min 18 seg').
  - Badge verde: #198754 ('BASE DE DATOS OFICIAL', facturas canceladas C).

## Estructura de Pantallas y Navegación Interna

Toda la aplicación vive en una Single Page Architecture (SPA) ligera dentro de oceto-mvp/:
- #view-dashboard: Pantalla P-01 (Dashboard Principal).
- #view-busqueda: Pantalla P-02 (Búsqueda /orden/create).
- #view-bandeja: Pantalla P-03 (Bandeja /verCortes).
- #view-ficha: Pantalla P-04 (Ficha Integral /corte/{id}).
- #modal-corte: Pantalla P-05 (Modal emergente de corte efectivo).

La navegación se gestiona mediante la función central 
avigateTo(viewId, params).

## Modelo de Estado en Memoria (Store Volátil)

`javascript
const store = {
  usuario: {
    id: 680,
    ci: '10577452',
    nombre: 'JOSUE DANIEL QUINTANILLA TABOADA',
    email: 'josue.quintanilla@sepsa.com.bo',
    telefono: '+591 72409703'
  },
  temporizadorSegundos: 378, // 6 min 18 seg
  morososMojotorillo: [
    {
      cuenta: 306040,
      titular: 'MUÑOZ PEDRO',
      regionalLocalidad: '101 - 002',
      habilitante: 'R',
      ruta: '002',
      orden: 129,
      circuito: 'D-1182',
      direccion: 'MOJOTORILLO S/N',
      estado: 'A',
      tarifa: 'RS',
      medidor: '240907792 WASION',
      facturasVencidas30d: 2,
      totalPendiente: 66.82
    },
    {
      cuenta: 306043,
      titular: 'FLORES JUSTO',
      regionalLocalidad: '101 - 002',
      habilitante: 'R',
      ruta: '002',
      orden: 132,
      circuito: 'D-1182',
      direccion: 'MOJOTORILLO S/N',
      estado: 'A',
      tarifa: 'RS',
      medidor: '240907795 WASION',
      facturasVencidas30d: 2,
      totalPendiente: 45.20
    }
  ],
  ordenesCorte: [
    // 46 registros simulados iniciales con cálculo de dias_desde_generacion
  ],
  deudasPorCuenta: {
    306040: [
      { periodo: 6, anio: 2026, fecha: '2026-06-15', monto: 21.94, estado: 'P', origen: 'FA_FACTURAS', diasMora: 84 },
      { periodo: 7, anio: 2026, fecha: '2026-07-15', monto: 22.44, estado: 'P', origen: 'FA_FACTURAS', diasMora: 54 },
      { periodo: 8, anio: 2026, fecha: '2026-08-15', monto: 22.44, estado: 'P', origen: 'FA_FACTURAS', diasMora: 23 }
    ]
  }
};
`

## Manejo de Reglas de Negocio

- **BR-001 (Umbral)**: El filtro valida >= 2 facturas con antigüedad $> 30$ días.
- **BR-002 (Intereses)**: Banner visible informando la exclusión de intereses variables en los listados.
- **BR-003 (Anulación Automática)**: Disparador en P-04 que actualiza la orden a ANULADO con timestamp y texto de auditoría oficial.
- **BR-004 y BR-005 (Bypass GPS y Fotos)**: Controles de selección en P-05 que permiten guardar la ejecución material omitiendo validaciones de hardware.

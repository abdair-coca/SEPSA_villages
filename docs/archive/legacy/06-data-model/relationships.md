---
title: "Relaciones Técnicas y Claves Foráneas"
type: "data-model"
status: "confirmed"
confidence: "high"
source: "master-analysis"
related:
  - "data-model-overview.md"
  - "er-diagram.md"
---

# Relaciones Técnicas y Claves Foráneas

```sql
-- Definición formal de claves foráneas provisorias
ALTER TABLE CUENTA_SUMINISTRO
    ADD CONSTRAINT fk_cuenta_cliente FOREIGN KEY (ci_nit_titular) REFERENCES CLIENTE(ci_nit),
    ADD CONSTRAINT fk_cuenta_medidor FOREIGN KEY (nro_medidor_actual) REFERENCES MEDIDOR(nro_medidor),
    ADD CONSTRAINT fk_cuenta_ubicacion FOREIGN KEY (ruta_codigo) REFERENCES UBICACION_TECNICA(ruta_codigo);

ALTER TABLE FACTURA_DEUDA
    ADD CONSTRAINT fk_factura_cuenta FOREIGN KEY (cuenta_id) REFERENCES CUENTA_SUMINISTRO(cuenta_id);

ALTER TABLE ORDEN_CORTE
    ADD CONSTRAINT fk_orden_cuenta FOREIGN KEY (cuenta_id) REFERENCES CUENTA_SUMINISTRO(cuenta_id),
    ADD CONSTRAINT fk_orden_usuario FOREIGN KEY (usuario_asignado_id) REFERENCES USUARIO_SISTEMA(usuario_id);

ALTER TABLE EJECUCION_CORTE
    ADD CONSTRAINT fk_ejecucion_orden FOREIGN KEY (orden_corte_id) REFERENCES ORDEN_CORTE(nro_registro);

ALTER TABLE ADJUNTO_CORTE
    ADD CONSTRAINT fk_adjunto_orden FOREIGN KEY (orden_corte_id) REFERENCES ORDEN_CORTE(nro_registro);

ALTER TABLE REHABILITACION_RECONEXION
    ADD CONSTRAINT fk_rehab_orden FOREIGN KEY (orden_corte_id) REFERENCES ORDEN_CORTE(nro_registro);

ALTER TABLE SUSPENSION_REGISTRO
    ADD CONSTRAINT fk_suspension_orden FOREIGN KEY (orden_corte_id) REFERENCES ORDEN_CORTE(nro_registro);
```

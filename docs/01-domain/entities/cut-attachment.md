---
title: "Entidad: Adjunto de Corte"
type: "entity"
status: "mixed"
confidence: "high"
source: "master-analysis"
related:
  - "cut-order.md"
  - "../../05-business-rules/BR-005-photo-evidence-with-bypass.md"
---

# Adjunto de Corte (`ADJUNTO_CORTE`)

## Propósito

Registra los archivos digitales (fotografías del medidor desconectado, actas de notificación o documentos) asociados a una orden de corte.

## Descripción

Gestionado mediante el contenedor Dropzone en la ficha P-04. Cuenta con restricción rígida de 20 MB por archivo y formatos admitidos (.pdf, .doc, .docx, .jpg, .png). Las imágenes se redimensionan hasta un máximo de 5 megapíxeles y se comprimen localmente antes de cargarse.

## Campos

| Campo | Tipo Técnico | Descripción | Restricciones | Confianza |
| --- | --- | --- | --- | --- |
| `adjunto_id` | Integer [PK] | Identificador de archivo | Autoincremental | [HIPÓTESIS] |
| `orden_corte_id` | Integer [FK] | Orden de corte asociada | FK a `ORDEN_CORTE` | [ALTAMENTE INFERIDO] |
| `nombre_archivo` | Varchar(255) | Nombre del archivo subido | Máximo 255 chars | [CONFIRMADO VISUALMENTE] |
| `mime_type` | Varchar(50) | Tipo MIME del binario | jpg, png, pdf, doc, docx | [ALTAMENTE INFERIDO] |

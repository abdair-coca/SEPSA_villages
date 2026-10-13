/**
 * Catálogo de errores visibles para el técnico: qué pasó, qué quedó guardado y qué hacer.
 * Solo traduce códigos a texto; no decide si una acción física puede repetirse (eso vive en los casos de uso).
 * Los códigos no listados usan un texto genérico que muestra el código para poder reportarlo.
 */

export interface ErrorGuidance {
  code: string;
  /** Qué pasó, en lenguaje del técnico. */
  title: string;
  /** Qué quedó guardado en este dispositivo. */
  saved: string;
  /** Siguiente paso dentro de la app o, si no existe todavía, a quién avisar. */
  nextStep: string;
}

const SAVED_LOCALLY = "Los datos siguen guardados en este dispositivo.";
const NOT_REPEATED = "No repita la acción física.";
const CHECK_STATUS = "Use Verificar estado cuando haya conexión.";
const ADMIN_REVIEW = "Avise al administrador para revisión.";
const CONTACT_ADMIN = "Avise al administrador con este código.";

const CATALOG: Record<string, Omit<ErrorGuidance, "code">> = {
  LOOKUP_NOT_FOUND: {
    title: "El servidor no tiene registro de esta operación",
    saved: SAVED_LOCALLY,
    nextStep: `${CHECK_STATUS} Si sigue sin registro, ${ADMIN_REVIEW.toLowerCase()}`,
  },
  LOOKUP_UNKNOWN: {
    title: "No se pudo consultar el estado en el servidor",
    saved: SAVED_LOCALLY,
    nextStep: `${CHECK_STATUS} ${NOT_REPEATED}`,
  },
  LOOKUP_RECEIPT_INCOMPLETE: {
    title: "El servidor devolvió un recibo incompleto",
    saved: SAVED_LOCALLY,
    nextStep: `${CHECK_STATUS} ${ADMIN_REVIEW}`,
  },
  LOOKUP_RECEIPT_MISMATCH: {
    title: "El recibo del servidor no coincide con lo guardado",
    saved: SAVED_LOCALLY,
    nextStep: `No se reenviará. ${ADMIN_REVIEW}`,
  },
  LOOKUP_OPERATION_ID_MISMATCH: {
    title: "El servidor respondió con otra operación",
    saved: SAVED_LOCALLY,
    nextStep: `No se reenviará. ${ADMIN_REVIEW}`,
  },
  RESPONSE_LOST: {
    title: "Se perdió la respuesta del servidor",
    saved: SAVED_LOCALLY,
    nextStep: `${CHECK_STATUS} ${NOT_REPEATED}`,
  },
  RESPONSE_UNKNOWN: {
    title: "El servidor no confirmó la operación",
    saved: SAVED_LOCALLY,
    nextStep: `${CHECK_STATUS} ${NOT_REPEATED}`,
  },
  RESPONSE_OPERATION_ID_MISMATCH: {
    title: "El servidor respondió con otra operación",
    saved: SAVED_LOCALLY,
    nextStep: `No se reenviará. ${ADMIN_REVIEW}`,
  },
  RESPONSE_RECEIPT_MISMATCH: {
    title: "El recibo del servidor no coincide con lo enviado",
    saved: SAVED_LOCALLY,
    nextStep: `No se reenviará. ${ADMIN_REVIEW}`,
  },
  NETWORK_UNKNOWN: {
    title: "Se cortó la conexión durante el envío",
    saved: SAVED_LOCALLY,
    nextStep: `${CHECK_STATUS} ${NOT_REPEATED}`,
  },
  TIMEOUT: {
    title: "El servidor tardó demasiado en responder",
    saved: SAVED_LOCALLY,
    nextStep: `${CHECK_STATUS} ${NOT_REPEATED}`,
  },
  REMOTE_CONFLICT: {
    title: "El servidor tiene una versión distinta de esta operación",
    saved: "Local y remoto quedan guardados para revisión.",
    nextStep: `No se reenviará. ${ADMIN_REVIEW}`,
  },
  ENABLEMENT_UNKNOWN: {
    title: "No se pudo confirmar la habilitación en el servidor",
    saved: "El resultado queda guardado como incierto.",
    nextStep: `${NOT_REPEATED} ${ADMIN_REVIEW}`,
  },
  ENABLEMENT_LOOKUP_UNKNOWN: {
    title: "No se pudo consultar la habilitación en el servidor",
    saved: "El resultado queda guardado como incierto.",
    nextStep: `${NOT_REPEATED} ${ADMIN_REVIEW}`,
  },
  ENABLEMENT_CONSUME_UNKNOWN: {
    title: "No se confirmó el consumo de la habilitación",
    saved: "El resultado queda guardado como incierto.",
    nextStep: `${NOT_REPEATED} ${ADMIN_REVIEW}`,
  },
  ENABLEMENT_NOT_FOUND: {
    title: "El servidor no tiene habilitación para esta operación",
    saved: "El resultado queda guardado como incierto.",
    nextStep: `${NOT_REPEATED} ${ADMIN_REVIEW}`,
  },
  ENABLEMENT_RESERVATION_EXPIRED: {
    title: "La reserva venció antes de confirmarse el consumo",
    saved: "El resultado queda guardado como incierto.",
    nextStep: `${NOT_REPEATED} ${ADMIN_REVIEW}`,
  },
  ENABLEMENT_LOOKUP_MISMATCH: {
    title: "El servidor respondió con otra habilitación",
    saved: "El resultado queda guardado como incierto.",
    nextStep: `${NOT_REPEATED} ${ADMIN_REVIEW}`,
  },
  ENABLEMENT_OPERATION_ID_MISMATCH: {
    title: "El servidor respondió con otra operación",
    saved: "El resultado queda guardado como incierto.",
    nextStep: `${NOT_REPEATED} ${ADMIN_REVIEW}`,
  },
  CONSUME_OPERATION_ID_MISMATCH: {
    title: "El servidor consumió una habilitación de otra operación",
    saved: "El resultado queda guardado como incierto.",
    nextStep: `${NOT_REPEATED} ${ADMIN_REVIEW}`,
  },
  RECOVERY_REQUIRED: {
    title: "La operación necesita revisión para recuperarse",
    saved: "El resultado queda guardado como incierto.",
    nextStep: `${NOT_REPEATED} ${ADMIN_REVIEW}`,
  },
  ENABLEMENT_EXPIRED: {
    title: "La habilitación venció antes de confirmarse",
    saved: "La visita queda guardada si correspondía; la acción no se registró.",
    nextStep: "Solicite una nueva habilitación si corresponde.",
  },
  NOT_ENABLED: {
    title: "El servidor no habilitó la acción",
    saved: "La visita queda guardada si correspondía; la acción no se registró.",
    nextStep: "No hay acción física pendiente. Revise la orden antes de volver a intentarlo.",
  },
  NOT_AUTHORIZED: {
    title: "El servidor no autorizó la acción",
    saved: "La visita queda guardada si correspondía; la acción no se registró.",
    nextStep: "Revise la orden antes de volver a intentarlo.",
  },
  AUTHORIZATION_EXPIRED: {
    title: "La autorización venció",
    saved: "La acción no se registró.",
    nextStep: "Solicite una nueva autorización si corresponde.",
  },
  AUTHORIZATION_ALREADY_CONSUMED: {
    title: "La autorización ya fue usada por otra operación",
    saved: "La acción no se registró.",
    nextStep: CONTACT_ADMIN,
  },
  ORDER_STATE_CONFLICT: {
    title: "La orden cambió en el servidor o en este dispositivo",
    saved: SAVED_LOCALLY,
    nextStep: `${NOT_REPEATED} Descargue las órdenes de nuevo y revise la orden.`,
  },
  ORDER_VERSION_CONFLICT: {
    title: "La orden tiene una versión distinta en el servidor",
    saved: SAVED_LOCALLY,
    nextStep: "Descargue las órdenes de nuevo y revise la orden antes de continuar.",
  },
  ORDER_CLAIM_CONFLICT: {
    title: "Otra acción ya reclamó esta orden",
    saved: "La visita queda guardada si correspondía.",
    nextStep: "No se creó duplicado. Revise la actividad de la orden.",
  },
  PAYLOAD_TOO_LARGE: {
    title: "La foto pesa más de lo que acepta el servidor",
    saved: "La foto y la operación siguen guardadas en este dispositivo; no se envió nada.",
    nextStep: CONTACT_ADMIN,
  },
  EVIDENCE_IMAGE_TOO_LARGE: {
    title: "La foto supera la resolución que acepta el servidor",
    saved: "La foto y la operación siguen guardadas en este dispositivo; no se envió nada.",
    nextStep: CONTACT_ADMIN,
  },
  ORDER_RECOVERY_UNAVAILABLE: {
    title: "No se pudo recuperar la orden local",
    saved: SAVED_LOCALLY,
    nextStep: `${NOT_REPEATED} ${CONTACT_ADMIN}`,
  },
  RECONNECTION_NOT_COMPLETED: {
    title: "Habilitación denegada; no se registró una reposición",
    saved: "La visita queda guardada si correspondía.",
    nextStep: "Puede iniciar una nueva solicitud si corresponde.",
  },
  RECONNECTION_DATA_INCOMPLETE: {
    title: "La reconexión no tiene todos sus datos",
    saved: SAVED_LOCALLY,
    nextStep: `No se enviará. ${CONTACT_ADMIN}`,
  },
  CUT_AUTHORIZATION_NOT_CONFIRMED: {
    title: "El corte no tiene autorización confirmada",
    saved: SAVED_LOCALLY,
    nextStep: `No se enviará. ${CONTACT_ADMIN}`,
  },
  CUT_AUTHORIZATION_MISSING: {
    title: "El corte no tiene los datos de autorización",
    saved: SAVED_LOCALLY,
    nextStep: `No se enviará. ${CONTACT_ADMIN}`,
  },
  CUT_PREPARATION_FAILED: {
    title: "No se pudo preparar el envío del corte",
    saved: SAVED_LOCALLY,
    nextStep: "Use Reintentar cuando haya conexión; el corte no se envió.",
  },
  CUT_SEND_FENCING_UNAVAILABLE: {
    title: "El dispositivo no puede proteger el envío del corte",
    saved: SAVED_LOCALLY,
    nextStep: `No se enviará. ${CONTACT_ADMIN}`,
  },
  EVIDENCE_UPLOAD_FAILED: {
    title: "No se pudo subir la foto",
    saved: "La foto y la operación siguen guardadas.",
    nextStep: "Use Reintentar cuando haya conexión; el corte no se envía sin foto verificada.",
  },
  EVIDENCE_UPLOAD_NOT_VERIFIED: {
    title: "El servidor no confirmó la foto",
    saved: "La foto y la operación siguen guardadas.",
    nextStep: "Use Reintentar cuando haya conexión; el corte no se envía sin foto verificada.",
  },
  EVIDENCE_UPLOAD_UNAVAILABLE: {
    title: "La subida de fotos no está disponible",
    saved: "La foto y la operación siguen guardadas.",
    nextStep: CONTACT_ADMIN,
  },
  LOCAL_EVIDENCE_BYTES_MISSING: {
    title: "Falta el archivo local de la foto",
    saved: "La operación queda guardada, sin foto.",
    nextStep: `No se enviará. ${CONTACT_ADMIN}`,
  },
  LOCAL_EVIDENCE_BINDING_MISMATCH: {
    title: "La foto local no pertenece a esta operación",
    saved: "La operación queda guardada.",
    nextStep: `No se enviará. ${CONTACT_ADMIN}`,
  },
  LOCAL_RECORD_MISSING: {
    title: "Falta el registro local de la operación",
    saved: "No hay registro local de la operación.",
    nextStep: CONTACT_ADMIN,
  },
  REMOTE_OPERATION_UNKNOWN: {
    title: "El servidor no reconoce la operación",
    saved: SAVED_LOCALLY,
    nextStep: `${CHECK_STATUS} ${CONTACT_ADMIN}`,
  },
};

/**
 * Texto para un código sin entrada en el catálogo: se muestra el código para poder reportarlo.
 * Un resultado incierto nunca sugiere reintentar la acción.
 */
function fallbackGuidance(code: string, uncertain: boolean): ErrorGuidance {
  return {
    code,
    title: uncertain ? "Error no clasificado en una operación incierta" : "Error de sincronización no clasificado",
    saved: SAVED_LOCALLY,
    nextStep: uncertain
      ? `${CHECK_STATUS} ${NOT_REPEATED} Si persiste, ${CONTACT_ADMIN.toLowerCase()}`
      : `Use Reintentar o Verificar estado. Si persiste, ${CONTACT_ADMIN.toLowerCase()}`,
  };
}

/** Explica un código de error. Devuelve `undefined` si no hay código. */
export function errorGuidance(code: string | undefined, options: { uncertain?: boolean } = {}): ErrorGuidance | undefined {
  if (!code) return undefined;
  const entry = CATALOG[code];
  return entry ? { code, ...entry } : fallbackGuidance(code, Boolean(options.uncertain));
}

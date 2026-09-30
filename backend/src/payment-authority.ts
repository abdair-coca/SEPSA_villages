export interface PaymentCheckContext {
  orderId: string;
  accountId: string;
  supplyId: string;
  actorId: string;
  actorRole: "ADMIN" | "TECHNICIAN";
  deviceId: string;
  operationId: string;
}

export type PaymentDecision =
  | { status: "CLEAR" }
  | { status: "PAYMENT_CONFIRMED" }
  | { status: "UNKNOWN" };

export interface PaymentAuthority {
  checkPayment(context: PaymentCheckContext): Promise<PaymentDecision>;
}

export const unavailablePaymentAuthority: PaymentAuthority = {
  async checkPayment() {
    return { status: "UNKNOWN" };
  },
};

export async function checkPaymentSafely(
  authority: PaymentAuthority,
  context: PaymentCheckContext,
  timeoutMs = 3000,
): Promise<PaymentDecision> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const decision: unknown = await Promise.race([
      Promise.resolve().then(() => authority.checkPayment(context)),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("Payment authority timed out.")), timeoutMs);
      }),
    ]);
    if (
      typeof decision === "object" && decision !== null && "status" in decision &&
      (decision.status === "CLEAR" || decision.status === "PAYMENT_CONFIRMED" || decision.status === "UNKNOWN")
    ) return { status: decision.status };
  } catch {
    // An unavailable or failing payment source never authorizes a cut.
  } finally {
    if (timeout) clearTimeout(timeout);
  }
  return { status: "UNKNOWN" };
}

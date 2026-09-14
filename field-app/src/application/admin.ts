import type { AssignOrderCommand, CreateOrderCommand, CreateOrdersBatchCommand, CreateOrdersBatchResult, DebtorQuery, DebtorRecord, Session, WorkOrder } from "../domain";
import type { IdentityPort, OperationsAuthorityPort } from "../ports";

type AdminAuthority = OperationsAuthorityPort & IdentityPort;

export async function findDebtors(authority: AdminAuthority, session: Session, query: Omit<DebtorQuery, "session"> = {}): Promise<DebtorRecord[]> {
  await authority.authorize(session, "FIND_DEBTORS");
  return authority.findDebtors({ ...query, session });
}

export async function createOrder(authority: AdminAuthority, session: Session, input: Omit<CreateOrderCommand, "session">): Promise<WorkOrder> {
  await authority.authorize(session, "CREATE_ORDER");
  return authority.createOrder({ ...input, session });
}

export async function createOrdersBatch(authority: AdminAuthority, session: Session, input: Omit<CreateOrdersBatchCommand, "session">): Promise<CreateOrdersBatchResult> {
  await authority.authorize(session, "CREATE_ORDER");
  return authority.createOrdersBatch({ ...input, session });
}

export async function assignOrder(authority: AdminAuthority, session: Session, input: Omit<AssignOrderCommand, "session">): Promise<WorkOrder> {
  await authority.authorize(session, "ASSIGN_ORDER");
  return authority.assignOrder({ ...input, session });
}

export function createAdminCases(authority: AdminAuthority, identity: IdentityPort) {
  return {
    findDebtors: (session: Session, query: Omit<DebtorQuery, "session"> = {}) => findDebtors(authority, session, query),
    createOrder: (session: Session, input: Omit<CreateOrderCommand, "session">) => createOrder(authority, session, input),
    createOrdersBatch: (session: Session, input: Omit<CreateOrdersBatchCommand, "session">) => createOrdersBatch(authority, session, input),
    assignOrder: (session: Session, input: Omit<AssignOrderCommand, "session">) => assignOrder(authority, session, input),
    authorize: (session: Session, action: Parameters<IdentityPort["authorize"]>[1]) => identity.authorize(session, action),
  };
}

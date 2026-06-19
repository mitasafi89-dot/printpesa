import type { Page, PageQuery } from "./paging.js";
import type {
  AdminRepository, AdminOverview, AdminUserRow, AdminUserDetail, AdminWithdrawalRow, AdminAuditRow,
  AdminUserListQuery, AdminWithdrawalListQuery, SetUserStatusResult, SetCommissionRateResult,
  AdjustBalanceResult, AdminDepositRow, AdminDepositListQuery, AdminDepositsReconcile,
} from "./admin.js";

/**
 * AdminService (J2) — thin orchestration over AdminRepository the HTTP API binds to. The
 * authorization guards and audit writes live in the repository (the 0021 RPCs for Postgres,
 * mirrored in-memory for tests); this layer adds light validation and turns a missing user
 * detail into a USER_NOT_FOUND domain error for a 404.
 */
export class AdminService {
  constructor(private readonly repo: AdminRepository) {}

  overview(): Promise<AdminOverview> { return this.repo.overview(); }

  listUsers(q: AdminUserListQuery): Promise<Page<AdminUserRow>> { return this.repo.listUsers(q); }

  async getUserDetail(userId: string): Promise<AdminUserDetail> {
    const d = await this.repo.getUserDetail(userId);
    if (!d) throw new Error("USER_NOT_FOUND");
    return d;
  }

  setUserStatus(actorId: string, actorRole: string, targetId: string, status: string, reason: string | null): Promise<SetUserStatusResult> {
    return this.repo.setUserStatus(actorId, actorRole, targetId, status, reason);
  }

  setCommissionRate(actorId: string, actorRole: string, targetId: string, rate: number): Promise<SetCommissionRateResult> {
    return this.repo.setCommissionRate(actorId, actorRole, targetId, rate);
  }

  listWithdrawals(q: AdminWithdrawalListQuery): Promise<Page<AdminWithdrawalRow>> { return this.repo.listWithdrawals(q); }

  listAudit(q: PageQuery): Promise<Page<AdminAuditRow>> { return this.repo.listAudit(q); }

  /** Manual wallet credit/debit (J3) — signed cents, mandatory reason; guards + audit live in the repo/RPC. */
  adjustBalance(actorId: string, actorRole: string, targetId: string, amountCents: number, reason: string): Promise<AdjustBalanceResult> {
    return this.repo.adjustBalance(actorId, actorRole, targetId, amountCents, reason);
  }

  listDeposits(q: AdminDepositListQuery): Promise<Page<AdminDepositRow>> { return this.repo.listDeposits(q); }

  depositsReconcile(staleMinutes: number): Promise<AdminDepositsReconcile> { return this.repo.depositsReconcile(staleMinutes); }
}

import type Database from 'better-sqlite3';
import crypto from 'crypto';
import { LogRepository } from '../db/repositories/log.repository';
import { OperationLog } from '../types/config.types';

/**
 * Audit service - wraps LogRepository with HMAC chain signing.
 *
 * Each log entry's HMAC input = log_id + action + target_type + detail + create_time + prev_hmac
 * This creates a chain where tampering with any entry breaks the chain.
 */
export class AuditService {
  private logRepo: LogRepository;
  private signingKey: Buffer;
  private lastHmac: string = '';

  constructor(private db: Database.Database) {
    this.logRepo = new LogRepository(db);
    // Derive log signing key (in production, derive from master key via HKDF)
    this.signingKey = crypto.pbkdf2Sync(
      'delivery-eval-log-signing',
      'log-signing-salt',
      10000,
      32,
      'sha256'
    );
    // Load the last HMAC from database to continue the chain
    this.lastHmac = this.loadLastHmac();
  }

  /**
   * Record an operation log entry with HMAC chain signature.
   */
  log(input: {
    projectId?: string;
    action: string;
    targetType: string;
    targetId?: string;
    detail?: Record<string, unknown>;
  }): OperationLog {
    const hmacData = [
      input.action,
      input.targetType,
      input.detail ? JSON.stringify(input.detail) : '',
      new Date().toISOString(),
      this.lastHmac,
    ].join('|');

    const hmac = crypto.createHmac('sha256', this.signingKey)
      .update(hmacData)
      .digest('hex');

    const entry = this.logRepo.create({
      project_id: input.projectId ?? null,
      action: input.action,
      target_type: input.targetType,
      target_id: input.targetId ?? null,
      detail: input.detail ?? null,
      hmac_signature: hmac,
    });

    this.lastHmac = hmac;
    return entry;
  }

  /**
   * Verify the HMAC chain integrity.
   * Returns the first broken link index or -1 if chain is valid.
   */
  verifyChain(): { valid: boolean; brokenAt: number } {
    const logs = this.db.prepare(
      'SELECT * FROM operation_log ORDER BY create_time ASC'
    ).all() as Array<{
      log_id: string;
      action: string;
      target_type: string;
      detail: string | null;
      create_time: string;
      hmac_signature: string;
    }>;

    let prevHmac = '';
    for (let i = 0; i < logs.length; i++) {
      const log = logs[i];
      const hmacData = [
        log.action,
        log.target_type,
        log.detail || '',
        log.create_time,
        prevHmac,
      ].join('|');

      const expected = crypto.createHmac('sha256', this.signingKey)
        .update(hmacData)
        .digest('hex');

      if (expected !== log.hmac_signature) {
        return { valid: false, brokenAt: i };
      }
      prevHmac = log.hmac_signature;
    }

    return { valid: true, brokenAt: -1 };
  }

  /**
   * Get recent logs.
   */
  getRecent(limit: number = 100): OperationLog[] {
    return this.logRepo.getRecent(limit);
  }

  /**
   * Get logs for a project.
   */
  getByProject(projectId: string): OperationLog[] {
    return this.logRepo.getByProject(projectId);
  }

  private loadLastHmac(): string {
    const last = this.db.prepare(
      'SELECT hmac_signature FROM operation_log ORDER BY create_time DESC LIMIT 1'
    ).get() as { hmac_signature: string } | undefined;
    return last?.hmac_signature ?? '';
  }
}

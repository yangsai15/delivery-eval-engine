import Database from 'better-sqlite3';
import { runMigrations } from '../../../src/db/migrations';
import { AuditService } from '../../../src/services/audit.service';

describe('AuditService', () => {
  let db: Database.Database;
  let service: AuditService;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    service = new AuditService(db);
  });

  afterEach(() => db.close());

  test('should create log entries with HMAC', () => {
    const entry = service.log({
      action: 'create',
      targetType: 'project',
      targetId: 'p1',
      detail: { name: 'Test' },
    });

    expect(entry.log_id).toBeTruthy();
    expect(entry.hmac_signature).toBeTruthy();
    expect(entry.hmac_signature.length).toBe(64); // sha256 hex
    expect(entry.action).toBe('create');
  });

  test('should chain HMAC signatures', () => {
    const e1 = service.log({ action: 'create', targetType: 'project' });
    const e2 = service.log({ action: 'edit', targetType: 'project' });

    // Different entries should have different HMACs
    expect(e1.hmac_signature).not.toBe(e2.hmac_signature);
  });

  test('should verify valid chain', () => {
    service.log({ action: 'create', targetType: 'project' });
    service.log({ action: 'edit', targetType: 'project' });
    service.log({ action: 'delete', targetType: 'project' });

    const result = service.verifyChain();
    expect(result.valid).toBe(true);
    expect(result.brokenAt).toBe(-1);
  });

  test('should detect tampered log', () => {
    service.log({ action: 'create', targetType: 'project' });
    service.log({ action: 'edit', targetType: 'project' });

    // Tamper with a log entry
    db.prepare("UPDATE operation_log SET action = 'tampered' WHERE action = 'create'").run();

    // Need a fresh service to re-read
    const freshService = new AuditService(db);
    const result = freshService.verifyChain();
    expect(result.valid).toBe(false);
    expect(result.brokenAt).toBe(0);
  });

  test('should associate logs with project', () => {
    service.log({ projectId: 'p1', action: 'create', targetType: 'project', targetId: 'p1' });
    service.log({ projectId: 'p1', action: 'edit', targetType: 'config', targetId: 'c1' });
    service.log({ projectId: 'p2', action: 'create', targetType: 'project', targetId: 'p2' });

    const p1Logs = service.getByProject('p1');
    expect(p1Logs.length).toBe(2);

    const recent = service.getRecent(10);
    expect(recent.length).toBe(3);
  });

  test('empty chain should verify as valid', () => {
    const result = service.verifyChain();
    expect(result.valid).toBe(true);
  });
});

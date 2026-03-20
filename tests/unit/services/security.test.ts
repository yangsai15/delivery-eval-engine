import Database from 'better-sqlite3';
import { runMigrations } from '../../../src/db/migrations';
import { SecurityService } from '../../../src/services/security.service';

describe('SecurityService', () => {
  let db: Database.Database;
  let service: SecurityService;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    service = new SecurityService(db);
  });

  afterEach(() => db.close());

  test('should initialize security', () => {
    expect(service.isInitialized()).toBe(false);
    const { masterKey, recoveryKey } = service.initialize();
    expect(masterKey.length).toBe(32);
    expect(recoveryKey.length).toBeGreaterThan(0);
    expect(service.isInitialized()).toBe(true);
  });

  test('should not double initialize', () => {
    service.initialize();
    expect(() => service.initialize()).toThrow();
  });

  test('isPasswordSet should return false by default', () => {
    service.initialize();
    expect(service.isPasswordSet()).toBe(false);
  });

  test('should set and verify password', () => {
    service.initialize();
    const { recoveryKey } = service.setPassword('myPassword123');
    expect(recoveryKey.length).toBeGreaterThan(0);
    expect(service.isPasswordSet()).toBe(true);

    expect(service.verifyPassword('myPassword123')).toBe(true);
    expect(service.verifyPassword('wrongPassword')).toBe(false);
  });

  test('should reset password with recovery key', () => {
    service.initialize();
    const { recoveryKey } = service.setPassword('oldPassword');

    const { newRecoveryKey } = service.resetPassword(recoveryKey, 'newPassword');
    expect(newRecoveryKey.length).toBeGreaterThan(0);

    expect(service.verifyPassword('newPassword')).toBe(true);
    expect(service.verifyPassword('oldPassword')).toBe(false);
  });

  test('should reject invalid recovery key', () => {
    service.initialize();
    service.setPassword('password');
    expect(() => service.resetPassword('invalid-key', 'new')).toThrow();
  });

  test('should implement exponential backoff on failed attempts', () => {
    service.initialize();
    service.setPassword('correct');

    // 9 failed attempts should be OK
    for (let i = 0; i < 9; i++) {
      expect(service.verifyPassword('wrong')).toBe(false);
    }

    // 10th attempt triggers lockout
    service.verifyPassword('wrong');
    expect(() => service.verifyPassword('correct')).toThrow(); // locked
  });
});

import type Database from 'better-sqlite3';
import crypto from 'crypto';
import { generateId } from '../utils/uuid';
import { nowISO } from '../utils/date';
import { AppError, ErrorCode } from '../types/error-codes';

const PBKDF2_ITERATIONS = 100_000;
const KEY_LENGTH = 32; // 256 bits
const SALT_LENGTH = 16;
const IV_LENGTH = 12; // AES-GCM nonce

interface SecurityRow {
  security_id: string;
  password_hash: string | null;
  master_key_encrypted: string;
  recovery_key_hash: string | null;
  password_set: number;
  last_password_change: string | null;
  create_time: string;
  update_time: string;
}

export class SecurityService {
  private failedAttempts = 0;
  private lockoutUntil: number | null = null;

  constructor(private db: Database.Database) {}

  /**
   * Initialize security on first launch - generate master key.
   */
  initialize(): { masterKey: Buffer; recoveryKey: string } {
    const existing = this.getSecurityRecord();
    if (existing) {
      throw new AppError(ErrorCode.E3004, '安全信息已初始化');
    }

    const masterKey = crypto.randomBytes(KEY_LENGTH);
    // Store master key encrypted with a default system key (no password set yet)
    const systemKey = this.getSystemKey();
    const encryptedMasterKey = this.encrypt(masterKey, systemKey);

    const now = nowISO();
    const id = generateId();

    this.db.prepare(`
      INSERT INTO user_security (security_id, password_hash, master_key_encrypted,
        recovery_key_hash, password_set, last_password_change, create_time, update_time)
      VALUES (?, NULL, ?, NULL, 0, NULL, ?, ?)
    `).run(id, encryptedMasterKey, now, now);

    // Generate recovery key
    const recoveryKey = crypto.randomBytes(32).toString('hex');

    return { masterKey, recoveryKey };
  }

  /**
   * Set startup password.
   */
  setPassword(password: string): { recoveryKey: string } {
    const record = this.getSecurityRecordOrThrow();

    // Derive key from password
    const salt = crypto.randomBytes(SALT_LENGTH);
    const derivedKey = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');

    // Hash password for verification
    const passwordHash = `${salt.toString('hex')}:${derivedKey.toString('hex')}`;

    // Get current master key (decrypt with old method)
    const masterKey = this.decryptMasterKey(record);

    // Re-encrypt master key with password-derived key
    const encryptedMasterKey = this.encrypt(masterKey, derivedKey);

    // Generate recovery key
    const recoveryKey = crypto.randomBytes(32).toString('hex');
    const recoveryKeyHash = crypto.createHash('sha256').update(recoveryKey).digest('hex');

    // Also encrypt master key with recovery key for backup
    const recoveryDerivedKey = crypto.pbkdf2Sync(recoveryKey, 'recovery', PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
    // Store recovery-encrypted master key separately in the encrypted field
    // For simplicity, we append it with a separator
    const recoveryEncryptedMK = this.encrypt(masterKey, recoveryDerivedKey);
    const combinedEncrypted = `${encryptedMasterKey}|${recoveryEncryptedMK}`;

    const now = nowISO();
    this.db.prepare(`
      UPDATE user_security SET
        password_hash = ?, master_key_encrypted = ?, recovery_key_hash = ?,
        password_set = 1, last_password_change = ?, update_time = ?
      WHERE security_id = ?
    `).run(passwordHash, combinedEncrypted, recoveryKeyHash, now, now, record.security_id);

    return { recoveryKey };
  }

  /**
   * Verify startup password.
   */
  verifyPassword(password: string): boolean {
    // Check lockout
    if (this.lockoutUntil && Date.now() < this.lockoutUntil) {
      throw new AppError(ErrorCode.E3002, `账户已锁定，请${Math.ceil((this.lockoutUntil - Date.now()) / 1000)}秒后重试`);
    }

    const record = this.getSecurityRecordOrThrow();
    if (!record.password_hash) return true; // No password set

    const [saltHex, hashHex] = record.password_hash.split(':');
    const salt = Buffer.from(saltHex, 'hex');
    const derivedKey = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');

    if (derivedKey.toString('hex') === hashHex) {
      this.failedAttempts = 0;
      this.lockoutUntil = null;
      return true;
    }

    // Failed attempt - exponential backoff
    this.failedAttempts++;
    if (this.failedAttempts >= 10) {
      this.lockoutUntil = Date.now() + 15 * 60 * 1000; // 15 minutes
    }
    return false;
  }

  /**
   * Reset password using recovery key.
   */
  resetPassword(recoveryKey: string, newPassword: string): { newRecoveryKey: string } {
    const record = this.getSecurityRecordOrThrow();

    // Verify recovery key
    const recoveryKeyHash = crypto.createHash('sha256').update(recoveryKey).digest('hex');
    if (record.recovery_key_hash !== recoveryKeyHash) {
      throw new AppError(ErrorCode.E3003);
    }

    // Decrypt master key using recovery key
    const parts = record.master_key_encrypted.split('|');
    if (parts.length < 2) {
      throw new AppError(ErrorCode.E3003, '恢复数据不完整');
    }
    const recoveryDerivedKey = crypto.pbkdf2Sync(recoveryKey, 'recovery', PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
    const masterKey = this.decrypt(parts[1], recoveryDerivedKey);

    // Set new password
    const salt = crypto.randomBytes(SALT_LENGTH);
    const derivedKey = crypto.pbkdf2Sync(newPassword, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
    const passwordHash = `${salt.toString('hex')}:${derivedKey.toString('hex')}`;

    const encryptedMasterKey = this.encrypt(masterKey, derivedKey);

    // Generate new recovery key
    const newRecoveryKey = crypto.randomBytes(32).toString('hex');
    const newRecoveryKeyHash = crypto.createHash('sha256').update(newRecoveryKey).digest('hex');
    const newRecoveryDerivedKey = crypto.pbkdf2Sync(newRecoveryKey, 'recovery', PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
    const recoveryEncryptedMK = this.encrypt(masterKey, newRecoveryDerivedKey);
    const combinedEncrypted = `${encryptedMasterKey}|${recoveryEncryptedMK}`;

    const now = nowISO();
    this.db.prepare(`
      UPDATE user_security SET
        password_hash = ?, master_key_encrypted = ?, recovery_key_hash = ?,
        last_password_change = ?, update_time = ?
      WHERE security_id = ?
    `).run(passwordHash, combinedEncrypted, newRecoveryKeyHash, now, now, record.security_id);

    this.failedAttempts = 0;
    this.lockoutUntil = null;

    return { newRecoveryKey };
  }

  /**
   * Check if password is set.
   */
  isPasswordSet(): boolean {
    const record = this.getSecurityRecord();
    return record ? record.password_set === 1 : false;
  }

  /**
   * Check if security is initialized.
   */
  isInitialized(): boolean {
    return !!this.getSecurityRecord();
  }

  // --- Internal helpers ---

  private getSecurityRecord(): SecurityRow | undefined {
    return this.db.prepare('SELECT * FROM user_security LIMIT 1').get() as SecurityRow | undefined;
  }

  private getSecurityRecordOrThrow(): SecurityRow {
    const record = this.getSecurityRecord();
    if (!record) throw new AppError(ErrorCode.E3004, '安全信息未初始化');
    return record;
  }

  private decryptMasterKey(record: SecurityRow): Buffer {
    const encryptedData = record.master_key_encrypted.split('|')[0];
    if (record.password_set === 1 && record.password_hash) {
      // Need password to decrypt - this should only be called after verification
      const [saltHex, hashHex] = record.password_hash.split(':');
      const salt = Buffer.from(saltHex, 'hex');
      // We can't reconstruct the derived key without the password
      // This is used internally after password verification
      throw new AppError(ErrorCode.E3001, '需要密码才能解密主密钥');
    }
    return this.decrypt(encryptedData, this.getSystemKey());
  }

  private getSystemKey(): Buffer {
    // In production, this would use Windows DPAPI or macOS Keychain.
    // For now, use a machine-specific key derivation.
    const machineId = `delivery-eval-${process.platform}-${process.arch}`;
    return crypto.pbkdf2Sync(machineId, 'system-salt', 10000, KEY_LENGTH, 'sha256');
  }

  private encrypt(data: Buffer, key: Buffer): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  private decrypt(encryptedStr: string, key: Buffer): Buffer {
    const [ivHex, tagHex, dataHex] = encryptedStr.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const data = Buffer.from(dataHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]);
  }
}

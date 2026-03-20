import Database from 'better-sqlite3';
import { runMigrations } from '../../../src/db/migrations';
import { BackupService } from '../../../src/services/backup.service';
import { ProjectService } from '../../../src/services/project.service';
import { FlowMode } from '../../../src/types/enums';

describe('BackupService', () => {
  let db: Database.Database;
  let backupService: BackupService;
  let projectService: ProjectService;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    backupService = new BackupService(db);
    projectService = new ProjectService(db);
  });

  afterEach(() => db.close());

  test('should export empty database', () => {
    const data = backupService.exportBackup();
    expect(data.metadata.version).toBe('1.0');
    expect(data.metadata.project_count).toBe(0);
    expect(data.projects).toEqual([]);
  });

  test('should export and import projects', () => {
    // Create a project
    projectService.create({
      project_name: 'Backup Test',
      label_type: '测试',
      unit: '条',
      total_data: 1000,
      start_date: '2026-04-01',
      end_date: '2026-04-30',
      flow_mode: FlowMode.Standard,
      final_efficiency: 100,
    });

    const data = backupService.exportBackup();
    expect(data.metadata.project_count).toBe(1);
    expect(data.projects.length).toBe(1);

    // Import into a fresh database
    const db2 = new Database(':memory:');
    db2.pragma('foreign_keys = ON');
    runMigrations(db2);
    const backupService2 = new BackupService(db2);

    const result = backupService2.importBackup(data);
    expect(result.importedProjects).toBe(1);

    const projectService2 = new ProjectService(db2);
    const projects = projectService2.listActive();
    expect(projects.length).toBe(1);
    expect(projects[0].project_name).toBe('Backup Test');

    db2.close();
  });

  test('should skip duplicate projects on import', () => {
    projectService.create({
      project_name: 'Dup Test',
      label_type: '测试',
      unit: '条',
      total_data: 1000,
      start_date: '2026-04-01',
      end_date: '2026-04-30',
      flow_mode: FlowMode.Standard,
      final_efficiency: 100,
    });

    const data = backupService.exportBackup();

    // Import same data again
    const result = backupService.importBackup(data);
    expect(result.importedProjects).toBe(0); // already exists
  });

  test('should reject higher schema version', () => {
    const data = backupService.exportBackup();
    data.metadata.schema_version = 999;

    expect(() => backupService.importBackup(data)).toThrow();
  });

  test('getDatabaseInfo should return stats', () => {
    const info = backupService.getDatabaseInfo();
    expect(info.projectCount).toBe(0);
    expect(info.snapshotCount).toBe(0);
    expect(info.sizeMB).toBeGreaterThanOrEqual(0);
  });

  test('cleanupDeleted should remove old soft-deleted projects', () => {
    const project = projectService.create({
      project_name: 'To Clean',
      label_type: '测试',
      unit: '条',
      total_data: 1000,
      start_date: '2026-04-01',
      end_date: '2026-04-30',
      flow_mode: FlowMode.Standard,
      final_efficiency: 100,
    });
    projectService.softDelete(project.project_id);

    // Set deleted_at to 31 days ago
    const oldDate = new Date();
    oldDate.setDate(oldDate.getDate() - 31);
    db.prepare('UPDATE project SET deleted_at = ? WHERE project_id = ?')
      .run(oldDate.toISOString().split('T')[0], project.project_id);

    const cleaned = backupService.cleanupDeleted(30);
    expect(cleaned).toBe(1);
  });

  test('optimize should not throw', () => {
    expect(() => backupService.optimize()).not.toThrow();
  });
});

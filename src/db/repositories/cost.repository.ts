import type Database from 'better-sqlite3';
import { BaseRepository, generateId, nowISO } from './base.repository';
import { CostConfig, StaffAllocation } from '../../types/config.types';

export class CostRepository extends BaseRepository {
  constructor(db: Database.Database) {
    super(db);
  }

  // --- cost_config ---

  createCost(input: Omit<CostConfig, 'cost_id' | 'create_time' | 'update_time'>): CostConfig {
    const now = nowISO();
    const id = generateId();
    this.db.prepare(`
      INSERT INTO cost_config (cost_id, project_id, work_type, role_type, daily_salary, people_num, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.project_id, input.work_type, input.role_type, input.daily_salary, input.people_num, now, now);
    return { cost_id: id, ...input, create_time: now, update_time: now };
  }

  getCostByProject(projectId: string): CostConfig[] {
    return this.findAllByField<CostConfig>('cost_config', 'project_id', projectId);
  }

  deleteCostByProject(projectId: string): number {
    return this.deleteByField('cost_config', 'project_id', projectId);
  }

  // --- staff_allocation ---

  createAllocation(input: Omit<StaffAllocation, 'allocation_id' | 'create_time' | 'update_time'>): StaffAllocation {
    const now = nowISO();
    const id = generateId();
    this.db.prepare(`
      INSERT INTO staff_allocation (allocation_id, project_id, role_type, work_type, people_num, stage_id, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.project_id, input.role_type, input.work_type, input.people_num, input.stage_id, now, now);
    return { allocation_id: id, ...input, create_time: now, update_time: now };
  }

  getAllocationsByProject(projectId: string): StaffAllocation[] {
    return this.findAllByField<StaffAllocation>('staff_allocation', 'project_id', projectId);
  }

  deleteAllocationsByProject(projectId: string): number {
    return this.deleteByField('staff_allocation', 'project_id', projectId);
  }
}

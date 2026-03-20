import type Database from 'better-sqlite3';
import { BaseRepository, generateId, nowISO } from './base.repository';
import { FlowConfig } from '../../types/project.types';

export class FlowConfigRepository extends BaseRepository {
  constructor(db: Database.Database) {
    super(db);
  }

  create(input: Omit<FlowConfig, 'flow_id' | 'create_time' | 'update_time'>): FlowConfig {
    const now = nowISO();
    const id = generateId();
    this.db.prepare(`
      INSERT INTO flow_config (flow_id, project_id, flow_node, interval_days, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, input.project_id, input.flow_node, input.interval_days, now, now);
    return { flow_id: id, ...input, create_time: now, update_time: now };
  }

  getByProject(projectId: string): FlowConfig[] {
    return this.findAllByField<FlowConfig>('flow_config', 'project_id', projectId);
  }

  update(flowId: string, intervalDays: number): void {
    this.db.prepare(
      'UPDATE flow_config SET interval_days = ?, update_time = ? WHERE flow_id = ?'
    ).run(intervalDays, nowISO(), flowId);
  }

  deleteByProject(projectId: string): number {
    return this.deleteByField('flow_config', 'project_id', projectId);
  }
}

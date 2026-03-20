import type Database from 'better-sqlite3';
import { generateId } from '../utils/uuid';
import { nowISO } from '../utils/date';
import { ReportTemplate, SectionConfig, StyleConfig } from '../types/config.types';

interface TemplateRow {
  template_id: string;
  template_name: string;
  is_default: number;
  sections: string;
  style_config: string | null;
  create_time: string;
  update_time: string;
}

export class TemplateService {
  constructor(private db: Database.Database) {}

  private rowToTemplate(row: TemplateRow): ReportTemplate {
    return {
      ...row,
      is_default: row.is_default === 1,
      sections: JSON.parse(row.sections) as SectionConfig[],
      style_config: row.style_config ? JSON.parse(row.style_config) as StyleConfig : null,
    };
  }

  /**
   * Create a new report template.
   */
  create(input: {
    template_name: string;
    is_default?: boolean;
    sections: SectionConfig[];
    style_config?: StyleConfig;
  }): ReportTemplate {
    const now = nowISO();
    const id = generateId();

    // If setting as default, unset other defaults
    if (input.is_default) {
      this.db.prepare('UPDATE report_template SET is_default = 0').run();
    }

    this.db.prepare(`
      INSERT INTO report_template (template_id, template_name, is_default, sections, style_config, create_time, update_time)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.template_name,
      input.is_default ? 1 : 0,
      JSON.stringify(input.sections),
      input.style_config ? JSON.stringify(input.style_config) : null,
      now,
      now,
    );

    return this.getById(id)!;
  }

  /**
   * Get template by ID.
   */
  getById(id: string): ReportTemplate | undefined {
    const row = this.db.prepare('SELECT * FROM report_template WHERE template_id = ?').get(id) as TemplateRow | undefined;
    return row ? this.rowToTemplate(row) : undefined;
  }

  /**
   * List all templates.
   */
  list(): ReportTemplate[] {
    const rows = this.db.prepare('SELECT * FROM report_template ORDER BY create_time DESC').all() as TemplateRow[];
    return rows.map(r => this.rowToTemplate(r));
  }

  /**
   * Get the default template.
   */
  getDefault(): ReportTemplate | undefined {
    const row = this.db.prepare('SELECT * FROM report_template WHERE is_default = 1').get() as TemplateRow | undefined;
    return row ? this.rowToTemplate(row) : undefined;
  }

  /**
   * Update a template.
   */
  update(id: string, input: Partial<{
    template_name: string;
    is_default: boolean;
    sections: SectionConfig[];
    style_config: StyleConfig | null;
  }>): void {
    const now = nowISO();
    const sets: string[] = ['update_time = ?'];
    const values: unknown[] = [now];

    if (input.template_name !== undefined) {
      sets.push('template_name = ?');
      values.push(input.template_name);
    }
    if (input.is_default !== undefined) {
      if (input.is_default) {
        this.db.prepare('UPDATE report_template SET is_default = 0').run();
      }
      sets.push('is_default = ?');
      values.push(input.is_default ? 1 : 0);
    }
    if (input.sections !== undefined) {
      sets.push('sections = ?');
      values.push(JSON.stringify(input.sections));
    }
    if (input.style_config !== undefined) {
      sets.push('style_config = ?');
      values.push(input.style_config ? JSON.stringify(input.style_config) : null);
    }

    values.push(id);
    this.db.prepare(`UPDATE report_template SET ${sets.join(', ')} WHERE template_id = ?`).run(...values);
  }

  /**
   * Delete a template.
   */
  delete(id: string): void {
    this.db.prepare('DELETE FROM report_template WHERE template_id = ?').run(id);
  }

  /**
   * Initialize default report template.
   */
  initializeDefaults(): void {
    const existing = this.getDefault();
    if (existing) return;

    this.create({
      template_name: '标准交付汇报模板',
      is_default: true,
      sections: [
        { section_id: 's1', section_type: 'overview', title: '项目概况', enabled: true, order: 1 },
        { section_id: 's2', section_type: 'delivery', title: '交付完成情况', enabled: true, order: 2 },
        { section_id: 's3', section_type: 'capacity', title: '产能与人力分析', enabled: true, order: 3 },
        { section_id: 's4', section_type: 'cost', title: '成本投入分析', enabled: true, order: 4 },
        { section_id: 's5', section_type: 'warning', title: '风险预警汇总', enabled: true, order: 5 },
        { section_id: 's6', section_type: 'plan', title: '交付计划概览', enabled: true, order: 6 },
      ],
      style_config: {
        primary_color: '#1A3C6E',
        font_family: '微软雅黑',
        header_font_size: 16,
        body_font_size: 12,
      },
    });
  }
}

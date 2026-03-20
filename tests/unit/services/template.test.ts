import Database from 'better-sqlite3';
import { runMigrations } from '../../../src/db/migrations';
import { TemplateService } from '../../../src/services/template.service';

describe('TemplateService', () => {
  let db: Database.Database;
  let service: TemplateService;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
    service = new TemplateService(db);
  });

  afterEach(() => db.close());

  test('should create a template', () => {
    const t = service.create({
      template_name: 'Test Template',
      sections: [
        { section_id: 's1', section_type: 'overview', title: '概况', enabled: true, order: 1 },
      ],
    });
    expect(t.template_id).toBeTruthy();
    expect(t.template_name).toBe('Test Template');
    expect(t.sections.length).toBe(1);
    expect(t.is_default).toBe(false);
  });

  test('should set default template', () => {
    service.create({ template_name: 'A', is_default: true, sections: [] });
    const def = service.getDefault();
    expect(def?.template_name).toBe('A');

    // Setting another as default should unset first
    service.create({ template_name: 'B', is_default: true, sections: [] });
    const newDef = service.getDefault();
    expect(newDef?.template_name).toBe('B');
  });

  test('should list all templates', () => {
    service.create({ template_name: 'T1', sections: [] });
    service.create({ template_name: 'T2', sections: [] });
    const list = service.list();
    expect(list.length).toBe(2);
  });

  test('should update template', () => {
    const t = service.create({ template_name: 'Original', sections: [] });
    service.update(t.template_id, { template_name: 'Updated' });
    const updated = service.getById(t.template_id);
    expect(updated?.template_name).toBe('Updated');
  });

  test('should update sections', () => {
    const t = service.create({ template_name: 'T', sections: [] });
    service.update(t.template_id, {
      sections: [{ section_id: 'x', section_type: 'delivery', title: '交付', enabled: true, order: 1 }],
    });
    const updated = service.getById(t.template_id);
    expect(updated?.sections.length).toBe(1);
  });

  test('should update style config', () => {
    const t = service.create({ template_name: 'T', sections: [] });
    service.update(t.template_id, {
      style_config: { primary_color: '#FF0000', font_family: 'Arial' },
    });
    const updated = service.getById(t.template_id);
    expect(updated?.style_config?.primary_color).toBe('#FF0000');
  });

  test('should clear style config', () => {
    const t = service.create({
      template_name: 'T',
      sections: [],
      style_config: { primary_color: '#000' },
    });
    service.update(t.template_id, { style_config: null });
    const updated = service.getById(t.template_id);
    expect(updated?.style_config).toBeNull();
  });

  test('should delete template', () => {
    const t = service.create({ template_name: 'ToDelete', sections: [] });
    service.delete(t.template_id);
    expect(service.getById(t.template_id)).toBeUndefined();
  });

  test('initializeDefaults should create default template', () => {
    service.initializeDefaults();
    const def = service.getDefault();
    expect(def).toBeTruthy();
    expect(def!.sections.length).toBe(6);
  });

  test('initializeDefaults should not duplicate', () => {
    service.initializeDefaults();
    service.initializeDefaults();
    const all = service.list();
    expect(all.filter(t => t.is_default).length).toBe(1);
  });
});

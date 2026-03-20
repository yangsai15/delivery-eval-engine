import Database from 'better-sqlite3';
import { runMigrations } from '../../src/db/migrations';
import { ProjectService } from '../../src/services/project.service';
import { ConfigService } from '../../src/services/config.service';
import { CalculationService } from '../../src/services/calculation.service';
import { ExportService } from '../../src/services/export.service';
import { FlowMode, RoleType, CalcType, ProjectStatus } from '../../src/types/enums';

describe('Full Pipeline Integration Test', () => {
  let db: Database.Database;
  let projectService: ProjectService;
  let configService: ConfigService;
  let calcService: CalculationService;
  let exportService: ExportService;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    runMigrations(db);

    projectService = new ProjectService(db);
    configService = new ConfigService(db);
    calcService = new CalculationService(db);
    exportService = new ExportService(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('Standard mode: create → configure → calculate → verify', () => {
    test('end-to-end staffing calculation', () => {
      // Step 1: Create project
      const project = projectService.create({
        project_name: 'E2E Standard Test',
        label_type: '目标检测',
        unit: '条',
        total_data: 10000,
        start_date: '2026-04-06', // Monday
        end_date: '2026-05-01',   // Friday, ~20 working days
        flow_mode: FlowMode.Standard,
        final_efficiency: 100,
      });

      expect(project.project_id).toBeTruthy();
      expect(project.status).toBe(ProjectStatus.Draft);

      // Step 2: Configure roles
      configService.setRoleConfig(project.project_id, {
        role_type: RoleType.Label,
        daily_efficiency: 100,
        base_people: 5,
      });
      configService.setRoleConfig(project.project_id, {
        role_type: RoleType.QA1,
        daily_efficiency: 100,
        base_people: 5,
      });
      configService.setRoleConfig(project.project_id, {
        role_type: RoleType.QA2,
        daily_efficiency: 100,
        base_people: 5,
      });

      // Step 3: Configure flows
      configService.setFlowConfigs(project.project_id, [
        { flow_node: 'label→qa1', interval_days: 1 },
        { flow_node: 'qa1→qa2', interval_days: 1 },
      ]);

      // Step 4: Run staffing calculation
      const { result, warnings } = calcService.runStaffing(project.project_id);

      expect(result.feasibility).toBe('feasible');
      expect(result.recommendedPeople[RoleType.Label]).toBeGreaterThanOrEqual(1);
      expect(result.recommendedPeople[RoleType.QA1]).toBeGreaterThanOrEqual(1);
      expect(result.recommendedPeople[RoleType.QA2]).toBeGreaterThanOrEqual(1);

      // Step 5: Verify project status updated
      const updated = projectService.getById(project.project_id);
      expect(updated?.status).toBe(ProjectStatus.Calculated);

      // Step 6: Verify snapshot saved
      const exported = exportService.exportProject(project.project_id, CalcType.Staffing);
      expect(exported.results).toBeTruthy();
    });

    test('end-to-end capacity calculation', () => {
      const project = projectService.create({
        project_name: 'E2E Capacity Test',
        label_type: '图像分类',
        unit: '张',
        total_data: 10000,
        start_date: '2026-04-06',
        end_date: '2026-05-01',
        flow_mode: FlowMode.Standard,
        final_efficiency: 100,
      });

      configService.setRoleConfig(project.project_id, {
        role_type: RoleType.Label, daily_efficiency: 100, base_people: 5,
      });
      configService.setRoleConfig(project.project_id, {
        role_type: RoleType.QA1, daily_efficiency: 100, base_people: 5,
      });
      configService.setRoleConfig(project.project_id, {
        role_type: RoleType.QA2, daily_efficiency: 100, base_people: 5,
      });
      configService.setFlowConfigs(project.project_id, [
        { flow_node: 'label→qa1', interval_days: 1 },
        { flow_node: 'qa1→qa2', interval_days: 1 },
      ]);

      const { result } = calcService.runCapacity(project.project_id);

      expect(result.maxRawData).toBeGreaterThan(0);
      expect(result.effectiveDelivery).toBeGreaterThan(0);
      expect(result.bottleneckRole).toBeTruthy();
    });

    test('end-to-end evaluation calculation', () => {
      const project = projectService.create({
        project_name: 'E2E Evaluation Test',
        label_type: '语音标注',
        unit: '段',
        total_data: 5000,
        start_date: '2026-04-06',
        end_date: '2026-05-01',
        flow_mode: FlowMode.Standard,
        final_efficiency: 100,
      });

      configService.setRoleConfig(project.project_id, {
        role_type: RoleType.Label, daily_efficiency: 100, base_people: 5,
      });
      configService.setRoleConfig(project.project_id, {
        role_type: RoleType.QA1, daily_efficiency: 100, base_people: 5,
      });
      configService.setRoleConfig(project.project_id, {
        role_type: RoleType.QA2, daily_efficiency: 100, base_people: 5,
      });
      configService.setFlowConfigs(project.project_id, [
        { flow_node: 'label→qa1', interval_days: 1 },
        { flow_node: 'qa1→qa2', interval_days: 1 },
      ]);

      const { result } = calcService.runEvaluation(project.project_id);

      expect(result.completionRate).toBeGreaterThan(0);
      expect(result.dailyDelivery.length).toBeGreaterThan(0);
      expect(result.estimatedFinishDay).toBeGreaterThan(0);
    });
  });

  describe('Label QC mode with screen', () => {
    test('end-to-end with screen enabled', () => {
      const project = projectService.create({
        project_name: 'E2E LabelQC Test',
        label_type: '文本分类',
        unit: '条',
        total_data: 5000,
        start_date: '2026-04-06',
        end_date: '2026-04-17', // ~10 working days
        flow_mode: FlowMode.LabelQC,
        enable_screen: true,
        screen_efficiency: 80,
        final_efficiency: 100,
      });

      configService.setRoleConfig(project.project_id, {
        role_type: RoleType.Screen, daily_efficiency: 200, base_people: 3,
      });
      configService.setRoleConfig(project.project_id, {
        role_type: RoleType.LabelQC, daily_efficiency: 100, base_people: 5,
      });
      configService.setRoleConfig(project.project_id, {
        role_type: RoleType.QA2, daily_efficiency: 100, base_people: 5,
      });
      configService.setFlowConfigs(project.project_id, [
        { flow_node: 'screen→label_qc', interval_days: 1 },
        { flow_node: 'label_qc→qa2', interval_days: 1 },
      ]);

      const { result } = calcService.runEvaluation(project.project_id);

      expect(result.completionRate).toBeGreaterThan(0);
      // Effective target = 5000 * 0.8 * 1.0 = 4000
      // completion rate should reflect this target
    });
  });

  describe('Project lifecycle', () => {
    test('edit in calculated state should revert to configured', () => {
      const project = projectService.create({
        project_name: 'Lifecycle Test',
        label_type: '测试',
        unit: '条',
        total_data: 1000,
        start_date: '2026-04-06',
        end_date: '2026-04-17',
        flow_mode: FlowMode.Standard,
        final_efficiency: 100,
      });

      configService.setRoleConfig(project.project_id, {
        role_type: RoleType.Label, daily_efficiency: 100, base_people: 5,
      });
      configService.setRoleConfig(project.project_id, {
        role_type: RoleType.QA1, daily_efficiency: 100, base_people: 5,
      });
      configService.setRoleConfig(project.project_id, {
        role_type: RoleType.QA2, daily_efficiency: 100, base_people: 5,
      });
      configService.setFlowConfigs(project.project_id, [
        { flow_node: 'label→qa1', interval_days: 1 },
        { flow_node: 'qa1→qa2', interval_days: 1 },
      ]);

      // Calculate → status becomes calculated
      calcService.runEvaluation(project.project_id);
      let p = projectService.getById(project.project_id);
      expect(p?.status).toBe(ProjectStatus.Calculated);

      // Edit → should revert to configured
      projectService.update(project.project_id, { total_data: 2000 });
      p = projectService.getById(project.project_id);
      expect(p?.status).toBe(ProjectStatus.Configured);
    });

    test('clone project should copy all configs', () => {
      const original = projectService.create({
        project_name: 'Original',
        label_type: '测试',
        unit: '条',
        total_data: 1000,
        start_date: '2026-04-06',
        end_date: '2026-04-17',
        flow_mode: FlowMode.Standard,
        final_efficiency: 100,
      });

      configService.setRoleConfig(original.project_id, {
        role_type: RoleType.Label, daily_efficiency: 100, base_people: 5,
      });
      configService.setFlowConfigs(original.project_id, [
        { flow_node: 'label→qa1', interval_days: 2 },
      ]);

      const clone = projectService.clone(original.project_id);

      expect(clone.project_name).toContain('副本');
      expect(clone.status).toBe(ProjectStatus.Draft);
      expect(clone.total_data).toBe(1000);

      const cloneRoles = configService.getRoleConfigs(clone.project_id);
      expect(cloneRoles.length).toBe(1);
      expect(cloneRoles[0].daily_efficiency).toBe(100);

      const cloneFlows = configService.getFlowConfigs(clone.project_id);
      expect(cloneFlows.length).toBe(1);
      expect(cloneFlows[0].interval_days).toBe(2);
    });

    test('soft delete should work', () => {
      const project = projectService.create({
        project_name: 'To Delete',
        label_type: '测试',
        unit: '条',
        total_data: 1000,
        start_date: '2026-04-06',
        end_date: '2026-04-17',
        flow_mode: FlowMode.Standard,
        final_efficiency: 100,
      });

      projectService.softDelete(project.project_id);

      const active = projectService.listActive();
      expect(active.find(p => p.project_id === project.project_id)).toBeUndefined();

      // But still accessible by ID
      const deleted = projectService.getById(project.project_id);
      expect(deleted?.is_deleted).toBe(true);
    });
  });

  describe('Validation integration', () => {
    test('should reject wrong role type for flow mode', () => {
      const project = projectService.create({
        project_name: 'Validation Test',
        label_type: '测试',
        unit: '条',
        total_data: 1000,
        start_date: '2026-04-06',
        end_date: '2026-04-17',
        flow_mode: FlowMode.Standard,
        final_efficiency: 100,
      });

      // Try to set label_qc role in standard mode → should throw
      expect(() => {
        configService.setRoleConfig(project.project_id, {
          role_type: RoleType.LabelQC,
          daily_efficiency: 100,
          base_people: 5,
        });
      }).toThrow();
    });

    test('should reject wrong flow node for flow mode', () => {
      const project = projectService.create({
        project_name: 'Flow Validation Test',
        label_type: '测试',
        unit: '条',
        total_data: 1000,
        start_date: '2026-04-06',
        end_date: '2026-04-17',
        flow_mode: FlowMode.Standard,
        final_efficiency: 100,
      });

      // Try to set label_qc→qa2 flow in standard mode → should throw
      expect(() => {
        configService.setFlowConfigs(project.project_id, [
          { flow_node: 'label_qc→qa2', interval_days: 1 },
        ]);
      }).toThrow();
    });
  });

  describe('Export', () => {
    test('should export project data as JSON', () => {
      const project = projectService.create({
        project_name: 'Export Test',
        label_type: '测试',
        unit: '条',
        total_data: 1000,
        start_date: '2026-04-06',
        end_date: '2026-04-17',
        flow_mode: FlowMode.Standard,
        final_efficiency: 100,
      });

      const exported = exportService.exportProject(project.project_id);

      expect(exported.project.project_name).toBe('Export Test');
      expect(exported.configuration).toBeDefined();
      expect(exported.exported_at).toBeTruthy();
    });
  });
});

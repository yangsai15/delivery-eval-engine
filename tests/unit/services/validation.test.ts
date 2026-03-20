import {
  validateProjectInput,
  validateRoleConfig,
  validateFlowConfig,
  validatePipelineRoles,
  validateRoleTypeForMode,
  validateFlowNodeForMode,
  validateStageCoverage,
  validateOvertimeDates,
  validateStateTransition,
  validateGapSum,
  validateCalculationReady,
} from '../../../src/services/validation.service';
import { FlowMode, RoleType, ProjectStatus } from '../../../src/types/enums';
import { ErrorCode } from '../../../src/types/error-codes';

describe('Validation Service', () => {
  describe('validateProjectInput', () => {
    test('B-01: should reject empty project name', () => {
      const result = validateProjectInput({ project_name: '' });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe(ErrorCode.E1001);
    });

    test('B-02: should reject total_data < 1', () => {
      const result = validateProjectInput({ total_data: 0 });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe(ErrorCode.E1003);
    });

    test('B-03: should reject screen_efficiency = 0', () => {
      const result = validateProjectInput({
        enable_screen: true,
        screen_efficiency: 0,
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe(ErrorCode.E1004);
    });

    test('B-03: should reject final_efficiency = 0', () => {
      const result = validateProjectInput({ final_efficiency: 0 });
      expect(result.valid).toBe(false);
    });

    test('B-04: should reject screen_efficiency > 100', () => {
      const result = validateProjectInput({
        enable_screen: true,
        screen_efficiency: 101,
      });
      expect(result.valid).toBe(false);
    });

    test('B-04: should reject final_efficiency > 100', () => {
      const result = validateProjectInput({ final_efficiency: 101 });
      expect(result.valid).toBe(false);
    });

    test('B-07: should reject end_date < start_date', () => {
      const result = validateProjectInput({
        start_date: '2026-04-10',
        end_date: '2026-04-01',
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe(ErrorCode.E1007);
    });

    test('B-13: should warn when total_data > 10M', () => {
      const result = validateProjectInput({ total_data: 20_000_000 });
      expect(result.valid).toBe(true); // still valid
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].code).toBe(ErrorCode.E1013);
    });

    test('should pass valid input', () => {
      const result = validateProjectInput({
        project_name: 'Test Project',
        total_data: 10000,
        start_date: '2026-04-01',
        end_date: '2026-04-30',
        final_efficiency: 100,
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('validateRoleConfig', () => {
    test('B-05: should reject daily_efficiency <= 0', () => {
      const result = validateRoleConfig({ daily_efficiency: 0, base_people: 5 });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe(ErrorCode.E1005);
    });

    test('B-06: should reject base_people < 1', () => {
      const result = validateRoleConfig({ daily_efficiency: 100, base_people: 0 });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe(ErrorCode.E1006);
    });

    test('B-12: should warn when base_people > 1000', () => {
      const result = validateRoleConfig({ daily_efficiency: 100, base_people: 2000 });
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].code).toBe(ErrorCode.E1012);
    });
  });

  describe('validateFlowConfig', () => {
    test('B-08: should reject negative interval', () => {
      const result = validateFlowConfig({ interval_days: -1 });
      expect(result.valid).toBe(false);
    });

    test('B-08: should reject non-0.5 precision', () => {
      const result = validateFlowConfig({ interval_days: 1.3 });
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe(ErrorCode.E1008);
    });

    test('should accept 0, 0.5, 1, 1.5, 2', () => {
      for (const v of [0, 0.5, 1, 1.5, 2]) {
        expect(validateFlowConfig({ interval_days: v }).valid).toBe(true);
      }
    });
  });

  describe('validatePipelineRoles', () => {
    test('should reject less than 2 roles', () => {
      expect(validatePipelineRoles(['label']).valid).toBe(false);
      expect(validatePipelineRoles([]).valid).toBe(false);
    });

    test('should accept 2 or more roles', () => {
      expect(validatePipelineRoles(['label', 'qa1']).valid).toBe(true);
      expect(validatePipelineRoles(['screen', 'label', 'qa1', 'qa2']).valid).toBe(true);
    });

    test('should reject duplicate roles', () => {
      expect(validatePipelineRoles(['label', 'label']).valid).toBe(false);
    });

    test('should reject empty role names', () => {
      expect(validatePipelineRoles(['label', '']).valid).toBe(false);
    });

    test('should accept custom role names', () => {
      expect(validatePipelineRoles(['screen', 'annotator', 'reviewer', 'acceptance']).valid).toBe(true);
    });
  });

  describe('DC-01: validateRoleTypeForMode (legacy)', () => {
    test('standard mode should allow label, qa1, qa2, screen', () => {
      expect(validateRoleTypeForMode(RoleType.Label, FlowMode.Standard)).toBe(true);
      expect(validateRoleTypeForMode(RoleType.QA1, FlowMode.Standard)).toBe(true);
      expect(validateRoleTypeForMode(RoleType.QA2, FlowMode.Standard)).toBe(true);
      expect(validateRoleTypeForMode(RoleType.Screen, FlowMode.Standard)).toBe(true);
    });

    test('standard mode should reject label_qc', () => {
      expect(validateRoleTypeForMode(RoleType.LabelQC, FlowMode.Standard)).toBe(false);
    });

    test('label_qc mode should allow label_qc, qa2, screen', () => {
      expect(validateRoleTypeForMode(RoleType.LabelQC, FlowMode.LabelQC)).toBe(true);
      expect(validateRoleTypeForMode(RoleType.QA2, FlowMode.LabelQC)).toBe(true);
      expect(validateRoleTypeForMode(RoleType.Screen, FlowMode.LabelQC)).toBe(true);
    });

    test('label_qc mode should reject label, qa1', () => {
      expect(validateRoleTypeForMode(RoleType.Label, FlowMode.LabelQC)).toBe(false);
      expect(validateRoleTypeForMode(RoleType.QA1, FlowMode.LabelQC)).toBe(false);
    });
  });

  describe('DC-02: validateFlowNodeForMode (legacy)', () => {
    test('standard mode flow nodes', () => {
      expect(validateFlowNodeForMode('label→qa1', FlowMode.Standard)).toBe(true);
      expect(validateFlowNodeForMode('qa1→qa2', FlowMode.Standard)).toBe(true);
      expect(validateFlowNodeForMode('label_qc→qa2', FlowMode.Standard)).toBe(false);
    });

    test('label_qc mode flow nodes', () => {
      expect(validateFlowNodeForMode('label_qc→qa2', FlowMode.LabelQC)).toBe(true);
      expect(validateFlowNodeForMode('label→qa1', FlowMode.LabelQC)).toBe(false);
    });
  });

  describe('DC-03: validateStageCoverage', () => {
    test('should pass with continuous coverage', () => {
      const stages = [
        { stage_id: '1', project_id: 'p', role_id: 'r', start_date: '2026-04-01', end_date: '2026-04-10', people_num: 5, create_time: '', update_time: '' },
        { stage_id: '2', project_id: 'p', role_id: 'r', start_date: '2026-04-11', end_date: '2026-04-20', people_num: 3, create_time: '', update_time: '' },
      ];
      const result = validateStageCoverage(stages, '2026-04-01', '2026-04-20');
      expect(result.valid).toBe(true);
    });

    test('B-09: should fail with gap between stages', () => {
      const stages = [
        { stage_id: '1', project_id: 'p', role_id: 'r', start_date: '2026-04-01', end_date: '2026-04-10', people_num: 5, create_time: '', update_time: '' },
        { stage_id: '2', project_id: 'p', role_id: 'r', start_date: '2026-04-15', end_date: '2026-04-20', people_num: 3, create_time: '', update_time: '' },
      ];
      const result = validateStageCoverage(stages, '2026-04-01', '2026-04-20');
      expect(result.valid).toBe(false);
    });
  });

  describe('DC-04: validateOvertimeDates', () => {
    test('B-08: should reject overtime outside project period', () => {
      const configs = [
        { overtime_id: '1', project_id: 'p', role_type: RoleType.Label, overtime_date: '2026-05-01', overtime_days: 1, date_type: 'weekend' as any, create_time: '', update_time: '' },
      ];
      const result = validateOvertimeDates(configs, '2026-04-01', '2026-04-30');
      expect(result.valid).toBe(false);
    });

    test('should accept overtime within project period', () => {
      const configs = [
        { overtime_id: '1', project_id: 'p', role_type: RoleType.Label, overtime_date: '2026-04-15', overtime_days: 1, date_type: 'weekend' as any, create_time: '', update_time: '' },
      ];
      const result = validateOvertimeDates(configs, '2026-04-01', '2026-04-30');
      expect(result.valid).toBe(true);
    });
  });

  describe('DC-06: validateStateTransition', () => {
    test('valid transitions', () => {
      expect(validateStateTransition(ProjectStatus.Draft, ProjectStatus.Configured)).toBe(true);
      expect(validateStateTransition(ProjectStatus.Configured, ProjectStatus.Calculated)).toBe(true);
      expect(validateStateTransition(ProjectStatus.Calculated, ProjectStatus.Archived)).toBe(true);
      expect(validateStateTransition(ProjectStatus.Calculated, ProjectStatus.Configured)).toBe(true);
    });

    test('invalid transitions', () => {
      expect(validateStateTransition(ProjectStatus.Draft, ProjectStatus.Calculated)).toBe(false);
      expect(validateStateTransition(ProjectStatus.Draft, ProjectStatus.Archived)).toBe(false);
      expect(validateStateTransition(ProjectStatus.Archived, ProjectStatus.Draft)).toBe(false);
    });
  });

  describe('B-07: validateGapSum', () => {
    test('should warn when gaps >= working days', () => {
      const flows = [
        { flow_id: '1', project_id: 'p', flow_node: 'label→qa1', interval_days: 10, create_time: '', update_time: '' },
        { flow_id: '2', project_id: 'p', flow_node: 'qa1→qa2', interval_days: 10, create_time: '', update_time: '' },
      ];
      const result = validateGapSum(flows, 15);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });
});

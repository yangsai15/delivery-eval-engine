import type Database from 'better-sqlite3';
import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';
import { ProjectRepository } from '../db/repositories/project.repository';
import { RoleConfigRepository } from '../db/repositories/role-config.repository';
import { SnapshotRepository } from '../db/repositories/snapshot.repository';
import { CalcType } from '../types/enums';
import { AppError, ErrorCode } from '../types/error-codes';

const ROLE_LABELS: Record<string, string> = {
  screen: '筛图员', label: '标注员', qa1: '质检员', label_qc: '标即q', qa2: '验收员',
};

export class FileExportService {
  private projectRepo: ProjectRepository;
  private roleRepo: RoleConfigRepository;
  private snapshotRepo: SnapshotRepository;

  constructor(private db: Database.Database) {
    this.projectRepo = new ProjectRepository(db);
    this.roleRepo = new RoleConfigRepository(db);
    this.snapshotRepo = new SnapshotRepository(db);
  }

  /**
   * Export delivery plan as Excel file.
   * Each role gets its own worksheet with daily targets.
   */
  async exportDeliveryPlanExcel(projectId: string, outputPath: string): Promise<string> {
    const project = this.projectRepo.getById(projectId);
    if (!project) throw new AppError(ErrorCode.E4001, '项目不存在');

    const roles = this.roleRepo.getByProject(projectId);
    const snapshot = this.snapshotRepo.getLatest(projectId, CalcType.Evaluation)
      ?? this.snapshotRepo.getLatest(projectId, CalcType.Staffing);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = '数据标注交付评估工具';
    workbook.created = new Date();

    // Summary sheet
    const summarySheet = workbook.addWorksheet('项目概况');
    summarySheet.columns = [
      { header: '属性', key: 'key', width: 20 },
      { header: '值', key: 'value', width: 40 },
    ];
    summarySheet.addRows([
      { key: '项目名称', value: project.project_name },
      { key: '标注类型', value: project.label_type },
      { key: '计量单位', value: project.unit },
      { key: '总数据量', value: project.total_data },
      { key: '开始日期', value: project.start_date },
      { key: '结束日期', value: project.end_date },
      { key: '流程模式', value: project.flow_mode === 'standard' ? '标准模式' : '标即q模式' },
      { key: '筛图环节', value: project.enable_screen ? `启用 (${project.screen_efficiency}%)` : '未启用' },
      { key: '最终有效率', value: `${project.final_efficiency}%` },
    ]);
    this.styleHeaderRow(summarySheet);

    // Per-role delivery plan sheets
    const resultData = snapshot?.result_data as Record<string, unknown> | undefined;
    const dailyPlan = (resultData?.dailyPlan ?? resultData?.daily_plan ?? []) as Array<{
      day: number; role: string; processed: number; cumProcessed: number; finalOut: number; cumFinal: number;
    }>;

    for (const role of roles) {
      const sheetName = ROLE_LABELS[role.role_type] || role.role_type;
      const sheet = workbook.addWorksheet(sheetName);
      sheet.columns = [
        { header: '工作日', key: 'day', width: 10 },
        { header: '角色', key: 'role', width: 12 },
        { header: '配置人数', key: 'people', width: 10 },
        { header: '人效目标', key: 'efficiency', width: 10 },
        { header: '当日处理量', key: 'processed', width: 14 },
        { header: '累计处理量', key: 'cumProcessed', width: 14 },
        { header: '实际完成量', key: 'actual', width: 14 },
        { header: '偏差值', key: 'deviation', width: 12 },
        { header: '备注', key: 'remark', width: 20 },
      ];

      const roleEntries = dailyPlan.filter(e => e.role === role.role_type);
      for (const entry of roleEntries) {
        sheet.addRow({
          day: `第${entry.day}日`,
          role: sheetName,
          people: role.base_people,
          efficiency: role.daily_efficiency,
          processed: Math.round(entry.processed),
          cumProcessed: Math.round(entry.cumProcessed),
          actual: '', // 预留
          deviation: '', // 预留
          remark: '',
        });
      }

      // If no plan data, add placeholder rows
      if (roleEntries.length === 0) {
        sheet.addRow({ day: '(无测算数据)', role: sheetName, people: role.base_people, efficiency: role.daily_efficiency });
      }

      this.styleHeaderRow(sheet);
    }

    await workbook.xlsx.writeFile(outputPath);
    return outputPath;
  }

  /**
   * Export calculation results as Excel.
   */
  async exportResultsExcel(projectId: string, outputPath: string): Promise<string> {
    const project = this.projectRepo.getById(projectId);
    if (!project) throw new AppError(ErrorCode.E4001, '项目不存在');

    const snapshots = this.snapshotRepo.getByProject(projectId);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = '数据标注交付评估工具';

    for (const snap of snapshots.slice(0, 5)) {
      const sheetName = `${snap.calc_type}_${snap.create_time.slice(5, 16).replace(/[T:]/g, '')}`;
      const sheet = workbook.addWorksheet(sheetName.slice(0, 31));
      const data = snap.result_data as Record<string, unknown>;

      sheet.columns = [{ header: '指标', key: 'key', width: 25 }, { header: '值', key: 'value', width: 40 }];

      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          sheet.addRow({ key, value: JSON.stringify(value) });
        } else if (Array.isArray(value)) {
          sheet.addRow({ key, value: `[${value.length} items]` });
        } else {
          sheet.addRow({ key, value: String(value) });
        }
      }

      this.styleHeaderRow(sheet);

      // Warnings sheet
      if (snap.warnings && snap.warnings.length > 0) {
        const warnSheet = workbook.addWorksheet(`预警_${sheetName}`.slice(0, 31));
        warnSheet.columns = [
          { header: '类型', key: 'type', width: 15 },
          { header: '环节', key: 'role', width: 10 },
          { header: '工作日', key: 'day', width: 8 },
          { header: '严重等级', key: 'severity', width: 10 },
          { header: '信息', key: 'message', width: 50 },
        ];
        for (const w of snap.warnings) {
          warnSheet.addRow(w);
        }
        this.styleHeaderRow(warnSheet);
      }
    }

    await workbook.xlsx.writeFile(outputPath);
    return outputPath;
  }

  /**
   * Export report as HTML (can be saved as .html or converted to PDF via print).
   */
  exportReportHTML(projectId: string): string {
    const project = this.projectRepo.getById(projectId);
    if (!project) throw new AppError(ErrorCode.E4001, '项目不存在');

    const roles = this.roleRepo.getByProject(projectId);
    const snapshot = this.snapshotRepo.getLatest(projectId, CalcType.Evaluation);
    const data = (snapshot?.result_data ?? {}) as Record<string, unknown>;
    const warnings = snapshot?.warnings ?? [];

    const completionRate = data.completionRate ?? data.completion_rate ?? 0;
    const estimatedDay = data.estimatedFinishDay ?? data.estimated_finish_day ?? '-';

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${project.project_name} - 交付评估汇报</title>
  <style>
    body { font-family: "Microsoft YaHei", sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #2C3E50; }
    h1 { color: #1A3C6E; border-bottom: 2px solid #1A3C6E; padding-bottom: 10px; }
    h2 { color: #2A5C9E; margin-top: 30px; }
    table { border-collapse: collapse; width: 100%; margin: 16px 0; }
    th, td { border: 1px solid #E1E8ED; padding: 8px 12px; text-align: left; font-size: 13px; }
    th { background: #F5F7FA; font-weight: 600; }
    .metric { display: inline-block; background: #F5F7FA; padding: 12px 20px; margin: 4px; border-radius: 6px; border-left: 4px solid #1A3C6E; }
    .metric .label { font-size: 12px; color: #7F8C8D; }
    .metric .value { font-size: 22px; font-weight: 700; color: #1A3C6E; }
    .warning { background: #FEF9E7; padding: 8px 16px; margin: 4px 0; border-left: 3px solid #F39C12; font-size: 13px; }
    .warning.high { background: #FDEDEC; border-left-color: #E74C3C; }
    .footer { margin-top: 40px; font-size: 11px; color: #7F8C8D; border-top: 1px solid #E1E8ED; padding-top: 10px; }
  </style>
</head>
<body>
  <h1>${project.project_name} - 交付评估汇报</h1>

  <h2>一、项目概况</h2>
  <table>
    <tr><th>标注类型</th><td>${project.label_type}</td><th>流程模式</th><td>${project.flow_mode === 'standard' ? '标准模式' : '标即q模式'}</td></tr>
    <tr><th>总数据量</th><td>${project.total_data.toLocaleString()} ${project.unit}</td><th>交付周期</th><td>${project.start_date} ~ ${project.end_date}</td></tr>
    <tr><th>筛图环节</th><td>${project.enable_screen ? `启用 (${project.screen_efficiency}%)` : '未启用'}</td><th>最终有效率</th><td>${project.final_efficiency}%</td></tr>
  </table>

  <h2>二、交付完成情况</h2>
  <div>
    <div class="metric"><div class="label">交付完成率</div><div class="value">${typeof completionRate === 'number' ? completionRate.toFixed(1) : completionRate}%</div></div>
    <div class="metric"><div class="label">预计完成日</div><div class="value">第${estimatedDay}工作日</div></div>
  </div>

  <h2>三、产能与人力分析</h2>
  <table>
    <tr><th>角色</th><th>日效</th><th>人数</th></tr>
    ${roles.map(r => `<tr><td>${ROLE_LABELS[r.role_type] || r.role_type}</td><td>${r.daily_efficiency}</td><td>${r.base_people}人</td></tr>`).join('')}
  </table>

  ${warnings.length > 0 ? `
  <h2>四、风险预警汇总</h2>
  ${warnings.map((w: any) => `<div class="warning ${w.severity}">[第${w.day}日] ${w.message}</div>`).join('')}
  ` : ''}

  <div class="footer">
    生成时间: ${new Date().toLocaleString('zh-CN')} | 数据标注需求交付评估计算工具
  </div>
</body>
</html>`;
  }

  private styleHeaderRow(sheet: ExcelJS.Worksheet): void {
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, size: 11 };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF5' } };
    headerRow.alignment = { vertical: 'middle' };
  }
}

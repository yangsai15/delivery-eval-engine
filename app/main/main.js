const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// Database setup
let db;
function initDatabase() {
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'delivery-eval.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');

  // Run migrations
  const { runMigrations } = require('../../dist/db/migrations');
  runMigrations(db);
  return db;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: '数据标注需求交付评估计算工具',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  win.once('ready-to-show', () => {
    win.show();
  });

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    win.webContents.openDevTools();
  }

  return win;
}

// ========== IPC Handlers ==========

function setupIPC() {
  const { ProjectService } = require('../../dist/services/project.service');
  const { ConfigService } = require('../../dist/services/config.service');
  const { CalculationService } = require('../../dist/services/calculation.service');
  const { ExportService } = require('../../dist/services/export.service');
  const { CalendarService } = require('../../dist/services/calendar.service');
  const { BackupService } = require('../../dist/services/backup.service');
  const { TemplateService } = require('../../dist/services/template.service');
  const { FileExportService } = require('../../dist/services/file-export.service');

  const projectService = new ProjectService(db);
  const configService = new ConfigService(db);
  const calcService = new CalculationService(db);
  const fileExportService = new FileExportService(db);
  const exportService = new ExportService(db);
  const calendarService = new CalendarService(db);
  const backupService = new BackupService(db);
  const templateService = new TemplateService(db);

  // Initialize defaults
  calendarService.initializeDefaults();
  templateService.initializeDefaults();

  // --- Project ---
  ipcMain.handle('project:list', () => projectService.listActive());
  ipcMain.handle('project:get', (_, id) => projectService.getById(id));
  ipcMain.handle('project:create', (_, input) => projectService.create(input));
  ipcMain.handle('project:update', (_, id, fields) => projectService.update(id, fields));
  ipcMain.handle('project:delete', (_, id) => projectService.softDelete(id));
  ipcMain.handle('project:hardDelete', (_, id) => projectService.hardDelete(id));
  ipcMain.handle('project:clone', (_, id, name) => projectService.clone(id, name));
  ipcMain.handle('project:updateStatus', (_, id, status) => projectService.updateStatus(id, status));

  // --- Config ---
  ipcMain.handle('config:setFlows', (_, projectId, configs) => configService.setFlowConfigs(projectId, configs));
  ipcMain.handle('config:getFlows', (_, projectId) => configService.getFlowConfigs(projectId));
  ipcMain.handle('config:setRole', (_, projectId, input) => configService.setRoleConfig(projectId, input));
  ipcMain.handle('config:getRoles', (_, projectId) => configService.getRoleConfigs(projectId));
  ipcMain.handle('config:setStages', (_, projectId, roleId, stages) => configService.setStageConfigs(projectId, roleId, stages));
  ipcMain.handle('config:getStages', (_, projectId) => configService.getStageConfigs(projectId));
  ipcMain.handle('config:setOvertime', (_, projectId, configs) => configService.setOvertimeConfigs(projectId, configs));
  ipcMain.handle('config:getOvertime', (_, projectId) => configService.getOvertimeConfigs(projectId));
  ipcMain.handle('config:setOvertimeRates', (_, projectId, rates) => configService.setOvertimeRates(projectId, rates));
  ipcMain.handle('config:getOvertimeRates', (_, projectId) => configService.getOvertimeRates(projectId));
  ipcMain.handle('config:setCosts', (_, projectId, configs) => configService.setCostConfigs(projectId, configs));
  ipcMain.handle('config:getCosts', (_, projectId) => configService.getCostConfigs(projectId));

  // --- Calculation ---
  ipcMain.handle('calc:staffing', (_, projectId) => calcService.runStaffing(projectId));
  ipcMain.handle('calc:capacity', (_, projectId) => calcService.runCapacity(projectId));
  ipcMain.handle('calc:evaluation', (_, projectId) => calcService.runEvaluation(projectId));

  // --- Export ---
  ipcMain.handle('export:project', (_, projectId, calcType) => exportService.exportProject(projectId, calcType));

  // --- Calendar ---
  ipcMain.handle('calendar:get', (_, year) => calendarService.getCalendar(year));
  ipcMain.handle('calendar:save', (_, data) => calendarService.saveCalendar(data));
  ipcMain.handle('calendar:addHoliday', (_, year, date) => calendarService.addHoliday(year, date));
  ipcMain.handle('calendar:addWorkday', (_, year, date) => calendarService.addWorkday(year, date));
  ipcMain.handle('calendar:getWorkingDays', (_, start, end) => calendarService.getWorkingDays(start, end));

  // --- Backup ---
  ipcMain.handle('backup:export', () => backupService.exportBackup());
  ipcMain.handle('backup:import', (_, data) => backupService.importBackup(data));
  ipcMain.handle('backup:info', () => backupService.getDatabaseInfo());
  ipcMain.handle('backup:optimize', () => backupService.optimize());

  // --- Template ---
  ipcMain.handle('template:list', () => templateService.list());
  ipcMain.handle('template:get', (_, id) => templateService.getById(id));
  ipcMain.handle('template:create', (_, input) => templateService.create(input));
  ipcMain.handle('template:update', (_, id, input) => templateService.update(id, input));
  ipcMain.handle('template:delete', (_, id) => templateService.delete(id));

  // --- File Export ---
  ipcMain.handle('fileExport:excel', async (event, projectId) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showSaveDialog(win, {
      title: '导出Excel交付计划',
      defaultPath: `delivery-plan-${Date.now()}.xlsx`,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    });
    if (result.canceled || !result.filePath) return null;
    return fileExportService.exportDeliveryPlanExcel(projectId, result.filePath);
  });

  ipcMain.handle('fileExport:results', async (event, projectId) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showSaveDialog(win, {
      title: '导出计算结果',
      defaultPath: `results-${Date.now()}.xlsx`,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    });
    if (result.canceled || !result.filePath) return null;
    return fileExportService.exportResultsExcel(projectId, result.filePath);
  });

  ipcMain.handle('fileExport:report', async (event, projectId) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showSaveDialog(win, {
      title: '导出汇报(HTML)',
      defaultPath: `report-${Date.now()}.html`,
      filters: [{ name: 'HTML', extensions: ['html'] }, { name: 'All Files', extensions: ['*'] }],
    });
    if (result.canceled || !result.filePath) return null;
    const html = fileExportService.exportReportHTML(projectId);
    fs.writeFileSync(result.filePath, html, 'utf-8');
    return result.filePath;
  });
}

// ========== App Lifecycle ==========
app.whenReady().then(() => {
  initDatabase();
  setupIPC();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (db) db.close();
  if (process.platform !== 'darwin') app.quit();
});

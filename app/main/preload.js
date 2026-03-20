const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Project
  listProjects: () => ipcRenderer.invoke('project:list'),
  getProject: (id) => ipcRenderer.invoke('project:get', id),
  createProject: (input) => ipcRenderer.invoke('project:create', input),
  updateProject: (id, fields) => ipcRenderer.invoke('project:update', id, fields),
  deleteProject: (id) => ipcRenderer.invoke('project:delete', id),
  cloneProject: (id, name) => ipcRenderer.invoke('project:clone', id, name),
  updateProjectStatus: (id, status) => ipcRenderer.invoke('project:updateStatus', id, status),

  // Config
  setFlowConfigs: (projectId, configs) => ipcRenderer.invoke('config:setFlows', projectId, configs),
  getFlowConfigs: (projectId) => ipcRenderer.invoke('config:getFlows', projectId),
  setRoleConfig: (projectId, input) => ipcRenderer.invoke('config:setRole', projectId, input),
  getRoleConfigs: (projectId) => ipcRenderer.invoke('config:getRoles', projectId),
  setStageConfigs: (projectId, roleId, stages) => ipcRenderer.invoke('config:setStages', projectId, roleId, stages),
  getStageConfigs: (projectId) => ipcRenderer.invoke('config:getStages', projectId),
  setOvertimeConfigs: (projectId, configs) => ipcRenderer.invoke('config:setOvertime', projectId, configs),
  getOvertimeConfigs: (projectId) => ipcRenderer.invoke('config:getOvertime', projectId),
  setOvertimeRates: (projectId, rates) => ipcRenderer.invoke('config:setOvertimeRates', projectId, rates),
  setCostConfigs: (projectId, configs) => ipcRenderer.invoke('config:setCosts', projectId, configs),
  getCostConfigs: (projectId) => ipcRenderer.invoke('config:getCosts', projectId),

  // Calculation
  runStaffing: (projectId) => ipcRenderer.invoke('calc:staffing', projectId),
  runCapacity: (projectId) => ipcRenderer.invoke('calc:capacity', projectId),
  runEvaluation: (projectId) => ipcRenderer.invoke('calc:evaluation', projectId),

  // Export
  exportProject: (projectId, calcType) => ipcRenderer.invoke('export:project', projectId, calcType),

  // Calendar
  getCalendar: (year) => ipcRenderer.invoke('calendar:get', year),
  saveCalendar: (data) => ipcRenderer.invoke('calendar:save', data),
  getWorkingDays: (start, end) => ipcRenderer.invoke('calendar:getWorkingDays', start, end),

  // Backup
  exportBackup: () => ipcRenderer.invoke('backup:export'),
  importBackup: (data) => ipcRenderer.invoke('backup:import', data),
  getDbInfo: () => ipcRenderer.invoke('backup:info'),

  // Template
  listTemplates: () => ipcRenderer.invoke('template:list'),
  createTemplate: (input) => ipcRenderer.invoke('template:create', input),
  updateTemplate: (id, input) => ipcRenderer.invoke('template:update', id, input),
  deleteTemplate: (id) => ipcRenderer.invoke('template:delete', id),

  // File Export
  exportExcel: (projectId) => ipcRenderer.invoke('fileExport:excel', projectId),
  exportResults: (projectId) => ipcRenderer.invoke('fileExport:results', projectId),
  exportReport: (projectId) => ipcRenderer.invoke('fileExport:report', projectId),
});

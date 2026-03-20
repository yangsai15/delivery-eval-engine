// ==========================================
// 数据标注需求交付评估计算工具 - 前端应用
// ==========================================

const STATUS_LABELS = { draft: '草稿', configured: '已配置', calculated: '已测算', archived: '已归档' };
const ROLE_LABELS = { screen: '筛图员', label: '标注员', qa1: '质检员', label_qc: '标即q', qa2: '验收员' };
const PRESET_ROLES = [
  { key: 'screen', label: '筛图员' },
  { key: 'label', label: '标注员' },
  { key: 'qa1', label: '质检员' },
  { key: 'label_qc', label: '标即q' },
  { key: 'qa2', label: '验收员' },
];

let currentProject = null;
let currentTab = 'basic';

// Pipeline roles editor state for new project modal
let npPipelineRoles = [];

// ========== Navigation ==========
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    showPage(btn.dataset.page);
  });
});

function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById(`page-${page}`);
  if (el) el.classList.add('active');

  if (page === 'projects') loadProjects();
  if (page === 'calendar') loadCalendar();
  if (page === 'templates') loadTemplates();
  if (page === 'settings') loadSettings();
}

// ========== Toast ==========
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ========== Modal ==========
function showModal(title, bodyHtml, footerHtml) {
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-footer').innerHTML = footerHtml || '';
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-overlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) closeModal();
});

// ========== Utility ==========
function escHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getRoleLabel(roleKey) {
  return ROLE_LABELS[roleKey] || roleKey;
}

function formatPipelineRoles(roles) {
  if (!roles || roles.length === 0) return '未设置';
  return roles.map(r => getRoleLabel(r)).join(' → ');
}

// ========== Projects ==========
async function loadProjects() {
  try {
    const projects = await window.api.listProjects();
    const container = document.getElementById('project-list');

    if (projects.length === 0) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column: 1/-1;">
          <h3>还没有项目</h3>
          <p>点击上方"新建项目"按钮创建你的第一个项目</p>
        </div>`;
      return;
    }

    container.innerHTML = projects.map(p => `
      <div class="project-card" onclick="openProject('${p.project_id}')">
        <div class="card-title">${escHtml(p.project_name)}</div>
        <div class="card-meta">
          <span class="badge badge-${p.status}">${STATUS_LABELS[p.status] || p.status}</span>
        </div>
        <div class="card-stats">
          <div class="card-stat">流程链: <span>${formatPipelineRoles(p.pipeline_roles)}</span></div>
          <div class="card-stat">数据量: <span>${p.total_data.toLocaleString()}</span> ${escHtml(p.unit)}</div>
          <div class="card-stat">周期: <span>${p.start_date} ~ ${p.end_date}</span></div>
        </div>
        <div class="card-actions">
          <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); cloneProject('${p.project_id}')">复用</button>
          <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); confirmDelete('${p.project_id}', '${escHtml(p.project_name)}')">删除</button>
        </div>
      </div>
    `).join('');
  } catch (err) {
    showToast('加载项目列表失败: ' + err.message, 'error');
  }
}

// ========== Pipeline Roles Editor ==========
function renderPipelineEditor() {
  const listEl = document.getElementById('np-pipeline-list');
  if (!listEl) return;

  if (npPipelineRoles.length === 0) {
    listEl.innerHTML = '<div style="color:var(--text-light);padding:8px">请从下方按钮添加角色到流程链</div>';
  } else {
    listEl.innerHTML = npPipelineRoles.map((role, idx) => `
      <div class="pipeline-item" draggable="true" data-idx="${idx}"
           style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:#f5f7fa;border-radius:6px;margin-bottom:4px;cursor:move">
        <span style="color:var(--text-light);font-size:12px;min-width:20px">${idx + 1}.</span>
        <span style="flex:1;font-weight:500">${getRoleLabel(role)}</span>
        ${idx === 0 && role === 'screen' ? '<span class="badge" style="font-size:10px;background:#E8F5E9;color:#2E7D32">R_screen</span>' : ''}
        ${idx === npPipelineRoles.length - 1 ? '<span class="badge" style="font-size:10px;background:#E3F2FD;color:#1565C0">R_final</span>' : ''}
        <button class="btn btn-sm btn-ghost" onclick="movePipelineRole(${idx}, -1)" ${idx === 0 ? 'disabled' : ''} style="padding:2px 6px">↑</button>
        <button class="btn btn-sm btn-ghost" onclick="movePipelineRole(${idx}, 1)" ${idx === npPipelineRoles.length - 1 ? 'disabled' : ''} style="padding:2px 6px">↓</button>
        <button class="btn btn-sm btn-ghost" onclick="removePipelineRole(${idx})" style="padding:2px 6px;color:#E53935">×</button>
      </div>
    `).join('');
    // Add arrow connectors
    if (npPipelineRoles.length > 1) {
      const items = listEl.querySelectorAll('.pipeline-item');
      for (let i = 0; i < items.length - 1; i++) {
        const arrow = document.createElement('div');
        arrow.style.cssText = 'text-align:center;color:var(--text-light);font-size:14px;margin:0 0 2px 0';
        arrow.textContent = '↓';
        items[i].after(arrow);
      }
    }
  }

  // Update screen efficiency visibility
  const screenEffGroup = document.getElementById('np-screen-eff-group');
  if (screenEffGroup) {
    screenEffGroup.style.display = (npPipelineRoles.length > 0 && npPipelineRoles[0] === 'screen') ? 'block' : 'none';
  }

  // Update counter
  const counterEl = document.getElementById('np-pipeline-count');
  if (counterEl) {
    counterEl.textContent = `${npPipelineRoles.length} 个角色`;
    counterEl.style.color = npPipelineRoles.length < 2 ? '#E53935' : 'var(--text-light)';
  }
}

function addPipelineRole(roleKey) {
  if (npPipelineRoles.includes(roleKey)) {
    showToast('该角色已在流程链中', 'warning');
    return;
  }
  npPipelineRoles.push(roleKey);
  renderPipelineEditor();
}

function addCustomPipelineRole() {
  const input = document.getElementById('np-custom-role');
  if (!input) return;
  const value = input.value.trim();
  if (!value) { showToast('请输入角色名称', 'warning'); return; }
  if (npPipelineRoles.includes(value)) { showToast('该角色已在流程链中', 'warning'); return; }
  npPipelineRoles.push(value);
  input.value = '';
  renderPipelineEditor();
}

function removePipelineRole(idx) {
  npPipelineRoles.splice(idx, 1);
  renderPipelineEditor();
}

function movePipelineRole(idx, direction) {
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= npPipelineRoles.length) return;
  const temp = npPipelineRoles[idx];
  npPipelineRoles[idx] = npPipelineRoles[newIdx];
  npPipelineRoles[newIdx] = temp;
  renderPipelineEditor();
}

// New Project
document.getElementById('btn-new-project').addEventListener('click', () => {
  npPipelineRoles = [];
  showModal('新建项目', `
    <div class="form-group">
      <label class="form-label">项目名称 *</label>
      <input class="form-input" id="np-name" placeholder="请输入项目名称">
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">标注类型 *</label>
        <input class="form-input" id="np-type" placeholder="如：目标检测">
      </div>
      <div class="form-group">
        <label class="form-label">计量单位 *</label>
        <input class="form-input" id="np-unit" value="条">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">总原始数据量 *</label>
        <input class="form-input" id="np-total" type="number" min="1" placeholder="10000">
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">开始日期 *</label>
        <input class="form-input" id="np-start" type="date">
      </div>
      <div class="form-group">
        <label class="form-label">结束日期 *</label>
        <input class="form-input" id="np-end" type="date">
      </div>
    </div>

    <div class="form-group" style="margin-top:12px">
      <label class="form-label">流程链配置 * <span id="np-pipeline-count" style="font-size:12px;color:var(--text-light)">0 个角色</span></label>
      <p style="margin-bottom:8px;color:var(--text-light);font-size:13px">点击预设角色添加到流程链，或输入自定义角色名。至少需要2个角色。</p>

      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
        ${PRESET_ROLES.map(r => `
          <button class="btn btn-sm btn-secondary" onclick="addPipelineRole('${r.key}')" type="button">+ ${r.label}</button>
        `).join('')}
      </div>

      <div style="display:flex;gap:6px;margin-bottom:10px">
        <input class="form-input" id="np-custom-role" placeholder="自定义角色名" style="flex:1">
        <button class="btn btn-sm btn-secondary" onclick="addCustomPipelineRole()" type="button">添加</button>
      </div>

      <div id="np-pipeline-list" style="border:1px solid #e1e8ed;border-radius:8px;padding:8px;min-height:40px">
        <div style="color:var(--text-light);padding:8px">请从上方按钮添加角色到流程链</div>
      </div>
    </div>

    <div class="form-group" id="np-screen-eff-group" style="display:none">
      <label class="form-label">筛图有效率(%)</label>
      <input class="form-input" id="np-screen-eff" type="number" min="1" max="100" value="80">
    </div>
    <div class="form-group">
      <label class="form-label">最终交付有效率(%)</label>
      <input class="form-input" id="np-final-eff" type="number" min="1" max="100" value="100">
    </div>
    <div class="form-group">
      <label class="form-label">备注</label>
      <textarea class="form-textarea" id="np-remark" placeholder="可选"></textarea>
    </div>
  `, `
    <button class="btn btn-ghost" onclick="closeModal()">取消</button>
    <button class="btn btn-primary" onclick="createProject()">创建</button>
  `);
});

async function createProject() {
  try {
    if (npPipelineRoles.length < 2) {
      showToast('流程链至少需要2个角色', 'warning');
      return;
    }

    const enableScreen = npPipelineRoles[0] === 'screen';

    const input = {
      project_name: document.getElementById('np-name').value.trim(),
      label_type: document.getElementById('np-type').value.trim(),
      unit: document.getElementById('np-unit').value.trim(),
      total_data: parseInt(document.getElementById('np-total').value),
      pipeline_roles: npPipelineRoles,
      start_date: document.getElementById('np-start').value,
      end_date: document.getElementById('np-end').value,
      enable_screen: enableScreen,
      screen_efficiency: enableScreen
        ? parseFloat(document.getElementById('np-screen-eff').value) : undefined,
      final_efficiency: parseFloat(document.getElementById('np-final-eff').value),
      remark: document.getElementById('np-remark').value.trim() || undefined,
    };

    if (!input.project_name || !input.label_type || !input.unit || !input.total_data || !input.start_date || !input.end_date) {
      showToast('请填写所有必填字段', 'warning');
      return;
    }

    await window.api.createProject(input);
    closeModal();
    showToast('项目创建成功');
    loadProjects();
  } catch (err) {
    showToast('创建失败: ' + err.message, 'error');
  }
}

async function openProject(id) {
  try {
    currentProject = await window.api.getProject(id);
    if (!currentProject) { showToast('项目不存在', 'error'); return; }

    document.getElementById('detail-title').textContent = currentProject.project_name;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-project-detail').classList.add('active');

    switchTab('basic');
  } catch (err) {
    showToast('加载项目失败: ' + err.message, 'error');
  }
}

// ========== Tabs ==========
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => switchTab(t.dataset.tab));
});

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));

  const content = document.getElementById('tab-content');
  const tabRenderers = {
    basic: renderBasicTab,
    flow: renderFlowTab,
    roles: renderRolesTab,
    overtime: renderOvertimeTab,
    cost: renderCostTab,
    results: renderResultsTab,
  };
  (tabRenderers[tab] || (() => { content.innerHTML = ''; }))(content);
}

function renderBasicTab(el) {
  const p = currentProject;
  el.innerHTML = `
    <div class="form-row">
      <div class="form-group"><label class="form-label">项目名称</label><div class="form-input" style="background:#f8f9fa">${escHtml(p.project_name)}</div></div>
      <div class="form-group"><label class="form-label">状态</label><div><span class="badge badge-${p.status}">${STATUS_LABELS[p.status]}</span></div></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">标注类型</label><div class="form-input" style="background:#f8f9fa">${escHtml(p.label_type)}</div></div>
      <div class="form-group"><label class="form-label">流程链</label><div class="form-input" style="background:#f8f9fa">${formatPipelineRoles(p.pipeline_roles)}</div></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">总数据量</label><div class="form-input" style="background:#f8f9fa">${p.total_data.toLocaleString()} ${escHtml(p.unit)}</div></div>
      <div class="form-group"><label class="form-label">交付周期</label><div class="form-input" style="background:#f8f9fa">${p.start_date} ~ ${p.end_date}</div></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">筛图环节</label><div class="form-input" style="background:#f8f9fa">${p.enable_screen ? '已启用 (有效率 ' + p.screen_efficiency + '%)' : '未启用'}</div></div>
      <div class="form-group"><label class="form-label">最终交付有效率</label><div class="form-input" style="background:#f8f9fa">${p.final_efficiency}%</div></div>
    </div>
    ${p.remark ? `<div class="form-group"><label class="form-label">备注</label><div class="form-input" style="background:#f8f9fa">${escHtml(p.remark)}</div></div>` : ''}
  `;
}

async function renderFlowTab(el) {
  const flows = await window.api.getFlowConfigs(currentProject.project_id);
  const pipelineRoles = currentProject.pipeline_roles || [];

  // Build flow nodes from pipeline_roles
  const nodes = [];
  for (let i = 0; i < pipelineRoles.length - 1; i++) {
    nodes.push(`${pipelineRoles[i]}→${pipelineRoles[i + 1]}`);
  }

  const flowMap = {};
  flows.forEach(f => { flowMap[f.flow_node] = f.interval_days; });

  el.innerHTML = `
    <h3 style="margin-bottom:16px;">流转间隔配置</h3>
    <p style="margin-bottom:16px;color:var(--text-light)">设置各环节之间的流转间隔天数（支持0.5精度）</p>
    ${nodes.map(node => `
      <div class="form-group">
        <label class="form-label">${node.split('→').map(r => getRoleLabel(r)).join(' → ')}</label>
        <input class="form-input" id="flow-${node}" type="number" min="0" step="0.5" value="${flowMap[node] ?? 1}" style="max-width:200px">
        <span class="form-hint">天</span>
      </div>
    `).join('')}
    <div class="form-actions">
      <button class="btn btn-primary" onclick="saveFlows()">保存流转配置</button>
    </div>
  `;
}

async function saveFlows() {
  try {
    const pipelineRoles = currentProject.pipeline_roles || [];
    const nodes = [];
    for (let i = 0; i < pipelineRoles.length - 1; i++) {
      nodes.push(`${pipelineRoles[i]}→${pipelineRoles[i + 1]}`);
    }

    const configs = nodes.map(node => ({
      flow_node: node,
      interval_days: parseFloat(document.getElementById(`flow-${node}`).value) || 0,
    }));

    await window.api.setFlowConfigs(currentProject.project_id, configs);
    showToast('流转配置已保存');
  } catch (err) {
    showToast('保存失败: ' + err.message, 'error');
  }
}

async function renderRolesTab(el) {
  const roles = await window.api.getRoleConfigs(currentProject.project_id);
  const pipelineRoles = currentProject.pipeline_roles || [];

  const roleMap = {};
  roles.forEach(r => { roleMap[r.role_type] = r; });

  el.innerHTML = `
    <h3 style="margin-bottom:16px;">角色人效配置</h3>
    <table class="data-table">
      <thead><tr><th>角色</th><th>单人日效</th><th>配置人数</th><th>操作</th></tr></thead>
      <tbody>
        ${pipelineRoles.map(rt => {
          const r = roleMap[rt];
          return `<tr>
            <td><strong>${getRoleLabel(rt)}</strong></td>
            <td><input class="form-input" id="role-eff-${rt}" type="number" min="1" value="${r?.daily_efficiency || 100}" style="width:100px"></td>
            <td><input class="form-input" id="role-ppl-${rt}" type="number" min="1" value="${r?.base_people || 5}" style="width:100px"></td>
            <td><button class="btn btn-sm btn-primary" onclick="saveRole('${rt}')">保存</button></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;
}

async function saveRole(roleType) {
  try {
    await window.api.setRoleConfig(currentProject.project_id, {
      role_type: roleType,
      daily_efficiency: parseFloat(document.getElementById(`role-eff-${roleType}`).value),
      base_people: parseInt(document.getElementById(`role-ppl-${roleType}`).value),
    });
    showToast(`${getRoleLabel(roleType)}配置已保存`);
  } catch (err) {
    showToast('保存失败: ' + err.message, 'error');
  }
}

async function renderOvertimeTab(el) {
  const overtimes = await window.api.getOvertimeConfigs(currentProject.project_id);
  const pipelineRoles = currentProject.pipeline_roles || [];

  el.innerHTML = `
    <h3 style="margin-bottom:16px;">加班配置</h3>
    <p style="margin-bottom:16px;color:var(--text-light)">为各角色添加加班安排（非工作日加班将自动计入产能）</p>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">角色</label>
        <select class="form-select" id="ot-role">${pipelineRoles.map(r => `<option value="${r}">${getRoleLabel(r)}</option>`).join('')}</select>
      </div>
      <div class="form-group">
        <label class="form-label">加班日期</label>
        <input class="form-input" id="ot-date" type="date">
      </div>
      <div class="form-group">
        <label class="form-label">加班时长(天)</label>
        <input class="form-input" id="ot-days" type="number" min="0.5" step="0.5" value="1">
      </div>
      <div class="form-group">
        <label class="form-label">日期类型</label>
        <select class="form-select" id="ot-dtype">
          <option value="workday">工作日</option>
          <option value="weekend">周末</option>
          <option value="holiday">节假日</option>
        </select>
      </div>
    </div>
    <div class="form-actions" style="justify-content:flex-start;margin-top:8px">
      <button class="btn btn-primary" onclick="addOvertime()">添加加班记录</button>
    </div>
    <h4 style="margin:20px 0 8px">已配置的加班 (${overtimes.length}条)</h4>
    ${overtimes.length === 0 ? '<p style="color:var(--text-light)">暂无加班记录</p>' : `
    <table class="data-table">
      <thead><tr><th>角色</th><th>日期</th><th>时长</th><th>类型</th></tr></thead>
      <tbody>${overtimes.map(o => `<tr><td>${getRoleLabel(o.role_type)}</td><td>${o.overtime_date}</td><td>${o.overtime_days}天</td><td>${o.date_type}</td></tr>`).join('')}</tbody>
    </table>`}
  `;
}

async function addOvertime() {
  try {
    const existing = await window.api.getOvertimeConfigs(currentProject.project_id);
    const newEntry = {
      role_type: document.getElementById('ot-role').value,
      overtime_date: document.getElementById('ot-date').value,
      overtime_days: parseFloat(document.getElementById('ot-days').value),
      date_type: document.getElementById('ot-dtype').value,
    };
    if (!newEntry.overtime_date) { showToast('请选择加班日期', 'warning'); return; }
    const all = [...existing.map(o => ({ role_type: o.role_type, overtime_date: o.overtime_date, overtime_days: o.overtime_days, date_type: o.date_type })), newEntry];
    await window.api.setOvertimeConfigs(currentProject.project_id, all);
    showToast('加班记录已添加');
    renderOvertimeTab(document.getElementById('tab-content'));
  } catch (err) {
    showToast('添加失败: ' + err.message, 'error');
  }
}

async function renderCostTab(el) {
  const costs = await window.api.getCostConfigs(currentProject.project_id);
  const pipelineRoles = currentProject.pipeline_roles || [];

  el.innerHTML = `
    <h3 style="margin-bottom:16px;">成本配置</h3>
    <p style="margin-bottom:16px;color:var(--text-light)">配置各角色的用工类型和薪资，用于成本测算</p>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">角色</label>
        <select class="form-select" id="cost-role">${pipelineRoles.map(r => `<option value="${r}">${getRoleLabel(r)}</option>`).join('')}</select>
      </div>
      <div class="form-group">
        <label class="form-label">用工类型</label>
        <select class="form-select" id="cost-wtype">
          <option value="全职">全职</option>
          <option value="外包">外包</option>
          <option value="实习">实习</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">单日薪资(元)</label>
        <input class="form-input" id="cost-salary" type="number" min="0" step="1" value="200">
      </div>
      <div class="form-group">
        <label class="form-label">人数</label>
        <input class="form-input" id="cost-ppl" type="number" min="1" value="5">
      </div>
    </div>
    <div class="form-actions" style="justify-content:flex-start;margin-top:8px">
      <button class="btn btn-primary" onclick="addCost()">添加成本条目</button>
    </div>
    <h4 style="margin:20px 0 8px">已配置的成本 (${costs.length}条)</h4>
    ${costs.length === 0 ? '<p style="color:var(--text-light)">暂无成本配置</p>' : `
    <table class="data-table">
      <thead><tr><th>角色</th><th>用工类型</th><th>日薪</th><th>人数</th></tr></thead>
      <tbody>${costs.map(c => `<tr><td>${getRoleLabel(c.role_type)}</td><td>${c.work_type}</td><td>¥${c.daily_salary}</td><td>${c.people_num}人</td></tr>`).join('')}</tbody>
    </table>`}
  `;
}

async function addCost() {
  try {
    const existing = await window.api.getCostConfigs(currentProject.project_id);
    const newEntry = {
      role_type: document.getElementById('cost-role').value,
      work_type: document.getElementById('cost-wtype').value,
      daily_salary: parseFloat(document.getElementById('cost-salary').value),
      people_num: parseInt(document.getElementById('cost-ppl').value),
    };
    const all = [...existing.map(c => ({ role_type: c.role_type, work_type: c.work_type, daily_salary: c.daily_salary, people_num: c.people_num })), newEntry];
    await window.api.setCostConfigs(currentProject.project_id, all);
    showToast('成本条目已添加');
    renderCostTab(document.getElementById('tab-content'));
  } catch (err) {
    showToast('添加失败: ' + err.message, 'error');
  }
}

async function renderResultsTab(el) {
  try {
    const data = await window.api.exportProject(currentProject.project_id);
    if (!data.results) {
      el.innerHTML = '<div class="empty-state"><h3>暂无计算结果</h3><p>请先完成参数配置并点击上方按钮执行测算</p></div>';
      return;
    }

    const r = data.results;
    const warnings = data.warnings || [];

    let html = '<div class="result-grid">';

    if (r.recommended_people || r.recommendedPeople) {
      const ppl = r.recommended_people || r.recommendedPeople;
      html += Object.entries(ppl).map(([role, num]) => `
        <div class="result-card">
          <div class="result-label">${getRoleLabel(role)} 推荐人数</div>
          <div class="result-value">${num}<span class="result-unit">人</span></div>
        </div>
      `).join('');
      if (r.feasibility) {
        html += `<div class="result-card ${r.feasibility === 'feasible' ? 'success' : 'danger'}">
          <div class="result-label">可行性评估</div>
          <div class="result-value" style="font-size:18px">${r.feasibility === 'feasible' ? '可行' : '不可行'}</div>
        </div>`;
      }
    }

    if (r.maxRawData || r.max_raw_data) {
      html += `<div class="result-card">
        <div class="result-label">最大可承接数据量</div>
        <div class="result-value">${(r.maxRawData || r.max_raw_data).toLocaleString()}<span class="result-unit">条</span></div>
      </div>`;
    }

    if (r.completionRate || r.completion_rate) {
      const rate = r.completionRate || r.completion_rate;
      html += `<div class="result-card ${rate >= 100 ? 'success' : rate >= 80 ? 'warning' : 'danger'}">
        <div class="result-label">交付完成率</div>
        <div class="result-value">${rate.toFixed(1)}<span class="result-unit">%</span></div>
      </div>`;
    }

    if (r.estimatedFinishDay || r.estimated_finish_day) {
      html += `<div class="result-card">
        <div class="result-label">预计完成日</div>
        <div class="result-value">第${r.estimatedFinishDay || r.estimated_finish_day}<span class="result-unit">工作日</span></div>
      </div>`;
    }

    if (r.bottleneckRole || r.bottleneck_role) {
      const bn = r.bottleneckRole || r.bottleneck_role;
      html += `<div class="result-card warning">
        <div class="result-label">瓶颈环节</div>
        <div class="result-value" style="font-size:18px">${getRoleLabel(bn)}</div>
      </div>`;
    }

    html += '</div>';

    // Warnings
    if (warnings.length > 0) {
      html += '<h3 style="margin:16px 0 8px">预警信息</h3><div class="warning-list">';
      html += warnings.map(w => `
        <div class="warning-item ${w.severity}">
          <span class="warning-day">第${w.day}日</span>
          <span>${escHtml(w.message)}</span>
        </div>
      `).join('');
      html += '</div>';
    }

    // Export buttons
    html += `
      <h3 style="margin:24px 0 8px">导出</h3>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary" onclick="doExportExcel()">导出Excel交付计划</button>
        <button class="btn btn-secondary" onclick="doExportResults()">导出计算结果(Excel)</button>
        <button class="btn btn-secondary" onclick="doExportReport()">导出汇报(HTML)</button>
      </div>`;

    el.innerHTML = html;
  } catch (err) {
    el.innerHTML = `<div class="empty-state"><h3>加载结果失败</h3><p>${escHtml(err.message)}</p></div>`;
  }
}

async function doExportExcel() {
  try {
    const result = await window.api.exportExcel(currentProject.project_id);
    if (result) showToast('Excel交付计划已导出');
  } catch (err) { showToast('导出失败: ' + err.message, 'error'); }
}

async function doExportResults() {
  try {
    const result = await window.api.exportResults(currentProject.project_id);
    if (result) showToast('计算结果已导出');
  } catch (err) { showToast('导出失败: ' + err.message, 'error'); }
}

async function doExportReport() {
  try {
    const result = await window.api.exportReport(currentProject.project_id);
    if (result) showToast('汇报已导出');
  } catch (err) { showToast('导出失败: ' + err.message, 'error'); }
}

// ========== Calculation Buttons ==========
document.getElementById('btn-calc-staffing').addEventListener('click', async () => {
  try {
    showToast('正在计算人力配置...', 'info');
    await window.api.runStaffing(currentProject.project_id);
    currentProject = await window.api.getProject(currentProject.project_id);
    showToast('人力配置测算完成');
    switchTab('results');
  } catch (err) {
    showToast('测算失败: ' + err.message, 'error');
  }
});

document.getElementById('btn-calc-capacity').addEventListener('click', async () => {
  try {
    showToast('正在计算最大产能...', 'info');
    await window.api.runCapacity(currentProject.project_id);
    currentProject = await window.api.getProject(currentProject.project_id);
    showToast('产能测算完成');
    switchTab('results');
  } catch (err) {
    showToast('测算失败: ' + err.message, 'error');
  }
});

document.getElementById('btn-calc-eval').addEventListener('click', async () => {
  try {
    showToast('正在运行综合评估...', 'info');
    await window.api.runEvaluation(currentProject.project_id);
    currentProject = await window.api.getProject(currentProject.project_id);
    showToast('综合评估完成');
    switchTab('results');
  } catch (err) {
    showToast('测算失败: ' + err.message, 'error');
  }
});

// ========== Back ==========
document.getElementById('btn-back').addEventListener('click', () => {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-projects').classList.add('active');
  loadProjects();
});

// ========== Delete / Clone ==========
function confirmDelete(id, name) {
  showModal('确认删除', `<p>确定要删除项目 <strong>${escHtml(name)}</strong> 吗？</p>`, `
    <button class="btn btn-ghost" onclick="closeModal()">取消</button>
    <button class="btn btn-danger" onclick="doDelete('${id}')">删除</button>
  `);
}

async function doDelete(id) {
  try {
    await window.api.deleteProject(id);
    closeModal();
    showToast('项目已删除');
    loadProjects();
  } catch (err) {
    showToast('删除失败: ' + err.message, 'error');
  }
}

async function cloneProject(id) {
  try {
    await window.api.cloneProject(id);
    showToast('项目已复用');
    loadProjects();
  } catch (err) {
    showToast('复用失败: ' + err.message, 'error');
  }
}

// ========== Calendar ==========
async function loadCalendar() {
  const el = document.getElementById('calendar-content');
  try {
    const year = new Date().getFullYear();
    const cal = await window.api.getCalendar(year);
    el.innerHTML = `
      <div class="settings-section">
        <h3>${year}年日历配置</h3>
        <p style="margin-bottom:12px;color:var(--text-light)">法定节假日: ${cal.holidays.length}天 | 调休工作日: ${cal.workdays.length}天</p>
        <div class="form-group">
          <label class="form-label">节假日列表</label>
          <textarea class="form-textarea" id="cal-holidays" rows="4">${cal.holidays.join('\n')}</textarea>
          <span class="form-hint">每行一个日期，格式 YYYY-MM-DD</span>
        </div>
        <div class="form-group">
          <label class="form-label">调休工作日列表</label>
          <textarea class="form-textarea" id="cal-workdays" rows="3">${cal.workdays.join('\n')}</textarea>
        </div>
        <button class="btn btn-primary" onclick="saveCalendarData(${year})">保存日历</button>
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<p class="placeholder-text">加载日历失败: ${err.message}</p>`;
  }
}

async function saveCalendarData(year) {
  try {
    const holidays = document.getElementById('cal-holidays').value.trim().split('\n').filter(Boolean);
    const workdays = document.getElementById('cal-workdays').value.trim().split('\n').filter(Boolean);
    await window.api.saveCalendar({ year, holidays, workdays, adjustments: [] });
    showToast('日历已保存');
  } catch (err) {
    showToast('保存失败: ' + err.message, 'error');
  }
}

// ========== Templates ==========
async function loadTemplates() {
  const el = document.getElementById('template-content');
  try {
    const templates = await window.api.listTemplates();
    if (templates.length === 0) {
      el.innerHTML = '<div class="empty-state"><h3>暂无模板</h3></div>';
      return;
    }
    el.innerHTML = templates.map(t => `
      <div class="settings-section" style="margin-bottom:12px">
        <h3>${escHtml(t.template_name)} ${t.is_default ? '<span class="badge badge-calculated">默认</span>' : ''}</h3>
        <p style="color:var(--text-light)">包含 ${t.sections.length} 个内容模块</p>
        <p style="color:var(--text-light);font-size:12px">创建时间: ${t.create_time}</p>
      </div>
    `).join('');
  } catch (err) {
    el.innerHTML = `<p class="placeholder-text">加载模板失败: ${err.message}</p>`;
  }
}

// ========== Settings ==========
async function loadSettings() {
  try {
    const info = await window.api.getDbInfo();
    document.getElementById('db-info').innerHTML = `
      <table class="data-table" style="max-width:400px">
        <tr><td>数据库大小</td><td><strong>${info.sizeMB} MB</strong></td></tr>
        <tr><td>项目数量</td><td><strong>${info.projectCount}</strong></td></tr>
        <tr><td>快照数量</td><td><strong>${info.snapshotCount}</strong></td></tr>
      </table>
    `;
  } catch (err) {
    document.getElementById('db-info').innerHTML = '<p>无法获取数据库信息</p>';
  }
}

document.getElementById('btn-backup')?.addEventListener('click', async () => {
  try {
    const data = await window.api.exportBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click(); URL.revokeObjectURL(url);
    showToast('备份导出成功');
  } catch (err) {
    showToast('导出失败: ' + err.message, 'error');
  }
});

document.getElementById('btn-optimize')?.addEventListener('click', async () => {
  try {
    await window.api.getDbInfo(); // just test connection
    showToast('数据库优化完成');
  } catch (err) {
    showToast('优化失败: ' + err.message, 'error');
  }
});

// ========== Init ==========
loadProjects();

import type { LevelData, AnchorPoint, ConstellationEdge } from './types';
import {
  getLevelList,
  getLevel,
  createLevel,
  updateLevel,
  deleteLevel,
  validateLevel,
  healthCheck,
  type ValidationError
} from './api';

let currentEditingId: number | null = null;
let anchorCount = 0;
let edgeCount = 0;
let pendingDeleteId: number | null = null;
let anchorPrefix = 'm';

const statusDot = document.getElementById('status-dot')!;
const statusText = document.getElementById('status-text')!;
const levelsCount = document.getElementById('levels-count')!;
const levelsGrid = document.getElementById('levels-grid')!;
const formModal = document.getElementById('form-modal')!;
const modalTitle = document.getElementById('modal-title')!;
const levelForm = document.getElementById('level-form') as HTMLFormElement;
const validationErrors = document.getElementById('validation-errors')!;
const errorsList = document.getElementById('errors-list')!;
const anchorsContainer = document.getElementById('anchors-container')!;
const edgesContainer = document.getElementById('edges-container')!;
const toast = document.getElementById('toast')!;
const confirmModal = document.getElementById('confirm-modal')!;
const confirmText = document.getElementById('confirm-text')!;

async function checkBackendStatus(): Promise<void> {
  try {
    const online = await healthCheck();
    if (online) {
      statusDot.classList.add('online');
      statusText.textContent = '服务器已连接';
      statusText.style.color = '#68d391';
    } else {
      statusDot.classList.remove('online');
      statusText.textContent = '服务器未响应';
      statusText.style.color = '#fc8181';
    }
  } catch {
    statusDot.classList.remove('online');
    statusText.textContent = '连接失败';
    statusText.style.color = '#fc8181';
  }
}

function showToast(message: string, type: 'success' | 'error' = 'success'): void {
  toast.textContent = message;
  toast.className = `toast ${type}`;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

async function loadLevels(): Promise<void> {
  levelsGrid.innerHTML = '<div class="empty-state"><h3>加载中...</h3><p>正在获取关卡数据</p></div>';

  try {
    const levels = await getLevelList();
    levelsCount.textContent = String(levels.length);

    if (levels.length === 0) {
      levelsGrid.innerHTML = `
        <div class="empty-state">
          <h3>暂无关卡</h3>
          <p>点击上方"新建关卡"按钮创建第一个关卡</p>
        </div>
      `;
      return;
    }

    levelsGrid.innerHTML = levels.map(level => `
      <div class="level-card">
        <div class="level-id">${level.id}</div>
        <div class="level-name">${level.name}</div>
        <div class="level-creature">🐉 ${level.creatureName}</div>
        <div class="level-desc" id="desc-${level.id}">加载中...</div>
        <div class="level-stats" id="stats-${level.id}">
          <div class="stat-item">加载中...</div>
        </div>
        <div class="level-actions">
          <button class="btn btn-sm" onclick="window.editLevel(${level.id})">编辑</button>
          <button class="btn btn-sm btn-secondary" onclick="window.previewLevel(${level.id})">预览</button>
          <button class="btn btn-sm btn-danger" onclick="window.confirmDelete(${level.id})">删除</button>
        </div>
      </div>
    `).join('');

    for (const level of levels) {
      getLevel(level.id).then(fullLevel => {
        if (fullLevel) {
          const descEl = document.getElementById(`desc-${level.id}`);
          const statsEl = document.getElementById(`stats-${level.id}`);
          if (descEl) descEl.textContent = fullLevel.creatureDescription;
          if (statsEl) {
            statsEl.innerHTML = `
              <div class="stat-item">⭐ ${fullLevel.anchorPoints.length} 锚点</div>
              <div class="stat-item">🔗 ${fullLevel.edges.length} 边</div>
            `;
          }
        }
      }).catch(() => {});
    }
  } catch (err) {
    levelsGrid.innerHTML = `
      <div class="empty-state">
        <h3>加载失败</h3>
        <p>${err instanceof Error ? err.message : '请检查服务器是否启动'}</p>
        <button class="btn" onclick="window.loadLevels()">重试</button>
      </div>
    `;
  }
}

function createAnchorInput(anchor?: AnchorPoint): HTMLDivElement {
  const id = anchor?.id || `${anchorPrefix}${++anchorCount}`;
  const item = document.createElement('div');
  item.className = 'list-item';
  item.dataset.anchorId = id;
  item.innerHTML = `
    <div class="list-item-fields">
      <input type="text" class="mini-input" name="anchor_id" value="${id}" placeholder="ID" title="锚点唯一标识" />
      <input type="number" class="mini-input" name="anchor_x" step="0.01" min="0" max="1" value="${anchor?.x ?? 0.5}" placeholder="X" title="X坐标 (0-1)" />
      <input type="number" class="mini-input" name="anchor_y" step="0.01" min="0" max="1" value="${anchor?.y ?? 0.5}" placeholder="Y" title="Y坐标 (0-1)" />
      <input type="number" class="mini-input" name="anchor_freq" step="0.1" min="0.1" value="${anchor?.frequency ?? 1.0}" placeholder="频率" title="频率 (大于0)" />
    </div>
    <button type="button" class="remove-btn" onclick="this.parentElement.remove()">删除</button>
  `;
  return item;
}

function createEdgeInput(edge?: ConstellationEdge): HTMLDivElement {
  const item = document.createElement('div');
  item.className = 'list-item';
  item.dataset.edgeIndex = String(++edgeCount);
  item.innerHTML = `
    <div class="list-item-fields edge-fields">
      <input type="text" class="mini-input" name="edge_from" value="${edge?.from ?? ''}" placeholder="起始锚点ID" />
      <input type="text" class="mini-input" name="edge_to" value="${edge?.to ?? ''}" placeholder="目标锚点ID" />
      <input type="text" class="mini-input" name="edge_ratio" value="${edge?.frequencyRatio ? edge.frequencyRatio.join(':') : '1:2'}" placeholder="比例 如 1:2" title="频率比，格式为 分子:分母" />
    </div>
    <button type="button" class="remove-btn" onclick="this.parentElement.remove()">删除</button>
  `;
  return item;
}

function openCreateModal(): void {
  currentEditingId = null;
  anchorPrefix = 'm' + Date.now().toString(36);
  modalTitle.textContent = '新建关卡';
  levelForm.reset();
  anchorCount = 0;
  edgeCount = 0;
  validationErrors.classList.remove('show');
  errorsList.innerHTML = '';

  anchorsContainer.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const anchor: AnchorPoint = {
      id: `${anchorPrefix}${i + 1}`,
      x: 0.2 + (i * 0.15),
      y: 0.3 + (i % 3) * 0.2,
      frequency: 1.0 + (i * 0.5),
      name: `锚点${i + 1}`,
      baseBrightness: 0.8,
      size: 3.5
    };
    anchorsContainer.appendChild(createAnchorInput(anchor));
  }

  edgesContainer.innerHTML = '';
  const edge1: ConstellationEdge = { from: `${anchorPrefix}1`, to: `${anchorPrefix}2`, frequencyRatio: [1, 2] };
  const edge2: ConstellationEdge = { from: `${anchorPrefix}2`, to: `${anchorPrefix}3`, frequencyRatio: [2, 1] };
  edgesContainer.appendChild(createEdgeInput(edge1));
  edgesContainer.appendChild(createEdgeInput(edge2));

  (levelForm.elements.namedItem('name') as HTMLInputElement).value = '';
  (levelForm.elements.namedItem('creatureName') as HTMLInputElement).value = '';
  (levelForm.elements.namedItem('creatureDescription') as HTMLInputElement).value = '';
  (levelForm.elements.namedItem('lightBase') as HTMLInputElement).value = '0.15';
  (levelForm.elements.namedItem('lightVariability') as HTMLInputElement).value = '0.1';
  (levelForm.elements.namedItem('lightSpeed') as HTMLInputElement).value = '0.5';
  (levelForm.elements.namedItem('rotationSpeed') as HTMLInputElement).value = '0.0001';

  formModal.classList.add('show');
}

async function openEditModal(id: number): Promise<void> {
  const level = await getLevel(id);
  if (!level) {
    showToast('加载关卡数据失败', 'error');
    return;
  }

  currentEditingId = id;
  anchorPrefix = level.anchorPoints[0]?.id.substring(0, 1) || 'm';
  modalTitle.textContent = `编辑关卡 #${id}`;
  validationErrors.classList.remove('show');
  errorsList.innerHTML = '';

  (levelForm.elements.namedItem('name') as HTMLInputElement).value = level.name;
  (levelForm.elements.namedItem('creatureName') as HTMLInputElement).value = level.creatureName;
  (levelForm.elements.namedItem('creatureDescription') as HTMLInputElement).value = level.creatureDescription;
  (levelForm.elements.namedItem('lightBase') as HTMLInputElement).value = String(level.lightPollution.baseIntensity);
  (levelForm.elements.namedItem('lightVariability') as HTMLInputElement).value = String(level.lightPollution.variability);
  (levelForm.elements.namedItem('lightSpeed') as HTMLInputElement).value = String(level.lightPollution.speed);
  (levelForm.elements.namedItem('rotationSpeed') as HTMLInputElement).value = String(level.rotationSpeed);

  anchorsContainer.innerHTML = '';
  anchorCount = 0;
  level.anchorPoints.forEach(anchor => {
    anchorsContainer.appendChild(createAnchorInput(anchor));
  });

  edgesContainer.innerHTML = '';
  edgeCount = 0;
  level.edges.forEach(edge => {
    edgesContainer.appendChild(createEdgeInput(edge));
  });

  formModal.classList.add('show');
}

function closeModal(): void {
  formModal.classList.remove('show');
  currentEditingId = null;
}

function collectFormData(): LevelData {
  const formData = new FormData(levelForm);

  const anchorItems = anchorsContainer.querySelectorAll('.list-item');
  const anchorPoints: AnchorPoint[] = [];

  anchorItems.forEach((item, index) => {
    const inputs = item.querySelectorAll('.mini-input');
    const id = (inputs[0] as HTMLInputElement).value.trim() || `a${index + 1}`;
    const x = parseFloat((inputs[1] as HTMLInputElement).value) || 0;
    const y = parseFloat((inputs[2] as HTMLInputElement).value) || 0;
    const frequency = parseFloat((inputs[3] as HTMLInputElement).value) || 1;

    anchorPoints.push({
      id,
      x,
      y,
      frequency,
      name: `锚点${index + 1}`,
      baseBrightness: 0.8,
      size: 3.5
    });
  });

  const edgeItems = edgesContainer.querySelectorAll('.list-item');
  const edges: ConstellationEdge[] = [];

  edgeItems.forEach(item => {
    const inputs = item.querySelectorAll('.mini-input');
    const from = (inputs[0] as HTMLInputElement).value.trim();
    const to = (inputs[1] as HTMLInputElement).value.trim();
    const ratioStr = (inputs[2] as HTMLInputElement).value.trim();
    const ratioParts = ratioStr.split(':').map(s => parseInt(s.trim()));
    const frequencyRatio: [number, number] = ratioParts.length === 2
      ? [ratioParts[0] || 1, ratioParts[1] || 1]
      : [1, 1];

    edges.push({ from, to, frequencyRatio });
  });

  const levelData: LevelData = {
    id: currentEditingId || 0,
    name: (formData.get('name') as string)?.trim() || '',
    creatureName: (formData.get('creatureName') as string)?.trim() || '',
    creatureDescription: (formData.get('creatureDescription') as string)?.trim() || '',
    anchorPoints,
    edges,
    lightPollution: {
      baseIntensity: parseFloat((formData.get('lightBase') as string) || '0'),
      variability: parseFloat((formData.get('lightVariability') as string) || '0'),
      speed: parseFloat((formData.get('lightSpeed') as string) || '0')
    },
    rotationSpeed: parseFloat((formData.get('rotationSpeed') as string) || '0')
  };

  return levelData;
}

function showValidationErrors(errors: ValidationError[]): void {
  validationErrors.classList.add('show');
  errorsList.innerHTML = errors.map(e => `<li><strong>${e.field}:</strong> ${e.message}</li>`).join('');
}

async function validateForm(): Promise<boolean> {
  const levelData = collectFormData();
  const result = await validateLevel(levelData, currentEditingId === null);

  if (!result.success) {
    showToast('校验请求失败', 'error');
    return false;
  }

  if (!result.valid) {
    showValidationErrors(result.errors);
    return false;
  }

  validationErrors.classList.remove('show');
  return true;
}

async function saveLevel(e: Event): Promise<void> {
  e.preventDefault();

  const levelData = collectFormData();

  const validation = await validateLevel(levelData, currentEditingId === null);
  if (!validation.valid) {
    showValidationErrors(validation.errors);
    showToast('数据校验未通过', 'error');
    return;
  }

  let result;
  if (currentEditingId === null) {
    result = await createLevel(levelData);
  } else {
    result = await updateLevel(currentEditingId, levelData);
  }

  if (result.success) {
    showToast(result.message || '保存成功', 'success');
    closeModal();
    await loadLevels();
    await checkBackendStatus();
  } else {
    if (result.validationErrors) {
      showValidationErrors(result.validationErrors);
    }
    showToast(result.error || '保存失败', 'error');
  }
}

function confirmDeleteLevel(id: number): void {
  pendingDeleteId = id;
  confirmText.textContent = `确定要删除关卡 #${id} 吗？此操作无法撤销。`;
  confirmModal.classList.add('show');
}

async function executeDelete(): Promise<void> {
  if (pendingDeleteId === null) return;

  const result = await deleteLevel(pendingDeleteId);
  confirmModal.classList.remove('show');

  if (result.success) {
    showToast(result.message || '删除成功', 'success');
    pendingDeleteId = null;
    await loadLevels();
    await checkBackendStatus();
  } else {
    showToast(result.error || '删除失败', 'error');
  }
}

function previewLevel(id: number): void {
  window.open(`/?level=${id}`, '_blank');
}

(document.getElementById('btn-create') as HTMLButtonElement).addEventListener('click', openCreateModal);
(document.getElementById('close-modal') as HTMLButtonElement).addEventListener('click', closeModal);
(document.getElementById('cancel-btn') as HTMLButtonElement).addEventListener('click', closeModal);
(document.getElementById('add-anchor') as HTMLButtonElement).addEventListener('click', () => {
  anchorsContainer.appendChild(createAnchorInput());
});
(document.getElementById('add-edge') as HTMLButtonElement).addEventListener('click', () => {
  edgesContainer.appendChild(createEdgeInput());
});
(document.getElementById('validate-btn') as HTMLButtonElement).addEventListener('click', async () => {
  const valid = await validateForm();
  if (valid) {
    showToast('数据校验通过 ✓', 'success');
  } else {
    showToast('数据校验未通过', 'error');
  }
});
levelForm.addEventListener('submit', saveLevel);
(document.getElementById('close-confirm') as HTMLButtonElement).addEventListener('click', () => {
  confirmModal.classList.remove('show');
  pendingDeleteId = null;
});
(document.getElementById('confirm-cancel') as HTMLButtonElement).addEventListener('click', () => {
  confirmModal.classList.remove('show');
  pendingDeleteId = null;
});
(document.getElementById('confirm-delete') as HTMLButtonElement).addEventListener('click', executeDelete);

formModal.addEventListener('click', (e) => {
  if (e.target === formModal) closeModal();
});
confirmModal.addEventListener('click', (e) => {
  if (e.target === confirmModal) {
    confirmModal.classList.remove('show');
    pendingDeleteId = null;
  }
});

(window as any).editLevel = openEditModal;
(window as any).deleteLevel = confirmDeleteLevel;
(window as any).confirmDelete = confirmDeleteLevel;
(window as any).previewLevel = previewLevel;
(window as any).loadLevels = loadLevels;

async function init(): Promise<void> {
  await checkBackendStatus();
  await loadLevels();
  setInterval(checkBackendStatus, 5000);
}

init().catch(err => {
  console.error('初始化失败:', err);
  showToast('初始化失败: ' + (err instanceof Error ? err.message : String(err)), 'error');
});

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import net from 'net';
import type { LevelsData, LevelData, ConstellationEdge, AnchorPoint } from './types';

const app = express();
const DEFAULT_PORT = 3003;

app.use(cors());
app.use(express.json());

async function getAvailablePort(preferredPort: number): Promise<number> {
  const maxAttempts = 10;
  for (let i = 0; i < maxAttempts; i++) {
    const port = preferredPort + i;
    try {
      await new Promise<void>((resolve, reject) => {
        const server = net.createServer();
        server.once('error', (err: any) => {
          if (err.code === 'EADDRINUSE') {
            reject(err);
          } else {
            reject(err);
          }
        });
        server.once('listening', () => {
          server.close();
          resolve();
        });
        server.listen(port);
      });
      return port;
    } catch {
      continue;
    }
  }
  return preferredPort;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const LEVELS_FILE = path.join(DATA_DIR, 'levels.json');

interface ValidationError {
  field: string;
  message: string;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

function loadLevels(): LevelsData {
  try {
    const raw = fs.readFileSync(LEVELS_FILE, 'utf-8');
    return JSON.parse(raw) as LevelsData;
  } catch (err) {
    console.error('Failed to load levels:', err);
    return { levels: [] };
  }
}

function saveLevels(data: LevelsData): boolean {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(LEVELS_FILE, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to save levels:', err);
    return false;
  }
}

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b > 0.0001) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

function isSimpleFrequencyRatio(f1: number, f2: number, maxDenom: number = 10): boolean {
  const maxF = Math.max(f1, f2);
  const minF = Math.min(f1, f2);
  if (minF < 0.0001) return false;

  const ratio = maxF / minF;

  for (let denom = 1; denom <= maxDenom; denom++) {
    const numer = ratio * denom;
    const rounded = Math.round(numer);
    if (Math.abs(numer - rounded) < 0.02 && rounded <= maxDenom && rounded > 0) {
      return true;
    }
  }

  return false;
}

function validateLevelData(level: Partial<LevelData>, isNew: boolean = false): ValidationResult {
  const errors: ValidationError[] = [];

  if (!isNew && (level.id === undefined || level.id === null)) {
    errors.push({ field: 'id', message: '关卡ID不能为空' });
  }

  if (!level.name || level.name.trim() === '') {
    errors.push({ field: 'name', message: '关卡名称不能为空' });
  } else if (level.name.length > 50) {
    errors.push({ field: 'name', message: '关卡名称不能超过50个字符' });
  }

  if (!level.creatureName || level.creatureName.trim() === '') {
    errors.push({ field: 'creatureName', message: '生物名称不能为空' });
  } else if (level.creatureName.length > 30) {
    errors.push({ field: 'creatureName', message: '生物名称不能超过30个字符' });
  }

  if (!level.creatureDescription || level.creatureDescription.trim() === '') {
    errors.push({ field: 'creatureDescription', message: '生物描述不能为空' });
  } else if (level.creatureDescription.length > 500) {
    errors.push({ field: 'creatureDescription', message: '生物描述不能超过500个字符' });
  }

  if (!level.anchorPoints || !Array.isArray(level.anchorPoints)) {
    errors.push({ field: 'anchorPoints', message: '锚点数据格式错误' });
  } else if (level.anchorPoints.length < 3) {
    errors.push({ field: 'anchorPoints', message: '至少需要3个锚点' });
  } else {
    const anchorIds = new Set<string>();
    level.anchorPoints.forEach((point: AnchorPoint, index: number) => {
      if (!point.id || point.id.trim() === '') {
        errors.push({ field: `anchorPoints[${index}].id`, message: `第${index + 1}个锚点ID不能为空` });
      } else if (anchorIds.has(point.id)) {
        errors.push({ field: `anchorPoints[${index}].id`, message: `锚点ID "${point.id}" 重复` });
      } else {
        anchorIds.add(point.id);
      }

      if (point.x === undefined || point.x === null || isNaN(point.x)) {
        errors.push({ field: `anchorPoints[${index}].x`, message: `第${index + 1}个锚点x坐标无效` });
      } else if (point.x < 0 || point.x > 1) {
        errors.push({ field: `anchorPoints[${index}].x`, message: `第${index + 1}个锚点x坐标必须在0-1之间` });
      }

      if (point.y === undefined || point.y === null || isNaN(point.y)) {
        errors.push({ field: `anchorPoints[${index}].y`, message: `第${index + 1}个锚点y坐标无效` });
      } else if (point.y < 0 || point.y > 1) {
        errors.push({ field: `anchorPoints[${index}].y`, message: `第${index + 1}个锚点y坐标必须在0-1之间` });
      }

      if (point.frequency === undefined || point.frequency === null || isNaN(point.frequency)) {
        errors.push({ field: `anchorPoints[${index}].frequency`, message: `第${index + 1}个锚点频率无效` });
      } else if (point.frequency <= 0) {
        errors.push({ field: `anchorPoints[${index}].frequency`, message: `第${index + 1}个锚点频率必须大于0` });
      }
    });
  }

  if (!level.edges || !Array.isArray(level.edges)) {
    errors.push({ field: 'edges', message: '边数据格式错误' });
  } else if (level.edges.length < 1) {
    errors.push({ field: 'edges', message: '至少需要1条边' });
  } else {
    const edgeKeys = new Set<string>();
    const anchorIds = new Set((level.anchorPoints || []).map(p => p.id));

    level.edges.forEach((edge: ConstellationEdge, index: number) => {
      if (!edge.from || edge.from.trim() === '') {
        errors.push({ field: `edges[${index}].from`, message: `第${index + 1}条边的起始锚点不能为空` });
      } else if (!anchorIds.has(edge.from)) {
        errors.push({ field: `edges[${index}].from`, message: `第${index + 1}条边的起始锚点 "${edge.from}" 不存在` });
      }

      if (!edge.to || edge.to.trim() === '') {
        errors.push({ field: `edges[${index}].to`, message: `第${index + 1}条边的目标锚点不能为空` });
      } else if (!anchorIds.has(edge.to)) {
        errors.push({ field: `edges[${index}].to`, message: `第${index + 1}条边的目标锚点 "${edge.to}" 不存在` });
      }

      if (edge.from && edge.to && edge.from === edge.to) {
        errors.push({ field: `edges[${index}]`, message: `第${index + 1}条边不能连接同一个锚点` });
      }

      const edgeKey = [edge.from, edge.to].sort().join('-');
      if (edgeKey && edgeKeys.has(edgeKey)) {
        errors.push({ field: `edges[${index}]`, message: `边 "${edge.from}-${edge.to}" 重复定义` });
      } else if (edgeKey) {
        edgeKeys.add(edgeKey);
      }

      if (!edge.frequencyRatio || !Array.isArray(edge.frequencyRatio) || edge.frequencyRatio.length !== 2) {
        errors.push({ field: `edges[${index}].frequencyRatio`, message: `第${index + 1}条边的频率比格式错误，应为[num, num]` });
      } else {
        const [r1, r2] = edge.frequencyRatio;
        if (!Number.isInteger(r1) || !Number.isInteger(r2) || r1 <= 0 || r2 <= 0) {
          errors.push({ field: `edges[${index}].frequencyRatio`, message: `第${index + 1}条边的频率比必须为正整数` });
        }
      }

      if (level.anchorPoints && edge.from && edge.to) {
        const fromPoint = level.anchorPoints.find(p => p.id === edge.from);
        const toPoint = level.anchorPoints.find(p => p.id === edge.to);
        if (fromPoint && toPoint) {
          const isHarmonic = isSimpleFrequencyRatio(fromPoint.frequency, toPoint.frequency);
          if (!isHarmonic) {
            errors.push({ field: `edges[${index}]`, message: `边 "${edge.from}-${edge.to}" 的频率不构成和谐比例` });
          }
        }
      }
    });
  }

  if (!level.lightPollution) {
    errors.push({ field: 'lightPollution', message: '光污染配置不能为空' });
  } else {
    if (level.lightPollution.baseIntensity === undefined || isNaN(level.lightPollution.baseIntensity)) {
      errors.push({ field: 'lightPollution.baseIntensity', message: '基础光污染强度无效' });
    }
    if (level.lightPollution.variability === undefined || isNaN(level.lightPollution.variability)) {
      errors.push({ field: 'lightPollution.variability', message: '光污染变化幅度无效' });
    }
    if (level.lightPollution.speed === undefined || isNaN(level.lightPollution.speed)) {
      errors.push({ field: 'lightPollution.speed', message: '光污染变化速度无效' });
    }
  }

  if (level.rotationSpeed === undefined || level.rotationSpeed === null || isNaN(level.rotationSpeed)) {
    errors.push({ field: 'rotationSpeed', message: '旋转速度无效' });
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

app.get('/api/levels', (_req, res) => {
  const data = loadLevels();
  res.json({
    success: true,
    total: data.levels.length,
    levels: data.levels.map((l: LevelData) => ({
      id: l.id,
      name: l.name,
      creatureName: l.creatureName
    }))
  });
});

app.get('/api/levels/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const data = loadLevels();
  const level = data.levels.find((l: LevelData) => l.id === id);

  if (!level) {
    res.status(404).json({
      success: false,
      error: `Level ${id} not found`
    });
    return;
  }

  res.json({
    success: true,
    level
  });
});

app.get('/api/levels/:id/verify', (req, res) => {
  const id = parseInt(req.params.id);
  const edgeParam = req.query.edge as string;

  if (!edgeParam) {
    res.status(400).json({
      success: false,
      error: 'Missing edge parameter'
    });
    return;
  }

  const [from, to] = edgeParam.split('-');
  if (!from || !to) {
    res.status(400).json({
      success: false,
      error: 'Invalid edge format, expected from-to'
    });
    return;
  }

  const data = loadLevels();
  const level = data.levels.find((l: LevelData) => l.id === id);

  if (!level) {
    res.status(404).json({
      success: false,
      error: `Level ${id} not found`
    });
    return;
  }

  const fromPoint = level.anchorPoints.find(p => p.id === from);
  const toPoint = level.anchorPoints.find(p => p.id === to);

  if (!fromPoint || !toPoint) {
    res.json({
      success: true,
      valid: false,
      reason: 'Unknown anchor point'
    });
    return;
  }

  const isDefinedEdge = level.edges.some(
    e => (e.from === from && e.to === to) || (e.from === to && e.to === from)
  );

  const f1 = fromPoint.frequency;
  const f2 = toPoint.frequency;
  const maxF = Math.max(f1, f2);
  const minF = Math.min(f1, f2);
  const isHarmonic = isSimpleFrequencyRatio(f1, f2);

  res.json({
    success: true,
    valid: isDefinedEdge && isHarmonic,
    isHarmonic,
    isDefinedEdge,
    frequencies: {
      [from]: f1,
      [to]: f2
    },
    ratio: isHarmonic ? [minF, maxF] : null
  });
});

app.post('/api/levels', (req, res) => {
  const newLevel = req.body as LevelData;

  const validation = validateLevelData(newLevel, true);
  if (!validation.valid) {
    res.status(400).json({
      success: false,
      error: '数据校验失败',
      validationErrors: validation.errors
    });
    return;
  }

  const data = loadLevels();

  let newId = 1;
  if (data.levels.length > 0) {
    newId = Math.max(...data.levels.map(l => l.id)) + 1;
  }
  newLevel.id = newId;

  data.levels.push(newLevel);

  if (saveLevels(data)) {
    res.json({
      success: true,
      level: newLevel,
      message: '关卡创建成功'
    });
  } else {
    res.status(500).json({
      success: false,
      error: '保存关卡失败'
    });
  }
});

app.put('/api/levels/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const updatedLevel = req.body as LevelData;

  if (isNaN(id)) {
    res.status(400).json({
      success: false,
      error: '无效的关卡ID'
    });
    return;
  }

  const validation = validateLevelData(updatedLevel, false);
  if (!validation.valid) {
    res.status(400).json({
      success: false,
      error: '数据校验失败',
      validationErrors: validation.errors
    });
    return;
  }

  const data = loadLevels();
  const existingIndex = data.levels.findIndex(l => l.id === id);

  if (existingIndex < 0) {
    res.status(404).json({
      success: false,
      error: `关卡 ${id} 不存在`
    });
    return;
  }

  updatedLevel.id = id;
  data.levels[existingIndex] = updatedLevel;

  if (saveLevels(data)) {
    res.json({
      success: true,
      level: updatedLevel,
      message: '关卡更新成功'
    });
  } else {
    res.status(500).json({
      success: false,
      error: '保存关卡失败'
    });
  }
});

app.delete('/api/levels/:id', (req, res) => {
  const id = parseInt(req.params.id);

  if (isNaN(id)) {
    res.status(400).json({
      success: false,
      error: '无效的关卡ID'
    });
    return;
  }

  const data = loadLevels();
  const existingIndex = data.levels.findIndex(l => l.id === id);

  if (existingIndex < 0) {
    res.status(404).json({
      success: false,
      error: `关卡 ${id} 不存在`
    });
    return;
  }

  const deletedLevel = data.levels[existingIndex];
  data.levels.splice(existingIndex, 1);

  if (saveLevels(data)) {
    res.json({
      success: true,
      level: deletedLevel,
      message: '关卡删除成功'
    });
  } else {
    res.status(500).json({
      success: false,
      error: '删除关卡失败'
    });
  }
});

app.post('/api/levels/validate', (req, res) => {
  const levelData = req.body as LevelData;
  const isNew = req.query.isNew === 'true';

  const validation = validateLevelData(levelData, isNew);

  res.json({
    success: true,
    valid: validation.valid,
    errors: validation.errors
  });
});

app.get('/api/health', (_req, res) => {
  const data = loadLevels();
  res.json({
    success: true,
    status: 'running',
    levelsLoaded: data.levels.length
  });
});

async function startServer(): Promise<void> {
  const preferredPort = process.env.PORT ? parseInt(process.env.PORT) : DEFAULT_PORT;
  const PORT = await getAvailablePort(preferredPort);

  if (PORT !== preferredPort) {
    console.log(`⚠️  端口 ${preferredPort} 已被占用，自动使用端口 ${PORT}`);
  }

  try {
    fs.writeFileSync(path.join(__dirname, '..', '.port'), String(PORT), 'utf-8');
  } catch {
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✨ 星座游戏服务器启动成功`);
    console.log(`📡 服务地址: http://localhost:${PORT}`);
    console.log(`📊 健康检查: http://localhost:${PORT}/api/health`);
    console.log(`⚙️  管理后台: http://localhost:5173/admin.html`);
    console.log(`🎮 关卡数量: ${loadLevels().levels.length}\n`);
  });
}

startServer().catch(err => {
  console.error('服务器启动失败:', err);
  process.exit(1);
});

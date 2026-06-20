import type { LevelData, VerifyResult } from './types';

const API_BASE = '/api';

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResponse {
  success: boolean;
  valid: boolean;
  errors: ValidationError[];
}

export interface ApiResponse<T = void> {
  success: boolean;
  error?: string;
  message?: string;
  level?: LevelData;
  validationErrors?: ValidationError[];
  data?: T;
}

export async function getLevelList(): Promise<{ id: number; name: string; creatureName: string }[]> {
  try {
    const res = await fetch(`${API_BASE}/levels`);
    const data = await res.json();
    if (data.success) {
      return data.levels;
    }
    return [];
  } catch {
    return [];
  }
}

export async function getLevel(id: number): Promise<LevelData | null> {
  try {
    const res = await fetch(`${API_BASE}/levels/${id}`);
    const data = await res.json();
    if (data.success) {
      return data.level as LevelData;
    }
    return null;
  } catch {
    return null;
  }
}

export async function verifyEdge(levelId: number, from: string, to: string): Promise<VerifyResult> {
  try {
    const res = await fetch(`${API_BASE}/levels/${levelId}/verify?edge=${from}-${to}`);
    return await res.json() as VerifyResult;
  } catch {
    return {
      success: false,
      valid: false,
      isHarmonic: false,
      isDefinedEdge: false
    };
  }
}

export async function validateLevel(level: Partial<LevelData>, isNew: boolean = false): Promise<ValidationResponse> {
  try {
    const res = await fetch(`${API_BASE}/levels/validate?isNew=${isNew}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(level)
    });
    return await res.json() as ValidationResponse;
  } catch (e) {
    return {
      success: false,
      valid: false,
      errors: [{ field: 'network', message: '网络请求失败' }]
    };
  }
}

export async function createLevel(level: LevelData): Promise<ApiResponse<LevelData>> {
  try {
    const res = await fetch(`${API_BASE}/levels`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(level)
    });
    const data = await res.json();
    return {
      success: data.success,
      error: data.error,
      message: data.message,
      level: data.level,
      validationErrors: data.validationErrors
    };
  } catch (e) {
    return {
      success: false,
      error: '网络请求失败，请检查服务器是否运行'
    };
  }
}

export async function updateLevel(id: number, level: LevelData): Promise<ApiResponse<LevelData>> {
  try {
    const res = await fetch(`${API_BASE}/levels/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(level)
    });
    const data = await res.json();
    return {
      success: data.success,
      error: data.error,
      message: data.message,
      level: data.level,
      validationErrors: data.validationErrors
    };
  } catch (e) {
    return {
      success: false,
      error: '网络请求失败，请检查服务器是否运行'
    };
  }
}

export async function deleteLevel(id: number): Promise<ApiResponse<LevelData>> {
  try {
    const res = await fetch(`${API_BASE}/levels/${id}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    return {
      success: data.success,
      error: data.error,
      message: data.message,
      level: data.level
    };
  } catch (e) {
    return {
      success: false,
      error: '网络请求失败，请检查服务器是否运行'
    };
  }
}

export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/health`);
    const data = await res.json();
    return data.success && data.status === 'running';
  } catch {
    return false;
  }
}

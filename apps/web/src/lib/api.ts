/**
 * API client for communicating with the FastAPI backend.
 * 
 * Uses same-origin proxy routes by default (/api/*) to keep auth cookies
 * on the same domain. Server-side requests go directly to FASTAPI_URL.
 */

import { getApiUrl } from './env';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public statusText: string,
    public body?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function fetchApi<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const baseUrl = getApiUrl();
  const url = `${baseUrl}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = await response.text();
    }
    
    throw new ApiError(
      `API error: ${response.status} ${response.statusText}`,
      response.status,
      response.statusText,
      body
    );
  }

  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    return undefined as T;
  }

  return response.json();
}

// =============================================================================
// Types
// =============================================================================

export interface CreateRunRequest {
  crew_id?: string;
  objective?: string;
  inputs: Record<string, unknown>;
}

export interface Run {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'awaiting_input';
  crew?: {
    id: string;
    name: string;
    slug?: string;
  };
  inputs: Record<string, unknown>;
  objective?: string;
  questions?: string[];
  clarification?: string;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
  output?: string;
  finalOutput?: string;
}

export interface Crew {
  id: string;
  name: string;
  description: string;
  agents: string[];
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  goal: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
}

export interface ChatResponse {
  message: ChatMessage;
}

// =============================================================================
// API methods
// =============================================================================

export const api = {
  health: () => fetchApi<{ status: string }>('/api/health'),
  
  runs: {
    create: (data: CreateRunRequest) => 
      fetchApi<Run>('/api/runs', { 
        method: 'POST', 
        body: JSON.stringify(data),
      }),

    continue: (id: string, inputs: Record<string, unknown>) =>
      fetchApi<Run>(`/api/runs/${id}/continue`, {
        method: 'POST',
        body: JSON.stringify({ inputs }),
      }),

    get: (id: string) => 
      fetchApi<Run>(`/api/runs/${id}`),

    list: () => 
      fetchApi<Run[]>('/api/runs'),
  },

  crews: {
    list: () => fetchApi<Crew[]>('/api/crews'),
    get: (id: string) => fetchApi<Crew>(`/api/crews/${id}`),
  },

  agents: {
    list: () => fetchApi<Agent[]>('/api/agents'),
  },

  chat: (data: ChatRequest) =>
    fetchApi<ChatResponse>('/api/chat', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

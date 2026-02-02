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
    credentials: 'include', // Send cookies for auth
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

  // Handle empty responses
  const contentType = response.headers.get('content-type');
  if (!contentType?.includes('application/json')) {
    return undefined as T;
  }

  return response.json();
}

// =============================================================================
// API Endpoints
// =============================================================================

// Types (will be shared with backend eventually)
export interface Run {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  targetUrl: string;
  competitorUrls: string[];
  createdAt: string;
  completedAt?: string;
  finalOutput?: string;
}

export interface CreateRunRequest {
  targetUrl: string;
  competitorUrls?: string[];
  crewId?: string;
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

// API methods
export const api = {
  // Health check
  health: () => fetchApi<{ status: string }>('/api/health'),
  
  // Runs
  runs: {
    create: (data: CreateRunRequest) => 
      fetchApi<Run>('/api/runs', { 
        method: 'POST', 
        body: JSON.stringify(data) 
      }),
    get: (id: string) => 
      fetchApi<Run>(`/api/runs/${id}`),
    list: () => 
      fetchApi<Run[]>('/api/runs'),
  },

  // Crews
  crews: {
    list: () => fetchApi<Crew[]>('/api/crews'),
    get: (id: string) => fetchApi<Crew>(`/api/crews/${id}`),
  },

  // Agents
  agents: {
    list: () => fetchApi<Agent[]>('/api/agents'),
  },

  // Chat (pre-run discussion)
  chat: (data: ChatRequest) =>
    fetchApi<ChatResponse>('/api/chat', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

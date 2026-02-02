// Shared types for the CrewAI Platform web app

export interface User {
  id: string;
  email: string;
  name?: string;
}

export interface AnalysisJob {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: string;
  completedAt?: string;
  targetUrl: string;
  competitorUrls: string[];
}

export interface ContentGap {
  id: string;
  keyword: string;
  searchVolume?: number;
  difficulty?: number;
  opportunity: 'high' | 'medium' | 'low';
  competitors: string[];
}

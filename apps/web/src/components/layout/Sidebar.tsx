'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';

interface Run {
  id: string;
  title: string;
  status: 'running' | 'completed' | 'failed';
  createdAt: string;
}

// Placeholder data - will be replaced with real API data
const PLACEHOLDER_RUNS: Run[] = [
  { id: '1', title: 'example.com analysis', status: 'completed', createdAt: '2026-02-02T14:30:00Z' },
  { id: '2', title: 'competitor.io gaps', status: 'completed', createdAt: '2026-02-02T12:00:00Z' },
  { id: '3', title: 'blog.site.com review', status: 'running', createdAt: '2026-02-02T15:00:00Z' },
];

interface SidebarProps {
  onNewRun?: () => void;
  selectedRunId?: string;
  onSelectRun?: (id: string) => void;
}

export function Sidebar({ onNewRun, selectedRunId, onSelectRun }: SidebarProps) {
  const [runs] = useState<Run[]>(PLACEHOLDER_RUNS);

  const getStatusColor = (status: Run['status']) => {
    switch (status) {
      case 'running': return 'bg-blue-500';
      case 'completed': return 'bg-green-500';
      case 'failed': return 'bg-red-500';
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <aside className="w-64 border-r border-gray-200 bg-gray-50 flex flex-col">
      <div className="p-4 border-b border-gray-200">
        <Button 
          variant="primary" 
          className="w-full"
          onClick={onNewRun}
        >
          + New Run
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Recent Runs
          </h3>
          <ul className="space-y-2">
            {runs.map((run) => (
              <li key={run.id}>
                <button
                  onClick={() => onSelectRun?.(run.id)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedRunId === run.id 
                      ? 'bg-blue-100 border border-blue-200' 
                      : 'hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full ${getStatusColor(run.status)}`} />
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {run.title}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {formatDate(run.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="p-4 border-t border-gray-200">
        <p className="text-xs text-gray-500 text-center">
          {runs.length} runs total
        </p>
      </div>
    </aside>
  );
}

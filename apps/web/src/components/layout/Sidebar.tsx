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
const PLACEHOLDER_RUNS: Run[] = [];

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
    <aside className="w-64 border-r border-border bg-surface flex flex-col">
      <div className="p-4 border-b border-border">
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
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Recent Runs
          </h3>
          <ul className="space-y-2">
            {runs.map((run) => (
              <li key={run.id}>
                <button
                  onClick={() => onSelectRun?.(run.id)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    selectedRunId === run.id 
                      ? 'bg-surface-muted border border-border' 
                      : 'hover:bg-surface-muted'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full ${getStatusColor(run.status)}`} />
                    <span className="text-sm font-medium text-foreground truncate">
                      {run.title}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(run.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="p-4 border-t border-border">
        <p className="text-xs text-muted-foreground text-center">
          {runs.length} runs total
        </p>
      </div>
    </aside>
  );
}

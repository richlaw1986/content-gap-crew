'use client';

import { useState, useCallback } from 'react';
import { ChatArea } from '@/components/dashboard';
import { AgentActivityFeed } from '@/components/dashboard';
import { useRunStream, RunStreamEvent } from '@/lib/hooks';
import { api, CreateRunRequest } from '@/lib/api';

export default function DashboardPage() {
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [gapsFound, setGapsFound] = useState(0);
  const [pagesAnalyzed, setPagesAnalyzed] = useState(0);

  const handleEvent = useCallback((event: RunStreamEvent) => {
    // Update stats based on events
    if (event.type === 'tool_result') {
      // Increment pages analyzed for certain tools
      if (event.tool.includes('content') || event.tool.includes('sitemap')) {
        setPagesAnalyzed(prev => prev + 1);
      }
    }
  }, []);

  const handleComplete = useCallback((output: string) => {
    console.log('Run complete:', output);
    // Could parse output to count gaps found
  }, []);

  const { events, isConnected, isComplete, error } = useRunStream(currentRunId, {
    onEvent: handleEvent,
    onComplete: handleComplete,
  });

  const handleStartRun = async (targetUrl: string) => {
    try {
      // Reset stats
      setGapsFound(0);
      setPagesAnalyzed(0);
      
      const request: CreateRunRequest = {
        targetUrl,
        competitorUrls: [],
      };
      
      const run = await api.runs.create(request);
      setCurrentRunId(run.id);
    } catch (err) {
      console.error('Failed to start run:', err);
      // TODO: Show error to user
    }
  };

  return (
    <div className="h-full flex flex-col lg:flex-row">
      {/* Main chat area */}
      <div className="flex-1 min-w-0">
        <ChatArea 
          onStartRun={handleStartRun}
          isRunning={isConnected && !isComplete}
        />
      </div>
      
      {/* Agent activity panel */}
      <div className="lg:w-96 border-t lg:border-t-0 lg:border-l border-gray-200 p-4 bg-gray-50">
        <AgentActivityFeed 
          events={events} 
          isLive={isConnected && !isComplete}
          isConnected={isConnected}
        />
        
        {error && (
          <div className="mt-4 p-3 bg-red-100 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{error.message}</p>
          </div>
        )}
        
        {/* Quick stats */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="text-2xl font-bold text-gray-900">{gapsFound}</div>
            <div className="text-xs text-gray-500">Gaps Found</div>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="text-2xl font-bold text-gray-900">{pagesAnalyzed}</div>
            <div className="text-xs text-gray-500">Pages Analyzed</div>
          </div>
        </div>
        
        {/* Run info */}
        <div className="mt-4 bg-white rounded-lg p-4 border border-gray-200">
          <h4 className="text-sm font-semibold text-gray-900 mb-2">Current Run</h4>
          {currentRunId ? (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 font-mono">{currentRunId}</p>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${
                  isComplete ? 'bg-green-500' : 
                  isConnected ? 'bg-blue-500 animate-pulse' : 
                  'bg-gray-400'
                }`} />
                <span className="text-sm text-gray-600">
                  {isComplete ? 'Complete' : isConnected ? 'Running...' : 'Connecting...'}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              No active run. Start a new analysis to see details here.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

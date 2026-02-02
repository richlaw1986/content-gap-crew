'use client';

import { useState, useCallback } from 'react';
import { ChatArea } from '@/components/dashboard';
import { AgentActivityFeed } from '@/components/dashboard';
import { ToastContainer } from '@/components/ui';
import { useRunStream, useToast, RunStreamEvent } from '@/lib/hooks';
import { api, CreateRunRequest, ApiError } from '@/lib/api';

export default function DashboardPage() {
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [gapsFound, setGapsFound] = useState(0);
  const [pagesAnalyzed, setPagesAnalyzed] = useState(0);
  const { toasts, dismissToast, success, error: showError, warning } = useToast();

  const handleEvent = useCallback((event: RunStreamEvent) => {
    // Update stats based on events
    if (event.type === 'tool_result') {
      // Increment pages analyzed for certain tools
      if (event.tool.includes('content') || event.tool.includes('sitemap')) {
        setPagesAnalyzed(prev => prev + 1);
      }
    }
    
    // Show warning toast for errors in the stream
    if (event.type === 'error') {
      warning('Agent Error', event.message);
    }
  }, [warning]);

  const handleComplete = useCallback((output: string) => {
    success('Analysis Complete', 'Content gap analysis finished successfully.');
    console.log('Run complete:', output);
  }, [success]);

  const handleError = useCallback((err: Error) => {
    showError('Connection Error', err.message);
  }, [showError]);

  const { events, isConnected, isComplete, error } = useRunStream(currentRunId, {
    onEvent: handleEvent,
    onComplete: handleComplete,
    onError: handleError,
  });

  const handleStartRun = async (topic: string) => {
    try {
      // Reset stats
      setGapsFound(0);
      setPagesAnalyzed(0);
      
      const request: CreateRunRequest = {
        crew_id: 'crew-content-gap',
        topic: topic,
        target_url: topic.startsWith('http') ? topic : undefined,
      };
      
      const run = await api.runs.create(request);
      setCurrentRunId(run.id);
    } catch (err) {
      console.error('Failed to start run:', err);
      
      if (err instanceof ApiError) {
        if (err.status === 422) {
          showError('Invalid Request', 'Please check your input and try again.');
        } else if (err.status === 401 || err.status === 403) {
          showError('Authentication Required', 'Please sign in to start an analysis.');
        } else if (err.status >= 500) {
          showError('Server Error', 'The server encountered an error. Please try again later.');
        } else {
          showError('Request Failed', err.message);
        }
      } else {
        showError('Connection Error', 'Could not connect to the server. Please check your connection.');
      }
    }
  };

  // Count errors in events
  const errorCount = events.filter(e => e.type === 'error').length;

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      
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
          
          {/* Connection error banner */}
          {error && !isConnected && (
            <div className="mt-4 p-3 bg-red-100 border border-red-200 rounded-lg">
              <div className="flex items-start gap-2">
                <span className="text-red-500">❌</span>
                <div>
                  <p className="text-sm font-medium text-red-800">Connection Lost</p>
                  <p className="text-sm text-red-700">{error.message}</p>
                </div>
              </div>
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

          {/* Error count indicator */}
          {errorCount > 0 && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-red-500">⚠️</span>
                <span className="text-sm text-red-700">
                  {errorCount} error{errorCount > 1 ? 's' : ''} during analysis
                </span>
              </div>
            </div>
          )}
          
          {/* Run info */}
          <div className="mt-4 bg-white rounded-lg p-4 border border-gray-200">
            <h4 className="text-sm font-semibold text-gray-900 mb-2">Current Run</h4>
            {currentRunId ? (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 font-mono break-all">{currentRunId}</p>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${
                    isComplete ? (errorCount > 0 ? 'bg-yellow-500' : 'bg-green-500') : 
                    isConnected ? 'bg-blue-500 animate-pulse' : 
                    error ? 'bg-red-500' :
                    'bg-gray-400'
                  }`} />
                  <span className="text-sm text-gray-600">
                    {isComplete 
                      ? (errorCount > 0 ? 'Completed with errors' : 'Complete')
                      : isConnected 
                        ? 'Running...' 
                        : error 
                          ? 'Disconnected'
                          : 'Connecting...'}
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
    </>
  );
}

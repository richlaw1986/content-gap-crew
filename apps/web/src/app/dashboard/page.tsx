'use client';

import { useState, useCallback } from 'react';
import { ChatArea } from '@/components/dashboard';
import { AgentActivityFeed } from '@/components/dashboard';
import { ToastContainer } from '@/components/ui';
import { useRunStream, useToast, RunStreamEvent } from '@/lib/hooks';
import { api, CreateRunRequest, ApiError } from '@/lib/api';

export default function DashboardPage() {
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [toolCalls, setToolCalls] = useState(0);
  const [agentMessages, setAgentMessages] = useState(0);
  const { toasts, dismissToast, success, error: showError, warning } = useToast();

  const handleEvent = useCallback((event: RunStreamEvent) => {
    if (event.type === 'tool_call' || event.type === 'tool_result') {
      setToolCalls(prev => prev + 1);
    }
    
    if (event.type === 'agent_message') {
      setAgentMessages(prev => prev + 1);
    }
    
    if (event.type === 'error') {
      warning('Agent Error', event.message);
    }
  }, [warning]);

  const handleComplete = useCallback((output: string) => {
    success('Run Complete', 'Crew run finished successfully.');
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

  const handleStartRun = async (objective: string) => {
    try {
      setToolCalls(0);
      setAgentMessages(0);
      
      const request: CreateRunRequest = {
        objective,
        inputs: {},
      };
      
      const run = await api.runs.create(request);
      setCurrentRunId(run.id);
    } catch (err) {
      console.error('Failed to start run:', err);
      
      if (err instanceof ApiError) {
        if (err.status === 422) {
          showError('Invalid Request', 'Please check your input and try again.');
        } else if (err.status === 401 || err.status === 403) {
          showError('Authentication Required', 'Please sign in to start a run.');
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

  const errorCount = events.filter(e => e.type === 'error').length;
  const isRunning = isConnected && !isComplete;

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      
      <div className="h-full flex flex-col lg:flex-row">
        {/* Main chat area */}
        <div className="flex-1 min-w-0">
          <ChatArea 
            onStartRun={handleStartRun}
            isRunning={isRunning}
          />
        </div>
        
        {/* Agent activity panel */}
        <div className="lg:w-96 border-t lg:border-t-0 lg:border-l border-border p-4 bg-surface-muted">
          <AgentActivityFeed 
            events={events} 
            isLive={isRunning}
            isConnected={isConnected}
          />
          
          {error && !isConnected && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-2">
                <span className="text-red-500">❌</span>
                <div>
                  <p className="text-sm font-medium text-red-800">Connection Lost</p>
                  <p className="text-sm text-red-700">{error.message}</p>
                </div>
              </div>
            </div>
          )}
          
            <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="bg-surface rounded-lg p-4 border border-border">
              <div className="text-2xl font-bold text-foreground">{toolCalls}</div>
              <div className="text-xs text-muted-foreground">Tool Calls</div>
            </div>
            <div className="bg-surface rounded-lg p-4 border border-border">
              <div className="text-2xl font-bold text-foreground">{agentMessages}</div>
              <div className="text-xs text-muted-foreground">Agent Messages</div>
            </div>
          </div>

          {errorCount > 0 && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-red-500">⚠️</span>
                <span className="text-sm text-red-700">
                  {errorCount} error{errorCount > 1 ? 's' : ''} during run
                </span>
              </div>
            </div>
          )}
          
          <div className="mt-4 bg-surface rounded-lg p-4 border border-border">
            <h4 className="text-sm font-semibold text-foreground mb-2">Current Run</h4>
            {currentRunId ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-mono break-all">{currentRunId}</p>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${
                    isComplete ? (errorCount > 0 ? 'bg-yellow-500' : 'bg-green-500') : 
                    isConnected ? 'bg-blue-500 animate-pulse' : 
                    error ? 'bg-red-500' :
                    'bg-gray-400'
                  }`} />
                  <span className="text-sm text-muted-foreground">
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
              <p className="text-sm text-muted-foreground">
                No active workflow. Start by describing your goal in chat.
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

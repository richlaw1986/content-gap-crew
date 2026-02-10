'use client';

import { useState, useCallback } from 'react';
import { ChatArea } from '@/components/dashboard';
import { AgentActivityFeed } from '@/components/dashboard';
import { ToastContainer } from '@/components/ui';
import { useRunStream, useToast, RunStreamEvent } from '@/lib/hooks';
import { api, CreateRunRequest, ApiError } from '@/lib/api';

export default function DashboardPage() {
  // ── Run lifecycle state ────────────────────────────────────
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [pendingRunId, setPendingRunId] = useState<string | null>(null);
  const [awaitingInput, setAwaitingInput] = useState(false);

  // ── Counters ───────────────────────────────────────────────
  const [toolCalls, setToolCalls] = useState(0);
  const [agentMessages, setAgentMessages] = useState(0);

  // ── Local events (planner questions, etc.) ─────────────────
  const [localEvents, setLocalEvents] = useState<RunStreamEvent[]>([]);

  const { toasts, dismissToast, success, error: showError, warning } = useToast();

  // ── Stream callbacks ───────────────────────────────────────
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

  const handleStreamError = useCallback((err: Error) => {
    showError('Connection Error', err.message);
  }, [showError]);

  const { events, isConnected, isComplete, error, connect } = useRunStream(currentRunId, {
    onEvent: handleEvent,
    onComplete: handleComplete,
    onError: handleStreamError,
  });

  // ── Combine local + stream events for the chat ─────────────
  const allEvents = [...localEvents, ...events];

  // ── Handlers ───────────────────────────────────────────────

  /** Start a brand-new run from an objective string. */
  const startNewRun = async (objective: string) => {
    // Reset all state
    setToolCalls(0);
    setAgentMessages(0);
    setAwaitingInput(false);
    setPendingRunId(null);
    setCurrentRunId(null);
    setLocalEvents([]);

    try {
      const request: CreateRunRequest = {
        objective,
        inputs: { objective, topic: objective },
      };

      const run = await api.runs.create(request);

      if (run.status === 'awaiting_input' && run.questions?.length) {
        // Planner needs answers — show questions, don't start streaming yet
        setPendingRunId(run.id);
        setAwaitingInput(true);
        setLocalEvents([{
          type: 'agent_message',
          agent: 'Planner',
          messageType: 'thinking',
          content: 'Clarifying questions:\n- ' + run.questions.join('\n- '),
          timestamp: new Date().toISOString(),
        }]);
      } else {
        // No questions — stream immediately
        setCurrentRunId(run.id);
      }
    } catch (err) {
      console.error('Failed to start run:', err);
      if (err instanceof ApiError) {
        if (err.status === 422) {
          showError('Invalid Request', 'Please check your input and try again.');
        } else if (err.status >= 500) {
          showError('Server Error', 'The server encountered an error. Please try again later.');
        } else {
          showError('Request Failed', err.message);
        }
      } else {
        showError('Connection Error', 'Could not connect to the server.');
      }
    }
  };

  /** Continue a paused run with the user's answer. */
  const continueRun = async (message: string) => {
    if (!pendingRunId) {
      // Nothing pending — treat as a new objective
      await startNewRun(message);
      return;
    }

    try {
      setAwaitingInput(false);
      await api.runs.continue(pendingRunId, { clarification: message });

      // Now kick off the stream
      setCurrentRunId(pendingRunId);
      setPendingRunId(null);
    } catch (err) {
      console.error('Failed to continue run:', err);
      showError('Request Failed', 'Could not continue the run. Please try again.');
      setAwaitingInput(true); // Re-enable input so user can retry
    }
  };

  /** Unified send handler — dispatches to start or continue. */
  const handleSend = async (message: string) => {
    if (awaitingInput && pendingRunId) {
      await continueRun(message);
    } else {
      await startNewRun(message);
    }
  };

  // ── Derived state ──────────────────────────────────────────
  const errorCount = allEvents.filter(e => e.type === 'error').length;
  const isRunning = isConnected && !isComplete;
  const displayRunId = currentRunId || pendingRunId;

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      
      <div className="h-full flex flex-col lg:flex-row">
        {/* Main chat area */}
        <div className="flex-1 min-w-0">
          <ChatArea 
            onSend={handleSend}
            events={allEvents}
            isRunning={isRunning}
            awaitingInput={awaitingInput}
          />
        </div>
        
        {/* Agent activity panel */}
        <div className="lg:w-96 border-t lg:border-t-0 lg:border-l border-border p-4 bg-surface-muted">
          <AgentActivityFeed 
            events={allEvents} 
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
            {displayRunId ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-mono break-all">{displayRunId}</p>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${
                    awaitingInput ? 'bg-amber-500 animate-pulse' :
                    isComplete ? (errorCount > 0 ? 'bg-yellow-500' : 'bg-green-500') : 
                    isConnected ? 'bg-blue-500 animate-pulse' : 
                    error ? 'bg-red-500' :
                    'bg-gray-400'
                  }`} />
                  <span className="text-sm text-muted-foreground">
                    {awaitingInput
                      ? 'Awaiting your answer'
                      : isComplete 
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

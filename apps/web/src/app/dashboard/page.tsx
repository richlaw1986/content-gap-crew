'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import { ChatArea, ChatHistory, AgentActivityFeed } from '@/components/dashboard';
import { ToastContainer } from '@/components/ui';
import { useRunStream, useToast, useChatHistory, useRunHistory, RunStreamEvent } from '@/lib/hooks';
import type { ChatMessage } from '@/lib/hooks/useChatHistory';
import { api, CreateRunRequest, ApiError } from '@/lib/api';
import type { Run } from '@/lib/api';

export default function DashboardPage() {
  // ── Chat history ────────────────────────────────────────────
  const {
    conversations,
    activeId,
    activeConversation,
    createConversation,
    selectConversation,
    updateConversation,
    deleteConversation,
    clearActive,
  } = useChatHistory();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // ── Run history from backend ──────────────────────────────
  const { runs: backendRuns, refresh: refreshRuns } = useRunHistory();

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

  // Keep a ref to the active conversation id for use inside callbacks
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;

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
    // Mark conversation as completed
    if (activeIdRef.current) {
      updateConversation(activeIdRef.current, { status: 'completed' });
    }
    // Refresh backend run list so the sidebar reflects the completed state
    refreshRuns();
  }, [success, updateConversation, refreshRuns]);

  const handleStreamError = useCallback((err: Error) => {
    showError('Connection Error', err.message);
    if (activeIdRef.current) {
      updateConversation(activeIdRef.current, { status: 'failed' });
    }
  }, [showError, updateConversation]);

  const { events, isConnected, isComplete, error, connect } = useRunStream(currentRunId, {
    onEvent: handleEvent,
    onComplete: handleComplete,
    onError: handleStreamError,
  });

  // ── Combine local + stream events for the chat ─────────────
  const allEvents = [...localEvents, ...events];

  // ── Handlers ───────────────────────────────────────────────

  /** Reset run state for a fresh conversation. */
  const resetRunState = useCallback(() => {
    setToolCalls(0);
    setAgentMessages(0);
    setAwaitingInput(false);
    setPendingRunId(null);
    setCurrentRunId(null);
    setLocalEvents([]);
  }, []);

  /** Start a brand-new run from an objective string. */
  const startNewRun = async (objective: string) => {
    // Create (or reuse) a conversation
    let convId = activeIdRef.current;
    if (!convId) {
      const conv = createConversation(objective);
      convId = conv.id;
    }

    resetRunState();

    try {
      const request: CreateRunRequest = {
        objective,
        inputs: { objective, topic: objective },
      };

      const run = await api.runs.create(request);

      // Attach runId to conversation
      updateConversation(convId, { runId: run.id, status: 'active' });

      if (run.status === 'awaiting_input' && run.questions?.length) {
        setPendingRunId(run.id);
        setAwaitingInput(true);
        updateConversation(convId, { status: 'awaiting_input' });
        setLocalEvents([{
          type: 'agent_message',
          agent: 'Planner',
          messageType: 'thinking',
          content: 'Clarifying questions:\n- ' + run.questions.join('\n- '),
          timestamp: new Date().toISOString(),
        }]);
      } else {
        setCurrentRunId(run.id);
      }
    } catch (err) {
      console.error('Failed to start run:', err);
      updateConversation(convId, { status: 'failed' });
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
      await startNewRun(message);
      return;
    }

    try {
      setAwaitingInput(false);
      await api.runs.continue(pendingRunId, { clarification: message });
      // Clear planner questions BEFORE starting the stream to prevent
      // them from being re-processed when useRunStream resets events to []
      setLocalEvents([]);
      setCurrentRunId(pendingRunId);
      setPendingRunId(null);
      if (activeIdRef.current) {
        updateConversation(activeIdRef.current, { status: 'active' });
      }
    } catch (err) {
      console.error('Failed to continue run:', err);
      showError('Request Failed', 'Could not continue the run. Please try again.');
      setAwaitingInput(true);
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

  // ── Conversation switching ─────────────────────────────────

  const handleSelectConversation = useCallback((id: string) => {
    selectConversation(id);
    // Reset stream state — we'll load saved messages from the conversation
    resetRunState();
  }, [selectConversation, resetRunState]);

  const handleNewChat = useCallback(() => {
    clearActive();
    resetRunState();
  }, [clearActive, resetRunState]);

  const handleDeleteConversation = useCallback((id: string) => {
    deleteConversation(id);
    if (id === activeIdRef.current) {
      resetRunState();
    }
  }, [deleteConversation, resetRunState]);

  /** Persist messages to the active conversation. */
  const handleMessagesChange = useCallback((msgs: ChatMessage[]) => {
    if (activeIdRef.current && msgs.length > 1) {
      updateConversation(activeIdRef.current, { messages: msgs });
    }
  }, [updateConversation]);

  // ── Derived state ──────────────────────────────────────────

  // Stabilise initialMessages: only recompute when the *active conversation*
  // changes (i.e. user picks a different chat), NOT on every persistence
  // round-trip.  Without this, the ChatArea sees a new reference each time
  // messages are saved back, resets its lastEventIndex to 0, and re-processes
  // every SSE event — causing the duplication bug.
  const stableInitialMessages = useMemo(() => {
    if (activeConversation?.messages?.length) {
      return activeConversation.messages;
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const errorCount = allEvents.filter(e => e.type === 'error').length;
  const isRunning = isConnected && !isComplete;
  const displayRunId = currentRunId || pendingRunId;

  // Merge backend runs with local conversations.  Backend runs that already
  // have a matching local conversation (by runId) are skipped; the rest are
  // synthesized as read-only conversation entries so they appear in the sidebar.
  const localRunIds = new Set(conversations.map(c => c.runId).filter(Boolean));
  const backendOnlyRuns = backendRuns.filter(
    (r: Run) => r.id && !localRunIds.has(r.id) && r.status !== 'pending'
  );
  const syntheticConvos = backendOnlyRuns.map((r: Run) => ({
    id: `run-${r.id}`,
    title: r.objective || (r.inputs as Record<string, unknown>)?.topic as string || r.id,
    createdAt: r.createdAt || r.startedAt || new Date().toISOString(),
    updatedAt: r.completedAt || r.createdAt || new Date().toISOString(),
    status: (r.status === 'completed' ? 'completed' : r.status === 'failed' ? 'failed' : 'active') as 'active' | 'completed' | 'failed' | 'awaiting_input',
    runId: r.id,
    messages: [] as ChatMessage[],
  }));
  const mergedConversations = [...conversations, ...syntheticConvos];

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
      
      {/* Left sidebar: Chat History */}
      <ChatHistory
        conversations={mergedConversations}
        activeId={activeId}
        onSelect={handleSelectConversation}
        onNew={handleNewChat}
        onDelete={handleDeleteConversation}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(prev => !prev)}
      />

      {/* Main chat area */}
      <main className="flex-1 min-w-0 overflow-y-auto bg-background">
        <div className="h-full flex flex-col lg:flex-row">
          <div className="flex-1 min-w-0">
            <ChatArea 
              onSend={handleSend}
              events={allEvents}
              isRunning={isRunning}
              awaitingInput={awaitingInput}
              initialMessages={stableInitialMessages}
              onMessagesChange={handleMessagesChange}
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
      </main>
    </>
  );
}

'use client';

import { useState } from 'react';
import type { ConversationMessage } from '@/lib/hooks/useConversation';

interface AgentActivityFeedProps {
  messages?: ConversationMessage[];
  isConnected?: boolean;
  isRunning?: boolean;
  currentRunId?: string | null;
}

export function AgentActivityFeed({
  messages = [],
  isConnected = false,
  isRunning = false,
  currentRunId = null,
}: AgentActivityFeedProps) {
  const [expandedErrors, setExpandedErrors] = useState<Set<number>>(new Set());

  const toggleError = (idx: number) => {
    setExpandedErrors((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  // Only show agent-side messages in the activity feed (not user messages)
  const agentMessages = messages.filter(
    (m) =>
      m.sender !== 'user' &&
      m.type !== 'user_message' &&
      m.type !== 'answer' &&
      m.type !== 'status',
  );

  const getIcon = (msg: ConversationMessage) => {
    switch (msg.type) {
      case 'thinking': return '💭';
      case 'tool_call': return '🔧';
      case 'tool_result': return '✅';
      case 'complete': return '🎉';
      case 'error': return '❌';
      case 'question': return '❓';
      case 'system': return '🔵';
      default: return '💬';
    }
  };

  const getColor = (msg: ConversationMessage) => {
    switch (msg.type) {
      case 'thinking':
      case 'agent_message': return 'border-l-sky-400 bg-surface-muted';
      case 'tool_call': return 'border-l-amber-400 bg-surface-muted';
      case 'tool_result': return 'border-l-emerald-400 bg-surface-muted';
      case 'complete': return 'border-l-violet-400 bg-surface-muted';
      case 'error': return 'border-l-red-500 bg-red-50';
      case 'question': return 'border-l-indigo-400 bg-surface-muted';
      case 'system': return 'border-l-gray-400 bg-surface-muted';
      default: return 'border-l-gray-300 bg-surface-muted';
    }
  };

  const formatTime = (ts: string) => {
    try {
      return new Date(ts).toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const toolCalls = agentMessages.filter((m) => m.type === 'tool_call').length;
  const agentMsgCount = agentMessages.filter(
    (m) => m.type === 'thinking' || m.type === 'agent_message',
  ).length;
  const hasErrors = agentMessages.some((m) => m.type === 'error');

  return (
    <div className="bg-surface border border-border text-foreground rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Agent Activity</h3>
          {hasErrors && (
            <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">Errors</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isConnected && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-500">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              Connected
            </span>
          )}
          {isRunning && (
            <span className="flex items-center gap-1.5 text-xs text-sky-500">
              <span className="w-2 h-2 bg-sky-500 rounded-full animate-pulse" />
              Live
            </span>
          )}
        </div>
      </div>

      {/* Events list */}
      <div className="max-h-80 overflow-y-auto">
        {agentMessages.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            No activity yet. Send a message to start.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {agentMessages.map((msg, idx) => (
              <li key={msg.id || idx} className={`px-4 py-3 border-l-4 ${getColor(msg)}`}>
                <div className="flex items-start gap-3">
                  <span className="text-lg flex-shrink-0">{getIcon(msg)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-sky-600">{msg.sender}</span>
                      <span className="text-xs text-muted-foreground ml-auto">{formatTime(msg.timestamp)}</span>
                    </div>
                    <p className={`text-sm break-words ${msg.type === 'error' ? 'text-red-600' : 'text-foreground'}`}>
                      {msg.content || msg.message || ''}
                    </p>
                    {msg.type === 'tool_call' && msg.tool && (
                      <span className="text-xs font-mono text-muted-foreground">Tool: {msg.tool}</span>
                    )}
                    {msg.type === 'error' && (
                      <button onClick={() => toggleError(idx)} className="text-xs text-red-600 underline mt-1">
                        {expandedErrors.has(idx) ? 'Hide' : 'Details'}
                      </button>
                    )}
                    {msg.type === 'error' && expandedErrors.has(idx) && (
                      <pre className="mt-2 p-2 bg-red-50 text-xs text-red-600 font-mono overflow-x-auto rounded">
                        {msg.content || msg.message}
                      </pre>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Footer stats */}
      <div className="px-4 py-2 border-t border-border text-xs text-muted-foreground flex gap-4">
        <span>{toolCalls} Tool Calls</span>
        <span>{agentMsgCount} Agent Messages</span>
        {currentRunId && <span className="ml-auto font-mono">{currentRunId.slice(0, 16)}</span>}
        {isRunning && <span className="text-sky-500">Running…</span>}
      </div>
    </div>
  );
}

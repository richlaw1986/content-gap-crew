'use client';

import { useState } from 'react';
import { RunStreamEvent } from '@/lib/hooks';

interface AgentActivityFeedProps {
  events?: RunStreamEvent[];
  isLive?: boolean;
  isConnected?: boolean;
}

export function AgentActivityFeed({ 
  events = [], 
  isLive = false,
  isConnected = false,
}: AgentActivityFeedProps) {
  const [expandedErrors, setExpandedErrors] = useState<Set<number>>(new Set());
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const toggleErrorExpanded = (index: number) => {
    setExpandedErrors(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const copyError = async (event: RunStreamEvent, index: number) => {
    if (event.type !== 'error') return;
    
    const errorText = [
      `Error: ${event.message}`,
      `Time: ${event.timestamp}`,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(errorText);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const getEventIcon = (type: RunStreamEvent['type']) => {
    switch (type) {
      case 'agent_message': return '💭';
      case 'tool_call': return '🔧';
      case 'tool_result': return '✅';
      case 'complete': return '🎉';
      case 'error': return '❌';
    }
  };

  const getEventColor = (type: RunStreamEvent['type']) => {
    switch (type) {
      case 'agent_message': return 'border-l-sky-400 bg-surface-muted';
      case 'tool_call': return 'border-l-amber-400 bg-surface-muted';
      case 'tool_result': return 'border-l-emerald-400 bg-surface-muted';
      case 'complete': return 'border-l-violet-400 bg-surface-muted';
      case 'error': return 'border-l-red-500 bg-red-50';
    }
  };

  const getEventContent = (event: RunStreamEvent): string => {
    switch (event.type) {
      case 'agent_message':
        return event.content;
      case 'tool_call':
        return `Calling ${event.tool}`;
      case 'tool_result':
        return event.result.length > 100 
          ? event.result.substring(0, 100) + '...' 
          : event.result;
      case 'complete':
        return 'Workflow complete!';
      case 'error':
        return event.message;
    }
  };

  const getAgentName = (event: RunStreamEvent): string | undefined => {
    if ('agent' in event) return event.agent;
    return undefined;
  };

  const getToolName = (event: RunStreamEvent): string | undefined => {
    if ('tool' in event) return event.tool;
    return undefined;
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // Check if there are any errors
  const hasErrors = events.some(e => e.type === 'error');

  return (
    <div className="bg-surface border border-border text-foreground rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Agent Activity</h3>
          {hasErrors && (
            <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded-full">
              Errors
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isConnected && (
            <span className="flex items-center gap-2 text-xs text-sky-500">
              <span className="w-2 h-2 bg-sky-500 rounded-full animate-pulse" />
              Connected
            </span>
          )}
          {isLive && (
            <span className="flex items-center gap-2 text-xs text-emerald-500">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              Live
            </span>
          )}
        </div>
      </div>
      
      <div className="max-h-80 overflow-y-auto">
        {events.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            No activity yet. Start a workflow to see agent activity.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {events.map((event, index) => (
              <li 
                key={`${event.type}-${index}`}
                className={`px-4 py-3 border-l-4 ${getEventColor(event.type)}`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-lg flex-shrink-0">{getEventIcon(event.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {getAgentName(event) && (
                        <span className={`text-xs font-medium ${
                          event.type === 'error' ? 'text-red-600' : 'text-sky-600'
                        }`}>
                          {getAgentName(event)}
                        </span>
                      )}
                      {getToolName(event) && (
                        <span className={`text-xs font-mono ${
                          event.type === 'error' ? 'text-red-500' : 'text-muted-foreground'
                        }`}>
                          {getToolName(event)}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
                        {formatTime(event.timestamp)}
                      </span>
                    </div>
                    
                    <p className={`text-sm break-words ${
                      event.type === 'error' ? 'text-red-600' : 'text-foreground'
                    }`}>
                      {getEventContent(event)}
                    </p>

                    {/* Error-specific UI */}
                    {event.type === 'error' && (
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          onClick={() => toggleErrorExpanded(index)}
                          className="text-xs text-red-600 hover:text-red-700 underline"
                        >
                          {expandedErrors.has(index) ? 'Hide details' : 'Show details'}
                        </button>
                        <button
                          onClick={() => copyError(event, index)}
                          className="text-xs text-red-600 hover:text-red-700 px-2 py-0.5 rounded hover:bg-red-100 transition-colors"
                        >
                          {copiedIndex === index ? '✓ Copied' : 'Copy error'}
                        </button>
                      </div>
                    )}

                    {/* Expanded error details */}
                    {event.type === 'error' && expandedErrors.has(index) && (
                      <div className="mt-2 p-2 bg-red-50 rounded text-xs">
                        <div className="text-red-600 font-mono">
                          <div>Type: {event.type}</div>
                          <div>Message: {event.message}</div>
                          <div>Timestamp: {event.timestamp}</div>
                        </div>
                        <p className="mt-2 text-red-600/70 text-xs">
                          💡 Tip: This error may indicate missing credentials or API configuration. 
                          Check the backend logs for more details.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Error summary footer */}
      {hasErrors && (
        <div className="px-4 py-2 border-t border-red-200 bg-red-50">
          <p className="text-xs text-red-600">
            ⚠️ Some operations failed. Check error details above.
          </p>
        </div>
      )}
    </div>
  );
}

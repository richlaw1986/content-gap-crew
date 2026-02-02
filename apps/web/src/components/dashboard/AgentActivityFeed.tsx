'use client';

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
      case 'agent_message': return 'border-l-blue-400';
      case 'tool_call': return 'border-l-yellow-400';
      case 'tool_result': return 'border-l-green-400';
      case 'complete': return 'border-l-purple-400';
      case 'error': return 'border-l-red-400';
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
        return 'Analysis complete!';
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

  return (
    <div className="bg-gray-900 text-gray-100 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Agent Activity</h3>
        <div className="flex items-center gap-2">
          {isConnected && (
            <span className="flex items-center gap-2 text-xs text-blue-400">
              <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
              Connected
            </span>
          )}
          {isLive && (
            <span className="flex items-center gap-2 text-xs text-green-400">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              Live
            </span>
          )}
        </div>
      </div>
      
      <div className="max-h-64 overflow-y-auto">
        {events.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            No activity yet. Start an analysis to see agent activity.
          </div>
        ) : (
          <ul className="divide-y divide-gray-800">
            {events.map((event, index) => (
              <li 
                key={`${event.type}-${index}`}
                className={`px-4 py-3 border-l-4 ${getEventColor(event.type)}`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-lg">{getEventIcon(event.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {getAgentName(event) && (
                        <span className="text-xs font-medium text-blue-400">
                          {getAgentName(event)}
                        </span>
                      )}
                      {getToolName(event) && (
                        <span className="text-xs text-gray-500 font-mono">
                          {getToolName(event)}
                        </span>
                      )}
                      <span className="text-xs text-gray-600 ml-auto">
                        {formatTime(event.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-300 break-words">
                      {getEventContent(event)}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

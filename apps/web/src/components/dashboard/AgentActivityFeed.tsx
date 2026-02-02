'use client';

interface AgentEvent {
  id: string;
  type: 'thinking' | 'tool_call' | 'tool_result' | 'message';
  agent: string;
  content: string;
  tool?: string;
  timestamp: string;
}

// Placeholder events - will be replaced with SSE stream data
const PLACEHOLDER_EVENTS: AgentEvent[] = [
  {
    id: '1',
    type: 'thinking',
    agent: 'Data Analyst',
    content: 'Analyzing sitemap structure...',
    timestamp: new Date().toISOString(),
  },
  {
    id: '2',
    type: 'tool_call',
    agent: 'Data Analyst',
    content: 'Fetching sitemap data',
    tool: 'sanity_sitemap_lookup',
    timestamp: new Date().toISOString(),
  },
  {
    id: '3',
    type: 'tool_result',
    agent: 'Data Analyst',
    content: 'Found 47 pages in sitemap',
    tool: 'sanity_sitemap_lookup',
    timestamp: new Date().toISOString(),
  },
];

interface AgentActivityFeedProps {
  events?: AgentEvent[];
  isLive?: boolean;
}

export function AgentActivityFeed({ 
  events = PLACEHOLDER_EVENTS, 
  isLive = false 
}: AgentActivityFeedProps) {
  const getEventIcon = (type: AgentEvent['type']) => {
    switch (type) {
      case 'thinking': return '💭';
      case 'tool_call': return '🔧';
      case 'tool_result': return '✅';
      case 'message': return '💬';
    }
  };

  const getEventColor = (type: AgentEvent['type']) => {
    switch (type) {
      case 'thinking': return 'border-l-blue-400';
      case 'tool_call': return 'border-l-yellow-400';
      case 'tool_result': return 'border-l-green-400';
      case 'message': return 'border-l-purple-400';
    }
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
        {isLive && (
          <span className="flex items-center gap-2 text-xs text-green-400">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            Live
          </span>
        )}
      </div>
      
      <div className="max-h-64 overflow-y-auto">
        {events.length === 0 ? (
          <div className="p-4 text-center text-gray-500 text-sm">
            No activity yet. Start an analysis to see agent activity.
          </div>
        ) : (
          <ul className="divide-y divide-gray-800">
            {events.map((event) => (
              <li 
                key={event.id}
                className={`px-4 py-3 border-l-4 ${getEventColor(event.type)}`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-lg">{getEventIcon(event.type)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-blue-400">
                        {event.agent}
                      </span>
                      {event.tool && (
                        <span className="text-xs text-gray-500 font-mono">
                          {event.tool}
                        </span>
                      )}
                      <span className="text-xs text-gray-600 ml-auto">
                        {formatTime(event.timestamp)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-300 truncate">
                      {event.content}
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

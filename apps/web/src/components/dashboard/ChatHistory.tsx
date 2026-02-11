'use client';

import { useState } from 'react';

// =============================================================================
// Types — a conversation item in the sidebar
// =============================================================================

export interface SidebarConversation {
  id: string;
  title: string;
  status: 'active' | 'awaiting_input' | 'completed' | 'failed';
  createdAt: string;
}

// =============================================================================
// Helpers
// =============================================================================

function groupByDate(conversations: SidebarConversation[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);
  const week = new Date(today.getTime() - 7 * 86_400_000);

  const groups: { label: string; items: SidebarConversation[] }[] = [
    { label: 'Today', items: [] },
    { label: 'Yesterday', items: [] },
    { label: 'Previous 7 days', items: [] },
    { label: 'Older', items: [] },
  ];

  for (const c of conversations) {
    const d = new Date(c.createdAt);
    if (d >= today) groups[0].items.push(c);
    else if (d >= yesterday) groups[1].items.push(c);
    else if (d >= week) groups[2].items.push(c);
    else groups[3].items.push(c);
  }

  return groups.filter((g) => g.items.length > 0);
}

const STATUS_DOT: Record<string, string> = {
  active: 'bg-blue-500 animate-pulse',
  completed: 'bg-green-500',
  failed: 'bg-red-500',
  awaiting_input: 'bg-amber-500 animate-pulse',
};

// =============================================================================
// Component
// =============================================================================

interface ChatHistoryProps {
  conversations: SidebarConversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  collapsed?: boolean;
  onToggle?: () => void;
}

export function ChatHistory({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  collapsed = false,
  onToggle,
}: ChatHistoryProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const groups = groupByDate(conversations);

  if (collapsed) {
    return (
      <div className="w-12 flex flex-col items-center py-3 gap-3 border-r border-border bg-surface">
        <button
          onClick={onToggle}
          className="p-2 rounded-lg hover:bg-surface-muted transition-colors text-muted-foreground"
          title="Expand sidebar"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
            <polyline points="14 9 17 12 14 15" />
          </svg>
        </button>
        <button
          onClick={onNew}
          className="p-2 rounded-lg hover:bg-surface-muted transition-colors text-muted-foreground"
          title="New chat"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 flex flex-col border-r border-border bg-surface h-full">
      <div className="flex items-center justify-between px-3 py-3 border-b border-border">
        <button
          onClick={onToggle}
          className="p-1.5 rounded-lg hover:bg-surface-muted transition-colors text-muted-foreground"
          title="Collapse sidebar"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
            <polyline points="14 15 11 12 14 9" />
          </svg>
        </button>
        <button
          onClick={onNew}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-accent text-accent-foreground hover:opacity-90 transition-opacity"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2">
        {groups.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground">No conversations yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Start by typing a goal in the chat
            </p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="mb-2">
              <div className="px-4 py-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </span>
              </div>
              {group.items.map((conv) => (
                <div
                  key={conv.id}
                  className={`group relative flex items-center gap-2 px-3 py-2 mx-2 rounded-lg cursor-pointer transition-colors ${
                    activeId === conv.id
                      ? 'bg-accent/10 text-foreground'
                      : 'hover:bg-surface-muted text-foreground'
                  }`}
                  onClick={() => onSelect(conv.id)}
                  onMouseEnter={() => setHoveredId(conv.id)}
                  onMouseLeave={() => setHoveredId(null)}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      STATUS_DOT[conv.status] || 'bg-gray-400'
                    }`}
                  />
                  <span className="text-sm truncate flex-1">{conv.title}</span>
                  {hoveredId === conv.id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(conv.id);
                      }}
                      className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-500 transition-colors"
                      title="Delete conversation"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

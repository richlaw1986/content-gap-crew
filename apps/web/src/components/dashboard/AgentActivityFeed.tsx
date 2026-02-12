'use client';

import { useMemo, useState } from 'react';
import type { ConversationMessage } from '@/lib/hooks/useConversation';
import { MarkdownContent } from './MarkdownContent';

interface AgentActivityFeedProps {
  messages?: ConversationMessage[];
  isConnected?: boolean;
  isRunning?: boolean;
  currentRunId?: string | null;
}

// ── Helpers ────────────────────────────────────────────────────

function formatTime(ts: string) {
  try {
    return new Date(ts).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '';
  }
}

/** Extract a short title from a long output. */
function outputTitle(content: string): string {
  // Try to find a markdown heading
  const headingMatch = content.match(/^#{1,3}\s+(.+)/m);
  if (headingMatch) return headingMatch[1].slice(0, 80);
  // Fall back to first non-empty line
  const firstLine = content.split('\n').find((l) => l.trim().length > 0);
  return firstLine ? firstLine.slice(0, 80) : 'Output';
}

// ── Component ──────────────────────────────────────────────────

export function AgentActivityFeed({
  messages = [],
  isConnected = false,
  isRunning = false,
  currentRunId = null,
}: AgentActivityFeedProps) {
  const [expandedOutputIdx, setExpandedOutputIdx] = useState<number | null>(null);

  // ── Derived stats ─────────────────────────────────────────
  const stats = useMemo(() => {
    const agentMessages = messages.filter(
      (m) => m.sender !== 'user' && m.type !== 'user_message' && m.type !== 'answer',
    );
    const toolCalls = agentMessages.filter((m) => m.type === 'tool_call');
    const toolNames = [...new Set(toolCalls.map((m) => m.tool).filter(Boolean))];
    const msgCount = agentMessages.filter(
      (m) => m.type === 'thinking' || m.type === 'agent_message',
    ).length;
    const errorCount = agentMessages.filter((m) => m.type === 'error').length;
    const agentNames = [
      ...new Set(
        agentMessages
          .map((m) => m.sender)
          .filter((s) => s && s !== 'system' && s !== 'user'),
      ),
    ];

    return { toolCalls: toolCalls.length, toolNames, msgCount, errorCount, agentNames };
  }, [messages]);

  // ── Outputs: completed run outputs + significant agent deliverables ──
  const outputs = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      content: string;
      sender: string;
      timestamp: string;
      type: 'deliverable' | 'tool_result';
    }> = [];

    for (const m of messages) {
      // Final run output
      if (m.type === 'complete' && m.output) {
        items.push({
          id: m.id,
          title: outputTitle(m.output),
          content: m.output,
          sender: 'Crew',
          timestamp: m.timestamp,
          type: 'deliverable',
        });
      }
      // Large agent messages (likely deliverables, not chit-chat)
      if (
        m.type === 'agent_message' &&
        m.content &&
        m.content.length > 500 &&
        m.sender !== 'system'
      ) {
        items.push({
          id: m.id,
          title: outputTitle(m.content),
          content: m.content,
          sender: m.sender,
          timestamp: m.timestamp,
          type: 'deliverable',
        });
      }
    }

    return items;
  }, [messages]);

  return (
    <div className="space-y-4">
      {/* ── Status & Stats Card ──────────────────────────────── */}
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Run Overview</h3>
          <div className="flex items-center gap-2">
            {isConnected && (
              <span className="flex items-center gap-1.5 text-xs text-emerald-500">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                Connected
              </span>
            )}
            {isRunning && (
              <span className="flex items-center gap-1.5 text-xs text-sky-500">
                <span className="w-1.5 h-1.5 bg-sky-500 rounded-full animate-pulse" />
                Running
              </span>
            )}
          </div>
        </div>

        <div className="p-4 space-y-3">
          {/* Stat grid */}
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center">
              <p className="text-xl font-semibold text-foreground">{stats.msgCount}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Messages</p>
            </div>
            <div className="text-center">
              <p className="text-xl font-semibold text-foreground">{stats.toolCalls}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Tool Calls</p>
            </div>
            <div className="text-center">
              <p className={`text-xl font-semibold ${stats.errorCount > 0 ? 'text-red-500' : 'text-foreground'}`}>
                {stats.errorCount}
              </p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Errors</p>
            </div>
          </div>

          {/* Agents involved */}
          {stats.agentNames.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Agents</p>
              <div className="flex flex-wrap gap-1.5">
                {stats.agentNames.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 text-xs rounded-full border border-sky-200 dark:border-sky-800"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Tools used */}
          {stats.toolNames.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Tools Used</p>
              <div className="flex flex-wrap gap-1.5">
                {stats.toolNames.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 text-xs rounded-full border border-amber-200 dark:border-amber-800 font-mono"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Current run ID */}
          {currentRunId && (
            <p className="text-[10px] text-muted-foreground font-mono truncate">
              Run: {currentRunId}
            </p>
          )}
        </div>
      </div>

      {/* ── Outputs Card ─────────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Outputs</h3>
          {outputs.length > 0 && (
            <span className="text-xs text-muted-foreground">{outputs.length} item{outputs.length !== 1 ? 's' : ''}</span>
          )}
        </div>

        {outputs.length === 0 ? (
          <div className="p-6 text-center">
            <div className="text-2xl mb-2 opacity-40">📄</div>
            <p className="text-sm text-muted-foreground">
              {isRunning ? 'Agents are working…' : 'No outputs yet'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Deliverables and documents will appear here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {outputs.map((item, idx) => {
              const isExpanded = expandedOutputIdx === idx;
              return (
                <li key={item.id} className="group">
                  {/* Collapsed row */}
                  <button
                    onClick={() => setExpandedOutputIdx(isExpanded ? null : idx)}
                    className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-surface-muted transition-colors"
                  >
                    <span className="text-lg flex-shrink-0 mt-0.5">
                      {item.type === 'deliverable' ? '📄' : '🔧'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">{item.sender}</span>
                        <span className="text-xs text-muted-foreground">{formatTime(item.timestamp)}</span>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground flex-shrink-0 mt-1 transition-transform" style={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }}>
                      ▼
                    </span>
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-border/50">
                      <div className="mt-3 max-h-96 overflow-y-auto rounded-md bg-surface-muted p-3">
                        <MarkdownContent content={item.content} />
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

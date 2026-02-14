'use client';

import { useMemo, useState } from 'react';
import type { ConversationMessage } from '@/lib/hooks/useConversation';
import { MarkdownContent } from './MarkdownContent';
import { parseArtifacts, type Artifact } from '@/lib/parseArtifacts';

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

// ── Output item type ──────────────────────────────────────────

interface OutputItem {
  id: string;
  /** Display title (filename for code, heading for prose) */
  title: string;
  /** Language hint for code files */
  language?: string;
  content: string;
  sender: string;
  timestamp: string;
  /** Whether this is a code file (show raw) or prose (show markdown) */
  isCode: boolean;
}

// ── Agent pill color mapping — matches getAgentColor in ChatArea ──

const AGENT_PILL_CLASSES: Record<string, { pill: string; dot: string }> = {
  planner:   { pill: 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800', dot: 'bg-indigo-400' },
  narrative: { pill: 'bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800', dot: 'bg-violet-400' },
  memory:    { pill: 'bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800', dot: 'bg-violet-400' },
  product:   { pill: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800', dot: 'bg-emerald-400' },
  data:      { pill: 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800', dot: 'bg-sky-400' },
  technical: { pill: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800', dot: 'bg-amber-400' },
  seo:       { pill: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800', dot: 'bg-amber-400' },
  quality:   { pill: 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800', dot: 'bg-rose-400' },
  review:    { pill: 'bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800', dot: 'bg-rose-400' },
};
const DEFAULT_PILL_CLASSES = { pill: 'bg-sky-50 dark:bg-sky-900/30 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800', dot: 'bg-sky-400' };

function getAgentPillClasses(name: string) {
  const lower = name?.toLowerCase() || '';
  for (const [key, classes] of Object.entries(AGENT_PILL_CLASSES)) {
    if (lower.includes(key)) return classes;
  }
  return DEFAULT_PILL_CLASSES;
}

// ── Component ──────────────────────────────────────────────────

export function AgentActivityFeed({
  messages = [],
  isConnected = false,
  isRunning = false,
  currentRunId = null,
}: AgentActivityFeedProps) {
  const [expandedOutputId, setExpandedOutputId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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

  // ── Outputs: split complete outputs into individual files ──
  const outputs = useMemo(() => {
    const items: OutputItem[] = [];

    for (const m of messages) {
      if (m.type !== 'complete' || !m.output) continue;

      const artifacts = parseArtifacts(m.output);

      if (artifacts.length > 1 || (artifacts.length === 1 && artifacts[0].filename !== 'Output')) {
        // Multiple files — show each as a separate item
        for (const artifact of artifacts) {
          const isCode = artifact.language !== 'text' && artifact.language !== 'markdown';
          items.push({
            id: `${m.id}-${artifact.filename}`,
            title: artifact.filename,
            language: artifact.language,
            content: artifact.content,
            sender: 'Crew',
            timestamp: m.timestamp,
            isCode,
          });
        }
      } else {
        // Single prose output
        const heading = m.output.match(/^#{1,3}\s+(.+)/m);
        const firstLine = m.output.split('\n').find((l) => l.trim().length > 0);
        items.push({
          id: m.id,
          title: heading ? heading[1].slice(0, 80) : (firstLine?.slice(0, 80) || 'Output'),
          content: m.output,
          sender: 'Crew',
          timestamp: m.timestamp,
          isCode: false,
        });
      }
    }

    return items;
  }, [messages]);

  const handleCopy = async (id: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // ignore
    }
  };

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

          {stats.agentNames.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Agents</p>
              <div className="flex flex-wrap gap-1.5">
                {stats.agentNames.map((name) => {
                  const ac = getAgentPillClasses(name);
                  return (
                    <span
                      key={name}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full border ${ac.pill}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${ac.dot}`} />
                      {name}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

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
            <span className="text-xs text-muted-foreground">{outputs.length} file{outputs.length !== 1 ? 's' : ''}</span>
          )}
        </div>

        {outputs.length === 0 ? (
          <div className="p-6 text-center">
            <div className="text-2xl mb-2 opacity-40">📄</div>
            <p className="text-sm text-muted-foreground">
              {isRunning ? 'Agents are working…' : 'No outputs yet'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Files and deliverables will appear here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {outputs.map((item) => {
              const isExpanded = expandedOutputId === item.id;
              const isCopied = copiedId === item.id;
              return (
                <li key={item.id} className="group">
                  {/* Row header */}
                  <button
                    onClick={() => setExpandedOutputId(isExpanded ? null : item.id)}
                    className="w-full px-4 py-3 flex items-start gap-3 text-left hover:bg-surface-muted transition-colors"
                  >
                    <span className="text-base flex-shrink-0 mt-0.5">
                      {item.isCode ? '📝' : '📄'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {item.language && item.language !== 'text' && (
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{item.language}</span>
                        )}
                        <span className="text-xs text-muted-foreground">{formatTime(item.timestamp)}</span>
                      </div>
                    </div>
                    <span
                      className="text-xs text-muted-foreground flex-shrink-0 mt-1 transition-transform"
                      style={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }}
                    >
                      ▼
                    </span>
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t border-border/50">
                      <div className="flex justify-end mt-2 mb-1">
                        <button
                          onClick={() => handleCopy(item.id, item.content)}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-0.5 rounded border border-border/40"
                        >
                          {isCopied ? '✓ Copied' : 'Copy'}
                        </button>
                      </div>
                      {item.isCode ? (
                        <pre className="max-h-96 overflow-auto rounded-md bg-surface-muted p-3 text-xs font-mono leading-relaxed text-foreground/90">
                          <code>{item.content}</code>
                        </pre>
                      ) : (
                        <div className="max-h-96 overflow-y-auto rounded-md bg-surface-muted p-3">
                          <MarkdownContent content={item.content} />
                        </div>
                      )}
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

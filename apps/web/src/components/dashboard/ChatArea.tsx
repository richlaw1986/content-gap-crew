'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { MarkdownContent } from './MarkdownContent';
import { parseArtifacts, type Artifact } from '@/lib/parseArtifacts';
import type { ConversationMessage } from '@/lib/hooks/useConversation';

interface ChatAreaProps {
  messages?: ConversationMessage[];
  isConnected?: boolean;
  isRunning?: boolean;
  awaitingInput?: boolean;
  onSendMessage?: (content: string) => void;
  onSendAnswer?: (content: string) => void;
}

const WELCOME_MESSAGE: ConversationMessage = {
  id: '0',
  type: 'system',
  sender: 'system',
  content: 'Welcome to Agent Studio. Describe your goal to get started — agents will plan and coordinate in real time.',
  timestamp: new Date().toISOString(),
};

// ── Collapsible agent work dropdown ────────────────────────────

function CollapsibleAgentWork({
  sender,
  content,
  summary,
  accentColor,
}: {
  sender: string;
  content: string;
  summary: string;
  accentColor: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="my-1">
      <button
        onClick={() => setOpen(!open)}
        className="group flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
      >
        <span
          className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] transition-transform ${
            open ? 'rotate-90' : ''
          }`}
        >
          ▶
        </span>
        <span className={`font-medium ${accentColor}`}>{sender}</span>
        <span className="opacity-60">— {summary}</span>
      </button>
      {open && (
        <div className="ml-6 mt-1 mb-2 pl-3 border-l-2 border-border/40 text-sm text-foreground/80">
          <MarkdownContent content={content} />
        </div>
      )}
    </div>
  );
}

// ── File artifact card with copy button ────────────────────────

function ArtifactCard({ artifact }: { artifact: Artifact }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(artifact.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  const isCode = artifact.language !== 'text' && artifact.language !== 'markdown';

  return (
    <div className="rounded-xl overflow-hidden border border-border/40 bg-surface-muted">
      {/* File header */}
      <div className="flex items-center justify-between px-3 py-2 bg-surface border-b border-border/40">
        <div className="flex items-center gap-2">
          <span className="text-xs opacity-50">📄</span>
          <span className="text-xs font-medium text-foreground">{artifact.filename}</span>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{artifact.language}</span>
        </div>
        <button
          onClick={handleCopy}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-0.5 rounded"
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>

      {/* File content */}
      {isCode ? (
        <pre className="p-3 overflow-x-auto text-xs font-mono leading-relaxed text-foreground/90 max-h-96 overflow-y-auto">
          <code>{artifact.content}</code>
        </pre>
      ) : (
        <div className="p-4 text-sm leading-relaxed">
          <MarkdownContent content={artifact.content} />
        </div>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────

function summarize(content: string, fallback: string): string {
  if (!content) return fallback;
  const heading = content.match(/^#{1,3}\s+(.+)/m);
  if (heading) return heading[1].slice(0, 80);
  const firstLine = content.split('\n').find((l) => l.trim().length > 10);
  if (firstLine) {
    const clean = firstLine.replace(/^[#*\->\s]+/, '').trim();
    return clean.length > 80 ? clean.slice(0, 77) + '…' : clean;
  }
  return fallback;
}

// ── Main component ─────────────────────────────────────────────

export function ChatArea({
  messages = [],
  isRunning = false,
  awaitingInput = false,
  onSendMessage,
  onSendAnswer,
}: ChatAreaProps) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const displayMessages = messages.length > 0 ? messages : [WELCOME_MESSAGE];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    if (awaitingInput) {
      onSendAnswer?.(input.trim());
    } else {
      onSendMessage?.(input.trim());
    }
    setInput('');
  };

  const getAgentColor = (sender: string) => {
    const name = sender?.toLowerCase() || '';
    if (name.includes('planner')) return 'text-indigo-600 dark:text-indigo-400';
    if (name.includes('narrative') || name.includes('memory')) return 'text-violet-600 dark:text-violet-400';
    if (name.includes('product')) return 'text-emerald-600 dark:text-emerald-400';
    if (name.includes('data')) return 'text-sky-600 dark:text-sky-400';
    if (name.includes('technical') || name.includes('seo')) return 'text-amber-600 dark:text-amber-400';
    if (name.includes('quality') || name.includes('review')) return 'text-rose-600 dark:text-rose-400';
    if (name === 'system') return 'text-muted-foreground';
    return 'text-sky-600 dark:text-sky-400';
  };

  const shouldShow = (msg: ConversationMessage) => {
    if (msg.type === 'status') return false;
    if (msg.type === 'tool_call' || msg.type === 'tool_result') return false;
    return true;
  };

  const isCollapsible = (msg: ConversationMessage) => {
    if (msg.type !== 'agent_message') return false;
    if (msg.sender === 'system' || msg.sender === 'user') return false;
    if ((msg.content?.length || 0) < 100) return false;
    return true;
  };

  const getCollapseLabel = (msg: ConversationMessage) => {
    const name = msg.sender?.toLowerCase() || '';
    if (name.includes('review') || name.includes('quality')) {
      return 'Reviewed and provided feedback';
    }
    return summarize(msg.content, 'Produced output');
  };

  return (
    <div className="h-full flex flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-8 space-y-1 bg-background">
        {displayMessages.filter(shouldShow).map((msg) => {
          const isUser = msg.sender === 'user';
          const isSystem = msg.type === 'system';
          const isError = msg.type === 'error';
          const isComplete = msg.type === 'complete';
          const isThinking = msg.type === 'thinking';
          const isQuestion = msg.type === 'question';

          // ── Collapsible agent work (drafts, reviews, revisions) ──
          if (isCollapsible(msg)) {
            return (
              <CollapsibleAgentWork
                key={msg.id}
                sender={msg.sender}
                content={msg.content}
                summary={getCollapseLabel(msg)}
                accentColor={getAgentColor(msg.sender)}
              />
            );
          }

          // ── Thinking / status lines ──
          if (isThinking) {
            return (
              <div key={msg.id} className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                <span className={`font-medium ${getAgentColor(msg.sender)}`}>{msg.sender}</span>
                <span className="opacity-60">{msg.content}</span>
              </div>
            );
          }

          // ── Final output — detect multiple files and render as cards ──
          if (isComplete && msg.output) {
            return <FinalOutput key={msg.id} output={msg.output} />;
          }

          // ── User messages ──
          if (isUser) {
            return (
              <div key={msg.id} className="flex justify-end mt-3">
                <div className="max-w-2xl ml-12">
                  <div className="rounded-2xl rounded-br-md px-4 py-3 text-sm leading-relaxed bg-accent text-accent-foreground">
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              </div>
            );
          }

          // ── Questions ──
          if (isQuestion) {
            return (
              <div key={msg.id} className="flex justify-start mt-3">
                <div className="max-w-2xl mr-12">
                  <div className={`text-xs font-medium mb-1 ml-1 flex items-center gap-1.5 ${getAgentColor(msg.sender)}`}>
                    <span>❓</span>
                    <span>{msg.sender}</span>
                  </div>
                  <div className="rounded-2xl px-4 py-3 text-sm leading-relaxed bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200">
                    <MarkdownContent content={msg.content || ''} />
                  </div>
                </div>
              </div>
            );
          }

          // ── Errors ──
          if (isError) {
            return (
              <div key={msg.id} className="flex justify-start mt-2">
                <div className="max-w-2xl mr-12">
                  <div className="rounded-2xl px-4 py-3 text-sm leading-relaxed bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300">
                    <p>{msg.content || msg.message || 'An error occurred'}</p>
                  </div>
                </div>
              </div>
            );
          }

          // ── System messages ──
          if (isSystem) {
            return (
              <div key={msg.id} className="flex justify-start mt-2">
                <div className="max-w-2xl mr-12">
                  <div className="rounded-2xl px-4 py-3 text-sm leading-relaxed text-muted-foreground italic">
                    <p>{msg.content}</p>
                  </div>
                </div>
              </div>
            );
          }

          // ── Short agent messages ──
          return (
            <div key={msg.id} className="flex justify-start mt-2">
              <div className="max-w-2xl mr-12">
                <div className={`text-xs font-medium mb-1 ml-1 ${getAgentColor(msg.sender)}`}>
                  {msg.sender}
                </div>
                <div className="rounded-2xl px-4 py-3 text-sm leading-relaxed bg-surface-muted text-foreground">
                  <MarkdownContent content={msg.content || ''} />
                </div>
              </div>
            </div>
          );
        })}

        {isRunning && !awaitingInput && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1.5 px-4 py-3 rounded-2xl bg-surface-muted/50">
              <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" />
              <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:0.15s]" />
              <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:0.3s]" />
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-6 pb-6 pt-2 bg-background">
        <form onSubmit={handleSubmit} className="flex items-center gap-2 bg-surface-muted rounded-2xl px-4 py-1.5 ring-1 ring-border/50 focus-within:ring-2 focus-within:ring-ring transition-shadow">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              awaitingInput
                ? 'Type your answer…'
                : isRunning
                  ? 'Add context or follow up…'
                  : 'Ask anything…'
            }
            className="flex-1 bg-transparent py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="shrink-0 p-2 rounded-xl text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-default transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
              <path d="M3.105 2.288a.75.75 0 0 0-.826.95l1.414 4.926A1.5 1.5 0 0 0 5.135 9.25h6.115a.75.75 0 0 1 0 1.5H5.135a1.5 1.5 0 0 0-1.442 1.086l-1.414 4.926a.75.75 0 0 0 .826.95l14.095-5.252a.75.75 0 0 0 0-1.41L3.105 2.288Z" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Final output renderer ──────────────────────────────────────
// Splits the output into artifacts (files) if possible, otherwise
// renders as a single markdown block.

function FinalOutput({ output }: { output: string }) {
  const artifacts = useMemo(() => parseArtifacts(output), [output]);
  const hasFiles = artifacts.length > 1 || (artifacts.length === 1 && artifacts[0].filename !== 'Output');

  if (hasFiles) {
    return (
      <div className="flex justify-start mt-4">
        <div className="max-w-3xl mr-8 w-full">
          <div className="text-xs font-medium mb-3 ml-1 text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
            <span>✓</span>
            <span>Final Output — {artifacts.length} file{artifacts.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="space-y-3">
            {artifacts.map((artifact, i) => (
              <ArtifactCard key={`${artifact.filename}-${i}`} artifact={artifact} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Single non-file output — render as markdown
  return (
    <div className="flex justify-start mt-4">
      <div className="max-w-3xl mr-8">
        <div className="text-xs font-medium mb-2 ml-1 text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
          <span>✓</span>
          <span>Final Output</span>
        </div>
        <div className="rounded-2xl px-5 py-4 text-sm leading-relaxed bg-surface-muted text-foreground">
          <MarkdownContent content={output} />
        </div>
      </div>
    </div>
  );
}

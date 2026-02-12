'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { MarkdownContent } from './MarkdownContent';
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

export function ChatArea({
  messages = [],
  isConnected = false,
  isRunning = false,
  awaitingInput = false,
  onSendMessage,
  onSendAnswer,
}: ChatAreaProps) {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Combine welcome message with real messages
  const displayMessages = messages.length > 0 ? messages : [WELCOME_MESSAGE];

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    if (awaitingInput) {
      onSendAnswer?.(input.trim());
    } else {
      // Works whether a run is active or not — backend queues if busy
      onSendMessage?.(input.trim());
    }
    setInput('');
  };

  // ── Styling helpers ─────────────────────────────────────

  const getMessageStyles = (msg: ConversationMessage) => {
    if (msg.sender === 'user') return 'bg-accent text-accent-foreground ml-auto';
    if (msg.type === 'error') return 'bg-red-50 text-red-900 border border-red-200';
    if (msg.type === 'system') return 'bg-surface-muted text-foreground border border-border';
    if (msg.type === 'complete') return 'bg-emerald-50 text-emerald-900 border border-emerald-200';
    return 'bg-surface text-foreground border border-border';
  };

  const getAccent = (msg: ConversationMessage) => {
    if (msg.sender === 'user') return '';
    const name = msg.sender?.toLowerCase() || '';
    if (name.includes('planner')) return 'border-l-4 border-indigo-500';
    if (name.includes('narrative') || name.includes('memory')) return 'border-l-4 border-violet-500';
    if (name.includes('product')) return 'border-l-4 border-emerald-500';
    if (name.includes('data')) return 'border-l-4 border-sky-500';
    if (name === 'system') return 'border-l-4 border-gray-400';
    return 'border-l-4 border-amber-500';
  };

  const getIcon = (msg: ConversationMessage) => {
    switch (msg.type) {
      case 'question': return '❓';
      case 'error': return '❌';
      case 'complete': return '✅';
      case 'tool_call': return '🔧';
      case 'tool_result': return '✅';
      case 'thinking': return '💭';
      case 'system': return '🔵';
      default: return msg.sender === 'user' ? '' : '💬';
    }
  };

  const shouldShow = (msg: ConversationMessage) => {
    // Skip status messages — they're shown in the sidebar
    if (msg.type === 'status') return false;
    return true;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-background">
        {displayMessages.filter(shouldShow).map((msg) => (
          <div
            key={msg.id}
            className={`max-w-2xl rounded-lg p-4 ${getMessageStyles(msg)} ${getAccent(msg)}`}
          >
            {msg.sender && msg.sender !== 'user' && (
              <div className="text-xs font-semibold mb-1 opacity-75 flex items-center gap-1">
                <span>{getIcon(msg)}</span>
                <span>{msg.sender}</span>
              </div>
            )}
            {msg.sender === 'user' ? (
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
            ) : (
              <MarkdownContent content={msg.content || ''} />
            )}
            {msg.type === 'tool_call' && msg.tool && (
              <div className="mt-1 text-xs text-muted-foreground font-mono">
                Tool: {msg.tool}
              </div>
            )}
          </div>
        ))}

        {isRunning && !awaitingInput && (
          <div className="max-w-2xl rounded-lg p-4 bg-surface-muted border border-border">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-accent rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-accent rounded-full animate-bounce [animation-delay:0.1s]" />
              <div className="w-2 h-2 bg-accent rounded-full animate-bounce [animation-delay:0.2s]" />
              <span className="ml-2 text-sm text-muted-foreground">Agents working...</span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-border p-4 bg-surface">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              awaitingInput
                ? 'Type your answer…'
                : isRunning
                  ? 'Type to add context or queue a follow-up…'
                  : 'Ask anything…'
            }
            className="flex-1 px-4 py-3 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent"
          />
          <Button
            type="submit"
            variant="outline"
            disabled={!input.trim()}
          >
            {awaitingInput ? 'Answer' : 'Send'}
          </Button>
        </form>
      </div>
    </div>
  );
}

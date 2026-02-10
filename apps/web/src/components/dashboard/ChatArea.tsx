'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui';
import { RunStreamEvent } from '@/lib/hooks';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'agent';
  agentName?: string;
  content: string;
  timestamp: string;
}

const INITIAL_MESSAGE: Message = {
  id: '0',
  role: 'assistant',
  content: 'Welcome to Agent Studio. Describe your goal or launch a workflow to get started.',
  timestamp: new Date().toISOString(),
};

interface ChatAreaProps {
  onSend?: (message: string) => void;
  events?: RunStreamEvent[];
  isRunning?: boolean;
  awaitingInput?: boolean;
}

export function ChatArea({
  onSend,
  events = [],
  isRunning = false,
  awaitingInput = false,
}: ChatAreaProps) {
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');
  const [lastEventIndex, setLastEventIndex] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Reset event tracking when the events array is cleared (new run)
  useEffect(() => {
    if (events.length === 0) {
      setLastEventIndex(0);
    }
  }, [events.length]);

  // Process new events into chat messages
  useEffect(() => {
    if (events.length <= lastEventIndex) return;

    const newEvents = events.slice(lastEventIndex);
    const newMessages: Message[] = newEvents
      .map((event, idx) => {
        const base: Message = {
          id: `${event.type}-${lastEventIndex + idx}-${event.timestamp}`,
          role: event.type === 'error' ? 'assistant' : 'agent',
          agentName: 'agent' in event ? event.agent : undefined,
          content: '',
          timestamp: event.timestamp,
        };

        switch (event.type) {
          case 'agent_message':
            base.content = event.content;
            return base;
          case 'tool_call':
            base.content = `Tool call: ${event.tool}`;
            return base;
          case 'tool_result':
            base.content = `Tool result: ${event.tool}`;
            return base;
          case 'complete':
            base.role = 'assistant';
            base.content = event.finalOutput
              ? event.finalOutput.length > 1200
                ? `${event.finalOutput.substring(0, 1200)}…`
                : event.finalOutput
              : 'Workflow complete. Review the activity feed for details.';
            return base;
          case 'error':
            base.role = 'assistant';
            base.content = `Error: ${event.message}`;
            return base;
          default:
            base.content = 'Update received.';
            return base;
        }
      })
      .filter((m) => m.content);

    if (newMessages.length) {
      setMessages((prev) => [...prev, ...newMessages]);
    }
    setLastEventIndex(events.length);
  }, [events, lastEventIndex]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    // Block input only when actively running (not when awaiting answers)
    if (isRunning && !awaitingInput) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);

    // If this is a brand-new objective (not answering questions), show a planning note
    if (!awaitingInput) {
      const planMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Planning workflow for "${input.trim()}". You'll see agents coordinate here as they work.`,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, planMessage]);
    }

    onSend?.(input.trim());
    setInput('');
  };

  // ── Styling helpers ────────────────────────────────────────

  const getMessageStyles = (role: Message['role']) => {
    switch (role) {
      case 'user':
        return 'bg-accent text-accent-foreground ml-auto';
      case 'assistant':
        return 'bg-surface-muted text-foreground border border-border';
      case 'agent':
        return 'bg-surface text-foreground border border-border';
    }
  };

  const getAgentAccent = (agentName?: string) => {
    if (!agentName) return 'border-l-2 border-border';
    const name = agentName.toLowerCase();
    if (name.includes('planner')) return 'border-l-4 border-indigo-500';
    if (name.includes('narrative')) return 'border-l-4 border-violet-500';
    if (name.includes('product')) return 'border-l-4 border-emerald-500';
    if (name.includes('data')) return 'border-l-4 border-sky-500';
    return 'border-l-4 border-amber-500';
  };

  const canType = awaitingInput || (!isRunning);

  return (
    <div className="h-full flex flex-col">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-background">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`max-w-2xl rounded-lg p-4 ${getMessageStyles(message.role)} ${getAgentAccent(message.agentName)}`}
          >
            {message.agentName && (
              <div className="text-xs font-semibold mb-1 opacity-75">
                {message.agentName}
              </div>
            )}
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
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
                ? 'Type your answers…'
                : isRunning
                  ? 'Workflow in progress…'
                  : 'Describe your goal and press Start…'
            }
            className="flex-1 px-4 py-3 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:bg-surface-muted disabled:text-muted-foreground"
            disabled={!canType}
          />
          <Button
            type="submit"
            variant="outline"
            disabled={!canType || !input.trim()}
          >
            {awaitingInput ? 'Answer' : isRunning ? 'Running…' : 'Start'}
          </Button>
        </form>
      </div>
    </div>
  );
}

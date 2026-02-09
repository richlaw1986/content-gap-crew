'use client';

import { useState } from 'react';
import { Button } from '@/components/ui';

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
  onStartRun?: (objective: string) => void;
  isRunning?: boolean;
}

export function ChatArea({ onStartRun, isRunning = false }: ChatAreaProps) {
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isRunning) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    
    // Start workflow with the input as the goal
    const objective = input.trim();
    
    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: `Planning workflow for "${objective}". You'll see agents coordinate here as they work.`,
      timestamp: new Date().toISOString(),
    };
    setMessages(prev => [...prev, assistantMessage]);
    
    onStartRun?.(objective);
    
    setInput('');
  };

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

  return (
    <div className="h-full flex flex-col">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-background">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`max-w-2xl rounded-lg p-4 ${getMessageStyles(message.role)}`}
          >
            {message.agentName && (
              <div className="text-xs font-semibold mb-1 opacity-75">
                {message.agentName}
              </div>
            )}
            <p className="text-sm whitespace-pre-wrap">{message.content}</p>
          </div>
        ))}
        
        {isRunning && (
          <div className="max-w-2xl rounded-lg p-4 bg-surface-muted border border-border">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-accent rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-accent rounded-full animate-bounce [animation-delay:0.1s]" />
              <div className="w-2 h-2 bg-accent rounded-full animate-bounce [animation-delay:0.2s]" />
              <span className="ml-2 text-sm text-muted-foreground">Agents working...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-border p-4 bg-surface">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isRunning 
              ? "Workflow in progress..." 
              : "Describe your goal and press Start..."
            }
            className="flex-1 px-4 py-3 border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:bg-surface-muted disabled:text-muted-foreground"
            disabled={isRunning}
          />
          <Button 
            type="submit" 
            variant="outline" 
            disabled={isRunning || !input.trim()}
          >
            {isRunning ? 'Running...' : 'Start'}
          </Button>
        </form>
      </div>
    </div>
  );
}

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
  content: 'Welcome to Content Gap Crew! Enter a URL to analyze, or describe what you\'d like to research.',
  timestamp: new Date().toISOString(),
};

interface ChatAreaProps {
  onStartRun?: (targetUrl: string) => void;
  isRunning?: boolean;
}

export function ChatArea({ onStartRun, isRunning = false }: ChatAreaProps) {
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE]);
  const [input, setInput] = useState('');

  const isUrl = (text: string): boolean => {
    try {
      new URL(text.startsWith('http') ? text : `https://${text}`);
      return text.includes('.');
    } catch {
      return false;
    }
  };

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
    
    // Check if input looks like a URL
    if (isUrl(input.trim())) {
      const url = input.trim().startsWith('http') 
        ? input.trim() 
        : `https://${input.trim()}`;
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Starting content gap analysis for ${url}. Watch the activity feed on the right to see the agents at work.`,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, assistantMessage]);
      
      onStartRun?.(url);
    } else {
      // Not a URL - provide guidance
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'To start an analysis, please enter a website URL (e.g., example.com or https://example.com). I\'ll analyze it for content gaps compared to competitors.',
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, assistantMessage]);
    }
    
    setInput('');
  };

  const getMessageStyles = (role: Message['role']) => {
    switch (role) {
      case 'user':
        return 'bg-blue-600 text-white ml-auto';
      case 'assistant':
        return 'bg-gray-100 text-gray-900';
      case 'agent':
        return 'bg-purple-100 text-purple-900 border border-purple-200';
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
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
          <div className="max-w-2xl rounded-lg p-4 bg-gray-100">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:0.1s]" />
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce [animation-delay:0.2s]" />
              <span className="ml-2 text-sm text-gray-600">Agents working...</span>
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-gray-200 p-4">
        <form onSubmit={handleSubmit} className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isRunning 
              ? "Analysis in progress..." 
              : "Enter a URL to analyze (e.g., example.com)..."
            }
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
            disabled={isRunning}
          />
          <Button 
            type="submit" 
            variant="primary" 
            disabled={isRunning || !input.trim()}
          >
            {isRunning ? 'Running...' : 'Analyze'}
          </Button>
        </form>
      </div>
    </div>
  );
}

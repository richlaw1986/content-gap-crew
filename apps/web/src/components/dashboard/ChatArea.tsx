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

// Placeholder messages - will be replaced with real chat/SSE data
const PLACEHOLDER_MESSAGES: Message[] = [
  {
    id: '1',
    role: 'assistant',
    content: 'Welcome to Content Gap Crew! Enter a URL to analyze, or describe what you\'d like to research.',
    timestamp: new Date().toISOString(),
  },
];

export function ChatArea() {
  const [messages, setMessages] = useState<Message[]>(PLACEHOLDER_MESSAGES);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date().toISOString(),
    };
    
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Simulate response - will be replaced with real API call
    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '🚧 API integration pending. Once connected, I\'ll analyze your request and coordinate the crew agents to find content gaps.',
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, assistantMessage]);
      setIsLoading(false);
    }, 1000);
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
        
        {isLoading && (
          <div className="max-w-2xl rounded-lg p-4 bg-gray-100">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.1s]" />
              <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0.2s]" />
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
            placeholder="Enter a URL to analyze or describe your research goal..."
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
          />
          <Button type="submit" variant="primary" disabled={isLoading || !input.trim()}>
            {isLoading ? 'Analyzing...' : 'Send'}
          </Button>
        </form>
      </div>
    </div>
  );
}

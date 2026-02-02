'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { getApiUrl } from '../env';

// =============================================================================
// Types matching FastAPI SSE events
// =============================================================================

export type AgentEventType = 'agent_message' | 'tool_call' | 'tool_result' | 'complete' | 'error';

export interface AgentMessageEvent {
  type: 'agent_message';
  agent: string;
  messageType: 'thinking' | 'message';
  content: string;
  timestamp: string;
}

export interface ToolCallEvent {
  type: 'tool_call';
  agent: string;
  tool: string;
  args: Record<string, unknown>;
  timestamp: string;
}

export interface ToolResultEvent {
  type: 'tool_result';
  agent: string;
  tool: string;
  result: string;
  timestamp: string;
}

export interface CompleteEvent {
  type: 'complete';
  runId: string;
  finalOutput: string;
  timestamp: string;
}

export interface ErrorEvent {
  type: 'error';
  message: string;
  timestamp: string;
}

export type RunStreamEvent = 
  | AgentMessageEvent 
  | ToolCallEvent 
  | ToolResultEvent 
  | CompleteEvent 
  | ErrorEvent;

// =============================================================================
// Hook
// =============================================================================

export interface UseRunStreamOptions {
  onEvent?: (event: RunStreamEvent) => void;
  onComplete?: (output: string) => void;
  onError?: (error: Error) => void;
  autoReconnect?: boolean;
  maxReconnectAttempts?: number;
}

export interface UseRunStreamReturn {
  events: RunStreamEvent[];
  isConnected: boolean;
  isComplete: boolean;
  error: Error | null;
  connect: () => void;
  disconnect: () => void;
}

export function useRunStream(
  runId: string | null,
  options: UseRunStreamOptions = {}
): UseRunStreamReturn {
  const {
    onEvent,
    onComplete,
    onError,
    autoReconnect = true,
    maxReconnectAttempts = 3,
  } = options;

  const [events, setEvents] = useState<RunStreamEvent[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const connect = useCallback(() => {
    if (!runId) return;
    
    // Clean up existing connection
    disconnect();
    setError(null);
    setIsComplete(false);

    const baseUrl = getApiUrl();
    const url = `${baseUrl}/api/runs/${runId}/stream`;

    const eventSource = new EventSource(url, {
      withCredentials: true,
    });

    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      reconnectAttemptsRef.current = 0;
    };

    eventSource.onerror = (e) => {
      console.error('SSE connection error:', e);
      setIsConnected(false);

      // Attempt reconnect if not complete
      if (autoReconnect && !isComplete && reconnectAttemptsRef.current < maxReconnectAttempts) {
        reconnectAttemptsRef.current++;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log(`Reconnecting (attempt ${reconnectAttemptsRef.current})...`);
          connect();
        }, delay);
      } else {
        const err = new Error('SSE connection failed');
        setError(err);
        onError?.(err);
      }
    };

    // Handle different event types
    const handleEvent = (eventType: string) => (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        const event: RunStreamEvent = { ...data, type: eventType };
        
        setEvents(prev => [...prev, event]);
        onEvent?.(event);

        if (eventType === 'complete') {
          setIsComplete(true);
          onComplete?.(data.finalOutput);
          disconnect();
        }

        if (eventType === 'error') {
          const err = new Error(data.message);
          setError(err);
          onError?.(err);
        }
      } catch (err) {
        console.error('Failed to parse SSE event:', err);
      }
    };

    eventSource.addEventListener('agent_message', handleEvent('agent_message'));
    eventSource.addEventListener('tool_call', handleEvent('tool_call'));
    eventSource.addEventListener('tool_result', handleEvent('tool_result'));
    eventSource.addEventListener('complete', handleEvent('complete'));
    eventSource.addEventListener('error', handleEvent('error'));

  }, [runId, disconnect, autoReconnect, maxReconnectAttempts, isComplete, onEvent, onComplete, onError]);

  // Auto-connect when runId changes
  useEffect(() => {
    if (runId) {
      setEvents([]);
      connect();
    }
    return () => disconnect();
  }, [runId, connect, disconnect]);

  return {
    events,
    isConnected,
    isComplete,
    error,
    connect,
    disconnect,
  };
}

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
  // Ref mirrors isComplete so closures always see the latest value
  const isCompleteRef = useRef(false);

  // Stable refs for callbacks — prevents `connect` from getting a new
  // identity every render, which would tear down / re-establish the SSE
  // connection and cause the crew to execute twice.
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

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
    isCompleteRef.current = false;

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

    eventSource.onerror = () => {
      setIsConnected(false);

      // Don't reconnect if the run already completed or errored out
      if (isCompleteRef.current) {
        return;
      }

      if (autoReconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
        reconnectAttemptsRef.current++;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          // Double-check before actually reconnecting
          if (!isCompleteRef.current) {
            connect();
          }
        }, delay);
      } else {
        const err = new Error('SSE connection failed');
        setError(err);
        onErrorRef.current?.(err);
      }
    };

    // Handle different event types
    const handleEvent = (eventType: string) => (e: MessageEvent) => {
      try {
        if (!e.data || e.data === 'undefined') {
          return;
        }
        const data = JSON.parse(e.data);
        const event: RunStreamEvent = { ...data, type: eventType };
        
        setEvents(prev => [...prev, event]);
        onEventRef.current?.(event);

        if (eventType === 'complete') {
          isCompleteRef.current = true;
          setIsComplete(true);
          onCompleteRef.current?.(data.finalOutput);
          disconnect();
        }

        if (eventType === 'error') {
          // Mark as complete so we don't reconnect into the same error
          isCompleteRef.current = true;
          setIsComplete(true);
          const err = new Error(data.message);
          setError(err);
          onErrorRef.current?.(err);
          disconnect();
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

  }, [runId, disconnect, autoReconnect, maxReconnectAttempts]);

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

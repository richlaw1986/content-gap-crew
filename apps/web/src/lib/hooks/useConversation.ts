'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getWsUrl } from '../env';

// =============================================================================
// Types — matches the WebSocket protocol from the backend
// =============================================================================

export interface QuestionOption {
  value: string;
  label: string;
  description?: string;
}

export interface ConversationMessage {
  id: string;
  type:
    | 'agent_message'
    | 'thinking'
    | 'question'
    | 'answer'
    | 'tool_call'
    | 'tool_result'
    | 'system'
    | 'complete'
    | 'error'
    | 'status'
    | 'user_message';
  sender: string;
  content: string;
  questionId?: string;
  /** For `question` messages: structured options (radio/checkbox) */
  options?: QuestionOption[];
  /** For `question` messages: "radio" (single) or "checkbox" (multi) */
  selectionType?: 'radio' | 'checkbox';
  tool?: string;
  args?: Record<string, unknown>;
  result?: string;
  runId?: string;
  output?: string;
  message?: string; // for error type
  status?: string;  // for status type
  replayed?: boolean; // true for messages replayed from history on reconnect
  /** True when this agent message is a direct conversational reply (not intermediate work) */
  isReply?: boolean;
  timestamp: string;
}

export interface UseConversationOptions {
  onMessage?: (msg: ConversationMessage) => void;
  onComplete?: (output: string, runId: string) => void;
  onError?: (msg: string) => void;
  onQuestion?: (msg: ConversationMessage) => void;
}

export interface UseConversationReturn {
  messages: ConversationMessage[];
  isConnected: boolean;
  isRunning: boolean;
  awaitingInput: boolean;
  currentRunId: string | null;
  sendMessage: (content: string) => void;
  /** Send an answer. `displayContent` overrides what shows in chat (for structured selections). */
  sendAnswer: (content: string, questionId?: string, displayContent?: string) => void;
  connect: () => void;
  disconnect: () => void;
}

// =============================================================================
// Hook
// =============================================================================

export function useConversation(
  conversationId: string | null,
  options: UseConversationOptions = {},
): UseConversationReturn {
  const { onMessage, onComplete, onError, onQuestion } = options;

  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [awaitingInput, setAwaitingInput] = useState(false);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const attemptsRef = useRef(0);
  const maxAttempts = 3;
  // Bumped to force the main effect to re-run (for manual reconnect).
  const [connectEpoch, setConnectEpoch] = useState(0);
  // Track the conversation the WS is *actually* connected to so the
  // effect can detect when the id truly changes vs. a mere re-render.
  const connectedIdRef = useRef<string | null>(null);
  // Prevent the cleanup path from scheduling reconnects after we
  // intentionally tore down the socket.
  const intentionalCloseRef = useRef(false);

  // Stable refs for callbacks so WS handlers never go stale
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const onQuestionRef = useRef(onQuestion);
  onQuestionRef.current = onQuestion;

  // ── helpers (not re-created on render — use refs only) ──────────

  const teardown = useCallback(() => {
    intentionalCloseRef.current = true;
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    const ws = wsRef.current;
    if (ws) {
      wsRef.current = null;
      ws.onopen = null;
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      ws.close();
    }
    connectedIdRef.current = null;
    setIsConnected(false);
  }, []);

  // ── main effect: open / close WS when conversationId changes ────
  useEffect(() => {
    // Nothing to connect to
    if (!conversationId) {
      teardown();
      setMessages([]);
      setIsRunning(false);
      setAwaitingInput(false);
      setCurrentRunId(null);
      return;
    }

    // Already connected to this conversation — skip
    if (connectedIdRef.current === conversationId && wsRef.current) {
      return;
    }

    // Different conversation (or first mount) — tear down old, spin up new
    teardown();
    attemptsRef.current = 0;
    setMessages([]);
    setIsRunning(false);
    setAwaitingInput(false);
    setCurrentRunId(null);

    const openSocket = () => {
      intentionalCloseRef.current = false;

      // Clear existing messages before the server replays history.
      // This prevents duplicates when the browser kills the WS on tab-switch
      // and we reconnect and receive the full replay again.
      setMessages([]);

      const wsBase = getWsUrl();
      const url = `${wsBase}/api/conversations/${conversationId}/ws`;
      const ws = new WebSocket(url);
      wsRef.current = ws;
      connectedIdRef.current = conversationId;

      // Keep-alive: send a lightweight ping every 25 s so the browser
      // doesn't kill the socket when the tab is backgrounded.
      let pingInterval: ReturnType<typeof setInterval> | null = null;

      ws.onopen = () => {
        setIsConnected(true);
        attemptsRef.current = 0;
        pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 25_000);
      };

      ws.onclose = () => {
        if (pingInterval) clearInterval(pingInterval);
        setIsConnected(false);
        // Only reconnect if we didn't intentionally close
        if (
          !intentionalCloseRef.current &&
          attemptsRef.current < maxAttempts
        ) {
          attemptsRef.current++;
          const delay = Math.min(1000 * 2 ** attemptsRef.current, 10_000);
          reconnectTimer.current = setTimeout(openSocket, delay);
        }
      };

      ws.onerror = () => {
        // onclose fires after this — reconnect logic lives there
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as ConversationMessage;
          const msg: ConversationMessage = {
            ...data,
            id:
              data.id ||
              `${data.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          };

          // For replayed (historical) messages, just add to the list
          // without triggering state changes or callbacks.
          if (msg.replayed) {
            setMessages((prev) => [...prev, msg]);
            return;
          }

          switch (msg.type) {
            case 'question':
              setAwaitingInput(true);
              setIsRunning(false);
              onQuestionRef.current?.(msg);
              break;
            case 'status':
              if (msg.status === 'running') {
                setIsRunning(true);
                setAwaitingInput(false);
                if (msg.runId) setCurrentRunId(msg.runId);
              }
              break;
            case 'complete':
              setIsRunning(false);
              setAwaitingInput(false);
              if (msg.output && msg.runId) {
                onCompleteRef.current?.(msg.output, msg.runId);
              }
              break;
            case 'error':
              setIsRunning(false);
              onErrorRef.current?.(msg.message || msg.content || 'Unknown error');
              break;
            case 'thinking':
            case 'agent_message':
            case 'tool_call':
            case 'tool_result':
              setIsRunning(true);
              break;
            case 'system':
              break;
          }

          setMessages((prev) => [...prev, msg]);
          onMessageRef.current?.(msg);
        } catch (err) {
          console.error('Failed to parse WS message:', err);
        }
      };
    };

    openSocket();

    // Cleanup when conversationId changes or component unmounts
    return () => {
      teardown();
    };
    // `teardown` is stable (useCallback with []).
    // Re-run when conversationId changes OR when manual connect() bumps the epoch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, connectEpoch]);

  // ── send helpers ────────────────────────────────────────────────

  const sendMessage = useCallback((content: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'user_message', content }));
      const msg: ConversationMessage = {
        id: `user-${Date.now()}`,
        type: 'user_message',
        sender: 'user',
        content,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, msg]);
      setAwaitingInput(false);
    }
  }, []);

  const sendAnswer = useCallback((content: string, questionId?: string, displayContent?: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      // Always send the raw value to the server
      ws.send(JSON.stringify({ type: 'answer', content, questionId }));
      // Show a friendly version in the chat (or nothing for silent selections)
      const visibleContent = displayContent ?? content;
      if (visibleContent) {
        const msg: ConversationMessage = {
          id: `answer-${Date.now()}`,
          type: 'answer',
          sender: 'user',
          content: visibleContent,
          timestamp: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, msg]);
      }
      setAwaitingInput(false);
    }
  }, []);

  // Expose connect/disconnect for manual use (rare).
  // Bumps the connectEpoch so the main effect re-runs and opens a fresh
  // socket with all the proper handlers (ping, replay, etc.).
  const connect = useCallback(() => {
    connectedIdRef.current = null;
    teardown();
    setConnectEpoch((e) => e + 1);
  }, [teardown]);

  return {
    messages,
    isConnected,
    isRunning,
    awaitingInput,
    currentRunId,
    sendMessage,
    sendAnswer,
    connect,
    disconnect: teardown,
  };
}

import {useCallback, useEffect, useRef, useState} from 'react'

// =============================================================================
// Types — matches the WebSocket protocol from the backend
// =============================================================================

export interface QuestionOption {
  value: string
  label: string
  description?: string
}

export interface ConversationMessage {
  id: string
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
    | 'user_message'
  sender: string
  content: string
  questionId?: string
  options?: QuestionOption[]
  selectionType?: 'radio' | 'checkbox'
  tool?: string
  args?: Record<string, unknown>
  result?: string
  runId?: string
  output?: string
  message?: string
  status?: string
  replayed?: boolean
  isReply?: boolean
  timestamp: string
}

export interface UseStudioConversationOptions {
  /** Base URL of the FastAPI backend (e.g. http://localhost:8000) */
  apiUrl: string
  onMessage?: (msg: ConversationMessage) => void
  onComplete?: (output: string, runId: string) => void
  onError?: (msg: string) => void
  onQuestion?: (msg: ConversationMessage) => void
}

export interface UseStudioConversationReturn {
  messages: ConversationMessage[]
  isConnected: boolean
  isRunning: boolean
  awaitingInput: boolean
  currentRunId: string | null
  sendMessage: (content: string) => void
  sendAnswer: (content: string, questionId?: string, displayContent?: string) => void
  connect: () => void
  disconnect: () => void
}

// =============================================================================
// Hook
// =============================================================================

export function useStudioConversation(
  conversationId: string | null,
  options: UseStudioConversationOptions,
): UseStudioConversationReturn {
  const {apiUrl, onMessage, onComplete, onError, onQuestion} = options

  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [awaitingInput, setAwaitingInput] = useState(false)
  const [currentRunId, setCurrentRunId] = useState<string | null>(null)

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const attemptsRef = useRef(0)
  const maxAttempts = 3
  const [connectEpoch, setConnectEpoch] = useState(0)
  const connectedIdRef = useRef<string | null>(null)
  const intentionalCloseRef = useRef(false)

  // Stable refs for callbacks
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete
  const onErrorRef = useRef(onError)
  onErrorRef.current = onError
  const onQuestionRef = useRef(onQuestion)
  onQuestionRef.current = onQuestion

  const teardown = useCallback(() => {
    intentionalCloseRef.current = true
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current)
      reconnectTimer.current = null
    }
    const ws = wsRef.current
    if (ws) {
      wsRef.current = null
      ws.onopen = null
      ws.onclose = null
      ws.onerror = null
      ws.onmessage = null
      ws.close()
    }
    connectedIdRef.current = null
    setIsConnected(false)
  }, [])

  // Derive WS URL from the HTTP API URL
  const wsBase = apiUrl.replace(/^http/, 'ws')

  useEffect(() => {
    if (!conversationId) {
      teardown()
      setMessages([])
      setIsRunning(false)
      setAwaitingInput(false)
      setCurrentRunId(null)
      return
    }

    if (connectedIdRef.current === conversationId && wsRef.current) {
      return
    }

    teardown()
    attemptsRef.current = 0
    setMessages([])
    setIsRunning(false)
    setAwaitingInput(false)
    setCurrentRunId(null)

    const openSocket = () => {
      intentionalCloseRef.current = false
      setMessages([])

      const url = `${wsBase}/api/conversations/${conversationId}/ws`
      const ws = new WebSocket(url)
      wsRef.current = ws
      connectedIdRef.current = conversationId

      let pingInterval: ReturnType<typeof setInterval> | null = null

      ws.onopen = () => {
        setIsConnected(true)
        attemptsRef.current = 0
        pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({type: 'ping'}))
          }
        }, 25_000)
      }

      ws.onclose = () => {
        if (pingInterval) clearInterval(pingInterval)
        setIsConnected(false)
        if (!intentionalCloseRef.current && attemptsRef.current < maxAttempts) {
          attemptsRef.current++
          const delay = Math.min(1000 * 2 ** attemptsRef.current, 10_000)
          reconnectTimer.current = setTimeout(openSocket, delay)
        }
      }

      ws.onerror = () => {
        // onclose fires after — reconnect logic lives there
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as ConversationMessage
          const msg: ConversationMessage = {
            ...data,
            id:
              data.id ||
              `${data.type}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          }

          if (msg.replayed) {
            setMessages((prev) => [...prev, msg])
            return
          }

          switch (msg.type) {
            case 'question':
              setAwaitingInput(true)
              setIsRunning(false)
              onQuestionRef.current?.(msg)
              break
            case 'status':
              if (msg.status === 'running') {
                setIsRunning(true)
                setAwaitingInput(false)
                if (msg.runId) setCurrentRunId(msg.runId)
              }
              break
            case 'complete':
              setIsRunning(false)
              setAwaitingInput(false)
              if (msg.output && msg.runId) {
                onCompleteRef.current?.(msg.output, msg.runId)
              }
              break
            case 'error':
              setIsRunning(false)
              onErrorRef.current?.(msg.message || msg.content || 'Unknown error')
              break
            case 'thinking':
            case 'agent_message':
            case 'tool_call':
            case 'tool_result':
              setIsRunning(true)
              break
            case 'system':
              break
          }

          setMessages((prev) => [...prev, msg])
          onMessageRef.current?.(msg)
        } catch (err) {
          console.error('Failed to parse WS message:', err)
        }
      }
    }

    openSocket()

    return () => {
      teardown()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, connectEpoch, wsBase])

  const sendMessage = useCallback((content: string) => {
    const ws = wsRef.current
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({type: 'user_message', content}))
      const msg: ConversationMessage = {
        id: `user-${Date.now()}`,
        type: 'user_message',
        sender: 'user',
        content,
        timestamp: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, msg])
      setAwaitingInput(false)
    }
  }, [])

  const sendAnswer = useCallback(
    (content: string, questionId?: string, displayContent?: string) => {
      const ws = wsRef.current
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({type: 'answer', content, questionId}))
        const visibleContent = displayContent ?? content
        if (visibleContent) {
          const msg: ConversationMessage = {
            id: `answer-${Date.now()}`,
            type: 'answer',
            sender: 'user',
            content: visibleContent,
            timestamp: new Date().toISOString(),
          }
          setMessages((prev) => [...prev, msg])
        }
        setAwaitingInput(false)
      }
    },
    [],
  )

  const connect = useCallback(() => {
    connectedIdRef.current = null
    teardown()
    setConnectEpoch((e) => e + 1)
  }, [teardown])

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
  }
}

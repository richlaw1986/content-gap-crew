'use client';

import { useState, useCallback, useEffect } from 'react';
import { ChatArea, ChatHistory, AgentActivityFeed } from '@/components/dashboard';
import type { SidebarConversation } from '@/components/dashboard';
import { ToastContainer } from '@/components/ui';
import { useToast, useConversation } from '@/lib/hooks';
import { api, ConversationSummary } from '@/lib/api';

export default function DashboardPage() {
  // ── Conversation list ─────────────────────────────────────
  const [conversations, setConversations] = useState<SidebarConversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const { toasts, dismissToast, success, error: showError } = useToast();

  // Fetch conversation list from backend
  const fetchConversations = useCallback(async () => {
    try {
      const data = await api.conversations.list();
      const mapped: SidebarConversation[] = data.map((c: ConversationSummary) => ({
        id: c._id,
        title: c.title || 'New Conversation',
        status: c.status || 'active',
        createdAt: c._createdAt || new Date().toISOString(),
      }));
      setConversations(mapped);
    } catch (err) {
      console.error('Failed to fetch conversations:', err);
    }
  }, []);

  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, 30_000);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  // ── WebSocket conversation connection ──────────────────────
  const {
    messages,
    isConnected,
    isRunning,
    awaitingInput,
    currentRunId,
    sendMessage,
    sendAnswer,
  } = useConversation(activeConvId, {
    onComplete: (_output, _runId) => {
      success('Run Complete', 'Crew finished successfully.');
      fetchConversations(); // refresh sidebar
    },
    onError: (msg) => {
      showError('Error', msg);
    },
  });

  // ── Handlers ──────────────────────────────────────────────

  const handleNewChat = useCallback(async () => {
    try {
      const resp = await api.conversations.create('New Conversation');
      setActiveConvId(resp.id);
      fetchConversations();
    } catch (err) {
      console.error('Failed to create conversation:', err);
      showError('Error', 'Could not create a new conversation.');
    }
  }, [fetchConversations, showError]);

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConvId(id);
  }, []);

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      // Optimistically remove from local state
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConvId === id) {
        setActiveConvId(null);
      }
      // Delete from Sanity (conversation + associated runs)
      try {
        await api.conversations.delete(id);
      } catch (err) {
        console.error('Failed to delete conversation:', err);
        showError('Error', 'Could not delete the conversation.');
        fetchConversations(); // re-fetch to restore the list
      }
    },
    [activeConvId, fetchConversations, showError],
  );

  const handleSendMessage = useCallback(
    async (content: string) => {
      if (!activeConvId) {
        // Auto-create a conversation when user sends the first message
        try {
          const resp = await api.conversations.create(content.slice(0, 80));
          setActiveConvId(resp.id);
          fetchConversations();
          // Need to send after WS connects — useConversation will auto-connect
          // and the user can re-send. For now, queue it by writing directly after
          // a short delay to let WS connect.
          setTimeout(() => sendMessage(content), 500);
        } catch {
          showError('Error', 'Could not create conversation.');
        }
        return;
      }
      sendMessage(content);
    },
    [activeConvId, sendMessage, fetchConversations, showError],
  );

  const handleSendAnswer = useCallback(
    (content: string, questionId?: string, displayContent?: string) => {
      sendAnswer(content, questionId, displayContent);
    },
    [sendAnswer],
  );

  return (
    <>
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Left sidebar */}
      <ChatHistory
        conversations={conversations}
        activeId={activeConvId}
        onSelect={handleSelectConversation}
        onNew={handleNewChat}
        onDelete={handleDeleteConversation}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((p) => !p)}
      />

      {/* Main area */}
      <main className="flex-1 min-w-0 overflow-y-auto bg-background">
        <div className="h-full flex flex-col lg:flex-row">
          {/* Chat */}
          <div className="flex-1 min-w-0">
            <ChatArea
              messages={messages}
              isConnected={isConnected}
              isRunning={isRunning}
              awaitingInput={awaitingInput}
              onSendMessage={handleSendMessage}
              onSendAnswer={handleSendAnswer}
            />
          </div>

          {/* Sidebar: run overview + outputs */}
          <div className="lg:w-96 border-t lg:border-t-0 lg:border-l border-border p-4 bg-surface-muted overflow-y-auto">
            <AgentActivityFeed
              messages={messages}
              isConnected={isConnected}
              isRunning={isRunning}
              currentRunId={currentRunId}
            />
          </div>
        </div>
      </main>
    </>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';

// =============================================================================
// Types
// =============================================================================

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'agent';
  agentName?: string;
  content: string;
  timestamp: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: 'active' | 'completed' | 'failed' | 'awaiting_input';
  runId?: string | null;
  messages: ChatMessage[];
}

// =============================================================================
// localStorage helpers
// =============================================================================

const STORAGE_KEY = 'agent-studio-conversations';
const MAX_CONVERSATIONS = 100;

function readConversations(): Conversation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeConversations(conversations: Conversation[]) {
  if (typeof window === 'undefined') return;
  // Keep only the most recent MAX_CONVERSATIONS
  const trimmed = conversations.slice(0, MAX_CONVERSATIONS);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
}

// =============================================================================
// Hook
// =============================================================================

export interface UseChatHistoryReturn {
  conversations: Conversation[];
  activeId: string | null;
  activeConversation: Conversation | null;
  createConversation: (title: string) => Conversation;
  selectConversation: (id: string) => void;
  updateConversation: (id: string, patch: Partial<Omit<Conversation, 'id' | 'createdAt'>>) => void;
  deleteConversation: (id: string) => void;
  clearActive: () => void;
}

export function useChatHistory(): UseChatHistoryReturn {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    setConversations(readConversations());
  }, []);

  // Persist whenever conversations change (skip initial empty render)
  useEffect(() => {
    if (conversations.length > 0 || readConversations().length > 0) {
      writeConversations(conversations);
    }
  }, [conversations]);

  const createConversation = useCallback((title: string): Conversation => {
    const now = new Date().toISOString();
    const conv: Conversation = {
      id: `conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: title.length > 80 ? title.slice(0, 80) + '…' : title,
      createdAt: now,
      updatedAt: now,
      status: 'active',
      runId: null,
      messages: [],
    };
    setConversations((prev) => [conv, ...prev]);
    setActiveId(conv.id);
    return conv;
  }, []);

  const selectConversation = useCallback((id: string) => {
    setActiveId(id);
  }, []);

  const updateConversation = useCallback(
    (id: string, patch: Partial<Omit<Conversation, 'id' | 'createdAt'>>) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.id === id
            ? { ...c, ...patch, updatedAt: new Date().toISOString() }
            : c
        )
      );
    },
    []
  );

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) setActiveId(null);
    },
    [activeId]
  );

  const clearActive = useCallback(() => {
    setActiveId(null);
  }, []);

  const activeConversation = activeId
    ? conversations.find((c) => c.id === activeId) ?? null
    : null;

  return {
    conversations,
    activeId,
    activeConversation,
    createConversation,
    selectConversation,
    updateConversation,
    deleteConversation,
    clearActive,
  };
}

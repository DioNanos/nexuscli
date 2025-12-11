import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import useAutoSTT from '../hooks/useAutoSTT';
import Message from './Message';
import StatusLine from './StatusLine';
import ModelSelector from './ModelSelector';
import Sidebar from './Sidebar';
import AttachMenu from './AttachMenu';
import Icon from './Icon';
import ContextSummary from './ContextSummary';
import './Chat.css';

function Chat() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [messages, setMessages] = useState([]);
  const [statusEvents, setStatusEvents] = useState([]);
  const [input, setInput] = useState('');
  const [conversationId, setConversationId] = useState(null);
  const [conversationTitle, setConversationTitle] = useState('New Chat');
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('claude-sonnet-4-5-20250929');
  const [pendingPreferredModel, setPendingPreferredModel] = useState(null);
  const [reasoningEffort, setReasoningEffort] = useState('high');
  const [thinkMode, setThinkMode] = useState('think');
  const [cliTools, setCliTools] = useState({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentDirectory, setCurrentDirectory] = useState('');
  const [workspacePath, setWorkspacePath] = useState('');
  const [workspaces, setWorkspaces] = useState([]);
  const [sessionsGrouped, setSessionsGrouped] = useState(null);
  const [summary, setSummary] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [pagination, setPagination] = useState({ hasMore: false, oldestTimestamp: null });
  const [loadingMore, setLoadingMore] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // Speech-to-Text hook
  const handleSTTResult = useCallback((text) => {
    setInput(prev => prev + (prev ? ' ' : '') + text);
  }, []);

  const handleSTTError = useCallback((error) => {
    console.error('[STT]', error);
  }, []);

  const {
    isListening,
    isSupported: isSTTSupported,
    transcript,
    interimTranscript,
    toggleListening,
    resetTranscript,
    provider: sttProvider
  } = useAutoSTT({
    language: 'it-IT', // Fallback for browser STT; OpenAI uses i18n language
    onResult: handleSTTResult,
    onError: handleSTTError
  });

  // Helper: normalize workspace path (remove trailing slash)
  const normalizePath = (path) => {
    if (!path || path === '/') return path;
    return path.replace(/\/+$/, '');
  };

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [input]);

  // Load workspace from localStorage or fetch from backend
  useEffect(() => {
    const loadWorkspace = async () => {
      // Try to restore from localStorage first
      const savedWorkspace = localStorage.getItem('nexuscli_workspace');
      if (savedWorkspace) {
        // Normalize to prevent trailing slash issues
        const normalized = normalizePath(savedWorkspace);
        console.log('[Chat] Restored workspace from localStorage:', normalized);
        setCurrentDirectory(normalized);
        setWorkspacePath(normalized);
        // Update localStorage if path was normalized
        if (normalized !== savedWorkspace) {
          localStorage.setItem('nexuscli_workspace', normalized);
        }
        return;
      }

      // Fallback: fetch backend default workspace
      try {
        const res = await fetch('/api/v1/workspace');
        const data = await res.json();
        // Backend returns validated workspace (creates if needed, or uses HOME)
        const workspace = data.current || data.home;
        console.log('[Chat] Loaded workspace from backend:', workspace);
        setCurrentDirectory(workspace);
        setWorkspacePath(workspace);
        localStorage.setItem('nexuscli_workspace', workspace);
      } catch (error) {
        console.error('Failed to fetch workspace:', error);
        // No hardcoded fallback - wait for backend
        console.warn('[Chat] Backend not available, workspace not set');
      }
    };

    loadWorkspace();
  }, []);

  const isModelAvailable = (modelId, tools) => {
    if (!modelId) return false;
    return Object.values(tools).some(cli =>
      (cli.models || []).some(m => m.id === modelId)
    );
  };

  // Load available CLI tools and models
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await fetch('/api/v1/models');
        const data = await res.json();
        setCliTools(data);
      } catch (error) {
        console.error('Failed to fetch models:', error);
      }
    };
    fetchModels();
  }, []);

  // Apply pending preferred model once models are available
  useEffect(() => {
    if (!pendingPreferredModel) return;
    const available = isModelAvailable(pendingPreferredModel, cliTools);
    if (available) {
      console.log('[Chat] Applying preferred model from config:', pendingPreferredModel);
      setSelectedModel(pendingPreferredModel);
      setPendingPreferredModel(null);
      return;
    }
    // If models are loaded and still not available, drop the pending value
    if (Object.keys(cliTools).length > 0) {
      console.warn('[Chat] Preferred model not available, keeping current:', pendingPreferredModel);
      setPendingPreferredModel(null);
    }
  }, [cliTools, pendingPreferredModel]);

  // Load user preferences (default model)
  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const res = await fetch('/api/v1/config');
        const data = await res.json();
        if (data.defaultModel) {
          if (isModelAvailable(data.defaultModel, cliTools)) {
            console.log('[Chat] Auto-selecting default model:', data.defaultModel);
            setSelectedModel(data.defaultModel);
          } else {
            // Store pending until models load or warn if unavailable
            setPendingPreferredModel(data.defaultModel);
          }
        }
      } catch (error) {
        console.error('Failed to fetch config:', error);
      }
    };
    fetchConfig();
  }, []);

  // Helper: get model info and determine endpoint
  const getModelInfo = (modelId) => {
    for (const [cliKey, cli] of Object.entries(cliTools)) {
      const model = cli.models?.find(m => m.id === modelId);
      if (model) {
        return { model, cli, cliKey, endpoint: cli.endpoint || '/api/v1/chat' };
      }
    }
    return { model: null, cli: null, cliKey: 'claude-code', endpoint: '/api/v1/chat' };
  };

  // Helper: get interrupt endpoint based on current model
  const getInterruptEndpoint = (modelId) => {
    const { cliKey } = getModelInfo(modelId);
    const endpoints = {
      'claude-code': '/api/v1/chat/interrupt',
      'gemini': '/api/v1/gemini/interrupt',
      'codex': '/api/v1/codex/interrupt'
    };
    return endpoints[cliKey] || '/api/v1/chat/interrupt';
  };

  // Handle interrupt/stop button click
  const handleInterrupt = async () => {
    const sessionToStop = sessionId || conversationId;
    if (!sessionToStop) {
      console.warn('[Chat] No active session to interrupt');
      return;
    }

    const endpoint = getInterruptEndpoint(selectedModel);
    console.log(`[Chat] Interrupting session ${sessionToStop} via ${endpoint}`);

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ sessionId: sessionToStop })
      });

      const data = await res.json();

      if (data.success) {
        console.log(`[Chat] Session interrupted via ${data.method}`);
        setIsLoading(false);
        setStatusEvents([]);

        // Add system message indicating interruption
        setMessages(prev => [...prev, {
          id: `system-${Date.now()}`,
          role: 'system',
          content: `⏹️ Generation stopped by user`,
          created_at: Date.now()
        }]);
      } else {
        console.warn(`[Chat] Interrupt failed: ${data.reason}`);
      }
    } catch (error) {
      console.error('[Chat] Interrupt request failed:', error);
    }
  };

  // Helper: generate title from first message (smart extraction)
  const generateTitle = (message) => {
    if (!message) return 'New Chat';

    // Clean up message
    let cleaned = message.replace(/\s+/g, ' ').trim();

    // Remove common prefixes that don't add meaning
    const prefixesToRemove = [
      /^(hey|hi|hello|ciao|please|can you|could you|would you|i want to|i need to|help me)\s+/i,
      /^(fammi|aiutami a|vorrei|puoi)\s+/i
    ];
    for (const prefix of prefixesToRemove) {
      cleaned = cleaned.replace(prefix, '');
    }

    // Remove file references like [Attached: /path/to/file]
    cleaned = cleaned.replace(/\[Attached:[^\]]+\]\s*/g, '').trim();

    // If still too short, use original
    if (cleaned.length < 5) {
      cleaned = message.replace(/\s+/g, ' ').trim();
    }

    // Capitalize first letter
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);

    // Max 60 chars, break at word boundary
    if (cleaned.length <= 60) return cleaned;
    const truncated = cleaned.substring(0, 60);
    const lastSpace = truncated.lastIndexOf(' ');
    return lastSpace > 25 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
  };

  // Refresh sessions for current workspace
  const refreshSessions = async () => {
    if (!token || !workspacePath) return;
    try {
      const encodedPath = workspacePath.replace(/\//g, '__');
      const res = await fetch(`/api/v1/workspaces/${encodedPath}/sessions?groupBy=date`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setSessionsGrouped(data);
      console.log('[Chat] Sessions refreshed');
    } catch (error) {
      console.error('[Chat] Failed to refresh sessions:', error);
    }
  };

  // Auto-rename conversation after first message
  const autoRenameConversation = async (conversationIdToRename, userMessage) => {
    if (!conversationIdToRename || !userMessage) return;
    const newTitle = generateTitle(userMessage);
    try {
      await fetch(`/api/v1/conversations/${conversationIdToRename}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title: newTitle })
      });
      setConversationTitle(newTitle);
      console.log('[Chat] Auto-renamed to:', newTitle);

      // Refresh sidebar to show new conversation
      await refreshSessions();
    } catch (error) {
      console.error('[Chat] Auto-rename failed:', error);
    }
  };

  // Load available workspaces from sessions table
  useEffect(() => {
    if (!token) return;

    const loadWorkspaces = async () => {
      try {
        const res = await fetch('/api/v1/workspaces', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        console.log('[Chat] Workspaces API response:', data);

        let workspacesList = data.workspaces || [];

        // Add current workspace to list if not already present
        const currentWorkspace = localStorage.getItem('nexuscli_workspace') || workspacePath;
        if (currentWorkspace) {
          const exists = workspacesList.some(ws => ws.workspace_path === currentWorkspace);
          if (!exists) {
            console.log('[Chat] Adding current workspace to list:', currentWorkspace);
            workspacesList = [{
              workspace_path: currentWorkspace,
              session_count: 0,
              last_activity: Date.now()
            }, ...workspacesList];
          }
        }

        // Filter out deprecated workspaces
        const deprecatedRaw = localStorage.getItem('nexuscli_deprecated_workspaces');
        const deprecated = deprecatedRaw ? JSON.parse(deprecatedRaw) : [];
        workspacesList = workspacesList.filter(ws => !deprecated.includes(ws.workspace_path));
        console.log('[Chat] Filtered deprecated workspaces:', deprecated);

        setWorkspaces(workspacesList);
        console.log('[Chat] Workspaces state set to:', workspacesList);
      } catch (error) {
        console.error('Failed to load workspaces:', error);
      }
    };

    loadWorkspaces();
  }, [token, workspacePath]);

  // Load sessions when workspacePath changes (and token available)
  // IMPORTANT: Always mount first to ensure sessions are indexed from filesystem
  useEffect(() => {
    const fetchSessionsForWorkspace = async () => {
      if (!token || !workspacePath) return;
      try {
        const encodedPath = workspacePath.replace(/\//g, '__');

        // Mount workspace first (indexes sessions from .claude/projects/)
        // This is idempotent - safe to call multiple times
        console.log('[Chat] Mounting workspace:', workspacePath);
        await fetch(`/api/v1/workspaces/${encodedPath}/mount`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });

        // Now fetch sessions (from freshly indexed DB)
        const res = await fetch(`/api/v1/workspaces/${encodedPath}/sessions?groupBy=date`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        setSessionsGrouped(data);
      } catch (error) {
        console.error('Failed to load workspace sessions:', error);
      }
    };

    fetchSessionsForWorkspace();
  }, [token, workspacePath]);

  // DO NOT auto-create conversation on mount
  // New chat just resets state; sessionId arrives after first message

  const loadSession = async (id, { loadMore = false, before } = {}) => {
    if (!token) return;

    try {
      // Ensure workspace is mounted first (idempotent - safe to call multiple times)
      // This fixes race condition when clicking conversation before workspace mount completes
      if (workspacePath) {
        const encodedPath = workspacePath.replace(/\//g, '__');
        await fetch(`/api/v1/workspaces/${encodedPath}/mount`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      }

      let url = `/api/v1/sessions/${id}/messages?limit=30`;
      if (before) {
        url += `&before=${before}`;
      }

      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();

      const msgs = data.messages || [];

      if (loadMore) {
        setMessages(prev => [...msgs, ...prev]);
      } else {
        setConversationId(data.session?.conversation_id || data.session?.id || id);
        setSessionId(data.session?.id || id);
        setConversationTitle(data.session?.title || 'Session');
        setMessages(msgs);
        setStatusEvents([]);
      }

      setPagination({
        hasMore: data.pagination?.hasMore || false,
        oldestTimestamp: data.pagination?.oldestTimestamp || null
      });
    } catch (error) {
      console.error('Failed to load session messages:', error);
    }
  };

  const fetchSessionSummary = async (id) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/v1/sessions/${id}/summary`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setSummary(data.summary || null);
    } catch (error) {
      console.error('Failed to load session summary:', error);
    }
  };

  const handleLoadMore = async () => {
    if (!sessionId || loadingMore || !pagination.hasMore) return;
    setLoadingMore(true);
    await loadSession(sessionId, { loadMore: true, before: pagination.oldestTimestamp });
    setLoadingMore(false);
  };

  const sendMessage = async (message) => {
    // conversationId is optional; backend will create session if null
    const convId = conversationId;
    const isNewConversation = !convId; // Track if this is a new conversation

    // Prepend attached file paths to message
    let fullMessage = message;
    if (attachedFiles.length > 0) {
      const fileRefs = attachedFiles.map(f => `[Attached: ${f.path}]`).join('\n');
      fullMessage = `${fileRefs}\n\n${message}`;
    }

    const userMsg = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: fullMessage,
      created_at: Date.now(),
      attachments: attachedFiles.length > 0 ? [...attachedFiles] : undefined
    };

    setMessages(prev => [...prev, userMsg]);
    setStatusEvents([]);
    setIsLoading(true);
    setAttachedFiles([]); // Clear attached files after sending

    // Determine endpoint based on model category
    const { endpoint, cliKey } = getModelInfo(selectedModel);
    const isCodex = cliKey === 'codex';
    let newSessionId = null; // Track new session ID for auto-rename

    try {
      const requestBody = {
        conversationId: convId,
        workspace: workspacePath,
        message: fullMessage,
        model: selectedModel
      };

      // Add reasoning effort for Codex models
      if (isCodex) {
        requestBody.reasoningEffort = reasoningEffort;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const eventData = JSON.parse(line.substring(6));

            if (eventData.type === 'session_created') {
              if (eventData.sessionId) {
                newSessionId = eventData.sessionId;
                setSessionId(eventData.sessionId);
                setConversationTitle('New Chat');
                setIsBookmarked(false);
                console.log('[Chat] Session created:', eventData.sessionId);
              }
              if (eventData.conversationId) {
                setConversationId(eventData.conversationId);
              } else if (eventData.sessionId && !conversationId) {
                setConversationId(eventData.sessionId);
              }
            } else if (eventData.type === 'message_start') {
              console.log('Message started:', eventData.messageId);
            } else if (eventData.type === 'status') {
              setStatusEvents(prev => [...prev, eventData]);
            } else if (eventData.type === 'message_done') {
              const assistantMsg = {
                id: eventData.messageId,
                role: 'assistant',
                content: eventData.content,
                created_at: Date.now(),
                engine: cliKey, // Track which CLI engine was used
                model: selectedModel,
                metadata: {
                  usage: eventData.usage
                }
              };

              setMessages(prev => [...prev, assistantMsg]);
              setIsLoading(false);

              // Get the session ID from event or captured newSessionId
              const conversationIdFromEvent = eventData.conversationId || conversationId || newSessionId;
              const sessionIdToUse = eventData.sessionId || newSessionId;

              if (sessionIdToUse) {
                setSessionId(sessionIdToUse);
              }

              if (conversationIdFromEvent) {
                setConversationId(conversationIdFromEvent);
              } else if (sessionIdToUse && !conversationId) {
                setConversationId(sessionIdToUse);
              }

              // Auto-rename for new conversations
              if (isNewConversation && (conversationIdFromEvent || conversationId)) {
                autoRenameConversation(conversationIdFromEvent || conversationId, message);
              }
            } else if (eventData.type === 'error') {
              setMessages(prev => [...prev, {
                id: `error-${Date.now()}`,
                role: 'assistant',
                content: `**Error**: ${eventData.error}`,
                created_at: Date.now()
              }]);
              setIsLoading(false);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages(prev => [...prev, {
        id: `error-${Date.now()}`,
        role: 'assistant',
        content: `**Error**: ${error.message}`,
        created_at: Date.now()
      }]);
      setIsLoading(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const message = input.trim();
    setInput('');
    sendMessage(message);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const newChat = () => {
    setConversationId(null);
    setSessionId(null);
    setConversationTitle('New Chat');
    setMessages([]);
    setStatusEvents([]);
    setSummary(null);
    setIsBookmarked(false);
    setPagination({ hasMore: false, oldestTimestamp: null });
  };

  const handleWorkspaceChange = async (nextWorkspace) => {
    if (!token) return;

    // Normalize path to prevent duplicates
    nextWorkspace = normalizePath(nextWorkspace);
    console.log('[Chat] Changing workspace to:', nextWorkspace);

    // Clear current conversation first
    setMessages([]);
    setSummary(null);
    setConversationId(null);
    setSessionId(null);
    setSessionsGrouped(null); // Clear sessions to show loading
    setStatusEvents([]);
    setConversationTitle('New Chat');
    setIsBookmarked(false);
    setPagination({ hasMore: false, oldestTimestamp: null });

    // Persist to localStorage
    localStorage.setItem('nexuscli_workspace', nextWorkspace);
    console.log('[Chat] Saved workspace to localStorage');

    // Remove from deprecated list if present (workspace is being used again)
    const deprecatedRaw = localStorage.getItem('nexuscli_deprecated_workspaces');
    if (deprecatedRaw) {
      const deprecated = JSON.parse(deprecatedRaw);
      const updated = deprecated.filter(w => w !== nextWorkspace);
      if (updated.length !== deprecated.length) {
        localStorage.setItem('nexuscli_deprecated_workspaces', JSON.stringify(updated));
        console.log('[Chat] Removed workspace from deprecated list');
      }
    }

    // Add workspace to list if not already present
    setWorkspaces(prevWorkspaces => {
      const exists = prevWorkspaces.some(ws =>
        (ws.workspace_path || ws.path) === nextWorkspace
      );
      if (!exists) {
        console.log('[Chat] Adding new workspace to list:', nextWorkspace);
        return [...prevWorkspaces, {
          workspace_path: nextWorkspace,
          session_count: 0,
          last_activity: Date.now()
        }];
      }
      return prevWorkspaces;
    });

    // Update workspacePath LAST - this triggers useEffect to fetch sessions
    // The useEffect at line ~205 handles mount + session loading
    setWorkspacePath(nextWorkspace);
    setCurrentDirectory(nextWorkspace);
    console.log('[Chat] Workspace state updated, useEffect will fetch sessions');
  };

  const handleDeprecateWorkspace = (workspacePath) => {
    console.log('[Chat] Deprecating workspace:', workspacePath);

    // Add to deprecated list in localStorage
    const deprecatedRaw = localStorage.getItem('nexuscli_deprecated_workspaces');
    const deprecated = deprecatedRaw ? JSON.parse(deprecatedRaw) : [];

    if (!deprecated.includes(workspacePath)) {
      deprecated.push(workspacePath);
      localStorage.setItem('nexuscli_deprecated_workspaces', JSON.stringify(deprecated));
      console.log('[Chat] Workspace added to deprecated list');
    }

    // Remove from UI list
    setWorkspaces(prevWorkspaces =>
      prevWorkspaces.filter(ws => ws.workspace_path !== workspacePath)
    );
  };

  const toggleBookmark = async () => {
    if (!conversationId) return;

    try {
      const res = await fetch(`/api/v1/conversations/${conversationId}/bookmark`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const { bookmarked } = await res.json();
      setIsBookmarked(bookmarked);
    } catch (error) {
      console.error('Failed to toggle bookmark:', error);
    }
  };

  // REMOVED: handleDirectoryChange - workspace selection now handled by handleWorkspaceChange
  // Sessions are created with --cwd set to workspace, not changed mid-session

  return (
    <div className="chat-container">
      {/* Sidebar */}
      <Sidebar
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        currentConversationId={conversationId}
        onSelectConversation={(id) => {
          loadSession(id);
          // Load summary separately
          fetchSessionSummary(id);
          setSidebarOpen(false);
        }}
        onNewConversation={newChat}
        currentWorkspace={workspacePath}
        onWorkspaceChange={handleWorkspaceChange}
        sessions={sessionsGrouped}
      />

      {/* Main Chat Area */}
      <div className="chat-main">
        {/* Header */}
        <div className="chat-header">
          <button className="hamburger-btn" onClick={() => setSidebarOpen(!sidebarOpen)} title="Chat list" aria-label="Open chat list">
            <Icon name="PanelLeft" size={24} />
          </button>
          <ModelSelector
            selectedModel={selectedModel}
            onSelectModel={setSelectedModel}
            thinkMode={thinkMode}
            onThinkModeChange={setThinkMode}
            reasoningLevel={reasoningEffort}
            onReasoningLevelChange={setReasoningEffort}
          />
          {!sidebarOpen && (
            <button className="new-chat-btn" onClick={newChat} title="New Chat" aria-label="New Chat">
              <Icon name="SquarePen" size={20} />
            </button>
          )}
        </div>

        {/* Messages Container */}
        <div className="messages-container">
          {summary && <ContextSummary summary={summary} />}
          {messages.length === 0 ? (
            <div className="welcome-screen">
              <div className="terminal-icon">&gt;_</div>
              <h2>{t('welcome.title')}</h2>
              <p>{t('welcome.subtitle')}</p>
            </div>
          ) : (
            <>
              {pagination.hasMore && (
                <div className="load-more-container">
                  <button
                    className="load-more-btn"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? (
                      <>
                        <Icon name="Loader" size={16} className="spinning" />
                        Loading...
                      </>
                    ) : (
                      <>
                        <Icon name="ChevronUp" size={16} />
                        Load {Math.min(50, pagination.total - messages.length)} older messages
                      </>
                    )}
                  </button>
                  <span className="message-count">
                    Showing {messages.length} of {pagination.total} messages
                  </span>
                </div>
              )}
              {messages.map(msg => (
                <Message key={msg.id} message={msg} />
              ))}
            </>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Status Line - Shows tool execution in real-time + working directory */}
        <StatusLine
          statusEvents={statusEvents}
          isLoading={isLoading}
          currentDirectory={workspacePath}
          onDirectoryChange={handleWorkspaceChange}
          onDeprecateWorkspace={handleDeprecateWorkspace}
          workspaces={workspaces}
        />

        {/* Input Area */}
        <form className="input-container" onSubmit={handleSubmit}>
          {/* Attached Files Preview */}
          {attachedFiles.length > 0 && (
            <div className="attached-files-preview">
              {attachedFiles.map((file, idx) => (
                <div key={idx} className="attached-file-item">
                  <Icon name={file.mimeType?.startsWith('image/') ? 'Image' : 'File'} size={14} />
                  <span className="file-name">{file.originalName}</span>
                  <button
                    type="button"
                    className="remove-file-btn"
                    onClick={() => setAttachedFiles(prev => prev.filter((_, i) => i !== idx))}
                  >
                    <Icon name="X" size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="input-row">
            <div className="input-actions-left">
              <AttachMenu onFileAttached={(file) => setAttachedFiles(prev => [...prev, file])} />
            </div>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={isListening ? 'Listening...' : t('chat.inputPlaceholder')}
              disabled={isLoading}
              className="message-textarea"
              rows={1}
            />

            <div className="input-actions-right">
              {isSTTSupported && !isLoading && (
                <button
                  type="button"
                  className={`icon-btn microphone-btn ${isListening ? 'listening' : ''}`}
                  onClick={toggleListening}
                  title={isListening ? 'Stop listening' : 'Voice input'}
                  aria-label={isListening ? 'Stop listening' : 'Voice input'}
                >
                  <Icon name={isListening ? 'MicOff' : 'Mic'} size={20} />
                </button>
              )}
              {isLoading ? (
                <button
                  type="button"
                  className="stop-btn"
                  onClick={handleInterrupt}
                  title="Stop generation (ESC)"
                  aria-label="Stop generation"
                >
                  <Icon name="Square" size={20} />
                </button>
              ) : (
                <button
                  type="submit"
                  className="send-btn"
                  disabled={!input.trim() && attachedFiles.length === 0}
                  title="Send message"
                  aria-label="Send message"
                >
                  <Icon name="ArrowUp" size={20} />
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Chat;

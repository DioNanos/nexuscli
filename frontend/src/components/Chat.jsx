import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import useSpeechToText from '../hooks/useSpeechToText';
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
  const [reasoningEffort, setReasoningEffort] = useState('high');
  const [thinkMode, setThinkMode] = useState('think');
  const [cliTools, setCliTools] = useState({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentDirectory, setCurrentDirectory] = useState('');
  const [workspacePath, setWorkspacePath] = useState('');
  const [workspaces, setWorkspaces] = useState([]);
  const [sessionsGrouped, setSessionsGrouped] = useState(null);
  const [summary, setSummary] = useState(null);
  const [pagination, setPagination] = useState({ hasMore: false, oldestTimestamp: null });
  const [loadingMore, setLoadingMore] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const initialLoadDoneRef = useRef(false);

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
    resetTranscript
  } = useSpeechToText({
    language: 'it-IT',
    onResult: handleSTTResult,
    onError: handleSTTError
  });

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
        console.log('[Chat] Restored workspace from localStorage:', savedWorkspace);
        setCurrentDirectory(savedWorkspace);
        setWorkspacePath(savedWorkspace);
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

  // Helper: generate title from first message (max 50 chars, word boundary)
  const generateTitle = (message) => {
    if (!message) return 'New Chat';
    const cleaned = message.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= 50) return cleaned;
    const truncated = cleaned.substring(0, 50);
    const lastSpace = truncated.lastIndexOf(' ');
    return lastSpace > 20 ? truncated.substring(0, lastSpace) + '...' : truncated + '...';
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
  const autoRenameConversation = async (sessionId, userMessage) => {
    if (!sessionId || !userMessage) return;
    const newTitle = generateTitle(userMessage);
    try {
      await fetch(`/api/v1/conversations/${sessionId}`, {
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

  // Auto-select first session when workspace sessions load (FIXES P3)
  // Only on initial load - not when sessions refresh after new conversation
  useEffect(() => {
    if (!sessionsGrouped) return;

    // Skip auto-select if we already have a conversation (e.g., after refresh)
    if (initialLoadDoneRef.current && conversationId) {
      console.log('[Chat] Skipping auto-select - already have conversation:', conversationId);
      return;
    }

    // Find first session across groups: today → yesterday → last7days → last30days → older
    const groups = ['today', 'yesterday', 'last7days', 'last30days', 'older'];
    let firstSession = null;

    for (const group of groups) {
      if (sessionsGrouped[group] && sessionsGrouped[group].length > 0) {
        firstSession = sessionsGrouped[group][0];
        break;
      }
    }

    if (firstSession && firstSession.id) {
      console.log('[Chat] Auto-selecting first session:', firstSession.id, firstSession.title);
      loadSession(firstSession.id);
    } else {
      console.log('[Chat] No sessions found in workspace - creating new chat');
      setConversationId(null);
      setConversationTitle('New Chat');
      setMessages([]);
      setStatusEvents([]);
    }

    initialLoadDoneRef.current = true;
  }, [sessionsGrouped]);

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
        setConversationId(data.session?.id || id);
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
    if (!conversationId || loadingMore || !pagination.hasMore) return;
    setLoadingMore(true);
    await loadSession(conversationId, { loadMore: true, before: pagination.oldestTimestamp });
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
                setConversationId(eventData.sessionId);
                setConversationTitle('New Chat');
                setIsBookmarked(false);
                console.log('[Chat] Session created:', eventData.sessionId);
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
                metadata: {
                  usage: eventData.usage
                }
              };

              setMessages(prev => [...prev, assistantMsg]);
              setIsLoading(false);

              // Get the session ID from event or captured newSessionId
              const sessionIdToUse = eventData.sessionId || newSessionId;
              if (sessionIdToUse && !conversationId) {
                setConversationId(sessionIdToUse);
              }

              // Auto-rename for new conversations
              if (isNewConversation && sessionIdToUse) {
                autoRenameConversation(sessionIdToUse, message);
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
    setConversationTitle('New Chat');
    setMessages([]);
    setStatusEvents([]);
    setSummary(null);
    setIsBookmarked(false);
    setPagination({ hasMore: false, oldestTimestamp: null });
  };

  const handleWorkspaceChange = async (nextWorkspace) => {
    if (!token) return;

    console.log('[Chat] Changing workspace to:', nextWorkspace);

    // Reset initial load flag for new workspace auto-select
    initialLoadDoneRef.current = false;

    // Clear current conversation first
    setMessages([]);
    setSummary(null);
    setConversationId(null);
    setSessionsGrouped(null); // Clear sessions to show loading

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
              {isSTTSupported && (
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
              <button
                type="submit"
                className="send-btn"
                disabled={(!input.trim() && attachedFiles.length === 0) || isLoading}
                title="Send message"
                aria-label="Send message"
              >
                <Icon name="ArrowUp" size={20} />
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Chat;

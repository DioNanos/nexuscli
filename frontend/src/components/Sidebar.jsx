import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import UserMenu from './UserMenu';
import Icon from './Icon';
import DropdownMenu from './DropdownMenu';
import DeleteConfirmModal from './DeleteConfirmModal';
import './Sidebar.css';

// Cache for conversations (module-level for persistence across re-renders)
const conversationsCache = {
  data: null,
  timestamp: 0,
  workspace: null,
  TTL: 30000 // 30 seconds cache
};

// Export function to invalidate cache (used when new chat created)
export function invalidateConversationsCache() {
  conversationsCache.timestamp = 0;
  conversationsCache.data = null;
}

export default function Sidebar({
  isOpen,
  onClose,
  currentConversationId,
  onSelectConversation,
  onNewConversation,
  currentWorkspace,
  onWorkspaceChange,
  sessions // optional pre-grouped sessions from workspace
}) {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const [conversations, setConversations] = useState({
    today: [],
    yesterday: [],
    last7days: [],
    last30days: [],
    older: []
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [conversationToDelete, setConversationToDelete] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const getEngineStyle = (engine) => {
    const normalized = (engine || '').toLowerCase();
    if (normalized.includes('codex') || normalized.includes('openai')) {
      return { icon: 'Code2', color: '#00D26A', className: 'codex', label: 'Codex' };
    }
    if (normalized.includes('gemini') || normalized.includes('google')) {
      return { icon: 'Sparkles', color: '#4285F4', className: 'gemini', label: 'Gemini' };
    }
    if (normalized.includes('qwen')) {
      return { icon: 'Cpu', color: '#D32F2F', className: 'qwen', label: 'QWEN' };
    }
    return { icon: 'Terminal', color: '#FF6B35', className: 'claude', label: 'Claude' };
  };

  // Load conversations grouped by date when no workspace sessions provided
  useEffect(() => {
    console.log('[Sidebar] useEffect triggered - sessions:', sessions ? 'has data' : 'null', 'isOpen:', isOpen, 'token:', !!token);

    if (sessions) {
      console.log('[Sidebar] Using sessions prop:', Object.keys(sessions).map(k => `${k}:${sessions[k]?.length || 0}`).join(', '));
      setConversations(sessions);
      setIsLoading(false);
      setHasLoadedOnce(true);
      return;
    }

    // Wait for token - will re-run when token becomes available
    if (!token) {
      console.log('[Sidebar] Waiting for token...');
      return;
    }

    // Skip if sidebar not open (but allow first load when opening)
    if (!isOpen && hasLoadedOnce) {
      console.log('[Sidebar] Sidebar closed, skipping fetch');
      return;
    }

    // Check cache first
    const now = Date.now();
    const cacheValid = conversationsCache.data &&
      conversationsCache.workspace === currentWorkspace &&
      (now - conversationsCache.timestamp) < conversationsCache.TTL;

    if (cacheValid) {
      setConversations(conversationsCache.data);
      return;
    }

    const loadConversations = async () => {
      setIsLoading(true);
      try {
        const url = currentWorkspace
          ? `/api/v1/conversations?groupBy=date&workspace=${encodeURIComponent(currentWorkspace)}`
          : '/api/v1/conversations?groupBy=date';

        const res = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        const data = await res.json();

        // Update cache
        conversationsCache.data = data;
        conversationsCache.timestamp = Date.now();
        conversationsCache.workspace = currentWorkspace;

        setConversations(data);
        setHasLoadedOnce(true);
      } catch (error) {
        console.error('Failed to load conversations:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadConversations();
  }, [token, isOpen, sessions, currentWorkspace, hasLoadedOnce]);

  // Filter conversations by search term
  const filterConversations = (convList) => {
    if (!convList || !Array.isArray(convList)) return [];
    if (!searchTerm) return convList;
    return convList.filter(conv =>
      conv.title.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  // Handle conversation click
  const handleSelect = (conversationId) => {
    onSelectConversation(conversationId);
    if (window.innerWidth < 768) {
      onClose(); // Close sidebar on mobile after selection
    }
  };

  // Handle edit title
  const handleEditStart = (conversation) => {
    setEditingId(conversation.id);
    setEditTitle(conversation.title);
  };

  const handleEditSave = async (conversationId) => {
    // Guard: Don't try to save if conversationId is null or empty
    if (!conversationId || conversationId === 'null') {
      console.warn('[Sidebar] Attempted to save title with null conversationId');
      setEditingId(null);
      return;
    }

    try {
      await fetch(`/api/v1/conversations/${conversationId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ title: editTitle })
      });

      // Update local state
      setConversations(prev => {
        const newConv = {...prev};
        Object.keys(newConv).forEach(key => {
          newConv[key] = newConv[key].map(conv =>
            conv.id === conversationId ? {...conv, title: editTitle} : conv
          );
        });
        return newConv;
      });

      setEditingId(null);
    } catch (error) {
      console.error('Failed to update title:', error);
    }
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditTitle('');
  };

  // Handle delete conversation - Open modal
  const handleDeleteClick = (conversationId) => {
    setConversationToDelete(conversationId);
    setDeleteModalOpen(true);
  };

  // Confirm delete conversation/session
  const handleDeleteConfirm = async () => {
    if (!conversationToDelete) return;

    try {
      // Use sessions endpoint (SYNC DELETE - removes DB record AND .jsonl file)
      await fetch(`/api/v1/sessions/${conversationToDelete}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      // Remove from local state
      setConversations(prev => {
        const newConv = {...prev};
        Object.keys(newConv).forEach(key => {
          newConv[key] = newConv[key].filter(conv => conv.id !== conversationToDelete);
        });
        return newConv;
      });

      // If deleted current conversation, create new one
      if (conversationToDelete === currentConversationId) {
        onNewConversation();
      }

      setDeleteModalOpen(false);
      setConversationToDelete(null);
    } catch (error) {
      console.error('Failed to delete conversation:', error);
      setDeleteModalOpen(false);
      setConversationToDelete(null);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteModalOpen(false);
    setConversationToDelete(null);
  };

  // Handle pin toggle
  const handlePin = async (conversationId, e) => {
    e.stopPropagation();

    try {
      const res = await fetch(`/api/v1/conversations/${conversationId}/pin`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const { pinned } = await res.json();

      // Update local state
      setConversations(prev => {
        const newConv = {...prev};
        Object.keys(newConv).forEach(key => {
          newConv[key] = newConv[key].map(conv =>
            conv.id === conversationId
              ? {...conv, metadata: {...conv.metadata, pinned}}
              : conv
          );
        });
        return newConv;
      });
    } catch (error) {
      console.error('Failed to toggle pin:', error);
    }
  };

  // Render conversation item
  const renderConversation = (conversation) => {
    const isActive = conversation.id === currentConversationId;
    const isPinned = conversation.metadata?.pinned;
    const isEditing = editingId === conversation.id;
    const engineStyle = getEngineStyle(conversation.engine);

    // Ensure title is not empty (fallback if missing from backend)
    const title = conversation.title || 'Untitled Conversation';
    if (!title || title.trim() === '') {
      console.warn('[Sidebar] Empty title for conversation:', conversation.id);
    }

    // Build dropdown menu items
    const menuItems = [
      {
        label: 'Rename',
        icon: 'Pencil',
        onClick: () => handleEditStart(conversation)
      },
      {
        label: isPinned ? 'Unpin' : 'Pin',
        icon: 'Pin',
        onClick: (e) => {
          const fakeEvent = { stopPropagation: () => {} };
          handlePin(conversation.id, fakeEvent);
        }
      },
      {
        label: 'Delete',
        icon: 'Trash2',
        danger: true,
        onClick: () => handleDeleteClick(conversation.id)
      }
    ];

    return (
      <div
        key={conversation.id}
        className={`conversation-item ${isActive ? 'active' : ''}`}
        onClick={() => !isEditing && handleSelect(conversation.id)}
        role="listitem"
        aria-label={conversation.title}
        tabIndex={0}
      >
        {isEditing ? (
          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleEditSave(conversation.id);
              if (e.key === 'Escape') handleEditCancel();
            }}
            onBlur={() => handleEditSave(conversation.id)}
            autoFocus
            className="conversation-title-edit"
          />
        ) : (
          <>
            <Icon
              name={engineStyle.icon}
              size={18}
              className={`conversation-icon ${engineStyle.className}`}
              style={{ color: engineStyle.color }}
              title={engineStyle.label}
            />
            <div className="conversation-title-wrapper">
              <span className="conversation-title">{title}</span>
              <div className="fade-gradient" aria-hidden="true"></div>
            </div>
            <div className="conversation-actions">
              <DropdownMenu items={menuItems} align="right" />
            </div>
          </>
        )}
      </div>
    );
  };

  // Get pinned conversations from all groups
  const getPinnedConversations = () => {
    const allConversations = [
      ...conversations.today,
      ...conversations.yesterday,
      ...conversations.last7days,
      ...conversations.last30days,
      ...conversations.older
    ];
    return filterConversations(allConversations.filter(conv => conv.metadata?.pinned));
  };

  // Render conversation group
  const renderGroup = (title, convList, excludePinned = false) => {
    let filtered = filterConversations(convList);

    // Exclude pinned conversations from regular groups
    if (excludePinned) {
      filtered = filtered.filter(conv => !conv.metadata?.pinned);
    }

    if (filtered.length === 0) return null;

    return (
      <div className="conversation-group">
        <div className="group-title">{title}</div>
        {filtered.map(renderConversation)}
      </div>
    );
  };

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div className="sidebar-overlay" onClick={onClose} />
      )}

      {/* Sidebar */}
      <div className={`sidebar ${isOpen ? 'open' : ''}`}>
        {/* Search Bar */}
        <div className="sidebar-search">
          <span className="search-icon">
            <Icon name="Search" size={18} />
          </span>
          <input
            type="text"
            placeholder={t('sidebar.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Conversation List */}
        <div className="conversation-list">
          {/* Loading indicator */}
          {isLoading && (
            <div className="loading-indicator">
              <div className="loading-spinner" />
            </div>
          )}

          {/* Pinned conversations at top */}
          {!isLoading && getPinnedConversations().length > 0 && (
            <div className="conversation-group pinned-group">
              <div className="group-title">
                <Icon name="Pin" size={14} />
                <span>Pinned</span>
              </div>
              {getPinnedConversations().map(renderConversation)}
            </div>
          )}

          {/* Regular conversations (excluding pinned) */}
          {!isLoading && renderGroup('Oggi', conversations.today, true)}
          {!isLoading && renderGroup('Ieri', conversations.yesterday, true)}
          {!isLoading && renderGroup('Ultimi 7 giorni', conversations.last7days, true)}
          {!isLoading && renderGroup('Ultimi 30 giorni', conversations.last30days, true)}
          {!isLoading && renderGroup('Più vecchi', conversations.older, true)}

          {/* Empty state */}
          {!isLoading && Object.values(conversations).every(arr => arr.length === 0) && (
            <div className="empty-state">
              <p>Nessuna conversazione trovata</p>
            </div>
          )}
        </div>

        {/* User Profile Footer */}
        <div className="sidebar-footer">
          <div
            className="user-profile"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
          >
            <div className="user-avatar">{user?.username?.[0]?.toUpperCase() || '?'}</div>
            <span className="user-name">{user?.username || 'Guest'}</span>
          </div>

          {userMenuOpen && (
            <UserMenu onClose={() => setUserMenuOpen(false)} />
          )}
        </div>

        {/* Delete Confirmation Modal */}
        <DeleteConfirmModal
          isOpen={deleteModalOpen}
          onConfirm={handleDeleteConfirm}
          onCancel={handleDeleteCancel}
          title="Delete conversation?"
        />
      </div>
    </>
  );
}

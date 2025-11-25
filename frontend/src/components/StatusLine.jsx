import { useState, useEffect } from 'react';
import Icon from './Icon';
import './StatusLine.css';

/**
 * Status Line Component
 *
 * Displays real-time status updates from Claude Code execution via SSE:
 * - Tool execution (Bash, Read, Write, Edit, Grep, etc.)
 * - File operations (reading, editing, writing)
 * - Thinking blocks
 * - Errors and warnings
 * - Working directory (3rd row, editable)
 *
 * Props:
 * - statusEvents: Array of SSE events from /api/v1/chat
 * - isLoading: Boolean indicating if request is in progress
 * - currentDirectory: Current working directory path
 * - onDirectoryChange: Callback when user changes directory
 */
export default function StatusLine({
  statusEvents = [],
  isLoading = false,
  currentDirectory = '/home/dag',
  onDirectoryChange = () => {},
  onDeprecateWorkspace = () => {},
  workspaces = []
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditingDir, setIsEditingDir] = useState(false);
  const [editDirValue, setEditDirValue] = useState(currentDirectory);
  const [workspaceDropdownOpen, setWorkspaceDropdownOpen] = useState(false);

  // Transform API workspace format to UI format
  const transformedWorkspaces = workspaces.map(ws => ({
    path: ws.workspace_path || ws.path,
    name: extractWorkspaceName(ws.workspace_path || ws.path)
  }));

  // Extract human-readable name from path
  function extractWorkspaceName(path) {
    if (!path) return 'Unknown';
    const parts = path.split('/');
    const lastPart = parts[parts.length - 1] || parts[parts.length - 2];
    return lastPart.charAt(0).toUpperCase() + lastPart.slice(1);
  }

  // Sync edit value when currentDirectory prop changes
  useEffect(() => {
    setEditDirValue(currentDirectory);
  }, [currentDirectory]);

  // Get last 2 events for collapsed view
  const lastTwo = statusEvents.slice(-2);

  // Directory editing handlers
  const handleDirectoryClick = () => {
    setIsEditingDir(true);
  };

  const handleFolderIconClick = (e) => {
    e.stopPropagation();
    setWorkspaceDropdownOpen(!workspaceDropdownOpen);
  };

  const handleWorkspaceSelect = (path) => {
    console.log('[StatusLine] Workspace selected:', path);
    onDirectoryChange(path);
    setWorkspaceDropdownOpen(false);
  };

  const handleDeprecate = (path, e) => {
    e.stopPropagation(); // Prevent workspace selection
    onDeprecateWorkspace(path);
  };

  const handleDirectoryKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onDirectoryChange(editDirValue);
      setIsEditingDir(false);
    } else if (e.key === 'Escape') {
      setEditDirValue(currentDirectory);
      setIsEditingDir(false);
    }
  };

  const handleDirectoryBlur = () => {
    setEditDirValue(currentDirectory);
    setIsEditingDir(false);
  };

  // Show placeholder when loading but no events yet
  if (isLoading && statusEvents.length === 0) {
    return (
      <div className="status-line">
        <div className="status-row">
          <span className="status-icon">⚙️</span>
          <span className="status-message">Processing request...</span>
        </div>
        <div className="status-row status-empty">
          <span className="status-message">Ready</span>
        </div>
        <div className="status-row status-directory">
          <button
            className="folder-icon-btn"
            onClick={handleFolderIconClick}
            title="Select workspace"
            aria-label="Select workspace"
            aria-expanded={workspaceDropdownOpen}
            type="button"
          >
            <Icon name="Folder" size={18} />
          </button>
          {isEditingDir ? (
            <input
              type="text"
              value={editDirValue}
              onChange={(e) => setEditDirValue(e.target.value)}
              onKeyDown={handleDirectoryKeyDown}
              onBlur={handleDirectoryBlur}
              className="directory-input"
              autoFocus
            />
          ) : (
            <span className="directory-path" onClick={handleDirectoryClick} title="Click to edit working directory">
              {currentDirectory}
            </span>
          )}
        </div>

        {/* Workspace Dropdown Menu */}
        {workspaceDropdownOpen && (
          <>
            <div className="workspace-dropdown-overlay" onClick={() => setWorkspaceDropdownOpen(false)} />
            <div className="workspace-dropdown">
              {transformedWorkspaces.map((workspace) => (
                <button
                  key={workspace.path}
                  className={`workspace-item ${workspace.path === currentDirectory ? 'active' : ''}`}
                  onClick={() => handleWorkspaceSelect(workspace.path)}
                >
                  <Icon name="Folder" size={16} />
                  <div className="workspace-info">
                    <div className="workspace-name">{workspace.name}</div>
                    <div className="workspace-path">{workspace.path}</div>
                  </div>
                  {workspace.path === currentDirectory && <Icon name="Check" size={16} className="workspace-check" />}
                  <button
                    className="workspace-deprecate-btn"
                    onClick={(e) => handleDeprecate(workspace.path, e)}
                    title="Remove workspace from list"
                    aria-label="Remove workspace"
                  >
                    <Icon name="X" size={14} />
                  </button>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // Always show at least working directory
  if (!isLoading && statusEvents.length === 0) {
    return (
      <div className="status-line">
        <div className="status-row status-directory">
          <button
            className="folder-icon-btn"
            onClick={handleFolderIconClick}
            title="Select workspace"
            aria-label="Select workspace"
            aria-expanded={workspaceDropdownOpen}
            type="button"
          >
            <Icon name="Folder" size={18} />
          </button>
          {isEditingDir ? (
            <input
              type="text"
              value={editDirValue}
              onChange={(e) => setEditDirValue(e.target.value)}
              onKeyDown={handleDirectoryKeyDown}
              onBlur={handleDirectoryBlur}
              className="directory-input"
              autoFocus
            />
          ) : (
            <span className="directory-path" onClick={handleDirectoryClick} title="Click to edit working directory">
              {currentDirectory}
            </span>
          )}
        </div>

        {/* Workspace Dropdown Menu */}
        {workspaceDropdownOpen && (
          <>
            <div className="workspace-dropdown-overlay" onClick={() => setWorkspaceDropdownOpen(false)} />
            <div className="workspace-dropdown">
              {transformedWorkspaces.map((workspace) => (
                <button
                  key={workspace.path}
                  className={`workspace-item ${workspace.path === currentDirectory ? 'active' : ''}`}
                  onClick={() => handleWorkspaceSelect(workspace.path)}
                >
                  <Icon name="Folder" size={16} />
                  <div className="workspace-info">
                    <div className="workspace-name">{workspace.name}</div>
                    <div className="workspace-path">{workspace.path}</div>
                  </div>
                  {workspace.path === currentDirectory && <Icon name="Check" size={16} className="workspace-check" />}
                  <button
                    className="workspace-deprecate-btn"
                    onClick={(e) => handleDeprecate(workspace.path, e)}
                    title="Remove workspace from list"
                    aria-label="Remove workspace"
                  >
                    <Icon name="X" size={14} />
                  </button>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }

  // Expanded view: show all events
  if (isExpanded) {
    return (
      <div className="status-line status-expanded">
        <div className="status-header" onClick={() => setIsExpanded(false)}>
          <span className="status-title">Tool Execution History</span>
          <span className="status-toggle">▼ Collapse</span>
        </div>
        <div className="status-events-list">
          {statusEvents.map((event, idx) => (
            <div key={idx} className="status-event">
              <span className="status-icon">{event.icon}</span>
              <span className="status-message">{event.message}</span>
              <span className="status-time">{new Date(event.timestamp).toLocaleTimeString()}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Collapsed view: show last 2 events + working directory
  return (
    <div className="status-line">
      {/* First row: second-to-last event */}
      <div className="status-row" onClick={() => statusEvents.length > 0 && setIsExpanded(true)}>
        {lastTwo.length >= 2 ? (
          <>
            <span className="status-icon">{lastTwo[0].icon}</span>
            <span className="status-message">{lastTwo[0].message}</span>
          </>
        ) : lastTwo.length === 1 ? (
          <>
            <span className="status-icon">{lastTwo[0].icon}</span>
            <span className="status-message">{lastTwo[0].message}</span>
          </>
        ) : (
          <span className="status-message">Ready</span>
        )}
      </div>

      {/* Second row: latest event */}
      <div className="status-row" onClick={() => statusEvents.length > 0 && setIsExpanded(true)}>
        {lastTwo.length >= 2 ? (
          <>
            <span className="status-icon">{lastTwo[1].icon}</span>
            <span className="status-message">{lastTwo[1].message}</span>
            {statusEvents.length > 2 && (
              <span className="status-count">+{statusEvents.length - 2} more (click to expand)</span>
            )}
          </>
        ) : (
          <span className="status-message status-empty">Ready</span>
        )}
      </div>

      {/* Third row: Working directory */}
      <div className="status-row status-directory">
        <button
          className="folder-icon-btn"
          onClick={handleFolderIconClick}
          title="Select workspace"
          aria-label="Select workspace"
          aria-expanded={workspaceDropdownOpen}
          type="button"
        >
          <Icon name="Folder" size={18} />
        </button>
        {isEditingDir ? (
          <input
            type="text"
            value={editDirValue}
            onChange={(e) => setEditDirValue(e.target.value)}
            onKeyDown={handleDirectoryKeyDown}
            onBlur={handleDirectoryBlur}
            className="directory-input"
            autoFocus
          />
        ) : (
          <span className="directory-path" onClick={handleDirectoryClick} title="Click to edit working directory">
            {currentDirectory}
          </span>
        )}
      </div>

      {/* Workspace Dropdown Menu */}
      {workspaceDropdownOpen ? (
        <>
          <div className="workspace-dropdown-overlay" onClick={() => setWorkspaceDropdownOpen(false)} />
          <div className="workspace-dropdown">
            {transformedWorkspaces.map((workspace) => (
              <button
                key={workspace.path}
                className={`workspace-item ${workspace.path === currentDirectory ? 'active' : ''}`}
                onClick={() => handleWorkspaceSelect(workspace.path)}
              >
                <Icon name="Folder" size={16} />
                <div className="workspace-info">
                  <div className="workspace-name">{workspace.name}</div>
                  <div className="workspace-path">{workspace.path}</div>
                </div>
                {workspace.path === currentDirectory && <Icon name="Check" size={16} className="workspace-check" />}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

import { useState } from 'react';
import Icon from './Icon';
import './WorkspaceButton.css';

export default function WorkspaceButton({ currentWorkspace, onWorkspaceChange, compact = false }) {
  const [isOpen, setIsOpen] = useState(false);

  // Placeholder workspaces until this component is wired to the runtime workspace API.
  const workspaces = [
    { path: '/workspace/app', sessionCount: 12 },
    { path: '/workspace/docs', sessionCount: 5 },
    { path: '/workspace/sandbox', sessionCount: 2 }
  ];

  const handleSelectWorkspace = (workspace) => {
    setIsOpen(false);
    if (onWorkspaceChange) {
      onWorkspaceChange(workspace);
    }
  };

  return (
    <div className="workspace-button-container">
      <button
        className={`workspace-button ${compact ? 'compact' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title={compact ? (currentWorkspace || 'Select workspace') : 'Select Workspace'}
        aria-label="Select workspace"
        aria-expanded={isOpen}
      >
        <Icon name="Folder" size={18} />
        {!compact && (
          <span className="workspace-path">
            {currentWorkspace || 'No workspace'}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          <div className="workspace-overlay" onClick={() => setIsOpen(false)} />
          <div className="workspace-dropdown">
            {workspaces.map((ws, i) => (
              <button
                key={i}
                className={`workspace-item ${ws.path === currentWorkspace ? 'active' : ''}`}
                onClick={() => handleSelectWorkspace(ws.path)}
              >
                <Icon name="Folder" size={14} />
                <div className="workspace-info">
                  <div className="workspace-name">{ws.path}</div>
                  <div className="workspace-meta">{ws.sessionCount} sessions</div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

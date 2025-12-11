import { useState } from 'react';
import Icon from './Icon';
import './WorkspaceButton.css';

export default function WorkspaceButton({ currentWorkspace, onWorkspaceChange, compact = false }) {
  const [isOpen, setIsOpen] = useState(false);

  // Mock workspaces - in futuro chiamare GET /api/v1/workspaces
  const workspaces = [
    { path: '/var/www/cli.wellanet.dev', sessionCount: 25 },
    { path: '/var/www/chat.mmmbuto.com', sessionCount: 108 },
    { path: '/home/dag/projects/nexuscore', sessionCount: 42 }
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

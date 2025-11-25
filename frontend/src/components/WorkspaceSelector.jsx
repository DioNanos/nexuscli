import { useState } from 'react';
import './WorkspaceButton.css';

/**
 * Lightweight workspace selector dropdown.
 */
export default function WorkspaceSelector({ workspaces = [], currentWorkspace, onSelect }) {
  const [open, setOpen] = useState(false);

  const handleSelect = (workspacePath) => {
    setOpen(false);
    if (workspacePath && workspacePath !== currentWorkspace) {
      onSelect(workspacePath);
    }
  };

  return (
    <div className="workspace-selector">
      <button
        type="button"
        className="workspace-button"
        onClick={() => setOpen(!open)}
        aria-label="Select workspace"
      >
        <span className="workspace-label">Workspace</span>
        <span className="workspace-path">{currentWorkspace || 'Select workspace'}</span>
      </button>

      {open && (
        <div className="workspace-dropdown" role="menu">
          {workspaces.length === 0 && (
            <div className="workspace-item disabled">No workspaces</div>
          )}
          {workspaces.map(ws => (
            <div
              key={ws.workspace_path}
              className={`workspace-item ${ws.workspace_path === currentWorkspace ? 'active' : ''}`}
              onClick={() => handleSelect(ws.workspace_path)}
              role="menuitem"
            >
              <span className="workspace-name">{ws.workspace_path}</span>
              <span className="workspace-meta">
                {ws.session_count || 0} sessions · last {ws.last_activity ? new Date(ws.last_activity).toLocaleDateString() : 'n/a'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

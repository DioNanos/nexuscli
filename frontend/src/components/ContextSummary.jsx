import { useState } from 'react';
import Icon from './Icon';
import './ContextSummary.css';

export default function ContextSummary({ summary }) {
  if (!summary) return null;

  const [expanded, setExpanded] = useState(false);

  const {
    summary_short,
    summary_long,
    key_decisions = [],
    tools_used = [],
    files_modified = []
  } = summary;

  return (
    <div className="context-summary">
      <div className="summary-header" onClick={() => setExpanded(!expanded)}>
        <div className="summary-title">
          <Icon name="BookOpenText" size={18} />
          <span>Context Summary</span>
        </div>
        <button
          className="summary-toggle"
          type="button"
          aria-label={expanded ? 'Collapse summary' : 'Expand summary'}
        >
          <Icon name={expanded ? 'ChevronUp' : 'ChevronDown'} size={16} />
        </button>
      </div>

      <div className="summary-content">
        <p className="summary-short">{summary_short || 'No summary available.'}</p>

        {expanded && (
          <>
            {summary_long && (
              <p className="summary-long">{summary_long}</p>
            )}

            {key_decisions.length > 0 && (
              <div className="summary-section">
                <h4>Key Decisions</h4>
                <ul>
                  {key_decisions.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </div>
            )}

            {tools_used.length > 0 && (
              <div className="summary-section">
                <h4>Tools Used</h4>
                <div className="summary-tags">
                  {tools_used.map((tool, idx) => (
                    <span key={idx} className="tag">{tool}</span>
                  ))}
                </div>
              </div>
            )}

            {files_modified.length > 0 && (
              <div className="summary-section">
                <h4>Files Modified</h4>
                <div className="summary-tags">
                  {files_modified.map((file, idx) => (
                    <span key={idx} className="tag">{file}</span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

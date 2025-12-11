import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { User, Terminal, Sparkles, Code2 } from 'lucide-react';
import StatusLine from './StatusLine';
import MessageActions from './MessageActions';
import MarkdownContent from './MarkdownContent';
import './Message.css';

/**
 * Get engine style based on engine/model
 */
function getEngineStyle(engine, model) {
  const engineLower = (engine || '').toLowerCase();
  const modelLower = (model || '').toLowerCase();

  // Check engine first
  if (engineLower.includes('codex') || engineLower.includes('openai')) {
    return { icon: Code2, color: '#00D26A', name: 'Codex' };
  }
  if (engineLower.includes('gemini') || engineLower.includes('google')) {
    return { icon: Sparkles, color: '#4285F4', name: 'Gemini' };
  }
  if (engineLower.includes('claude')) {
    return { icon: Terminal, color: '#FF6B35', name: 'Claude' };
  }

  // Fallback: check model name
  if (modelLower.includes('codex') || modelLower.includes('gpt') || modelLower.includes('o1') || modelLower.includes('o3')) {
    return { icon: Code2, color: '#00D26A', name: 'Codex' };
  }
  if (modelLower.includes('gemini')) {
    return { icon: Sparkles, color: '#4285F4', name: 'Gemini' };
  }

  // Default to Claude
  return { icon: Terminal, color: '#FF6B35', name: 'Claude' };
}

/**
 * Message Component - Modern ChatGPT-style
 *
 * Features:
 * - Cleaner layout (No headers for assistant)
 * - User bubbles, Assistant full-width
 * - Engine-specific icons (Claude/Codex/Gemini)
 */
function Message({ message, streaming = false }) {
  const { user } = useAuth();
  const { id, role, content, created_at, metadata, status, engine, model } = message;

  const isUser = role === 'user';
  const engineStyle = getEngineStyle(engine, model);
  const EngineIcon = engineStyle.icon;

  return (
    <div className={`message ${isUser ? 'user-message' : 'assistant-message'}`}>

      {/* Avatar Column */}
      <div className="message-avatar">
        {isUser ? (
          // User Avatar
          <div className="avatar-icon user-icon">
            <User size={20} />
          </div>
        ) : (
          // Engine-specific Avatar
          <div className="avatar-icon assistant-icon" style={{ backgroundColor: engineStyle.color }}>
            <EngineIcon size={20} />
          </div>
        )}
      </div>

      {/* Content Column */}
      <div className="message-body">
        {/* Name (Only for Assistant) - Shows engine name */}
        {!isUser && <div className="message-sender">{engineStyle.name}</div>}

        {/* Status Line (Job execution) */}
        {!isUser && status && (
          <StatusLine status={status} metadata={metadata} />
        )}

        {/* Content */}
        <div className="message-content">
          <MarkdownContent content={content} />
        </div>

        {/* Streaming Indicator */}
        {streaming && (
          <div className="streaming-indicator">
            <span className="dot"></span>
            <span className="dot"></span>
            <span className="dot"></span>
          </div>
        )}

        {/* Footer Actions */}
        <div className="message-footer">
           {!isUser && status?.state === 'completed' && (
              <MessageActions message={message} />
           )}
        </div>
      </div>
    </div>
  );
}

export default Message;

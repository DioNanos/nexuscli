import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import StatusLine from './StatusLine';
import MessageActions from './MessageActions';
import MarkdownContent from './MarkdownContent';
import './Message.css';

/**
 * Message Component - LibreChat-inspired chat message
 * Supports user messages and assistant messages with job execution
 *
 * Features:
 * - Full markdown support (GFM, code highlighting, LaTeX)
 * - Job execution status tracking
 * - Message actions (copy, edit, delete)
 * - SSE streaming indicator
 */
function Message({ message, streaming = false }) {
  const { user } = useAuth();
  const { id, role, content, created_at, metadata, status } = message;

  // Format timestamp (24-hour format)
  const timestamp = new Date(created_at).toLocaleTimeString('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });

  // Determine sender name - use NexusAI for all assistant messages (multi-engine)
  const senderName = role === 'user' ? (user?.username || 'You') : 'NexusAI';

  return (
    <div className={`message ${role}-message`}>
      {/* Message Header */}
      <div className="message-header">
        <span className="avatar">{role === 'user' ? '👤' : '🤖'}</span>
        <span className="sender">{senderName}</span>
        <span className="timestamp">{timestamp}</span>
      </div>

      {/* Status Line (for jobs) */}
      {role === 'assistant' && status && (
        <StatusLine status={status} metadata={metadata} />
      )}

      {/* Message Content - Now with full markdown support */}
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

      {/* Action Buttons */}
      {role === 'assistant' && status?.state === 'completed' && (
        <MessageActions message={message} />
      )}
    </div>
  );
}

export default Message;

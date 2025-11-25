import { useState } from 'react';
import Message from './Message';
import useJobStream from '../hooks/useJobStream';

/**
 * ChatExample - Complete example showing LibreChat-style chat with job execution
 */
function ChatExample() {
  const [messages, setMessages] = useState([
    // Example: system welcome
    {
      id: 'msg-system',
      role: 'system',
      content: 'Welcome to NexusCLI. 3 nodes online. Type a command or ask what to do.',
      created_at: Date.now() - 60000,
      metadata: null,
      status: null
    },
    // Example: user command
    {
      id: 'msg-user-1',
      role: 'user',
      content: 'systemctl status nginx',
      created_at: Date.now() - 30000,
      metadata: null,
      status: null
    },
    // Example: assistant response with job
    {
      id: 'msg-assistant-1',
      role: 'assistant',
      content: '```bash\n● nginx.service - A high performance web server\n   Loaded: loaded (/lib/systemd/system/nginx.service)\n   Active: active (running) since Mon 2025-11-17 10:25:00 CET\n```\n\nnginx is running successfully on prod-001.',
      created_at: Date.now() - 25000,
      metadata: {
        jobId: 'job-001',
        exitCode: 0,
        duration: 1234,
        nodeId: 'prod-001'
      },
      status: {
        state: 'completed',
        nodeId: 'prod-001'
      }
    }
  ]);

  const [input, setInput] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim()) return;

    // Add user message
    const userMessage = {
      id: `msg-user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      created_at: Date.now(),
      metadata: null,
      status: null
    };

    setMessages(prev => [...prev, userMessage]);

    // Simulate assistant response
    setTimeout(() => {
      const assistantMessage = {
        id: `msg-assistant-${Date.now()}`,
        role: 'assistant',
        content: 'Executing command...',
        created_at: Date.now(),
        metadata: {
          jobId: `job-${Date.now()}`,
        },
        status: {
          state: 'executing',
          nodeId: 'prod-001',
          currentTool: 'bash',
          command: input.trim()
        }
      };

      setMessages(prev => [...prev, assistantMessage]);
    }, 500);

    setInput('');
  };

  return (
    <div className="chat-example">
      <div className="chat-header">
        <h2>🤖 NexusCLI</h2>
        <div className="node-status">
          <span className="status-dot online"></span>
          <span>3 nodes online</span>
        </div>
      </div>

      <div className="chat-messages">
        {messages.map((message) => (
          <Message
            key={message.id}
            message={message}
            streaming={false}
          />
        ))}
      </div>

      <form className="chat-input" onSubmit={handleSubmit}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type command or question..."
          className="input-field"
        />
        <button type="submit" className="send-btn">
          ↑
        </button>
      </form>

      <style jsx>{`
        .chat-example {
          display: flex;
          flex-direction: column;
          height: 100vh;
          background: #0d0d0d;
          color: #ececec;
        }

        .chat-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 1.5rem;
          border-bottom: 1px solid #303030;
          background: #1a1a1a;
        }

        .chat-header h2 {
          margin: 0;
          font-size: 1.25rem;
        }

        .node-status {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.875rem;
          color: #9b9b9b;
        }

        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #4ade80;
        }

        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 1.5rem;
          max-width: 900px;
          width: 100%;
          margin: 0 auto;
        }

        .chat-input {
          display: flex;
          gap: 0.75rem;
          padding: 1.5rem;
          border-top: 1px solid #303030;
          background: #1a1a1a;
        }

        .input-field {
          flex: 1;
          padding: 0.75rem 1rem;
          background: #0d0d0d;
          border: 1px solid #303030;
          border-radius: 8px;
          color: #ececec;
          font-size: 1rem;
          font-family: 'Fira Code', monospace;
        }

        .input-field:focus {
          outline: none;
          border-color: #667eea;
        }

        .send-btn {
          padding: 0.75rem 1.5rem;
          background: #667eea;
          border: none;
          border-radius: 8px;
          color: white;
          font-size: 1.25rem;
          cursor: pointer;
          transition: background 0.2s;
        }

        .send-btn:hover {
          background: #5568d3;
        }

        .send-btn:active {
          transform: scale(0.98);
        }
      `}</style>
    </div>
  );
}

export default ChatExample;

import './MessageActions.css';

/**
 * MessageActions Component - Action buttons for completed jobs
 * Copy, Re-run, Details, etc.
 */
function MessageActions({ message }) {
  const handleCopy = () => {
    // Extract plain text from message content
    const textContent = message.content.replace(/```[\s\S]*?```/g, (match) => {
      // Extract code from code blocks
      return match.replace(/```\w*\n?/, '').replace(/```$/, '');
    });

    navigator.clipboard.writeText(textContent).then(() => {
      // TODO: Show toast notification
      console.log('✅ Copied to clipboard');
    });
  };

  const handleRerun = () => {
    // TODO: Dispatch re-run action
    const jobId = message.metadata?.jobId;
    console.log('↻ Re-run job:', jobId);
    // Emit event to parent component
  };

  const handleDetails = () => {
    // TODO: Open job details modal
    const jobId = message.metadata?.jobId;
    console.log('⋯ Show details:', jobId);
  };

  return (
    <div className="message-actions">
      <button className="action-btn" onClick={handleCopy} title="Copy output">
        📋 Copy
      </button>
      <button className="action-btn" onClick={handleRerun} title="Re-run command">
        ↻ Re-run
      </button>
      <button className="action-btn" onClick={handleDetails} title="Show details">
        ⋯ More
      </button>
    </div>
  );
}

export default MessageActions;

import { useState, useEffect, useRef } from 'react';

/**
 * useJobStream Hook - Real-time job execution streaming via SSE
 *
 * @param {string} jobId - Job ID to stream
 * @returns {Object} - { status, output, completed, error }
 */
export function useJobStream(jobId) {
  const [status, setStatus] = useState({ state: 'queued', nodeId: null });
  const [output, setOutput] = useState('');
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState(null);
  const eventSourceRef = useRef(null);

  useEffect(() => {
    if (!jobId) return;

    // Create SSE connection
    const eventSource = new EventSource(`/api/v1/jobs/${jobId}/stream`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        switch (data.type) {
          case 'status':
            // Update status line
            setStatus({
              state: data.category,
              nodeId: data.nodeId || null,
              currentTool: data.tool || null,
              command: data.message || null,
            });
            break;

          case 'output_chunk':
            // Append to output (streaming)
            setOutput(prev => prev + (data.text || ''));
            break;

          case 'response_done':
            // Job execution complete
            setCompleted(true);
            setStatus(prev => ({
              ...prev,
              state: data.exitCode === 0 ? 'completed' : 'failed'
            }));
            break;

          case 'done':
            // Stream finished
            eventSource.close();
            break;

          case 'error':
            // Error occurred
            setError(data.message || 'Unknown error');
            setStatus(prev => ({ ...prev, state: 'failed' }));
            eventSource.close();
            break;

          default:
            console.log('[useJobStream] Unknown event type:', data.type);
        }
      } catch (err) {
        console.error('[useJobStream] Failed to parse SSE event:', err);
      }
    };

    eventSource.onerror = (err) => {
      console.error('[useJobStream] SSE error:', err);
      setError('Connection lost');
      eventSource.close();
    };

    // Cleanup on unmount
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [jobId]);

  return {
    status,
    output,
    completed,
    error
  };
}

export default useJobStream;

import { useEffect, useMemo, useState } from 'react';
import Icon from './Icon';
import './RuntimeManager.css';

export default function RuntimeManager({ token }) {
  const [isOpen, setIsOpen] = useState(false);
  const [inventory, setInventory] = useState([]);
  const [platform, setPlatform] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  const headers = useMemo(() => ({
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  }), [token]);

  const fetchInventory = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/runtimes', { headers });
      const data = await res.json();
      setInventory(data.runtimes || []);
      setPlatform(data.platform || '');
    } catch (error) {
      console.error('Failed to fetch runtimes:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    fetchInventory();
  }, [isOpen]);

  const runAction = async (runtimeId, action) => {
    setPendingAction(`${runtimeId}:${action}`);
    try {
      const res = await fetch(`/api/v1/runtimes/${action === 'check' ? 'check' : action}`, {
        method: 'POST',
        headers,
        body: action === 'check' ? JSON.stringify({}) : JSON.stringify({ runtimeId })
      });
      const data = await res.json();

      if (action === 'check') {
        setInventory(data.runtimes || []);
        setPlatform(data.platform || platform);
        return;
      }

      if (!data.jobId) return;

      let done = false;
      while (!done) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const jobRes = await fetch(`/api/v1/jobs/${data.jobId}`, { headers: { Authorization: `Bearer ${token}` } });
        const job = await jobRes.json();
        done = ['completed', 'failed', 'cancelled'].includes(job.status);
      }

      await fetchInventory();
    } catch (error) {
      console.error(`Failed to ${action} runtime:`, error);
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <div className="runtime-manager">
      <button
        className={`runtime-trigger ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(prev => !prev)}
        title="Runtime Manager"
      >
        <Icon name="Wrench" size={16} />
        <span>CLI</span>
      </button>

      {isOpen && (
        <>
          <div className="runtime-panel">
            <div className="runtime-panel-header">
              <div>
                <strong>CLI Runtimes</strong>
                <span className="runtime-platform">{platform || 'unknown'}</span>
              </div>
              <button className="runtime-refresh" onClick={() => runAction(null, 'check')} disabled={loading || Boolean(pendingAction)}>
                <Icon name="RefreshCcw" size={14} />
                <span>{loading ? 'Checking' : 'Check'}</span>
              </button>
            </div>

            <div className="runtime-list">
              {inventory.map(runtime => {
                const pending = pendingAction && pendingAction.startsWith(`${runtime.runtimeId}:`);
                return (
                  <div key={runtime.runtimeId} className="runtime-card">
                    <div className="runtime-copy">
                      <div className="runtime-title-row">
                        <span className="runtime-title">{runtime.engine} / {runtime.lane}</span>
                        <span className={`runtime-status status-${runtime.status}`}>{runtime.status}</span>
                      </div>
                      <div className="runtime-meta">
                        {runtime.command} · {runtime.source} · {runtime.installedVersion || 'not installed'}
                      </div>
                    </div>

                    <div className="runtime-actions">
                      {runtime.actions.includes('install') && (
                        <button onClick={() => runAction(runtime.runtimeId, 'install')} disabled={pending}>
                          Install
                        </button>
                      )}
                      {runtime.actions.includes('update') && (
                        <button onClick={() => runAction(runtime.runtimeId, 'update')} disabled={pending}>
                          Update
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="runtime-overlay" onClick={() => setIsOpen(false)} />
        </>
      )}
    </div>
  );
}

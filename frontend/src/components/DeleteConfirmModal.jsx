import { useEffect } from 'react';
import Icon from './Icon';
import './DeleteConfirmModal.css';

export default function DeleteConfirmModal({ isOpen, onConfirm, onCancel, title = 'Delete conversation?' }) {
  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onCancel();
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <>
      <div className="delete-modal-overlay" onClick={onCancel} />
      <div className="delete-modal">
        <div className="delete-modal-header">
          <Icon name="AlertTriangle" size={24} className="delete-modal-icon" />
          <h3 className="delete-modal-title">{title}</h3>
        </div>
        <p className="delete-modal-message">
          This action cannot be undone. This will permanently delete the conversation and all its messages.
        </p>
        <div className="delete-modal-actions">
          <button className="delete-modal-btn cancel-btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="delete-modal-btn confirm-btn" onClick={onConfirm}>
            <Icon name="Trash2" size={16} />
            Delete
          </button>
        </div>
      </div>
    </>
  );
}

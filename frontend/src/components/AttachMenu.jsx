import { useState, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Icon from './Icon';
import './AttachMenu.css';

export default function AttachMenu({ onFileAttached }) {
  const { token } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleUpload = async (file) => {
    if (!file || !token) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/v1/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Upload failed');
      }

      const data = await res.json();
      console.log('[AttachMenu] File uploaded:', data.file);

      // Notify parent with file info
      if (onFileAttached) {
        onFileAttached(data.file);
      }
    } catch (error) {
      console.error('[AttachMenu] Upload error:', error);
      alert(`Upload failed: ${error.message}`);
    } finally {
      setIsUploading(false);
      setIsOpen(false);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUpload(file);
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const openFilePicker = (accept) => {
    if (fileInputRef.current) {
      fileInputRef.current.accept = accept;
      fileInputRef.current.click();
    }
  };

  const handleAttachFile = () => {
    // Documents: text, code, PDF, etc.
    openFilePicker('.txt,.md,.pdf,.doc,.docx,.xls,.xlsx,.csv,.json,.xml,.html,.css,.js,.ts,.py,.java,.c,.cpp,.h,.rb,.php,.go,.rs,.sh,.log,.yaml,.yml,.toml,.sql');
  };

  const handleAttachImage = () => {
    // Images only
    openFilePicker('image/*');
  };

  return (
    <div className="attach-menu-container">
      <input
        ref={fileInputRef}
        type="file"
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />

      <button
        type="button"
        className="icon-btn"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isUploading}
        title="Attach File"
        aria-label="Attach file or image"
        aria-expanded={isOpen}
      >
        {isUploading ? (
          <Icon name="Loader" size={20} className="spinning" />
        ) : (
          <Icon name="Paperclip" size={20} />
        )}
      </button>

      {isOpen && (
        <>
          <div className="attach-overlay" onClick={() => setIsOpen(false)} />
          <div className="attach-dropdown">
            <button className="attach-option" onClick={handleAttachFile}>
              <Icon name="File" size={16} />
              <span>Invia file</span>
            </button>
            <button className="attach-option" onClick={handleAttachImage}>
              <Icon name="Image" size={16} />
              <span>Invia immagine</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

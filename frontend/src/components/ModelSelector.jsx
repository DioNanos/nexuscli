import { useState, useEffect } from 'react';
import Icon from './Icon';
import './ModelSelector.css';

export default function ModelSelector({
  selectedModel,
  onSelectModel,
  thinkMode = 'think',
  onThinkModeChange,
  reasoningLevel = 'high',
  onReasoningLevelChange
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [cliTools, setCliTools] = useState({});
  const [loading, setLoading] = useState(true);

  // Fetch models from API
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await fetch('/api/v1/models');
        const data = await res.json();
        setCliTools(data);
        setLoading(false);
      } catch (error) {
        console.error('Failed to fetch models:', error);
        setLoading(false);
      }
    };

    fetchModels();
  }, []);

  // Flatten all models for easy lookup
  const allModels = Object.values(cliTools).flatMap(cli => cli.models || []);

  const selectedModelObj = allModels.find(m => m.id === selectedModel);
  const selectedCli = selectedModelObj ? cliTools[selectedModelObj.category] : cliTools['claude'] || { icon: 'Terminal', name: 'Claude' };

  // Filter models across all CLI tools
  const filteredCliTools = Object.entries(cliTools).map(([key, cli]) => ({
    key,
    ...cli,
    models: (cli.models || []).filter(model =>
      model.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      model.label.toLowerCase().includes(searchTerm.toLowerCase())
    )
  })).filter(cli => cli.models && cli.models.length > 0);

  const handleSelectModel = (modelId, cliEnabled) => {
    if (!cliEnabled) {
      alert('This CLI tool is coming soon!');
      return;
    }
    onSelectModel(modelId);
    setIsOpen(false);
    setSearchTerm('');
  };

  const displayLabel = selectedModelObj?.label || (loading ? 'Loading...' : 'Select');
  const truncatedLabel = displayLabel.length > 15 ? displayLabel.substring(0, 15) : displayLabel;

  // Get current CLI's capabilities
  const currentCategory = selectedModelObj?.category;
  const currentCli = currentCategory ? cliTools[currentCategory] : null;
  const hasThinkModes = currentCli?.thinkModes?.length > 0;
  const currentModelReasoningEfforts = selectedModelObj?.reasoningEfforts;

  // DeepSeek models don't need think toggle - they are inherently think/non-think
  const isDeepSeek = selectedModel?.startsWith('deepseek-');

  return (
    <div className="model-selector">
      <div className="model-selector-trigger" onClick={() => !loading && setIsOpen(!isOpen)}>
        <span className="model-icon">
          <Icon name={selectedCli?.icon || 'Terminal'} size={18} />
        </span>
        <span className="model-label">{truncatedLabel}</span>
        <Icon name="ChevronDown" size={14} />
      </div>

      {/* Think Mode Toggle (Claude only - not DeepSeek) */}
      {hasThinkModes && !isDeepSeek && onThinkModeChange && (
        <button
          className={`think-toggle ${thinkMode === 'think' ? 'active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onThinkModeChange(thinkMode === 'think' ? 'no-think' : 'think');
          }}
          title={thinkMode === 'think' ? 'Extended Thinking ON' : 'Extended Thinking OFF'}
        >
          <Icon name={thinkMode === 'think' ? 'Brain' : 'Zap'} size={16} />
          <span className="toggle-label">{thinkMode === 'think' ? 'Think' : 'Fast'}</span>
        </button>
      )}

      {/* Reasoning Level Selector (Codex) */}
      {currentModelReasoningEfforts && onReasoningLevelChange && (
        <div className="reasoning-wrapper">
          <Icon name="Cpu" size={14} />
          <select
            className="reasoning-select"
            value={reasoningLevel}
            onChange={(e) => {
              e.stopPropagation();
              onReasoningLevelChange(e.target.value);
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {currentModelReasoningEfforts.map(level => (
              <option key={level} value={level}>
                {level === 'xhigh' ? 'X-High' : level.charAt(0).toUpperCase() + level.slice(1)}
              </option>
            ))}
          </select>
        </div>
      )}

      {isOpen && (
        <>
          <div className="model-dropdown">
            <div className="model-search">
              <input
                type="text"
                placeholder="Cerca CLI e modelli..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
              />
            </div>

            {filteredCliTools.map(cli => (
              <div key={cli.key} className="model-category">
                <div className="category-header">
                  <span className="category-icon">
                    <Icon name={cli.icon} size={20} />
                  </span>
                  <span className="category-name">{cli.name}</span>
                  {!cli.enabled && <span className="coming-soon">{cli.disabledReason || 'Coming Soon'}</span>}
                </div>

                <div className="model-list">
                  {cli.models.map(model => (
                    <div
                      key={model.id}
                      className={`model-item ${selectedModel === model.id ? 'selected' : ''} ${!cli.enabled ? 'disabled' : ''}`}
                      onClick={() => handleSelectModel(model.id, cli.enabled)}
                    >
                      <span className="model-label">{model.name}</span>
                      {selectedModel === model.id && (
                        <span className="checkmark">
                          <Icon name="Check" size={18} />
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="model-dropdown-overlay" onClick={() => setIsOpen(false)} />
        </>
      )}
    </div>
  );
}

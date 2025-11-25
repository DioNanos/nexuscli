import { useState, useRef, useEffect } from 'react';
import Icon from './Icon';
import './DropdownMenu.css';

/**
 * DropdownMenu - Generic dropdown with three-dot trigger
 * Usage: <DropdownMenu items={[{label, icon, onClick, danger}]} />
 */
export default function DropdownMenu({ items, align = 'right' }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleItemClick = (item) => {
    setIsOpen(false);
    if (item.onClick) item.onClick();
  };

  return (
    <div className="dropdown-menu-container" ref={menuRef}>
      <button
        className="dropdown-trigger"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        title="Actions"
      >
        <Icon name="MoreVertical" size={16} />
      </button>

      {isOpen && (
        <div className={`dropdown-menu ${align}`}>
          {items.map((item, index) => (
            <button
              key={index}
              className={`dropdown-item ${item.danger ? 'danger' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                handleItemClick(item);
              }}
            >
              {item.icon && <Icon name={item.icon} size={16} />}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

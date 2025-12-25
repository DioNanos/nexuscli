import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../hooks/useTheme';
import Icon from './Icon';
import './UserMenu.css';

export default function UserMenu({ onClose }) {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const handleLogout = () => {
    logout();
    onClose();
  };

  return (
    <div className="user-menu">
      <button className="user-menu-item theme-toggle" onClick={toggleTheme}>
        <span className="menu-icon">
          <Icon name={theme === 'dark' ? 'Sun' : 'Moon'} size={18} />
        </span>
        <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
      </button>
      <button className="user-menu-item logout" onClick={handleLogout}>
        <span className="menu-icon">
          <Icon name="LogOut" size={18} />
        </span>
        <span>Disconnetti</span>
      </button>
    </div>
  );
}

import { useAuth } from '../contexts/AuthContext';
import Icon from './Icon';
import './UserMenu.css';

export default function UserMenu({ onClose }) {
  const { user, logout } = useAuth();

  const handleLogout = () => {
    logout();
    onClose();
  };

  return (
    <div className="user-menu">
      <button className="user-menu-item logout" onClick={handleLogout}>
        <span className="menu-icon">
          <Icon name="LogOut" size={18} />
        </span>
        <span>Disconnetti</span>
      </button>
    </div>
  );
}

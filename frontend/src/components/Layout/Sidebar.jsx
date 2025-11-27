import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './Sidebar.css';

const Sidebar = ({ onItemClick }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', path: '/dashboard' },
    { id: 'ad-dns', label: 'AD DNS', path: '/ad-dns' },
    { id: 'event-viewer', label: 'Event Viewer', path: '/event-viewer' },
    { id: 'backups', label: 'Backups', path: '/backups' },
    { id: 'users', label: 'Users', path: '/users' },
    { id: 'resource-monitor', label: 'Resource Monitor', path: '/resource-monitor' },
    { id: 'wds', label: 'WDS', path: '/wds' },
    { id: 'networking', label: 'Networking', path: '/networking' },
    { id: 'device-auto-config', label: 'Device Auto Config', path: '/device-auto-config' },
    { id: 'device-backup', label: 'Device Backup', path: '/device-backup' },
    { id: 'commands', label: 'Commands', path: '/commands' }
  ];

  const isActive = (path) => {
    return location.pathname === path;
  };

  const handleItemClick = (path) => {
    navigate(path);
    if (onItemClick) {
      onItemClick();
    }
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2 className="sidebar-title">Automation</h2>
      </div>

      <nav className="sidebar-nav">
        <ul className="nav-menu">
          {menuItems.map((item) => (
            <li key={item.id} className="nav-item">
              <button
                className={`nav-link ${isActive(item.path) ? 'active' : ''}`}
                onClick={() => handleItemClick(item.path)}
              >
                <span className="nav-checkbox">
                  {isActive(item.path) ? (
                    <span className="checkbox-checked">✓</span>
                  ) : (
                    <span className="checkbox-unchecked">☐</span>
                  )}
                </span>
                <span className="nav-label">{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
};

export default Sidebar;
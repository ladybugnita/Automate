import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './Sidebar.css';

const Sidebar = ({ onItemClick }) => {
  const location = useLocation();
  const navigate = useNavigate();

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', path: '/dashboard' },
    { id: 'DNS Configuration', label: 'DNS Configuration', path: '/dnsconfiguration' },
    { id: 'event-viewer', label: 'Event Viewer', path: '/event-viewer' },
    { id: 'dhcp', label: 'DHCP', path: '/dhcp' },
    { id: 'users', label: 'Users', path: '/users' },
    { id: 'resource-monitor', label: 'Resource Monitor', path: '/resource-monitor' },
    { id: 'ESXi', label: 'ESXi', path: '/esxi' },
    { id: 'networking', label: 'Networking', path: '/networking' },
    { id: 'device-auto-config', label: 'Device Auto Config', path: '/device-auto-config' },
    { id: 'active-directory', label: 'Active Directory', path: '/active-directory' },
    { id: 'routing', label: 'Routing', path: '/routing' }
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
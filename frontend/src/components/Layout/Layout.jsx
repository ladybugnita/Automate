import React, { useState } from 'react';
import Sidebar from './Sidebar';
import './Layout.css';

const Layout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
  }

  return (
    <div className="layout">
      <button
        className={`hamburger-menu ${sidebarOpen ? 'open' : ''}`}
        onClick={toggleSidebar}
      >
        <span></span>
        <span></span>
        <span></span>
      </button>

      <div className={`sidebar-container ${sidebarOpen ? 'open' : ''}`}>
        <Sidebar onItemClick={closeSidebar} />
      </div>

      <main className={`main-content ${sidebarOpen ? 'sidebar-open' : ''}`}>
        {children}
      </main>

      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={closeSidebar}
        ></div>
      )}
    </div>
  );
};

export default Layout;
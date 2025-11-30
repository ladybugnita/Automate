import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import SignupPage from "./components/SignupPage";
import TokenPage from "./components/TokenPage";
import Dashboard from "./components/Dashboard/Dashboard";
import LoginPage from "./components/LoginPage";
import Users from "./components/Users/Users";
import EventViewer from "./components/EventViewer/EventViewer";
import WebSocketProvider from "./context/WebSocketContext";
import Layout from "./components/Layout/Layout";

const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem("token");
  return token ? children : <Navigate to="/" replace />;
};

const SidebarLayout = ({ children }) => {
  return (
    <Layout>
      {children}
    </Layout>
  );
};

function App() {
  return (
    <WebSocketProvider>
      <Router>
        <Routes>
          <Route path="/" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/token" element={<TokenPage />} />

          <Route path="/dashboard" element={
            <ProtectedRoute>
              <SidebarLayout>
                <Dashboard />
              </SidebarLayout>
            </ProtectedRoute>
          } />
          <Route path="/users" element={
            <ProtectedRoute>
              <SidebarLayout>
                <Users />
              </SidebarLayout>
            </ProtectedRoute>
          } />
          <Route path="/ad-dns" element={
            <ProtectedRoute>
              <SidebarLayout>
                <div>AD DNS page - Coming Soon</div>
              </SidebarLayout>
            </ProtectedRoute>
          } />
          <Route path="/event-viewer" element={
            <ProtectedRoute>
              <SidebarLayout>
                <EventViewer />
              </SidebarLayout>
            </ProtectedRoute>
          } />

          <Route path="/backups" element={
            <ProtectedRoute>
              <SidebarLayout>
                <div>Backups Page - Coming Soon</div>
              </SidebarLayout>
            </ProtectedRoute>
          } />
          <Route path="/resource-monitor" element={
            <ProtectedRoute>
              <SidebarLayout>
                <div>Resource Monitor Page - Coming Soon</div>
              </SidebarLayout>
            </ProtectedRoute>
          } />
          <Route path="/wds" element={
            <ProtectedRoute>
              <SidebarLayout>
                <div>WDS Page - Coming Soon</div>
              </SidebarLayout>
            </ProtectedRoute>
          } />
          <Route path="/networking" element={
            <ProtectedRoute>
              <SidebarLayout>
                <div> Networking Page - Coming Soon</div>
              </SidebarLayout>
            </ProtectedRoute>
          } />
          <Route path="/device-auto-config" element={
            <ProtectedRoute>
              <SidebarLayout>
                <div>Device Auto config Page - Coming Soon</div>
              </SidebarLayout>
            </ProtectedRoute>
          } />

          <Route path="/device-backup" element={
              <ProtectedRoute>
              <SidebarLayout>
                <div> Device Backup Page - Coming Soon</div>
              </SidebarLayout>
            </ProtectedRoute>
          } />

          <Route path="/commands" element={
            <ProtectedRoute>
              <SidebarLayout>
                <div>Commands Page - Coming Soon</div>
              </SidebarLayout>
            </ProtectedRoute>
          } />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </WebSocketProvider>

  );
}

export default App;

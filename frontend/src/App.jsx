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
import ResourceMonitor from "./components/ResourceMonitor/ResourceMonitor";
import DNSConfiguration from "./components/DNSConfiguration/DNSConfiguration";
import Routing from "./components/Routing/Routing";
import DHCP from "./components/DHCP/DHCP";
import ActiveDirectory from "./components/ActiveDirectory/ActiveDirectory";
import MachineManagement from "./components/MachineManagement/MachineManagement";
import Switch from "./components/Switch/Switch";
import ESXI from "./components/ESXI/ESXi";
import NetworkManagement from "./components/NetworkManagement/NetworkManagement";

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
          <Route path="/dnsconfiguration" element={
            <ProtectedRoute>
              <SidebarLayout>
                <DNSConfiguration />
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

          <Route path="/dhcp" element={
            <ProtectedRoute>
              <SidebarLayout>
                <DHCP />
              </SidebarLayout>
            </ProtectedRoute>
          } />
          <Route path="/resource-monitor" element={
            <ProtectedRoute>
              <SidebarLayout>
                <ResourceMonitor />
              </SidebarLayout>
            </ProtectedRoute>
          } />
          <Route path="/esxi" element={
            <ProtectedRoute>
              <SidebarLayout>
                <ESXI />
              </SidebarLayout>
            </ProtectedRoute>
          } />
          <Route path="/switch" element={
            <ProtectedRoute>
              <SidebarLayout>
                <Switch />
              </SidebarLayout>
            </ProtectedRoute>
          } />
          <Route path="/machine-management" element={
            <ProtectedRoute>
              <SidebarLayout>
                <MachineManagement />
              </SidebarLayout>
            </ProtectedRoute>
          } />

          <Route path="/active-directory" element={
              <ProtectedRoute>
              <SidebarLayout>
                <ActiveDirectory />
              </SidebarLayout>
            </ProtectedRoute>
          } />

          <Route path="/network-management" element={
            <ProtectedRoute>
              <SidebarLayout>
                <NetworkManagement />
              </SidebarLayout>
            </ProtectedRoute>
          } />

          <Route path="/routing" element={
            <ProtectedRoute>
              <SidebarLayout>
                <Routing />
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

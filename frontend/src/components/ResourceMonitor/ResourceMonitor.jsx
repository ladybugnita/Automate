import React, { useState, useEffect, useRef } from 'react';
import './ResourceMonitor.css';
import { useWebSocket } from '../../context/WebSocketContext';

function ResourceMonitor() {
  const { sendCommand, isConnected, addListener } = useWebSocket();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(false); 
  const [activeSection, setActiveSection] = useState('overview');
  const [hasInitialFetch, setHasInitialFetch] = useState(false);
  const autoRefreshInterval = useRef(null);
  const isMounted = useRef(true);

  const [resourceData, setResourceData] = useState({
    cpu_percent: 0,
    total_memory_mb: 0,
    free_memory_mb: 0,
    used_memory_mb: 0,
    top_processes: [],
    disk_usage: {
      total: 0,
      used: 0,
      free: 0,
      percent: 0
    },
    network_stats: {
      upload: 0,
      download: 0,
      connections: 0
    },
    system_uptime: ""
  });

  const topNavSections = [
    { id: 'overview', label: 'Overview' },
    { id: 'cpu', label: 'CPU' },
    { id: 'memory', label: 'Memory' },
    { id: 'disk', label: 'Disk' },
    { id: 'network', label: 'Network' },
    { id: 'processes', label: 'Processes' }
  ];

  const handleWebSocketMessage = (message) => {
    if (!isMounted.current) return;
    
    console.log('ResourceMonitor received message:', message);
    
    if (message.action === 'response' && message.command === 'get_resource_monitor_data') {
      setLoading(false);
      setLastUpdated(new Date().toLocaleTimeString());
      
      if (message.result) {
        try {
          const data = message.result;
          
          if (data.status === 'success' && data.data) {
            const resourceData = data.data;
            
            setResourceData(prev => ({
              ...prev,
              cpu_percent: resourceData.cpu_percent || 0,
              total_memory_mb: resourceData.total_memory_mb || 0,
              free_memory_mb: resourceData.free_memory_mb || 0,
              used_memory_mb: resourceData.used_memory_mb || 0,
              top_processes: resourceData.top_processes || [],
              disk_usage: resourceData.disk_usage || {
                total: 1024 * 1024 * 1024, 
                used: 0,
                free: 1024 * 1024 * 1024,
                percent: 0
              },
              network_stats: resourceData.network_stats || {
                upload: 0,
                download: 0,
                connections: 0
              },
              system_uptime: resourceData.system_uptime || ""
            }));
            
            setError(null);
          } else {
            setError('Invalid data format from backend');
          }
        } catch (err) {
          console.error('Error parsing resource data:', err);
          setError('Failed to parse backend response');
        }
      } else {
        setError('Backend returned an error');
      }
    } else if (message.action === 'error') {
      setError(`Backend error: ${message.message}`);
      setLoading(false);
    }
  };

  const fetchResourceData = () => {
    if (!isMounted.current) return;
    
    if (!isConnected) {
      setError('Not connected to backend');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    console.log('Sending get_resource_monitor_data command');
    const commandId = sendCommand('get_resource_monitor_data');
    
    if (!commandId) {
      setError('Failed to send command');
      setLoading(false);
    }
  };

  useEffect(() => {
    isMounted.current = true;
    
    const setupAutoRefresh = () => {
      if (autoRefresh && isConnected) {
        if (autoRefreshInterval.current) {
          clearInterval(autoRefreshInterval.current);
        }
        
        autoRefreshInterval.current = setInterval(() => {
          if (isMounted.current && isConnected) {
            fetchResourceData();
          }
        }, 5000);
      } else {
        if (autoRefreshInterval.current) {
          clearInterval(autoRefreshInterval.current);
          autoRefreshInterval.current = null;
        }
      }
    };
    
    setupAutoRefresh();
    
    return () => {
      isMounted.current = false;
      if (autoRefreshInterval.current) {
        clearInterval(autoRefreshInterval.current);
        autoRefreshInterval.current = null;
      }
    };
  }, [autoRefresh, isConnected]);

  useEffect(() => {
    const removeListener = addListener(handleWebSocketMessage);
    
    return () => {
      if (removeListener) removeListener();
    };
  }, [addListener]);

  useEffect(() => {
    if (isConnected && !hasInitialFetch && !loading) {
      const timer = setTimeout(() => {
        fetchResourceData();
        setHasInitialFetch(true); 
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [isConnected, hasInitialFetch]);

  const handleRefresh = () => {
    fetchResourceData();
  };

  const handleAutoRefreshToggle = () => {
    const newAutoRefresh = !autoRefresh;
    setAutoRefresh(newAutoRefresh);
    
    if (newAutoRefresh && isConnected) {
      fetchResourceData();
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatMemoryMB = (mb) => {
    if (mb < 1024) {
      return mb.toFixed(2) + ' MB';
    } else {
      return (mb / 1024).toFixed(2) + ' GB';
    }
  };

  const getUsageColor = (percent, type = 'cpu') => {
    if (percent < 50) return 'var(--success-color)';
    if (percent < 80) return 'var(--warning-color)';
    return 'var(--error-color)';
  };

  const calculateMemoryPercentage = () => {
    if (resourceData.total_memory_mb === 0) return 0;
    return (resourceData.used_memory_mb / resourceData.total_memory_mb) * 100;
  };

  return (
    <div className="resource-monitor">
      <div className="navbar">
        <div className="navbar-container">
          <div className="navbar-brand">
            <span className="navbar-title">Automation</span>
          </div>
          <div className="navbar-right">
            <button 
              className="btn-refresh-header"
              onClick={handleRefresh}
              disabled={loading}
            >
              {loading ? 'Refreshing...' : 'Refresh Data'}
            </button>
          </div>
        </div>
      </div>

      <div className="main-container">
        <div className="monitor-tabs">
          <div className="tabs-container">
            {topNavSections.map(section => (
              <button
                key={section.id}
                className={`tab-item ${activeSection === section.id ? 'active' : ''}`}
                onClick={() => setActiveSection(section.id)}
              >
                {section.label}
              </button>
            ))}
          </div>
        </div>

        <div className="monitor-content">
          {error && (
            <div className="error-message" style={{
              background: 'var(--error-color)',
              color: 'white',
              padding: 'var(--spacing-3)',
              borderRadius: 'var(--border-radius)',
              marginBottom: 'var(--spacing-4)',
              textAlign: 'center'
            }}>
              Error: {error}
            </div>
          )}

          {activeSection === 'overview' && (
            <div className="section-content overview-section">
              <div className="section-header">
                <h2>Performance Overview</h2>
                <div className="header-actions">
                  <div className="auto-refresh-control">
                    <label className="toggle-label">
                      Auto refresh
                      <div className="toggle-switch">
                        <input 
                          type="checkbox" 
                          checked={autoRefresh}
                          onChange={handleAutoRefreshToggle}
                        />
                        <span className="toggle-slider"></span>
                      </div>
                    </label>
                  </div>
                  {lastUpdated && (
                    <div className="last-updated">
                      Last updated: {lastUpdated}
                    </div>
                  )}
                </div>
              </div>

              <div className="performance-grid">
                <div className="performance-card">
                  <div className="card-header">
                    <h3>CPU</h3>
                    <div className="card-value">{resourceData.cpu_percent.toFixed(1)}%</div>
                  </div>
                  <div className="progress-bar-large">
                    <div 
                      className="progress-fill"
                      style={{ 
                        width: `${Math.min(resourceData.cpu_percent, 100)}%`,
                        backgroundColor: getUsageColor(resourceData.cpu_percent)
                      }}
                    ></div>
                  </div>
                  <div className="card-details">
                    <div className="detail-item">
                      <span className="detail-label">Processes:</span>
                      <span className="detail-value">{resourceData.top_processes.length}</span>
                    </div>
                  </div>
                </div>

                <div className="performance-card">
                  <div className="card-header">
                    <h3>Memory</h3>
                    <div className="card-value">{calculateMemoryPercentage().toFixed(1)}%</div>
                  </div>
                  <div className="progress-bar-large">
                    <div 
                      className="progress-fill"
                      style={{ 
                        width: `${Math.min(calculateMemoryPercentage(), 100)}%`,
                        backgroundColor: getUsageColor(calculateMemoryPercentage(), 'memory')
                      }}
                    ></div>
                  </div>
                  <div className="card-details">
                    <div className="detail-item">
                      <span className="detail-label">In use:</span>
                      <span className="detail-value">{formatMemoryMB(resourceData.used_memory_mb)}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Available:</span>
                      <span className="detail-value">{formatMemoryMB(resourceData.free_memory_mb)}</span>
                    </div>
                  </div>
                </div>

                <div className="performance-card">
                  <div className="card-header">
                    <h3>Disk</h3>
                    <div className="card-value">{resourceData.disk_usage.percent.toFixed(1)}%</div>
                  </div>
                  <div className="progress-bar-large">
                    <div 
                      className="progress-fill"
                      style={{ 
                        width: `${Math.min(resourceData.disk_usage.percent, 100)}%`,
                        backgroundColor: getUsageColor(resourceData.disk_usage.percent, 'disk')
                      }}
                    ></div>
                  </div>
                  <div className="card-details">
                    <div className="detail-item">
                      <span className="detail-label">Used:</span>
                      <span className="detail-value">{formatBytes(resourceData.disk_usage.used)}</span>
                    </div>
                    <div className="detail-item">
                      <span className="detail-label">Free:</span>
                      <span className="detail-value">{formatBytes(resourceData.disk_usage.free)}</span>
                    </div>
                  </div>
                </div>

                <div className="performance-card">
                  <div className="card-header">
                    <h3>Network</h3>
                    <div className="card-value">{resourceData.network_stats.connections}</div>
                  </div>
                  <div className="network-stats-overview">
                    <div className="network-stat">
                      <div className="stat-label">Send</div>
                      <div className="stat-value">{formatBytes(resourceData.network_stats.upload)}/s</div>
                    </div>
                    <div className="network-stat">
                      <div className="stat-label">Receive</div>
                      <div className="stat-value">{formatBytes(resourceData.network_stats.download)}/s</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="processes-table-section">
                <h3>Top Processes</h3>
                <div className="table-container">
                  <table className="processes-table">
                    <thead>
                      <tr>
                        <th>Process</th>
                        <th>PID</th>
                        <th>Memory</th>
                        <th>Threads</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resourceData.top_processes.slice(0, 5).map((process, index) => (
                        <tr key={`${process.pid}-${index}`}>
                          <td className="process-name">{process.name || 'Unknown'}</td>
                          <td className="process-pid">{process.pid || 'N/A'}</td>
                          <td className="process-memory">{formatMemoryMB(process.memory_mb || 0)}</td>
                          <td className="process-threads">{process.threads || 0}</td>
                        </tr>
                      ))}
                      {resourceData.top_processes.length === 0 && (
                        <tr>
                          <td colSpan="4" className="no-data">
                            No process data available from backend
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'cpu' && (
            <div className="section-content cpu-section">
              <div className="section-header">
                <h2>CPU Performance</h2>
                <div className="section-stats">
                  <div className="main-stat">
                    <span className="stat-value">{resourceData.cpu_percent.toFixed(1)}%</span>
                    <span className="stat-label">Utilization</span>
                  </div>
                </div>
              </div>

              <div className="cpu-details-grid">
                <div className="cpu-chart-container">
                  <h3>CPU Usage History</h3>
                  <div className="chart-placeholder">
                    CPU usage from backend: {resourceData.cpu_percent.toFixed(1)}%
                  </div>
                </div>

                <div className="cpu-stats-container">
                  <h3>Processes with CPU Usage</h3>
                  <div className="table-container">
                    <table className="detailed-table">
                      <thead>
                        <tr>
                          <th>Process</th>
                          <th>PID</th>
                          <th>CPU</th>
                          <th>Memory</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resourceData.top_processes.slice(0, 10).map((process, index) => (
                          <tr key={`${process.pid}-${index}`}>
                            <td>{process.name || 'Unknown'}</td>
                            <td>{process.pid || 'N/A'}</td>
                            <td>0%</td> 
                            <td>{formatMemoryMB(process.memory_mb || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'memory' && (
            <div className="section-content memory-section">
              <div className="section-header">
                <h2>Memory</h2>
                <div className="section-stats">
                  <div className="main-stat">
                    <span className="stat-value">{calculateMemoryPercentage().toFixed(1)}%</span>
                    <span className="stat-label">In use</span>
                  </div>
                  <div className="memory-breakdown">
                    <div className="breakdown-item">
                      <span className="breakdown-label">In use:</span>
                      <span className="breakdown-value">{formatMemoryMB(resourceData.used_memory_mb)}</span>
                    </div>
                    <div className="breakdown-item">
                      <span className="breakdown-label">Available:</span>
                      <span className="breakdown-value">{formatMemoryMB(resourceData.free_memory_mb)}</span>
                    </div>
                    <div className="breakdown-item">
                      <span className="breakdown-label">Total:</span>
                      <span className="breakdown-value">{formatMemoryMB(resourceData.total_memory_mb)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="memory-grid">
                <div className="memory-chart-container">
                  <h3>Memory Composition</h3>
                  <div className="chart-placeholder">
                    Memory usage visualization
                  </div>
                </div>

                <div className="memory-processes">
                  <h3>Processes with Memory Usage</h3>
                  <div className="table-container">
                    <table className="detailed-table">
                      <thead>
                        <tr>
                          <th>Process</th>
                          <th>PID</th>
                          <th>Memory</th>
                          <th>Threads</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resourceData.top_processes
                          .sort((a, b) => (b.memory_mb || 0) - (a.memory_mb || 0))
                          .slice(0, 10)
                          .map((process, index) => (
                            <tr key={`${process.pid}-${index}`}>
                              <td>{process.name || 'Unknown'}</td>
                              <td>{process.pid || 'N/A'}</td>
                              <td>{formatMemoryMB(process.memory_mb || 0)}</td>
                              <td>{process.threads || 0}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'disk' && (
            <div className="section-content disk-section">
              <div className="section-header">
                <h2>Disk</h2>
                <div className="section-stats">
                  <div className="main-stat">
                    <span className="stat-value">{resourceData.disk_usage.percent.toFixed(1)}%</span>
                    <span className="stat-label">Used</span>
                  </div>
                  <div className="disk-breakdown">
                    <div className="breakdown-item">
                      <span className="breakdown-label">Used:</span>
                      <span className="breakdown-value">{formatBytes(resourceData.disk_usage.used)}</span>
                    </div>
                    <div className="breakdown-item">
                      <span className="breakdown-label">Free:</span>
                      <span className="breakdown-value">{formatBytes(resourceData.disk_usage.free)}</span>
                    </div>
                    <div className="breakdown-item">
                      <span className="breakdown-label">Total:</span>
                      <span className="breakdown-value">{formatBytes(resourceData.disk_usage.total)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="disk-grid">
                <div className="disk-chart-container">
                  <h3>Disk Usage</h3>
                  <div className="chart-placeholder">
                    Disk usage visualization
                  </div>
                </div>

                <div className="disk-stats-container">
                  <h3>Disk Activity</h3>
                  <div className="stats-grid">
                    <div className="stat-card">
                      <div className="stat-label">Read Speed</div>
                      <div className="stat-value">0 B/s</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-label">Write Speed</div>
                      <div className="stat-value">0 B/s</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-label">Active Time</div>
                      <div className="stat-value">0%</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'network' && (
            <div className="section-content network-section">
              <div className="section-header">
                <h2>Network</h2>
                <div className="section-stats">
                  <div className="main-stat">
                    <span className="stat-value">{resourceData.network_stats.connections}</span>
                    <span className="stat-label">Connections</span>
                  </div>
                </div>
              </div>

              <div className="network-grid">
                <div className="network-chart-container">
                  <h3>Network Activity</h3>
                  <div className="network-activity-stats">
                    <div className="network-stat-large">
                      <div className="stat-label">Send</div>
                      <div className="stat-value">{formatBytes(resourceData.network_stats.upload)}/s</div>
                    </div>
                    <div className="network-stat-large">
                      <div className="stat-label">Receive</div>
                      <div className="stat-value">{formatBytes(resourceData.network_stats.download)}/s</div>
                    </div>
                  </div>
                </div>

                <div className="network-processes">
                  <h3>Processes with Network Activity</h3>
                  <div className="table-container">
                    <table className="detailed-table">
                      <thead>
                        <tr>
                          <th>Process</th>
                          <th>PID</th>
                          <th>Send (B/s)</th>
                          <th>Receive (B/s)</th>
                          <th>Total (B/s)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resourceData.top_processes.slice(0, 10).map((process, index) => (
                          <tr key={`${process.pid}-${index}`}>
                            <td>{process.name || 'Unknown'}</td>
                            <td>{process.pid || 'N/A'}</td>
                            <td>0</td>
                            <td>0</td>
                            <td>0</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'processes' && (
            <div className="section-content processes-section">
              <div className="section-header">
                <h2>Processes</h2>
                <div className="section-stats">
                  <div className="main-stat">
                    <span className="stat-value">{resourceData.top_processes.length}</span>
                    <span className="stat-label">Running Processes</span>
                  </div>
                </div>
              </div>

              <div className="processes-full-table">
                <div className="table-container">
                  <table className="detailed-table">
                    <thead>
                      <tr>
                        <th>Process</th>
                        <th>PID</th>
                        <th>Memory</th>
                        <th>Threads</th>
                        <th>Start Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resourceData.top_processes.map((process, index) => (
                        <tr key={`${process.pid}-${index}`}>
                          <td>{process.name || 'Unknown'}</td>
                          <td>{process.pid || 'N/A'}</td>
                          <td>{formatMemoryMB(process.memory_mb || 0)}</td>
                          <td>{process.threads || 0}</td>
                          <td>
                            {process.start_time ? 
                              new Date(process.start_time).toLocaleTimeString() : 
                              'Unknown'}
                          </td>
                        </tr>
                      ))}
                      {resourceData.top_processes.length === 0 && (
                        <tr>
                          <td colSpan="5" className="no-data">
                            No process data available from backend
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ResourceMonitor;
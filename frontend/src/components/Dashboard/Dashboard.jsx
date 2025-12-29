import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useWebSocket } from '../../Context/WebSocketContext';
import './Dashboard.css';

const Dashboard = () => {
  const { isConnected, sendCommand, getCommandResponse, addListener } = useWebSocket();
  const [systemInfo, setSystemInfo] = useState({
    hostname: 'Loading...',
    os: 'Loading...',
    uptime: 'Loading...',
    cpuUsage: 'Loading...',
    users: 'Loading...',
    userDetails: 'Loading...'
  });

  const [showCpuGraph, setShowCpuGraph] = useState(false);
  const [cpuHistory, setCpuHistory] = useState([]);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);

  const commandsSentRef = useRef(new Set());
  const initialLoadRef = useRef(false);
  const refreshTimeoutRef = useRef(null);
  const commandTimeoutsRef = useRef([]);

  useEffect(() => {
    console.log('DEBUG - Current state:', {
      isConnected,
      dataLoaded,
      systemInfo,
      commandsSent: Array.from(commandsSentRef.current)
    });
  }, [isConnected, dataLoaded, systemInfo]);

  useEffect(() => {
    const removeListener = addListener((data) => {

      if (data.action === 'response' && data.command && data.result) {
        console.log('Processing response:', data.command, data.result);

        const result = data.result;

        if (data.command === 'get_hostname' && result.status === 'success') {
          const hostname = result.data?.hostname || 'Unknown';
          setSystemInfo(prev => ({
            ...prev,
            hostname: hostname
          }));
          setDataLoaded(true);
        }

        if (data.command === 'get_os_info' && result.status === 'success') {
          const osData = result.data;
          const osText = `${osData.caption || ''} ${osData.version || ''} (${osData.architecture || ''})`.trim();
          console.log('Setting OS:', osText);
          setSystemInfo(prev => ({
            ...prev,
            os: osText || 'Windows OS'
          }));
          setDataLoaded(true);
        }

        if (data.command === 'get_uptime' && result.status === 'success') {
          const uptimeData = result.data;
          const uptimeText = `${uptimeData.days || 0}d ${uptimeData.hours || 0}h ${uptimeData.minutes || 0}m`;
          console.log('Setting uptime:', uptimeText);
          setSystemInfo(prev => ({
            ...prev,
            uptime: uptimeText
          }));
          setDataLoaded(true);
        }

        if (data.command === 'get_cpu_usage' && result.status === 'success') {
          const cpuPercent = result.data?.cpu_percent || 0;
          console.log('Setting CPU usage:', cpuPercent + '%');
          setSystemInfo(prev => ({
            ...prev,
            cpuUsage: `${cpuPercent}%`
          }));

          setCpuHistory(prev => {
            const newHistory = [...prev, cpuPercent];
            return newHistory.slice(-12);
          });
          setDataLoaded(true);
        }

        if (data.command === 'get_logged_users' && result.status === 'success') {
          const userData = result.data;
          const enabledUsers = Array.isArray(userData) ? userData.filter(user => user.Enabled) : [];
          const userNames = enabledUsers.map(user => user.Name).join(', ') || 'No active users';
          console.log('Setting users:', enabledUsers.length, userNames);

          setSystemInfo(prev => ({
            ...prev,
            users: enabledUsers.length.toString(),
            userDetails: userNames
          }));
          setDataLoaded(true);
        }

        if (isRefreshing) {
          setIsRefreshing(false);

          if (refreshTimeoutRef.current) {
            clearTimeout(refreshTimeoutRef.current);
            refreshTimeoutRef.current = null;
          }
        }
      }
    });

    return () => removeListener();
  }, [addListener, isRefreshing]);

  const refreshData = useCallback(() => {
    if (isConnected && !isRefreshing) {
      setIsRefreshing(true);

      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }

      commandTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      commandTimeoutsRef.current = [];

      try {
        const commands = [
          'get_hostname',
          'get_os_info',
          'get_uptime',
          'get_cpu_usage',
          'get_logged_users'
        ];

        commandsSentRef.current.clear();

        commands.forEach((command, index) => {
          const timeoutId = setTimeout(() => {
            if (!commandsSentRef.current.has(command) && isConnected) {
              commandsSentRef.current.add(command);
              sendCommand(command);
              console.log(`Sent: ${command}`);
            }
          }, index * 500);
          commandTimeoutsRef.current.push(timeoutId);
        });

        setLastRefresh(new Date());

        refreshTimeoutRef.current = setTimeout(() => {
          if (isRefreshing) {
            console.log('Refresh timeout - stopping');
            setIsRefreshing(false);
            commandsSentRef.current.clear();
          }
        }, 10000);

      } catch (error) {
        console.error('Error during refresh:', error);
        setIsRefreshing(false);
        commandsSentRef.current.clear();
      }
    }
  }, [isConnected, sendCommand, isRefreshing]);

  useEffect(() => {
    if (isConnected && !initialLoadRef.current) {
      initialLoadRef.current = true;

      setSystemInfo({
        hostname: 'Loading...',
        os: 'Loading...',
        uptime: 'Loading...',
        cpuUsage: 'Loading...',
        users: 'Loading...',
        userDetails: 'Loading...'
      });

      const commands = [
        'get_hostname',
        'get_os_info',
        'get_uptime',
        'get_cpu_usage',
        'get_logged_users'
      ];

      commands.forEach((command, index) => {
        setTimeout(() => {
          if (isConnected) {
            commandsSentRef.current.add(command);
            sendCommand(command);
            console.log(`Initial command sent: ${command}`);
          }
        }, index * 800);
      });

      setTimeout(() => {
        if (!dataLoaded) {
          checkStoredResponses();
        }
      }, 8000);
    }
  }, [isConnected, sendCommand, dataLoaded]);

  const checkStoredResponses = useCallback(() => {
    const responses = {
      hostname: getCommandResponse('get_hostname'),
      os: getCommandResponse('get_os_info'),
      uptime: getCommandResponse('get_uptime'),
      cpu: getCommandResponse('get_cpu_usage'),
      users: getCommandResponse('get_logged_users')
    };

    console.log('Stored responses available:', Object.keys(responses).filter(key => responses[key]));

    let hasNewData = false;
    const updates = {};

    if (responses.hostname && responses.hostname.status === 'success' && responses.hostname.data?.hostname) {
      updates.hostname = responses.hostname.data.hostname;
      hasNewData = true;
      console.log('Found hostname in stored responses:', responses.hostname.data.hostname);
    }

    if (responses.os && responses.os.status === 'success' && responses.os.data) {
      const osData = responses.os.data;
      updates.os = `${osData.caption || ''} ${osData.version || ''} (${osData.architecture || ''})`.trim();
      hasNewData = true;
      console.log('Found OS info in stored responses:', updates.os);
    }

    if (responses.uptime && responses.uptime.status === 'success' && responses.uptime.data) {
      const uptimeData = responses.uptime.data;
      updates.uptime = `${uptimeData.days || 0}d ${uptimeData.hours || 0}h ${uptimeData.minutes || 0}m`;
      hasNewData = true;
      console.log('Found uptime in stored responses:', updates.uptime);
    }

    if (responses.cpu && responses.cpu.status === 'success' && responses.cpu.data?.cpu_percent !== undefined) {
      updates.cpuUsage = `${responses.cpu.data.cpu_percent}%`;
      hasNewData = true;
      console.log('Found CPU usage in stored responses:', updates.cpuUsage);
    }

    if (responses.users && responses.users.status === 'success' && Array.isArray(responses.users.data)) {
      const enabledUsers = responses.users.data.filter(user => user.Enabled);
      updates.users = enabledUsers.length.toString();
      updates.userDetails = enabledUsers.map(user => user.Name).join(', ') || 'No active users';
      hasNewData = true;
      console.log('Found users in stored responses:', updates.users, updates.userDetails);
    }

    if (hasNewData) {
      console.log('Updating from stored responses:', updates);
      setSystemInfo(prev => ({ ...prev, ...updates }));
      setDataLoaded(true);
    }
  }, [getCommandResponse]);

  useEffect(() => {
    if (!isConnected || dataLoaded) return;

    const interval = setInterval(() => {
      checkStoredResponses();
    }, 3000);

    return () => clearInterval(interval);
  }, [isConnected, dataLoaded, checkStoredResponses]);

  const fetchCpuData = useCallback(() => {
    if (isConnected) {
      sendCommand('get_cpu_usage');
    }
  }, [isConnected, sendCommand]);

  useEffect(() => {
    let interval;

    if (showCpuGraph && isConnected) {
      fetchCpuData();
      interval = setInterval(fetchCpuData, 5 * 60 * 1000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [showCpuGraph, isConnected, fetchCpuData]);

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      commandTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    };
  }, []);

  const toggleCpuGraph = () => {
    setShowCpuGraph(!showCpuGraph);

    if (!showCpuGraph) {
      fetchCpuData();
    }
  };

  const getTimeLabels = () => {
    const labels = [];
    for (let i = 0; i < 12; i++) {
      if (i === 0) {
        labels.push('Now');
      } else {
        labels.push(`${i} min ago`);
      }
    }
    return labels;
  };

  const formatLastRefresh = () => {
    return lastRefresh ? lastRefresh.toLocaleTimeString() : 'Never';
  };

  const isRealData = dataLoaded && systemInfo.hostname !== 'Loading...';

  return (
    <div className="dashboard-container">
      <div className="dashboard-content">
        <div className="dashboard-header">
          <div className="header-content">
            <div className="header-left">
              <h1 className="dashboard-main-title">Automation</h1>
              <h2 className="dashboard-subtitle">Dashboard</h2>
            </div>
            <div className="header-right">
              <div className={isConnected ? 'status-connected' : 'status-disconnected'}>
                {isConnected ? 'Connected' : 'Disconnected'}
              </div>
              <button
                className={`refresh-button ${isRefreshing ? 'refreshing' : ''}`}
                onClick={refreshData}
                disabled={isRefreshing || !isConnected}
              >
                <span className="refresh-icon">↻</span>
                {isRefreshing ? 'Refreshing...' : 'Refresh Data'}
              </button>
            </div>
          </div>
        </div>

        <div className="dashboard-main-grid">
          <div className="left-spacer"></div>

          <div className="content-area">
            <div className="system-info-card uniform-card">
              <h3 className="section-title">System Connection</h3>
              <div className={`connection-subtitle ${isRealData ? 'real-data' : 'waiting-data'}`}>
                {isRealData ? '' : 'Waiting for Data...'}
              </div>
              <div className="info-grid">
                <div className="md-colspan-2">
                  <label className="info-label">Token:</label>
                  <div className="info-value token-value">
                    Authenticated
                  </div>
                </div>
                <div>
                  <label className="info-label">Hostname:</label>
                  <div className={`info-value ${systemInfo.hostname !== 'Loading...' ? 'real-data-value' : 'loading-data'}`}>
                    {systemInfo.hostname}
                  </div>
                </div>
                <div>
                  <label className="info-label">OS:</label>
                  <div className={`info-value ${systemInfo.os !== 'Loading...' ? 'real-data-value' : 'loading-data'}`}>
                    {systemInfo.os}
                  </div>
                </div>
              </div>
            </div>

            <div className="stats-layout">
              <div className="small-cards-container">
                <div className="stat-card-small">
                  <div className="stat-card-header">
                    <h3 className="stat-card-title">Active Devices</h3>
                  </div>
                  <div className="stat-card-content">
                    <div className="devices-count">
                      {isConnected ? '1' : '0'}
                    </div>
                    <div className="devices-label">Connected Device</div>
                    <div className={`status-badge ${isConnected ? 'status-online' : 'status-offline'}`}>
                      {isConnected ? 'Online' : 'Offline'}
                    </div>
                  </div>
                </div>

                <div className="stat-card-small">
                  <div className="stat-card-header">
                    <h3 className="stat-card-title">Uptime</h3>
                  </div>
                  <div className="stat-card-content">
                    <div className={`stat-value-main ${systemInfo.uptime !== 'Loading...' ? 'real-data-value' : 'loading-data'}`}>
                      {systemInfo.uptime}
                    </div>
                    {lastRefresh && (
                      <div className="last-refresh">Last refresh: {formatLastRefresh()}</div>
                    )}
                  </div>
                </div>

                <div className="stat-card-small">
                  <div className="stat-card-header">
                    <h3 className="stat-card-title">Active Users</h3>
                  </div>
                  <div className="stat-card-content">
                    <div className={`stat-value-main ${systemInfo.users !== 'Loading...' ? 'real-data-value' : 'loading-data'}`}>
                      {systemInfo.users}
                    </div>
                    <div className={`users-list ${systemInfo.userDetails !== 'Loading...' ? 'real-data-value' : 'loading-data'}`}>
                      {systemInfo.userDetails}
                    </div>
                  </div>
                </div>
              </div>

              <div className="cpu-card-container">
                <div className={`stat-card-cpu ${showCpuGraph ? 'with-graph' : ''}`}>
                  <div className="stat-card-header">
                    <h3 className="stat-card-title">CPU Usage</h3>
                  </div>
                  <div className="stat-card-content">
                    <div className={`stat-value-main ${systemInfo.cpuUsage !== 'Loading...' ? 'real-data-value' : 'loading-data'}`}>
                      {systemInfo.cpuUsage}
                    </div>
                    <button className="graph-link" onClick={toggleCpuGraph}>
                      {showCpuGraph ? 'Click to hide graph' : 'Click to view graph'}
                    </button>

                    {showCpuGraph && (
                      <div className="cpu-graph-container">
                        <div className="graph-header">
                          <h4 className="graph-title">CPU Usage History</h4>
                          <div className="refresh-info">
                            Last refresh: {formatLastRefresh()}
                          </div>
                        </div>
                        <div className="simple-cpu-graph">
                          <div className="graph-y-labels">
                            <div className="y-label">80%</div>
                            <div className="y-label">60%</div>
                            <div className="y-label">40%</div>
                            <div className="y-label">20%</div>
                            <div className="y-label">0%</div>
                          </div>

                          <div className="graph-area">
                            <div className="grid-line" style={{ top: '0%' }}></div>
                            <div className="grid-line" style={{ top: '25%' }}></div>
                            <div className="grid-line" style={{ top: '50%' }}></div>
                            <div className="grid-line" style={{ top: '75%' }}></div>
                            <div className="grid-line" style={{ top: '100%' }}></div>

                            <div className="graph-bars-simple">
                              {cpuHistory.length > 0 ? (
                                cpuHistory.map((cpu, index) => (
                                  <div key={index} className="bar-container">
                                    <div
                                      className="cpu-bar"
                                      style={{ height: `${cpu}%` }}
                                      title={`${cpu}%`}
                                    >
                                      <span className="bar-value">{cpu}%</span>
                                    </div>
                                    <div className="time-label">{getTimeLabels()[index]}</div>
                                  </div>
                                ))
                              ) : (
                                <div className="no-data-message">
                                  No CPU data available yet
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="graph-footer">
                          {cpuHistory.length > 0 ? 'Auto-refreshes every 5 minutes' : 'Waiting for CPU data...'}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="right-spacer"></div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
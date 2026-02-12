import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useWebSocket } from '../../Context/WebSocketContext';
import './Dashboard.css';

const Dashboard = () => {
  const { isConnected, sendCommand, addListener } = useWebSocket();
  const [windowsDetails, setWindowsDetails] = useState([]);
  const [totalMachines, setTotalMachines] = useState(0);
  const [totalNetworkDevices, setTotalNetworkDevices] = useState(0);
  const [showCpuGraphs, setShowCpuGraphs] = useState(false);
  const [cpuHistories, setCpuHistories] = useState({});
  const [lastRefresh, setLastRefresh] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [error, setError] = useState(null);
  const [showCreateServerModal, setShowCreateServerModal] = useState(false);
  const [summaryData, setSummaryData] = useState(null);

  const commandsSentRef = useRef(new Set());
  const initialLoadRef = useRef(false);
  const refreshTimeoutRef = useRef(null);
  const commandTimeoutsRef = useRef([]);

  useEffect(() => {
    const handleWebSocketMessage = (data) => {
      console.log('Dashboard WebSocket message:', data);

      let command, result;
      
      if (data.type === 'COMMAND_RESPONSE' && data.command && data.data) {
        command = data.command;
        result = data.data;
      } else if (data.action === 'response' && data.command && data.result) {
        command = data.command;
        result = data.result;
      } else {
        return; 
      }

      console.log(`Processing response for command: ${command}`, result);

      if (command === 'get_all_server_details_dashboard') {
        console.log('Stopping refresh state for dashboard command');
        setIsRefreshing(false);
        
        const success = result.success === true || 
                       (result.windows1 && result.windows2) || 
                       result.machines;
        
        if (!success) {
          console.error('Dashboard command failed:', result.error || result.message);
          setError(result.error || result.message || 'Failed to fetch server details');
          setDataLoaded(false);
          return;
        }

        console.log('Received server details:', result);

        let machinesArray = [];
        
        if (result.machines && Array.isArray(result.machines)) {
          machinesArray = result.machines;
        } 
        else if (result.windows1 || result.windows2) {
          machinesArray = [];
          
          Object.keys(result).forEach(key => {
            if (key.startsWith('windows') && typeof result[key] === 'object') {
              const machineData = result[key];
              machinesArray.push({
                id: `machine_${key.replace('windows', '')}`,
                name: `Windows-${machineData.ip || machineData.hostname || key}`,
                ip_address: machineData.ip || 'Unknown',
                username: 'Administrator', 
                status: 'online', 
                os_version: 'Windows OS',
                cpu_cores: 0,
                memory_gb: 0,
                disk_gb: 0,
                last_seen: new Date().toISOString(),
                services: {
                  dhcp_installed: false,
                  dns_installed: false,
                  active_directory: false
                },
                performance: {
                  cpu_usage: machineData.cpu_usage ? parseFloat(machineData.cpu_usage.replace('%', '')) : 0,
                  memory_usage: 0,
                  disk_usage: 0,
                  network_in_mbps: 0,
                  network_out_mbps: 0
                }
              });
            }
          });
        }

        if (machinesArray.length > 0) {
          const newCpuHistories = { ...cpuHistories };

          machinesArray.forEach((machine, index) => {
            const machineKey = `machine_${index + 1}`;
            const cpuValue = machine.performance?.cpu_usage ? parseFloat(machine.performance.cpu_usage) : 0;
            
            if (!newCpuHistories[machineKey]) {
              newCpuHistories[machineKey] = [];
            }
            const updatedHistory = [...newCpuHistories[machineKey], cpuValue];
            newCpuHistories[machineKey] = updatedHistory.slice(-12); 
          });

          setWindowsDetails(machinesArray);
          setCpuHistories(newCpuHistories);
          
          if (result.summary) {
            setSummaryData(result.summary);
          } else if (machinesArray.length > 0) {
            const totalMachines = machinesArray.length;
            const onlineMachines = machinesArray.filter(m => m.status === 'online').length;
            const offlineMachines = totalMachines - onlineMachines;
            
            const totalCpu = machinesArray.reduce((sum, machine) => {
              return sum + (machine.performance?.cpu_usage || 0);
            }, 0);
            
            const totalMemory = machinesArray.reduce((sum, machine) => {
              return sum + (machine.performance?.memory_usage || 0);
            }, 0);
            
            const avgCpuUsage = totalCpu / totalMachines;
            const avgMemoryUsage = totalMemory / totalMachines;
            
            setSummaryData({
              total_machines: totalMachines,
              online_machines: onlineMachines,
              offline_machines: offlineMachines,
              dhcp_installed: machinesArray.filter(m => m.services?.dhcp_installed).length,
              dns_installed: machinesArray.filter(m => m.services?.dns_installed).length,
              avg_cpu_usage: avgCpuUsage,
              avg_memory_usage: avgMemoryUsage,
              timestamp: new Date().toISOString()
            });
          }
          
          setDataLoaded(true);
          setLastRefresh(new Date());
          setError(null);
          console.log(`Successfully loaded ${machinesArray.length} machines`);

        } else {
          console.error('No valid machine data found in response:', result);
          setError('No valid machine data received from server');
          setDataLoaded(false);
        }

        if (refreshTimeoutRef.current) {
          clearTimeout(refreshTimeoutRef.current);
          refreshTimeoutRef.current = null;
        }
      }
    };

    const removeListener = addListener(handleWebSocketMessage);

    return () => {
      removeListener();
    };
  }, [addListener, cpuHistories]);

  const fetchAllWindowsDetails = useCallback(() => {
    if (!isConnected) {
      console.log('Cannot fetch server details: Not connected to backend');
      setError('Not connected to backend system');
      setIsRefreshing(false);
      setDataLoaded(false);
      return;
    }

    console.log('Starting to fetch all server details...');

    fetch('http://localhost:5000/api/machines/get-machines?include_password=true', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(machinesData => {
      console.log('Fetched machines from REST API:', machinesData);
      
      let machines = [];
      if (machinesData.machines && Array.isArray(machinesData.machines)) {
        machines = machinesData.machines;
      } else if (machinesData.data && Array.isArray(machinesData.data)) {
        machines = machinesData.data;
      } else if (Array.isArray(machinesData)) {
        machines = machinesData;
      }

      const machineCount = machines.length;
      setTotalMachines(machineCount);

      fetch('http://localhost:5000/api/network-devices/get-network-devices', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then(networkData => {
        console.log('Fetched network devices from REST API:', networkData);
        
        let networkDevices = [];
        if (networkData.network_devices && Array.isArray(networkData.network_devices)) {
          networkDevices = networkData.network_devices;
        } else if (networkData.data && Array.isArray(networkData.data)) {
          networkDevices = networkData.data;
        } else if (Array.isArray(networkData)) {
          networkDevices = networkData;
        }
        
        const networkDeviceCount = networkDevices.length;
        setTotalNetworkDevices(networkDeviceCount);

        const windowsMachines = machines.filter(machine => 
          machine.password || machine.password_provided
        );

        console.log(`Found ${windowsMachines.length} Windows machines with credentials`);

        const markedMachines = machines.filter(machine => 
          machine.marked_as && Array.isArray(machine.marked_as) && machine.marked_as.length > 0
        );

        if (markedMachines.length === 0) {
          setShowCreateServerModal(true);
          setIsRefreshing(false);
          setDataLoaded(false);
          console.log('No marked machines found, showing modal');
          return;
        }

        if (windowsMachines.length === 0) {
          setError('No Windows machines found with credentials. Please add machine credentials first.');
          setIsRefreshing(false);
          setDataLoaded(false);
          console.log('No Windows machines with credentials');
          return;
        }

        const payload = {};
        
        windowsMachines.forEach((machine, index) => {
          const serverKey = `server_info${index + 1}`;
          payload[serverKey] = {
            ip: machine.ip,
            username: machine.username || machine.username_provided || 'Administrator',
            password: machine.password || machine.password_provided,
            os_type: machine.os_type || '',
            sub_os_type: machine.sub_os_type || ''
          };
        });

        console.log('Sending get_all_server_details_dashboard with payload:', {
          ...payload,
          server_info1: payload.server_info1 ? { ...payload.server_info1, password: '***HIDDEN***' } : null,
          server_info2: payload.server_info2 ? { ...payload.server_info2, password: '***HIDDEN***' } : null
        });

        sendCommand('get_all_server_details_dashboard', payload);
        
        commandsSentRef.current.add('get_all_server_details_dashboard');

        if (refreshTimeoutRef.current) {
          clearTimeout(refreshTimeoutRef.current);
        }

        refreshTimeoutRef.current = setTimeout(() => {
          if (isRefreshing) {
            console.log('Dashboard refresh timeout - no response received');
            setIsRefreshing(false);
            setDataLoaded(false);
            setError('Timeout: No response from server after 30 seconds');
          }
        }, 30000);

      })
      .catch(err => {
        console.error('Failed to fetch network devices:', err);
        setTotalNetworkDevices(0);
        setIsRefreshing(false);
        setDataLoaded(false);
        setError(`Failed to fetch network devices: ${err.message}`);
      });

    })
    .catch(err => {
      console.error('Failed to fetch machines:', err);
      setError(`Failed to fetch machine data: ${err.message}`);
      setIsRefreshing(false);
      setDataLoaded(false);
    });

  }, [isConnected, sendCommand, isRefreshing]);

  const refreshData = useCallback(() => {
    if (isConnected && !isRefreshing) {
      console.log('Starting dashboard refresh...');
      setIsRefreshing(true);
      setDataLoaded(false);
      setError(null);
      setWindowsDetails([]);
      setSummaryData(null);

      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }

      commandTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
      commandTimeoutsRef.current = [];

      try {
        fetchAllWindowsDetails();
        setLastRefresh(new Date());

      } catch (error) {
        console.error('Error during refresh:', error);
        setIsRefreshing(false);
        setDataLoaded(false);
        setError(`Refresh error: ${error.message}`);
        commandsSentRef.current.clear();
      }
    } else {
      console.log('Refresh skipped - already refreshing or not connected', {
        isConnected,
        isRefreshing
      });
    }
  }, [isConnected, isRefreshing, fetchAllWindowsDetails]);


  useEffect(() => {
    console.log('Dashboard useEffect - isConnected:', isConnected, 'initialLoadRef:', initialLoadRef.current);

    if (isConnected && !initialLoadRef.current) {
      initialLoadRef.current = true;
      
      console.log('Dashboard initial load triggered');
      setDataLoaded(false);
      setError(null);
      
      const timeoutId = setTimeout(() => {
        refreshData();
      }, 1000);
      
      return () => clearTimeout(timeoutId);
    }
  }, [isConnected, refreshData]);


  useEffect(() => {
    if (isConnected && isRefreshing && !dataLoaded) {
      console.log('WebSocket reconnected while refreshing, retrying...');
      refreshData();
    }
  }, [isConnected, isRefreshing, dataLoaded, refreshData]);

  useEffect(() => {
    if (isRefreshing && !dataLoaded) {
      refreshTimeoutRef.current = setTimeout(() => {
        if (isRefreshing && !dataLoaded) {
          console.log('Safety timeout reached, still refreshing but no response yet');
          console.log('Current state - isRefreshing:', isRefreshing, 'dataLoaded:', dataLoaded);
        }
      }, 30000); 
    }

    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [isRefreshing, dataLoaded]);

  const toggleCpuGraphs = () => {
    setShowCpuGraphs(!showCpuGraphs);
  };

  const getTimeLabels = () => {
    const labels = [];
    for (let i = 0; i < 12; i++) {
      if (i === 0) {
        labels.push('Now');
      } else {
        labels.push(`${i * 5} min ago`);
      }
    }
    return labels;
  };

  const formatLastRefresh = () => {
    return lastRefresh ? lastRefresh.toLocaleTimeString() : 'Never';
  };

  const formatLastSeen = (lastSeen) => {
    if (!lastSeen) return 'Unknown';
    try {
      const date = new Date(lastSeen);
      return date.toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
      });
    } catch (e) {
      return 'Invalid date';
    }
  };

  const calculateAverageCpu = () => {
    if (summaryData && summaryData.avg_cpu_usage) {
      return `${summaryData.avg_cpu_usage.toFixed(1)}%`;
    }
    
    const machines = windowsDetails;
    if (machines.length === 0) return '0%';
    
    const totalCpu = machines.reduce((sum, machine) => {
      const cpuValue = machine.performance?.cpu_usage ? parseFloat(machine.performance.cpu_usage) : 0;
      return sum + cpuValue;
    }, 0);
    
    const avgCpu = totalCpu / machines.length;
    return `${avgCpu.toFixed(1)}%`;
  };

  const calculateAverageMemory = () => {
    if (summaryData && summaryData.avg_memory_usage) {
      return `${summaryData.avg_memory_usage.toFixed(1)}%`;
    }
    
    const machines = windowsDetails;
    if (machines.length === 0) return '0%';
    
    const totalMemory = machines.reduce((sum, machine) => {
      const memoryValue = machine.performance?.memory_usage ? parseFloat(machine.performance.memory_usage) : 0;
      return sum + memoryValue;
    }, 0);
    
    const avgMemory = totalMemory / machines.length;
    return `${avgMemory.toFixed(1)}%`;
  };

  const getDisplayHostname = () => {
    const machines = windowsDetails;
    if (machines.length === 0) return 'No machines';
    
    const firstMachine = machines[0];
    return firstMachine.name || 'Unknown';
  };

  const getDisplayIp = () => {
    const machines = windowsDetails;
    if (machines.length === 0) return 'N/A';
    
    const firstMachine = machines[0];
    return firstMachine.ip_address || 'N/A';
  };

  const getActiveDevicesCount = () => {
    if (summaryData) {
      return summaryData.online_machines || 0;
    }
    return windowsDetails.filter(machine => machine.status === 'online').length;
  };

  const CreateServerModal = () => {
    if (!showCreateServerModal) return null;

    return (
      <div className="modal-overlay">
        <div className="modal-container">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">No Marked Machines Found</h3>
            </div>
            <div className="modal-body">
              <div className="modal-message">
                <p>No machines are currently marked for management.</p>
                <p>Do you want to create a server to get started?</p>
              </div>
              
              <div className="modal-actions">
                <button 
                  className="modal-btn-primary"
                  onClick={() => {
                    setShowCreateServerModal(false);
                    window.location.href = '/esxi';
                  }}
                >
                  Yes, Create Server
                </button>
                <button 
                  className="modal-btn-secondary"
                  onClick={() => {
                    setShowCreateServerModal(false);
                    setError('Please mark machines in Machine Management to view dashboard data.');
                    setIsRefreshing(false);
                  }}
                >
                  No, Stay on Dashboard
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const MiniCpuGraph = ({ cpuHistory, currentCpu, machineName }) => {
    const history = cpuHistory || [];
    
    const displayHistory = history.length > 0 ? history.slice(-6) : Array(6).fill(currentCpu || 0);
    
    return (
      <div className="mini-cpu-graph">
        <div className="mini-graph-header">
          <h4 className="mini-graph-title">{machineName}</h4>
          <div className="mini-current-cpu">
            Current: <span className="cpu-value-highlight">{currentCpu?.toFixed(1) || 0}%</span>
          </div>
        </div>
        <div className="mini-graph-container">
          <div className="mini-graph-bars">
            {displayHistory.map((cpu, index) => {
              const height = Math.min(cpu, 100);
              let barClass = 'mini-bar';
              
              if (cpu > 80) barClass += ' high';
              else if (cpu > 50) barClass += ' medium';
              else barClass += ' low';
              
              return (
                <div key={index} className="mini-bar-container">
                  <div 
                    className={barClass}
                    style={{ height: `${height}%` }}
                    title={`${cpu.toFixed(1)}%`}
                  >
                    <span className="mini-bar-value">{cpu.toFixed(0)}%</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mini-graph-labels">
            <span className="mini-label">-5m</span>
            <span className="mini-label">-4m</span>
            <span className="mini-label">-3m</span>
            <span className="mini-label">-2m</span>
            <span className="mini-label">-1m</span>
            <span className="mini-label">Now</span>
          </div>
        </div>
      </div>
    );
  };

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
      commandTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
    };
  }, []);

  const windowsMachinesCount = windowsDetails.length;
  const isRealData = dataLoaded && windowsMachinesCount > 0;
  const totalConnectedDevices = totalMachines + totalNetworkDevices;
  const activeDevices = getActiveDevicesCount();

  console.log('RENDER - Current state:', {
    isConnected,
    isRefreshing,
    dataLoaded,
    isRealData,
    windowsMachinesCount,
    windowsDetails: windowsDetails.length,
    summaryData: !!summaryData,
    error
  });

  return (
    <div className="dashboard-container">
      <div className="dashboard-content">
        <div className="dashboard-header">
          <div className="header-content">
            <div className="header-left">
              <h1 className="dashboard-main-title">
                <span className="automation-text">Automation</span>
                <span className="dashboard-text">Dashboard</span>
              </h1>
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
              <h3 className="section-title">System Overview</h3>
              
              {!isRefreshing && !isRealData && !showCreateServerModal && (
                <div className="connection-subtitle waiting-data">
                  {error || 'Click "Refresh Data" to load dashboard information'}
                </div>
              )}
              
              {isRefreshing && (
                <div className="connection-subtitle refreshing-data">
                  Refreshing data from Windows machines...
                </div>
              )}
              
              {isRealData && (
                <>
                  <div className="connection-subtitle real-data">
                    {windowsMachinesCount} Windows machine(s) connected
                  </div>
                  
                  <div className="table-container">
                    <table className="system-overview-table">
                      <tbody>
                        <tr>
                          <td className="table-label">Sample Machine:</td>
                          <td className="table-value">{getDisplayHostname()} ({getDisplayIp()})</td>
                        </tr>
                        <tr>
                          <td className="table-label">Active Devices:</td>
                          <td className="table-value">{activeDevices} / {windowsMachinesCount}</td>
                        </tr>
                        <tr>
                          <td className="table-label">OS Version:</td>
                          <td className="table-value">{windowsDetails[0]?.os_version || 'Unknown'}</td>
                        </tr>
                        {summaryData && (
                          <>
                            <tr>
                              <td className="table-label">Total Machines:</td>
                              <td className="table-value">{summaryData.total_machines}</td>
                            </tr>
                            <tr>
                              <td className="table-label">Online Machines:</td>
                              <td className="table-value">{summaryData.online_machines}</td>
                            </tr>
                            <tr>
                              <td className="table-label">Offline Machines:</td>
                              <td className="table-value">{summaryData.offline_machines}</td>
                            </tr>
                            <tr>
                              <td className="table-label">DHCP Installed:</td>
                              <td className="table-value">{summaryData.dhcp_installed}</td>
                            </tr>
                            <tr>
                              <td className="table-label">DNS Installed:</td>
                              <td className="table-value">{summaryData.dns_installed}</td>
                            </tr>
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>

            {isRealData && (
              <>
                <div className="stats-layout">
                  <div className="stat-card-small">
                    <div className="stat-card-header">
                      <h3 className="stat-card-title">Active Devices</h3>
                    </div>
                    <div className="stat-card-content">
                      <div className="devices-count real-data-value">
                        {activeDevices}
                      </div>
                      <div className="devices-label">
                        Active Windows Machines
                      </div>
                      <div className="device-breakdown">
                        <div className="device-type">
                          <span className="device-type-label">Total Machines:</span>
                          <span className="device-type-value">{windowsMachinesCount}</span>
                        </div>
                        <div className="device-type">
                          <span className="device-type-label">Online:</span>
                          <span className={`device-type-value ${activeDevices > 0 ? 'online' : 'offline'}`}>
                            {activeDevices}
                          </span>
                        </div>
                      </div>
                      <div className={`status-badge ${isConnected ? 'status-online' : 'status-offline'}`}>
                        {isConnected ? 'WebSocket Connected' : 'WebSocket Disconnected'}
                      </div>
                    </div>
                  </div>

                  <div className="stat-card-small">
                    <div className="stat-card-header">
                      <h3 className="stat-card-title">CPU Usage</h3>
                    </div>
                    <div className="stat-card-content">
                      <div className="stat-value-main real-data-value">
                        {calculateAverageCpu()}
                      </div>
                      <div className="cpu-breakdown">
                        {summaryData && (
                          <div className="cpu-details">
                            <span>Average across {windowsMachinesCount} machines</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="stat-card-small">
                    <div className="stat-card-header">
                      <h3 className="stat-card-title">Memory Usage</h3>
                    </div>
                    <div className="stat-card-content">
                      <div className="stat-value-main real-data-value">
                        {calculateAverageMemory()}
                      </div>
                      <div className="memory-details">
                        <div className="memory-machine">
                          <span className="machine-name">{windowsDetails[0]?.name}:</span>
                          <span className="memory-value">
                            {windowsDetails[0]?.performance?.memory_usage?.toFixed(1) || '0'}%
                          </span>
                        </div>
                        {windowsDetails.length > 1 && (
                          <div className="more-machines">+ {windowsDetails.length - 1} more machines</div>
                        )}
                      </div>
                      {lastRefresh && (
                        <div className="last-refresh">Last refresh: {formatLastRefresh()}</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="cpu-graphs-card uniform-card">
                  <div className="graph-card-header">
                    <h3 className="section-title">CPU Usage History</h3>
                    <div className="graph-card-controls">
                      <button 
                        className="graph-toggle-btn"
                        onClick={toggleCpuGraphs}
                      >
                        {showCpuGraphs ? 'Hide CPU Graphs' : 'View CPU Graphs'}
                      </button>
                      <div className="machine-label">
                        {windowsMachinesCount} Windows machine(s)
                      </div>
                    </div>
                  </div>
                  
                  <div className="graph-card-content">
                    {!showCpuGraphs ? (
                      <div className="graph-placeholder">
                        <div className="placeholder-content">
                          <h4>CPU Usage Graphs</h4>
                          <p>Click "View CPU Graphs" button to see individual CPU usage history for each machine</p>
                        </div>
                      </div>
                    ) : (
                      <div className="individual-graphs-container">
                        <div className="graphs-header">
                          <h4 className="graphs-title">Individual CPU Usage History</h4>
                          <div className="refresh-info">
                            Last refresh: {formatLastRefresh()}
                          </div>
                        </div>
                        
                        <div className="mini-graphs-grid">
                          {windowsDetails.map((machine, index) => {
                            const machineKey = `machine_${index + 1}`;
                            const cpuHistory = cpuHistories[machineKey] || [];
                            const currentCpu = machine.performance?.cpu_usage || 0;
                            
                            return (
                              <div key={machineKey} className="mini-graph-card">
                                <MiniCpuGraph 
                                  cpuHistory={cpuHistory}
                                  currentCpu={currentCpu}
                                  machineName={machine.name}
                                />
                              </div>
                            );
                          })}
                        </div>
                        
                        <div className="graphs-footer">
                          <div className="graphs-legend">
                            <div className="legend-item">
                              <span className="legend-color low"></span>
                              <span className="legend-text">Low (≤ 50%)</span>
                            </div>
                            <div className="legend-item">
                              <span className="legend-color medium"></span>
                              <span className="legend-text">Medium (51-80%)</span>
                            </div>
                            <div className="legend-item">
                              <span className="legend-color high"></span>
                              <span className="legend-text">High (80%)</span>
                            </div>
                          </div>
                          <div className="graphs-note">
                            Auto-refreshes when you click "Refresh Data". Each graph shows individual machine CPU usage over time.
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="machines-table-card uniform-card">
                  <div className="table-header">
                    <h3 className="section-title">Windows Machines Details</h3>
                    <div className="table-subtitle">
                      Showing {windowsMachinesCount} machine(s) • Last refresh: {formatLastRefresh()}
                    </div>
                  </div>
                  
                  <div className="table-container">
                    <table className="machines-details-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>IP Address</th>
                          <th>Status</th>
                          <th>OS Version</th>
                          <th>CPU Usage</th>
                          <th>Memory</th>
                          <th>Disk</th>
                          <th>Services</th>
                          <th>Last Seen</th>
                        </tr>
                      </thead>
                      <tbody>
                        {windowsDetails.map((machine, index) => {
                          const currentCpu = machine.performance?.cpu_usage || 0;
                          
                          return (
                            <tr key={index} className="machine-row">
                              <td className="machine-name-cell">
                                <div className="machine-name">
                                  <div className="name-text">{machine.name}</div>
                                  <div className="machine-id">ID: {index + 1}</div>
                                </div>
                              </td>
                              <td className="ip-cell">
                                <div className="ip-address">
                                  <span className="ip-text">{machine.ip_address}</span>
                                </div>
                              </td>
                              <td className="status-cell">
                                <div className={`status-indicator ${machine.status === 'online' ? 'online' : 'offline'}`}>
                                  <span className="status-dot"></span>
                                  <span className="status-text">{machine.status === 'online' ? 'Online' : 'Offline'}</span>
                                </div>
                              </td>
                              <td className="os-cell">
                                <div className="os-version">
                                  {machine.os_version}
                                </div>
                              </td>
                              <td className="cpu-cell">
                                <div className="cpu-usage">
                                  <div className="cpu-percentage">{currentCpu.toFixed(1)}%</div>
                                  <div className="cpu-cores">{machine.cpu_cores} cores</div>
                                </div>
                              </td>
                              <td className="memory-cell">
                                <div className="memory-usage">
                                  <div className="memory-percentage">{machine.performance?.memory_usage?.toFixed(1) || '0'}%</div>
                                  <div className="memory-size">{machine.memory_gb} GB</div>
                                </div>
                              </td>
                              <td className="disk-cell">
                                <div className="disk-usage">
                                  <div className="disk-percentage">{machine.performance?.disk_usage?.toFixed(1) || '0'}%</div>
                                  <div className="disk-size">{machine.disk_gb} GB</div>
                                </div>
                              </td>
                              <td className="services-cell">
                                <div className="services-tags">
                                  {machine.services?.dhcp_installed && <span className="service-tag dhcp">DHCP</span>}
                                  {machine.services?.dns_installed && <span className="service-tag dns">DNS</span>}
                                  {machine.services?.active_directory && <span className="service-tag ad">AD</span>}
                                  {!machine.services?.dhcp_installed && !machine.services?.dns_installed && !machine.services?.active_directory && 
                                    <span className="service-tag none">None</span>
                                  }
                                </div>
                              </td>
                              <td className="last-seen-cell">
                                <div className="last-seen-time">
                                  {formatLastSeen(machine.last_seen)}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="right-spacer"></div>
        </div>

        {error && !isRefreshing && (
          <div className="error-message-global">
            <div className="error-icon">⚠️</div>
            <div className="error-text">{error}</div>
            <button 
              className="btn-close-error" 
              onClick={() => setError(null)}
            >
              ×
            </button>
          </div>
        )}

        <CreateServerModal />
      </div>
    </div>
  );
};

export default Dashboard;
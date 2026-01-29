import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  
  const [markedMachines, setMarkedMachines] = useState([]);
  const [machinesLoading, setMachinesLoading] = useState(true);
  const [showMarkModal, setShowMarkModal] = useState(false);
  
  const [resourceData, setResourceData] = useState({});
  const [selectedMachine, setSelectedMachine] = useState('');
  const [selectedMachineUsers, setSelectedMachineUsers] = useState([]);
  
  const autoRefreshInterval = useRef(null);
  const isMounted = useRef(true);
  const isFetchingRef = useRef(false);
  const timeoutRef = useRef(null);
  const machineInfoListenerRef = useRef(false);

  const topNavSections = [
    { id: 'overview', label: 'Overview' },
    { id: 'cpu', label: 'CPU' },
    { id: 'memory', label: 'Memory' },
    { id: 'disk', label: 'Disk' },
    { id: 'network', label: 'Network' },
    { id: 'processes', label: 'Processes' }
  ];

  const navItems = [
    'Dashboard', 'DNS Configuration','Event Viewer', 'DHCP', 'Users',
    'Resource Monitor', 'ESXi', 'Switch', 'Machine Management',
    'Active Directory', 'Routing'
  ];

  const extractResult = (responseData) => {
    if (!responseData) return null;
    
    if (typeof responseData === 'string') {
      try {
        return JSON.parse(responseData);
      } catch (e) {
        return responseData;
      }
    }
    
    return responseData;
  };

  const fetchMachineInfo = useCallback(() => {
    console.log('ResourceMonitor: Fetching ALL machines from database...');
    setMachinesLoading(true);
    setError(null);
    
    sendCommand('get_machine_info', {});
  }, [sendCommand]);

  const processMachineInfo = useCallback((machines) => {
    console.log('ResourceMonitor: Processing ALL machines info:', machines);
    
    if (!machines || !Array.isArray(machines)) {
      console.error('ResourceMonitor: Invalid machine data received:', machines);
      setError('Invalid machine data received from server');
      setMachinesLoading(false);
      return;
    }

    const markedMachinesList = machines.filter(machine => {
      return machine.marked_as && 
             Array.isArray(machine.marked_as) && 
             machine.marked_as.length > 0;
    });

    console.log(`ResourceMonitor: Found ${markedMachinesList.length} marked machines:`, markedMachinesList);
    setMarkedMachines(markedMachinesList);
    
    setMachinesLoading(false);
    
    if (markedMachinesList.length > 0) {
      console.log('ResourceMonitor: Automatically fetching resource data for all marked machines');
      fetchResourceDataForAllMachines(markedMachinesList);
    } else {
      setShowMarkModal(true);
    }
  }, []);

  const getWindowsInfoForMachine = (machine) => {
    if (!machine) {
      console.error('ResourceMonitor: No machine provided to getWindowsInfoForMachine');
      return null;
    }
    
    console.log(`ResourceMonitor: Getting Windows info for machine: ${machine.name} (${machine.ip})`);
    
    if (!machine.password) {
      console.error('ResourceMonitor: No password found for machine:', machine.name);
      setError(`No password found for machine: ${machine.name}`);
      return null;
    }
    
    return {
      ip: machine.ip,
      username: machine.username || 'admin',
      password: machine.password
    };
  };

  const createResourcePayloadForSingleMachine = useCallback((machine) => {
    if (!machine) {
      console.error('ResourceMonitor: No machine selected');
      setError('No machine selected');
      return null;
    }
    
    const windowsInfo = getWindowsInfoForMachine(machine);
    if (!windowsInfo) {
      return null;
    }
    
    console.log(`ResourceMonitor: Creating payload for single machine: ${machine.name}`);
    
    return {
      windows_info: windowsInfo
    };
  }, []);

  const createResourcePayloadForAllMachines = useCallback((machines) => {
    if (!machines || machines.length === 0) {
      console.error('ResourceMonitor: No marked machines found');
      setError('No marked machines found. Please mark machines as DNS, DHCP, or AD in Machine Management first.');
      return null;
    }
    
    const windowsInfos = [];
    
    machines.forEach(machine => {
      const windowsInfo = getWindowsInfoForMachine(machine);
      if (windowsInfo) {
        windowsInfos.push(windowsInfo);
      }
    });
    
    if (windowsInfos.length === 0) {
      console.error('ResourceMonitor: Failed to get Windows info for any marked machine');
      setError('Failed to get credentials for marked machines');
      return null;
    }
    
    console.log(`ResourceMonitor: Creating resource payload for ${windowsInfos.length} machine(s)`);
    
    return {
      windows_infos: windowsInfos
    };
  }, []);

  const handleWebSocketMessage = useCallback((data) => {
    console.log('ResourceMonitor WebSocket message:', data);
    
    if (!isMounted.current) return;
    
    let command, result, error, payload;
    
    if (data.response) {
      const responseObj = data.response;
      command = responseObj.command;
      result = responseObj.result;
      error = responseObj.error;
      payload = responseObj.payload;
    } else if (data.type === 'COMMAND_RESPONSE') {
      command = data.command;
      result = data.result || data.data;
      error = data.error;
      payload = data.payload;
    } else if (data.action === 'response') {
      command = data.command;
      result = data.result;
      error = data.error;
      payload = data.payload;
    } else if (data.command) {
      command = data.command;
      result = data.result || data.data;
      error = data.error;
      payload = data.payload;
    } else if (data.message) {
      console.log('Backend log:', data.message);
      return;
    }
    
    if (!command) {
      console.log('No command found in message:', data);
      return;
    }
    
    console.log(`ResourceMonitor: Processing response for command: ${command}`, { result, error });
    
    if (error) {
      console.log(`ResourceMonitor: Error from backend for command ${command}:`, error);
      setError(`Error: ${error}`);
      setLoading(false);
      setMachinesLoading(false);
      isFetchingRef.current = false;
      return;
    }
    
    const responseData = extractResult(result);
    console.log('ResourceMonitor: Extracted response data:', responseData);
    
    switch(command) {
      case 'get_machine_info':
        console.log('ResourceMonitor: Received machine info');
        if (responseData && responseData.machines) {
          processMachineInfo(responseData.machines);
        } else if (responseData && responseData.success === false) {
          setError(responseData.error || 'Failed to fetch machine info');
          setMachinesLoading(false);
        }
        break;
        
      case 'get_resource_monitor_data':
        console.log('ResourceMonitor: Processing resource data response');
        setLoading(false);
        setLastUpdated(new Date().toLocaleTimeString());
        
        if (responseData) {
          try {
            let resourceDataResult = responseData;
            
            if (responseData.status === 'success' && responseData.data) {
              resourceDataResult = responseData.data;
            }
            
            if (responseData.success !== false && responseData.data) {
              resourceDataResult = responseData.data;
            }
            
            if (resourceDataResult.machines && Array.isArray(resourceDataResult.machines)) {
              const newResourceData = {};
              resourceDataResult.machines.forEach(machine => {
                if (machine.ip && machine.data) {
                  newResourceData[machine.ip] = {
                    cpu_percent: machine.data.cpu_percent || 0,
                    total_memory_mb: machine.data.total_memory_mb || 0,
                    free_memory_mb: machine.data.free_memory_mb || 0,
                    used_memory_mb: machine.data.used_memory_mb || 0,
                    top_processes: machine.data.top_processes || [],
                    disk_usage: machine.data.disk_usage || {
                      total: 1024 * 1024 * 1024, 
                      used: 0,
                      free: 1024 * 1024 * 1024,
                      percent: 0
                    },
                    network_stats: machine.data.network_stats || {
                      upload: 0,
                      download: 0,
                      connections: 0
                    },
                    system_uptime: machine.data.system_uptime || "",
                    machine_name: machine.name || 'Unknown'
                  };
                }
              });
              setResourceData(newResourceData);
            } else if (resourceDataResult.machine_ip) {
              setResourceData(prev => ({
                ...prev,
                [resourceDataResult.machine_ip]: {
                  cpu_percent: resourceDataResult.cpu_percent || 0,
                  total_memory_mb: resourceDataResult.total_memory_mb || 0,
                  free_memory_mb: resourceDataResult.free_memory_mb || 0,
                  used_memory_mb: resourceDataResult.used_memory_mb || 0,
                  top_processes: resourceDataResult.top_processes || [],
                  disk_usage: resourceDataResult.disk_usage || {
                    total: 1024 * 1024 * 1024, 
                    used: 0,
                    free: 1024 * 1024 * 1024,
                    percent: 0
                  },
                  network_stats: resourceDataResult.network_stats || {
                    upload: 0,
                    download: 0,
                    connections: 0
                  },
                  system_uptime: resourceDataResult.system_uptime || "",
                  machine_name: resourceDataResult.machine_name || 'Unknown'
                }
              }));
            } else {
              setResourceData({
                'default': {
                  cpu_percent: resourceDataResult.cpu_percent || 0,
                  total_memory_mb: resourceDataResult.total_memory_mb || 0,
                  free_memory_mb: resourceDataResult.free_memory_mb || 0,
                  used_memory_mb: resourceDataResult.used_memory_mb || 0,
                  top_processes: resourceDataResult.top_processes || [],
                  disk_usage: resourceDataResult.disk_usage || {
                    total: 1024 * 1024 * 1024, 
                    used: 0,
                    free: 1024 * 1024 * 1024,
                    percent: 0
                  },
                  network_stats: resourceDataResult.network_stats || {
                    upload: 0,
                    download: 0,
                    connections: 0
                  },
                  system_uptime: resourceDataResult.system_uptime || "",
                  machine_name: 'Default Machine'
                }
              });
            }
            
            setError(null);
            isFetchingRef.current = false;
            
            if (timeoutRef.current) {
              clearTimeout(timeoutRef.current);
              timeoutRef.current = null;
            }
          } catch (err) {
            console.error('Error parsing resource data:', err);
            setError('Failed to parse backend response');
            isFetchingRef.current = false;
          }
        } else {
          setError('Backend returned an error');
          isFetchingRef.current = false;
        }
        break;
        
      default:
        console.log(`ResourceMonitor: Unhandled command: ${command}`);
    }
  }, [processMachineInfo]);

  const fetchResourceDataForSingleMachine = useCallback((machine) => {
    if (isFetchingRef.current) {
      console.log('ResourceMonitor: Already fetching resource data, skipping...');
      return;
    }

    if (!isConnected) {
      console.log('ResourceMonitor: WebSocket not connected');
      setError('Not connected to backend system');
      return;
    }

    console.log(`ResourceMonitor: Fetching resource data for single machine: ${machine.name} (${machine.ip})`);
    setLoading(true);
    setError(null);
    isFetchingRef.current = true;
    
    const payload = createResourcePayloadForSingleMachine(machine);
    if (!payload) {
      setLoading(false);
      isFetchingRef.current = false;
      return;
    }
    
    console.log('ResourceMonitor: Sending get_resource_monitor_data command for single machine');
    console.log('Payload being sent (single machine):', payload);
    
    sendCommand('get_resource_monitor_data', payload);
    
    timeoutRef.current = setTimeout(() => {
      if (isFetchingRef.current) {
        console.log('ResourceMonitor: Timeout: No response from backend');
        setError('Timeout: No response from server');
        setLoading(false);
        isFetchingRef.current = false;
        timeoutRef.current = null;
      }
    }, 20000);
  }, [isConnected, sendCommand, createResourcePayloadForSingleMachine]);

  const fetchResourceDataForAllMachines = useCallback((machines = markedMachines) => {
    if (isFetchingRef.current) {
      console.log('ResourceMonitor: Already fetching resource data, skipping...');
      return;
    }

    if (!isConnected) {
      console.log('ResourceMonitor: WebSocket not connected');
      setError('Not connected to backend system');
      return;
    }

    if (!machines || machines.length === 0) {
      console.log('ResourceMonitor: No marked machines found');
      setError('No marked machines found. Please mark machines in Machine Management first.');
      return;
    }

    console.log(`ResourceMonitor: Fetching resource data for ${machines.length} marked machine(s)`);
    setLoading(true);
    setError(null);
    isFetchingRef.current = true;
    
    const payload = createResourcePayloadForAllMachines(machines);
    if (!payload) {
      setLoading(false);
      isFetchingRef.current = false;
      return;
    }
    
    console.log('ResourceMonitor: Sending get_resource_monitor_data command with payload for all machines');
    console.log('Payload being sent (all machines):', payload);
    
    sendCommand('get_resource_monitor_data', payload);
    
    timeoutRef.current = setTimeout(() => {
      if (isFetchingRef.current) {
        console.log('ResourceMonitor: Timeout: No response from backend');
        setError('Timeout: No response from server');
        setLoading(false);
        isFetchingRef.current = false;
        timeoutRef.current = null;
      }
    }, 20000);
  }, [isConnected, markedMachines, sendCommand, createResourcePayloadForAllMachines]);

  const handleMachineSelect = useCallback((machineIp) => {
    setSelectedMachine(machineIp);
    
    if (machineIp) {
      const machine = markedMachines.find(m => m.ip === machineIp);
      if (machine) {
        fetchResourceDataForSingleMachine(machine);
      }
    } else {
      fetchResourceDataForAllMachines();
    }
  }, [markedMachines, fetchResourceDataForSingleMachine, fetchResourceDataForAllMachines]);

  const handleRefresh = useCallback((machineIp = null) => {
    if (!isConnected) {
      alert('Cannot refresh: Not connected to backend system');
      return;
    }
    
    if (markedMachines.length === 0) {
      alert('No marked machines found. Please mark machines first.');
      return;
    }
    
    if (isFetchingRef.current) {
      console.log('Already refreshing, please wait...');
      return;
    }
    
    if (machineIp) {
      const machine = markedMachines.find(m => m.ip === machineIp);
      if (machine) {
        fetchResourceDataForSingleMachine(machine);
      }
    } else {
      fetchResourceDataForAllMachines();
    }
  }, [isConnected, markedMachines.length, fetchResourceDataForAllMachines, fetchResourceDataForSingleMachine, isFetchingRef]);

  const handleRefreshMachines = () => {
    console.log('ResourceMonitor: Refreshing machine list');
    fetchMachineInfo();
  };

  const handleAutoRefreshToggle = () => {
    const newAutoRefresh = !autoRefresh;
    setAutoRefresh(newAutoRefresh);
    
    if (newAutoRefresh && isConnected && markedMachines.length > 0) {
      fetchResourceDataForAllMachines();
    }
  };

  useEffect(() => {
    isMounted.current = true;
    
    const setupAutoRefresh = () => {
      if (autoRefresh && isConnected && markedMachines.length > 0) {
        if (autoRefreshInterval.current) {
          clearInterval(autoRefreshInterval.current);
        }
        
        autoRefreshInterval.current = setInterval(() => {
          if (isMounted.current && isConnected && markedMachines.length > 0) {
            if (selectedMachine) {
              const machine = markedMachines.find(m => m.ip === selectedMachine);
              if (machine) {
                fetchResourceDataForSingleMachine(machine);
              }
            } else {
              fetchResourceDataForAllMachines();
            }
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
  }, [autoRefresh, isConnected, markedMachines.length, selectedMachine]);

  useEffect(() => {
    if (!machineInfoListenerRef.current) {
      console.log('ResourceMonitor Component Mounted - Setting up WebSocket listener');
      const removeListener = addListener(handleWebSocketMessage);
      machineInfoListenerRef.current = true;
      
      return () => {
        if (removeListener) removeListener();
        machineInfoListenerRef.current = false;
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      };
    }
  }, [addListener, handleWebSocketMessage]);

  useEffect(() => {
    if (isConnected && markedMachines.length === 0) {
      console.log('ResourceMonitor: Connected, fetching machine info...');
      fetchMachineInfo();
    }
  }, [isConnected, fetchMachineInfo, markedMachines.length]);

  useEffect(() => {
    if (isConnected && !hasInitialFetch && !loading && markedMachines.length > 0) {
      const timer = setTimeout(() => {
        fetchResourceDataForAllMachines();
        setHasInitialFetch(true); 
      }, 500);
      
      return () => clearTimeout(timer);
    }
  }, [isConnected, hasInitialFetch, loading, markedMachines.length]);

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

  const calculateMemoryPercentage = (machineData) => {
    if (!machineData || machineData.total_memory_mb === 0) return 0;
    return (machineData.used_memory_mb / machineData.total_memory_mb) * 100;
  };

  const getResourceData = (machineIp = selectedMachine) => {
    if (machineIp && resourceData[machineIp]) {
      return resourceData[machineIp];
    }
    
    if (markedMachines.length > 0) {
      const firstMachineIp = markedMachines[0].ip;
      return resourceData[firstMachineIp] || {
        cpu_percent: 0,
        total_memory_mb: 0,
        free_memory_mb: 0,
        used_memory_mb: 0,
        top_processes: [],
        disk_usage: { total: 0, used: 0, free: 0, percent: 0 },
        network_stats: { upload: 0, download: 0, connections: 0 },
        system_uptime: "",
        machine_name: selectedMachine ? 
          markedMachines.find(m => m.ip === selectedMachine)?.name || 'Unknown' : 
          'All Machines'
      };
    }
    
    return {
      cpu_percent: 0,
      total_memory_mb: 0,
      free_memory_mb: 0,
      used_memory_mb: 0,
      top_processes: [],
      disk_usage: { total: 0, used: 0, free: 0, percent: 0 },
      network_stats: { upload: 0, download: 0, connections: 0 },
      system_uptime: "",
      machine_name: 'No Machine Selected'
    };
  };

  const getMachineRoles = (machine) => {
    if (!machine.marked_as || !Array.isArray(machine.marked_as)) return [];
    return machine.marked_as.map(mark => `${mark.role} ${mark.type}`).join(', ');
  };

  const formatLastRefresh = () => {
    return lastUpdated || 'Never';
  };

  const MarkMachineModal = () => {
    if (!showMarkModal) return null;

    return (
      <div className="modal-overlay">
        <div className="modal-container">
          <div className="modal-content">
            <div className="modal-header">
              <h3 className="modal-title">No Marked Machines Found</h3>
            </div>
            <div className="modal-body">
              <div className="modal-message">
                <p>No machines are currently marked as DNS, DHCP, or AD roles.</p>
                <p>To monitor resources, you need to mark at least one machine in Machine Management.</p>
              </div>
              
              <div className="modal-stats-grid">
                <div className="modal-stat-item">
                  <div className="modal-stat-label">TOTAL MACHINES</div>
                  <div className="modal-stat-value">{markedMachines.length}</div>
                </div>
                <div className="modal-stat-item">
                  <div className="modal-stat-label">LAST REFRESH</div>
                  <div className="modal-stat-value">{formatLastRefresh()}</div>
                </div>
                <div className="modal-stat-item">
                  <button 
                    className="modal-refresh-btn"
                    onClick={handleRefreshMachines}
                    disabled={machinesLoading}
                  >
                    {machinesLoading ? 'Loading...' : 'Refresh Machines'}
                  </button>
                </div>
              </div>
              
              <div className="modal-actions">
                <button 
                  className="modal-btn-primary"
                  onClick={() => {
                    setShowMarkModal(false);
                    window.location.href = '/machine-management';
                  }}
                >
                  Go to Machine Management
                </button>
                <button 
                  className="modal-btn-secondary"
                  onClick={() => {
                    setShowMarkModal(false);
                    handleRefreshMachines();
                  }}
                >
                  Refresh Machine List
                </button>
                <button 
                  className="modal-btn-tertiary"
                  onClick={() => setShowMarkModal(false)}
                >
                  Continue Anyway
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const MachineSelector = () => {
    if (machinesLoading) {
      return (
        <div className="loading-message">
          <div className="loading-spinner"></div>
          Loading machine information...
        </div>
      );
    }

    if (markedMachines.length === 0) {
      return null;
    }

    return (
      <div className="machine-select-container">
        <div className="select-wrapper">
          <select
            value={selectedMachine}
            onChange={(e) => handleMachineSelect(e.target.value)}
            className="machine-select"
            disabled={loading || !isConnected || isFetchingRef.current}
          >
            <option value="">All Machines Overview</option>
            {markedMachines.map(machine => (
              <option key={machine.id} value={machine.ip}>
                {machine.name} ({machine.ip}) - {getMachineRoles(machine)}
              </option>
            ))}
          </select>
        </div>
        
        {selectedMachine && (
          <div className="selected-machine-info">
            <div className="selected-machine-header">
              <div className="selected-machine-name">
                {markedMachines.find(m => m.ip === selectedMachine)?.name}
              </div>
              <button
                onClick={() => handleRefresh(selectedMachine)}
                className="refresh-single-btn"
                disabled={loading}
              >
                {loading ? 'Refreshing...' : '⟳ Refresh'}
              </button>
            </div>
            <div className="selected-machine-details">
              <div className="machine-detail-item">
                <span className="detail-label">IP Address:</span>
                <span className="detail-value">{selectedMachine}</span>
              </div>
              <div className="machine-detail-item">
                <span className="detail-label">Username:</span>
                <span className="detail-value">
                  {markedMachines.find(m => m.ip === selectedMachine)?.username}
                </span>
              </div>
              <div className="machine-detail-item">
                <span className="detail-label">Roles:</span>
                <span className="detail-value">
                  {getMachineRoles(markedMachines.find(m => m.ip === selectedMachine))}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const currentData = getResourceData();

  return (
    <div className="resource-monitor">
      <div className="users-content">
        <div className="users-header">
          <h1 className="users-title">Automation</h1>
          <div className="nav-buttons">
            {navItems.map((item) => (
              <button
                key={item}
                className={`nav-button ${item === 'Resource Monitor'
                    ? 'nav-button-active'
                    : 'nav-button-inactive'
                  }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="users-grid">
          <div className="users-left-column">
            <div className="stats-controls-card">
              <div className="stats-controls-header">
                <h3 className="section-title">Resource Monitor Dashboard</h3>
                <div className="controls-actions">
                  <button
                    onClick={handleRefreshMachines}
                    className="refresh-machines-btn"
                    disabled={machinesLoading || isFetchingRef.current}
                  >
                    {machinesLoading ? 'Loading...' : 'Refresh Machines'}
                  </button>
                  <button
                    onClick={() => handleRefresh()}
                    className="refresh-button"
                    disabled={loading || !isConnected || isFetchingRef.current || markedMachines.length === 0}
                  >
                    {loading ? 'Refreshing...' : 'Refresh Resources'}
                  </button>
                </div>
              </div>
            </div>

            <div className="machine-list-card">
              <div className="machine-list-header">
                <h3 className="section-title">
                  Select Machine ({markedMachines.length})
                </h3>
                <div className="machine-list-status">
                  {isConnected ? 'Connected' : 'Disconnected'}
                </div>
              </div>
              
              <MachineSelector />
            </div>
          </div>

          <div className="users-right-column">
            <div className="monitor-content-area">
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

              <div className="monitor-detail-content">
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

                {markedMachines.length === 0 ? (
                  <div className="no-machines-message">
                    <div className="no-machines-icon">⚠️</div>
                    <h3>No machines available for monitoring</h3>
                    <p>Please mark machines in Machine Management first to monitor their resources.</p>
                    <button
                      onClick={handleRefreshMachines}
                      className="btn-refresh-machines"
                    >
                      Refresh Machine List
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="monitor-controls">
                      <div className="header-actions">
                        <div className="auto-refresh-control">
                          <label className="toggle-label">
                            Auto refresh
                            <div className="toggle-switch">
                              <input 
                                type="checkbox" 
                                checked={autoRefresh}
                                onChange={handleAutoRefreshToggle}
                                disabled={markedMachines.length === 0 || loading}
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

                    <div className="current-machine-info">
                      <h3>
                        {selectedMachine ? 
                          `Monitoring: ${currentData.machine_name || markedMachines.find(m => m.ip === selectedMachine)?.name}` :
                          'Monitoring All Machines'
                        }
                      </h3>
                      {selectedMachine && (
                        <div className="machine-ip-display">
                          IP: {selectedMachine}
                        </div>
                      )}
                    </div>

                    {activeSection === 'overview' && (
                      <div className="section-content overview-section">
                        <h2>Performance Overview</h2>
                        
                        <div className="performance-grid">
                          <div className="performance-card">
                            <div className="card-header">
                              <h3>CPU</h3>
                              <div className="card-value">{currentData.cpu_percent.toFixed(1)}%</div>
                            </div>
                            <div className="progress-bar-large">
                              <div 
                                className="progress-fill"
                                style={{ 
                                  width: `${Math.min(currentData.cpu_percent, 100)}%`,
                                  backgroundColor: getUsageColor(currentData.cpu_percent)
                                }}
                              ></div>
                            </div>
                            <div className="card-details">
                              <div className="detail-item">
                                <span className="detail-label">Processes:</span>
                                <span className="detail-value">{currentData.top_processes.length}</span>
                              </div>
                            </div>
                          </div>

                          <div className="performance-card">
                            <div className="card-header">
                              <h3>Memory</h3>
                              <div className="card-value">{calculateMemoryPercentage(currentData).toFixed(1)}%</div>
                            </div>
                            <div className="progress-bar-large">
                              <div 
                                className="progress-fill"
                                style={{ 
                                  width: `${Math.min(calculateMemoryPercentage(currentData), 100)}%`,
                                  backgroundColor: getUsageColor(calculateMemoryPercentage(currentData), 'memory')
                                }}
                              ></div>
                            </div>
                            <div className="card-details">
                              <div className="detail-item">
                                <span className="detail-label">In use:</span>
                                <span className="detail-value">{formatMemoryMB(currentData.used_memory_mb)}</span>
                              </div>
                              <div className="detail-item">
                                <span className="detail-label">Available:</span>
                                <span className="detail-value">{formatMemoryMB(currentData.free_memory_mb)}</span>
                              </div>
                            </div>
                          </div>

                          <div className="performance-card">
                            <div className="card-header">
                              <h3>Disk</h3>
                              <div className="card-value">{currentData.disk_usage.percent.toFixed(1)}%</div>
                            </div>
                            <div className="progress-bar-large">
                              <div 
                                className="progress-fill"
                                style={{ 
                                  width: `${Math.min(currentData.disk_usage.percent, 100)}%`,
                                  backgroundColor: getUsageColor(currentData.disk_usage.percent, 'disk')
                                }}
                              ></div>
                            </div>
                            <div className="card-details">
                              <div className="detail-item">
                                <span className="detail-label">Used:</span>
                                <span className="detail-value">{formatBytes(currentData.disk_usage.used)}</span>
                              </div>
                              <div className="detail-item">
                                <span className="detail-label">Free:</span>
                                <span className="detail-value">{formatBytes(currentData.disk_usage.free)}</span>
                              </div>
                            </div>
                          </div>

                          <div className="performance-card">
                            <div className="card-header">
                              <h3>Network</h3>
                              <div className="card-value">{currentData.network_stats.connections}</div>
                            </div>
                            <div className="network-stats-overview">
                              <div className="network-stat">
                                <div className="stat-label">Send</div>
                                <div className="stat-value">{formatBytes(currentData.network_stats.upload)}/s</div>
                              </div>
                              <div className="network-stat">
                                <div className="stat-label">Receive</div>
                                <div className="stat-value">{formatBytes(currentData.network_stats.download)}/s</div>
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
                                {currentData.top_processes.slice(0, 5).map((process, index) => (
                                  <tr key={`${process.pid}-${index}`}>
                                    <td className="process-name">{process.name || 'Unknown'}</td>
                                    <td className="process-pid">{process.pid || 'N/A'}</td>
                                    <td className="process-memory">{formatMemoryMB(process.memory_mb || 0)}</td>
                                    <td className="process-threads">{process.threads || 0}</td>
                                  </tr>
                                ))}
                                {currentData.top_processes.length === 0 && (
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
                              <span className="stat-value">{currentData.cpu_percent.toFixed(1)}%</span>
                              <span className="stat-label">Utilization</span>
                            </div>
                          </div>
                        </div>

                        <div className="cpu-details-grid">
                          <div className="cpu-chart-container">
                            <h3>CPU Usage History</h3>
                            <div className="chart-placeholder">
                              CPU usage: {currentData.cpu_percent.toFixed(1)}%
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
                                  {currentData.top_processes.slice(0, 10).map((process, index) => (
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
                              <span className="stat-value">{calculateMemoryPercentage(currentData).toFixed(1)}%</span>
                              <span className="stat-label">In use</span>
                            </div>
                            <div className="memory-breakdown">
                              <div className="breakdown-item">
                                <span className="breakdown-label">In use:</span>
                                <span className="breakdown-value">{formatMemoryMB(currentData.used_memory_mb)}</span>
                              </div>
                              <div className="breakdown-item">
                                <span className="breakdown-label">Available:</span>
                                <span className="breakdown-value">{formatMemoryMB(currentData.free_memory_mb)}</span>
                              </div>
                              <div className="breakdown-item">
                                <span className="breakdown-label">Total:</span>
                                <span className="breakdown-value">{formatMemoryMB(currentData.total_memory_mb)}</span>
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
                                  {currentData.top_processes
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
                              <span className="stat-value">{currentData.disk_usage.percent.toFixed(1)}%</span>
                              <span className="stat-label">Used</span>
                            </div>
                            <div className="disk-breakdown">
                              <div className="breakdown-item">
                                <span className="breakdown-label">Used:</span>
                                <span className="breakdown-value">{formatBytes(currentData.disk_usage.used)}</span>
                              </div>
                              <div className="breakdown-item">
                                <span className="breakdown-label">Free:</span>
                                <span className="breakdown-value">{formatBytes(currentData.disk_usage.free)}</span>
                              </div>
                              <div className="breakdown-item">
                                <span className="breakdown-label">Total:</span>
                                <span className="breakdown-value">{formatBytes(currentData.disk_usage.total)}</span>
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
                              <span className="stat-value">{currentData.network_stats.connections}</span>
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
                                <div className="stat-value">{formatBytes(currentData.network_stats.upload)}/s</div>
                              </div>
                              <div className="network-stat-large">
                                <div className="stat-label">Receive</div>
                                <div className="stat-value">{formatBytes(currentData.network_stats.download)}/s</div>
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
                                  {currentData.top_processes.slice(0, 10).map((process, index) => (
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
                              <span className="stat-value">{currentData.top_processes.length}</span>
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
                                {currentData.top_processes.map((process, index) => (
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
                                {currentData.top_processes.length === 0 && (
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
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <MarkMachineModal />

      {error && (
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
    </div>
  );
}

export default ResourceMonitor;
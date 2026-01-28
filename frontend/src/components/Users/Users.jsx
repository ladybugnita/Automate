import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useWebSocket } from '../../context/WebSocketContext';
import './Users.css';

const Users = () => {
  const { isConnected, sendCommand, addListener } = useWebSocket();
  const [markedMachines, setMarkedMachines] = useState([]);
  const [machinesLoading, setMachinesLoading] = useState(true);
  const [showMarkModal, setShowMarkModal] = useState(false);
  
  const [allUsers, setAllUsers] = useState({}); 
  const [selectedMachine, setSelectedMachine] = useState('');
  const [selectedMachineUsers, setSelectedMachineUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState(null);
  const [error, setError] = useState(null);

  const [newUser, setNewUser] = useState({ 
    machineIp: '', 
    username: '', 
    password: '' 
  });
  const [loading, setLoading] = useState(false);

  const isFetchingRef = useRef(false);
  const timeoutRef = useRef(null);
  const machineInfoListenerRef = useRef(false);

  const navItems = [
    'Dashboard', 'DNS Configuration','Event Viewer', 'DHCP', 'Users',
    'Resource Monitor', 'ESXi','Switch', 'Machine Management',
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
    console.log('Users: Fetching ALL machines from database...');
    setMachinesLoading(true);
    setError(null);
    
    sendCommand('get_machine_info', {});
  }, [sendCommand]);

  const processMachineInfo = useCallback((machines) => {
    console.log('Users: Processing ALL machines info:', machines);
    
    if (!machines || !Array.isArray(machines)) {
      console.error('Users: Invalid machine data received:', machines);
      setError('Invalid machine data received from server');
      setMachinesLoading(false);
      return;
    }

    const markedMachinesList = machines.filter(machine => {
      return machine.marked_as && 
             Array.isArray(machine.marked_as) && 
             machine.marked_as.length > 0;
    });

    console.log(`Users: Found ${markedMachinesList.length} marked machines:`, markedMachinesList);
    setMarkedMachines(markedMachinesList);
    
    setMachinesLoading(false);
    
    if (markedMachinesList.length > 0) {
      console.log('Users: Automatically fetching users for all marked machines');
      fetchUsersForAllMachines(markedMachinesList);
    } else {
      setShowMarkModal(true);
    }
  }, []);

  const getWindowsInfoForMachine = (machine) => {
    if (!machine) {
      console.error('Users: No machine provided to getWindowsInfoForMachine');
      return null;
    }
    
    console.log(`Users: Getting Windows info for machine: ${machine.name} (${machine.ip})`);
    
    if (!machine.password) {
      console.error('Users: No password found for machine:', machine.name);
      setError(`No password found for machine: ${machine.name}`);
      return null;
    }
    
    return {
      ip: machine.ip,
      username: machine.username || 'admin',
      password: machine.password
    };
  };

  const createUsersPayloadForSingleMachine = useCallback((machine) => {
    if (!machine) {
      console.error('Users: No machine selected');
      setError('No machine selected');
      return null;
    }
    
    const windowsInfo = getWindowsInfoForMachine(machine);
    if (!windowsInfo) {
      return null;
    }
    
    console.log(`Users: Creating payload for single machine: ${machine.name}`);
    
    return {
      windows_info: windowsInfo
    };
  }, []);

  const createUsersPayloadForAllMachines = useCallback((machines) => {
    if (!machines || machines.length === 0) {
      console.error('Users: No marked machines found');
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
      console.error('Users: Failed to get Windows info for any marked machine');
      setError('Failed to get credentials for marked machines');
      return null;
    }
    
    console.log(`Users: Creating payload for ${windowsInfos.length} machine(s)`);
    
    return {
      windows_infos: windowsInfos
    };
  }, []);

  const handleWebSocketMessage = useCallback((data) => {
    console.log('Users WebSocket message:', data);
    
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
    
    console.log(`Users: Processing response for command: ${command}`, { result, error });
    
    if (error) {
      console.log(`Users: Error from backend for command ${command}:`, error);
      setError(`Error: ${error}`);
      setUsersLoading(false);
      setMachinesLoading(false);
      isFetchingRef.current = false;
      return;
    }
    
    const responseData = extractResult(result);
    console.log('Users: Extracted response data:', responseData);
    
    switch(command) {
      case 'get_machine_info':
        console.log('Users: Received machine info');
        if (responseData && responseData.machines) {
          processMachineInfo(responseData.machines);
        } else if (responseData && responseData.success === false) {
          setError(responseData.error || 'Failed to fetch machine info');
          setMachinesLoading(false);
        }
        break;
        
      case 'get_logged_users':
        console.log('Users: Processing logged users response');
        if (responseData && responseData.success !== false) {
          let usersByMachine = {};
          
          if (responseData.data && typeof responseData.data === 'object') {
            Object.keys(responseData.data).forEach(machineIp => {
              const machineUsers = responseData.data[machineIp];
              if (Array.isArray(machineUsers)) {
                usersByMachine[machineIp] = machineUsers;
              }
            });
          }
          
          if (responseData.users_array && Array.isArray(responseData.users_array)) {
            responseData.users_array.forEach(user => {
              if (user.machine_ip) {
                if (!usersByMachine[user.machine_ip]) {
                  usersByMachine[user.machine_ip] = [];
                }
                usersByMachine[user.machine_ip].push(user);
              }
            });
          }
          
          console.log('Users: Loaded users data by machine:', usersByMachine);
          setAllUsers(usersByMachine);
          setUsersLoading(false);
          setLastRefresh(new Date());
          isFetchingRef.current = false;
          
          if (selectedMachine && usersByMachine[selectedMachine]) {
            setSelectedMachineUsers(usersByMachine[selectedMachine]);
          } else if (selectedMachine) {
            setSelectedMachineUsers([]);
          }
          
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
        } else {
          console.log('Users: No valid user data in response');
          setAllUsers({});
          setSelectedMachineUsers([]);
          setUsersLoading(false);
          isFetchingRef.current = false;
        }
        break;
        
      case 'add_user':
        console.log('Users: Processing add user response');
        setLoading(false);
        
        if (responseData && responseData.success !== false) {
          alert('User added successfully!');
          setNewUser({ machineIp: '', username: '', password: '' });
          if (selectedMachine) {
            const machine = markedMachines.find(m => m.ip === selectedMachine);
            if (machine) {
              fetchUsersForSingleMachine(machine);
            }
          }
        } else {
          const errorMsg = responseData?.error || 'Failed to add user';
          alert(`Error: ${errorMsg}`);
        }
        break;
        
      default:
        console.log(`Users: Unhandled command: ${command}`);
    }
    
  }, [processMachineInfo, selectedMachine, markedMachines]);

  const fetchUsersForSingleMachine = useCallback((machine) => {
    if (isFetchingRef.current) {
      console.log('Users: Already fetching users, skipping...');
      return;
    }

    if (!isConnected) {
      console.log('Users: WebSocket not connected');
      setError('Not connected to backend system');
      return;
    }

    console.log(`Users: Fetching users for single machine: ${machine.name} (${machine.ip})`);
    setUsersLoading(true);
    setError(null);
    isFetchingRef.current = true;
    
    const payload = createUsersPayloadForSingleMachine(machine);
    if (!payload) {
      setUsersLoading(false);
      isFetchingRef.current = false;
      return;
    }
    
    console.log('Users: Sending get_logged_users command for single machine');
    sendCommand('get_logged_users', payload);
    
    timeoutRef.current = setTimeout(() => {
      if (isFetchingRef.current) {
        console.log('Users: Timeout: No response from backend');
        setError('Timeout: No response from server');
        setUsersLoading(false);
        isFetchingRef.current = false;
        timeoutRef.current = null;
      }
    }, 20000);
    
  }, [isConnected, sendCommand, createUsersPayloadForSingleMachine]);

  const fetchUsersForAllMachines = useCallback((machines = markedMachines) => {
    if (isFetchingRef.current) {
      console.log('Users: Already fetching users, skipping...');
      return;
    }

    if (!isConnected) {
      console.log('Users: WebSocket not connected');
      setError('Not connected to backend system');
      return;
    }

    if (!machines || machines.length === 0) {
      console.log('Users: No marked machines found');
      setError('No marked machines found. Please mark machines in Machine Management first.');
      return;
    }

    console.log(`Users: Fetching users for ${machines.length} marked machine(s)`);
    setUsersLoading(true);
    setError(null);
    isFetchingRef.current = true;
    
    const payload = createUsersPayloadForAllMachines(machines);
    if (!payload) {
      setUsersLoading(false);
      isFetchingRef.current = false;
      return;
    }
    
    console.log('Users: Sending get_logged_users command with payload for all machines');
    sendCommand('get_logged_users', payload);
    
    timeoutRef.current = setTimeout(() => {
      if (isFetchingRef.current) {
        console.log('Users: Timeout: No response from backend');
        setError('Timeout: No response from server');
        setUsersLoading(false);
        isFetchingRef.current = false;
        timeoutRef.current = null;
      }
    }, 20000);
    
  }, [isConnected, markedMachines, sendCommand, createUsersPayloadForAllMachines]);

  const handleMachineSelect = useCallback((machineIp) => {
    setSelectedMachine(machineIp);
    setSelectedMachineUsers(allUsers[machineIp] || []);
    
    if (machineIp && !allUsers[machineIp]) {
      const machine = markedMachines.find(m => m.ip === machineIp);
      if (machine) {
        fetchUsersForSingleMachine(machine);
      }
    }
  }, [allUsers, markedMachines, fetchUsersForSingleMachine]);

  const handleManualRefresh = useCallback((machineIp = null) => {
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
        fetchUsersForSingleMachine(machine);
      }
    } else {
      fetchUsersForAllMachines();
    }
  }, [isConnected, markedMachines.length, fetchUsersForAllMachines, fetchUsersForSingleMachine, isFetchingRef]);

  const handleRefreshMachines = () => {
    console.log('Users: Refreshing machine list');
    fetchMachineInfo();
  };

  const handleAddUser = () => {
    if (!newUser.machineIp) {
      alert('Please select a machine first');
      return;
    }
    
    if (!newUser.username.trim() || !newUser.password.trim()) {
      alert('Please enter both username and password');
      return;
    }

    if (newUser.username.length < 2) {
      alert('Username must be at least 2 characters long');
      return;
    }

    if (newUser.password.length < 4) {
      alert('Password must be at least 4 characters long');
      return;
    }

    if (!isConnected) {
      alert('Cannot add user: Not connected to backend system');
      return;
    }

    setLoading(true);
    
    const selectedMachineObj = markedMachines.find(m => m.ip === newUser.machineIp);
    if (!selectedMachineObj) {
      alert('Selected machine not found');
      setLoading(false);
      return;
    }

    console.log('Users: Adding user to machine:', {
      machine: selectedMachineObj.name,
      username: newUser.username
    });

    const windowsInfo = getWindowsInfoForMachine(selectedMachineObj);
    if (!windowsInfo) {
      setLoading(false);
      return;
    }
    
    const payload = {
      windows_info: windowsInfo,
      username: newUser.username,
      password: newUser.password
    };
    
    sendCommand('add_user', payload);
  };

  const formatDate = (dateString) => {
    if (!dateString || dateString === 'Never' || dateString === 'null') return 'Never';
    try {
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? 'Never' : date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    } catch {
      return 'Never';
    }
  };

  const formatTimeAgo = (dateString) => {
    if (!dateString || dateString === 'Never' || dateString === 'null') return 'Never';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return 'Never';
      
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
      if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      if (diffMins > 0) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
      return 'Just now';
    } catch {
      return 'Never';
    }
  };

  const getMachineRoles = (machine) => {
    if (!machine.marked_as || !Array.isArray(machine.marked_as)) return [];
    return machine.marked_as.map(mark => `${mark.role} ${mark.type}`).join(', ');
  };

  const formatLastRefresh = () => {
    return lastRefresh ? lastRefresh.toLocaleTimeString() : 'Never';
  };

  const getTotalUsersCount = () => {
    let total = 0;
    Object.values(allUsers).forEach(users => {
      if (Array.isArray(users)) {
        total += users.length;
      }
    });
    return total;
  };

  const getEnabledUsersCount = () => {
    let enabled = 0;
    Object.values(allUsers).forEach(users => {
      if (Array.isArray(users)) {
        enabled += users.filter(u => u.Enabled).length;
      }
    });
    return enabled;
  };

  const getUsersForMachine = (machineIp) => {
    return allUsers[machineIp] || [];
  };

  useEffect(() => {
    if (!machineInfoListenerRef.current) {
      console.log('Users Component Mounted - Setting up WebSocket listener');
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
      console.log('Users: Connected, fetching machine info...');
      fetchMachineInfo();
    }
  }, [isConnected, fetchMachineInfo, markedMachines.length]);

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
                <p>To manage users, you need to mark at least one machine in Machine Management.</p>
              </div>
              
              <div className="modal-stats-grid">
                <div className="modal-stat-item">
                  <div className="modal-stat-label">TOTAL USERS</div>
                  <div className="modal-stat-value">{getTotalUsersCount()}</div>
                </div>
                <div className="modal-stat-item">
                  <div className="modal-stat-label">ENABLED USERS</div>
                  <div className="modal-stat-value">{getEnabledUsersCount()}</div>
                </div>
                <div className="modal-stat-item">
                  <div className="modal-stat-label">LAST REFRESH</div>
                  <div className="modal-stat-value">{formatLastRefresh()}</div>
                </div>
                <div className="modal-stat-item">
                  <button 
                    className="modal-refresh-btn"
                    onClick={handleRefreshMachines}
                  >
                    Refresh Machines
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

  return (
    <div className="users-container">
      <div className="users-content">
        <div className="users-header">
          <h1 className="users-title">Automation</h1>
          <div className="nav-buttons">
            {navItems.map((item) => (
              <button
                key={item}
                className={`nav-button ${item === 'Users'
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
                <h3 className="section-title">User Management Dashboard</h3>
                <div className="controls-actions">
                  <button
                    onClick={handleRefreshMachines}
                    className="refresh-machines-btn"
                    disabled={machinesLoading || isFetchingRef.current}
                  >
                    {machinesLoading ? 'Loading...' : 'Refresh Machines'}
                  </button>
                  <button
                    onClick={() => handleManualRefresh()}
                    className="refresh-button"
                    disabled={usersLoading || !isConnected || isFetchingRef.current || markedMachines.length === 0}
                  >
                    {usersLoading ? 'Refreshing...' : 'Refresh All Users'}
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
              
              {machinesLoading ? (
                <div className="loading-message">
                  <div className="loading-spinner"></div>
                  Loading machine information...
                </div>
              ) : markedMachines.length === 0 ? (
                <div className="no-machines-configured">
                  <div className="configure-machines-prompt">
                    <p>No marked machines found in database.</p>
                    <p>Please mark machines as DNS, DHCP, or AD in Machine Management first.</p>
                  </div>
                </div>
              ) : (
                <div className="machine-select-container">
                  <div className="select-wrapper">
                    <select
                      value={selectedMachine}
                      onChange={(e) => handleMachineSelect(e.target.value)}
                      className="machine-select"
                    ><option value="">Select a machine to view users...</option>
                      {markedMachines.map(machine => (
                        <option key={machine.id} value={machine.ip}>
                          {machine.name} ({machine.ip}) - {getUsersForMachine(machine.ip).length} users
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
                          onClick={() => handleManualRefresh(selectedMachine)}
                          className="refresh-single-btn"
                          disabled={usersLoading}
                        >
                          {usersLoading ? 'Refreshing...' : '⟳ Refresh'}
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
              )}
            </div>
          </div>

          <div className="users-right-column">
            <div className="form-card">
              <h3 className="form-title">Add User to Machine</h3>
              <div className="form-content">
                {markedMachines.length === 0 ? (
                  <div className="no-machines-notice">
                    <div className="notice-icon">⚠️</div>
                    <p>No marked machines available.</p>
                    <p>Please mark machines in Machine Management first.</p>
                    <button
                      onClick={handleRefreshMachines}
                      className="btn-refresh-machines"
                    >
                      Refresh Machines
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="form-group">
                      <label className="form-label">Select Machine</label>
                      <div className="select-wrapper">
                        <select
                          value={newUser.machineIp}
                          onChange={(e) => setNewUser({ ...newUser, machineIp: e.target.value })}
                          className="form-select"
                          disabled={loading || !isConnected}
                        >
                          <option value="">Choose a machine...</option>
                          {markedMachines.map(machine => (
                            <option key={machine.id} value={machine.ip}>
                              {machine.name} ({machine.ip})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    
                    {newUser.machineIp && (
                      <>
                        <div className="form-group">
                          <label className="form-label">Username</label>
                          <input
                            type="text"
                            value={newUser.username}
                            onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                            className="form-input"
                            placeholder="Enter username"
                            disabled={loading || !isConnected}
                          />
                        </div>
                        <div className="form-group">
                          <label className="form-label">Password</label>
                          <input
                            type="password"
                            value={newUser.password}
                            onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                            className="form-input"
                            placeholder="Enter password"
                            disabled={loading || !isConnected}
                          />
                        </div>
                        <button
                          onClick={handleAddUser}
                          className="form-button"
                          disabled={loading || !isConnected || !newUser.username || !newUser.password}
                        >
                          {loading ? 'Adding...' : 'Add User'}
                        </button>
                      </>
                    )}
                    
                    {!isConnected && (
                      <div className="no-connection-notice">
                        Connect to backend to manage users
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="all-users-card">
              <div className="all-users-header">
                <h3 className="section-title">
                  {selectedMachine ? 
                    `Users on ${markedMachines.find(m => m.ip === selectedMachine)?.name} (${selectedMachineUsers.length})` :
                    `All Users (${getTotalUsersCount()})`
                  }
                  {usersLoading && <span className="loading-indicator"> ⟳ Loading...</span>}
                </h3>
                {selectedMachine && (
                  <button
                    onClick={() => setSelectedMachine('')}
                    className="view-all-users-btn"
                  >
                    View All Users
                  </button>
                )}
              </div>
              
              <div className="all-users-table-container">
                {!isConnected ? (
                  <div className="no-connection-message">
                    Not connected to backend system.
                  </div>
                ) : markedMachines.length === 0 ? (
                  <div className="no-machines-message">
                    No marked machines to display users from.
                  </div>
                ) : (!selectedMachine && getTotalUsersCount() === 0) || (selectedMachine && selectedMachineUsers.length === 0) ? (
                  <div className="no-users-message">
                    {selectedMachine ? 
                      `No users found on selected machine. Click "Refresh" to load users.` :
                      `No users found on any marked machine. Select a machine to view users or click "Refresh All Users".`
                    }
                  </div>
                ) : (
                  <div className="users-table-wrapper">
                    <table className="users-table">
                      <thead>
                        <tr>
                          <th className="table-header-username">Username</th>
                          <th className="table-header-fullname">Full Name</th>
                          <th className="table-header-status">Status</th>
                          <th className="table-header-logon">Last Logon</th>
                          <th className="table-header-groups">Groups</th>
                          <th className="table-header-dept">Department</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedMachine ? selectedMachineUsers : 
                          Object.values(allUsers).flat()).map((user, index) => (
                          <tr key={index} className={`user-row ${user.Enabled ? 'enabled' : 'disabled'}`}>
                            <td className="username-cell">
                              <div className="user-avatar">
                                {user.Name?.charAt(0).toUpperCase() || 'U'}
                              </div>
                              <div className="user-details">
                                <div className="user-name" title={user.Name}>
                                  {user.Name}
                                </div>
                                <div className="user-email" title={user.Email || user.UserPrincipalName || 'No email'}>
                                  {user.Email || user.UserPrincipalName || 'No email'}
                                </div>
                              </div>
                            </td>
                            <td className="fullname-cell" title={user.FullName || 'N/A'}>
                              {user.FullName || 'N/A'}
                            </td>
                            <td className="status-cell">
                              <span className={`status-badge ${user.Enabled ? 'enabled' : 'disabled'}`}>
                                {user.Enabled ? 'Enabled' : 'Disabled'}
                              </span>
                              {user.AccountLockedOut && (
                                <span className="status-badge locked">Locked</span>
                              )}
                            </td>
                            <td className="logon-cell">
                              <div className="logon-time" title={formatDate(user.LastLogon)}>
                                {formatDate(user.LastLogon)}
                              </div>
                              <div className="logon-ago">
                                {formatTimeAgo(user.LastLogon)}
                              </div>
                            </td>
                            <td className="groups-cell">
                              {user.Groups && Array.isArray(user.Groups) && user.Groups.length > 0 ? (
                                <div className="groups-tags">
                                  {user.Groups.slice(0, 2).map((group, idx) => (
                                    <span key={idx} className="group-tag" title={group}>
                                      {group}
                                    </span>
                                  ))}
                                  {user.Groups.length > 2 && (
                                    <span className="more-groups" title={user.Groups.slice(2).join(', ')}>
                                      +{user.Groups.length - 2}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="no-groups">No groups</span>
                              )}
                            </td>
                            <td className="department-cell">
                              <span className="department-badge" title={user.Department || 'N/A'}>
                                {user.Department || 'N/A'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
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
};

export default Users;
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useWebSocket } from '../../context/WebSocketContext';
import './Users.css';

const Users = () => {
  const { isConnected, sendCommand, addListener } = useWebSocket();
  const [markedMachines, setMarkedMachines] = useState([]);
  const [machinesLoading, setMachinesLoading] = useState(true);
  const [showMarkModal, setShowMarkModal] = useState(false);
  
  const [allUsers, setAllUsers] = useState({}); 
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
    'Resource Monitor', 'Switch', 'Machine Management',
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
        console.log('Users: Processing logged users response for ALL machines');
        if (responseData && responseData.success !== false && responseData.data) {
          const usersByMachine = {};
          
          if (Array.isArray(responseData.data)) {
            responseData.data.forEach(userData => {
              if (userData.machine_ip) {
                if (!usersByMachine[userData.machine_ip]) {
                  usersByMachine[userData.machine_ip] = [];
                }
                if (Array.isArray(userData.users)) {
                  usersByMachine[userData.machine_ip] = userData.users;
                } else {
                  usersByMachine[userData.machine_ip].push(userData);
                }
              }
            });
          } else if (responseData.data && typeof responseData.data === 'object') {
            Object.keys(responseData.data).forEach(machineIp => {
              const machineUsers = responseData.data[machineIp];
              if (Array.isArray(machineUsers)) {
                usersByMachine[machineIp] = machineUsers;
              }
            });
          }
          
          console.log('Users: Loaded users data by machine:', usersByMachine);
          setAllUsers(usersByMachine);
          setUsersLoading(false);
          setLastRefresh(new Date());
          isFetchingRef.current = false;
          
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
        } else {
          console.log('Users: No valid user data in response');
          setAllUsers({});
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
          if (markedMachines.length > 0) {
            fetchUsersForAllMachines(markedMachines);
          }
        } else {
          const errorMsg = responseData?.error || 'Failed to add user';
          alert(`Error: ${errorMsg}`);
        }
        break;
        
      default:
        console.log(`Users: Unhandled command: ${command}`);
    }
    
  }, [processMachineInfo, markedMachines]);

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

  const handleManualRefresh = useCallback(() => {
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
    
    fetchUsersForAllMachines();
  }, [isConnected, markedMachines.length, fetchUsersForAllMachines, isFetchingRef]);

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
    
    const selectedMachine = markedMachines.find(m => m.ip === newUser.machineIp);
    if (!selectedMachine) {
      alert('Selected machine not found');
      setLoading(false);
      return;
    }

    console.log('Users: Adding user to machine:', {
      machine: selectedMachine.name,
      username: newUser.username
    });

    const windowsInfo = getWindowsInfoForMachine(selectedMachine);
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
                    onClick={handleManualRefresh}
                    className="refresh-button"
                    disabled={usersLoading || !isConnected || isFetchingRef.current || markedMachines.length === 0}
                  >
                    {usersLoading ? 'Refreshing...' : 'Refresh All Users'}
                  </button>
                </div>
              </div>
              
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-count">{markedMachines.length}</div>
                  <div className="stat-label">Marked Machines</div>
                </div>
                <div className="stat-item">
                  <div className="stat-count">{getTotalUsersCount()}</div>
                  <div className="stat-label">Total Users</div>
                </div>
                <div className="stat-item">
                  <div className="stat-count">
                    {getEnabledUsersCount()}
                  </div>
                  <div className="stat-label">Enabled Users</div>
                </div>
                <div className="stat-item">
                  <div className="stat-count">
                    {lastRefresh ? formatLastRefresh() : 'Never'}
                  </div>
                  <div className="stat-label">Last Refresh</div>
                </div>
              </div>
            </div>

            <div className="machine-list-card">
              <div className="machine-list-header">
                <h3 className="section-title">
                  Marked Machines ({markedMachines.length})
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
                <div className="machine-list">
                  {markedMachines.map(machine => {
                    const machineUsers = getUsersForMachine(machine.ip);
                    const enabledUsers = Array.isArray(machineUsers) ? 
                      machineUsers.filter(u => u.Enabled).length : 0;
                    
                    return (
                      <div 
                        key={machine.id}
                        className="machine-item"
                      >
                        <div className="machine-item-header">
                          <div className="machine-item-name">{machine.name}</div>
                          <div className="machine-item-users-count">
                            {Array.isArray(machineUsers) ? machineUsers.length : 0} users
                            {enabledUsers > 0 && (
                              <span className="enabled-users-count"> ({enabledUsers} enabled)</span>
                            )}
                          </div>
                        </div>
                        <div className="machine-item-ip">{machine.ip}</div>
                        <div className="machine-item-user">{machine.username}</div>
                        {machine.marked_as && Array.isArray(machine.marked_as) && machine.marked_as.length > 0 && (
                          <div className="machine-item-roles">
                            {machine.marked_as.map((mark, idx) => (
                              <span key={idx} className={`role-badge ${mark.role}`}>
                                {mark.role} {mark.type}
                              </span>
                            ))}
                          </div>
                        )}
                        
                        {Array.isArray(machineUsers) && machineUsers.length > 0 && (
                          <div className="machine-users-list">
                            {machineUsers.slice(0, 3).map((user, idx) => (
                              <div key={idx} className="user-item-small">
                                <span className={`user-status ${user.Enabled ? 'enabled' : 'disabled'}`}>
                                  ●
                                </span>
                                <span className="user-name-small">{user.Name}</span>
                                <span className="user-logon-small">
                                  {formatDate(user.LastLogon)}
                                </span>
                              </div>
                            ))}
                            {machineUsers.length > 3 && (
                              <div className="more-users">
                                +{machineUsers.length - 3} more users
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
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
                  All Users ({getTotalUsersCount()})
                  {usersLoading && <span className="loading-indicator"> ⟳ Loading...</span>}
                </h3>
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
                ) : getTotalUsersCount() === 0 ? (
                  <div className="no-users-message">
                    No users found on any marked machine.
                  </div>
                ) : (
                  <div className="all-users-tables">
                    {markedMachines.map(machine => {
                      const machineUsers = getUsersForMachine(machine.ip);
                      if (!Array.isArray(machineUsers) || machineUsers.length === 0) {
                        return null;
                      }
                      
                      return (
                        <div key={machine.id} className="machine-users-table">
                          <div className="machine-users-header">
                            <h4>{machine.name} ({machine.ip})</h4>
                            <span className="users-count">{machineUsers.length} users</span>
                          </div>
                          <table className="users-table-small">
                            <thead>
                              <tr>
                                <th>Username</th>
                                <th>Enabled</th>
                                <th>Last Logon</th>
                              </tr>
                            </thead>
                            <tbody>
                              {machineUsers.map((user, index) => (
                                <tr key={index}>
                                  <td>{user.Name}</td>
                                  <td>
                                    <span className={`status-badge-small ${user.Enabled ? 'enabled' : 'disabled'}`}>
                                      {user.Enabled ? 'Yes' : 'No'}
                                    </span>
                                  </td>
                                  <td className="last-logon-cell">
                                    {formatDate(user.LastLogon)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
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
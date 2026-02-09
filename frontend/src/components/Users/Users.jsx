import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
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
  const [userToDelete, setUserToDelete] = useState('');
  const [loading, setLoading] = useState(false);

  // Refs for managing state
  const isFetchingRef = useRef(false);
  const timeoutRef = useRef(null);
  const machineInfoListenerRef = useRef(false);
  const fetchInProgressRef = useRef(false);
  const mountedRef = useRef(false);
  const initialFetchRef = useRef(false);
  
  // Command flow management refs
  const commandInProgressRef = useRef(false);
  const pendingCommandsRef = useRef([]);
  const lastUserFetchTimeRef = useRef(0);
  const commandCooldownTime = 1000; // 1 second cooldown between same commands

  // Payload tracking ref to match responses with machines
  const sentPayloadsRef = useRef({});

  // Get the API base URL dynamically - memoized to prevent recreation
  const API_BASE_URL = useMemo(() => {
    if (typeof window !== 'undefined') {
      const currentHost = window.location.hostname;
      const currentPort = window.location.port;
      
      if (currentHost === 'localhost' || currentHost === '127.0.0.1') {
        return `http://${currentHost}:5000`;
      } else {
        return `http://${currentHost}:5000`;
      }
    }
    return 'http://localhost:5000';
  }, []);

  // ============ COMMAND FLOW MANAGEMENT ============
  
  const sendCommandWithFlow = useCallback((command, payload = null, forceRefresh = false) => {
    console.log(`Users: SENDING COMMAND: ${command}`, payload ? 'with payload' : 'no payload', forceRefresh ? '(force refresh)' : '');
    
    // Store the payload for tracking
    if (payload && payload.windows_info && payload.windows_info.ip) {
      const machineIp = payload.windows_info.ip;
      sentPayloadsRef.current[machineIp] = {
        command,
        payload: JSON.parse(JSON.stringify(payload)),
        timestamp: Date.now(),
        forceRefresh // Store forceRefresh flag separately
      };
      console.log(`Users: Stored payload for machine ${machineIp}`, forceRefresh ? '(force refresh)' : '');
    }
    
    // For get_local_users_windows, bypass cooldown if we're refreshing after add/delete
    if (command === 'get_local_users_windows') {
      const now = Date.now();
      const timeSinceLastFetch = now - lastUserFetchTimeRef.current;
      
      // Only apply cooldown for normal fetches, not for refresh-after-operation
      // Use the forceRefresh parameter passed to this function
      if (timeSinceLastFetch < commandCooldownTime && !forceRefresh) {
        console.log(`Users: Skipping duplicate ${command} command (cooldown: ${commandCooldownTime - timeSinceLastFetch}ms remaining)`);
        return;
      }
      lastUserFetchTimeRef.current = now;
    }
    
    // Check if a command is already in progress
    if (commandInProgressRef.current) {
      console.log(`Users: Command ${command} is already in progress, queueing...`);
      pendingCommandsRef.current.push({ command, payload, forceRefresh });
      return;
    }
    
    // Mark command as in progress
    commandInProgressRef.current = true;
    
    // Send the command - IMPORTANT: Clone payload to avoid mutation issues
    // Do NOT include _forceRefresh in the payload sent to backend
    const payloadToSend = payload ? JSON.parse(JSON.stringify(payload)) : null;
    sendCommand(command, payloadToSend);
    
    // Set a timeout to clear the in-progress flag
    setTimeout(() => {
      commandInProgressRef.current = false;
      
      // Process any pending commands
      if (pendingCommandsRef.current.length > 0) {
        const nextCommand = pendingCommandsRef.current.shift();
        console.log(`Users: Processing queued command: ${nextCommand.command}`);
        sendCommandWithFlow(nextCommand.command, nextCommand.payload, nextCommand.forceRefresh);
      }
    }, 500);
  }, [sendCommand]);

  const processNextCommand = useCallback(() => {
    if (pendingCommandsRef.current.length > 0 && !commandInProgressRef.current) {
      const nextCommand = pendingCommandsRef.current.shift();
      console.log(`Users: Processing queued command: ${nextCommand.command}`);
      sendCommandWithFlow(nextCommand.command, nextCommand.payload, nextCommand.forceRefresh);
    }
  }, [sendCommandWithFlow]);

  // ============ UTILITY FUNCTIONS ============

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

  // ============ MACHINE MANAGEMENT ============

  const getWindowsInfoForMachine = useCallback((machine) => {
    if (!machine) {
      console.error('Users: No machine provided to getWindowsInfoForMachine');
      return null;
    }
    
    console.log(`Users: Getting Windows info for machine: ${machine.name || 'Unknown'} (${machine.ip})`);
    
    const password = machine.password || machine.password_provided || '';
    const username = machine.username || machine.username_provided || 'Administrator';
    
    console.log(`Users: Credentials for machine ${machine.name || machine.ip}:`, {
      username,
      password: password ? '***HIDDEN***' : 'NOT FOUND'
    });
    
    if (!password) {
      console.error('Users: No password found for machine:', machine.name || machine.ip);
      setError(`No password found for machine: ${machine.name || machine.ip}. Please check machine credentials in Machine Management.`);
      return null;
    }
    
    return {
      ip: machine.ip,
      username: username,
      password: password
    };
  }, []);

  const fetchMachineInfo = useCallback(async () => {
    if (fetchInProgressRef.current || !mountedRef.current) {
      console.log('Users: Fetch already in progress or component unmounted');
      return;
    }
    
    fetchInProgressRef.current = true;
    console.log('Users: Fetching machines from Node.js REST API...');
    console.log('API Base URL:', API_BASE_URL);
    setMachinesLoading(true);
    setError(null);
    
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found');
      }
      
      console.log('Users: Trying to fetch machines WITH passwords...');
      
      const response = await fetch(`${API_BASE_URL}/api/machines/get-machines?include_password=true`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        console.log('Users: Endpoint with password parameter failed, trying without parameter...');
        
        const response2 = await fetch(`${API_BASE_URL}/api/machines/get-machines`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (!response2.ok) {
          throw new Error(`Failed to fetch machines: ${response2.status} ${response2.statusText}`);
        }
        
        const data = await response2.json();
        console.log('Users: Received machines from /api/machines/get-machines:', data);
        await processMachineData(data);
        return;
      }
      
      const data = await response.json();
      console.log('Users: Received machines from /api/machines/get-machines?include_password=true:', data);
      await processMachineData(data);
      
    } catch (err) {
      console.error('Users: REST API failed:', err);
      if (mountedRef.current) {
        setError(`Failed to fetch machines: ${err.message}. Please check if machines are properly configured.`);
        setMachinesLoading(false);
      }
    } finally {
      fetchInProgressRef.current = false;
    }
    
    async function processMachineData(data) {
      let machines = [];
      if (data.machines && Array.isArray(data.machines)) {
        machines = data.machines;
      } else if (data.data && Array.isArray(data.data)) {
        machines = data.data;
      } else if (Array.isArray(data)) {
        machines = data;
      }
      
      console.log('Users: Total machines found:', machines.length);
      
      const markedMachinesList = machines.filter(machine => {
        const hasMarks = machine.marked_as && 
                       Array.isArray(machine.marked_as) && 
                       machine.marked_as.length > 0;
        
        if (hasMarks) {
          console.log(`Users: Found marked machine: ${machine.name || 'Unknown'} (${machine.ip})`, {
            id: machine.id,
            hasPassword: !!(machine.password || machine.password_provided),
            hasUsername: !!(machine.username || machine.username_provided),
            marks: machine.marked_as
          });
        }
        
        return hasMarks;
      });
      
      console.log(`Users: Found ${markedMachinesList.length} marked machines:`, markedMachinesList);
      
      const machinesWithPasswords = markedMachinesList.filter(machine => {
        const hasPassword = machine.password || machine.password_provided;
        if (!hasPassword) {
          console.warn(`Users: Machine ${machine.name || 'Unknown'} (${machine.ip}) has no password`);
        }
        return hasPassword;
      });
      
      setMarkedMachines(markedMachinesList);
      setMachinesLoading(false);
      
      if (markedMachinesList.length === 0) {
        console.log('Users: No marked machines found');
        setShowMarkModal(true);
      } else if (machinesWithPasswords.length === 0) {
        console.error('Users: No marked machines have passwords');
        setError('Marked machines found but no passwords available. Please check machine credentials in Machine Management.');
        setShowMarkModal(true);
      } else {
        console.log('Users: Machine fetch complete.');
        
        // ALWAYS default to "Select a machine..." option - NEVER auto-select
        console.log('Users: Defaulting to "Select a machine..." option');
        setSelectedMachine('');
        setNewUser(prev => ({ ...prev, machineIp: '' }));
        localStorage.removeItem('users_selected_machine'); // Clear saved selection
        
        setSelectedMachineUsers([]);
        initialFetchRef.current = true;
      }
    }
  }, [API_BASE_URL]);

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
    
    console.log(`Users: Creating payload for single machine: ${machine.name || 'Unknown'} (${machine.ip})`);
    
    return {
      windows_info: windowsInfo
    };
  }, [getWindowsInfoForMachine]);

  // ============ USER FETCHING FUNCTIONS ============

  const fetchUsersForSingleMachine = useCallback((machine, forceRefresh = false) => {
    if (isFetchingRef.current || !mountedRef.current) {
      console.log('Users: Already fetching users or component unmounted, skipping...');
      return;
    }

    if (!isConnected) {
      console.log('Users: WebSocket not connected');
      setError('Not connected to backend system');
      return;
    }

    console.log(`Users: Fetching users for single machine: ${machine.name || 'Unknown'} (${machine.ip})`, forceRefresh ? '(force refresh)' : '');
    setUsersLoading(true);
    setError(null);
    isFetchingRef.current = true;
    
    const payload = createUsersPayloadForSingleMachine(machine);
    if (!payload) {
      setUsersLoading(false);
      isFetchingRef.current = false;
      return;
    }
    
    // Don't add _forceRefresh to the payload - it's for frontend cooldown only
    // The backend doesn't need this flag
    
    console.log('Users: Sending get_local_users_windows command for single machine with payload:', {
      ...payload,
      windows_info: { ...payload.windows_info, password: '***HIDDEN***' }
    });
    
    // Pass forceRefresh as separate parameter, not in payload
    sendCommandWithFlow('get_local_users_windows', payload, forceRefresh);
    
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    
    timeoutRef.current = setTimeout(() => {
      if (isFetchingRef.current && mountedRef.current) {
        console.log('Users: Timeout: No response from backend');
        setError('Timeout: No response from server');
        setUsersLoading(false);
        isFetchingRef.current = false;
        timeoutRef.current = null;
      }
    }, 30000);
    
  }, [isConnected, createUsersPayloadForSingleMachine, sendCommandWithFlow]);

  // ============ WEBSOCKET MESSAGE HANDLER ============

  const handleWebSocketMessage = useCallback((data) => {
    if (!mountedRef.current) return;
    
    console.log('Users WebSocket message received:', data);
    
    let command, result, error, payload, messageData;
    
    // Parse the incoming message
    if (typeof data === 'string') {
      try {
        messageData = JSON.parse(data);
      } catch (e) {
        console.log('Users: Could not parse message as JSON:', data);
        return;
      }
    } else {
      messageData = data;
    }
    
    console.log('Users: Parsed message data:', messageData);
    
    // Extract command and result based on different message formats
    if (messageData.action === 'response') {
      command = messageData.command;
      result = messageData.result;
      error = messageData.error;
      payload = messageData.payload;
    } else if (messageData.response) {
      const responseObj = messageData.response;
      command = responseObj.command;
      result = responseObj.result;
      error = responseObj.error;
      payload = responseObj.payload;
    } else if (messageData.type === 'COMMAND_RESPONSE') {
      // FIXED: Handle COMMAND_RESPONSE format from middleware
      command = messageData.command;
      result = messageData.data; // Data is in 'data' field, not 'result'
      error = messageData.error;
      // Try to extract payload from original data if available
      if (messageData.originalData && messageData.originalData.payload) {
        payload = messageData.originalData.payload;
      }
    } else if (messageData.command) {
      command = messageData.command;
      result = messageData.result || messageData.data;
      error = messageData.error;
      payload = messageData.payload;
    } else if (messageData.message) {
      console.log('Backend log:', messageData.message);
      return;
    }
    
    if (!command) {
      console.log('No command found in message:', messageData);
      return;
    }
    
    console.log(`Users: Processing response for command: ${command}`, { result, error });
    
    // Handle errors first
    if (error) {
      console.log(`Users: Error from backend for command ${command}:`, error);
      setError(`Error: ${error}`);
      setUsersLoading(false);
      setMachinesLoading(false);
      isFetchingRef.current = false;
      commandInProgressRef.current = false;
      processNextCommand();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }
    
    // Process successful responses
    switch(command) {
      case 'get_local_users_windows':
        console.log('Users: Processing local users response');
        isFetchingRef.current = false;
        
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        
        // Extract the result data
        let responseData = result; // Data is already in result for COMMAND_RESPONSE format
        console.log('Users: Processed response data:', responseData);
        
        // Extract machine IP - use stored payload tracking
        let machineIp = '';
        const currentSelectedMachine = localStorage.getItem('users_selected_machine') || '';
        
        // First try to get IP from stored payloads
        if (currentSelectedMachine && sentPayloadsRef.current[currentSelectedMachine]) {
          machineIp = currentSelectedMachine;
          console.log('Users: Found stored payload for machine:', machineIp);
        }
        
        // Clean up old payloads (older than 30 seconds)
        const now = Date.now();
        Object.keys(sentPayloadsRef.current).forEach(key => {
          if (now - sentPayloadsRef.current[key].timestamp > 30000) {
            delete sentPayloadsRef.current[key];
            console.log(`Users: Cleaned up old payload for machine: ${key}`);
          }
        });
        
        console.log('Users: Extracted machine IP:', machineIp);
        
        if (!machineIp) {
          console.error('Users: Could not determine machine IP from response');
          setError('Could not determine machine from response');
          setUsersLoading(false);
          commandInProgressRef.current = false;
          processNextCommand();
          return;
        }
        
        // Process the user data
        if (responseData && responseData.local_user_details) {
          console.log('Users: Found local_user_details in response:', responseData.local_user_details);
          
          // Convert the object to array format for display
          // The keys are user1, user2, etc.
          const usersArray = [];
          Object.values(responseData.local_user_details).forEach((user, index) => {
            // Ensure we have valid user data
            if (user && (user.username || user.Name)) {
              const username = user.username || user.Name || 'Unknown';
              usersArray.push({
                id: index,
                Name: username,
                FullName: user.full_name || user.FullName || '',
                Description: user.description || user.Description || '',
                Enabled: user.enabled !== false,
                Groups: user.groups || [],
                LastLogon: user.last_logon || null,
                UsernameSimple: username.includes('\\') ? username.split('\\').pop() : username,
                OriginalUsername: username
              });
            }
          });
          
          console.log(`Users: Converted ${usersArray.length} users for machine ${machineIp}:`, usersArray);
          
          // Update state
          setAllUsers(prev => ({
            ...prev,
            [machineIp]: usersArray
          }));
          
          // Update selected machine users if this is the currently selected machine
          if (currentSelectedMachine === machineIp) {
            setSelectedMachineUsers(usersArray);
            console.log('Users: Updated selected machine users:', usersArray.length);
          }
          
          setUsersLoading(false);
          setLastRefresh(new Date());
          setError(null);
          
        } else if (responseData && responseData.message) {
          // Handle empty response case
          console.log('Users: Response with message:', responseData.message);
          
          setAllUsers(prev => ({
            ...prev,
            [machineIp]: []
          }));
          
          if (currentSelectedMachine === machineIp) {
            setSelectedMachineUsers([]);
          }
          
          setUsersLoading(false);
          setLastRefresh(new Date());
          
        } else {
          console.log('Users: No local_user_details in response:', responseData);
          setError('Invalid response format from server');
          setUsersLoading(false);
        }
        
        // Clean up the stored payload
        if (sentPayloadsRef.current[machineIp]) {
          delete sentPayloadsRef.current[machineIp];
          console.log(`Users: Cleaned up payload for machine: ${machineIp}`);
        }
        
        commandInProgressRef.current = false;
        processNextCommand();
        break;
        
      case 'add_local_users_windows':
        console.log('Users: Processing add local user response');
        setLoading(false);
        
        let addResponseData;
        try {
          if (typeof result === 'string') {
            addResponseData = JSON.parse(result);
          } else {
            addResponseData = result;
          }
        } catch (e) {
          addResponseData = result;
        }
        
        if (addResponseData && addResponseData.success !== false) {
          console.log('Users: User added successfully, refreshing user list...');
          
          setNewUser(prev => ({ 
            ...prev, 
            username: '', 
            password: '' 
          }));
          
          // Get current selected machine from localStorage
          const currentSelectedMachine = localStorage.getItem('users_selected_machine');
          if (currentSelectedMachine) {
            console.log('Users: Triggering immediate user refresh after add operation');
            
            // Clear the current users to show loading state
            setSelectedMachineUsers([]);
            
            // Wait 1 second to ensure backend has processed the user creation
            setTimeout(() => {
              // Get current marked machines from state
              const machine = markedMachines.find(m => m.ip === currentSelectedMachine);
              if (machine) {
                fetchUsersForSingleMachine(machine, true);
              }
            }, 1000);
          }
          
          alert('Local user added successfully! Refreshing user list...');
        } else {
          const errorMsg = addResponseData?.error || 'Failed to add local user';
          alert(`Error: ${errorMsg}`);
        }
        commandInProgressRef.current = false;
        processNextCommand();
        break;
        
      case 'delete_local_users_windows':
        console.log('Users: Processing delete local user response');
        setLoading(false);
        
        let deleteResponseData;
        try {
          if (typeof result === 'string') {
            deleteResponseData = JSON.parse(result);
          } else {
            deleteResponseData = result;
          }
        } catch (e) {
          deleteResponseData = result;
        }
        
        if (deleteResponseData && deleteResponseData.success !== false) {
          console.log('Users: User deleted successfully, refreshing user list...');
          
          setUserToDelete('');
          
          // Get current selected machine from localStorage
          const currentSelectedMachine = localStorage.getItem('users_selected_machine');
          if (currentSelectedMachine) {
            console.log('Users: Triggering immediate user refresh after delete operation');
            
            // Clear current users to show loading state
            setSelectedMachineUsers([]);
            
            // Wait longer to ensure backend has processed everything
            setTimeout(() => {
              const machine = markedMachines.find(m => m.ip === currentSelectedMachine);
              if (machine) {
                fetchUsersForSingleMachine(machine, true);
              }
            }, 1500);
          }
          
          alert('Local user deleted successfully! Refreshing user list...');
        } else {
          const errorMsg = deleteResponseData?.error || 'Failed to delete user';
          alert(`Error: ${errorMsg}`);
          console.log('Users: Delete failed, user might not exist or username format is incorrect');
        }
        commandInProgressRef.current = false;
        processNextCommand();
        break;
        
      default:
        console.log(`Users: Unhandled command: ${command}`);
        commandInProgressRef.current = false;
        processNextCommand();
    }
    
  }, [fetchUsersForSingleMachine, processNextCommand, markedMachines]);

  // ============ EVENT HANDLERS ============

  const handleMachineSelect = useCallback((machineIp) => {
    if (!machineIp) {
      setSelectedMachine('');
      setSelectedMachineUsers([]);
      setNewUser(prev => ({ ...prev, machineIp: '' }));
      localStorage.removeItem('users_selected_machine');
      return;
    }
    
    setSelectedMachine(machineIp);
    localStorage.setItem('users_selected_machine', machineIp);
    setNewUser(prev => ({ ...prev, machineIp }));
    
    setSelectedMachineUsers([]); // Clear old users
    const machine = markedMachines.find(m => m.ip === machineIp);
    if (machine) {
      fetchUsersForSingleMachine(machine);
    }
  }, [markedMachines, fetchUsersForSingleMachine]);

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
    
    const targetMachineIp = machineIp || selectedMachine;
    if (targetMachineIp) {
      const machine = markedMachines.find(m => m.ip === targetMachineIp);
      if (machine) {
        fetchUsersForSingleMachine(machine, true);
      }
    } else {
      alert('Please select a machine first');
    }
  }, [isConnected, markedMachines, selectedMachine, fetchUsersForSingleMachine]);

  const handleRefreshMachines = useCallback(() => {
    fetchMachineInfo();
  }, [fetchMachineInfo]);

  // Function to validate password complexity
  const validatePasswordComplexity = (password) => {
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    const isLongEnough = password.length >= 8;
    
    return {
      isValid: hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChar && isLongEnough,
      hasUpperCase,
      hasLowerCase,
      hasNumbers,
      hasSpecialChar,
      isLongEnough
    };
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

    const passwordValidation = validatePasswordComplexity(newUser.password);
    if (!passwordValidation.isValid) {
      let errorMessage = 'Password must meet complexity requirements:\n';
      if (!passwordValidation.isLongEnough) errorMessage += '- At least 8 characters\n';
      if (!passwordValidation.hasUpperCase) errorMessage += '- At least one uppercase letter\n';
      if (!passwordValidation.hasLowerCase) errorMessage += '- At least one lowercase letter\n';
      if (!passwordValidation.hasNumbers) errorMessage += '- At least one number\n';
      if (!passwordValidation.hasSpecialChar) errorMessage += '- At least one special character\n';
      alert(errorMessage);
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

    console.log('Users: Adding local user to machine:', {
      machine: selectedMachineObj.name || 'Unknown',
      username: newUser.username
    });

    const windowsInfo = getWindowsInfoForMachine(selectedMachineObj);
    if (!windowsInfo) {
      setLoading(false);
      return;
    }
    
    const payload = {
      windows_info: windowsInfo,
      new_username: newUser.username,
      new_password: newUser.password
    };
    
    console.log('Users: Sending add user payload:', {
      ...payload,
      windows_info: { ...payload.windows_info, password: '***HIDDEN***' }
    });
    
    sendCommandWithFlow('add_local_users_windows', payload);
  };

  const handleDeleteUser = (username) => {
    if (!username || !selectedMachine) {
      alert('Please select a machine and user to delete');
      return;
    }

    if (!isConnected) {
      alert('Cannot delete user: Not connected to backend system');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete user "${username}"? This action cannot be undone.`)) {
      return;
    }

    setLoading(true);
    
    const selectedMachineObj = markedMachines.find(m => m.ip === selectedMachine);
    if (!selectedMachineObj) {
      alert('Selected machine not found');
      setLoading(false);
      return;
    }

    console.log('Users: Deleting local user from machine:', {
      machine: selectedMachineObj.name || 'Unknown',
      username: username
    });

    const windowsInfo = getWindowsInfoForMachine(selectedMachineObj);
    if (!windowsInfo) {
      setLoading(false);
      return;
    }
    
    // Extract just the username part (in case it's in domain\username format)
    // Use the OriginalUsername if available, otherwise extract from the display name
    const usernameToDelete = username.includes('\\') ? username.split('\\').pop() : username;
    
    console.log('Users: Using username for deletion:', usernameToDelete);
    
    const payload = {
      windows_info: windowsInfo,
      username_to_delete: usernameToDelete
    };
    
    console.log('Users: Sending delete user payload:', {
      ...payload,
      windows_info: { ...payload.windows_info, password: '***HIDDEN***' }
    });
    
    sendCommandWithFlow('delete_local_users_windows', payload);
  };

  // ============ FORMATTING FUNCTIONS ============

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
    if (!machine.marked_as || !Array.isArray(machine.marked_as)) return 'No roles';
    return machine.marked_as.map(mark => mark.role || mark).join(', ');
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

  // ============ USE EFFECTS ============

  // Initialize on component mount
  useEffect(() => {
    console.log('Users Component Mounted');
    mountedRef.current = true;
    
    // Fetch machines immediately on mount
    fetchMachineInfo();
    
    return () => {
      console.log('Users Component Unmounting');
      mountedRef.current = false;
      initialFetchRef.current = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      isFetchingRef.current = false;
      fetchInProgressRef.current = false;
      commandInProgressRef.current = false;
      pendingCommandsRef.current = [];
      sentPayloadsRef.current = {};
    };
  }, [fetchMachineInfo]);

  // Set up WebSocket listener
  useEffect(() => {
    if (!machineInfoListenerRef.current && mountedRef.current) {
      console.log('Users: Setting up WebSocket listener');
      const removeListener = addListener(handleWebSocketMessage);
      machineInfoListenerRef.current = true;
      
      return () => {
        if (removeListener) {
          removeListener();
        }
        machineInfoListenerRef.current = false;
      };
    }
  }, [addListener, handleWebSocketMessage]);

  // ============ MODAL COMPONENT ============

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
                <p>To manage local Windows users, you need to mark at least one machine in Machine Management.</p>
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
                  disabled={machinesLoading || commandInProgressRef.current}
                >
                  {machinesLoading ? 'Loading...' : 'Refresh Machine List'}
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

  // ============ MACHINE SELECTOR COMPONENT ============

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
      return (
        <div className="no-machines-message">
          <div className="no-machines-icon">⚠️</div>
          <div className="no-machines-content">
            <h3>No Marked Machines Found</h3>
            <p>Please mark machines in Machine Management first to manage local users.</p>
            <button
              onClick={handleRefreshMachines}
              className="btn-refresh-machines"
              disabled={machinesLoading || commandInProgressRef.current}
            >
              {machinesLoading ? 'Loading...' : 'Refresh Machines'}
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="machine-selector-simple">
        <div className="selector-container">
          <label className="selector-label">Select Machine:</label>
          <div className="select-wrapper">
            <select
              value={selectedMachine}
              onChange={(e) => handleMachineSelect(e.target.value)}
              className="machine-select"
              disabled={usersLoading || commandInProgressRef.current}
            >
              <option value="">Select a machine...</option>
              {markedMachines.map(machine => (
                <option key={machine.id || machine.ip} value={machine.ip}>
                  {machine.name || 'Unknown'} ({machine.ip}) - {getMachineRoles(machine)}
                </option>
              ))}
            </select>
          </div>
          
          {selectedMachine && (
            <div className="selected-machine-info">
              <div className="machine-info-card">
                <div className="machine-info-header">
                  <h3>{markedMachines.find(m => m.ip === selectedMachine)?.name || 'Unknown'}</h3>
                  <button
                    onClick={() => handleManualRefresh(selectedMachine)}
                    className="refresh-btn-small"
                    disabled={usersLoading || isFetchingRef.current || commandInProgressRef.current}
                  >
                    {usersLoading ? '⟳ Refreshing...' : '⟳ Refresh'}
                  </button>
                </div>
                <div className="machine-info-details">
                  <div className="info-row">
                    <span className="info-label">IP:</span>
                    <span className="info-value">{selectedMachine}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Roles:</span>
                    <span className="info-value roles-badge">
                      {getMachineRoles(markedMachines.find(m => m.ip === selectedMachine)) || 'None'}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Users Loaded:</span>
                    <span className="info-value">{selectedMachineUsers.length}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="users-content">
      <div className="users-header">
        <div className="users-title-container">
          <h1 className="users-title">User Management</h1>
          <div className="header-controls">
            {lastRefresh && (
              <div className="last-updated">
                Last updated: {lastRefresh.toLocaleTimeString()}
                {commandInProgressRef.current && (
                  <span className="command-in-progress-indicator"> | Command in progress...</span>
                )}
              </div>
            )}
            <div className="refresh-buttons-group">
              <button
                onClick={handleRefreshMachines}
                className="refresh-machines-btn"
                disabled={machinesLoading || commandInProgressRef.current}
              >
                {machinesLoading ? 'Loading...' : 'Refresh Machines'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="users-main-content">
        <div className="machine-selector-section">
          <MachineSelector />
        </div>

        <div className="users-content-grid">
          <div className="users-left-panel">
            <div className="form-card">
              <h3 className="form-title">Add Local Windows User</h3>
              <div className="form-content">
                {markedMachines.length === 0 ? (
                  <div className="no-machines-notice">
                    <div className="notice-icon">⚠️</div>
                    <p>No marked machines available.</p>
                    <p>Please mark machines in Machine Management first.</p>
                  </div>
                ) : (
                  <>
                    <div className="form-group">
                      <label className="form-label">Select Machine</label>
                      <div className="select-wrapper">
                        <select
                          value={newUser.machineIp || selectedMachine}
                          onChange={(e) => setNewUser({ ...newUser, machineIp: e.target.value })}
                          className="form-select"
                          disabled={loading || !isConnected || usersLoading || commandInProgressRef.current}
                        >
                          <option value="">Choose a machine...</option>
                          {markedMachines.map(machine => (
                            <option key={machine.id || machine.ip} value={machine.ip}>
                              {machine.name || 'Unknown'} ({machine.ip})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    
                    {(newUser.machineIp || selectedMachine) ? (
                      <>
                        <div className="form-group">
                          <label className="form-label">Username</label>
                          <input
                            type="text"
                            value={newUser.username}
                            onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                            className="form-input"
                            placeholder="Enter username (min. 2 characters)"
                            disabled={loading || !isConnected || commandInProgressRef.current}
                          />
                          <div className="form-hint">Username must be at least 2 characters long</div>
                        </div>
                        <div className="form-group">
                          <label className="form-label">Password</label>
                          <input
                            type="password"
                            value={newUser.password}
                            onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                            className="form-input"
                            placeholder="Enter complex password"
                            disabled={loading || !isConnected || commandInProgressRef.current}
                          />
                          <div className="form-hint">
                            Password must include: uppercase, lowercase, numbers, special characters, and be at least 8 characters
                          </div>
                          {newUser.password && (
                            <div className="password-validation">
                              <div className={`validation-item ${newUser.password.length >= 8 ? 'valid' : 'invalid'}`}>
                                ✓
                              </div>
                              <div className={`validation-item ${/[A-Z]/.test(newUser.password) ? 'valid' : 'invalid'}`}>
                                A
                              </div>
                              <div className={`validation-item ${/[a-z]/.test(newUser.password) ? 'valid' : 'invalid'}`}>
                                a
                              </div>
                              <div className={`validation-item ${/\d/.test(newUser.password) ? 'valid' : 'invalid'}`}>
                                1
                              </div>
                              <div className={`validation-item ${/[!@#$%^&*(),.?":{}|<>]/.test(newUser.password) ? 'valid' : 'invalid'}`}>
                                !
                              </div>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={handleAddUser}
                          className="form-button"
                          disabled={loading || !isConnected || !newUser.username || !newUser.password || usersLoading || commandInProgressRef.current}
                        >
                          {loading ? 'Adding...' : 'Add Local User'}
                        </button>
                      </>
                    ) : (
                      <div className="select-machine-prompt-form">
                        <p>Please select a machine from the dropdown above to add users.</p>
                      </div>
                    )}
                    
                    {!isConnected && (
                      <div className="no-connection-notice">
                        Connect to backend to manage local users
                      </div>
                    )}
                    {commandInProgressRef.current && (
                      <div className="command-progress-notice">
                        <span className="command-spinner-small"></span>
                        Command in progress...
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="users-right-panel">
            <div className="all-users-card">
              <div className="all-users-header">
                <h3 className="section-title">
                  {selectedMachine ? 
                    `Local Users on ${markedMachines.find(m => m.ip === selectedMachine)?.name || 'Unknown'} (${selectedMachineUsers.length})` :
                    'Select a machine to view local users'
                  }
                  {usersLoading && <span className="loading-indicator"> ⟳ Loading...</span>}
                  {commandInProgressRef.current && <span className="command-indicator"> ⚙ Command in progress...</span>}
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
                ) : !selectedMachine ? (
                  <div className="no-users-message select-machine-prompt">
                    <div className="select-machine-prompt-content">
                      <div className="select-machine-prompt-icon">👥</div>
                      <div className="select-machine-prompt-text">
                        <p>Please select a machine from the dropdown above to view and manage its local Windows users.</p>
                      </div>
                    </div>
                  </div>
                ) : usersLoading ? (
                  <div className="loading-users-message">
                    <div className="loading-spinner"></div>
                    Loading local users from {markedMachines.find(m => m.ip === selectedMachine)?.name || 'Unknown'}...
                    {commandInProgressRef.current && (
                      <div className="command-progress-note">Command in progress...</div>
                    )}
                  </div>
                ) : selectedMachineUsers.length === 0 ? (
                  <div className="no-users-message">
                    <div className="no-users-icon">👥</div>
                    <div className="no-users-content">
                      <h3>No Local Users Found</h3>
                      <p>No local users found on {markedMachines.find(m => m.ip === selectedMachine)?.name || 'Unknown'}.</p>
                      <p>Click "Refresh" to load users or "Add Local User" to create a new user.</p>
                    </div>
                  </div>
                ) : (
                  <div className="users-table-wrapper">
                    <table className="users-table">
                      <thead>
                        <tr>
                          <th className="table-header-username">Username</th>
                          <th className="table-header-fullname">Full Name</th>
                          <th className="table-header-description">Description</th>
                          <th className="table-header-status">Status</th>
                          <th className="table-header-actions">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedMachineUsers.map((user, index) => (
                          <tr key={user.id || index} className={`user-row ${user.Enabled ? 'enabled' : 'disabled'}`}>
                            <td className="username-cell">
                              <div className="user-avatar">
                                {user.Name?.charAt(0).toUpperCase() || 'U'}
                              </div>
                              <div className="user-details">
                                <div className="user-name" title={user.Name}>
                                  {user.Name}
                                </div>
                                {user.UsernameSimple && user.UsernameSimple !== user.Name && (
                                  <div className="user-simple-name" title="Simple username for deletion">
                                    ({user.UsernameSimple})
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="fullname-cell" title={user.FullName || 'N/A'}>
                              {user.FullName || 'N/A'}
                            </td>
                            <td className="description-cell" title={user.Description || 'No description'}>
                              {user.Description || 'No description'}
                            </td>
                            <td className="status-cell">
                              <span className={`status-badge ${user.Enabled ? 'enabled' : 'disabled'}`}>
                                {user.Enabled ? 'Enabled' : 'Disabled'}
                              </span>
                            </td>
                            <td className="actions-cell">
                              <button
                                onClick={() => handleDeleteUser(user.Name)}
                                className="delete-user-btn"
                                disabled={loading || commandInProgressRef.current}
                                title="Delete user"
                              >
                                Delete
                              </button>
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
            disabled={commandInProgressRef.current}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
};

export default Users;
import React, { useState, useEffect } from 'react';
import './MachineManagement.css';
import axios from 'axios';

const API_BASE_URL = "http://192.168.1.72:5000/api";

const MachineManagement = () => {
  const [machineForm, setMachineForm] = useState({
    name: '',
    ip: '',
    username: '',
    password: '',
    user: ''
  });

  const [machines, setMachines] = useState([]);
  const [markingOptions, setMarkingOptions] = useState({});
  const [assignedRoles, setAssignedRoles] = useState({
    dhcp: { primary: null, secondary: null },
    dns: { primary: null, secondary: null },
    ad: { primary: null }
  });

  const [isLoadingMachines, setIsLoadingMachines] = useState(false);
  const [isAddingMachine, setIsAddingMachine] = useState(false);
  const [isMarkingMachine, setIsMarkingMachine] = useState({});
  const [isUnmarkingMachine, setIsUnmarkingMachine] = useState({});
  const [apiStatus, setApiStatus] = useState('idle'); 
  const getAuthHeaders = () => {
    const token = localStorage.getItem('token') || '';
    return {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  };

  const checkApiHealth = async () => {
    try {
      const token = localStorage.getItem('token') || '';
      const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
      
      const response = await axios.get(`${API_BASE_URL}/health`, {
        headers,
        timeout: 5000
      });
      console.log('Health check response:', response.status);
      return response.status === 200;
    } catch (error) {
      console.warn('API health check failed:', error.message);
      return false;
    }
  };

  useEffect(() => {
    const init = async () => {
      const token = localStorage.getItem('token');
      console.log('Initializing Machine Management with token:', token ? 'Present' : 'Missing');
      
      if (token) {
        try {
          await loadMachines();
          setApiStatus('success');
        } catch (error) {
          console.log('Initial load failed, checking health...');
          const isHealthy = await checkApiHealth();
          setApiStatus(isHealthy ? 'success' : 'error');
        }
      } else {
        setApiStatus('error');
      }
    };
    init();
  }, []);

  const loadMachines = async () => {
    setIsLoadingMachines(true);
    try {
      console.log('Loading machines from Node.js REST API...');
      
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found. Please log in again.');
      }
      
      const fullUrl = `${API_BASE_URL}/machines/get-machines`;
      console.log('Calling URL:', fullUrl);
      
      const response = await axios.get(fullUrl, {
        headers: getAuthHeaders(),
        timeout: 10000
      });
      
      console.log('Machine load response:', response.data);
      
      let machinesData = [];
      if (response.data && response.data.success) {
        machinesData = response.data.machines || response.data.data || [];
      } else if (Array.isArray(response.data)) {
        machinesData = response.data;
      }
      
      if (machinesData.length > 0) {
        const fixedMachines = machinesData.map(machine => {
          if (machine.marked_as) {
            try {
              if (typeof machine.marked_as === 'string') {
                return {
                  ...machine,
                  marked_as: JSON.parse(machine.marked_as)
                };
              }
              return machine;
            } catch (error) {
              console.warn(`Error parsing marked_as for machine ${machine.id}:`, error);
              return {
                ...machine,
                marked_as: [] 
              };
            }
          }
          return machine;
        });
        
        setMachines(fixedMachines);
        updateAssignedRoles(fixedMachines);
        setApiStatus('success');
        console.log(`Loaded ${fixedMachines.length} machines`);
      } else {
        console.log('No machines found or empty response');
        setMachines([]);
        setApiStatus('success'); 
      }
    } catch (error) {
      console.error('Error loading machines:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        url: error.config?.url
      });
      
      setMachines([]);
      setApiStatus('error');
      
      if (error.response?.status === 401) {
        alert('Authentication failed. Please log in again.');
      } else if (error.response?.status === 404) {
        alert(`API endpoint not found (404). Please check if backend is running.\nTried: ${error.config?.url}`);
      } else if (error.response?.data?.error) {
        alert(`Error: ${error.response.data.error}`);
      } else if (error.code === 'ECONNABORTED') {
        alert('Connection timeout. Please check if the backend server is running.');
      } else if (error.message === 'Network Error') {
        alert('Network error. Please check if the backend server is running at ' + API_BASE_URL);
      } else {
        alert('Failed to load machines. Please check your connection.');
      }
    } finally {
      setIsLoadingMachines(false);
    }
  };

  const updateAssignedRoles = (machines) => {
    if (!Array.isArray(machines)) return;
    
    const newAssignedRoles = {
      dhcp: { primary: null, secondary: null },
      dns: { primary: null, secondary: null },
      ad: { primary: null }
    };

    machines.forEach(machine => {
      if (machine && machine.marked_as) {
        const marks = Array.isArray(machine.marked_as) ? machine.marked_as : [];
        
        marks.forEach(mark => {
          if (mark && mark.role === 'dhcp') {
            if (mark.type === 'primary') newAssignedRoles.dhcp.primary = machine.id;
            if (mark.type === 'secondary') newAssignedRoles.dhcp.secondary = machine.id;
          }
          if (mark && mark.role === 'dns') {
            if (mark.type === 'primary') newAssignedRoles.dns.primary = machine.id;
            if (mark.type === 'secondary') newAssignedRoles.dns.secondary = machine.id;
          }
          if (mark && mark.role === 'ad' && mark.type === 'primary') {
            newAssignedRoles.ad.primary = machine.id;
          }
        });
      }
    });

    setAssignedRoles(newAssignedRoles);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setMachineForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const resetForm = () => {
    setMachineForm({
      name: '',
      ip: '',
      username: '',
      password: '',
      user: ''
    });
  };

  const handleAddMachine = async (e) => {
    e.preventDefault();
    
    if (apiStatus === 'error') {
      alert('Cannot add machine. API connection failed. Please check backend server.');
      return;
    }
    
    if (!machineForm.name || !machineForm.ip || !machineForm.username || !machineForm.password) {
      alert('Please fill in all required fields');
      return;
    }

    const ipPattern = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    if (!ipPattern.test(machineForm.ip)) {
      alert('Please enter a valid IP address');
      return;
    }

    try {
      setIsAddingMachine(true);
      console.log('Adding machine via Node.js API:', machineForm);
      
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('No authentication token found. Please log in again.');
      }
      
      const fullUrl = `${API_BASE_URL}/machines/add-machine`;
      console.log('Calling URL:', fullUrl);
      
      const response = await axios.post(fullUrl, machineForm, {
        headers: getAuthHeaders(),
        timeout: 10000
      });
      
      console.log('Add machine response:', response.data);
      
      if (response.data && response.data.success) {
        alert('Machine added successfully!');
        resetForm(); 
        loadMachines(); 
      } else {
        const errorMessage = response.data?.error || response.data?.message || 'Unknown error occurred';
        alert(`Error: ${errorMessage}`);
      }
    } catch (error) {
      console.error('Error adding machine:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        url: error.config?.url
      });
      
      if (error.response?.status === 404) {
        alert(`API endpoint not found (404). Please check if backend is running.\nTried: ${error.config?.url}`);
      } else if (error.response?.data?.error) {
        alert(`Error: ${error.response.data.error}`);
      } else if (error.code === 'ECONNABORTED') {
        alert('Connection timeout. Please check if the backend server is running.');
      } else {
        alert('Failed to add machine. Please check connection.');
      }
    } finally {
      setIsAddingMachine(false);
    }
  };

  const handleMarkMachine = async (machineId) => {
    if (apiStatus === 'error') {
      alert('Cannot mark machine. API connection failed.');
      return;
    }
    
    const options = markingOptions[machineId] || {};
    
    const marks = [];
    
    if (options.dhcp) {
      const dhcpType = options.dhcpType || 'primary';
      if (dhcpType === 'primary' && assignedRoles.dhcp.primary) {
        alert(`DHCP Primary is already assigned to Machine ${assignedRoles.dhcp.primary}`);
        return;
      }
      if (dhcpType === 'secondary' && assignedRoles.dhcp.secondary) {
        alert(`DHCP Secondary is already assigned to Machine ${assignedRoles.dhcp.secondary}`);
        return;
      }
      marks.push({ role: 'dhcp', type: dhcpType });
    }
    
    if (options.dns) {
      const dnsType = options.dnsType || 'primary';
      if (dnsType === 'primary' && assignedRoles.dns.primary) {
        alert(`DNS Primary is already assigned to Machine ${assignedRoles.dns.primary}`);
        return;
      }
      if (dnsType === 'secondary' && assignedRoles.dns.secondary) {
        alert(`DNS Secondary is already assigned to Machine ${assignedRoles.dns.secondary}`);
        return;
      }
      marks.push({ role: 'dns', type: dnsType });
    }
    
    if (options.ad) {
      if (assignedRoles.ad.primary) {
        alert(`AD Primary is already assigned to Machine ${assignedRoles.ad.primary}`);
        return;
      }
      marks.push({ role: 'ad', type: 'primary' });
    }
    
    if (marks.length === 0) {
      alert('Please select at least one role to mark');
      return;
    }

    try {
      setIsMarkingMachine(prev => ({ ...prev, [machineId]: true }));
      
      console.log('Marking machine via Node.js API:', { machineId, marks });
      
      const fullUrl = `${API_BASE_URL}/machines/mark-machine/${machineId}`;
      console.log('Calling URL:', fullUrl);
      
      const response = await axios.post(fullUrl, 
        { marks }, 
        { 
          headers: getAuthHeaders(),
          timeout: 10000
        }
      );
      
      console.log('Mark machine response:', response.data);
      
      if (response.data && response.data.success) {
        alert('Machine marked successfully!');
        setMarkingOptions(prev => ({ ...prev, [machineId]: {} }));
        loadMachines(); 
      } else {
        const errorMessage = response.data?.error || response.data?.message || 'Unknown error occurred';
        alert(`Error: ${errorMessage}`);
      }
    } catch (error) {
      console.error('Error marking machine:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        url: error.config?.url
      });
      
      if (error.response?.status === 404) {
        alert(`API endpoint not found (404). Please check if backend is running.\nTried: ${error.config?.url}`);
      } else if (error.response?.data?.error) {
        alert(`Error: ${error.response.data.error}`);
      } else if (error.code === 'ECONNABORTED') {
        alert('Connection timeout. Please check if the backend server is running.');
      } else {
        alert('Failed to mark machine. Please check connection.');
      }
    } finally {
      setIsMarkingMachine(prev => ({ ...prev, [machineId]: false }));
    }
  };

  const handleUnmarkMachine = async (machineId) => {
    if (apiStatus === 'error') {
      alert('Cannot unmark machine. API connection failed.');
      return;
    }
    
    try {
      setIsUnmarkingMachine(prev => ({ ...prev, [machineId]: true }));
      
      console.log('Unmarking machine via Node.js API:', machineId);
      
      const fullUrl = `${API_BASE_URL}/machines/unmark-machine/${machineId}`;
      console.log('Calling URL:', fullUrl);
      
      const response = await axios.post(fullUrl, 
        {}, 
        { 
          headers: getAuthHeaders(),
          timeout: 10000
        }
      );
      
      console.log('Unmark machine response:', response.data);
      
      if (response.data && response.data.success) {
        alert('Machine unmarked successfully!');
        loadMachines(); 
      } else {
        const errorMessage = response.data?.error || response.data?.message || 'Unknown error occurred';
        alert(`Error: ${errorMessage}`);
      }
    } catch (error) {
      console.error('Error unmarking machine:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        url: error.config?.url
      });
      
      if (error.response?.status === 404) {
        alert(`API endpoint not found (404). Please check if backend is running.\nTried: ${error.config?.url}`);
      } else if (error.response?.data?.error) {
        alert(`Error: ${error.response.data.error}`);
      } else if (error.code === 'ECONNABORTED') {
        alert('Connection timeout. Please check if the backend server is running.');
      } else {
        alert('Failed to unmark machine. Please check connection.');
      }
    } finally {
      setIsUnmarkingMachine(prev => ({ ...prev, [machineId]: false }));
    }
  };

  const handleMarkingChange = (machineId, option, value) => {
    setMarkingOptions(prev => ({
      ...prev,
      [machineId]: {
        ...prev[machineId],
        [option]: value
      }
    }));
  };

  const handleMarkingTypeChange = (machineId, role, type) => {
    setMarkingOptions(prev => ({
      ...prev,
      [machineId]: {
        ...prev[machineId],
        [`${role}Type`]: type
      }
    }));
  };

  const isRoleAvailable = (role, type) => {
    if (role === 'dhcp') {
      return type === 'primary' ? !assignedRoles.dhcp.primary : !assignedRoles.dhcp.secondary;
    }
    if (role === 'dns') {
      return type === 'primary' ? !assignedRoles.dns.primary : !assignedRoles.dns.secondary;
    }
    if (role === 'ad') {
      return !assignedRoles.ad.primary;
    }
    return true;
  };

  const getAssignedMachineName = (role, type) => {
    const machineId = assignedRoles[role]?.[type];
    if (machineId) {
      const machine = machines.find(m => m.id === machineId);
      return machine ? machine.name : `Machine ${machineId}`;
    }
    return 'None';
  };

  const hasMarks = (machine) => {
    if (!machine || !machine.marked_as) return false;
    
    try {
      if (typeof machine.marked_as === 'string') {
        const parsed = JSON.parse(machine.marked_as);
        return Array.isArray(parsed) && parsed.length > 0;
      }
      return Array.isArray(machine.marked_as) && machine.marked_as.length > 0;
    } catch (error) {
      console.warn('Error checking marks for machine:', machine.id, error);
      return false;
    }
  };

  const getMachineMarks = (machine) => {
    if (!machine || !machine.marked_as) return [];
    
    try {
      if (typeof machine.marked_as === 'string') {
        return JSON.parse(machine.marked_as);
      }
      return Array.isArray(machine.marked_as) ? machine.marked_as : [];
    } catch (error) {
      console.warn('Error getting marks for machine:', machine.id, error);
      return [];
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return 'Invalid Date';
    }
  };

  const isMachineProcessing = (machineId) => {
    return isMarkingMachine[machineId] || isUnmarkingMachine[machineId];
  };

  const isApiAvailable = apiStatus === 'success';
  
  const isAuthenticated = !!localStorage.getItem('token');

  const calculateMarkedMachines = () => {
    const marked = machines.filter(m => hasMarks(m)).length;
    return marked;
  };

  const markedMachinesBadge = calculateMarkedMachines();

  return (
    <div className="machine-management">
      <div className="page-header">
        <h1>Machine Management</h1>
        <div className="header-badges">
          {markedMachinesBadge > 0 && (
            <span className="marked-badge">
               {markedMachinesBadge} Machine{markedMachinesBadge !== 1 ? 's' : ''} Marked
            </span>
          )}
          {markedMachinesBadge === 0 && machines.length > 0 && (
            <span className="unmarked-badge">
              No Machines Marked
            </span>
          )}
          <span className="total-badge">
            Total: {machines.length}
          </span>
        </div>
      </div>
      
      {!isAuthenticated && (
        <div className="auth-warning">
          <p>Please log in to manage machines.</p>
        </div>
      )}

      <div className="add-machine-section">
        <h2>Add New Machine</h2>
        <form onSubmit={handleAddMachine} className="machine-form">
          <div className="form-group">
            <label htmlFor="name">Machine Name *</label>
            <input
              type="text"
              id="name"
              name="name"
              value={machineForm.name}
              onChange={handleInputChange}
              placeholder="e.g., Server-01"
              required
              disabled={isAddingMachine || !isApiAvailable || !isAuthenticated}
            />
          </div>

          <div className="form-group">
            <label htmlFor="ip">IP Address *</label>
            <input
              type="text"
              id="ip"
              name="ip"
              value={machineForm.ip}
              onChange={handleInputChange}
              placeholder="e.g., 192.168.1.100"
              required
              disabled={isAddingMachine || !isApiAvailable || !isAuthenticated}
            />
          </div>

          <div className="form-group">
            <label htmlFor="username">Username *</label>
            <input
              type="text"
              id="username"
              name="username"
              value={machineForm.username}
              onChange={handleInputChange}
              placeholder="e.g., administrator"
              required
              disabled={isAddingMachine || !isApiAvailable || !isAuthenticated}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password *</label>
            <input
              type="password"
              id="password"
              name="password"
              value={machineForm.password}
              onChange={handleInputChange}
              placeholder="Enter password"
              required
              disabled={isAddingMachine || !isApiAvailable || !isAuthenticated}
            />
          </div>

          <div className="form-group">
            <label htmlFor="user">Added By (Optional)</label>
            <input
              type="text"
              id="user"
              name="user"
              value={machineForm.user}
              onChange={handleInputChange}
              placeholder="Your name"
              disabled={isAddingMachine || !isApiAvailable || !isAuthenticated}
            />
          </div>

          <button 
            type="submit" 
            className="add-button" 
            disabled={!isApiAvailable || isAddingMachine || !isAuthenticated}
          >
            {isAddingMachine ? 'Adding...' : 'Add Machine'}
          </button>
          
          {!isAuthenticated && (
            <p className="info-note">Please log in to add machines</p>
          )}
        </form>
      </div>

      <div className="roles-overview">
        <h2>Assigned Roles</h2>
        <div className="roles-grid">
          <div className="role-card">
            <h3>DHCP</h3>
            <p><strong>Primary:</strong> {getAssignedMachineName('dhcp', 'primary')}</p>
            <p><strong>Secondary:</strong> {getAssignedMachineName('dhcp', 'secondary')}</p>
          </div>
          <div className="role-card">
            <h3>DNS</h3>
            <p><strong>Primary:</strong> {getAssignedMachineName('dns', 'primary')}</p>
            <p><strong>Secondary:</strong> {getAssignedMachineName('dns', 'secondary')}</p>
          </div>
          <div className="role-card">
            <h3>Active Directory</h3>
            <p><strong>Primary:</strong> {getAssignedMachineName('ad', 'primary')}</p>
          </div>
        </div>
      </div>

      <div className="available-machines">
        <div className="section-header">
          <h2>Available Machines ({machines.length})</h2>
          <div className="header-actions">
            <button onClick={loadMachines} className="refresh-button-small" disabled={!isApiAvailable || isLoadingMachines || !isAuthenticated}>
              {isLoadingMachines ? 'Loading...' : '↻ Refresh'}
            </button>
            {markedMachinesBadge > 0 && (
              <span className="marked-count-badge">
                {markedMachinesBadge} Marked
              </span>
            )}
          </div>
        </div>
        
        {!isAuthenticated ? (
          <div className="auth-required">
            <p>Please log in to view machines.</p>
          </div>
        ) : isLoadingMachines && machines.length === 0 ? (
          <div className="loading-machines">
            <p>Loading machines from Node.js API...</p>
            <div className="loader"></div>
          </div>
        ) : machines.length === 0 ? (
          <div className="no-machines">
            <p>No machines added yet. Add your first machine above.</p>
          </div>
        ) : (
          <div className="machines-grid">
            {machines.map(machine => {
              const isProcessing = isMachineProcessing(machine.id);
              const isMarked = hasMarks(machine);
              const machineMarks = getMachineMarks(machine);
              
              return (
                <div key={machine.id} className="machine-card">
                  <div className="machine-header">
                    <div className="machine-title">
                      <h3>{machine.name}</h3>
                      <div className="machine-status-badges">
                        {isMarked ? (
                          <span className="status marked">
                            Marked ({machineMarks.length} role{machineMarks.length !== 1 ? 's' : ''})
                          </span>
                        ) : (
                          <span className="status available">
                            Available
                          </span>
                        )}
                      </div>
                    </div>
                    {isMarked && (
                      <div className="machine-roles-badges">
                        {machineMarks.map((mark, index) => (
                          <span 
                            key={index} 
                            className={`role-badge ${mark.role}`}
                            title={`${mark.role?.toUpperCase() || 'Unknown'} - ${mark.type || 'unknown'}`}
                          >
                            {mark.role?.toUpperCase() || 'Unknown'} {mark.type || ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  <div className="machine-info">
                    <p><strong>IP:</strong> {machine.ip}</p>
                    <p><strong>Username:</strong> {machine.username}</p>
                    <p><strong>Added By:</strong> {machine.user || 'N/A'}</p>
                    <p><strong>Added On:</strong> {formatDate(machine.created_at)}</p>
                    <p><strong>ID:</strong> {machine.id}</p>
                    
                    {isMarked && (
                      <div className="current-marks">
                        <strong>Currently Marked As:</strong>
                        <ul>
                          {machineMarks.map((mark, index) => (
                            <li key={index} className={`mark-${mark.role}`}>
                              <span className="mark-role">{mark.role?.toUpperCase() || 'Unknown'}</span>
                              <span className="mark-type">({mark.type || 'unknown'})</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <div className="marking-section">
                    <h4>{isMarked ? 'Change Marks' : 'Mark As:'}</h4>
                    
                    <div className="marking-options">
                      <div className="marking-option">
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={!!markingOptions[machine.id]?.dhcp}
                            onChange={(e) => handleMarkingChange(machine.id, 'dhcp', e.target.checked)}
                            disabled={isMarked && machineMarks.some(m => m.role === 'dhcp') || isProcessing || !isApiAvailable || !isAuthenticated}
                          />
                          <span>DHCP</span>
                        </label>
                        {markingOptions[machine.id]?.dhcp && (
                          <div className="type-options">
                            <label>
                              <input
                                type="radio"
                                name={`dhcp-type-${machine.id}`}
                                value="primary"
                                checked={markingOptions[machine.id]?.dhcpType === 'primary'}
                                onChange={() => handleMarkingTypeChange(machine.id, 'dhcp', 'primary')}
                                disabled={!isRoleAvailable('dhcp', 'primary') || isProcessing || !isApiAvailable || !isAuthenticated}
                              />
                              Primary
                            </label>
                            <label>
                              <input
                                type="radio"
                                name={`dhcp-type-${machine.id}`}
                                value="secondary"
                                checked={markingOptions[machine.id]?.dhcpType === 'secondary'}
                                onChange={() => handleMarkingTypeChange(machine.id, 'dhcp', 'secondary')}
                                disabled={!isRoleAvailable('dhcp', 'secondary') || isProcessing || !isApiAvailable || !isAuthenticated}
                              />
                              Secondary
                            </label>
                          </div>
                        )}
                      </div>

                      <div className="marking-option">
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={!!markingOptions[machine.id]?.dns}
                            onChange={(e) => handleMarkingChange(machine.id, 'dns', e.target.checked)}
                            disabled={isMarked && machineMarks.some(m => m.role === 'dns') || isProcessing || !isApiAvailable || !isAuthenticated}
                          />
                          <span>DNS</span>
                        </label>
                        {markingOptions[machine.id]?.dns && (
                          <div className="type-options">
                            <label>
                              <input
                                type="radio"
                                name={`dns-type-${machine.id}`}
                                value="primary"
                                checked={markingOptions[machine.id]?.dnsType === 'primary'}
                                onChange={() => handleMarkingTypeChange(machine.id, 'dns', 'primary')}
                                disabled={!isRoleAvailable('dns', 'primary') || isProcessing || !isApiAvailable || !isAuthenticated}
                              />
                              Primary
                            </label>
                            <label>
                              <input
                                type="radio"
                                name={`dns-type-${machine.id}`}
                                value="secondary"
                                checked={markingOptions[machine.id]?.dnsType === 'secondary'}
                                onChange={() => handleMarkingTypeChange(machine.id, 'dns', 'secondary')}
                                disabled={!isRoleAvailable('dns', 'secondary') || isProcessing || !isApiAvailable || !isAuthenticated}
                              />
                              Secondary
                            </label>
                          </div>
                        )}
                      </div>

                      <div className="marking-option">
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={!!markingOptions[machine.id]?.ad}
                            onChange={(e) => handleMarkingChange(machine.id, 'ad', e.target.checked)}
                            disabled={isMarked && machineMarks.some(m => m.role === 'ad') || isProcessing || !isApiAvailable || !isAuthenticated}
                          />
                          <span>Active Directory</span>
                        </label>
                        {markingOptions[machine.id]?.ad && (
                          <div className="type-options">
                            <span className="type-info">Primary Only</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="action-buttons">
                      {isMarked ? (
                        <button
                          onClick={() => handleUnmarkMachine(machine.id)}
                          className="unmark-button"
                          disabled={isProcessing || !isApiAvailable || !isAuthenticated}
                        >
                          {isUnmarkingMachine[machine.id] ? 'Processing...' : 'Unmark All'}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleMarkMachine(machine.id)}
                          className="mark-button"
                          disabled={
                            (!markingOptions[machine.id]?.dhcp &&
                             !markingOptions[machine.id]?.dns &&
                             !markingOptions[machine.id]?.ad) ||
                            isProcessing ||
                            !isApiAvailable ||
                            !isAuthenticated
                          }
                        >
                          {isMarkingMachine[machine.id] ? 'Processing...' : 'Mark Machine'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default MachineManagement;
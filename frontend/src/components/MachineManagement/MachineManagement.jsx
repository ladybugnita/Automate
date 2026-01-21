import React, { useState, useEffect } from 'react';
import './MachineManagement.css';
import { useWebSocket } from '../../context/WebSocketContext'; 

const MachineManagement = () => {
  const { 
    sendCommandAsync, 
    isConnected, 
    addListener, 
    installations 
  } = useWebSocket();
  
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
  
  const [responseListener, setResponseListener] = useState(null);

  useEffect(() => {
    const listener = (data) => {
      console.log('MachineManagement received WebSocket response:', data);
      
      if (data && data.action === 'response' && data.command) {
        handleResponse(data);
      }
    };

    const removeListener = addListener(listener);
    setResponseListener(() => removeListener);

    return () => {
      if (removeListener) removeListener();
    };
  }, [addListener]);

  useEffect(() => {
    if (isConnected) {
      loadMachines();
    }
  }, [isConnected]);

  const loadMachines = async () => {
    setIsLoadingMachines(true);
    try {
      console.log('Loading machines from backend...');
      const response = await sendCommandAsync('get_machine_info');
      
      console.log('Machine load response:', response);
      
      let machinesData = [];
      if (response) {
        if (response.result && response.result.machines) {
          machinesData = response.result.machines;
        } else if (Array.isArray(response.result)) {
          machinesData = response.result;
        } else if (Array.isArray(response)) {
          machinesData = response;
        }
      }
      
      if (machinesData.length > 0) {
        setMachines(machinesData);
        updateAssignedRoles(machinesData);
      } else {
        console.log('No machines found or empty response');
      }
    } catch (error) {
      console.error('Error loading machines:', error);
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
      if (machine && machine.marked_as && Array.isArray(machine.marked_as)) {
        machine.marked_as.forEach(mark => {
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

  const handleResponse = (response) => {
    console.log('Handling WebSocket response in MachineManagement:', response);
    
    if (!response || !response.command) return;
    
    const { command, result } = response;
    
    console.log(`Response for command ${command}:`, result);
    
    switch (command) {
      case 'get_machine_info':
        if (result && result.machines) {
          setMachines(result.machines);
          updateAssignedRoles(result.machines);
        }
        break;
      
      case 'add_machine_info':
        if (result) {
          if (result.success) {
            console.log('Machine added successfully via WebSocket:', result);
            loadMachines(); 
          } else {
            console.error('Failed to add machine:', result.error);
          }
        }
        setIsAddingMachine(false);
        break;
      
      case 'mark_machine':
        if (result && result.machine_id) {
          setIsMarkingMachine(prev => ({ ...prev, [result.machine_id]: false }));
          if (result.success) {
            console.log('Machine marked successfully via WebSocket:', result);
            loadMachines(); 
          } else {
            console.error('Failed to mark machine:', result.error);
          }
        }
        break;
      
      case 'unmark_machine':
        if (result && result.machine_id) {
          setIsUnmarkingMachine(prev => ({ ...prev, [result.machine_id]: false }));
          if (result.success) {
            console.log('Machine unmarked successfully via WebSocket:', result);
            loadMachines(); 
          } else {
            console.error('Failed to unmark machine:', result.error);
          }
        }
        break;
      
      default:
        console.log('Unhandled WebSocket response in MachineManagement:', response);
    }
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
      console.log('Sending add_machine_info command with:', machineForm);
      
      const response = await sendCommandAsync('add_machine_info', machineForm);
      
      console.log('Add machine response:', response);
      
      let result = response;
      if (response && response.result) {
        result = response.result;
      }
      
      if (result && result.success) {
        alert('Machine added successfully!');
        resetForm(); 
        loadMachines(); 
      } else {
        const errorMessage = 
          result?.error || 
          result?.message || 
          response?.error || 
          'Unknown error occurred';
        alert(`Error: ${errorMessage}`);
      }
    } catch (error) {
      console.error('Error adding machine:', error);
      alert('Failed to add machine. Please check connection.');
    } finally {
      setIsAddingMachine(false);
    }
  };

  const handleMarkMachine = async (machineId) => {
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
      
      const response = await sendCommandAsync('mark_machine', {
        machine_id: machineId,
        marks: marks
      });
      
      console.log('Mark machine response:', response);
      
      let result = response;
      if (response && response.result) {
        result = response.result;
      }
      
      if (result && result.success) {
        alert('Machine marked successfully!');
        setMarkingOptions(prev => ({ ...prev, [machineId]: {} }));
      } else {
        const errorMessage = 
          result?.error || 
          result?.message || 
          response?.error || 
          'Unknown error occurred';
        alert(`Error: ${errorMessage}`);
      }
    } catch (error) {
      console.error('Error marking machine:', error);
      alert('Failed to mark machine. Please check connection.');
    } finally {
      setIsMarkingMachine(prev => ({ ...prev, [machineId]: false }));
    }
  };

  const handleUnmarkMachine = async (machineId) => {
    try {
      setIsUnmarkingMachine(prev => ({ ...prev, [machineId]: true }));
      
      const response = await sendCommandAsync('unmark_machine', { machine_id: machineId });
      
      console.log('Unmark machine response:', response);
      
      let result = response;
      if (response && response.result) {
        result = response.result;
      }
      
      if (result && result.success) {
        alert('Machine unmarked successfully!');
      } else {
        const errorMessage = 
          result?.error || 
          result?.message || 
          response?.error || 
          'Unknown error occurred';
        alert(`Error: ${errorMessage}`);
      }
    } catch (error) {
      console.error('Error unmarking machine:', error);
      alert('Failed to unmark machine. Please check connection.');
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
    return machine && Array.isArray(machine.marked_as) && machine.marked_as.length > 0;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString();
    } catch {
      return 'Invalid Date';
    }
  };

  const checkBackendCapabilities = () => {
    if (!isConnected) {
      return 'Backend not connected';
    }
    
    const hasMachineCommands = installations.dhcp.status !== 'not_installed' || 
                               installations.dns.status !== 'not_installed';
    
    return hasMachineCommands ? 'Backend ready' : 'Backend may not have machine handlers';
  };

  const isMachineProcessing = (machineId) => {
    return isMarkingMachine[machineId] || isUnmarkingMachine[machineId];
  };

  return (
    <div className="machine-management">
      <h1>Machine Management</h1>

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
              disabled={isAddingMachine || !isConnected}
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
              disabled={isAddingMachine || !isConnected}
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
              disabled={isAddingMachine || !isConnected}
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
              disabled={isAddingMachine || !isConnected}
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
              disabled={isAddingMachine || !isConnected}
            />
          </div>

          <button 
            type="submit" 
            className="add-button" 
            disabled={!isConnected || isAddingMachine}
          >
            {isAddingMachine ? 'Adding...' : 'Add Machine'}
          </button>
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
          <button onClick={loadMachines} className="refresh-button-small" disabled={!isConnected || isLoadingMachines}>
            {isLoadingMachines ? 'Loading...' : '↻ Refresh'}
          </button>
        </div>
        
        {isLoadingMachines && machines.length === 0 ? (
          <div className="loading-machines">
            <p>Loading machines from backend...</p>
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
              
              return (
                <div key={machine.id} className="machine-card">
                  <div className="machine-header">
                    <h3>{machine.name}</h3>
                    <span className={`status ${isMarked ? 'marked' : 'available'}`}>
                      {isMarked ? 'Marked' : 'Available'}
                    </span>
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
                          {machine.marked_as.map((mark, index) => (
                            <li key={index}>
                              {mark.role?.toUpperCase() || 'Unknown'} ({mark.type || 'unknown'})
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <div className="marking-section">
                    <h4>Mark As:</h4>
                    
                    <div className="marking-options">
                      <div className="marking-option">
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={!!markingOptions[machine.id]?.dhcp}
                            onChange={(e) => handleMarkingChange(machine.id, 'dhcp', e.target.checked)}
                            disabled={isMarked && machine.marked_as.some(m => m.role === 'dhcp') || isProcessing || !isConnected}
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
                                disabled={!isRoleAvailable('dhcp', 'primary') || isProcessing || !isConnected}
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
                                disabled={!isRoleAvailable('dhcp', 'secondary') || isProcessing || !isConnected}
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
                            disabled={isMarked && machine.marked_as.some(m => m.role === 'dns') || isProcessing || !isConnected}
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
                                disabled={!isRoleAvailable('dns', 'primary') || isProcessing || !isConnected}
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
                                disabled={!isRoleAvailable('dns', 'secondary') || isProcessing || !isConnected}
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
                            disabled={isMarked && machine.marked_as.some(m => m.role === 'ad') || isProcessing || !isConnected}
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
                          disabled={isProcessing || !isConnected}
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
                            !isConnected
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
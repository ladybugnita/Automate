import React, { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '../../context/WebSocketContext';
import './DHCP.css';

const AddressLeasesTable = ({ leases }) => {
  if (!leases || Object.keys(leases).length === 0) {
    return (
      <div className="empty-data">
        <i className="fas fa-network-wired"></i>
        <h4>No Active Leases Found</h4>
        <p>No address leases data available.</p>
      </div>
    );
  }

  return (
    <div className="leases-table-container">
      <table className="data-table">
        <thead>
          <tr>
            <th>IP Address</th>
            <th>Device Name</th>
            <th>MAC Address</th>
            <th>Lease Type</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(leases).map(([leaseId, leaseData]) => (
            <tr key={leaseId} className={leaseData.status === 'Active' ? 'lease-active' : 'lease-inactive'}>
              <td className="ip-address">
                <code>{leaseData.ip || 'N/A'}</code>
              </td>
              <td className="device-name">
                {leaseData.name || 'Unknown Device'}
              </td>
              <td className="mac-address">
                <code>{leaseData.mac || leaseData.macAddress || 'N/A'}</code>
              </td>
              <td>
                <span className={`lease-type ${leaseData.leaseType?.toLowerCase() || 'dhcp'}`}>
                  {leaseData.leaseType || 'DHCP'}
                </span>
              </td>
              <td>
                <span className={`status-badge ${leaseData.status === 'Active' ? 'active' : 'inactive'}`}>
                  {leaseData.status || 'Unknown'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="table-footer">
        <div className="summary-info">
          Showing {Object.keys(leases).length} active leases
        </div>
      </div>
    </div>
  );
};

const ScopeOptionsTable = ({ options }) => {
  if (!options || Object.keys(options).length === 0) {
    return (
      <div className="empty-data">
        <i className="fas fa-cogs"></i>
        <h4>No Scope Options Configured</h4>
        <p>No scope options data available.</p>
      </div>
    );
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Option ID</th>
          <th>Name</th>
          <th>Value</th>
        </tr>
      </thead>
      <tbody>
        {Object.entries(options).map(([optionId, optionData]) => (
          <tr key={optionId}>
            <td>{optionId}</td>
            <td>
              <div className="option-name">{optionData.name || `Option ${optionId}`}</div>
            </td>
            <td className="option-value">{optionData.value || 'N/A'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const DHCP = () => {
  const { sendCommand, isConnected, addListener } = useWebSocket();
  const [dhcpInstalled, setDhcpInstalled] = useState(null);
  const [scopes, setScopes] = useState({});
  const [selectedScope, setSelectedScope] = useState(null);
  const [scopeDetails, setScopeDetails] = useState(null);
  const [activeTab, setActiveTab] = useState('address-pool');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    subnet_mask: '255.255.255.0',
    start_range: '',
    end_range: ''
  });

  const initialCommandsSent = useRef(false);
  const refreshIntervalRef = useRef(null);
  const lastRefreshTimeRef = useRef(null);
  
  const windowsInfo = {
    ip: '192.168.2.15',
    username: 'Administrator',
    password: 'abc123$'
  };

  const startAutoRefresh = () => {
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
    }

    refreshIntervalRef.current = setInterval(() => {
      if (dhcpInstalled && isConnected) {
        console.log('Auto-refreshing DHCP data...');
        lastRefreshTimeRef.current = new Date();
        loadScopes();
      }
    }, 30000);

    lastRefreshTimeRef.current = new Date();
  };

  const stopAutoRefresh = () => {
    if (refreshIntervalRef.current) {
      clearInterval(refreshIntervalRef.current);
      refreshIntervalRef.current = null;
    }
  };

  const formatTimeSinceLastRefresh = () => {
    if (!lastRefreshTimeRef.current) return 'Never';
    
    const now = new Date();
    const diffInSeconds = Math.floor((now - lastRefreshTimeRef.current) / 1000);
    
    if (diffInSeconds < 60) {
      return `${diffInSeconds} seconds ago`;
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    } else {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    }
  };

  useEffect(() => {
    console.log('DHCP Component Mounted - Setting up WebSocket listener');
    
    const handleWebSocketMessage = (message) => {
      console.log('DHCP received message:', message);
      
      let command, result, error;
      
      if (message.type === 'COMMAND_RESPONSE') {
        command = message.command;
        result = message.result || message.data;
      } else if (message.action === 'response') {
        command = message.command;
        result = message.result;
        error = message.error;
      }
      
      if (!command) return;
      
      console.log(`Processing response for command: ${command}`, { result, error });
      
      if (error) {
        console.log(`Error from backend for command ${command}:`, error);
        return;
      }
      
      let responseData = result;
      if (typeof result === 'string') {
        try {
          responseData = JSON.parse(result);
        } catch (e) {
          console.log('Result is not JSON, using as string:', result);
          responseData = result;
        }
      }
      
      switch(command) {
        case 'check_dhcp_role_installed_windows_ansible':
          console.log('Received response for DHCP check:', responseData);
          
          let isInstalled = false;
          
          if (typeof responseData === 'object' && responseData !== null) {
            if (responseData.installed !== undefined) {
              isInstalled = responseData.installed === true || 
                           responseData.installed === "true" ||
                           responseData.installed === "installed";
            }
          } else if (typeof responseData === 'string') {
            isInstalled = responseData.includes('true') || 
                         responseData.includes('installed') ||
                         !responseData.includes('false') && 
                         !responseData.includes('not installed');
          }
          
          console.log(`DHCP installed status: ${isInstalled}`);
          setDhcpInstalled(isInstalled);
          setLoading(false);
          
          if (isInstalled) {
            loadScopes();
            startAutoRefresh();
          } else {
            setShowInstallModal(true);
          }
          break;
          
        case 'get_dhcp_scope_details_windows_ansible':
          console.log('Received DHCP scope details:', responseData);
          
          if (responseData && responseData.dhcp_details) {
            const dhcpDetails = responseData.dhcp_details;
            
            const scopesMap = {};
            Object.entries(dhcpDetails).forEach(([scopeId, scopeData]) => {
              scopesMap[scopeId] = {
                name: scopeData.name || scopeId,
                subnet: scopeData.subnet_mask || '255.255.255.0',
                description: scopeData.description || ''
              };
            });
            
            setScopes(scopesMap);
            
            if (selectedScope && dhcpDetails[selectedScope]) {
              const scopeData = dhcpDetails[selectedScope];
              setScopeDetails({
                scopename: scopeData.name || selectedScope,
                description: scopeData.description || '',
                subnetmask: scopeData.subnet_mask || '255.255.255.0',
                addresspool: scopeData.address_pool || {},
                addressleases: scopeData.address_leases || {},
                scopeoptions: scopeData.scope_options || {}
              });
            }
          }
          setLoading(false);
          break;
          
        case 'install_dhcp_role_windows_ansible':
          console.log('DHCP installation response:', responseData);
          
          let installationSuccess = false;
          
          if (typeof responseData === 'string') {
            installationSuccess = responseData.includes('installation done') || 
                                 responseData.includes('success') ||
                                 responseData.includes('dhcp role installation done');
          } else if (typeof responseData === 'object') {
            installationSuccess = responseData.status === 'success' || 
                                 responseData.message === 'dhcp role installation done';
          }
          
          if (installationSuccess) {
            console.log('DHCP installation successful');
            alert('DHCP server installed successfully!');
            setShowInstallModal(false);
            setDhcpInstalled(true);
            startAutoRefresh();
            loadScopes();
          } else {
            alert('DHCP installation failed. Please try again.');
          }
          setLoading(false);
          break;
          
        case 'configure_dhcp_scope_windows_ansible':
          console.log('DHCP scope configuration response:', responseData);
          
          let scopeCreationSuccess = false;
          
          if (typeof responseData === 'string') {
            scopeCreationSuccess = responseData.includes('scope configured') || 
                                  responseData.includes('success') ||
                                  responseData.includes('dhcp scope configured');
          } else if (typeof responseData === 'object') {
            scopeCreationSuccess = responseData.status === 'success' || 
                                  responseData.message === 'dhcp scope configured';
          }
          
          if (scopeCreationSuccess) {
            alert('Scope created successfully!');
            setShowCreateModal(false);
            resetForm();
            loadScopes();
          } else {
            alert(`Error creating scope: ${responseData?.error || 'Unknown error'}`);
          }
          setLoading(false);
          break;
          
        default:
          console.log(`Unhandled command: ${command}`);
      }
    };

    const removeListener = addListener(handleWebSocketMessage);
    
    const timer = setTimeout(() => {
      if (!initialCommandsSent.current && isConnected) {
        console.log('SENDING INITIAL DHCP CHECK COMMAND');
        console.log('Command: check_dhcp_role_installed_windows_ansible');
        
        setLoading(true);
        
        sendCommand('check_dhcp_role_installed_windows_ansible', { 
          windows_info: windowsInfo 
        });
        
        initialCommandsSent.current = true;
      } else if (!isConnected) {
        console.log('WebSocket not connected');
        setDhcpInstalled(false);
        setLoading(false);
        setShowInstallModal(true);
      }
    }, 1000);
    
    return () => {
      clearTimeout(timer);
      stopAutoRefresh();
      if (removeListener) removeListener();
    };
  }, [addListener, sendCommand, isConnected, selectedScope]);

  const handleTabChange = (tab) => {
    console.log(`Tab changed to: ${tab}`);
    setActiveTab(tab);
  };

  useEffect(() => {
    if (selectedScope && dhcpInstalled) {
      console.log(`Scope changed to: ${selectedScope}, fetching details...`);
      
      setLoading(true);
      sendCommand('get_dhcp_scope_details_windows_ansible', {
        windows_info: windowsInfo
      });
    }
  }, [selectedScope, dhcpInstalled]);

  const loadScopes = () => {
    if (!dhcpInstalled) return;
    
    console.log('Loading DHCP scopes...');
    setLoading(true);
    lastRefreshTimeRef.current = new Date();
    
    sendCommand('get_dhcp_scope_details_windows_ansible', {
      windows_info: windowsInfo
    });
  };

  const selectScope = (scopeId) => {
    console.log(`Selecting scope: ${scopeId}`);
    setSelectedScope(scopeId);
    setActiveTab('address-pool');
  };

  const createScope = () => {
    if (currentStep < 2) {
      setCurrentStep(2);
      return;
    }
    
    if (!formData.start_range || !formData.end_range) {
      alert('Please enter start and end IP addresses');
      return;
    }
    
    if (!formData.name) {
      alert('Please enter a scope name');
      return;
    }
    
    console.log('Creating DHCP scope...');
    setLoading(true);
    
    const payload = {
      scope_name: formData.name,
      start_range: formData.start_range,
      end_range: formData.end_range,
      subnet_mask: formData.subnet_mask,
      description: formData.description || '',
      windows_info: windowsInfo
    };
    
    sendCommand('configure_dhcp_scope_windows_ansible', payload);
  };

  const installDHCP = () => {
    console.log('Installing DHCP server...');
    setLoading(true);
    
    sendCommand('install_dhcp_role_windows_ansible', {
      windows_info: windowsInfo
    });
  };

  const deleteScope = () => {
    if (!selectedScope) {
      alert('No scope selected');
      return;
    }
    
    if (window.confirm(`Are you sure you want to delete scope "${selectedScope}"?`)) {
      console.log(`Delete scope functionality needs to be implemented with backend`);
      alert('Delete functionality requires backend implementation');
    }
  };

  const calculateAddressCount = (startIP, endIP) => {
    if (!startIP || !endIP) return 0;
    const start = startIP.split('.').map(Number);
    const end = endIP.split('.').map(Number);
    let count = 0;
    for (let i = 0; i < 4; i++) {
      count += (end[i] - start[i]) * Math.pow(256, 3 - i);
    }
    return Math.abs(count) + 1;
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      subnet_mask: '255.255.255.0',
      start_range: '',
      end_range: ''
    });
    setCurrentStep(1);
  };

  const handleFormChange = (e) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  const getTotalAddresses = () => {
    if (!formData.start_range || !formData.end_range) return 0;
    return calculateAddressCount(formData.start_range, formData.end_range);
  };

  if (loading && dhcpInstalled === null) {
    return (
      <div className="dhcp-loading">
        <div className="spinner"></div>
        <p>Checking DHCP status...</p>
        <div style={{ marginTop: '20px', fontSize: '12px', color: '#666' }}>
          <div>WebSocket: {isConnected ? 'Connected' : 'Disconnected'}</div>
          <div>Command: check_dhcp_role_installed_windows_ansible</div>
        </div>
      </div>
    );
  }

  if (!dhcpInstalled) {
    return (
      <div className="dhcp-install-modal-overlay">
        <div className="dhcp-install-modal">
          <div className="modal-header">
            <h2>DHCP Server Required</h2>
            <div style={{
              fontSize: '11px',
              color: '#28a745',
              background: '#e6f7e6',
              padding: '4px 8px',
              borderRadius: '4px',
              marginLeft: '10px'
            }}>
              Waiting for DHCP status...
            </div>
          </div>
          <div className="modal-content">
            <div className="warning-icon">
              <i className="fas fa-exclamation-triangle"></i>
            </div>
            <h3>DHCP Server Not Installed</h3>
            <p>The DHCP server role is not installed on this system. You need to install it to manage DHCP scopes.</p>
            
            <div className="warning-note">
              <i className="fas fa-info-circle"></i>
              <div>
                <p className="note-title">Note:</p>
                <p>Installing the DHCP server may require a system restart. Ensure you save all work before proceeding.</p>
              </div>
            </div>
            
            <div className="connection-status">
              <div className={`status-indicator ${isConnected ? 'connected' : 'disconnected'}`}>
                <div className="status-dot"></div>
                <span>WebSocket: {isConnected ? 'Connected' : 'Disconnected'}</span>
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn-secondary" onClick={() => window.history.back()}>
              <i className="fas fa-arrow-left"></i> Go Back
            </button>
            <button 
              className="btn-primary" 
              onClick={installDHCP}
              disabled={!isConnected || loading}
            >
              {loading ? (
                <>
                  <div className="mini-spinner"></div> Installing...
                </>
              ) : (
                <>
                  <i className="fas fa-download"></i> Install DHCP Server
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dhcp-container">
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="create-scope-modal">
            <div className="modal-header">
              <h2>Create New DHCP Scope</h2>
              <button className="close-btn" onClick={() => { setShowCreateModal(false); resetForm(); }}>
                <i className="fas fa-times"></i>
              </button>
            </div>
            
            <div className="step-indicator-container">
              <div className="step-indicators">
                <div className={`step-indicator ${currentStep >= 1 ? 'active' : ''}`}>1</div>
                <div className="step-line"></div>
                <div className={`step-indicator ${currentStep >= 2 ? 'active' : ''}`}>2</div>
              </div>
              <div className="step-labels">
                <span className={currentStep === 1 ? 'active' : ''}>Basic Information</span>
                <span className={currentStep === 2 ? 'active' : ''}>Address Range</span>
              </div>
            </div>
            
            <div className="modal-content">
              {currentStep === 1 ? (
                <div className="step-content">
                  <div className="form-group">
                    <label htmlFor="name">
                      Scope Name <span className="required">*</span>
                    </label>
                    <input
                      type="text"
                      id="name"
                      value={formData.name}
                      onChange={handleFormChange}
                      placeholder="e.g., Corporate Network"
                      required
                    />
                    <p className="help-text">A descriptive name for the scope</p>
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="description">Description</label>
                    <textarea
                      id="description"
                      value={formData.description}
                      onChange={handleFormChange}
                      rows="3"
                      placeholder="Describe the purpose of this scope..."
                    />
                  </div>
                  
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="subnet_mask">
                        Subnet Mask <span className="required">*</span>
                      </label>
                      <input
                        type="text"
                        id="subnet_mask"
                        value={formData.subnet_mask}
                        onChange={handleFormChange}
                        placeholder="255.255.255.0"
                        required
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="step-content">
                  <div className="form-group">
                    <label htmlFor="start_range">
                      Start IP Address <span className="required">*</span>
                    </label>
                    <input
                      type="text"
                      id="start_range"
                      value={formData.start_range}
                      onChange={handleFormChange}
                      placeholder="192.168.1.100"
                      required
                    />
                    <p className="help-text">The first IP address in the pool</p>
                  </div>
                  
                  <div className="form-group">
                    <label htmlFor="end_range">
                      End IP Address <span className="required">*</span>
                    </label>
                    <input
                      type="text"
                      id="end_range"
                      value={formData.end_range}
                      onChange={handleFormChange}
                      placeholder="192.168.1.200"
                      required
                    />
                    <p className="help-text">The last IP address in the pool</p>
                  </div>
                  
                  <div className="range-summary">
                    <h4>Address Range Summary</h4>
                    <div className="summary-grid">
                      <div>
                        <div className="summary-label">Total Addresses</div>
                        <div className="summary-value">{getTotalAddresses()}</div>
                      </div>
                    </div>
                    <div style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
                      Note: Scope creation may take a few moments
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="modal-footer">
              <div>
                {currentStep > 1 && (
                  <button className="btn-secondary" onClick={() => setCurrentStep(1)}>
                    <i className="fas fa-arrow-left"></i> Back
                  </button>
                )}
              </div>
              <div className="footer-right">
                <button className="btn-secondary" onClick={() => { setShowCreateModal(false); resetForm(); }}>
                  Cancel
                </button>
                {currentStep < 2 ? (
                  <button className="btn-primary" onClick={() => setCurrentStep(2)}>
                    Next <i className="fas fa-arrow-right"></i>
                  </button>
                ) : (
                  <button 
                    className="btn-success" 
                    onClick={createScope}
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <div className="mini-spinner"></div> Creating...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-check"></i> Create Scope
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      
      <div className="dhcp-layout">
        <div className="dhcp-sidebar">
          <div className="sidebar-header">
            <div className="dhcp-icon">
              <i className="fas fa-dhcp"></i>
            </div>
            <div>
              <h2>DHCP Server</h2>
              <p>Dynamic Host Configuration</p>
              <div style={{ fontSize: '11px', color: '#666', marginTop: '5px' }}>
                <i className="fas fa-sync-alt"></i> Auto-refresh: 30s
              </div>
            </div>
          </div>
          
          <div className="sidebar-section">
            <div className="section-header">
              <div className="section-title">
                <div className="ipv4-dot"></div>
                <h3>IPv4</h3>
              </div>
              <div className="status-badge active">Active</div>
            </div>
            
            <div className="scopes-list">
              {Object.keys(scopes).length === 0 ? (
                <div className="no-scopes-message">
                  <i className="fas fa-inbox"></i>
                  <p>No scopes configured</p>
                </div>
              ) : (
                Object.entries(scopes).map(([scopeId, scopeData]) => (
                  <div
                    key={scopeId}
                    className={`scope-item ${selectedScope === scopeId ? 'active' : ''}`}
                    onClick={() => selectScope(scopeId)}
                  >
                    <div className="scope-info">
                      <div className="scope-name">{scopeData.name || scopeId}</div>
                      <div className="scope-subnet">{scopeData.subnet || '255.255.255.0'}</div>
                    </div>
                    <div className="status-dot active"></div>
                  </div>
                ))
              )}
            </div>
            
            <button 
              className="add-scope-btn"
              onClick={() => setShowCreateModal(true)}
            >
              <i className="fas fa-plus-circle"></i>
              Add Scope
            </button>
          </div>
          
          <div className="sidebar-section">
            <div className="section-header">
              <div className="section-title">
                <div className="ipv6-dot"></div>
                <h3>IPv6</h3>
              </div>
              <div className="status-badge inactive">Inactive</div>
            </div>
            <p className="section-description">No IPv6 scopes configured</p>
          </div>
          
          <div className="sidebar-section">
            <h3>Statistics</h3>
            <div className="statistics">
              <div className="stat-item">
                <span className="stat-label">Total Scopes</span>
                <span className="stat-value">{Object.keys(scopes).length}</span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Active Leases</span>
                <span className="stat-value">
                  {scopeDetails?.addressleases ? Object.keys(scopeDetails.addressleases).length : 0}
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Available IPs</span>
                <span className="stat-value">
                  {scopeDetails?.addresspool?.start_range && scopeDetails?.addresspool?.end_range
                    ? calculateAddressCount(scopeDetails.addresspool.start_range, scopeDetails.addresspool.end_range)
                    : 0
                  }
                </span>
              </div>
              <div className="stat-item">
                <span className="stat-label">Last Updated</span>
                <span className="stat-value" style={{ fontSize: '12px' }}>
                  {formatTimeSinceLastRefresh()}
                </span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="dhcp-main">
          <div className="top-bar">
            <div>
              <h1>DHCP Management</h1>
              <p className="scope-path">
                {selectedScope 
                  ? `IPv4 > ${scopes[selectedScope]?.name || selectedScope}` 
                  : 'Select a scope to view details'
                }
              </p>
              <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                <span>Server: {windowsInfo.ip}</span>
                <span style={{ marginLeft: '15px' }}>
                  <i className="fas fa-sync-alt" style={{ marginRight: '5px' }}></i>
                  Auto-refresh every 30 seconds
                </span>
                <span style={{ marginLeft: '15px', color: '#28a745' }}>
                  Last refresh: {formatTimeSinceLastRefresh()}
                </span>
              </div>
            </div>
            <div className="top-bar-actions">
              <button 
                className="btn-secondary"
                onClick={loadScopes}
                disabled={loading}
              >
                <i className="fas fa-sync-alt"></i>
                Refresh Now
              </button>
              <button 
                className="btn-primary"
                onClick={() => setShowCreateModal(true)}
              >
                <i className="fas fa-plus"></i>
                Add Scope
              </button>
            </div>
          </div>
          
          <div className="main-content">
            {Object.keys(scopes).length === 0 ? (
              <div className="empty-state no-scopes">
                <div className="empty-icon">
                  <i className="fas fa-database"></i>
                </div>
                <h2>No DHCP Scopes Found</h2>
                <p>You haven't created any DHCP scopes yet. Create your first scope to start managing IP addresses.</p>
                <button 
                  className="btn-primary"
                  onClick={() => setShowCreateModal(true)}
                >
                  <i className="fas fa-plus"></i>
                  Create First Scope
                </button>
              </div>
            ) : !selectedScope ? (
              <div className="empty-state">
                <div className="empty-icon">
                  <i className="fas fa-dhcp"></i>
                </div>
                <h2>No Scope Selected</h2>
                <p>Select a DHCP scope from the sidebar to view its details, or create a new scope to get started.</p>
                <button 
                  className="btn-primary"
                  onClick={() => setShowCreateModal(true)}
                >
                  <i className="fas fa-plus"></i>
                  Create New Scope
                </button>
              </div>
            ) : (
              <div className="scope-details">
                <div className="scope-header">
                  <div>
                    <div className="scope-title">
                      <h2>{scopeDetails?.scopename || selectedScope}</h2>
                      <span className="status-badge active">Active</span>
                    </div>
                    <p className="scope-description">{scopeDetails?.description || 'No description provided'}</p>
                    <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                      <i className="fas fa-clock"></i> Data auto-updates every 30 seconds
                    </div>
                  </div>
                  <div className="scope-actions">
                    <button className="btn-secondary">
                      <i className="fas fa-edit"></i>
                      Edit
                    </button>
                    <button 
                      className="btn-danger" 
                      onClick={deleteScope}
                    >
                      <i className="fas fa-trash"></i>
                      Delete
                    </button>
                  </div>
                </div>
                
                <div className="info-grid">
                  <div className="info-card">
                    <div className="info-label">Scope ID</div>
                    <div className="info-value">{selectedScope}</div>
                  </div>
                  <div className="info-card">
                    <div className="info-label">Subnet Mask</div>
                    <div className="info-value">{scopeDetails?.subnetmask || '255.255.255.0'}</div>
                  </div>
                  <div className="info-card">
                    <div className="info-label">Address Pool</div>
                    <div className="info-value">
                      {scopeDetails?.addresspool?.start_range && scopeDetails?.addresspool?.end_range
                        ? `${scopeDetails.addresspool.start_range} - ${scopeDetails.addresspool.end_range}`
                        : 'N/A'
                      }
                    </div>
                  </div>
                </div>
                
                <div className="tabs">
                  <button 
                    className={`tab-btn ${activeTab === 'address-pool' ? 'active' : ''}`}
                    onClick={() => handleTabChange('address-pool')}
                  >
                    Address Pool
                  </button>
                  <button 
                    className={`tab-btn ${activeTab === 'address-leases' ? 'active' : ''}`}
                    onClick={() => handleTabChange('address-leases')}
                  >
                    Address Leases 
                  </button>
                  <button 
                    className={`tab-btn ${activeTab === 'scope-options' ? 'active' : ''}`}
                    onClick={() => handleTabChange('scope-options')}
                  >
                    Scope Options
                  </button>
                </div>
                
                <div className="tab-content">
                  {activeTab === 'address-pool' && scopeDetails?.addresspool && (
                    <div className="tab-pane active">
                      <div className="content-card">
                        <div className="card-header">
                          <div className="card-header-content">
                            <h3>Address Pool Configuration</h3>
                            <div style={{
                              background: '#6c757d',
                              color: 'white',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 'bold',
                              marginLeft: '10px'
                            }}>
                              LIVE DATA
                            </div>
                          </div>
                          <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                            Auto-refreshed from get_dhcp_scope_details_windows_ansible
                          </div>
                        </div>
                        <div className="card-body">
                          <div className="address-range">
                            <div className="range-input">
                              <h4>Start Address</h4>
                              <div className="ip-display">
                                {scopeDetails.addresspool.start_range || 'N/A'}
                              </div>
                            </div>
                            <div className="range-input">
                              <h4>End Address</h4>
                              <div className="ip-display">
                                {scopeDetails.addresspool.end_range || 'N/A'}
                              </div>
                            </div>
                          </div>
                          <div className="range-info">
                            <div className="range-stat">
                              <span className="stat-label">Total Addresses</span>
                              <span className="stat-value">
                                {scopeDetails.addresspool.start_range && scopeDetails.addresspool.end_range
                                  ? calculateAddressCount(
                                      scopeDetails.addresspool.start_range, 
                                      scopeDetails.addresspool.end_range
                                    )
                                  : 0
                                }
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {activeTab === 'address-leases' && (
                    <div className="tab-pane active">
                      <div className="content-card">
                        <div className="card-header">
                          <div className="card-header-content">
                            <h3>Active Leases</h3>
                            <div style={{
                              background: '#28a745',
                              color: 'white',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 'bold',
                              marginLeft: '10px'
                            }}>
                              LIVE DATA
                            </div>
                          </div>
                          <div style={{
                            fontSize: '12px',
                            color: '#666',
                            marginTop: '5px'
                          }}>
                            Auto-refreshed from get_dhcp_scope_details_windows_ansible • Last update: {formatTimeSinceLastRefresh()}
                          </div>
                        </div>
                        <div className="card-body">
                          {loading ? (
                            <div className="loading-state">
                              <div className="spinner"></div>
                              <p>Loading address leases...</p>
                            </div>
                          ) : (
                            <AddressLeasesTable leases={scopeDetails?.addressleases} />
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {activeTab === 'scope-options' && (
                    <div className="tab-pane active">
                      <div className="content-card">
                        <div className="card-header">
                          <div className="card-header-content">
                            <h3>Scope Options</h3>
                            <div style={{
                              background: '#28a745',
                              color: 'white',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 'bold',
                              marginLeft: '10px'
                            }}>
                              LIVE DATA
                            </div>
                          </div>
                          <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
                            Auto-refreshed from get_dhcp_scope_details_windows_ansible
                          </div>
                        </div>
                        <div className="card-body">
                          {loading ? (
                            <div className="loading-state">
                              <div className="spinner"></div>
                              <p>Loading scope options...</p>
                            </div>
                          ) : (
                            <ScopeOptionsTable options={scopeDetails?.scopeoptions} />
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DHCP;
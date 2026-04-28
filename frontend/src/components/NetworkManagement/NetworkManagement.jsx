import React, { useState, useEffect } from 'react';
import './NetworkManagement.css';
import axios from 'axios';

const API_BASE_URL = "http://192.168.1.8:5000/api";

const NetworkManagement = () => {
  const [deviceForm, setDeviceForm] = useState({
    name: '',
    ip: '',
    device_type: 'router',
    username: '',
    password: '',
    vendor: ''
  });

  const [devices, setDevices] = useState([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);
  const [isAddingDevice, setIsAddingDevice] = useState(false);
  const [isDeletingDevice, setIsDeletingDevice] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [apiStatus, setApiStatus] = useState('idle'); 

  useEffect(() => {
    console.log('=== API DEBUG ===');
    console.log('API_BASE_URL:', API_BASE_URL);
    console.log('Full devices URL:', `${API_BASE_URL}/network-devices/get-network-devices`);
    console.log('Token:', localStorage.getItem('token') ? 'Exists' : 'Missing');
    console.log('==================');
  }, []);

  const deviceTypes = [
    { value: 'router', label: 'Router' },
    { value: 'switch', label: 'Switch' },
    { value: 'firewall', label: 'Firewall' },
    { value: 'access_point', label: 'Access Point' },
    { value: 'load_balancer', label: 'Load Balancer' },
    { value: 'server', label: 'Server' },
    { value: 'other', label: 'Other' }
  ];

  const vendors = [
    { value: 'cisco', label: 'Cisco' },
    { value: 'juniper', label: 'Juniper' },
    { value: 'palo_alto', label: 'Palo Alto' },
    { value: 'fortinet', label: 'Fortinet' },
    { value: 'aruba', label: 'Aruba' },
    { value: 'hp', label: 'HP' },
    { value: 'dell', label: 'Dell' },
    { value: 'mikrotik', label: 'MikroTik' },
    { value: 'ubiquiti', label: 'Ubiquiti' },
    { value: 'other', label: 'Other' }
  ];

  const getAuthHeaders = () => {
    const token = localStorage.getItem('token') || '';
    console.log('Getting auth headers with token:', token ? 'Present' : 'Missing');
    if (!token) {
      throw new Error('No authentication token available');
    }
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
      console.log('Initializing with token:', token ? 'Present' : 'Missing');
      
      if (token) {
        try {
          await loadDevices();
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

  const loadDevices = async () => {
    setIsLoadingDevices(true);
    try {
      console.log('Loading network devices from Node.js REST API...');
      
      const fullUrl = `${API_BASE_URL}/network-devices/get-network-devices`;
      console.log('Calling URL:', fullUrl);
      
      const response = await axios.get(fullUrl, {
        headers: getAuthHeaders(),
        timeout: 10000
      });
      
      console.log('Network devices load response:', response.data);
      
      if (response.data.success && response.data.devices) {
        setDevices(response.data.devices);
        setApiStatus('success');
        console.log(`Loaded ${response.data.devices.length} devices`);
      } else {
        console.error('Failed to load network devices:', response.data.error);
        setDevices([]);
        setApiStatus('error');
      }
    } catch (error) {
      console.error('Error loading network devices via REST API:', error);
      console.error('Error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status,
        url: error.config?.url
      });
      
      setDevices([]);
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
        alert('Failed to load network devices. Please check your connection.');
      }
    } finally {
      setIsLoadingDevices(false);
    }
  };

  const addDevice = async (deviceData) => {
    const fullUrl = `${API_BASE_URL}/network-devices/add-network-device`;
    console.log('Calling URL:', fullUrl);
    
    const response = await axios.post(
      fullUrl,
      deviceData,
      { 
        headers: getAuthHeaders(),
        timeout: 10000
      }
    );
    
    return response.data;
  };

  const deleteDevice = async (deviceId) => {
    const fullUrl = `${API_BASE_URL}/network-devices/delete-network-device/${deviceId}`;
    console.log('Calling URL:', fullUrl);
    
    const response = await axios.delete(
      fullUrl,
      { 
        headers: getAuthHeaders(),
        timeout: 10000
      }
    );
    
    return response.data;
  };

  const updateDevice = async (deviceId, updateData) => {
    const fullUrl = `${API_BASE_URL}/network-devices/update-network-device/${deviceId}`;
    console.log('Calling URL:', fullUrl);
    
    const response = await axios.put(
      fullUrl,
      updateData,
      { 
        headers: getAuthHeaders(),
        timeout: 10000
      }
    );
    
    return response.data;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setDeviceForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const resetForm = () => {
    setDeviceForm({
      name: '',
      ip: '',
      device_type: 'router',
      username: '',
      password: '',
      vendor: ''
    });
    setShowPassword(false);
  };

  const validateIP = (ip) => {
    const ipPattern = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipPattern.test(ip);
  };

  const handleAddDevice = async (e) => {
    e.preventDefault();
    
    if (apiStatus === 'error') {
      alert('Cannot add device. API connection failed. Please check backend server.');
      return;
    }
    
    const token = localStorage.getItem('token');
    if (!token) {
      alert('Please log in to add network devices.');
      return;
    }
    
    if (!deviceForm.name || !deviceForm.ip || !deviceForm.username || !deviceForm.password) {
      alert('Please fill in all required fields (Device Name, IP Address, Username, and Password)');
      return;
    }

    if (!validateIP(deviceForm.ip)) {
      alert('Please enter a valid IP address');
      return;
    }

    if (deviceForm.password.length < 4) {
      alert('Password must be at least 4 characters long');
      return;
    }

    try {
      setIsAddingDevice(true);
      console.log('Adding network device via Node.js REST API:', deviceForm);
      
      const result = await addDevice(deviceForm);
      
      console.log('Add network device result:', result);
      
      if (result.success) {
        alert('Network device added successfully!');
        resetForm();
        loadDevices(); 
      } else {
        const errorMessage = result.error || result.message || 'Unknown error occurred';
        alert(`Error: ${errorMessage}`);
      }
    } catch (error) {
      console.error('Error adding network device:', error);
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
        alert('Failed to add network device. Please check your connection.');
      }
    } finally {
      setIsAddingDevice(false);
    }
  };

  const handleDeleteDevice = async (deviceId) => {
    if (apiStatus === 'error') {
      alert('Cannot delete device. API connection failed.');
      return;
    }
    
    if (!window.confirm('Are you sure you want to delete this network device? This action cannot be undone.')) {
      return;
    }

    try {
      setIsDeletingDevice(prev => ({ ...prev, [deviceId]: true }));
      console.log('Deleting network device via Node.js REST API:', deviceId);
      
      const result = await deleteDevice(deviceId);
      
      console.log('Delete network device result:', result);
      
      if (result.success) {
        alert('Network device deleted successfully!');
        loadDevices(); 
      } else {
        const errorMessage = result.error || result.message || 'Unknown error occurred';
        alert(`Error: ${errorMessage}`);
      }
    } catch (error) {
      console.error('Error deleting network device:', error);
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
        alert('Failed to delete network device. Please check your connection.');
      }
    } finally {
      setIsDeletingDevice(prev => ({ ...prev, [deviceId]: false }));
    }
  };

  const getDeviceTypeLabel = (type) => {
    const foundType = deviceTypes.find(t => t.value === type);
    return foundType ? foundType.label : type;
  };

  const getVendorLabel = (vendor) => {
    if (!vendor) return 'N/A';
    const foundVendor = vendors.find(v => v.value === vendor);
    return foundVendor ? foundVendor.label : vendor;
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'Invalid Date';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return '#27ae60';
      case 'inactive': return '#e74c3c';
      case 'maintenance': return '#f39c12';
      default: return '#7f8c8d';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'active': return 'Active';
      case 'inactive': return 'Inactive';
      case 'maintenance': return 'Maintenance';
      default: return 'Unknown';
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const isApiAvailable = apiStatus === 'success';
  
  const isAuthenticated = !!localStorage.getItem('token');
  
  const isDeviceDeleting = (deviceId) => isDeletingDevice[deviceId] || false;

  return (
    <div className="network-management">
      <h1>Network Device Management</h1>
      
      <div className="backend-info">
        <small>Database operations handled by Node.js REST API at {API_BASE_URL}</small>
        {apiStatus === 'error' && (
          <div className="api-error-warning">
            <p>⚠️ Unable to connect to Node.js API. Please check if the server is running on {API_BASE_URL}</p>
            <div className="retry-actions">
              <button onClick={loadDevices} className="retry-button-small">
                Retry Connection
              </button>
              <button onClick={() => {
                console.log('Current API_BASE_URL:', API_BASE_URL);
                console.log('Full devices URL:', `${API_BASE_URL}/network-devices/get-network-devices`);
                alert(`Debug info logged to console.\nAPI URL: ${API_BASE_URL}\nEndpoint: /network-devices/get-network-devices`);
              }} className="debug-button-small">
                Debug Info
              </button>
            </div>
          </div>
        )}
      </div>

      {!isAuthenticated && (
        <div className="auth-warning">
          <p>🔐 Please log in to manage network devices.</p>
        </div>
      )}

      <div className="add-device-section">
        <h2>Add New Network Device</h2>
        <form onSubmit={handleAddDevice} className="device-form">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="name">Device Name *</label>
              <input
                type="text"
                id="name"
                name="name"
                value={deviceForm.name}
                onChange={handleInputChange}
                placeholder="e.g., Core-Switch-01"
                required
                disabled={isAddingDevice || !isApiAvailable || !isAuthenticated}
              />
            </div>

            <div className="form-group">
              <label htmlFor="ip">IP Address *</label>
              <input
                type="text"
                id="ip"
                name="ip"
                value={deviceForm.ip}
                onChange={handleInputChange}
                placeholder="e.g., 192.168.1.1"
                required
                disabled={isAddingDevice || !isApiAvailable || !isAuthenticated}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="device_type">Device Type *</label>
              <select
                id="device_type"
                name="device_type"
                value={deviceForm.device_type}
                onChange={handleInputChange}
                disabled={isAddingDevice || !isApiAvailable || !isAuthenticated}
              >
                {deviceTypes.map(type => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="vendor">Vendor</label>
              <select
                id="vendor"
                name="vendor"
                value={deviceForm.vendor}
                onChange={handleInputChange}
                disabled={isAddingDevice || !isApiAvailable || !isAuthenticated}
              >
                <option value="">Select Vendor</option>
                {vendors.map(vendor => (
                  <option key={vendor.value} value={vendor.value}>
                    {vendor.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="username">Username *</label>
              <input
                type="text"
                id="username"
                name="username"
                value={deviceForm.username}
                onChange={handleInputChange}
                placeholder="e.g., admin"
                required
                disabled={isAddingDevice || !isApiAvailable || !isAuthenticated}
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password *</label>
              <div className="password-input-container">
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  name="password"
                  value={deviceForm.password}
                  onChange={handleInputChange}
                  placeholder="Enter device password"
                  required
                  disabled={isAddingDevice || !isApiAvailable || !isAuthenticated}
                />
                <button
                  type="button"
                  className="show-password-toggle"
                  onClick={togglePasswordVisibility}
                  disabled={isAddingDevice || !isApiAvailable || !isAuthenticated}
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "🙈" : "👁️"}
                </button>
              </div>
            </div>
          </div>

          <button 
            type="submit" 
            className="add-button" 
            disabled={isAddingDevice || !isApiAvailable || !isAuthenticated}
          >
            {isAddingDevice ? 'Adding...' : 'Add Network Device'}
          </button>
          
          {!isAuthenticated && (
            <p className="info-note">Please log in to add network devices</p>
          )}
        </form>
      </div>

      <div className="devices-summary">
        <h2>Network Summary</h2>
        <div className="summary-grid">
          <div className="summary-card">
            <h3>Total Devices</h3>
            <div className="summary-count">{devices.length}</div>
          </div>
          <div className="summary-card">
            <h3>Routers</h3>
            <div className="summary-count">
              {devices.filter(d => d.device_type === 'router').length}
            </div>
          </div>
          <div className="summary-card">
            <h3>Switches</h3>
            <div className="summary-count">
              {devices.filter(d => d.device_type === 'switch').length}
            </div>
          </div>
          <div className="summary-card">
            <h3>Cisco</h3>
            <div className="summary-count">
              {devices.filter(d => d.vendor === 'cisco').length}
            </div>
          </div>
        </div>
      </div>

      <div className="available-devices">
        <div className="section-header">
          <h2>Network Devices ({devices.length})</h2>
          <div className="header-actions">
            <button 
              onClick={loadDevices} 
              className="refresh-button-small" 
              disabled={!isApiAvailable || isLoadingDevices || !isAuthenticated}
              title="Refresh device list"
            >
              {isLoadingDevices ? 'Loading...' : '↻ Refresh'}
            </button>
            {apiStatus === 'error' && (
              <span className="api-status-badge error">API Error</span>
            )}
            {apiStatus === 'success' && (
              <span className="api-status-badge success">API Connected</span>
            )}
          </div>
        </div>
        
        {!isAuthenticated ? (
          <div className="auth-required">
            <p>Please log in to view network devices.</p>
          </div>
        ) : isLoadingDevices && devices.length === 0 ? (
          <div className="loading-devices">
            <p>Loading network devices from Node.js API...</p>
            <div className="loader"></div>
          </div>
        ) : devices.length === 0 ? (
          <div className="no-devices">
            <p>No network devices added yet. Add your first device above.</p>
          </div>
        ) : (
          <div className="devices-grid">
            {devices.map(device => (
              <div key={device.id} className="device-card">
                <div className="device-header">
                  <div className="device-title">
                    <h3>{device.name}</h3>
                    <span 
                      className="device-status"
                      style={{ backgroundColor: getStatusColor(device.status) }}
                    >
                      {getStatusLabel(device.status)}
                    </span>
                  </div>
                  <div className="device-header-right">
                    <span className="device-type">{getDeviceTypeLabel(device.device_type)}</span>
                    {device.vendor && (
                      <span className="device-vendor">{getVendorLabel(device.vendor)}</span>
                    )}
                  </div>
                </div>
                
                <div className="device-info">
                  <div className="info-row">
                    <span className="info-label">IP Address:</span>
                    <span className="info-value">{device.ip}</span>
                  </div>
                  
                  {device.vendor && (
                    <div className="info-row">
                      <span className="info-label">Vendor:</span>
                      <span className="info-value">{getVendorLabel(device.vendor)}</span>
                    </div>
                  )}
                  
                  <div className="info-row">
                    <span className="info-label">Username:</span>
                    <span className="info-value">{device.username}</span>
                  </div>
                  
                  <div className="info-row">
                    <span className="info-label">Password:</span>
                    <span className="info-value password-masked">••••••••</span>
                  </div>
                  
                  <div className="info-row">
                    <span className="info-label">Added:</span>
                    <span className="info-value">{formatDate(device.created_at)}</span>
                  </div>
                  
                  <div className="info-row">
                    <span className="info-label">ID:</span>
                    <span className="info-value device-id">{device.id}</span>
                  </div>
                  
                  {device.updated_at && device.updated_at !== device.created_at && (
                    <div className="info-row">
                      <span className="info-label">Last Updated:</span>
                      <span className="info-value">{formatDate(device.updated_at)}</span>
                    </div>
                  )}
                </div>

                <div className="device-actions">
                  <button
                    onClick={() => handleDeleteDevice(device.id)}
                    className="delete-button"
                    disabled={!isApiAvailable || isDeviceDeleting(device.id) || !isAuthenticated}
                    title="Delete this device"
                  >
                    {isDeviceDeleting(device.id) ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default NetworkManagement;
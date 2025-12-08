import React, { useState, useEffect } from 'react';
import './DNSConfiguration.css';

function DNSConfiguration() {
  const [dnsRoleInstalled, setDnsRoleInstalled] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const [zones, setZones] = useState([]);
  const [zonesLoading, setZonesLoading] = useState(false);
  
  const [activeTab, setActiveTab] = useState('zones');
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [showCreateZoneModal, setShowCreateZoneModal] = useState(false);
  const [selectedZone, setSelectedZone] = useState(null);
  
  const [records, setRecords] = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  
  const [newZoneData, setNewZoneData] = useState({
    zoneName: '',
    zoneType: 'Primary',
    zoneFile: '',
    dynamicUpdate: 'None'
  });

  const [installing, setInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState('');
  const [installSuccess, setInstallSuccess] = useState(false);

  const navItems = [
    'Dashboard', 'DNS Configuration', 'Event Viewer', 'Backups', 'Users', 
    'Resource Monitor', 'WDS', 'Networking', 'Device Auto Config', 
    'Device Backup', 'Routing'
  ];

  const checkDNSRole = () => {
    setLoading(true);
    setError(null);
    
    console.log('Checking DNS role...');
    
    setTimeout(() => {
      const simulatedResponse = { dns_role: true};
      if (simulatedResponse.dns_role) {
        setDnsRoleInstalled(true);
        fetchZones();
      } else {
        setDnsRoleInstalled(false);
        setTimeout(() => {
          setShowInstallModal(true);
        }, 300);
      }
      setLoading(false);
    }, 1000);
  };

  const fetchZones = () => {
    setZonesLoading(true);
    
    console.log('Fetching DNS zones...');
    
    setTimeout(() => {
      setZones([]); 
      setZonesLoading(false);
    }, 800);
  };

  const fetchZoneRecords = (zoneName) => {
    if (!zoneName) return;
    
    setRecordsLoading(true);
    setSelectedZone(zoneName);
    
    console.log(`Fetching records for zone: ${zoneName}`);
    
    setTimeout(() => {
      setRecords([]); 
      setRecordsLoading(false);
    }, 800);
  };

  const installDNSRole = () => {
    setInstalling(true);
    setInstallProgress('Starting DNS role installation...');
    
    console.log('Installing DNS role...');
    
    const steps = [
      'Checking prerequisites...',
      'Downloading DNS components...',
      'Installing DNS server role...',
      'Configuring DNS service...',
      'Finalizing installation...'
    ];
    
    let stepIndex = 0;
    const interval = setInterval(() => {
      if (stepIndex < steps.length) {
        setInstallProgress(steps[stepIndex]);
        stepIndex++;
      } else {
        clearInterval(interval);
        setTimeout(() => {
          setInstalling(false);
          setInstallSuccess(true);
          
          setTimeout(() => {
            setInstallSuccess(false);
            setShowInstallModal(false);
            checkDNSRole();
          }, 1000);
        }, 1000);
      }
    }, 1500);
  };

  const createZone = () => {
    if (!newZoneData.zoneName.trim()) {
      setError('Zone name is required');
      return;
    }
    
    console.log('Creating DNS zone:', newZoneData);
    
    setTimeout(() => {
      fetchZones();
      setShowCreateZoneModal(false);
      setNewZoneData({
        zoneName: '',
        zoneType: 'Primary',
        zoneFile: '',
        dynamicUpdate: 'None'
      });
    }, 1000);
  };

  const deleteZone = (zoneName) => {
    if (!window.confirm(`Are you sure you want to delete zone "${zoneName}"? This action cannot be undone.`)) {
      return;
    }
    
    console.log(`Deleting DNS zone: ${zoneName}`);
    
    setTimeout(() => {
      fetchZones();
    }, 800);
  };

  useEffect(() => {
    checkDNSRole();
  }, []);

  useEffect(() => {
    if (selectedZone) {
      fetchZoneRecords(selectedZone);
    }
  }, [selectedZone]);

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderDNSRoleStatus = () => {
    if (loading) {
      return (
        <div className="status-checking">
          <div className="spinner"></div>
          <span>Checking DNS role status...</span>
        </div>
      );
    }

    if (dnsRoleInstalled === false) {
      return (
        <div className="dns-not-installed">
          <div className="error-icon">⚠️</div>
          <div className="error-content">
            <h3>DNS Server Role Not Installed</h3>
            <p>DNS server role is not installed on this system. You need to install it before managing DNS zones.</p>
            <button 
              className="btn-install-dns"
              onClick={() => setShowInstallModal(true)}
            >
              Install DNS Server Role
            </button>
          </div>
        </div>
      );
    }

    return null;
  };

  const renderZonesList = () => {
    if (zonesLoading) {
      return (
        <div className="loading-container">
          <div className="spinner"></div>
          <span>Loading DNS zones...</span>
        </div>
      );
    }

    if (zones.length === 0) {
      return (
        <div className="empty-state">
          <div className="empty-icon">📁</div>
          <h3>No DNS Zones Found</h3>
          <p>There are no DNS zones configured yet. Create your first zone to get started.</p>
          <button 
            className="btn-create-zone"
            onClick={() => setShowCreateZoneModal(true)}
          >
            Create DNS Zone
          </button>
        </div>
      );
    }

    return (
      <div className="zones-container">
        <div className="zones-header">
          <h3>DNS Zones ({zones.length})</h3>
          <button 
            className="btn-create-zone"
            onClick={() => setShowCreateZoneModal(true)}
          >
            + Create New Zone
          </button>
        </div>
        
        <div className="zones-table-container">
          <table className="zones-table">
            <thead>
              <tr>
                <th>Zone Name</th>
                <th>Type</th>
                <th>Status</th>
                <th>Records</th>
                <th>Last Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {zones.map((zone) => (
                <tr 
                  key={zone.id || zone.name}
                  className={selectedZone === zone.name ? 'selected' : ''}
                  onClick={() => setSelectedZone(zone.name)}
                >
                  <td className="zone-name">
                    <strong>{zone.name}</strong>
                  </td>
                  <td>
                    <span className={`zone-type ${zone.type?.toLowerCase()}`}>
                      {zone.type}
                    </span>
                  </td>
                  <td>
                    <span className={`status-badge ${zone.status?.toLowerCase()}`}>
                      {zone.status}
                    </span>
                  </td>
                  <td>{zone.records || 0}</td>
                  <td>{formatDate(zone.lastUpdated)}</td>
                  <td className="actions">
                    <button 
                      className="btn-view"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedZone(zone.name);
                        setActiveTab('records');
                      }}
                    >
                      View Records
                    </button>
                    <button 
                      className="btn-delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteZone(zone.name);
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderDNSRecords = () => {
    if (!selectedZone) {
      return (
        <div className="no-zone-selected">
          <div className="info-icon">ℹ️</div>
          <h3>Select a DNS Zone</h3>
          <p>Select a zone from the list to view its DNS records.</p>
        </div>
      );
    }

    if (recordsLoading) {
      return (
        <div className="loading-container">
          <div className="spinner"></div>
          <span>Loading DNS records for {selectedZone}...</span>
        </div>
      );
    }

    if (records.length === 0) {
      return (
        <div className="empty-state">
          <div className="empty-icon">📝</div>
          <h3>No DNS Records Found</h3>
          <p>No DNS records found for zone "{selectedZone}". Add records to this zone.</p>
          <button className="btn-add-record">
            + Add DNS Record
          </button>
        </div>
      );
    }

    return (
      <div className="records-container">
        <div className="records-header">
          <h3>DNS Records for {selectedZone}</h3>
          <div className="header-actions">
            <button className="btn-add-record">
              + Add Record
            </button>
            <button 
              className="btn-back"
              onClick={() => setActiveTab('zones')}
            >
              ← Back to Zones
            </button>
          </div>
        </div>
        
        <div className="records-table-container">
          <table className="records-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Data/Value</th>
                <th>TTL</th>
                <th>Priority</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.id}>
                  <td>{record.name}</td>
                  <td>
                    <span className={`record-type ${record.type}`}>
                      {record.type}
                    </span>
                  </td>
                  <td className="record-data">{record.data}</td>
                  <td>{record.ttl || 'Default'}</td>
                  <td>{record.priority || '-'}</td>
                  <td className="actions">
                    <button className="btn-edit">Edit</button>
                    <button className="btn-delete">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="dns-configuration">
      <div className="event-viewer-header">
        <h1 className="event-viewer-title">Automation</h1>
        <div className="nav-buttons">
          {navItems.map((item) => (
            <button
              key={item}
              className={`nav-button ${
                item === 'DNS Configuration' 
                  ? 'nav-button-active' 
                  : 'nav-button-inactive'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="main-container">
        <div className="page-header">
          <h1>DNS Configuration</h1>
          <p>Manage DNS server roles, zones, and records</p>
        </div>

        {renderDNSRoleStatus()}

        {dnsRoleInstalled === true && (
          <div className="dns-content">
            <div className="tabs-navigation">
              <button
                className={`tab-btn ${activeTab === 'zones' ? 'active' : ''}`}
                onClick={() => setActiveTab('zones')}
              >
                DNS Zones
              </button>
              <button
                className={`tab-btn ${activeTab === 'records' ? 'active' : ''}`}
                onClick={() => setActiveTab('records')}
                disabled={!selectedZone}
              >
                DNS Records
              </button>
              <button
                className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
                onClick={() => setActiveTab('settings')}
              >
                DNS Settings
              </button>
            </div>

            <div className="tab-content">
              {activeTab === 'zones' && renderZonesList()}
              {activeTab === 'records' && renderDNSRecords()}
              {activeTab === 'settings' && (
                <div className="settings-container">
                  <h3>DNS Server Settings</h3>
                  <p>Global DNS server configuration will be displayed here.</p>
                  <div className="settings-placeholder">
                    DNS server settings interface will be implemented when backend commands are available.
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="error-message">
            <div className="error-icon">⚠️</div>
            <div className="error-text">{error}</div>
            <button className="btn-close-error" onClick={() => setError(null)}>
              ×
            </button>
          </div>
        )}
      </div>

      {showInstallModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Install DNS Server Role</h2>
              <button 
                className="btn-close-modal"
                onClick={() => setShowInstallModal(false)}
                disabled={installing}
              >
                ×
              </button>
            </div>
            
            <div className="modal-content">
              {installing ? (
                <div className="installation-progress">
                  <div className="spinner large"></div>
                  <h3>Installing DNS Server Role</h3>
                  <p className="progress-text">{installProgress}</p>
                  <div className="progress-bar">
                    <div className="progress-fill"></div>
                  </div>
                </div>
              ) : installSuccess ? (
                <div className="installation-success">
                  <div className="success-icon">✓</div>
                  <h3>Installation Complete!</h3>
                  <p>DNS server role has been successfully installed.</p>
                </div>
              ) : (
                <>
                  <div className="warning-box">
                    <h4>⚠️ Important Information</h4>
                    <ul>
                      <li>This will install Windows DNS Server role</li>
                      <li>System restart may be required</li>
                      <li>Ensure you have administrator privileges</li>
                      <li>Installation may take several minutes</li>
                    </ul>
                  </div>
                  
                  <div className="form-group">
                    <label>Installation Type</label>
                    <select className="form-control">
                      <option>Full DNS Server</option>
                      <option>DNS Tools Only</option>
                    </select>
                  </div>
                  
                  <div className="modal-actions">
                    <button 
                      className="btn-cancel"
                      onClick={() => setShowInstallModal(false)}
                    >
                      Cancel
                    </button>
                    <button 
                      className="btn-install"
                      onClick={installDNSRole}
                    >
                      Begin Installation
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {showCreateZoneModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Create DNS Zone</h2>
              <button 
                className="btn-close-modal"
                onClick={() => setShowCreateZoneModal(false)}
              >
                ×
              </button>
            </div>
            
            <div className="modal-content">
              <div className="form-group">
                <label>Zone Name *</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="example.com"
                  value={newZoneData.zoneName}
                  onChange={(e) => setNewZoneData({...newZoneData, zoneName: e.target.value})}
                />
              </div>
              
              <div className="form-group">
                <label>Zone Type</label>
                <select 
                  className="form-control"
                  value={newZoneData.zoneType}
                  onChange={(e) => setNewZoneData({...newZoneData, zoneType: e.target.value})}
                >
                  <option value="Primary">Primary Zone</option>
                  <option value="Secondary">Secondary Zone</option>
                  <option value="Stub">Stub Zone</option>
                  <option value="Reverse">Reverse Lookup Zone</option>
                </select>
              </div>
              
              <div className="form-group">
                <label>Zone File Name (Optional)</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="example.com.dns"
                  value={newZoneData.zoneFile}
                  onChange={(e) => setNewZoneData({...newZoneData, zoneFile: e.target.value})}
                />
              </div>
              
              <div className="form-group">
                <label>Dynamic Updates</label>
                <select 
                  className="form-control"
                  value={newZoneData.dynamicUpdate}
                  onChange={(e) => setNewZoneData({...newZoneData, dynamicUpdate: e.target.value})}
                >
                  <option value="None">None</option>
                  <option value="Secure">Secure only</option>
                  <option value="NonSecure">Nonsecure and secure</option>
                </select>
              </div>
              
              <div className="modal-actions">
                <button 
                  className="btn-cancel"
                  onClick={() => setShowCreateZoneModal(false)}
                >
                  Cancel
                </button>
                <button 
                  className="btn-create"
                  onClick={createZone}
                >
                  Create Zone
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default DNSConfiguration;
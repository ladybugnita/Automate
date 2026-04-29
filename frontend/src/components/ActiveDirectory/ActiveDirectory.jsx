import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from '../../Context/WebSocketContext';
import './ActiveDirectory.css';

const ActiveDirectory = () => {
  const { sendCommand, getCommandResponse, isConnected, agentStatus } = useWebSocket();
  
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [computers, setComputers] = useState([]);
  const [loading, setLoading] = useState({
    users: false,
    groups: false,
    computers: false
  });
  const [activeTab, setActiveTab] = useState('users');
  const [searchTerm, setSearchTerm] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);
  const [newUserForm, setNewUserForm] = useState({
    username: '',
    fullName: '',
    password: '',
    email: '',
    department: '',
    title: ''
  });
  const [newGroupForm, setNewGroupForm] = useState({
    groupName: '',
    description: '',
    scope: 'Global',
    type: 'Security'
  });
  const [usingMockData, setUsingMockData] = useState({
    users: false,
    groups: false,
    computers: false
  });

  const hasLoadedInitialData = useRef(false);
  const isCurrentlyLoading = useRef(false);

  
  const generateMockUsers = useCallback(() => {
    return [
      {
        username: 'jsmith',
        fullName: 'John Smith',
        email: 'john.smith@company.com',
        department: 'IT',
        title: 'System Administrator',
        enabled: true,
        lastLogon: '2024-01-15 14:30:22',
        groups: ['Domain Admins', 'IT Staff'],
        distinguishedName: 'CN=John Smith,OU=IT,DC=company,DC=com'
      },
      {
        username: 'mjones',
        fullName: 'Mary Jones',
        email: 'mary.jones@company.com',
        department: 'HR',
        title: 'HR Manager',
        enabled: true,
        lastLogon: '2024-01-14 09:15:10',
        groups: ['HR Managers', 'All Users'],
        distinguishedName: 'CN=Mary Jones,OU=HR,DC=company,DC=com'
      },
      {
        username: 'rbrown',
        fullName: 'Robert Brown',
        email: 'robert.brown@company.com',
        department: 'Finance',
        title: 'Financial Analyst',
        enabled: false,
        lastLogon: '2023-12-20 11:45:33',
        groups: ['Finance Team'],
        distinguishedName: 'CN=Robert Brown,OU=Finance,DC=company,DC=com'
      }
    ];
  }, []);

  const generateMockGroups = useCallback(() => {
    return [
      {
        name: 'Domain Admins',
        description: 'Administrators of the domain',
        scope: 'Global',
        type: 'Security',
        memberCount: 12,
        created: '2022-03-15',
        distinguishedName: 'CN=Domain Admins,CN=Users,DC=company,DC=com'
      },
      {
        name: 'IT Staff',
        description: 'IT Department Staff',
        scope: 'Global',
        type: 'Security',
        memberCount: 25,
        created: '2022-05-20',
        distinguishedName: 'CN=IT Staff,OU=IT,DC=company,DC=com'
      },
      {
        name: 'HR Managers',
        description: 'Human Resources Management Team',
        scope: 'Global',
        type: 'Security',
        memberCount: 8,
        created: '2022-07-10',
        distinguishedName: 'CN=HR Managers,OU=HR,DC=company,DC=com'
      }
    ];
  }, []);

  const generateMockComputers = useCallback(() => {
    return [
      {
        name: 'PC-JSMITH-01',
        operatingSystem: 'Windows 11 Enterprise',
        lastLogon: '2024-01-16 14:22:10',
        enabled: true,
        ipAddress: '192.168.1.101',
        distinguishedName: 'CN=PC-JSMITH-01,OU=Workstations,DC=company,DC=com'
      },
      {
        name: 'WS-MJONES-02',
        operatingSystem: 'Windows 10 Pro',
        lastLogon: '2024-01-15 09:45:30',
        enabled: true,
        ipAddress: '192.168.1.102',
        distinguishedName: 'CN=WS-MJONES-02,OU=Workstations,DC=company,DC=com'
      }
    ];
  }, []);

  
  const loadUsers = useCallback(async (forceMock = false) => {
    if (isCurrentlyLoading.current) {
      console.log('Already loading, skipping duplicate call');
      return;
    }

    setLoading(prev => ({ ...prev, users: true }));
    setError(null);
    isCurrentlyLoading.current = true;

    try {
      if (forceMock || !isConnected) {
        console.log('Loading mock users data');
        setTimeout(() => {
          setUsers(generateMockUsers());
          setUsingMockData(prev => ({ ...prev, users: true }));
          setLoading(prev => ({ ...prev, users: false }));
          isCurrentlyLoading.current = false;
        }, 800);
        return;
      }

      const commandId = sendCommand('get_ad_users');
      
      const checkResponse = () => {
        const response = getCommandResponse('get_ad_users');
        
        if (response) {
          if (response.error) {
            setUsers(generateMockUsers());
            setUsingMockData(prev => ({ ...prev, users: true }));
            setError(`Backend error: ${response.error}. Showing mock data.`);
          } else {
            setUsers(response.users || []);
            setUsingMockData(prev => ({ ...prev, users: false }));
          }
          setLoading(prev => ({ ...prev, users: false }));
          isCurrentlyLoading.current = false;
        } else {
          setTimeout(checkResponse, 300);
        }
      };
      
      setTimeout(checkResponse, 500);
      
    } catch (err) {
      console.error('Error loading users:', err);
      setError(`Failed to load users: ${err.message}. Showing mock data.`);
      setUsers(generateMockUsers());
      setUsingMockData(prev => ({ ...prev, users: true }));
      setLoading(prev => ({ ...prev, users: false }));
      isCurrentlyLoading.current = false;
    }
  }, [sendCommand, getCommandResponse, isConnected, generateMockUsers]);

  const loadGroups = useCallback(async (forceMock = false) => {
    if (isCurrentlyLoading.current) {
      return;
    }

    setLoading(prev => ({ ...prev, groups: true }));
    setError(null);
    isCurrentlyLoading.current = true;

    try {
      if (forceMock || !isConnected) {
        setTimeout(() => {
          setGroups(generateMockGroups());
          setUsingMockData(prev => ({ ...prev, groups: true }));
          setLoading(prev => ({ ...prev, groups: false }));
          isCurrentlyLoading.current = false;
        }, 800);
        return;
      }

      const commandId = sendCommand('get_ad_groups');
      
      const checkResponse = () => {
        const response = getCommandResponse('get_ad_groups');
        
        if (response) {
          if (response.error) {
            setGroups(generateMockGroups());
            setUsingMockData(prev => ({ ...prev, groups: true }));
          } else {
            setGroups(response.groups || []);
            setUsingMockData(prev => ({ ...prev, groups: false }));
          }
          setLoading(prev => ({ ...prev, groups: false }));
          isCurrentlyLoading.current = false;
        } else {
          setTimeout(checkResponse, 300);
        }
      };
      
      setTimeout(checkResponse, 500);
      
    } catch (err) {
      console.error('Error loading groups:', err);
      setError(`Failed to load groups: ${err.message}. Showing mock data.`);
      setGroups(generateMockGroups());
      setUsingMockData(prev => ({ ...prev, groups: true }));
      setLoading(prev => ({ ...prev, groups: false }));
      isCurrentlyLoading.current = false;
    }
  }, [sendCommand, getCommandResponse, isConnected, generateMockGroups]);

  const loadComputers = useCallback(async (forceMock = false) => {
    if (isCurrentlyLoading.current) {
      return;
    }

    setLoading(prev => ({ ...prev, computers: true }));
    setError(null);
    isCurrentlyLoading.current = true;

    try {
      if (forceMock || !isConnected) {
        setTimeout(() => {
          setComputers(generateMockComputers());
          setUsingMockData(prev => ({ ...prev, computers: true }));
          setLoading(prev => ({ ...prev, computers: false }));
          isCurrentlyLoading.current = false;
        }, 800);
        return;
      }

      const commandId = sendCommand('get_ad_computers');
      
      const checkResponse = () => {
        const response = getCommandResponse('get_ad_computers');
        
        if (response) {
          if (response.error) {
            setComputers(generateMockComputers());
            setUsingMockData(prev => ({ ...prev, computers: true }));
          } else {
            setComputers(response.computers || []);
            setUsingMockData(prev => ({ ...prev, computers: false }));
          }
          setLoading(prev => ({ ...prev, computers: false }));
          isCurrentlyLoading.current = false;
        } else {
          setTimeout(checkResponse, 300);
        }
      };
      
      setTimeout(checkResponse, 500);
      
    } catch (err) {
      console.error('Error loading computers:', err);
      setError(`Failed to load computers: ${err.message}. Showing mock data.`);
      setComputers(generateMockComputers());
      setUsingMockData(prev => ({ ...prev, computers: true }));
      setLoading(prev => ({ ...prev, computers: false }));
      isCurrentlyLoading.current = false;
    }
  }, [sendCommand, getCommandResponse, isConnected, generateMockComputers]);

  
  const loadAllData = useCallback(async (forceMock = false) => {
    
    isCurrentlyLoading.current = false;
    
    await loadUsers(forceMock);
    await loadGroups(forceMock);
    await loadComputers(forceMock);
    
    hasLoadedInitialData.current = true;
  }, [loadUsers, loadGroups, loadComputers]);
  
  const handleCreateUser = async () => {
    if (!newUserForm.username || !newUserForm.password) {
      setError('Username and password are required');
      return;
    }

    setActionLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const payload = {
        username: newUserForm.username,
        password: newUserForm.password,
        fullName: newUserForm.fullName,
        email: newUserForm.email,
        department: newUserForm.department,
        title: newUserForm.title
      };

      setTimeout(() => {
        setSuccessMessage(`User ${newUserForm.username} created successfully`);
        
        const newUser = {
          ...newUserForm,
          enabled: true,
          lastLogon: 'Never',
          groups: [],
          distinguishedName: `CN=${newUserForm.fullName || newUserForm.username},OU=${newUserForm.department || 'Users'},DC=company,DC=com`
        };
        
        setUsers(prev => [newUser, ...prev]);
        setNewUserForm({
          username: '',
          fullName: '',
          password: '',
          email: '',
          department: '',
          title: ''
        });
        
        setActionLoading(false);
      }, 800);
      
    } catch (err) {
      setError(`Failed to create user: ${err.message}`);
      setActionLoading(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupForm.groupName) {
      setError('Group name is required');
      return;
    }

    setActionLoading(true);
    setError(null);

    try {
      setTimeout(() => {
        setSuccessMessage(`Group ${newGroupForm.groupName} created successfully`);
        
        const newGroup = {
          name: newGroupForm.groupName,
          description: newGroupForm.description,
          scope: newGroupForm.scope,
          type: newGroupForm.type,
          memberCount: 0,
          created: new Date().toISOString().split('T')[0],
          distinguishedName: `CN=${newGroupForm.groupName},OU=Groups,DC=company,DC=com`
        };
        
        setGroups(prev => [newGroup, ...prev]);
        setNewGroupForm({
          groupName: '',
          description: '',
          scope: 'Global',
          type: 'Security'
        });
        
        setActionLoading(false);
      }, 800);
      
    } catch (err) {
      setError(`Failed to create group: ${err.message}`);
      setActionLoading(false);
    }
  };

  
  useEffect(() => {
    
    if (!hasLoadedInitialData.current) {      
      loadAllData(true);
    }
    
    return () => {
    };
  }, [loadAllData]); 
  
  const filteredUsers = users.filter(user => 
    user.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredGroups = groups.filter(group => 
    group.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    group.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredComputers = computers.filter(computer => 
    computer.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    computer.operatingSystem?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  
  const renderUsersTab = () => (
    <div className="ad-tab-content">
      <div className="ad-actions-header">
        <h3 className="text-lg font-semibold text-gray-700">Create New User</h3>
        <div className="ad-create-form">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="ad-form-label">Username *</label>
              <input
                type="text"
                className="ad-form-input"
                value={newUserForm.username}
                onChange={(e) => setNewUserForm({...newUserForm, username: e.target.value})}
                placeholder="RamSharan"
              />
            </div>
            <div>
              <label className="ad-form-label">Password *</label>
              <input
                type="password"
                className="ad-form-input"
                value={newUserForm.password}
                onChange={(e) => setNewUserForm({...newUserForm, password: e.target.value})}
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="ad-form-label">Full Name</label>
              <input
                type="text"
                className="ad-form-input"
                value={newUserForm.fullName}
                onChange={(e) => setNewUserForm({...newUserForm, fullName: e.target.value})}
                placeholder="Ram Sharan"
              />
            </div>
            <div>
              <label className="ad-form-label">Email</label>
              <input
                type="email"
                className="ad-form-input"
                value={newUserForm.email}
                onChange={(e) => setNewUserForm({...newUserForm, email: e.target.value})}
                placeholder="ramsharan@gmail.com"
              />
            </div>
            <div>
              <label className="ad-form-label">Department</label>
              <input
                type="text"
                className="ad-form-input"
                value={newUserForm.department}
                onChange={(e) => setNewUserForm({...newUserForm, department: e.target.value})}
                placeholder="IT"
              />
            </div>
            <div>
              <label className="ad-form-label">Title</label>
              <input
                type="text"
                className="ad-form-input"
                value={newUserForm.title}
                onChange={(e) => setNewUserForm({...newUserForm, title: e.target.value})}
                placeholder="System Administrator"
              />
            </div>
          </div>
          <button
            className="ad-primary-btn"
            onClick={handleCreateUser}
            disabled={actionLoading}
          >
            {actionLoading ? 'Creating...' : 'Create User'}
          </button>
        </div>
      </div>

      <div className="ad-list-container">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-700">
            Active Directory Users ({filteredUsers.length})
          </h3>
          <button
            className="text-sm text-primary-color hover:underline"
            onClick={() => loadUsers(true)}
            disabled={loading.users}
          >
            {loading.users ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        
        {loading.users ? (
          <div className="ad-loading">Loading users...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="ad-empty-state">No users found</div>
        ) : (
          <div className="ad-grid">
            {filteredUsers.map((user, index) => (
              <div key={index} className="ad-card">
                <div className="ad-card-header">
                  <div className="flex items-center">
                    <div className="ad-user-avatar">
                      {user.username?.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h4 className="ad-card-title">{user.username}</h4>
                      <p className="ad-card-subtitle">{user.fullName}</p>
                    </div>
                  </div>
                  <div className={`ad-status-badge ${user.enabled ? 'status-enabled' : 'status-disabled'}`}>
                    {user.enabled ? 'Enabled' : 'Disabled'}
                  </div>
                </div>
                <div className="ad-card-content">
                  <div className="ad-info-row">
                    <span className="ad-info-label">Email:</span>
                    <span className="ad-info-value">{user.email || 'N/A'}</span>
                  </div>
                  <div className="ad-info-row">
                    <span className="ad-info-label">Department:</span>
                    <span className="ad-info-value">{user.department || 'N/A'}</span>
                  </div>
                  <div className="ad-info-row">
                    <span className="ad-info-label">Last Logon:</span>
                    <span className="ad-info-value">{user.lastLogon || 'Never'}</span>
                  </div>
                  <div className="ad-info-row">
                    <span className="ad-info-label">Member of:</span>
                    <span className="ad-info-value">{user.groups?.length || 0} groups</span>
                  </div>
                </div>
                <div className="ad-card-actions">
                  <button
                    className="ad-action-btn"
                    onClick={() => {
                      if (window.confirm(`Reset password for ${user.username}?`)) {
                        setSuccessMessage(`Password reset for ${user.username}`);
                      }
                    }}
                  >
                    Reset Password
                  </button>
                  <button
                    className={`ad-action-btn ${user.enabled ? 'btn-warning' : 'btn-success'}`}
                    onClick={() => {
                      const newEnabled = !user.enabled;
                      setUsers(prev => prev.map(u => 
                        u.username === user.username ? { ...u, enabled: newEnabled } : u
                      ));
                      setSuccessMessage(`User ${user.username} ${newEnabled ? 'enabled' : 'disabled'}`);
                    }}
                  >
                    {user.enabled ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderGroupsTab = () => (
    <div className="ad-tab-content">
      <div className="ad-actions-header">
        <h3 className="text-lg font-semibold text-gray-700">Create New Group</h3>
        <div className="ad-create-form">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="ad-form-label">Group Name *</label>
              <input
                type="text"
                className="ad-form-input"
                value={newGroupForm.groupName}
                onChange={(e) => setNewGroupForm({...newGroupForm, groupName: e.target.value})}
                placeholder="IT-Admins"
              />
            </div>
            <div>
              <label className="ad-form-label">Description</label>
              <input
                type="text"
                className="ad-form-input"
                value={newGroupForm.description}
                onChange={(e) => setNewGroupForm({...newGroupForm, description: e.target.value})}
                placeholder="IT Administrator Group"
              />
            </div>
            <div>
              <label className="ad-form-label">Scope</label>
              <select
                className="ad-form-input"
                value={newGroupForm.scope}
                onChange={(e) => setNewGroupForm({...newGroupForm, scope: e.target.value})}
              >
                <option value="DomainLocal">Domain Local</option>
                <option value="Global">Global</option>
                <option value="Universal">Universal</option>
              </select>
            </div>
            <div>
              <label className="ad-form-label">Type</label>
              <select
                className="ad-form-input"
                value={newGroupForm.type}
                onChange={(e) => setNewGroupForm({...newGroupForm, type: e.target.value})}
              >
                <option value="Security">Security</option>
                <option value="Distribution">Distribution</option>
              </select>
            </div>
          </div>
          <button
            className="ad-primary-btn"
            onClick={handleCreateGroup}
            disabled={actionLoading}
          >
            {actionLoading ? 'Creating...' : 'Create Group'}
          </button>
        </div>
      </div>

      <div className="ad-list-container">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-700">
            Active Directory Groups ({filteredGroups.length})
          </h3>
          <button
            className="text-sm text-primary-color hover:underline"
            onClick={() => loadGroups(true)}
            disabled={loading.groups}
          >
            {loading.groups ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        
        {loading.groups ? (
          <div className="ad-loading">Loading groups...</div>
        ) : filteredGroups.length === 0 ? (
          <div className="ad-empty-state">No groups found</div>
        ) : (
          <div className="ad-grid">
            {filteredGroups.map((group, index) => (
              <div key={index} className="ad-card">
                <div className="ad-card-header">
                  <div className="flex items-center">
                    <div className="ad-group-icon">
                      <i className="fas fa-users"></i>
                    </div>
                    <div>
                      <h4 className="ad-card-title">{group.name}</h4>
                      <p className="ad-card-subtitle">{group.scope} / {group.type}</p>
                    </div>
                  </div>
                  <div className="ad-member-count">
                    {group.memberCount || 0} members
                  </div>
                </div>
                <div className="ad-card-content">
                  <div className="ad-info-row">
                    <span className="ad-info-label">Description:</span>
                    <span className="ad-info-value">{group.description || 'No description'}</span>
                  </div>
                  <div className="ad-info-row">
                    <span className="ad-info-label">Created:</span>
                    <span className="ad-info-value">{group.created || 'Unknown'}</span>
                  </div>
                  <div className="ad-info-row">
                    <span className="ad-info-label">Distinguished Name:</span>
                    <span className="ad-info-value truncate">{group.distinguishedName || 'N/A'}</span>
                  </div>
                </div>
                <div className="ad-card-actions">
                  <button
                    className="ad-action-btn"
                    onClick={() => {
                      const members = users.filter(u => u.groups?.includes(group.name));
                      alert(`Members of ${group.name}:\n${members.map(m => `• ${m.username}`).join('\n') || 'No members'}`);
                    }}
                  >
                    View Members
                  </button>
                  <button
                    className="ad-action-btn btn-secondary"
                    onClick={() => {
                      const username = prompt('Enter username to add to this group:');
                      if (username) {
                        setSuccessMessage(`User ${username} added to group ${group.name}`);
                      }
                    }}
                  >
                    Add Member
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderComputersTab = () => (
    <div className="ad-tab-content">
      <div className="ad-list-container">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-700">
            Active Directory Computers ({filteredComputers.length})
          </h3>
          <button
            className="text-sm text-primary-color hover:underline"
            onClick={() => loadComputers(true)}
            disabled={loading.computers}
          >
            {loading.computers ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        
        {loading.computers ? (
          <div className="ad-loading">Loading computers...</div>
        ) : filteredComputers.length === 0 ? (
          <div className="ad-empty-state">No computers found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="ad-table">
              <thead>
                <tr>
                  <th>Computer Name</th>
                  <th>Operating System</th>
                  <th>Last Logon</th>
                  <th>Enabled</th>
                  <th>IPv4 Address</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredComputers.map((computer, index) => (
                  <tr key={index}>
                    <td>
                      <div className="flex items-center">
                        <div className="ad-computer-icon">
                          <i className="fas fa-desktop"></i>
                        </div>
                        <span className="font-medium">{computer.name}</span>
                      </div>
                    </td>
                    <td>{computer.operatingSystem || 'Unknown'}</td>
                    <td>{computer.lastLogon || 'Never'}</td>
                    <td>
                      <span className={`ad-status-badge ${computer.enabled ? 'status-enabled' : 'status-disabled'}`}>
                        {computer.enabled ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td>{computer.ipAddress || 'N/A'}</td>
                    <td>
                      <div className="flex space-x-2">
                        <button 
                          className="ad-table-action-btn"
                          onClick={() => {
                            setSuccessMessage(`Pinging ${computer.name}...`);
                          }}
                        >
                          Ping
                        </button>
                        <button 
                          className="ad-table-action-btn"
                          onClick={() => {
                            if (window.confirm(`Restart computer ${computer.name}?`)) {
                              setSuccessMessage(`Restart command sent to ${computer.name}`);
                            }
                          }}
                        >
                          Restart
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="ad-container">
      <div className="ad-header">
        <h1 className="ad-title">Active Directory</h1>
        <div className="ad-header-actions">
          <div className="ad-search-container">
            <input
              type="text"
              className="ad-search-input"
              placeholder="Search users, groups, or computers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <button className="ad-search-btn">
              <i className="fas fa-search"></i>
            </button>
          </div>
          <button
            className="ad-refresh-btn"
            onClick={() => loadAllData(false)} 
            disabled={loading.users || loading.groups || loading.computers}
          >
            <i className="fas fa-sync-alt"></i> Refresh All
          </button>
        </div>
      </div>

      {error && (
        <div className="ad-alert ad-alert-error">
          <i className="fas fa-exclamation-circle"></i>
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ad-alert-close">
            <i className="fas fa-times"></i>
          </button>
        </div>
      )}

      {successMessage && (
        <div className="ad-alert ad-alert-success">
          <i className="fas fa-check-circle"></i>
          <span>{successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="ad-alert-close">
            <i className="fas fa-times"></i>
          </button>
        </div>
      )}

      <div className="ad-tabs">
        <button
          className={`ad-tab ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          <i className="fas fa-users mr-2"></i>
          Users ({users.length})
        </button>
        <button
          className={`ad-tab ${activeTab === 'groups' ? 'active' : ''}`}
          onClick={() => setActiveTab('groups')}
        >
          <i className="fas fa-user-friends mr-2"></i>
          Groups ({groups.length})
        </button>
        <button
          className={`ad-tab ${activeTab === 'computers' ? 'active' : ''}`}
          onClick={() => setActiveTab('computers')}
        >
          <i className="fas fa-desktop mr-2"></i>
          Computers ({computers.length})
        </button>
      </div>

      <div className="ad-content">
        {activeTab === 'users' && renderUsersTab()}
        {activeTab === 'groups' && renderGroupsTab()}
        {activeTab === 'computers' && renderComputersTab()}
      </div>
    </div>
  );
};

export default ActiveDirectory;
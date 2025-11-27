import React, { useEffect, useState, useCallback } from 'react';
import { useWebSocket } from '../../context/WebSocketContext';
import './Users.css';

const Users = () => {
  const { isConnected, sendCommand, getCommandResponse, addListener } = useWebSocket();
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState({ username: '', password: '' });
  const [updateUser, setUpdateUser] = useState({ oldUsername: '', newUsername: '', password: '' });
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [usersLoading, setUsersLoading] = useState(true);
  const [fetchAttempted, setFetchAttempted] = useState(false);

  const navItems = [
    'Dashboard', 'AD DNS', 'Event Viewer', 'Backups', 'Users',
    'Resource Monitor', 'WDS', 'Networking', 'Device Auto Config',
    'Device Backup', 'Commands'
  ];

  useEffect(() => {
    const removeListener = addListener((data) => {
      console.log('RAW WebSocket message received in Users:', data);

      if (data.action === 'response' && data.command && data.result) {
        console.log('Processing supervisor response:', data.command, data.result);

        let parsedResult = data.result;
        if (typeof data.result === 'string') {
          try {
            parsedResult = JSON.parse(data.result);
          } catch (e) {
            console.log('Result is not JSON, keeping as string');
          }
        }

        if (data.command === 'get_logged_users' && parsedResult?.status === 'success') {
          const usersArray = Array.isArray(parsedResult.data) ? parsedResult.data : [];
          console.log('Loaded users from supervisor:', usersArray.length, 'users');
          setUsers(usersArray);
          setUsersLoading(false);
        }

        if (data.command === 'add_user' && parsedResult) {
          setLoading(false);
          console.log('Add user response:', parsedResult);

          if (typeof parsedResult === 'string' && (
            parsedResult.includes('Local User created') ||
            parsedResult.includes('Name Enabled Description') ||
            parsedResult.includes('test True')
          )) {
            setFetchAttempted(false);
            setUsersLoading(true);
            sendCommand('get_logged_users');
            alert('User added successfully!');
          } else if (typeof parsedResult === 'string' && parsedResult.includes('Access denied')) {
            alert('Failed to add user: Access denied. Please run as Administrator.');
          } else if (parsedResult.error) {
            alert(`Failed to add user: ${parsedResult.error}`);
          } else {
            alert('User added successfully!');
            setFetchAttempted(false);
            setUsersLoading(true);
            sendCommand('get_logged_users');
          }
        }
      }
    });

    return () => removeListener();
  }, [addListener, sendCommand]);

  const fetchUsers = useCallback(() => {
    if (isConnected && !fetchAttempted) {
      console.log('Fetching users from backend...');
      setUsersLoading(true);
      setFetchAttempted(true);
      sendCommand('get_logged_users');

      setTimeout(() => {
        if (usersLoading) {
          console.log('Timeout (10s): No response from supervisor backend for users');
          setUsersLoading(false);
        }
      }, 10000);
    } else if (!isConnected && !fetchAttempted) {
      console.log('WebSocket not connected, cannot fetch users');
      setUsers([]);
      setUsersLoading(false);
      setFetchAttempted(true);
    }
  }, [isConnected, sendCommand, fetchAttempted, usersLoading]);

  useEffect(() => {
    setFetchAttempted(false);
  }, [isConnected]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (!isConnected) return;

    const interval = setInterval(() => {
      const usersResponse = getCommandResponse('get_logged_users');

      if (usersResponse && usersResponse.status === 'success' && Array.isArray(usersResponse.data)) {
        console.log('Updating users from stored responses:', usersResponse.data.length, 'users');
        setUsers(usersResponse.data);
        setUsersLoading(false);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isConnected, getCommandResponse]);

  const handleAddUser = () => {
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
    console.log('Adding user to system:', newUser.username);

    sendCommand('add_user', {
      username: newUser.username,
      password: newUser.password
    });

    setNewUser({ username: '', password: '' });
  };

  const handleUpdateUser = () => {
    if (!updateUser.oldUsername.trim() || !updateUser.newUsername.trim()) {
      alert('Please enter both old and new username');
      return;
    }

    if (updateUser.newUsername.length < 2) {
      alert('New username must be at least 2 characters long');
      return;
    }

    if (!isConnected) {
      alert('Cannot update user: Not connected to backend system');
      return;
    }

    console.log('Update user:', updateUser);
    console.log('Would update user in real system');
    alert('Update user functionality coming soon');

    setUpdateUser({ oldUsername: '', newUsername: '', password: '' });
    setShowUpdateForm(false);
    setSelectedUser(null);
  };

  const handleEditClick = (user) => {
    setSelectedUser(user);
    setUpdateUser({
      oldUsername: user.Name,
      newUsername: user.Name,
      password: ''
    });
    setShowUpdateForm(true);
  };

  const handleCancelUpdate = () => {
    setShowUpdateForm(false);
    setSelectedUser(null);
    setUpdateUser({ oldUsername: '', newUsername: '', password: '' });
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

  const handleManualRefresh = () => {
    if (!isConnected) {
      alert('Cannot refresh: Not connected to backend system');
      return;
    }
    setFetchAttempted(false);
    setUsersLoading(true);
    fetchUsers();
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
          <div className="users-list-card">
            <div className="users-list-header">
              <h2 className="users-list-title">
                List of Users
                {isConnected && <span className="real-data-badge">Live System</span>}
              </h2>
              <button
                onClick={handleManualRefresh}
                className="refresh-button"
                disabled={usersLoading || !isConnected}
              >
                {usersLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            <div className="users-table-container">
              {!isConnected ? (
                <div className="no-connection-message">
                  Not connected to backend system. Please check your connection.
                </div>
              ) : usersLoading ? (
                <div className="loading-message">
                  Loading users from backend...
                </div>
              ) : users.length === 0 ? (
                <div className="no-users-message">
                  No users found in the system
                </div>
              ) : (
                <table className="users-table">
                  <thead>
                    <tr>
                      <th>Username</th>
                      <th>Enabled</th>
                      <th>Last Logon</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user, index) => (
                      <tr key={index}>
                        <td>{user.Name}</td>
                        <td>
                          <span className={`status-badge ${user.Enabled ? 'enabled' : 'disabled'}`}>
                            {user.Enabled ? 'Yes' : 'No'}
                          </span>
                        </td>
                        <td>{formatDate(user.LastLogon)}</td>
                        <td>
                          <button
                            className="edit-button"
                            onClick={() => handleEditClick(user)}
                            disabled={!user.Enabled}
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div className="forms-column">
            <div className="form-card">
              <h3 className="form-title">Add User</h3>
              <div className="form-content">
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
                  disabled={loading || !isConnected}
                >
                  {loading ? 'Adding...' : 'Add User to System'}
                </button>
                {!isConnected && (
                  <div className="no-connection-notice">
                    🔌 Connect to backend to add users
                  </div>
                )}
              </div>
            </div>

            {showUpdateForm && (
              <div className="form-card update-form">
                <h3 className="form-title">Update User</h3>
                <div className="form-content">
                  <div className="form-group">
                    <label className="form-label">Old Username</label>
                    <input
                      type="text"
                      value={updateUser.oldUsername}
                      className="form-input"
                      placeholder="Enter old username"
                      readOnly
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">New Username</label>
                    <input
                      type="text"
                      value={updateUser.newUsername}
                      onChange={(e) => setUpdateUser({ ...updateUser, newUsername: e.target.value })}
                      className="form-input"
                      placeholder="Enter new username"
                      disabled={!isConnected}
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">New Password (Optional)</label>
                    <input
                      type="password"
                      value={updateUser.password}
                      onChange={(e) => setUpdateUser({ ...updateUser, password: e.target.value })}
                      className="form-input"
                      placeholder="Enter new password"
                      disabled={!isConnected}
                    />
                  </div>
                  <div className="form-buttons-row">
                    <button
                      onClick={handleCancelUpdate}
                      className="form-button cancel-button"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleUpdateUser}
                      className="form-button"
                      disabled={!isConnected}
                    >
                      Update System User
                    </button>
                  </div>
                  {!isConnected && (
                    <div className="no-connection-notice">
                      Connect to backend to update users
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

export default Users;
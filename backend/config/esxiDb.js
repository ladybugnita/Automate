import db from './db.js';

class ESXiDB {
    
    static async addConnection(connectionData, userId) {
        try {
            console.log('Adding ESXi connection to database (plain text password):', {
                userId: userId,
                connection_name: connectionData.connection_name || connectionData.connectionName,
                host_ip: connectionData.ip || connectionData.host_ip,
                username: connectionData.username,
                password_length: connectionData.password ? connectionData.password.length : 0,
                status: connectionData.status,
                installation_type: connectionData.installation_type
            });

            if (!userId) {
                throw new Error('User ID is required');
            }

            const hostIp = connectionData.ip || connectionData.host_ip;
            if (!hostIp) {
                throw new Error('IP address is required');
            }

            if (!connectionData.password) {
                throw new Error('Password is required');
            }

            const [existingConnections] = await db.execute(
                'SELECT id FROM esxi_hosts WHERE user_id = ? AND host_ip = ?',
                [userId, hostIp]
            );

            if (existingConnections.length > 0) {
                return {
                    success: false,
                    error: 'A connection with this IP address already exists for your account'
                };
            }

            const connectionName = connectionData.connection_name || connectionData.connectionName || `ESXi-${hostIp}`;
            const username = connectionData.username || 'root';
            const password = connectionData.password; 
            const status = connectionData.status || 'pending'; 
            const installation_type = connectionData.installation_type || 'existing';

            const sql = `
                INSERT INTO esxi_hosts 
                (user_id, connection_name, host_ip, username, password, status, installation_type, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`;
            
            const values = [
                userId,
                connectionName,
                hostIp,
                username,
                password, 
                status,
                installation_type
            ];
            
            console.log('Executing SQL with values (password masked):', [
                userId,
                connectionName,
                hostIp,
                username,
                '***PASSWORD***',
                status,
                installation_type
            ]);
            
            const [result] = await db.execute(sql, values);

            console.log(`ESXi host added with ID: ${result.insertId}`);

            const [rows] = await db.execute(
                `SELECT 
                    id, 
                    user_id,
                    connection_name, 
                    host_ip, 
                    username, 
                    password,
                    status, 
                    installation_type, 
                    last_seen,
                    created_at,
                    updated_at
                FROM esxi_hosts 
                WHERE id = ? AND user_id = ?`,
                [result.insertId, userId]
            );

            if (rows.length === 0) {
                throw new Error('Failed to retrieve saved ESXi host');
            }

            const savedHost = rows[0];
            
            return {
                success: true,
                data: {
                    id: savedHost.id,
                    user_id: savedHost.user_id,
                    connection_id: savedHost.id,
                    connection_name: savedHost.connection_name,
                    name: savedHost.connection_name,
                    host_ip: savedHost.host_ip,
                    ip: savedHost.host_ip,
                    username: savedHost.username || 'root',
                    password: savedHost.password, 
                    status: savedHost.status,
                    installation_type: savedHost.installation_type,
                    last_seen: savedHost.last_seen,
                    lastSeen: savedHost.last_seen,
                    created_at: savedHost.created_at,
                    updated_at: savedHost.updated_at,
                    hasCompleteCredentials: true 
                }
            };
            
        } catch (error) {
            console.error('Error adding ESXi connection:', error.message);
            console.error('Error stack:', error.stack);

            if (error.code === 'ER_DUP_ENTRY') {
                return {
                    success: false,
                    error: 'IP address already exists in database'
                };
            }
            
            return {
                success: false,
                error: error.message || 'Database error'
            };
        }
    }

    
    static async updateLastSeen(connectionId) {
        try {
            const [result] = await db.execute(
                'UPDATE esxi_hosts SET last_seen = NOW(), updated_at = NOW() WHERE id = ?', 
                [connectionId]
            );
            
            return { 
                success: true,
                affectedRows: result.affectedRows
            }; 
        } catch (error) {
            console.error('Error updating last seen:', error.message);
            return { 
                success: false, 
                error: error.message 
            };
        }
    }

   
    static async getConnections(userId, includePassword = false) {
        try {
            const selectFields = includePassword 
                ? `id, user_id, connection_name, host_ip, username, password, status, installation_type, last_seen, created_at, updated_at`
                : `id, user_id, connection_name, host_ip, username, status, installation_type, last_seen, created_at, updated_at`;
            
            const sql = `
                SELECT ${selectFields}
                FROM esxi_hosts 
                WHERE user_id = ?
                ORDER BY created_at DESC`;
            
            const [rows] = await db.execute(sql, [userId]);
            
            console.log(`Found ${rows.length} ESXi connections for user ${userId}, includePassword: ${includePassword}`);
            
            const connections = rows.map(row => {
                const connection = {
                    id: row.id,
                    user_id: row.user_id,
                    connection_id: row.id,
                    connection_name: row.connection_name,
                    name: row.connection_name,
                    host_ip: row.host_ip,
                    ip: row.host_ip,
                    username: row.username || 'root',
                    status: row.status,
                    installation_type: row.installation_type,
                    last_seen: row.last_seen,
                    lastSeen: row.last_seen,
                    created_at: row.created_at,
                    updated_at: row.updated_at
                };
                
                if (includePassword) {
                    connection.password = row.password;
                    connection.hasCompleteCredentials = !!(row.host_ip && row.username && row.password);
                } else {
                    connection.hasCompleteCredentials = !!(row.host_ip && row.username && row.password);
                }
                
                return connection;
            });
            
            return {
                success: true,
                connections: connections
            };
            
        } catch (error) {
            console.error('Error getting ESXi connections:', error.message);
            return {
                success: false,
                error: error.message,
                connections: []
            };
        }
    }

    static async getConnectionById(connectionId, userId = null, includePassword = false) {
        try {
            const selectFields = includePassword 
                ? `id, user_id, connection_name, host_ip, username, password, status, installation_type, last_seen, created_at, updated_at`
                : `id, user_id, connection_name, host_ip, username, status, installation_type, last_seen, created_at, updated_at`;
            
            let sql = `SELECT ${selectFields} FROM esxi_hosts WHERE id = ?`;
            const params = [connectionId];
            
            if (userId) {
                sql += ' AND user_id = ?';
                params.push(userId);
            }
            
            const [rows] = await db.execute(sql, params);
            
            if (rows.length === 0) {
                return {
                    success: false,
                    error: 'ESXi host not found'
                };
            }
            
            const row = rows[0];
            const connection = {
                id: row.id,
                user_id: row.user_id,
                connection_id: row.id,
                connection_name: row.connection_name,
                name: row.connection_name,
                host_ip: row.host_ip,
                ip: row.host_ip,
                username: row.username || 'root',
                status: row.status,
                installation_type: row.installation_type,
                last_seen: row.last_seen,
                lastSeen: row.last_seen,
                created_at: row.created_at,
                updated_at: row.updated_at
            };
            
            if (includePassword) {
                connection.password = row.password;
                connection.hasCompleteCredentials = !!(row.host_ip && row.username && row.password);
            } else {
                connection.hasCompleteCredentials = !!(row.host_ip && row.username && row.password);
            }
            
            return {
                success: true,
                connection: connection
            };
            
        } catch (error) {
            console.error('Error getting ESXi connection:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

   
    static async deleteConnection(connectionId, userId = null) {
        try {
            let sql = 'DELETE FROM esxi_hosts WHERE id = ?';
            const params = [connectionId];
            
            if (userId) {
                sql += ' AND user_id = ?';
                params.push(userId);
            }
            
            const [result] = await db.execute(sql, params);
            
            if (result.affectedRows === 0) {
                return {
                    success: false,
                    error: 'ESXi host not found or not authorized'
                };
            }
            
            await db.execute(
                'DELETE FROM virtual_machines WHERE esxi_host_id = ?',
                [connectionId]
            );
            
            return {
                success: true,
                message: 'ESXi host and associated virtual machines deleted successfully',
                affectedRows: result.affectedRows
            };
            
        } catch (error) {
            console.error('Error deleting ESXi connection:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }


    static async verifyPassword(connectionId, password) {
        try {
            const [rows] = await db.execute(
                'SELECT password FROM esxi_hosts WHERE id = ?',
                [connectionId]
            );
            
            if (rows.length === 0) {
                return {
                    success: false,
                    error: 'ESXi host not found'
                };
            }
            
            const storedPassword = rows[0].password; 
            const isValid = (storedPassword === password); 
            
            return {
                success: true,
                isValid: isValid
            };
            
        } catch (error) {
            console.error('Error verifying password:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    static async updateConnection(connectionId, updateData, userId = null) {
        try {
            console.log('Updating ESXi connection:', {
                connectionId,
                userId,
                updateData: {
                    ...updateData,
                    password: updateData.password ? '***' : 'not provided'
                }
            });
            
            const fields = ['updated_at = NOW()'];
            const values = [];
            
            if (updateData.connection_name !== undefined) {
                fields.push('connection_name = ?');
                values.push(updateData.connection_name);
            }
            
            if (updateData.host_ip !== undefined) {
                fields.push('host_ip = ?');
                values.push(updateData.host_ip);
            }
            
            if (updateData.username !== undefined) {
                fields.push('username = ?');
                values.push(updateData.username);
            }
            
            if (updateData.password !== undefined) {
                fields.push('password = ?');
                values.push(updateData.password); 
            }
            
            if (updateData.status !== undefined) {
                fields.push('status = ?');
                values.push(updateData.status);
            }
            
            if (updateData.installation_type !== undefined) {
                fields.push('installation_type = ?');
                values.push(updateData.installation_type);
            }
            
            if (fields.length <= 1) { 
                return {
                    success: false,
                    error: 'No data to update'
                };
            }
            
            let sql = `UPDATE esxi_hosts SET ${fields.join(', ')} WHERE id = ?`;
            values.push(connectionId);
            
            if (userId) {
                sql += ' AND user_id = ?';
                values.push(userId);
            }
            
            const [result] = await db.execute(sql, values);
            
            if (result.affectedRows === 0) {
                return {
                    success: false,
                    error: 'ESXi host not found or not authorized'
                };
            }
            
            return {
                success: true,
                message: 'ESXi host updated successfully',
                affectedRows: result.affectedRows
            };
            
        } catch (error) {
            console.error('Error updating ESXi connection:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    static async getEsxiCredentials(connectionId, userId) {
        try {
            console.log('Getting ESXi credentials for connection:', {
                connectionId,
                userId
            });
            
            const sql = `
                SELECT 
                    id,
                    user_id,
                    connection_name,
                    host_ip,
                    username,
                    password,
                    status,
                    installation_type
                FROM esxi_hosts 
                WHERE id = ? AND user_id = ?`;
            
            const [rows] = await db.execute(sql, [connectionId, userId]);
            
            if (rows.length === 0) {
                console.log(`No credentials found for host ${connectionId} and user ${userId}`);
                return {
                    success: false,
                    error: 'ESXi host not found or not authorized'
                };
            }
            
            const host = rows[0];
            
            return {
                success: true,
                credentials: {
                    id: host.id,
                    user_id: host.user_id,
                    connection_id: host.id,
                    connection_name: host.connection_name,
                    name: host.connection_name,
                    host_ip: host.host_ip,
                    ip: host.host_ip,
                    username: host.username || 'root',
                    password: host.password, 
                    status: host.status,
                    installation_type: host.installation_type,
                    hasCompleteCredentials: true
                }
            };
        } catch (error) {
            console.error('Error getting ESXi credentials:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    static async addVirtualMachine(vmData, userId) {
        try {
            console.log('Adding virtual machine:', {
                userId: userId,
                esxi_host_id: vmData.esxi_host_id,
                vm_name: vmData.vm_name,
                vm_size: vmData.vm_size
            });

            const [hostRows] = await db.execute(
                'SELECT id FROM esxi_hosts WHERE id = ? AND user_id = ?',
                [vmData.esxi_host_id, userId]
            );

            if (hostRows.length === 0) {
                return {
                    success: false,
                    error: 'ESXi host not found or not authorized'
                };
            }

            const [existingVMs] = await db.execute(
                'SELECT id FROM virtual_machines WHERE esxi_host_id = ? AND vm_name = ?',
                [vmData.esxi_host_id, vmData.vm_name]
            );

            if (existingVMs.length > 0) {
                return {
                    success: false,
                    error: 'A virtual machine with this name already exists on this host'
                };
            }

            let hashedVmPassword = null;
            if (vmData.vm_password) {
                const bcrypt = await import('bcrypt');
                const saltRounds = 12;
                hashedVmPassword = await bcrypt.hash(vmData.vm_password, saltRounds);
            }

            const sql = `
                INSERT INTO virtual_machines 
                (user_id, esxi_host_id, vm_name, vm_size, vm_ip, vm_username, vm_password, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`;
            
            const values = [
                userId,
                vmData.esxi_host_id,
                vmData.vm_name,
                vmData.vm_size || 'small',
                vmData.vm_ip || null,
                vmData.vm_username || 'root',
                hashedVmPassword,
                vmData.status || 'creating'
            ];
            
            const [result] = await db.execute(sql, values);

            console.log(`Virtual machine added with ID: ${result.insertId}`);

            return {
                success: true,
                data: {
                    id: result.insertId,
                    vm_id: result.insertId,
                    vm_name: vmData.vm_name,
                    esxi_host_id: vmData.esxi_host_id,
                    vm_size: vmData.vm_size || 'small',
                    status: vmData.status || 'creating'
                }
            };
            
        } catch (error) {
            console.error('Error adding virtual machine:', error.message);
            
            if (error.code === 'ER_DUP_ENTRY') {
                return {
                    success: false,
                    error: 'A VM with this name already exists on this host'
                };
            }
            
            return {
                success: false,
                error: error.message
            };
        }
    }

    static async getVirtualMachines(esxiHostId, userId = null) {
        try {
            let sql = `
                SELECT 
                    id,
                    user_id,
                    esxi_host_id,
                    vm_name,
                    vm_size,
                    vm_ip,
                    vm_username,
                    status,
                    created_at,
                    updated_at
                FROM virtual_machines 
                WHERE esxi_host_id = ?`;
            
            const params = [esxiHostId];
            
            if (userId) {
                sql += ' AND user_id = ?';
                params.push(userId);
            }
            
            sql += ' ORDER BY created_at DESC';
            
            const [rows] = await db.execute(sql, params);
            
            console.log(`Found ${rows.length} virtual machines for ESXi host ${esxiHostId}`);
            
            return {
                success: true,
                virtual_machines: rows
            };
            
        } catch (error) {
            console.error('Error getting virtual machines:', error.message);
            return {
                success: false,
                error: error.message,
                virtual_machines: []
            };
        }
    }
}

export default ESXiDB;
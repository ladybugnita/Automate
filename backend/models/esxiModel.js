import db from "../config/db.js";

export const checkDuplicateHostIp = async (user_id, host_ip) => {
    try {
        const [rows] = await db.query(
            'SELECT id FROM esxi_hosts WHERE user_id = ? AND host_ip = ?',
            [user_id, host_ip]
        );
        return rows.length > 0;
    } catch (error) {
        console.error('Error checking duplicate host IP:', error);
        throw error;
    }
};

export const saveEsxiHost = async (hostData) => {
    try {
        const { 
            user_id, 
            connection_name, 
            host_ip, 
            username = 'root', 
            password, 
            installation_type = 'existing',
            status = 'pending',
            connectionName  
        } = hostData;

        console.log('Saving ESXi host with data:', {
            user_id,
            connection_name: connection_name || connectionName,
            host_ip,
            username,
            password_length: password ? password.length : 0,
            installation_type,
            status
        });

        if (!user_id) {
            throw new Error('user_id is required');
        }

        if (!host_ip || !password) {
            throw new Error('host_ip and password are required');
        }

        const isDuplicate = await checkDuplicateHostIp(user_id, host_ip);
        if (isDuplicate) {
            throw new Error(`Host IP ${host_ip} is already added for your account. Please use a different IP or manage the existing connection.`);
        }

        const finalConnectionName = connection_name || connectionName || `ESXi-${host_ip}`;
        
        const [result] = await db.query(
            `INSERT INTO esxi_hosts 
             (user_id, connection_name, host_ip, username, password, installation_type, status, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [user_id, finalConnectionName, host_ip, username, password, installation_type, status]
        );
        
        console.log(`ESXi host saved with ID: ${result.insertId}`);
        
        const savedHost = await getEsxiHostById(result.insertId, user_id, true);
        
        return { 
            success: true, 
            id: result.insertId,
            host_id: result.insertId,
            data: savedHost,
            message: 'ESXi host saved successfully' 
        };
    } catch (error) {
        console.error('Error saving ESXi host:', error);
        
        if (error.code === 'ER_DUP_ENTRY') {
            throw new Error('You already have an ESXi host with this IP address');
        }
        
        throw error;
    }
};

export const getEsxiHosts = async (filters = {}) => {
    try {
        const { user_id, status, installation_type, include_password = false } = filters;
        
        console.log('Fetching ESXi hosts with filters:', {
            user_id,
            status,
            installation_type,
            include_password
        });
        
        if (!user_id) {
            throw new Error('user_id is required to fetch ESXi hosts');
        }
        
        let query = 'SELECT * FROM esxi_hosts WHERE user_id = ?';
        const params = [user_id];
        
        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }
        
        if (installation_type) {
            query += ' AND installation_type = ?';
            params.push(installation_type);
        }
        
        query += ' ORDER BY created_at DESC';
        
        const [rows] = await db.query(query, params);
        
        console.log(`Found ${rows.length} ESXi hosts for user ${user_id}`);
        
        if (include_password) {
            return rows;
        }
        
        return rows.map(row => {
            const { password, ...safeData } = row;
            return safeData;
        });
    } catch (error) {
        console.error('Error fetching ESXi hosts:', error);
        throw error;
    }
};

export const getEsxiHostById = async (host_id, user_id = null, include_password = false) => {
    try {
        console.log('Getting ESXi host by ID:', {
            host_id,
            user_id,
            include_password
        });
        
        let query = 'SELECT * FROM esxi_hosts WHERE id = ?';
        const params = [host_id];
        
        if (user_id) {
            query += ' AND user_id = ?';
            params.push(user_id);
        }
        
        const [rows] = await db.query(query, params);
        
        if (rows.length === 0) {
            console.log(`ESXi host ${host_id} not found for user ${user_id}`);
            return null;
        }
        
        console.log(`Found ESXi host ${host_id}`);
        
        if (include_password) {
            return rows[0];
        }
        
        const { password, ...safeData } = rows[0];
        return safeData;
    } catch (error) {
        console.error('Error fetching ESXi host by ID:', error);
        throw error;
    }
};

export const getEsxiHostByIP = async (host_ip, user_id = null, include_password = false) => {
    try {
        console.log('Getting ESXi host by IP:', {
            host_ip,
            user_id,
            include_password
        });
        
        let query = 'SELECT * FROM esxi_hosts WHERE host_ip = ?';
        const params = [host_ip];
        
        if (user_id) {
            query += ' AND user_id = ?';
            params.push(user_id);
        }
        
        const [rows] = await db.query(query, params);
        
        if (rows.length === 0) {
            console.log(`ESXi host with IP ${host_ip} not found for user ${user_id}`);
            return null;
        }
        
        if (include_password) {
            return rows[0];
        }
        
        const { password, ...safeData } = rows[0];
        return safeData;
    } catch (error) {
        console.error('Error fetching ESXi host by IP:', error);
        throw error;
    }
};

export const getEsxiHostWithPassword = async (host_id, user_id) => {
    try {
        console.log('Getting ESXi host with password:', {
            host_id,
            user_id
        });
        
        const query = 'SELECT * FROM esxi_hosts WHERE id = ? AND user_id = ?';
        const params = [host_id, user_id];
        
        const [rows] = await db.query(query, params);
        
        if (rows.length === 0) {
            console.log(`ESXi host ${host_id} with password not found for user ${user_id}`);
            return null;
        }
        
        console.log(`Found ESXi host ${host_id} with password`);
        
        return rows[0];
    } catch (error) {
        console.error('Error fetching ESXi host with password:', error);
        throw error;
    }
};

export const updateHostStatus = async (host_id, status, user_id = null) => {
    try {
        console.log('Updating host status:', {
            host_id,
            status,
            user_id
        });
        
        let query = `UPDATE esxi_hosts 
                     SET status = ?, updated_at = NOW(), last_seen = NOW()
                     WHERE id = ?`;
        const params = [status, host_id];
        
        if (user_id) {
            query += ' AND user_id = ?';
            params.push(user_id);
        }
        
        const [result] = await db.query(query, params);
        
        const success = result.affectedRows > 0;
        console.log(`Host status update ${success ? 'successful' : 'failed'}, affected rows: ${result.affectedRows}`);
        
        return { 
            success: success,
            affectedRows: result.affectedRows,
            message: success ? 'Status updated' : 'No host found'
        };
    } catch (error) {
        console.error('Error updating host status:', error);
        throw error;
    }
};

export const deleteEsxiHost = async (host_id, user_id = null) => {
    try {
        console.log('Deleting ESXi host:', {
            host_id,
            user_id
        });
        
        let query = 'DELETE FROM esxi_hosts WHERE id = ?';
        const params = [host_id];
        
        if (user_id) {
            query += ' AND user_id = ?';
            params.push(user_id);
        }
        
        const [result] = await db.query(query, params);
        
        const success = result.affectedRows > 0;
        console.log(`Host deletion ${success ? 'successful' : 'failed'}, affected rows: ${result.affectedRows}`);
        
        return { 
            success: success,
            affectedRows: result.affectedRows,
            message: success ? 'Host deleted' : 'No host found'
        };
    } catch (error) {
        console.error('Error deleting ESXi host:', error);
        throw error;
    }
};

export const markHostAsInstalled = async (host_id, user_id = null) => {
    try {
        console.log('Marking host as installed:', {
            host_id,
            user_id
        });
        
        let query = `UPDATE esxi_hosts 
                     SET status = 'installed', updated_at = NOW()
                     WHERE id = ?`;
        const params = [host_id];
        
        if (user_id) {
            query += ' AND user_id = ?';
            params.push(user_id);
        }
        
        const [result] = await db.query(query, params);
        
        const success = result.affectedRows > 0;
        console.log(`Mark as installed ${success ? 'successful' : 'failed'}, affected rows: ${result.affectedRows}`);
        
        return { 
            success: success,
            affectedRows: result.affectedRows,
            message: 'Marked as installed'
        };
    } catch (error) {
        console.error('Error marking as installed:', error);
        throw error;
    }
};

export const createVirtualMachine = async (vmData) => {
    try {
        console.log('Creating virtual machine:', {
            user_id: vmData.user_id,
            esxi_host_id: vmData.esxi_host_id,
            vm_name: vmData.vm_name
        });

        const { 
            user_id,
            esxi_host_id,
            vm_name,
            vm_size = 'small',
            vm_ip = null,
            vm_username = 'root',
            vm_password = null,
            status = 'creating'
        } = vmData;

        if (!user_id || !esxi_host_id || !vm_name) {
            throw new Error('user_id, esxi_host_id, and vm_name are required');
        }

        const [hostCheck] = await db.query(
            'SELECT id FROM esxi_hosts WHERE id = ? AND user_id = ?',
            [esxi_host_id, user_id]
        );
        
        if (hostCheck.length === 0) {
            throw new Error('ESXi host not found or access denied');
        }
        
        const [result] = await db.query(
            `INSERT INTO virtual_machines 
             (user_id, esxi_host_id, vm_name, vm_size, vm_ip, vm_username, vm_password, status, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
            [user_id, esxi_host_id, vm_name, vm_size, vm_ip, vm_username, vm_password, status]
        );
        
        console.log(`Virtual machine created with ID: ${result.insertId}`);
        
        return { 
            success: true, 
            id: result.insertId,
            vm_id: result.insertId,
            data: {
                id: result.insertId,
                vm_name,
                esxi_host_id
            },
            message: 'Virtual machine created successfully' 
        };
    } catch (error) {
        console.error('Error creating virtual machine:', error);
        
        if (error.code === 'ER_DUP_ENTRY') {
            throw new Error('A VM with this name already exists on this ESXi host');
        }
        
        throw error;
    }
};

export const getVirtualMachines = async (filters = {}) => {
    try {
        const { user_id, esxi_host_id, status } = filters;
        
        console.log('Fetching virtual machines with filters:', {
            user_id,
            esxi_host_id,
            status
        });
        
        if (!user_id) {
            throw new Error('user_id is required to fetch virtual machines');
        }
        
        let query = `
            SELECT vm.*, eh.connection_name, eh.host_ip 
            FROM virtual_machines vm
            JOIN esxi_hosts eh ON vm.esxi_host_id = eh.id
            WHERE vm.user_id = ?
        `;
        const params = [user_id];
        
        if (esxi_host_id) {
            query += ' AND vm.esxi_host_id = ?';
            params.push(esxi_host_id);
        }
        
        if (status) {
            query += ' AND vm.status = ?';
            params.push(status);
        }
        
        query += ' ORDER BY vm.created_at DESC';
        
        const [rows] = await db.query(query, params);
        
        console.log(`Found ${rows.length} virtual machines for user ${user_id}`);
        
        return rows.map(row => {
            const { vm_password, ...safeData } = row;
            return safeData;
        });
    } catch (error) {
        console.error('Error fetching virtual machines:', error);
        throw error;
    }
};

export const updateVmStatus = async (vm_id, status, user_id = null) => {
    try {
        console.log('Updating VM status:', {
            vm_id,
            status,
            user_id
        });
        
        let query = `UPDATE virtual_machines 
                     SET status = ?, updated_at = NOW()
                     WHERE id = ?`;
        const params = [status, vm_id];
        
        if (user_id) {
            query += ' AND user_id = ?';
            params.push(user_id);
        }
        
        const [result] = await db.query(query, params);
        
        const success = result.affectedRows > 0;
        console.log(`VM status update ${success ? 'successful' : 'failed'}, affected rows: ${result.affectedRows}`);
        
        return { 
            success: success,
            affectedRows: result.affectedRows,
            message: success ? 'VM status updated' : 'No VM found'
        };
    } catch (error) {
        console.error('Error updating VM status:', error);
        throw error;
    }
};

export const deleteVirtualMachine = async (vm_id, user_id = null) => {
    try {
        console.log('Deleting virtual machine:', {
            vm_id,
            user_id
        });
        
        let query = 'DELETE FROM virtual_machines WHERE id = ?';
        const params = [vm_id];
        
        if (user_id) {
            query += ' AND user_id = ?';
            params.push(user_id);
        }
        
        const [result] = await db.query(query, params);
        
        const success = result.affectedRows > 0;
        console.log(`VM deletion ${success ? 'successful' : 'failed'}, affected rows: ${result.affectedRows}`);
        
        return { 
            success: success,
            affectedRows: result.affectedRows,
            message: success ? 'VM deleted' : 'No VM found'
        };
    } catch (error) {
        console.error('Error deleting virtual machine:', error);
        throw error;
    }
};

export const getEsxiCredentials = async (host_id, user_id) => {
    try {
        console.log('Getting ESXi credentials for connection:', {
            host_id,
            user_id
        });
        
        const query = `
            SELECT 
                id,
                connection_name,
                host_ip as ip,
                username,
                password,
                status
            FROM esxi_hosts 
            WHERE id = ? AND user_id = ?`;
        
        const [rows] = await db.query(query, [host_id, user_id]);
        
        if (rows.length === 0) {
            console.log(`No credentials found for host ${host_id} and user ${user_id}`);
            return null;
        }
        
        const host = rows[0];
        
        return {
            id: host.id,
            connection_id: host.id,
            connection_name: host.connection_name,
            name: host.connection_name,
            ip: host.ip,
            host_ip: host.ip,
            username: host.username || 'root',
            password: host.password, 
            status: host.status
        };
    } catch (error) {
        console.error('Error getting ESXi credentials:', error);
        throw error;
    }
};

export const updateEsxiHost = async (host_id, user_id, updateData) => {
    try {
        console.log('Updating ESXi host:', {
            host_id,
            user_id,
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
            throw new Error('No data to update');
        }
        
        const query = `UPDATE esxi_hosts SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`;
        values.push(host_id, user_id);
        
        const [result] = await db.query(query, values);
        
        const success = result.affectedRows > 0;
        console.log(`ESXi host update ${success ? 'successful' : 'failed'}, affected rows: ${result.affectedRows}`);
        
        return { 
            success: success,
            affectedRows: result.affectedRows,
            message: success ? 'ESXi host updated successfully' : 'No host found or not authorized'
        };
    } catch (error) {
        console.error('Error updating ESXi host:', error);
        throw error;
    }
};
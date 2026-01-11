import db from "../config/db.js";

// Save or update ESXi connection with user_id
export const saveEsxiConnection = async (connectionData) => {
    try {
        const { 
            user_id, // Added
            connection_name, 
            ip_address, 
            username = 'root', 
            password, 
            installation_type = 'existing',
            status = 'pending'
        } = connectionData;

        // If user_id is provided, use it; otherwise use a default (for backward compatibility)
        const userId = user_id || 1; // Default to user ID 1 if not provided
        
        const [result] = await db.query(
            `INSERT INTO esxi_connections 
             (user_id, connection_name, ip_address, username, password, installation_type, status) 
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
             connection_name = VALUES(connection_name),
             username = VALUES(username),
             password = VALUES(password),
             installation_type = VALUES(installation_type),
             status = VALUES(status),
             updated_at = NOW()`,
            [userId, connection_name, ip_address, username, password, installation_type, status]
        );
        
        return { 
            success: true, 
            id: result.insertId || result.affectedRows,
            message: 'ESXi connection saved successfully' 
        };
    } catch (error) {
        console.error('Error saving ESXi connection:', error);
        throw error;
    }
};

// Get ESXi connections for a specific user
export const getEsxiConnections = async (filters = {}) => {
    try {
        const { user_id, status, installation_type } = filters;
        
        let query = 'SELECT * FROM esxi_connections WHERE 1=1';
        const params = [];
        
        // Filter by user_id if provided
        if (user_id) {
            query += ' AND user_id = ?';
            params.push(user_id);
        }
        
        // Add optional filters
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
        return rows;
    } catch (error) {
        console.error('Error fetching ESXi connections:', error);
        throw error;
    }
};

// Get single ESXi connection by IP
export const getEsxiConnectionByIP = async (ip_address, user_id = null) => {
    try {
        let query = 'SELECT * FROM esxi_connections WHERE ip_address = ?';
        const params = [ip_address];
        
        // Add user filter if provided
        if (user_id) {
            query += ' AND user_id = ?';
            params.push(user_id);
        }
        
        const [rows] = await db.query(query, params);
        
        return rows.length > 0 ? rows[0] : null;
    } catch (error) {
        console.error('Error fetching ESXi connection by IP:', error);
        throw error;
    }
};

// Update connection status
export const updateConnectionStatus = async (ip_address, status, user_id = null) => {
    try {
        let query = `UPDATE esxi_connections 
                     SET status = ?, updated_at = NOW(), last_seen = NOW()
                     WHERE ip_address = ?`;
        const params = [status, ip_address];
        
        // Add user filter if provided
        if (user_id) {
            query += ' AND user_id = ?';
            params.push(user_id);
        }
        
        const [result] = await db.query(query, params);
        
        return { 
            success: result.affectedRows > 0,
            message: result.affectedRows > 0 ? 'Status updated' : 'No connection found'
        };
    } catch (error) {
        console.error('Error updating connection status:', error);
        throw error;
    }
};

// Delete ESXi connection
export const deleteEsxiConnection = async (ip_address, user_id = null) => {
    try {
        let query = 'DELETE FROM esxi_connections WHERE ip_address = ?';
        const params = [ip_address];
        
        // Add user filter if provided
        if (user_id) {
            query += ' AND user_id = ?';
            params.push(user_id);
        }
        
        const [result] = await db.query(query, params);
        
        return { 
            success: result.affectedRows > 0,
            message: result.affectedRows > 0 ? 'Connection deleted' : 'No connection found'
        };
    } catch (error) {
        console.error('Error deleting ESXi connection:', error);
        throw error;
    }
};

// Mark connection as installed
export const markAsInstalled = async (ip_address, user_id = null) => {
    try {
        let query = `UPDATE esxi_connections 
                     SET status = 'installed', updated_at = NOW()
                     WHERE ip_address = ?`;
        const params = [ip_address];
        
        // Add user filter if provided
        if (user_id) {
            query += ' AND user_id = ?';
            params.push(user_id);
        }
        
        const [result] = await db.query(query, params);
        
        return { 
            success: result.affectedRows > 0,
            message: 'Marked as installed'
        };
    } catch (error) {
        console.error('Error marking as installed:', error);
        throw error;
    }
};
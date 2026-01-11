import db from './db.js';
import bcrypt from 'bcrypt';

class ESXiDB {
    static async addConnection(connectionData) {
        try {
            if(!connectionData.password){
                throw new Error('Password is required');
            }

            const saltRounds = 12;
            const hashedPassword = await bcrypt.hash(connectionData.password, saltRounds);
            
            const sql = `
            INSERT INTO esxi_connections
            (connection_name, ip_address, username, password, status, installation_type) VALUES (?, ?, ?, ?, ?, ?)`;
            
            const values = [
                connectionData.connection_name || 'ESXi-${connectionData.ip}',
                connectionData.ip,
                connectionData.username || 'root',
                hashedPassword,
                connectionData.gateway || null,
                connectionData.subnet_mask || '255.255.255.0',
                connectionData.status || 'connected',
                connectionData.installation_type || 'existing'
            ];
            const [result] = await db.execute(sql, values);

            console.log(`ESXi connection added with ID: ${result.insertId}`);

            const [rows] = await db.execute(
                'SELECT id, connection_name, ip_address, username, status, installation_type, created_at FROM esxi_connectionx WHERE id = ?',
                [result.insertId]
            );

            return {
                success: true,
                connection_id: result.insertId,
                connection: rows[0]
            };
        } catch (error) {
            console.error('Error adding ESXi connection:', error.message);

            if(error.code === 'ER_DUP_ENTRY') {
                return {
                    success: false,
                    error: 'IP address already exists in database'
                };
            }
            return {
                success: false,
                error: error.message
            };
        }
    }
    static async updateLastSeen(connectionId) {
        try {
            await db.execute(
                'UPDATE esxi_connections SET last_seen = NOW() WHERE id = ?', [connectionId]
            );
            return { success: true }; 
        } catch (error) {
            console.error('Error updating last seen:', error.message);
            return { success: false, error: error.message };
        }
    }
}
export default ESXiDB;
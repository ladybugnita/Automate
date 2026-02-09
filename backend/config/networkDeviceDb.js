import db from './db.js';

class NetworkDeviceDB {
    
    static async addDevice(deviceData, userId) {
        try {
            console.log('Adding network device to database:', {
                userId: userId,
                name: deviceData.name,
                ip: deviceData.ip,
                device_type: deviceData.device_type,
                vendor: deviceData.vendor
            });

            if (!userId) {
                throw new Error('User ID is required');
            }

            const deviceIp = deviceData.ip;
            if (!deviceIp) {
                throw new Error('IP address is required');
            }

            const [existingDevices] = await db.execute(
                'SELECT id FROM network_devices WHERE user_id = ? AND ip = ?',
                [userId, deviceIp]
            );

            if (existingDevices.length > 0) {
                return {
                    success: false,
                    error: 'A device with this IP address already exists for your account'
                };
            }

            const name = deviceData.name || `${deviceData.device_type || 'Device'}-${deviceIp}`;
            const deviceType = deviceData.device_type || 'other';
            const username = deviceData.username || 'admin';
            const password = deviceData.password || '';
            const vendor = deviceData.vendor || '';
            const status = deviceData.status || 'active';

            const sql = `
                INSERT INTO network_devices 
                (user_id, name, ip, device_type, username, password, vendor, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`;
            
            const values = [
                userId,
                name,
                deviceIp,
                deviceType,
                username,
                password,
                vendor,
                status
            ];
            
            console.log('Executing SQL with values:', [
                userId,
                name,
                deviceIp,
                deviceType,
                username,
                '***PASSWORD***',
                vendor,
                status
            ]);
            
            const [result] = await db.execute(sql, values);

            console.log(`Network device added with ID: ${result.insertId}`);

            const [rows] = await db.execute(
                `SELECT 
                    id,
                    user_id,
                    name,
                    ip,
                    device_type,
                    username,
                    password,
                    vendor,
                    status,
                    created_at,
                    updated_at
                FROM network_devices 
                WHERE id = ? AND user_id = ?`,
                [result.insertId, userId]
            );

            if (rows.length === 0) {
                throw new Error('Failed to retrieve saved device');
            }

            const savedDevice = rows[0];
            
            return {
                success: true,
                data: {
                    id: savedDevice.id,
                    user_id: savedDevice.user_id,
                    device_id: savedDevice.id,
                    name: savedDevice.name,
                    ip: savedDevice.ip,
                    device_type: savedDevice.device_type,
                    username: savedDevice.username,
                    password: savedDevice.password,
                    vendor: savedDevice.vendor,
                    status: savedDevice.status,
                    created_at: savedDevice.created_at,
                    updated_at: savedDevice.updated_at,
                    hasCompleteCredentials: true
                }
            };
            
        } catch (error) {
            console.error('Error adding network device:', error.message);
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

    static async getDevices(userId, includePassword = false) {
        try {
            const selectFields = includePassword 
                ? `id, user_id, name, ip, device_type, username, password, vendor, status, created_at, updated_at`
                : `id, user_id, name, ip, device_type, username, vendor, status, created_at, updated_at`;
            
            const sql = `
                SELECT ${selectFields}
                FROM network_devices 
                WHERE user_id = ?
                ORDER BY created_at DESC`;
            
            const [rows] = await db.execute(sql, [userId]);
            
            console.log(`Found ${rows.length} network devices for user ${userId}, includePassword: ${includePassword}`);
            
            const devices = rows.map(row => {
                const device = {
                    id: row.id,
                    user_id: row.user_id,
                    device_id: row.id,
                    name: row.name,
                    ip: row.ip,
                    device_type: row.device_type,
                    username: row.username,
                    vendor: row.vendor || '',
                    status: row.status,
                    created_at: row.created_at,
                    updated_at: row.updated_at
                };
                
                if (includePassword) {
                    device.password = row.password;
                    device.hasCompleteCredentials = !!(row.ip && row.username && row.password);
                } else {
                    device.hasCompleteCredentials = !!(row.ip && row.username && row.password);
                }
                
                return device;
            });
            
            return {
                success: true,
                devices: devices
            };
            
        } catch (error) {
            console.error('Error getting network devices:', error.message);
            return {
                success: false,
                error: error.message,
                devices: []
            };
        }
    }

    static async getDeviceById(deviceId, userId = null, includePassword = false) {
        try {
            const selectFields = includePassword 
                ? `id, user_id, name, ip, device_type, username, password, vendor, status, created_at, updated_at`
                : `id, user_id, name, ip, device_type, username, vendor, status, created_at, updated_at`;
            
            let sql = `SELECT ${selectFields} FROM network_devices WHERE id = ?`;
            const params = [deviceId];
            
            if (userId) {
                sql += ' AND user_id = ?';
                params.push(userId);
            }
            
            const [rows] = await db.execute(sql, params);
            
            if (rows.length === 0) {
                return {
                    success: false,
                    error: 'Network device not found'
                };
            }
            
            const row = rows[0];
            const device = {
                id: row.id,
                user_id: row.user_id,
                device_id: row.id,
                name: row.name,
                ip: row.ip,
                device_type: row.device_type,
                username: row.username,
                vendor: row.vendor || '',
                status: row.status,
                created_at: row.created_at,
                updated_at: row.updated_at
            };
            
            if (includePassword) {
                device.password = row.password;
                device.hasCompleteCredentials = !!(row.ip && row.username && row.password);
            } else {
                device.hasCompleteCredentials = !!(row.ip && row.username && row.password);
            }
            
            return {
                success: true,
                device: device
            };
            
        } catch (error) {
            console.error('Error getting network device:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    static async updateDevice(deviceId, updateData, userId = null) {
        try {
            console.log('Updating network device:', {
                deviceId,
                userId,
                updateData: {
                    ...updateData,
                    password: updateData.password ? '***' : 'not provided'
                }
            });
            
            const fields = ['updated_at = NOW()'];
            const values = [];
            
            if (updateData.name !== undefined) {
                fields.push('name = ?');
                values.push(updateData.name);
            }
            
            if (updateData.ip !== undefined) {
                fields.push('ip = ?');
                values.push(updateData.ip);
            }
            
            if (updateData.device_type !== undefined) {
                fields.push('device_type = ?');
                values.push(updateData.device_type);
            }
            
            if (updateData.username !== undefined) {
                fields.push('username = ?');
                values.push(updateData.username);
            }
            
            if (updateData.password !== undefined) {
                fields.push('password = ?');
                values.push(updateData.password);
            }
            
            if (updateData.vendor !== undefined) {
                fields.push('vendor = ?');
                values.push(updateData.vendor);
            }
            
            if (updateData.status !== undefined) {
                fields.push('status = ?');
                values.push(updateData.status);
            }
            
            if (fields.length <= 1) {
                return {
                    success: false,
                    error: 'No data to update'
                };
            }
            
            let sql = `UPDATE network_devices SET ${fields.join(', ')} WHERE id = ?`;
            values.push(deviceId);
            
            if (userId) {
                sql += ' AND user_id = ?';
                values.push(userId);
            }
            
            const [result] = await db.execute(sql, values);
            
            if (result.affectedRows === 0) {
                return {
                    success: false,
                    error: 'Device not found or not authorized'
                };
            }
            
            return {
                success: true,
                message: 'Network device updated successfully',
                affectedRows: result.affectedRows
            };
            
        } catch (error) {
            console.error('Error updating network device:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    static async deleteDevice(deviceId, userId = null) {
        try {
            let sql = 'DELETE FROM network_devices WHERE id = ?';
            const params = [deviceId];
            
            if (userId) {
                sql += ' AND user_id = ?';
                params.push(userId);
            }
            
            const [result] = await db.execute(sql, params);
            
            if (result.affectedRows === 0) {
                return {
                    success: false,
                    error: 'Device not found or not authorized'
                };
            }
            
            return {
                success: true,
                message: 'Network device deleted successfully',
                affectedRows: result.affectedRows
            };
            
        } catch (error) {
            console.error('Error deleting network device:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    static async getDevicesByType(userId, deviceType = null) {
        try {
            let sql = `SELECT * FROM network_devices WHERE user_id = ?`;
            const params = [userId];
            
            if (deviceType) {
                sql += ' AND device_type = ?';
                params.push(deviceType);
            }
            
            sql += ' ORDER BY created_at DESC';
            
            const [rows] = await db.execute(sql, params);
            
            const devices = rows.map(row => ({
                id: row.id,
                user_id: row.user_id,
                device_id: row.id,
                name: row.name,
                ip: row.ip,
                device_type: row.device_type,
                username: row.username,
                vendor: row.vendor || '',
                status: row.status,
                created_at: row.created_at,
                updated_at: row.updated_at,
                hasCompleteCredentials: !!(row.ip && row.username && row.password)
            }));
            
            return {
                success: true,
                devices: devices,
                count: devices.length
            };
            
        } catch (error) {
            console.error('Error getting devices by type:', error.message);
            return {
                success: false,
                error: error.message,
                devices: []
            };
        }
    }

    static async getDevicesByStatus(userId, status = null) {
        try {
            let sql = `SELECT * FROM network_devices WHERE user_id = ?`;
            const params = [userId];
            
            if (status) {
                sql += ' AND status = ?';
                params.push(status);
            }
            
            sql += ' ORDER BY created_at DESC';
            
            const [rows] = await db.execute(sql, params);
            
            const devices = rows.map(row => ({
                id: row.id,
                user_id: row.user_id,
                device_id: row.id,
                name: row.name,
                ip: row.ip,
                device_type: row.device_type,
                username: row.username,
                vendor: row.vendor || '',
                status: row.status,
                created_at: row.created_at,
                updated_at: row.updated_at,
                hasCompleteCredentials: !!(row.ip && row.username && row.password)
            }));
            
            return {
                success: true,
                devices: devices,
                count: devices.length
            };
            
        } catch (error) {
            console.error('Error getting devices by status:', error.message);
            return {
                success: false,
                error: error.message,
                devices: []
            };
        }
    }
}

export default NetworkDeviceDB;
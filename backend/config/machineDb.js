import db from './db.js';

class MachineDB {
    
    static async addMachine(machineData, userId) {
        try {
            console.log('Adding machine to database:', {
                userId: userId,
                name: machineData.name,
                ip: machineData.ip,
                username: machineData.username,
                os_type: machineData.os_type,
                sub_os_type: machineData.sub_os_type,
                marked_as: machineData.marked_as
            });

            if (!userId) {
                throw new Error('User ID is required');
            }

            const machineIp = machineData.ip;
            if (!machineIp) {
                throw new Error('IP address is required');
            }

            const [existingMachines] = await db.execute(
                'SELECT id FROM machine_info WHERE user_id = ? AND ip = ?',
                [userId, machineIp]
            );

            if (existingMachines.length > 0) {
                return {
                    success: false,
                    error: 'A machine with this IP address already exists for your account'
                };
            }

            const name = machineData.name || `Machine-${machineIp}`;
            const username = machineData.username || 'Administrator';
            const password = machineData.password || '';
            const user = machineData.user || 'Unknown';
            const os_type = machineData.os_type || null;
            const sub_os_type = machineData.sub_os_type || null;
            
            const markedAs = machineData.marked_as ? JSON.stringify(machineData.marked_as) : null;

            const sql = `
                INSERT INTO machine_info 
                (user_id, name, ip, username, password, user, os_type, sub_os_type, marked_as, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`;
            
            const values = [
                userId,
                name,
                machineIp,
                username,
                password,
                user,
                os_type,
                sub_os_type,
                markedAs
            ];
            
            console.log('Executing SQL with values:', [
                userId,
                name,
                machineIp,
                username,
                '***PASSWORD***',
                user,
                os_type,
                sub_os_type,
                markedAs ? '***MARKED_AS***' : null
            ]);
            
            const [result] = await db.execute(sql, values);

            console.log(`Machine added with ID: ${result.insertId}`);

            const [rows] = await db.execute(
                `SELECT 
                    id,
                    user_id,
                    name,
                    ip,
                    username,
                    password,
                    user,
                    os_type,
                    sub_os_type,
                    marked_as,
                    created_at,
                    updated_at
                FROM machine_info 
                WHERE id = ? AND user_id = ?`,
                [result.insertId, userId]
            );

            if (rows.length === 0) {
                throw new Error('Failed to retrieve saved machine');
            }

            const savedMachine = rows[0];
            
            const parsedMarkedAs = this.parseMarkedAs(savedMachine.marked_as);
            
            return {
                success: true,
                data: {
                    id: savedMachine.id,
                    user_id: savedMachine.user_id,
                    machine_id: savedMachine.id,
                    name: savedMachine.name,
                    ip: savedMachine.ip,
                    username: savedMachine.username,
                    password: savedMachine.password,
                    user: savedMachine.user,
                    os_type: savedMachine.os_type,
                    sub_os_type: savedMachine.sub_os_type,
                    marked_as: parsedMarkedAs,
                    created_at: savedMachine.created_at,
                    updated_at: savedMachine.updated_at,
                    hasCompleteCredentials: true
                }
            };
            
        } catch (error) {
            console.error('Error adding machine:', error.message);
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

    static parseMarkedAs(markedAsValue) {
        if (!markedAsValue) {
            return [];
        }
        
        try {
            if (typeof markedAsValue === 'string') {
                if (markedAsValue.trim() === '' || markedAsValue === 'null') {
                    return [];
                }
                return JSON.parse(markedAsValue);
            }
            else if (typeof markedAsValue === 'object') {
                return Array.isArray(markedAsValue) ? markedAsValue : [markedAsValue];
            }
            else {
                console.warn('Unexpected marked_as type:', typeof markedAsValue, markedAsValue);
                return [];
            }
        } catch (error) {
            console.error('Error parsing marked_as:', error);
            console.error('Value that caused error:', markedAsValue);
            return [];
        }
    }

    static async getMachines(userId, includePassword = false) {
        try {
            const selectFields = includePassword 
                ? `id, user_id, name, ip, username, password, user, os_type, sub_os_type, marked_as, created_at, updated_at`
                : `id, user_id, name, ip, username, user, os_type, sub_os_type, marked_as, created_at, updated_at`;
            
            const sql = `
                SELECT ${selectFields}
                FROM machine_info 
                WHERE user_id = ?
                ORDER BY created_at DESC`;
            
            const [rows] = await db.execute(sql, [userId]);
            
            console.log(`Found ${rows.length} machines for user ${userId}, includePassword: ${includePassword}`);
            
            const machines = rows.map(row => {
                const parsedMarkedAs = this.parseMarkedAs(row.marked_as);
                
                const machine = {
                    id: row.id,
                    user_id: row.user_id,
                    machine_id: row.id,
                    name: row.name,
                    ip: row.ip,
                    username: row.username || 'Administrator',
                    user: row.user || 'Unknown',
                    os_type: row.os_type,
                    sub_os_type: row.sub_os_type,
                    marked_as: parsedMarkedAs,  
                    created_at: row.created_at,
                    updated_at: row.updated_at
                };
                
                if (includePassword) {
                    machine.password = row.password;
                    machine.hasCompleteCredentials = !!(row.ip && row.username && row.password);
                } else {
                    machine.hasCompleteCredentials = !!(row.ip && row.username && row.password);
                }
                
                return machine;
            });
            
            return {
                success: true,
                machines: machines
            };
            
        } catch (error) {
            console.error('Error getting machines:', error.message);
            console.error('Error stack:', error.stack);
            return {
                success: false,
                error: error.message,
                machines: []
            };
        }
    }

    static async getMachineById(machineId, userId = null, includePassword = false) {
        try {
            const selectFields = includePassword 
                ? `id, user_id, name, ip, username, password, user, os_type, sub_os_type, marked_as, created_at, updated_at`
                : `id, user_id, name, ip, username, user, os_type, sub_os_type, marked_as, created_at, updated_at`;
            
            let sql = `SELECT ${selectFields} FROM machine_info WHERE id = ?`;
            const params = [machineId];
            
            if (userId) {
                sql += ' AND user_id = ?';
                params.push(userId);
            }
            
            const [rows] = await db.execute(sql, params);
            
            if (rows.length === 0) {
                return {
                    success: false,
                    error: 'Machine not found'
                };
            }
            
            const row = rows[0];
            
            const parsedMarkedAs = this.parseMarkedAs(row.marked_as);
            
            const machine = {
                id: row.id,
                user_id: row.user_id,
                machine_id: row.id,
                name: row.name,
                ip: row.ip,
                username: row.username || 'Administrator',
                user: row.user || 'Unknown',
                os_type: row.os_type,
                sub_os_type: row.sub_os_type,
                marked_as: parsedMarkedAs,  
                created_at: row.created_at,
                updated_at: row.updated_at
            };
            
            if (includePassword) {
                machine.password = row.password;
                machine.hasCompleteCredentials = !!(row.ip && row.username && row.password);
            } else {
                machine.hasCompleteCredentials = !!(row.ip && row.username && row.password);
            }
            
            return {
                success: true,
                machine: machine
            };
            
        } catch (error) {
            console.error('Error getting machine:', error.message);
            console.error('Error stack:', error.stack);
            return {
                success: false,
                error: error.message
            };
        }
    }

    static async updateMachine(machineId, updateData, userId = null) {
        try {
            console.log('Updating machine:', {
                machineId,
                userId,
                updateData: {
                    ...updateData,
                    password: updateData.password ? '***' : 'not provided',
                    os_type: updateData.os_type || 'not provided',
                    sub_os_type: updateData.sub_os_type || 'not provided',
                    marked_as: updateData.marked_as ? '***MARKED_AS***' : 'not provided'
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
            
            if (updateData.username !== undefined) {
                fields.push('username = ?');
                values.push(updateData.username);
            }
            
            if (updateData.password !== undefined) {
                fields.push('password = ?');
                values.push(updateData.password);
            }
            
            if (updateData.user !== undefined) {
                fields.push('user = ?');
                values.push(updateData.user);
            }
            
            if (updateData.os_type !== undefined) {
                fields.push('os_type = ?');
                values.push(updateData.os_type);
            }
            
            if (updateData.sub_os_type !== undefined) {
                fields.push('sub_os_type = ?');
                values.push(updateData.sub_os_type);
            }
            
            if (updateData.marked_as !== undefined) {
                const markedAsString = updateData.marked_as ? JSON.stringify(updateData.marked_as) : null;
                fields.push('marked_as = ?');
                values.push(markedAsString);
            }
            
            if (fields.length <= 1) {
                return {
                    success: false,
                    error: 'No data to update'
                };
            }
            
            let sql = `UPDATE machine_info SET ${fields.join(', ')} WHERE id = ?`;
            values.push(machineId);
            
            if (userId) {
                sql += ' AND user_id = ?';
                values.push(userId);
            }
            
            console.log('Update SQL:', sql);
            console.log('Update values:', values);
            
            const [result] = await db.execute(sql, values);
            
            if (result.affectedRows === 0) {
                return {
                    success: false,
                    error: 'Machine not found or not authorized'
                };
            }
            
            return {
                success: true,
                message: 'Machine updated successfully',
                affectedRows: result.affectedRows
            };
            
        } catch (error) {
            console.error('Error updating machine:', error.message);
            console.error('Error stack:', error.stack);
            return {
                success: false,
                error: error.message
            };
        }
    }

    static async deleteMachine(machineId, userId = null) {
        try {
            let sql = 'DELETE FROM machine_info WHERE id = ?';
            const params = [machineId];
            
            if (userId) {
                sql += ' AND user_id = ?';
                params.push(userId);
            }
            
            const [result] = await db.execute(sql, params);
            
            if (result.affectedRows === 0) {
                return {
                    success: false,
                    error: 'Machine not found or not authorized'
                };
            }
            
            return {
                success: true,
                message: 'Machine deleted successfully',
                affectedRows: result.affectedRows
            };
            
        } catch (error) {
            console.error('Error deleting machine:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    static async markMachine(machineId, marks, userId = null) {
        try {
            console.log('Marking machine:', {
                machineId,
                userId,
                marks
            });
            
            const validRoles = ['dhcp', 'dns', 'ad'];
            const validTypes = {
                'dhcp': ['primary', 'secondary'],
                'dns': ['primary', 'secondary'],
                'ad': ['primary']
            };
            
            for (const mark of marks) {
                const role = mark.role;
                const type = mark.type;
                
                if (!validRoles.includes(role)) {
                    return {
                        success: false,
                        error: `Invalid role: ${role}`
                    };
                }
                
                if (!validTypes[role]?.includes(type)) {
                    return {
                        success: false,
                        error: `Invalid type '${type}' for role '${role}'`
                    };
                }
            }
            
            const machineResult = await this.getMachineById(machineId, userId, false);
            if (!machineResult.success) {
                return machineResult;
            }
            
            const currentMachine = machineResult.machine;
            const currentMarks = currentMachine.marked_as || [];
            
            const updatedMarks = [...currentMarks];
            for (const newMark of marks) {
                const exists = updatedMarks.some(
                    m => m.role === newMark.role && m.type === newMark.type
                );
                if (!exists) {
                    updatedMarks.push(newMark);
                }
            }
            
            console.log('Updated marks for machine:', {
                machineId,
                currentMarks,
                newMarks: marks,
                updatedMarks
            });
            
            const updateResult = await this.updateMachine(machineId, { marked_as: updatedMarks }, userId);
            
            if (!updateResult.success) {
                return updateResult;
            }
            
            const updatedMachineResult = await this.getMachineById(machineId, userId, false);
            
            return {
                success: true,
                message: 'Machine marked successfully',
                machine: updatedMachineResult.success ? updatedMachineResult.machine : null,
                marks: updatedMarks
            };
            
        } catch (error) {
            console.error('Error marking machine:', error.message);
            console.error('Error stack:', error.stack);
            return {
                success: false,
                error: error.message
            };
        }
    }

    static async unmarkMachine(machineId, userId = null) {
        try {
            console.log('Unmarking machine:', {
                machineId,
                userId
            });
            
            const updateResult = await this.updateMachine(machineId, { marked_as: [] }, userId);
            
            if (!updateResult.success) {
                return updateResult;
            }
            
            return {
                success: true,
                message: 'Machine unmarked successfully',
                affectedRows: updateResult.affectedRows
            };
            
        } catch (error) {
            console.error('Error unmarking machine:', error.message);
            console.error('Error stack:', error.stack);
            return {
                success: false,
                error: error.message
            };
        }
    }

    static async getMarkedMachines(userId, role = null, includePassword = false) {
        try {
            const machinesResult = await this.getMachines(userId, includePassword);
            if (!machinesResult.success) {
                return machinesResult;
            }
            
            const allMachines = machinesResult.machines;
            let markedMachines = [];
            
            if (role) {
                markedMachines = allMachines.filter(machine => {
                    return machine.marked_as?.some(mark => mark.role === role);
                });
            } else {
                markedMachines = allMachines.filter(machine => {
                    return machine.marked_as && machine.marked_as.length > 0;
                });
            }
            
            console.log(`getMarkedMachines: Found ${markedMachines.length} marked machines for user ${userId}, includePassword: ${includePassword}`);
            
            if (markedMachines.length > 0) {
                console.log('Sample marked machine:', {
                    id: markedMachines[0].id,
                    name: markedMachines[0].name,
                    ip: markedMachines[0].ip,
                    os_type: markedMachines[0].os_type,
                    sub_os_type: markedMachines[0].sub_os_type,
                    hasPassword: includePassword ? !!(markedMachines[0].password) : 'not requested',
                    marked_as: markedMachines[0].marked_as
                });
            }
            
            return {
                success: true,
                machines: markedMachines,
                count: markedMachines.length
            };
            
        } catch (error) {
            console.error('Error getting marked machines:', error.message);
            console.error('Error stack:', error.stack);
            return {
                success: false,
                error: error.message,
                machines: []
            };
        }
    }

    static async getMachinesForEventViewer(userId) {
        try {
            console.log(`Getting machines for Event Viewer for user ${userId}`);
            
            const machinesResult = await this.getMachines(userId, true);
            if (!machinesResult.success) {
                return machinesResult;
            }
            
            const allMachines = machinesResult.machines;
            
            const markedMachines = allMachines.filter(machine => {
                return machine.marked_as && machine.marked_as.length > 0;
            });
            
            const machinesWithPasswords = markedMachines.filter(machine => {
                const hasPassword = !!(machine.password);
                if (!hasPassword) {
                    console.warn(`Machine ${machine.name} (${machine.ip}) is marked but has no password`);
                }
                return hasPassword;
            });
            
            console.log(`Event Viewer: ${markedMachines.length} marked machines, ${machinesWithPasswords.length} have passwords`);
            
            const machinesWithoutPasswords = markedMachines.filter(machine => !machine.password);
            
            return {
                success: true,
                machines: markedMachines,  
                machinesWithPasswords: machinesWithPasswords,
                machinesWithoutPasswords: machinesWithoutPasswords,
                totalMarked: markedMachines.length,
                withPasswords: machinesWithPasswords.length,
                withoutPasswords: machinesWithoutPasswords.length
            };
        } catch (error) {
            console.error('Error getting machines for Event Viewer:', error.message);
            console.error('Error stack:', error.stack);
            return {
                success: false,
                error: error.message,
                machines: []
            };
        }
    }
}

export default MachineDB;
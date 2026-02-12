import express from 'express';
import jwt from 'jsonwebtoken';
import MachineDB from '../config/machineDb.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "secretkey123";

const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    let token;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.slice(7);
    } else {
        token = req.query.token || req.body.token;
    }
    
    if (!token) {
        return res.status(401).json({ 
            success: false,
            error: 'Access token required' 
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        console.log('Token verified for user:', { id: decoded.id, username: decoded.username });
        next();
    } catch (err) {
        console.error('Token verification error:', err.message);
        return res.status(401).json({ 
            success: false,
            error: 'Invalid token' 
        });
    }
};

router.post('/add-machine', verifyToken, async (req, res) => {
    try {
        const { 
            name, 
            ip, 
            username = 'Administrator',
            password, 
            user = 'Unknown',
            os_type = null,
            sub_os_type = null,
            marked_as = []
        } = req.body;

        console.log('Add machine request:', {
            user_id: req.user.id,
            username: req.user.username,
            name,
            ip,
            username_provided: username,
            password_length: password ? password.length : 0,
            os_type,
            sub_os_type,
            marked_as
        });

        if (!ip) {
            return res.status(400).json({ 
                success: false,
                error: 'IP address is required' 
            });
        }

        let finalOsType = os_type;
        let finalSubOsType = sub_os_type;
        
        if (os_type && !sub_os_type) {
            if (os_type === 'windows') {
                finalSubOsType = 'Windows Server 2022'; 
            } else if (os_type === 'linux') {
                finalSubOsType = 'Ubuntu'; 
            }
        }

        const result = await MachineDB.addMachine({
            name,
            ip,
            username,
            password,
            user,
            os_type: finalOsType,
            sub_os_type: finalSubOsType,
            marked_as
        }, req.user.id);

        if (!result.success) {
            return res.status(result.error?.includes('already exists') ? 409 : 400).json({
                success: false,
                error: result.error
            });
        }

        res.json({
            success: true,
            data: result.data,
            message: 'Machine added successfully'
        });

    } catch (error) {
        console.error('Error in add-machine:', error);
        
        let statusCode = 500;
        let errorMessage = 'Failed to add machine';
        
        if (error.message.includes('already exists')) {
            statusCode = 409;
            errorMessage = error.message;
        } else if (error.message.includes('is required')) {
            statusCode = 400;
            errorMessage = error.message;
        }
        
        res.status(statusCode).json({ 
            success: false,
            error: errorMessage,
            details: error.message 
        });
    }
});

router.get('/get-machines', verifyToken, async (req, res) => {
    try {
        const includePassword = req.query.include_password === 'true' || true; 
        
        console.log('Getting machines for user:', {
            user_id: req.user.id,
            username: req.user.username,
            include_password: includePassword
        });
        
        const result = await MachineDB.getMachines(req.user.id, includePassword);
        
        if (!result.success) {
            return res.status(500).json({ 
                success: false,
                error: result.error || 'Failed to fetch machines'
            });
        }
        
        console.log(`Found ${result.machines.length} machines for user ${req.user.id}, includePassword: ${includePassword}`);
        
        if (result.machines.length > 0) {
            const sampleMachine = result.machines[0];
            console.log('Sample machine returned:', {
                id: sampleMachine.id,
                name: sampleMachine.name,
                ip: sampleMachine.ip,
                username: sampleMachine.username,
                os_type: sampleMachine.os_type,
                sub_os_type: sampleMachine.sub_os_type,
                hasPassword: !!(sampleMachine.password),
                marked_as: sampleMachine.marked_as,
                keys: Object.keys(sampleMachine)
            });
        }
        
        res.json({ 
            success: true, 
            machines: result.machines,
            count: result.machines.length,
            include_password: includePassword
        });
    } catch (error) {
        console.error('Error in get-machines:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch machines',
            details: error.message 
        });
    }
});

router.get('/get-machine/:machine_id', verifyToken, async (req, res) => {
    try {
        const { machine_id } = req.params;
        const includePassword = req.query.include_password === 'true';
        
        console.log('Getting machine by ID:', {
            machine_id,
            user_id: req.user.id,
            include_password: includePassword
        });
        
        const result = await MachineDB.getMachineById(machine_id, req.user.id, includePassword);
        
        if (!result.success) {
            return res.status(404).json({ 
                success: false,
                error: result.error || 'Machine not found'
            });
        }
        
        res.json({ 
            success: true, 
            machine: result.machine
        });
    } catch (error) {
        console.error('Error in get-machine:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch machine',
            details: error.message 
        });
    }
});

router.put('/update-machine/:machine_id', verifyToken, async (req, res) => {
    try {
        const { machine_id } = req.params;
        const updateData = req.body;

        console.log('Updating machine:', {
            machine_id,
            user_id: req.user.id,
            updateData: {
                ...updateData,
                password: updateData.password ? '***' : 'not provided',
                os_type: updateData.os_type || 'not provided',
                sub_os_type: updateData.sub_os_type || 'not provided'
            }
        });

        const result = await MachineDB.updateMachine(machine_id, updateData, req.user.id);
        
        if (!result.success) {
            return res.status(404).json({
                success: false,
                error: result.error || 'Failed to update machine'
            });
        }
        
        res.json({
            success: true,
            message: result.message || 'Machine updated successfully',
            affectedRows: result.affectedRows
        });
    } catch (error) {
        console.error('Error in update-machine:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to update machine',
            details: error.message 
        });
    }
});

router.delete('/delete-machine/:machine_id', verifyToken, async (req, res) => {
    try {
        const { machine_id } = req.params;
        
        console.log('Deleting machine:', {
            machine_id,
            user_id: req.user.id
        });
        
        const result = await MachineDB.deleteMachine(machine_id, req.user.id);
        
        if (!result.success) {
            return res.status(404).json({
                success: false,
                error: result.error || 'Failed to delete machine'
            });
        }
        
        res.json({
            success: true,
            message: result.message || 'Machine deleted successfully',
            affectedRows: result.affectedRows
        });
    } catch (error) {
        console.error('Error in delete-machine:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to delete machine',
            details: error.message 
        });
    }
});

router.post('/mark-machine/:machine_id', verifyToken, async (req, res) => {
    try {
        const { machine_id } = req.params;
        const { marks } = req.body;

        console.log('Marking machine:', {
            machine_id,
            user_id: req.user.id,
            marks
        });

        if (!marks || !Array.isArray(marks)) {
            return res.status(400).json({ 
                success: false,
                error: 'Marks array is required' 
            });
        }

        const result = await MachineDB.markMachine(machine_id, marks, req.user.id);
        
        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: result.error || 'Failed to mark machine'
            });
        }
        
        res.json({
            success: true,
            message: result.message || 'Machine marked successfully',
            affectedRows: result.affectedRows
        });
    } catch (error) {
        console.error('Error in mark-machine:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to mark machine',
            details: error.message 
        });
    }
});

router.post('/unmark-machine/:machine_id', verifyToken, async (req, res) => {
    try {
        const { machine_id } = req.params;
        
        console.log('Unmarking machine:', {
            machine_id,
            user_id: req.user.id
        });
        
        const result = await MachineDB.unmarkMachine(machine_id, req.user.id);
        
        if (!result.success) {
            return res.status(404).json({
                success: false,
                error: result.error || 'Failed to unmark machine'
            });
        }
        
        res.json({
            success: true,
            message: result.message || 'Machine unmarked successfully',
            affectedRows: result.affectedRows
        });
    } catch (error) {
        console.error('Error in unmark-machine:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to unmark machine',
            details: error.message 
        });
    }
});

router.get('/get-marked-machines', verifyToken, async (req, res) => {
    try {
        const role = req.query.role || null;
        const includePassword = req.query.include_password === 'true' || true; 
        console.log('Getting marked machines:', {
            user_id: req.user.id,
            role,
            include_password: includePassword
        });
        
        const result = await MachineDB.getMarkedMachines(req.user.id, role, includePassword);
        
        if (!result.success) {
            return res.status(500).json({ 
                success: false,
                error: result.error || 'Failed to fetch marked machines'
            });
        }
        
        console.log(`Found ${result.count} marked machines for user ${req.user.id}`);
        
        if (result.machines && result.machines.length > 0) {
            const sampleMachine = result.machines[0];
            console.log('Sample marked machine returned:', {
                id: sampleMachine.id,
                name: sampleMachine.name,
                ip: sampleMachine.ip,
                os_type: sampleMachine.os_type,
                sub_os_type: sampleMachine.sub_os_type,
                hasPassword: !!(sampleMachine.password),
                marked_as: sampleMachine.marked_as
            });
        }
        
        res.json({ 
            success: true, 
            machines: result.machines,
            count: result.count,
            include_password: includePassword
        });
    } catch (error) {
        console.error('Error in get-marked-machines:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch marked machines',
            details: error.message 
        });
    }
});

router.get('/get-machines-with-passwords', verifyToken, async (req, res) => {
    try {
        console.log('Getting machines WITH PASSWORDS for Event Viewer:', {
            user_id: req.user.id,
            username: req.user.username
        });
        
        const result = await MachineDB.getMachines(req.user.id, true); 
        if (!result.success) {
            return res.status(500).json({ 
                success: false,
                error: result.error || 'Failed to fetch machines'
            });
        }
        
        console.log(`Found ${result.machines.length} machines with passwords for user ${req.user.id}`);
        
        if (result.machines.length > 0) {
            result.machines.forEach((machine, index) => {
                console.log(`Machine ${index + 1}:`, {
                    id: machine.id,
                    name: machine.name,
                    ip: machine.ip,
                    username: machine.username,
                    os_type: machine.os_type,
                    sub_os_type: machine.sub_os_type,
                    hasPassword: !!(machine.password),
                    passwordLength: machine.password ? machine.password.length : 0,
                    marked_as: machine.marked_as
                });
            });
        }
        
        res.json({ 
            success: true, 
            machines: result.machines,
            count: result.machines.length,
            message: 'Machines fetched with passwords'
        });
    } catch (error) {
        console.error('Error in get-machines-with-passwords:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch machines with passwords',
            details: error.message 
        });
    }
});

export default router;
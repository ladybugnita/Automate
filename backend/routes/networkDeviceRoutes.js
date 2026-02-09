import express from 'express';
import jwt from 'jsonwebtoken';
import NetworkDeviceDB from '../config/networkDeviceDb.js';

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

router.post('/add-network-device', verifyToken, async (req, res) => {
    try {
        const { 
            name, 
            ip, 
            device_type = 'other',
            username = 'admin',
            password, 
            vendor = '',
            status = 'active'
        } = req.body;

        console.log('Add network device request:', {
            user_id: req.user.id,
            username: req.user.username,
            name,
            ip,
            device_type,
            username_provided: username,
            password_length: password ? password.length : 0,
            vendor,
            status
        });

        if (!ip) {
            return res.status(400).json({ 
                success: false,
                error: 'IP address is required' 
            });
        }

        const result = await NetworkDeviceDB.addDevice({
            name,
            ip,
            device_type,
            username,
            password,
            vendor,
            status
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
            message: 'Network device added successfully'
        });

    } catch (error) {
        console.error('Error in add-network-device:', error);
        
        let statusCode = 500;
        let errorMessage = 'Failed to add network device';
        
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

router.get('/get-network-devices', verifyToken, async (req, res) => {
    try {
        const includePassword = req.query.include_password === 'true';
        
        console.log('Getting network devices for user:', {
            user_id: req.user.id,
            username: req.user.username,
            include_password: includePassword
        });
        
        const result = await NetworkDeviceDB.getDevices(req.user.id, includePassword);
        
        if (!result.success) {
            return res.status(500).json({ 
                success: false,
                error: result.error || 'Failed to fetch network devices'
            });
        }
        
        res.json({ 
            success: true, 
            devices: result.devices,
            network_devices: result.devices,
            data: result.devices,  
            count: result.devices.length,
            include_password: includePassword  
        });
    } catch (error) {
        console.error('Error in get-network-devices:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch network devices',
            details: error.message 
        });
    }
});

router.get('/get-network-device/:device_id', verifyToken, async (req, res) => {
    try {
        const { device_id } = req.params;
        const includePassword = req.query.include_password === 'true';
        
        console.log('Getting network device by ID:', {
            device_id,
            user_id: req.user.id,
            include_password: includePassword
        });
        
        const result = await NetworkDeviceDB.getDeviceById(device_id, req.user.id, includePassword);
        
        if (!result.success) {
            return res.status(404).json({ 
                success: false,
                error: result.error || 'Network device not found'
            });
        }
        
        res.json({ 
            success: true, 
            device: result.device
        });
    } catch (error) {
        console.error('Error in get-network-device:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch network device',
            details: error.message 
        });
    }
});

router.put('/update-network-device/:device_id', verifyToken, async (req, res) => {
    try {
        const { device_id } = req.params;
        const updateData = req.body;

        console.log('Updating network device:', {
            device_id,
            user_id: req.user.id,
            updateData: {
                ...updateData,
                password: updateData.password ? '***' : 'not provided'
            }
        });

        const result = await NetworkDeviceDB.updateDevice(device_id, updateData, req.user.id);
        
        if (!result.success) {
            return res.status(404).json({
                success: false,
                error: result.error || 'Failed to update network device'
            });
        }
        
        res.json({
            success: true,
            message: result.message || 'Network device updated successfully',
            affectedRows: result.affectedRows
        });
    } catch (error) {
        console.error('Error in update-network-device:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to update network device',
            details: error.message 
        });
    }
});

router.delete('/delete-network-device/:device_id', verifyToken, async (req, res) => {
    try {
        const { device_id } = req.params;
        
        console.log('Deleting network device:', {
            device_id,
            user_id: req.user.id
        });
        
        const result = await NetworkDeviceDB.deleteDevice(device_id, req.user.id);
        
        if (!result.success) {
            return res.status(404).json({
                success: false,
                error: result.error || 'Failed to delete network device'
            });
        }
        
        res.json({
            success: true,
            message: result.message || 'Network device deleted successfully',
            affectedRows: result.affectedRows
        });
    } catch (error) {
        console.error('Error in delete-network-device:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to delete network device',
            details: error.message 
        });
    }
});

router.get('/get-devices-by-type', verifyToken, async (req, res) => {
    try {
        const device_type = req.query.device_type || null;
        
        console.log('Getting devices by type:', {
            user_id: req.user.id,
            device_type
        });
        
        const result = await NetworkDeviceDB.getDevicesByType(req.user.id, device_type);
        
        if (!result.success) {
            return res.status(500).json({ 
                success: false,
                error: result.error || 'Failed to fetch devices by type'
            });
        }
        
        res.json({ 
            success: true, 
            devices: result.devices,
            count: result.count
        });
    } catch (error) {
        console.error('Error in get-devices-by-type:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch devices by type',
            details: error.message 
        });
    }
});

router.get('/get-devices-by-status', verifyToken, async (req, res) => {
    try {
        const status = req.query.status || null;
        
        console.log('Getting devices by status:', {
            user_id: req.user.id,
            status
        });
        
        const result = await NetworkDeviceDB.getDevicesByStatus(req.user.id, status);
        
        if (!result.success) {
            return res.status(500).json({ 
                success: false,
                error: result.error || 'Failed to fetch devices by status'
            });
        }
        
        res.json({ 
            success: true, 
            devices: result.devices,
            count: result.count
        });
    } catch (error) {
        console.error('Error in get-devices-by-status:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch devices by status',
            details: error.message 
        });
    }
});

export default router;
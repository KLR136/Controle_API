const express = require('express');
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');
const pool = require('../config/database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const router = express.Router();

router.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        if (!password) {
            return res.status(400).json({ error: 'Password is required' });
        }

        const [existingUsers] = await pool.execute(
            'SELECT id FROM users WHERE email = ?',
            [email]
        );

        if (existingUsers.length > 0) {
            return res.status(400).json({ error: 'Email already in use' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const [result] = await pool.execute(
            'INSERT INTO users (email, password) VALUES (?, ?)',
            [email, hashedPassword]
        );

        res.status(201).json({ message: 'User registered successfully', userId: result.insertId });
    } catch (error) {
        res.status(500).json({ error: 'Error during the creation of the account' });
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const platform = req.headers['x-platform'] || 'web';

        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }
        if (!password) {
            return res.status(400).json({ error: 'Password is required' });
        }

        const [users] = await pool.execute(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid identifiers' });
        }

        const user = users[0];

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid identifiers' });
        }

        let expiresIn;
        if (platform === 'kiosk') {
            expiresIn = '1h';
        } else {
            expiresIn = '30d';
        }

        const token = jwt.sign(
            { userId: user.id, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn }
        );

        const expiresAt = new Date();
        if (platform === 'kiosk') {
            expiresAt.setHours(expiresAt.getHours() + 1);
        } else {
            expiresAt.setDate(expiresAt.getDate() + 30);
        }

        await pool.execute(
            'INSERT INTO sessions (user_id, token, platform, expires_at) VALUES (?, ?, ?, ?)',
            [user.id, token, platform, expiresAt]
        );

        res.json({
            token,
            user: {
                id: user.id,
                email: user.email,
                role: user.role,
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Error during login' });
    }
});

router.post('/logout', authenticateToken, async (req, res) => {
    try {
        const token = req.headers['authorization'].split(' ')[1];
        await pool.execute('DELETE FROM sessions WHERE token = ?', [token]);
        res.json({ message: 'Logout successful' });
    } catch (error) {
        res.status(500).json({ error: 'Error during logout' });
    }
});

router.get('/verify', authenticateToken, (req, res) => {
    res.json({ message: 'Token is valid', user: req.user });
});

router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const [users] = await pool.execute(
            'SELECT id, email, role, created_at FROM users WHERE id = ?',
            [req.user.id]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({ user: users[0] });
    } catch (error) {
        res.status(500).json({ error: 'Error fetching user profile' });
    }
});

module.exports = router;
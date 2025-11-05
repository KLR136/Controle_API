const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { error } = require('console');
const { verify } = require('crypto');

const adminController = {
    register: async (req, res) => {
        try {
            const { email, password } = req.body;

            if (!email) {
                return res.status(400).json({ error: 'Email is required' });
            }
            if (!password) {
                return res.status(400).json({ error: 'Password is required' });
            }

            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                return res.status(400).json({
                    success: false,
                    error: 'Format d\'email invalide'
                });
            }

            const [existingUsers] = await pool.execute(
                'SELECT id FROM users WHERE email = ?',
                [email]
            );

            
            if (existingUsers.length > 0) {
                return res.status(409).json({
                    success: false,
                    error: 'Email already in use'
                });
            }

            const hashedPassword = await bcrypt.hash(password, 12);

            const [result] = await pool.execute(
                'INSERT INTO users (email, password) VALUES (?, ?)',
                [email, hashedPassword]
            );

            res.status(201).json({
                success: true,
                message: 'User registered successfully',
                data: { userId: result.insertId }
            });
        } catch (error) {
            console.error('Registration error:', error);
            res.status(500).json({
                success: false,
                error: 'Error during the creation of the account'
            });
        }
    },

    login: async (req, res) => {
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

            const user = users[0];

            const validPassword = await bcrypt.compare(password, user.password);
            if (!validPassword) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid identifiers'
                });
            }

            let expiresIn;
            if (platform === 'kiosk') {
                expiresIn = '1h';
            } else {
                expiresIn = '30d';
            }

            const token = jwt.sign(
                {
                    userId: user.id,
                    email: user.email,
                    role: user.role
                },
                process.env.JWT_SECRET || 'secret',
                { expiresIn}
            );

            const expiresAt = new Date();
            if (platform === 'kiosk') {
                expiresAt.setHours(expiresAt.getHours() + 1);
            } else {
                expiresAt.setDate(expiresAt.getDate() + 30);
            }

            await pool.execute(
                'DELETE FROM sessions WHERE user_id = ? AND expires_at < NOW()',
                [user.id]
            );

            await pool.execute(
                `INSERT INTO sessions (user_id, token, platform, expires_at)
                VALUES (?, ?, ?, ?)`,
                [user.id, token, platform, expiresAt]
            );

            res.json({
                success: true,
                message: 'Login successful',
                data: {
                    token,
                    user: {
                        id: user.id,
                        email: user.email,
                        role: user.role
                    }
                }
            });
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({
                success: false,
                error: 'Error during login'
            });
        }

        logout: async (req, res) => {
            try {
                const token = req.headers['authorization']?.split(' ')[1];
                await pool.execute('DELETE FROM sessions WHERE token = ?', [token]);
                res.json({
                    success: true,
                    message: 'Logout successful'
                });
            } catch (error) {
                console.error('Logout error:', error);
                res.status(500).json({
                    success: false,
                    error: 'Error during logout'
                });
            }
        }
    },

    verify: async (req, res) => {
        try {
            res.json({
                success: true,
                data: {
                    user: req.user
                }
            });
        } catch (error) {
            console.error('Verification error:', error);
            res.status(500).json({
                success: false,
                error: 'Error during verification'
            });
        }
    },

    getProfile: async (req, res) => {
        try {
            const [users] = await pool.execute(
                'SELECT id, email, role FROM users WHERE id = ?',
                [req.user.id]
            );

            if (users.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            res.json({
                success: true,
                data: {
                    user: users[0]
                }
            });
        } catch (error) {
            console.error('Get profile error:', error);
            res.status(500).json({
                success: false,
                error: 'Error during getting profile'
            });
        }
    }
};

module.exports = authController;

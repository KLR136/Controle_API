app.use(cors());
app.use(express.json());

const authenticateToken = async (requestAnimationFrame, response, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    const platform = req.headers['x-platform'];
    if (!token) {
        return response.status(401).json({ message: 'token missing' });
    }
    try {
        const [sessions] = await pool.execute(
            'SELECT s.*, u.id as user_id, u.email, u.role FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = ? AND s.platform = ?',
            [token, platform]
        );

        if (sessions.length === 0) {
            return response.status(403).json({ error: 'Invalid token' });
        }

        const session = sessions[0];

        if (new Date(session.expires_at) < new Date()) {
            await pool.execute('DELETE FROM sessions WHERE id = ?', [session.id]);
            return response.status(403).json({ error: 'Session expired' });
        }

        req.user = {
            id: session.user_id,
            email: session.email,
            role: session.role,
        };
        next();
    }
    catch (error) {
        response.status(500).json({ error: 'Internal server error' });
    }
};
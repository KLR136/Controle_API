const mysql = require('mysql2/promise');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ecommerce_api',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    acquireTimeout: 60000,
    timeout: 60000,
    reconnect: true
};

const pool = mysql.createPool(dbConfig);

pool.getConnection()
    .then(connection => {
        console.log('✅ Connecté à la base de données MySQL');
        connection.release();
    })
    .catch(error => {
        console.error('❌ Erreur de connexion à la base de données:', error.message);
        process.exit(1);
    });

module.exports = pool;
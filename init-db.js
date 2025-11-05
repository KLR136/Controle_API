const mysql = require('mysql2/promise');
require('dotenv').config();

async function initializeDatabase() {
    let connection;
    
    try {
        // Connexion à MySQL
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD
        });

        console.log('✅ Connecté à MySQL');

        // Créer la base de données
        await connection.execute(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME}`);
        console.log(`✅ Base de données '${process.env.DB_NAME}' créée`);

        // Fermer la connexion et se reconnecter à la base spécifique
        await connection.end();
        
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        console.log(`✅ Connecté à la base de données '${process.env.DB_NAME}'`);

        // Table users
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT PRIMARY KEY AUTO_INCREMENT,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role ENUM('customer', 'admin') DEFAULT 'customer',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Table users créée');

        // Table tags
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS tags (
                id INT PRIMARY KEY AUTO_INCREMENT,
                name VARCHAR(100) UNIQUE NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Table tags créée');

        // Table products
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS products (
                id INT PRIMARY KEY AUTO_INCREMENT,
                title VARCHAR(255) NOT NULL,
                price DECIMAL(10,2) NOT NULL,
                description TEXT,
                stock_quantity INT DEFAULT 0,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Table products créée');

        // Table product_tags
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS product_tags (
                product_id INT,
                tag_id INT,
                PRIMARY KEY (product_id, tag_id),
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
            )
        `);
        console.log('✅ Table product_tags créée');

        // Table carts
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS carts (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);
        console.log('✅ Table carts créée');

        // Table cart_items
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS cart_items (
                id INT PRIMARY KEY AUTO_INCREMENT,
                cart_id INT NOT NULL,
                product_id INT NOT NULL,
                quantity INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id),
                UNIQUE KEY unique_cart_product (cart_id, product_id)
            )
        `);
        console.log('✅ Table cart_items créée');

        // Table orders
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS orders (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                cart_id INT NOT NULL,
                shipping_address TEXT NOT NULL,
                total_amount DECIMAL(10,2) NOT NULL,
                status ENUM('pending', 'confirmed', 'shipped', 'delivered') DEFAULT 'pending',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (cart_id) REFERENCES carts(id)
            )
        `);
        console.log('✅ Table orders créée');

        // Table sessions
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS sessions (
                id INT PRIMARY KEY AUTO_INCREMENT,
                user_id INT NOT NULL,
                token VARCHAR(255) UNIQUE NOT NULL,
                platform ENUM('web', 'mobile', 'kiosk') NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        `);
        console.log('✅ Table sessions créée');

        console.log('🎉 Base de données initialisée avec succès !');

    } catch (error) {
        console.error('❌ Erreur:', error);
    } finally {
        if (connection) await connection.end();
    }
}

initializeDatabase();
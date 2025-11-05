const pool = require('../config/database');

class Product {
    // Créer un nouveau produit
    static async create(productData) {
        const { title, price, description, stock_quantity = 0, tags = [] } = productData;
        
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Insérer le produit
            const [result] = await connection.execute(
                'INSERT INTO products (title, price, description, stock_quantity) VALUES (?, ?, ?, ?)',
                [title, price, description, stock_quantity]
            );

            const productId = result.insertId;

            // Gérer les tags
            if (tags.length > 0) {
                await this._handleProductTags(connection, productId, tags);
            }

            await connection.commit();
            return await this.findById(productId);
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    // Trouver un produit par ID
    static async findById(id, includeInactive = false) {
        try {
            let query = `
                SELECT p.*, GROUP_CONCAT(t.name) as tags
                FROM products p
                LEFT JOIN product_tags pt ON p.id = pt.product_id
                LEFT JOIN tags t ON pt.tag_id = t.id
                WHERE p.id = ?
            `;

            if (!includeInactive) {
                query += ' AND p.is_active = TRUE';
            }

            query += ' GROUP BY p.id';

            const [products] = await pool.execute(query, [id]);

            if (products.length === 0) return null;

            return this._formatProduct(products[0]);
        } catch (error) {
            throw error;
        }
    }

    // Trouver tous les produits avec pagination et filtres
    static async findAll(filters = {}) {
        const {
            page = 1,
            limit = 10,
            tags = [],
            search = '',
            includeInactive = false,
            inStockOnly = true
        } = filters;

        const offset = (page - 1) * limit;

        try {
            let query = `
                SELECT p.*, GROUP_CONCAT(t.name) as tags,
                       COUNT(*) OVER() as total_count
                FROM products p
                LEFT JOIN product_tags pt ON p.id = pt.product_id
                LEFT JOIN tags t ON pt.tag_id = t.id
                WHERE 1=1
            `;

            const params = [];

            // Filtres
            if (!includeInactive) {
                query += ' AND p.is_active = TRUE';
            }

            if (inStockOnly) {
                query += ' AND p.stock_quantity > 0';
            }

            if (tags.length > 0) {
                query += ` AND t.name IN (${tags.map(() => '?').join(',')})`;
                params.push(...tags);
            }

            if (search) {
                query += ' AND (p.title LIKE ? OR p.description LIKE ?)';
                params.push(`%${search}%`, `%${search}%`);
            }

            query += ` GROUP BY p.id ORDER BY p.created_at DESC LIMIT ? OFFSET ?`;
            params.push(limit, offset);

            const [products] = await pool.execute(query, params);

            const total = products.length > 0 ? parseInt(products[0].total_count) : 0;

            return {
                products: products.map(product => this._formatProduct(product)),
                pagination: {
                    current: page,
                    total: Math.ceil(total / limit),
                    limit,
                    totalItems: total
                }
            };
        } catch (error) {
            throw error;
        }
    }

    // Mettre à jour un produit
    static async update(id, updateData) {
        const { title, price, description, stock_quantity, tags } = updateData;
        
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Mettre à jour le produit
            const [result] = await connection.execute(
                `UPDATE products 
                 SET title = ?, price = ?, description = ?, stock_quantity = ?, updated_at = NOW()
                 WHERE id = ?`,
                [title, price, description, stock_quantity, id]
            );

            if (result.affectedRows === 0) {
                throw new Error('Produit non trouvé');
            }

            // Mettre à jour les tags si fournis
            if (tags !== undefined) {
                await connection.execute('DELETE FROM product_tags WHERE product_id = ?', [id]);
                if (tags.length > 0) {
                    await this._handleProductTags(connection, id, tags);
                }
            }

            await connection.commit();
            return await this.findById(id, true);
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    // Supprimer un produit (désactivation)
    static async delete(id) {
        try {
            const [result] = await pool.execute(
                'UPDATE products SET is_active = FALSE WHERE id = ?',
                [id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw error;
        }
    }

    // Mettre à jour le stock
    static async updateStock(id, newQuantity) {
        try {
            const [result] = await pool.execute(
                'UPDATE products SET stock_quantity = ? WHERE id = ? AND is_active = TRUE',
                [newQuantity, id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw error;
        }
    }

    // Décrémenter le stock
    static async decrementStock(id, quantity) {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            const [result] = await connection.execute(
                `UPDATE products 
                 SET stock_quantity = stock_quantity - ? 
                 WHERE id = ? AND stock_quantity >= ? AND is_active = TRUE`,
                [quantity, id, quantity]
            );

            await connection.commit();
            return result.affectedRows > 0;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    // Incrémenter le stock
    static async incrementStock(id, quantity) {
        try {
            const [result] = await pool.execute(
                'UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ? AND is_active = TRUE',
                [quantity, id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw error;
        }
    }

    // Récupérer les produits populaires
    static async getFeaturedProducts(limit = 8) {
        try {
            const [products] = await pool.execute(
                `SELECT p.*, GROUP_CONCAT(t.name) as tags
                 FROM products p
                 LEFT JOIN product_tags pt ON p.id = pt.product_id
                 LEFT JOIN tags t ON pt.tag_id = t.id
                 WHERE p.stock_quantity > 0 AND p.is_active = TRUE
                 GROUP BY p.id
                 ORDER BY p.stock_quantity DESC, p.created_at DESC
                 LIMIT ?`,
                [limit]
            );

            return products.map(product => this._formatProduct(product));
        } catch (error) {
            throw error;
        }
    }

    // Vérifier la disponibilité du stock
    static async checkStockAvailability(productId, requestedQuantity) {
        try {
            const [products] = await pool.execute(
                'SELECT stock_quantity FROM products WHERE id = ? AND is_active = TRUE',
                [productId]
            );

            if (products.length === 0) {
                return { available: false, currentStock: 0 };
            }

            const currentStock = products[0].stock_quantity;
            return {
                available: currentStock >= requestedQuantity,
                currentStock
            };
        } catch (error) {
            throw error;
        }
    }

    // Méthodes privées

    static async _handleProductTags(connection, productId, tags) {
        for (const tagName of tags) {
            let [tagResult] = await connection.execute(
                'SELECT id FROM tags WHERE name = ?',
                [tagName.trim()]
            );

            let tagId;
            if (tagResult.length === 0) {
                const [newTag] = await connection.execute(
                    'INSERT INTO tags (name) VALUES (?)',
                    [tagName.trim()]
                );
                tagId = newTag.insertId;
            } else {
                tagId = tagResult[0].id;
            }

            await connection.execute(
                'INSERT INTO product_tags (product_id, tag_id) VALUES (?, ?)',
                [productId, tagId]
            );
        }
    }

    static _formatProduct(product) {
        return { 
            id: product.id,
            title: product.title,
            price: parseFloat(product.price),
            description: product.description,
            stock_quantity: product.stock_quantity,
            is_active: Boolean(product.is_active),
            tags: product.tags ? product.tags.split(',') : [],
            created_at: product.created_at,
            updated_at: product.updated_at
        };
    }
}

module.exports = Product;
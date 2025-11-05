const pool = require('../config/database');

class Tag {
    // Créer un nouveau tag
    static async create(name) {
        try {
            const [result] = await pool.execute(
                'INSERT INTO tags (name) VALUES (?)',
                [name.trim()]
            );
            return { id: result.insertId, name: name.trim() };
        } catch (error) {
            throw error;
        }
    }

    // Trouver un tag par ID
    static async findById(id) {
        try {
            const [tags] = await pool.execute(
                'SELECT * FROM tags WHERE id = ?',
                [id]
            );
            return tags.length > 0 ? tags[0] : null;
        } catch (error) {
            throw error;
        }
    }

    // Trouver un tag par nom
    static async findByName(name) {
        try {
            const [tags] = await pool.execute(
                'SELECT * FROM tags WHERE name = ?',
                [name.trim()]
            );
            return tags.length > 0 ? tags[0] : null;
        } catch (error) {
            throw error;
        }
    }

    // Récupérer tous les tags
    static async findAll(page = 1, limit = 50) {
        try {
            const offset = (page - 1) * limit;

            const [tags] = await pool.execute(
                `SELECT t.*, COUNT(pt.product_id) as product_count,
                        COUNT(*) OVER() as total_count
                 FROM tags t
                 LEFT JOIN product_tags pt ON t.id = pt.tag_id
                 GROUP BY t.id
                 ORDER BY t.name
                 LIMIT ? OFFSET ?`,
                [limit, offset]
            );

            const total = tags.length > 0 ? parseInt(tags[0].total_count) : 0;

            return {
                tags,
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

    // Récupérer les tags les plus populaires
    static async findPopular(limit = 10) {
        try {
            const [tags] = await pool.execute(
                `SELECT t.*, COUNT(pt.product_id) as product_count
                 FROM tags t
                 LEFT JOIN product_tags pt ON t.id = pt.tag_id
                 LEFT JOIN products p ON pt.product_id = p.id AND p.is_active = TRUE
                 GROUP BY t.id
                 ORDER BY product_count DESC, t.name
                 LIMIT ?`,
                [limit]
            );

            return tags;
        } catch (error) {
            throw error;
        }
    }

    // Mettre à jour un tag
    static async update(id, newName) {
        try {
            const [result] = await pool.execute(
                'UPDATE tags SET name = ? WHERE id = ?',
                [newName.trim(), id]
            );
            return result.affectedRows > 0;
        } catch (error) {
            throw error;
        }
    }

    // Supprimer un tag
    static async delete(id) {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Vérifier si le tag est utilisé
            const [usedTags] = await connection.execute(
                'SELECT COUNT(*) as count FROM product_tags WHERE tag_id = ?',
                [id]
            );

            if (usedTags[0].count > 0) {
                throw new Error('Impossible de supprimer un tag utilisé par des produits');
            }

            const [result] = await connection.execute(
                'DELETE FROM tags WHERE id = ?',
                [id]
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

    // Récupérer les produits associés à un tag
    static async getProducts(tagId, page = 1, limit = 10) {
        try {
            const offset = (page - 1) * limit;

            const [products] = await pool.execute(
                `SELECT p.*, GROUP_CONCAT(t.name) as tags
                 FROM products p
                 JOIN product_tags pt ON p.id = pt.product_id
                 LEFT JOIN product_tags pt2 ON p.id = pt2.product_id
                 LEFT JOIN tags t ON pt2.tag_id = t.id
                 WHERE pt.tag_id = ? AND p.is_active = TRUE
                 GROUP BY p.id
                 ORDER BY p.created_at DESC
                 LIMIT ? OFFSET ?`,
                [tagId, limit, offset]
            );

            const [countResult] = await pool.execute(
                'SELECT COUNT(*) as total FROM product_tags WHERE tag_id = ?',
                [tagId]
            );

            const total = countResult[0].total;

            return {
                products: products.map(product => ({
                    ...product,
                    tags: product.tags ? product.tags.split(',') : [],
                    price: parseFloat(product.price)
                })),
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

    // Vérifier si un tag existe déjà
    static async exists(name, excludeId = null) {
        try {
            let query = 'SELECT id FROM tags WHERE name = ?';
            const params = [name.trim()];

            if (excludeId) {
                query += ' AND id != ?';
                params.push(excludeId);
            }

            const [tags] = await pool.execute(query, params);
            return tags.length > 0;
        } catch (error) {
            throw error;
        }
    }
}

module.exports = Tag;
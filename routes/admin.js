const express = require('express');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const pool = require('../config/database');

const router = express.Router();

router.get('/products', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;  

        const [products] = await pool.execute(
            `SELECT p.*, GROUP_CONCAT(t.name) as tags
            FROM products p
            LEFT JOIN product_tags pt ON p.id = pt.product_id
            LEFT JOIN tags t ON pt.tag_id = t.id
            GROUP BY p.id
            LIMIT ? OFFSET ?`,
            [limit, offset]
        );

        const [countResult] = await pool.execute(
            'SELECT COUNT(*) as total FROM products'
        );
        const total = countResult[0].total;
        const totalPages = Math.ceil(total / limit);

        res.json({
            products: products.map(p => ({
                ...p,
                tags: p.tags ? p.tags.split(',') : [],
            })),
            pagination: {
                current: page,
                total: totalPages,
                limit,
                totalItems: total,
            },
        });
    }
    catch (error) {
        res.status(500).json({ error: 'Error fetching products for admin' });
    }
});

router.post('/products', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { title, description, price, stock_quantity, tags } = req.body;

        // Correction : "descriptiom" → "description"
        const [result] = await pool.execute(
            `INSERT INTO products (title, price, description, stock_quantity) VALUES (?, ?, ?, ?)`,
            [title, price, description, stock_quantity]
        );

        const product_id = result.insertId;

        // Correction : "lenght" → "length"
        if (tags && tags.length > 0) {
            for (const tagName of tags) {
                let [tagResult] = await pool.execute(
                    'SELECT id FROM tags WHERE name = ?',
                    [tagName]
                );

                let tagId;
                // Correction : "lenght" → "length"
                if (tagResult.length === 0) {
                    const [newTag] = await pool.execute(
                        'INSERT INTO tags (name) VALUES (?)',
                        [tagName]
                    );
                    tagId = newTag.insertId;
                }
                else {
                    tagId = tagResult[0].id;
                }
                await pool.execute(
                    'INSERT INTO product_tags (product_id, tag_id) VALUES (?, ?)',
                    [product_id, tagId]
                );
            }
        }

        res.status(201).json({
            message: 'Product created successfully',
            product_id: product_id,
        });
    } 
    catch (error) {
        res.status(500).json({ error: 'Error creating product' });
    }
});

router.put('/products/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { title, description, price, stock_quantity, tags } = req.body;
        const productId = req.params.id;

        await pool.execute(
            `UPDATE products SET title = ?, description = ?, price = ?, stock_quantity = ? WHERE id = ?`,
            [title, description, price, stock_quantity, productId]
        );

        await pool.execute(
            'DELETE FROM product_tags WHERE product_id = ?',
            [productId]
        );

        if (tags && tags.length > 0) {
            for (const tagName of tags) {
                let [tagResult] = await pool.execute(
                    'SELECT id FROM tags WHERE name = ?',
                    [tagName]
                );

                let tagId;

                if (tagResult.length === 0) {
                    const [newTag] = await pool.execute(
                        'INSERT INTO tags (name) VALUES (?)',
                        [tagName]
                    );
                    tagId = newTag.insertId;
                } else {
                    tagId = tagResult[0].id;
                }

                await pool.execute(
                    'INSERT INTO product_tags (product_id, tag_id) VALUES (?, ?)',
                    [productId, tagId]
                );
            }
        }

        res.status(200).json({ message: 'Product updated successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Error updating product' });
    }
});

router.delete('/products/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await pool.execute('UPDATE products SET is_active = FALSE WHERE id = ?',
        [req.params.id]);
        res.json({ message: 'Product deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Error deleting product' });
    }
});

router.get('/tags', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const [tags] = await pool.execute('SELECT * FROM tags ORDER BY name');
        res.json(tags);
    } catch (error) {
        res.status(500).json({ error: 'Error fetching tags' });
    }
});

router.post('/tags', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { name } = req.body;
        const [result] = await pool.execute(
            'INSERT INTO tags (name) VALUES (?)',
            [name]
        );
        res.status(201).json({ message: 'Tag created successfully', tag_id: result.insertId });
    } catch (error) {
        res.status(500).json({ error: 'Error creating tag' });
    }
});

router.delete('/tags/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        await pool.execute('DELETE FROM tags WHERE id = ?', [req.params.id]);
        res.json({ message: 'Tag deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Error deleting tag' });
    }
});

module.exports = router;
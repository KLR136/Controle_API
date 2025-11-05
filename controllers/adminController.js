const pool = require('../config/database');
const { getAllProducts, getAllTags } = require('./productController');

const adminController = {

    getAllProducts: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const offset = (page - 1) * limit;

            const [products] = await pool.execute(
                `SELECT p.*, GROUP_CONCAT(t.name) as tags
                COUNT(*) OVER() AS total_count
                 FROM products p
                 LEFT JOIN product_tags pt ON p.id = pt.product_id
                 LEFT JOIN tags t ON pt.tag_id = t.id
                 GROUP BY p.id
                 LIMIT ? OFFSET ?`,
                [limit, offset]
            );

            const total = products.length > 0 ? products[0].total_count : 0;
            const totalPages = Math.ceil(total / limit);

            const formattedProducts = products.map(product => ({
                id: product.id,
                title: product.title,
                price: parseFloat(product.price),
                description: product.description,
                stock_quantity: product.stock_quantity,
                is_active: Boolean(product.is_active),
                tags: product.tags ? product.tags.split(',') : [],
                created_at: product.created_at,
                updated_at: product.updated_at
            }));

            res.json({
                success: true,
                data: {
                    products: formattedProducts,
                    pagination: {
                        current: page,
                        total: totalPages,
                        limit,
                        totalItems: total,
                    },
                },
            });
        } catch (error) {
            console.error('Error fetching products for admin:', error);
            res.status(500).json({ success: false, error: 'Error fetching products for admin' });
        });
    },

    createProduct: async (req, res) => {
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            const { title, description, price, stock_quantity, tags } = req.body;

            if (!title || !description || price == null || stock_quantity == null) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    error: 'Missing required product fields'
                });
            }

            const [result] = await connection.execute(
                `INSERT INTO products (title, description, price, stock_quantity)
                 VALUES (?, ?, ?, ?)`,
                [title, description, price, stock_quantity]
            );

            const productId = result.insertId;

            if (tags && tags.length > 0) {
                for (const tagName of tags) {
                    let [tagResult] = await connection.execute(
                        'SELECT id FROM tags WHERE name = ?',
                        [tagName]
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

            await connection.commit();

            res.status(201).json({
                success: true,
                message: 'Product created successfully',
                data: { productId: productId }
            });
            }
        } catch (error) {
            await connection.rollback();
            console.error('Error creating product:', error);
            res.status(500).json({ success: false, error: 'Error creating product' });
        } finally {
            connection.release();
        }
    },

    updateProduct: async (req, res) => {
        const connection = await pool.getConnection();

        try {
            await connection.beginTransaction();

            const productId = req.params.id;
            const { title, description, price, stock_quantity, tags } = req.body;

            const [existingProducts] = await connection.execute(
                'SELECT id FROM products WHERE id = ?',
                [productId]
            );

            if (existingProducts.length === 0) {
                await connection.rollback();
                return res.status(404).json({ 
                    success: false, 
                    error: 'Product not found' 
                });
            }

            await connection.execute(
                `UPDATE products 
                 SET title = ?, price = ?, description = ?, stock_quantity = ?
                 WHERE id = ?`,
                 [title, parseFloat(price), description, parseInt(stock_quantity), productId]
            );

            if (tags && tags.length > 0) {
                for (const tagName of tags) {
                    let [tagResult] = await connection.execute(
                        'SELECT id FROM tags WHERE name = ?',
                        [tagName]
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

            await connection.commit();

            res.json({
                success: true,
                message: 'Product updated successfully'
            });
        } catch (error) {
            await connection.rollback();
            console.error('Error updating product:', error);
            res.status(500).json({ success: false, error: 'Error updating product' });
        } finally {
            connection.release();
        }
    },

    deleteProduct: async (req, res) => {
        try {
            const productId = req.params.id;

            const [results] = await pool.execute(
                'UPDATE products SET is_active = FALSE WHERE id = ?',
                [productId]
            );

            if (results.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Product not found'
                });
            }

            res.json({
                success: true,
                message: 'Product deleted successfully'
            });
        } catch (error) {
            console.error('Error deleting product:', error);
            res.status(500).json({ success: false, error: 'Error deleting product' });
        }
    },

    getAllTags: async (req, res) => {
        try {
            const [tags] = await pool.execute(
                `SELECT t.*, COUNT(pt.product_id) AS product_count
                 FROM tags t
                 LEFT JOIN product_tags pt ON t.id = pt.tag_id
                 GROUP BY t.id
                 ORDER BY t.name`
            );

            res.json({
                success: true,
                data: tags
            });
        } catch (error) {
            console.error('Error fetching tags:', error);
            res.status(500).json({ success: false, error: 'Error fetching tags' });
        }
    },

    createTag: async (req, res) => {
        try {
            const { name } = req.body;

            if (!name || name.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Tag name is required'
                });
            }

            const [existingTag] = await pool.execute(
                'SELECT id FROM tags WHERE name = ?',
                [name.trim()]
            );

            if (existingTag.length > 0) {
                return res.status(409).json({
                    success: false,
                    error: 'Tag already exists'
                });
            }

            const [result] = await pool.execute(
                'INSERT INTO tags (name) VALUES (?)',
                [name.trim()]
            );

            res.status(201).json({
                success: true,
                data: {
                    id: result.insertId,
                    name: name.trim()
                }
            });
        } catch (error) {
            console.error('Error creating tag:', error);
            res.status(500).json({ success: false, error: 'Error creating tag' });
        }
    },

    deleteTag: async (req, res) => {
        const connetion = await pool.getConnection();

        try {
            await connection.beginTransaction();

            const tagId = req.params.id;

            const [usedTags] = await connection.execute(
                'SELECT product_id FROM product_tags WHERE tag_id = ?',
                [tagId]
            );

            if (usedTags.length > 0) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    error: 'Tag is associated with products and cannot be deleted'
                });
            }

            const [results] = await connection.execute(
                'DELETE FROM tags WHERE id = ?',
                [tagId]
            );

            if (results.affectedRows === 0) {
                await connection.rollback();
                return res.status(404).json({
                    success: false,
                    error: 'Tag not found'
                });
            }

            await connection.commit();

            res.json({
                success: true,
                message: 'Tag deleted successfully'
            });
        } catch (error) {
            await connection.rollback();
            console.error('Error deleting tag:', error);
            res.status(500).json({ success: false, error: 'Error deleting tag' });
        } finally {
            connection.release();
        }
    },

        getDashboardStats: async (req, res) => {
        try {

            const [totalProducts] = await pool.execute(
                'SELECT COUNT(*) AS count FROM products WHERE is_active = TRUE'
            );

            const [totalOrders] = await pool.execute(
                'SELECT COUNT(*) AS count FROM orders'
            );

            const [totalRevenue] = await pool.execute(
                'SELECT COALESCE(SUM(total_amount), 0) AS total FROM orders WHERE status != "prending"'
            );

            const [lowStockProducts] = await pool.execute(
                'SELECT COUNT(*) AS count FROM products WHERE stock_quantity < 5 AND is_active = TRUE'
            );

            const [topProducts] = await pool.execute(
                `SELECT p.id, p.title, SUM(ci.quantity) as total_sold
                 FROM cart_items ci
                 JOIN carts c ON ci.cart_id = c.id
                 JOIN orders o ON c.id = o.cart_id
                 JOIN products p ON ci.product_id = p.id
                 WHERE o.status != 'pending'
                 GROUP BY p.id, p.title
                 ORDER BY total_sold DESC
                 LIMIT 5`
            );

            res.json({
                success: true,
                data: {
                    stats: {
                        totalProducts: totalProducts[0].count,
                        totalOrders: totalOrders[0].count,
                        totalRevenue: parseFloat(totalRevenue[0].total),
                        lowStockProducts: lowStockProducts[0].count
                    },
                    topProducts: topProducts
                }
            });
        } catch (error) {
            console.error('Error fetching dashboard stats:', error);
            res.status(500).json({ success: false, error: 'Error fetching dashboard stats' });
        }
    }
};

module.exports = adminController;
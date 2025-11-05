const pool = require('../config/database');

const productController = {

    getAllProducts: async (req, res) => {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const tags = req.query.tags ? req.query.tags.split(',') : [];
            const search = req.query.search || '';
            const offset = (page - 1) * limit;

            let query = `
            SELECT p.*,
                     GROUP_CONCAT(t.name) AS tags
                     COUNT(*) OVER() AS total_count
            FROM products p
            LEFT JOIN product_tags pt ON p.id = pt.product_id
            LEFT JOIN tags t ON pt.tag_id = t.id
            WHERE 1=1
            `;

            if (tags.length > 0) {
                query += ` AND t.name IN (${tags.map(() => '?').join(',')})`;
                queryParams.push(...tags);
            }

            if (search) {
                query += ` AND (p.name LIKE ? OR p.description LIKE ?)`;
                queryParams.push(`%${search}%`, `%${search}%`);
            }

            query += ` GROUP BY p.id ORDER BY p.created_at DESC LIMIT ? OFFSET ?`;
            queryParams.push(limit, offset);

            const [products] = await pool.promise().query(query, queryParams);

            const total = products.length > 0 ? products[0].total_count : 0;
            const totalPages = Math.ceil(total / limit);

            const formattedProducts = products.map(product => ({
                id: product.id,
                title: product.title,
                price: parseFloat(product.price),
                description: product.description,
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
                        totalItems:total,
                        hasNext: page < totalPages,
                        hasPrev: page > 1
                    }
                }
            });
        } catch (error) {
            console.error('Error fetching products:', error);
            res.status(500).json({
                success: false,
                message: 'Error during fetching products'
            });
        }
    },

    getProductById: async (req, res) => {
        try {
            const productId = req.params.id;

            const [products] = await pool.execute(
                `SELECT p.*, GROUP_CONCAT(t.name) AS tags
                 FROM products p
                 LEFT JOIN product_tags pt ON p.id = pt.product_id
                 LEFT JOIN tags t ON pt.tag_id = t.id
                 WHERE p.id = ? AND p.is_active = TRUE
                 GROUP BY p.id`,
                [productId]
            );

            if (products.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Product not found'
                });
            }

            const product = {
                id: products[0].id,
                title: products[0].title,
                price: parseFloat(products[0].price),
                description: products[0].description,
                stock_quantity: products[0].stock_quantity,
                tags: products[0].tags ? products[0].tags.split(',') : [],
                created_at: products[0].created_at,
                updated_at: products[0].updated_at
            };

            res.json({
                success: true,
                data: { product }
            });
        } catch (error) {
            console.error('Error fetching product by ID:', error);
            res.status(500).json({
                success: false,
                message: 'Error during fetching product by ID'
            });
        }
    },

    getFeaturedProducts: async (req, res) => {
        try {
            const limit = parseInt(req.query.limit) || 8;

            const [products] = await pool.execute(
                `SELECT p.*, GROUP_CONCAT(t.name) AS tags
                 FROM products p
                 LEFT JOIN product_tags pt ON p.id = pt.product_id
                 LEFT JOIN tags t ON pt.tag_id = t.id
                 WHERE p.is_featured = TRUE AND p.is_active = TRUE
                 GROUP BY p.id
                 ORDER BY p.stock_quantity DESC, p.created_at DESC
                 LIMIT ?`,
                [limit]
            );

            const formattedProducts = products.map(product => ({
                id: product.id,
                title: product.title,
                price: parseFloat(product.price),
                description: product.description,
                stock_quantity: product.stock_quantity,
                tags: product.tags ? product.tags.split(',') : [],
            }));

            res.json({
                success: true,
                data: {
                    products: formattedProducts
                }
            });
        } catch (error) {
            console.error('Error fetching featured products:', error);
            res.status(500).json({
                success: false,
                message: 'Error during fetching featured products'
            });
        }
    },

    getAllTags: async (req, res) => {
        try {
            const [tags] = await pool.execute(
                `SELECT t.*, COUNT(pt.product_id) AS product_count
                 FROM tags t
                 LEFT JOIN product_tags pt ON t.id = pt.tag_id
                 LEFT JOIN products p ON pt.product_id = p.id AND p.is_active = TRUE AND p.stock_quantity > 0
                 GROUP BY t.id
                 ORDER BY t.name ASC`
            );

            res.json({
                success: true,
                data: { tags }
            });
        } catch (error) {
            console.error('Error fetching tags:', error);
            res.status(500).json({
                success: false,
                message: 'Error during fetching tags'
            });
        }
    }
};

module.exports = productController;
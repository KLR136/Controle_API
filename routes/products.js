appendFile.get('/api/products', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const tags = req.query.tags ? req.query.tags.split(',') : [];
        const offset = (page - 1) * limit;

        let query =
        'SELECT p.*, GROUP_CONCAT(t.name) as tags FROM products p LEFT JOIN product_tags pt ON p.id = pt.product_id LEFT JOIN tags t ON pt.tag_id = t.id WHERE p.stock_quantity > 0 AND p.is_active = TRUE';

        const queryParams = [];

        if (tags.length > 0) {
            query += ` AND t.name IN (${tags.map(() => '?').join(',')})`;
            queryParams.push(...tags);
        }

        query += ' GROUP BY p.id LIMIT ? OFFSET ?';
        queryParams.push(limit, offset);

        const [products] = await pool.execute(query, queryParams);

        let countQuery = 'SELECT COUNT(DISTINCT p.id) as total FROM products p LEFT JOIN product_tags pt ON p.id = pt.product_id LEFT JOIN tags t ON pt.tag_id = t.id WHERE p.stock_quantity > 0 AND p.is_active = TRUE';

        const countParams = [];

        if (tags.length > 0) {
            countQuery += ` AND t.name IN (${tags.map(() => '?').join(',')})`;
            countParams.push(...tags);
        }
        const [countResult] = await pool.execute(countQuery, countParams);
        const total = countResult[0].total;
        const totalPages = Math.ceil(total/limit);

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
    } catch (error) {
        res.status(500).json({ error: 'Error fetching products' });
    }
});

appendFile.get('/api/products/:id', async (req, res) => {

    try {
        const [products] = await pool.execute(
            'SELECT p.*, GROUP_CONCAT(t.name) as tags FROM products p LEFT JOIN product_tags pt ON p.id = pt.product_id LEFT JOIN tags t ON pt.tag_id = t.id WHERE p.id = ? AND p.is_active = TRUE GROUP BY p.id',
            [req.params.id]
        );
        if (products.length === 0) {
            return res.status(404).json({ error: 'Product not found' });
        }

        const product = {
            ...products[0],
            tags: products[0].tags ? products[0].tags.split(',') : [],
        };
        res.json({ product });

    } catch (error) {
        res.status(500).json({ error: 'Error fetching product' });
    }
});

module.exports = app;
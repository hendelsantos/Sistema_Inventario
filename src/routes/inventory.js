const express = require('express');
const router = express.Router();
const { db } = require('../database/database');

// Validação de QR code (17 caracteres)
function validateQRCode(qrCode) {
    return qrCode && typeof qrCode === 'string' && qrCode.length === 17;
}

// GET - Buscar item por QR code
router.get('/item/:qrCode', (req, res) => {
    const { qrCode } = req.params;
    
    if (!validateQRCode(qrCode)) {
        return res.status(400).json({ error: 'QR code deve ter exatamente 17 caracteres' });
    }

    db.get(
        'SELECT * FROM items WHERE qr_code = ?',
        [qrCode],
        (err, item) => {
            if (err) {
                console.error('Erro ao buscar item:', err);
                return res.status(500).json({ error: 'Erro interno do servidor' });
            }

            if (!item) {
                return res.json({ exists: false, qrCode });
            }

            // Buscar histórico de contagens
            db.all(
                'SELECT * FROM stock_counts WHERE qr_code = ? ORDER BY count_date DESC',
                [qrCode],
                (err, counts) => {
                    if (err) {
                        console.error('Erro ao buscar contagens:', err);
                        return res.status(500).json({ error: 'Erro interno do servidor' });
                    }

                    res.json({
                        exists: true,
                        item,
                        counts: counts || []
                    });
                }
            );
        }
    );
});

// POST - Adicionar/atualizar item e contagem
router.post('/item', (req, res) => {
    const { qrCode, description, location, notes, unrestrict = 0, foc = 0, rfb = 0 } = req.body;

    if (!validateQRCode(qrCode)) {
        return res.status(400).json({ error: 'QR code deve ter exatamente 17 caracteres' });
    }

    // Verificar se o item já existe
    db.get(
        'SELECT id FROM items WHERE qr_code = ?',
        [qrCode],
        (err, existingItem) => {
            if (err) {
                console.error('Erro ao verificar item:', err);
                return res.status(500).json({ error: 'Erro interno do servidor' });
            }

            if (existingItem) {
                // Item existe, apenas adicionar nova contagem
                addStockCount(existingItem.id, qrCode, unrestrict, foc, rfb, notes, res);
            } else {
                // Item não existe, criar novo
                db.run(
                    'INSERT INTO items (qr_code, description, location, notes) VALUES (?, ?, ?, ?)',
                    [qrCode, description || '', location || '', notes || ''],
                    function(err) {
                        if (err) {
                            console.error('Erro ao criar item:', err);
                            return res.status(500).json({ error: 'Erro ao criar item' });
                        }

                        addStockCount(this.lastID, qrCode, unrestrict, foc, rfb, notes, res);
                    }
                );
            }
        }
    );
});

function addStockCount(itemId, qrCode, unrestrict, foc, rfb, notes, res) {
    db.run(
        'INSERT INTO stock_counts (item_id, qr_code, unrestrict, foc, rfb, notes) VALUES (?, ?, ?, ?, ?, ?)',
        [itemId, qrCode, parseInt(unrestrict) || 0, parseInt(foc) || 0, parseInt(rfb) || 0, notes || ''],
        function(err) {
            if (err) {
                console.error('Erro ao adicionar contagem:', err);
                return res.status(500).json({ error: 'Erro ao adicionar contagem' });
            }

            res.json({
                success: true,
                message: 'Contagem adicionada com sucesso',
                countId: this.lastID
            });
        }
    );
}

// GET - Listar todos os itens com última contagem
router.get('/items', (req, res) => {
    const { search, limit = 50, offset = 0 } = req.query;

    let query = `
        SELECT 
            i.*,
            sc.unrestrict,
            sc.foc,
            sc.rfb,
            sc.total,
            sc.count_date
        FROM items i
        LEFT JOIN (
            SELECT DISTINCT qr_code,
                   FIRST_VALUE(unrestrict) OVER (PARTITION BY qr_code ORDER BY count_date DESC) as unrestrict,
                   FIRST_VALUE(foc) OVER (PARTITION BY qr_code ORDER BY count_date DESC) as foc,
                   FIRST_VALUE(rfb) OVER (PARTITION BY qr_code ORDER BY count_date DESC) as rfb,
                   FIRST_VALUE(total) OVER (PARTITION BY qr_code ORDER BY count_date DESC) as total,
                   FIRST_VALUE(count_date) OVER (PARTITION BY qr_code ORDER BY count_date DESC) as count_date
            FROM stock_counts
        ) sc ON i.qr_code = sc.qr_code
    `;

    const params = [];

    if (search) {
        query += ` WHERE (i.qr_code LIKE ? OR i.description LIKE ? OR i.location LIKE ?)`;
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm, searchTerm);
    }

    query += ` ORDER BY i.updated_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    db.all(query, params, (err, items) => {
        if (err) {
            console.error('Erro ao buscar itens:', err);
            return res.status(500).json({ error: 'Erro interno do servidor' });
        }

        res.json(items);
    });
});

// GET - Histórico de um item específico
router.get('/history/:qrCode', (req, res) => {
    const { qrCode } = req.params;

    if (!validateQRCode(qrCode)) {
        return res.status(400).json({ error: 'QR code deve ter exatamente 17 caracteres' });
    }

    db.all(
        `SELECT 
            sc.*,
            i.description,
            i.location
         FROM stock_counts sc
         JOIN items i ON sc.item_id = i.id
         WHERE sc.qr_code = ?
         ORDER BY sc.count_date DESC`,
        [qrCode],
        (err, history) => {
            if (err) {
                console.error('Erro ao buscar histórico:', err);
                return res.status(500).json({ error: 'Erro interno do servidor' });
            }

            res.json(history);
        }
    );
});

// GET - Buscar sugestões para autocomplete
router.get('/suggestions/:field', (req, res) => {
    const { field } = req.params;
    const { term } = req.query;
    
    if (!term || term.length < 2) {
        return res.json([]);
    }
    
    let column;
    switch (field) {
        case 'qr_code':
            column = 'qr_code';
            break;
        case 'description':
            column = 'description';
            break;
        case 'location':
            column = 'location';
            break;
        default:
            return res.status(400).json({ error: 'Campo inválido' });
    }
    
    const query = `
        SELECT DISTINCT ${column} as suggestion
        FROM items 
        WHERE ${column} LIKE ? AND ${column} IS NOT NULL AND ${column} != ''
        ORDER BY ${column}
        LIMIT 10
    `;
    
    db.all(query, [`%${term}%`], (err, results) => {
        if (err) {
            console.error('Erro ao buscar sugestões:', err);
            return res.status(500).json({ error: 'Erro interno do servidor' });
        }
        
        const suggestions = results.map(row => row.suggestion);
        res.json(suggestions);
    });
});

// GET - Busca avançada com múltiplos filtros
router.get('/search', (req, res) => {
    const { 
        qr_code, 
        description, 
        location, 
        stock_type,
        date_from, 
        date_to, 
        min_stock, 
        max_stock,
        limit = 50, 
        offset = 0 
    } = req.query;

    let query = `
        SELECT 
            i.*,
            sc.unrestrict,
            sc.foc,
            sc.rfb,
            sc.total,
            sc.count_date,
            sc.notes as count_notes
        FROM items i
        LEFT JOIN (
            SELECT DISTINCT qr_code,
                   FIRST_VALUE(unrestrict) OVER (PARTITION BY qr_code ORDER BY count_date DESC) as unrestrict,
                   FIRST_VALUE(foc) OVER (PARTITION BY qr_code ORDER BY count_date DESC) as foc,
                   FIRST_VALUE(rfb) OVER (PARTITION BY qr_code ORDER BY count_date DESC) as rfb,
                   FIRST_VALUE(total) OVER (PARTITION BY qr_code ORDER BY count_date DESC) as total,
                   FIRST_VALUE(count_date) OVER (PARTITION BY qr_code ORDER BY count_date DESC) as count_date,
                   FIRST_VALUE(notes) OVER (PARTITION BY qr_code ORDER BY count_date DESC) as notes
            FROM stock_counts
        ) sc ON i.qr_code = sc.qr_code
        WHERE 1=1
    `;

    const params = [];
    
    if (qr_code) {
        query += ` AND i.qr_code LIKE ?`;
        params.push(`%${qr_code}%`);
    }
    
    if (description) {
        query += ` AND i.description LIKE ?`;
        params.push(`%${description}%`);
    }
    
    if (location) {
        query += ` AND i.location LIKE ?`;
        params.push(`%${location}%`);
    }
    
    if (stock_type && ['unrestrict', 'foc', 'rfb'].includes(stock_type)) {
        query += ` AND sc.${stock_type} > 0`;
    }
    
    if (date_from) {
        query += ` AND DATE(sc.count_date) >= DATE(?)`;
        params.push(date_from);
    }
    
    if (date_to) {
        query += ` AND DATE(sc.count_date) <= DATE(?)`;
        params.push(date_to);
    }
    
    if (min_stock) {
        query += ` AND sc.total >= ?`;
        params.push(parseInt(min_stock));
    }
    
    if (max_stock) {
        query += ` AND sc.total <= ?`;
        params.push(parseInt(max_stock));
    }

    query += ` ORDER BY i.updated_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    db.all(query, params, (err, items) => {
        if (err) {
            console.error('Erro na busca avançada:', err);
            return res.status(500).json({ error: 'Erro interno do servidor' });
        }

        // Contar total de resultados para paginação
        let countQuery = query.replace(/SELECT.*?FROM/, 'SELECT COUNT(*) as total FROM')
                             .replace(/ORDER BY.*?LIMIT.*?OFFSET.*?$/, '');
        let countParams = params.slice(0, -2); // Remove limit e offset

        db.get(countQuery, countParams, (err, countResult) => {
            if (err) {
                console.error('Erro ao contar resultados:', err);
                return res.json({ items, total: items.length });
            }

            res.json({
                items,
                total: countResult.total,
                limit: parseInt(limit),
                offset: parseInt(offset)
            });
        });
    });
});

// DELETE - Remover uma contagem específica
router.delete('/count/:countId', (req, res) => {
    const { countId } = req.params;

    db.run(
        'DELETE FROM stock_counts WHERE id = ?',
        [countId],
        function(err) {
            if (err) {
                console.error('Erro ao deletar contagem:', err);
                return res.status(500).json({ error: 'Erro interno do servidor' });
            }

            if (this.changes === 0) {
                return res.status(404).json({ error: 'Contagem não encontrada' });
            }

            res.json({ success: true, message: 'Contagem removida com sucesso' });
        }
    );
});

module.exports = router;
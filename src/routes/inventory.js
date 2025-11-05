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
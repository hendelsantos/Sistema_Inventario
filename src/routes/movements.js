const express = require('express');
const { db } = require('../database/database');
const router = express.Router();

// Listar movimentações de estoque
router.get('/', (req, res) => {
    const { 
        qr_code, 
        movement_type, 
        location, 
        date_from, 
        date_to, 
        created_by,
        status = 'all',
        page = 1,
        limit = 50
    } = req.query;
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    let sql = `
        SELECT 
            sm.*,
            i.description,
            CASE sm.movement_type
                WHEN 'in' THEN 'Entrada'
                WHEN 'out' THEN 'Saída'
                WHEN 'transfer' THEN 'Transferência'
                WHEN 'adjustment' THEN 'Ajuste'
                ELSE sm.movement_type
            END as movement_type_desc
        FROM stock_movements sm
        LEFT JOIN items i ON sm.qr_code = i.qr_code
        WHERE 1=1
    `;
    
    const params = [];
    
    if (qr_code) {
        sql += ` AND sm.qr_code LIKE ?`;
        params.push(`%${qr_code}%`);
    }
    
    if (movement_type) {
        sql += ` AND sm.movement_type = ?`;
        params.push(movement_type);
    }
    
    if (location) {
        sql += ` AND (sm.from_location LIKE ? OR sm.to_location LIKE ?)`;
        params.push(`%${location}%`, `%${location}%`);
    }
    
    if (date_from) {
        sql += ` AND date(sm.created_at) >= date(?)`;
        params.push(date_from);
    }
    
    if (date_to) {
        sql += ` AND date(sm.created_at) <= date(?)`;
        params.push(date_to);
    }
    
    if (created_by) {
        sql += ` AND sm.created_by LIKE ?`;
        params.push(`%${created_by}%`);
    }
    
    if (status !== 'all') {
        sql += ` AND sm.status = ?`;
        params.push(status);
    }
    
    sql += ` ORDER BY sm.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);
    
    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error('Erro ao buscar movimentações:', err);
            res.status(500).json({ error: 'Erro interno do servidor' });
            return;
        }
        
        // Buscar total de registros para paginação
        let countSql = `
            SELECT COUNT(*) as total
            FROM stock_movements sm
            WHERE 1=1
        `;
        
        const countParams = params.slice(0, -2); // Remove limit e offset
        
        if (qr_code) countSql += ` AND sm.qr_code LIKE ?`;
        if (movement_type) countSql += ` AND sm.movement_type = ?`;
        if (location) countSql += ` AND (sm.from_location LIKE ? OR sm.to_location LIKE ?)`;
        if (date_from) countSql += ` AND date(sm.created_at) >= date(?)`;
        if (date_to) countSql += ` AND date(sm.created_at) <= date(?)`;
        if (created_by) countSql += ` AND sm.created_by LIKE ?`;
        if (status !== 'all') countSql += ` AND sm.status = ?`;
        
        db.get(countSql, countParams, (err, countResult) => {
            if (err) {
                console.error('Erro ao contar movimentações:', err);
                res.status(500).json({ error: 'Erro interno do servidor' });
                return;
            }
            
            res.json({
                movements: rows,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: countResult.total,
                    pages: Math.ceil(countResult.total / parseInt(limit))
                }
            });
        });
    });
});

// Criar movimentação de entrada
router.post('/in', (req, res) => {
    const { 
        qr_code, 
        to_location, 
        unrestrict_qty, 
        foc_qty, 
        rfb_qty, 
        reason, 
        reference_doc, 
        created_by 
    } = req.body;
    
    if (!qr_code || !to_location || !created_by) {
        return res.status(400).json({ error: 'QR Code, localização e responsável são obrigatórios' });
    }
    
    const unrestrictQty = parseInt(unrestrict_qty) || 0;
    const focQty = parseInt(foc_qty) || 0;
    const rfbQty = parseInt(rfb_qty) || 0;
    
    if (unrestrictQty <= 0 && focQty <= 0 && rfbQty <= 0) {
        return res.status(400).json({ error: 'Pelo menos uma quantidade deve ser maior que zero' });
    }
    
    db.serialize(() => {
        // Registrar movimentação
        const movementSql = `
            INSERT INTO stock_movements (
                qr_code, movement_type, to_location,
                unrestrict_qty, foc_qty, rfb_qty,
                reason, reference_doc, created_by
            ) VALUES (?, 'in', ?, ?, ?, ?, ?, ?, ?)
        `;
        
        db.run(movementSql, [
            qr_code, to_location, unrestrictQty, focQty, rfbQty,
            reason, reference_doc, created_by
        ], function(err) {
            if (err) {
                console.error('Erro ao registrar entrada:', err);
                res.status(500).json({ error: 'Erro interno do servidor' });
                return;
            }
            
            const movementId = this.lastID;
            
            // Buscar estoque atual
            const getCurrentStockSql = `
                SELECT unrestrict, foc, rfb
                FROM stock_counts 
                WHERE qr_code = ? 
                ORDER BY count_date DESC 
                LIMIT 1
            `;
            
            db.get(getCurrentStockSql, [qr_code], (err, currentStock) => {
                if (err) {
                    console.error('Erro ao buscar estoque atual:', err);
                    res.status(500).json({ error: 'Erro ao buscar estoque atual' });
                    return;
                }
                
                const currentUnrestrict = currentStock?.unrestrict || 0;
                const currentFoc = currentStock?.foc || 0;
                const currentRfb = currentStock?.rfb || 0;
                
                // Criar nova contagem com o estoque atualizado
                const newStockSql = `
                    INSERT INTO stock_counts (
                        item_id, qr_code, unrestrict, foc, rfb,
                        count_type, notes
                    )
                    SELECT 
                        i.id, ?, ?, ?, ?,
                        'movement', ?
                    FROM items i
                    WHERE i.qr_code = ?
                `;
                
                const notes = `Entrada - ${reason || 'Movimentação de estoque'} - Ref: ${reference_doc || 'N/A'}`;
                
                db.run(newStockSql, [
                    qr_code,
                    currentUnrestrict + unrestrictQty,
                    currentFoc + focQty,
                    currentRfb + rfbQty,
                    notes,
                    qr_code
                ], function(err) {
                    if (err) {
                        console.error('Erro ao atualizar estoque:', err);
                        res.status(500).json({ error: 'Erro ao atualizar estoque' });
                        return;
                    }
                    
                    res.status(201).json({
                        id: movementId,
                        message: 'Entrada registrada com sucesso',
                        stock_count_id: this.lastID,
                        new_stock: {
                            unrestrict: currentUnrestrict + unrestrictQty,
                            foc: currentFoc + focQty,
                            rfb: currentRfb + rfbQty,
                            total: currentUnrestrict + unrestrictQty + currentFoc + focQty + currentRfb + rfbQty
                        }
                    });
                });
            });
        });
    });
});

// Criar movimentação de saída
router.post('/out', (req, res) => {
    const { 
        qr_code, 
        from_location, 
        unrestrict_qty, 
        foc_qty, 
        rfb_qty, 
        reason, 
        reference_doc, 
        created_by 
    } = req.body;
    
    if (!qr_code || !from_location || !created_by) {
        return res.status(400).json({ error: 'QR Code, localização e responsável são obrigatórios' });
    }
    
    const unrestrictQty = parseInt(unrestrict_qty) || 0;
    const focQty = parseInt(foc_qty) || 0;
    const rfbQty = parseInt(rfb_qty) || 0;
    
    if (unrestrictQty <= 0 && focQty <= 0 && rfbQty <= 0) {
        return res.status(400).json({ error: 'Pelo menos uma quantidade deve ser maior que zero' });
    }
    
    db.serialize(() => {
        // Buscar estoque atual para validar
        const getCurrentStockSql = `
            SELECT unrestrict, foc, rfb
            FROM stock_counts 
            WHERE qr_code = ? 
            ORDER BY count_date DESC 
            LIMIT 1
        `;
        
        db.get(getCurrentStockSql, [qr_code], (err, currentStock) => {
            if (err) {
                console.error('Erro ao buscar estoque atual:', err);
                res.status(500).json({ error: 'Erro ao buscar estoque atual' });
                return;
            }
            
            if (!currentStock) {
                res.status(400).json({ error: 'Item não encontrado no estoque' });
                return;
            }
            
            const currentUnrestrict = currentStock.unrestrict || 0;
            const currentFoc = currentStock.foc || 0;
            const currentRfb = currentStock.rfb || 0;
            
            // Validar disponibilidade
            if (currentUnrestrict < unrestrictQty) {
                return res.status(400).json({ 
                    error: `Estoque insuficiente - Unrestrict. Disponível: ${currentUnrestrict}, Solicitado: ${unrestrictQty}` 
                });
            }
            
            if (currentFoc < focQty) {
                return res.status(400).json({ 
                    error: `Estoque insuficiente - FOC. Disponível: ${currentFoc}, Solicitado: ${focQty}` 
                });
            }
            
            if (currentRfb < rfbQty) {
                return res.status(400).json({ 
                    error: `Estoque insuficiente - RFB. Disponível: ${currentRfb}, Solicitado: ${rfbQty}` 
                });
            }
            
            // Registrar movimentação de saída
            const movementSql = `
                INSERT INTO stock_movements (
                    qr_code, movement_type, from_location,
                    unrestrict_qty, foc_qty, rfb_qty,
                    reason, reference_doc, created_by
                ) VALUES (?, 'out', ?, ?, ?, ?, ?, ?, ?)
            `;
            
            db.run(movementSql, [
                qr_code, from_location, unrestrictQty, focQty, rfbQty,
                reason, reference_doc, created_by
            ], function(err) {
                if (err) {
                    console.error('Erro ao registrar saída:', err);
                    res.status(500).json({ error: 'Erro interno do servidor' });
                    return;
                }
                
                const movementId = this.lastID;
                
                // Criar nova contagem com o estoque reduzido
                const newStockSql = `
                    INSERT INTO stock_counts (
                        item_id, qr_code, unrestrict, foc, rfb,
                        count_type, notes
                    )
                    SELECT 
                        i.id, ?, ?, ?, ?,
                        'movement', ?
                    FROM items i
                    WHERE i.qr_code = ?
                `;
                
                const notes = `Saída - ${reason || 'Movimentação de estoque'} - Ref: ${reference_doc || 'N/A'}`;
                
                db.run(newStockSql, [
                    qr_code,
                    currentUnrestrict - unrestrictQty,
                    currentFoc - focQty,
                    currentRfb - rfbQty,
                    notes,
                    qr_code
                ], function(err) {
                    if (err) {
                        console.error('Erro ao atualizar estoque:', err);
                        res.status(500).json({ error: 'Erro ao atualizar estoque' });
                        return;
                    }
                    
                    res.status(201).json({
                        id: movementId,
                        message: 'Saída registrada com sucesso',
                        stock_count_id: this.lastID,
                        new_stock: {
                            unrestrict: currentUnrestrict - unrestrictQty,
                            foc: currentFoc - focQty,
                            rfb: currentRfb - rfbQty,
                            total: currentUnrestrict - unrestrictQty + currentFoc - focQty + currentRfb - rfbQty
                        }
                    });
                });
            });
        });
    });
});

// Criar ajuste de estoque
router.post('/adjustment', (req, res) => {
    const { 
        qr_code, 
        location, 
        new_unrestrict, 
        new_foc, 
        new_rfb, 
        reason, 
        reference_doc, 
        created_by 
    } = req.body;
    
    if (!qr_code || !location || !created_by || !reason) {
        return res.status(400).json({ error: 'QR Code, localização, motivo e responsável são obrigatórios' });
    }
    
    const newUnrestrict = parseInt(new_unrestrict) || 0;
    const newFoc = parseInt(new_foc) || 0;
    const newRfb = parseInt(new_rfb) || 0;
    
    db.serialize(() => {
        // Buscar estoque atual
        const getCurrentStockSql = `
            SELECT unrestrict, foc, rfb
            FROM stock_counts 
            WHERE qr_code = ? 
            ORDER BY count_date DESC 
            LIMIT 1
        `;
        
        db.get(getCurrentStockSql, [qr_code], (err, currentStock) => {
            if (err) {
                console.error('Erro ao buscar estoque atual:', err);
                res.status(500).json({ error: 'Erro ao buscar estoque atual' });
                return;
            }
            
            const currentUnrestrict = currentStock?.unrestrict || 0;
            const currentFoc = currentStock?.foc || 0;
            const currentRfb = currentStock?.rfb || 0;
            
            // Calcular diferenças
            const diffUnrestrict = newUnrestrict - currentUnrestrict;
            const diffFoc = newFoc - currentFoc;
            const diffRfb = newRfb - currentRfb;
            
            // Registrar movimentação de ajuste
            const movementSql = `
                INSERT INTO stock_movements (
                    qr_code, movement_type, to_location,
                    unrestrict_qty, foc_qty, rfb_qty,
                    reason, reference_doc, created_by
                ) VALUES (?, 'adjustment', ?, ?, ?, ?, ?, ?, ?)
            `;
            
            db.run(movementSql, [
                qr_code, location, diffUnrestrict, diffFoc, diffRfb,
                reason, reference_doc, created_by
            ], function(err) {
                if (err) {
                    console.error('Erro ao registrar ajuste:', err);
                    res.status(500).json({ error: 'Erro interno do servidor' });
                    return;
                }
                
                const movementId = this.lastID;
                
                // Criar nova contagem com os valores ajustados
                const newStockSql = `
                    INSERT INTO stock_counts (
                        item_id, qr_code, unrestrict, foc, rfb,
                        count_type, notes
                    )
                    SELECT 
                        i.id, ?, ?, ?, ?,
                        'adjustment', ?
                    FROM items i
                    WHERE i.qr_code = ?
                `;
                
                const notes = `Ajuste - ${reason} - Ref: ${reference_doc || 'N/A'}`;
                
                db.run(newStockSql, [
                    qr_code, newUnrestrict, newFoc, newRfb, notes, qr_code
                ], function(err) {
                    if (err) {
                        console.error('Erro ao criar contagem ajustada:', err);
                        res.status(500).json({ error: 'Erro ao criar contagem ajustada' });
                        return;
                    }
                    
                    res.status(201).json({
                        id: movementId,
                        message: 'Ajuste registrado com sucesso',
                        stock_count_id: this.lastID,
                        adjustments: {
                            unrestrict: diffUnrestrict,
                            foc: diffFoc,
                            rfb: diffRfb,
                            total: diffUnrestrict + diffFoc + diffRfb
                        },
                        new_stock: {
                            unrestrict: newUnrestrict,
                            foc: newFoc,
                            rfb: newRfb,
                            total: newUnrestrict + newFoc + newRfb
                        }
                    });
                });
            });
        });
    });
});

// Obter histórico de movimentações por item
router.get('/history/:qr_code', (req, res) => {
    const { qr_code } = req.params;
    const { limit = 20 } = req.query;
    
    const sql = `
        SELECT 
            sm.*,
            i.description,
            CASE sm.movement_type
                WHEN 'in' THEN 'Entrada'
                WHEN 'out' THEN 'Saída'
                WHEN 'transfer' THEN 'Transferência'
                WHEN 'adjustment' THEN 'Ajuste'
                ELSE sm.movement_type
            END as movement_type_desc
        FROM stock_movements sm
        LEFT JOIN items i ON sm.qr_code = i.qr_code
        WHERE sm.qr_code = ?
        ORDER BY sm.created_at DESC
        LIMIT ?
    `;
    
    db.all(sql, [qr_code, parseInt(limit)], (err, rows) => {
        if (err) {
            console.error('Erro ao buscar histórico:', err);
            res.status(500).json({ error: 'Erro interno do servidor' });
            return;
        }
        res.json(rows);
    });
});

// Estatísticas de movimentações
router.get('/stats', (req, res) => {
    const { date_from, date_to } = req.query;
    
    let sql = `
        SELECT 
            movement_type,
            COUNT(*) as count,
            SUM(total_qty) as total_quantity,
            COUNT(DISTINCT qr_code) as unique_items,
            COUNT(DISTINCT created_by) as unique_users
        FROM stock_movements
        WHERE 1=1
    `;
    
    const params = [];
    
    if (date_from) {
        sql += ` AND date(created_at) >= date(?)`;
        params.push(date_from);
    }
    
    if (date_to) {
        sql += ` AND date(created_at) <= date(?)`;
        params.push(date_to);
    }
    
    sql += ` GROUP BY movement_type ORDER BY count DESC`;
    
    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error('Erro ao buscar estatísticas:', err);
            res.status(500).json({ error: 'Erro interno do servidor' });
            return;
        }
        
        // Buscar estatísticas gerais
        const generalStatsSql = `
            SELECT 
                COUNT(*) as total_movements,
                COUNT(DISTINCT qr_code) as total_items_moved,
                COUNT(DISTINCT COALESCE(from_location, to_location)) as total_locations,
                SUM(ABS(total_qty)) as total_quantity_moved
            FROM stock_movements
            WHERE 1=1
            ${date_from ? ' AND date(created_at) >= date(?)' : ''}
            ${date_to ? ' AND date(created_at) <= date(?)' : ''}
        `;
        
        db.get(generalStatsSql, params, (err, generalStats) => {
            if (err) {
                console.error('Erro ao buscar estatísticas gerais:', err);
                res.status(500).json({ error: 'Erro interno do servidor' });
                return;
            }
            
            res.json({
                by_type: rows,
                general: generalStats || {}
            });
        });
    });
});

module.exports = router;
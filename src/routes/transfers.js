const express = require('express');
const { db } = require('../database/database');
const router = express.Router();

// Gerar número de transferência único
function generateTransferNumber() {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = date.toTimeString().slice(0, 8).replace(/:/g, '');
    return `TR${dateStr}${timeStr}`;
}

// Listar transferências
router.get('/', (req, res) => {
    const { 
        status = 'all', 
        from_location, 
        to_location, 
        date_from, 
        date_to,
        created_by,
        page = 1,
        limit = 20
    } = req.query;
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    let sql = `
        SELECT 
            lt.*,
            COUNT(ti.id) as total_items,
            COUNT(CASE WHEN ti.status = 'shipped' THEN 1 END) as shipped_items,
            COUNT(CASE WHEN ti.status = 'received' THEN 1 END) as received_items,
            CASE 
                WHEN lt.status = 'completed' THEN 'Concluída'
                WHEN lt.status = 'in_transit' THEN 'Em Trânsito'
                WHEN lt.status = 'pending' THEN 'Pendente'
                WHEN lt.status = 'cancelled' THEN 'Cancelada'
                ELSE lt.status
            END as status_desc
        FROM location_transfers lt
        LEFT JOIN transfer_items ti ON lt.id = ti.transfer_id
        WHERE 1=1
    `;
    
    const params = [];
    
    if (status !== 'all') {
        sql += ` AND lt.status = ?`;
        params.push(status);
    }
    
    if (from_location) {
        sql += ` AND lt.from_location LIKE ?`;
        params.push(`%${from_location}%`);
    }
    
    if (to_location) {
        sql += ` AND lt.to_location LIKE ?`;
        params.push(`%${to_location}%`);
    }
    
    if (date_from) {
        sql += ` AND date(lt.created_at) >= date(?)`;
        params.push(date_from);
    }
    
    if (date_to) {
        sql += ` AND date(lt.created_at) <= date(?)`;
        params.push(date_to);
    }
    
    if (created_by) {
        sql += ` AND lt.created_by LIKE ?`;
        params.push(`%${created_by}%`);
    }
    
    sql += ` GROUP BY lt.id ORDER BY lt.created_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);
    
    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error('Erro ao buscar transferências:', err);
            res.status(500).json({ error: 'Erro interno do servidor' });
            return;
        }
        
        res.json({
            transfers: rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });
    });
});

// Criar nova transferência
router.post('/', (req, res) => {
    const { 
        from_location, 
        to_location, 
        items, 
        notes, 
        created_by 
    } = req.body;
    
    if (!from_location || !to_location || !items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ 
            error: 'Localização origem, destino e lista de itens são obrigatórios' 
        });
    }
    
    if (from_location === to_location) {
        return res.status(400).json({ 
            error: 'Localização de origem deve ser diferente do destino' 
        });
    }
    
    const transferNumber = generateTransferNumber();
    
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // Criar transferência
        const createTransferSql = `
            INSERT INTO location_transfers (
                transfer_number, from_location, to_location, 
                total_items, notes, created_by
            ) VALUES (?, ?, ?, ?, ?, ?)
        `;
        
        db.run(createTransferSql, [
            transferNumber, from_location, to_location, 
            items.length, notes, created_by
        ], function(err) {
            if (err) {
                console.error('Erro ao criar transferência:', err);
                db.run('ROLLBACK');
                res.status(500).json({ error: 'Erro interno do servidor' });
                return;
            }
            
            const transferId = this.lastID;
            let itemsProcessed = 0;
            let hasError = false;
            
            // Adicionar itens à transferência
            items.forEach(item => {
                const { qr_code, unrestrict_qty, foc_qty, rfb_qty } = item;
                
                if (!qr_code) {
                    hasError = true;
                    return;
                }
                
                const unrestrictQty = parseInt(unrestrict_qty) || 0;
                const focQty = parseInt(foc_qty) || 0;
                const rfbQty = parseInt(rfb_qty) || 0;
                
                if (unrestrictQty <= 0 && focQty <= 0 && rfbQty <= 0) {
                    hasError = true;
                    return;
                }
                
                // Verificar se o item existe e tem estoque suficiente
                const checkStockSql = `
                    SELECT sc.unrestrict, sc.foc, sc.rfb, i.location
                    FROM stock_counts sc
                    JOIN items i ON sc.qr_code = i.qr_code
                    WHERE sc.qr_code = ? AND i.location = ?
                    ORDER BY sc.count_date DESC
                    LIMIT 1
                `;
                
                db.get(checkStockSql, [qr_code, from_location], (err, stock) => {
                    if (err || !stock) {
                        console.error('Item não encontrado ou sem estoque:', qr_code);
                        hasError = true;
                        return;
                    }
                    
                    // Validar disponibilidade
                    if (stock.unrestrict < unrestrictQty || 
                        stock.foc < focQty || 
                        stock.rfb < rfbQty) {
                        console.error('Estoque insuficiente para:', qr_code);
                        hasError = true;
                        return;
                    }
                    
                    // Adicionar item à transferência
                    const addItemSql = `
                        INSERT INTO transfer_items (
                            transfer_id, qr_code, 
                            unrestrict_qty, foc_qty, rfb_qty
                        ) VALUES (?, ?, ?, ?, ?)
                    `;
                    
                    db.run(addItemSql, [
                        transferId, qr_code, unrestrictQty, focQty, rfbQty
                    ], function(err) {
                        if (err) {
                            console.error('Erro ao adicionar item:', err);
                            hasError = true;
                            return;
                        }
                        
                        itemsProcessed++;
                        
                        // Se todos os itens foram processados
                        if (itemsProcessed === items.length) {
                            if (hasError) {
                                db.run('ROLLBACK');
                                res.status(400).json({ 
                                    error: 'Erro ao processar alguns itens da transferência' 
                                });
                            } else {
                                db.run('COMMIT');
                                res.status(201).json({
                                    id: transferId,
                                    transfer_number: transferNumber,
                                    message: 'Transferência criada com sucesso',
                                    total_items: items.length,
                                    status: 'pending'
                                });
                            }
                        }
                    });
                });
            });
        });
    });
});

// Obter detalhes de uma transferência
router.get('/:id', (req, res) => {
    const { id } = req.params;
    
    const transferSql = `
        SELECT 
            lt.*,
            CASE 
                WHEN lt.status = 'completed' THEN 'Concluída'
                WHEN lt.status = 'in_transit' THEN 'Em Trânsito'
                WHEN lt.status = 'pending' THEN 'Pendente'
                WHEN lt.status = 'cancelled' THEN 'Cancelada'
                ELSE lt.status
            END as status_desc
        FROM location_transfers lt
        WHERE lt.id = ?
    `;
    
    db.get(transferSql, [id], (err, transfer) => {
        if (err) {
            console.error('Erro ao buscar transferência:', err);
            res.status(500).json({ error: 'Erro interno do servidor' });
            return;
        }
        
        if (!transfer) {
            res.status(404).json({ error: 'Transferência não encontrada' });
            return;
        }
        
        // Buscar itens da transferência
        const itemsSql = `
            SELECT 
                ti.*,
                i.description,
                i.location as current_location
            FROM transfer_items ti
            LEFT JOIN items i ON ti.qr_code = i.qr_code
            WHERE ti.transfer_id = ?
            ORDER BY ti.id
        `;
        
        db.all(itemsSql, [id], (err, items) => {
            if (err) {
                console.error('Erro ao buscar itens da transferência:', err);
                res.status(500).json({ error: 'Erro interno do servidor' });
                return;
            }
            
            res.json({
                ...transfer,
                items: items
            });
        });
    });
});

// Aprovar transferência
router.post('/:id/approve', (req, res) => {
    const { id } = req.params;
    const { approved_by } = req.body;
    
    if (!approved_by) {
        return res.status(400).json({ error: 'Aprovador é obrigatório' });
    }
    
    const sql = `
        UPDATE location_transfers 
        SET status = 'in_transit', approved_by = ?, approved_at = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'pending'
    `;
    
    db.run(sql, [approved_by, id], function(err) {
        if (err) {
            console.error('Erro ao aprovar transferência:', err);
            res.status(500).json({ error: 'Erro interno do servidor' });
            return;
        }
        
        if (this.changes === 0) {
            res.status(404).json({ error: 'Transferência não encontrada ou já processada' });
            return;
        }
        
        res.json({ message: 'Transferência aprovada e em trânsito' });
    });
});

// Receber itens da transferência
router.post('/:id/receive', (req, res) => {
    const { id } = req.params;
    const { received_by, received_items } = req.body;
    
    if (!received_by) {
        return res.status(400).json({ error: 'Responsável pelo recebimento é obrigatório' });
    }
    
    db.serialize(() => {
        db.run('BEGIN TRANSACTION');
        
        // Buscar detalhes da transferência
        const getTransferSql = `
            SELECT * FROM location_transfers 
            WHERE id = ? AND status = 'in_transit'
        `;
        
        db.get(getTransferSql, [id], (err, transfer) => {
            if (err || !transfer) {
                db.run('ROLLBACK');
                res.status(404).json({ error: 'Transferência não encontrada ou não está em trânsito' });
                return;
            }
            
            // Buscar itens da transferência
            const getItemsSql = `SELECT * FROM transfer_items WHERE transfer_id = ?`;
            
            db.all(getItemsSql, [id], (err, items) => {
                if (err) {
                    db.run('ROLLBACK');
                    res.status(500).json({ error: 'Erro ao buscar itens' });
                    return;
                }
                
                let processedItems = 0;
                let hasError = false;
                
                items.forEach(item => {
                    // Marcar item como recebido
                    const receiveItemSql = `
                        UPDATE transfer_items 
                        SET status = 'received', received_at = CURRENT_TIMESTAMP, received_by = ?
                        WHERE id = ?
                    `;
                    
                    db.run(receiveItemSql, [received_by, item.id], function(err) {
                        if (err) {
                            console.error('Erro ao marcar item recebido:', err);
                            hasError = true;
                            return;
                        }
                        
                        // Remover estoque da origem
                        const removeStockSql = `
                            INSERT INTO stock_movements (
                                qr_code, movement_type, from_location,
                                unrestrict_qty, foc_qty, rfb_qty,
                                reason, reference_doc, created_by
                            ) VALUES (?, 'transfer', ?, ?, ?, ?, ?, ?, ?)
                        `;
                        
                        db.run(removeStockSql, [
                            item.qr_code, transfer.from_location,
                            item.unrestrict_qty, item.foc_qty, item.rfb_qty,
                            `Transferência para ${transfer.to_location}`,
                            transfer.transfer_number,
                            received_by
                        ], function(err) {
                            if (err) {
                                console.error('Erro ao registrar saída:', err);
                                hasError = true;
                                return;
                            }
                            
                            // Atualizar localização do item
                            const updateLocationSql = `
                                UPDATE items 
                                SET location = ?, updated_at = CURRENT_TIMESTAMP
                                WHERE qr_code = ?
                            `;
                            
                            db.run(updateLocationSql, [transfer.to_location, item.qr_code], function(err) {
                                if (err) {
                                    console.error('Erro ao atualizar localização:', err);
                                    hasError = true;
                                    return;
                                }
                                
                                // Adicionar estoque no destino
                                const addStockSql = `
                                    INSERT INTO stock_movements (
                                        qr_code, movement_type, to_location,
                                        unrestrict_qty, foc_qty, rfb_qty,
                                        reason, reference_doc, created_by
                                    ) VALUES (?, 'transfer', ?, ?, ?, ?, ?, ?, ?)
                                `;
                                
                                db.run(addStockSql, [
                                    item.qr_code, transfer.to_location,
                                    item.unrestrict_qty, item.foc_qty, item.rfb_qty,
                                    `Transferência de ${transfer.from_location}`,
                                    transfer.transfer_number,
                                    received_by
                                ], function(err) {
                                    if (err) {
                                        console.error('Erro ao registrar entrada:', err);
                                        hasError = true;
                                        return;
                                    }
                                    
                                    processedItems++;
                                    
                                    // Se todos os itens foram processados
                                    if (processedItems === items.length) {
                                        if (hasError) {
                                            db.run('ROLLBACK');
                                            res.status(500).json({ error: 'Erro ao processar recebimento' });
                                        } else {
                                            // Marcar transferência como completa
                                            const completeTransferSql = `
                                                UPDATE location_transfers 
                                                SET status = 'completed', 
                                                    completed_by = ?, 
                                                    completed_at = CURRENT_TIMESTAMP
                                                WHERE id = ?
                                            `;
                                            
                                            db.run(completeTransferSql, [received_by, id], function(err) {
                                                if (err) {
                                                    db.run('ROLLBACK');
                                                    res.status(500).json({ error: 'Erro ao completar transferência' });
                                                    return;
                                                }
                                                
                                                db.run('COMMIT');
                                                res.json({
                                                    message: 'Transferência recebida e completada com sucesso',
                                                    items_received: processedItems,
                                                    transfer_number: transfer.transfer_number
                                                });
                                            });
                                        }
                                    }
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});

// Cancelar transferência
router.post('/:id/cancel', (req, res) => {
    const { id } = req.params;
    const { cancelled_by, reason } = req.body;
    
    if (!cancelled_by) {
        return res.status(400).json({ error: 'Responsável pelo cancelamento é obrigatório' });
    }
    
    const sql = `
        UPDATE location_transfers 
        SET status = 'cancelled', 
            notes = COALESCE(notes || ' | ', '') || 'Cancelado por: ' || ? || ' - Motivo: ' || ?
        WHERE id = ? AND status IN ('pending', 'in_transit')
    `;
    
    db.run(sql, [cancelled_by, reason || 'Não especificado', id], function(err) {
        if (err) {
            console.error('Erro ao cancelar transferência:', err);
            res.status(500).json({ error: 'Erro interno do servidor' });
            return;
        }
        
        if (this.changes === 0) {
            res.status(404).json({ error: 'Transferência não encontrada ou já finalizada' });
            return;
        }
        
        res.json({ message: 'Transferência cancelada com sucesso' });
    });
});

// Relatório de transferências
router.get('/report/summary', (req, res) => {
    const { date_from, date_to } = req.query;
    
    let sql = `
        SELECT 
            status,
            COUNT(*) as count,
            COUNT(DISTINCT from_location) as origin_locations,
            COUNT(DISTINCT to_location) as destination_locations,
            SUM(total_items) as total_items,
            ROUND(AVG(total_items), 2) as avg_items_per_transfer
        FROM location_transfers
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
    
    sql += ` GROUP BY status ORDER BY count DESC`;
    
    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error('Erro ao gerar relatório:', err);
            res.status(500).json({ error: 'Erro interno do servidor' });
            return;
        }
        res.json(rows);
    });
});

module.exports = router;
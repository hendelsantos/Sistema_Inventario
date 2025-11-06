const express = require('express');
const { db } = require('../database/database');
const router = express.Router();

// Listar bloqueios de itens
router.get('/', (req, res) => {
    const { 
        status = 'active', 
        block_type, 
        qr_code, 
        blocked_by,
        date_from,
        date_to,
        page = 1,
        limit = 20
    } = req.query;
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    let sql = `
        SELECT 
            ib.*,
            i.description,
            i.location,
            CASE ib.block_type
                WHEN 'count' THEN 'Contagem'
                WHEN 'transfer' THEN 'Transferência'
                WHEN 'adjustment' THEN 'Ajuste'
                WHEN 'maintenance' THEN 'Manutenção'
                ELSE ib.block_type
            END as block_type_desc,
            CASE ib.status
                WHEN 'active' THEN 'Ativo'
                WHEN 'released' THEN 'Liberado'
                ELSE ib.status
            END as status_desc,
            ROUND(
                (julianday('now') - julianday(ib.blocked_at)) * 24, 2
            ) as hours_blocked
        FROM item_blocks ib
        LEFT JOIN items i ON ib.qr_code = i.qr_code
        WHERE 1=1
    `;
    
    const params = [];
    
    if (status !== 'all') {
        sql += ` AND ib.status = ?`;
        params.push(status);
    }
    
    if (block_type) {
        sql += ` AND ib.block_type = ?`;
        params.push(block_type);
    }
    
    if (qr_code) {
        sql += ` AND ib.qr_code LIKE ?`;
        params.push(`%${qr_code}%`);
    }
    
    if (blocked_by) {
        sql += ` AND ib.blocked_by LIKE ?`;
        params.push(`%${blocked_by}%`);
    }
    
    if (date_from) {
        sql += ` AND date(ib.blocked_at) >= date(?)`;
        params.push(date_from);
    }
    
    if (date_to) {
        sql += ` AND date(ib.blocked_at) <= date(?)`;
        params.push(date_to);
    }
    
    sql += ` ORDER BY ib.blocked_at DESC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), offset);
    
    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error('Erro ao buscar bloqueios:', err);
            res.status(500).json({ error: 'Erro interno do servidor' });
            return;
        }
        
        res.json({
            blocks: rows,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });
    });
});

// Bloquear item
router.post('/block', (req, res) => {
    const { 
        qr_code, 
        block_type, 
        reason, 
        blocked_by, 
        notes 
    } = req.body;
    
    if (!qr_code || !block_type || !reason || !blocked_by) {
        return res.status(400).json({ 
            error: 'QR Code, tipo de bloqueio, motivo e responsável são obrigatórios' 
        });
    }
    
    const validBlockTypes = ['count', 'transfer', 'adjustment', 'maintenance'];
    if (!validBlockTypes.includes(block_type)) {
        return res.status(400).json({ 
            error: 'Tipo de bloqueio inválido. Valores aceitos: count, transfer, adjustment, maintenance' 
        });
    }
    
    db.serialize(() => {
        // Verificar se o item existe
        const checkItemSql = `SELECT id FROM items WHERE qr_code = ?`;
        
        db.get(checkItemSql, [qr_code], (err, item) => {
            if (err) {
                console.error('Erro ao verificar item:', err);
                res.status(500).json({ error: 'Erro interno do servidor' });
                return;
            }
            
            if (!item) {
                res.status(404).json({ error: 'Item não encontrado' });
                return;
            }
            
            // Verificar se já existe bloqueio ativo
            const checkBlockSql = `
                SELECT id FROM item_blocks 
                WHERE qr_code = ? AND status = 'active'
            `;
            
            db.get(checkBlockSql, [qr_code], (err, existingBlock) => {
                if (err) {
                    console.error('Erro ao verificar bloqueio existente:', err);
                    res.status(500).json({ error: 'Erro interno do servidor' });
                    return;
                }
                
                if (existingBlock) {
                    res.status(400).json({ 
                        error: 'Item já possui bloqueio ativo',
                        existing_block_id: existingBlock.id
                    });
                    return;
                }
                
                // Criar bloqueio
                const createBlockSql = `
                    INSERT INTO item_blocks (
                        qr_code, block_type, reason, blocked_by, notes
                    ) VALUES (?, ?, ?, ?, ?)
                `;
                
                db.run(createBlockSql, [
                    qr_code, block_type, reason, blocked_by, notes
                ], function(err) {
                    if (err) {
                        console.error('Erro ao criar bloqueio:', err);
                        res.status(500).json({ error: 'Erro interno do servidor' });
                        return;
                    }
                    
                    // Atualizar status do item se necessário
                    const updateItemSql = `
                        UPDATE items 
                        SET status = 'blocked', updated_at = CURRENT_TIMESTAMP
                        WHERE qr_code = ?
                    `;
                    
                    db.run(updateItemSql, [qr_code], function(err) {
                        if (err) {
                            console.error('Erro ao atualizar item:', err);
                            // Não falhar a operação principal
                        }
                        
                        res.status(201).json({
                            id: this.lastID,
                            message: 'Item bloqueado com sucesso',
                            qr_code,
                            block_type,
                            reason
                        });
                    });
                });
            });
        });
    });
});

// Desbloquear item
router.post('/unblock', (req, res) => {
    const { 
        qr_code, 
        unblocked_by, 
        notes 
    } = req.body;
    
    if (!qr_code || !unblocked_by) {
        return res.status(400).json({ 
            error: 'QR Code e responsável pelo desbloqueio são obrigatórios' 
        });
    }
    
    db.serialize(() => {
        // Buscar bloqueio ativo
        const getBlockSql = `
            SELECT * FROM item_blocks 
            WHERE qr_code = ? AND status = 'active'
            ORDER BY blocked_at DESC
            LIMIT 1
        `;
        
        db.get(getBlockSql, [qr_code], (err, block) => {
            if (err) {
                console.error('Erro ao buscar bloqueio:', err);
                res.status(500).json({ error: 'Erro interno do servidor' });
                return;
            }
            
            if (!block) {
                res.status(404).json({ error: 'Nenhum bloqueio ativo encontrado para este item' });
                return;
            }
            
            // Desbloquear item
            const unblockSql = `
                UPDATE item_blocks 
                SET status = 'released', 
                    unblocked_by = ?, 
                    unblocked_at = CURRENT_TIMESTAMP,
                    notes = COALESCE(notes || ' | ', '') || 'Desbloqueado: ' || ?
                WHERE id = ?
            `;
            
            db.run(unblockSql, [
                unblocked_by, 
                notes || 'Sem observações',
                block.id
            ], function(err) {
                if (err) {
                    console.error('Erro ao desbloquear item:', err);
                    res.status(500).json({ error: 'Erro interno do servidor' });
                    return;
                }
                
                // Atualizar status do item para ativo
                const updateItemSql = `
                    UPDATE items 
                    SET status = 'active', updated_at = CURRENT_TIMESTAMP
                    WHERE qr_code = ?
                `;
                
                db.run(updateItemSql, [qr_code], function(err) {
                    if (err) {
                        console.error('Erro ao atualizar item:', err);
                        // Não falhar a operação principal
                    }
                    
                    res.json({
                        message: 'Item desbloqueado com sucesso',
                        block_id: block.id,
                        qr_code,
                        blocked_duration_hours: Math.round(
                            (Date.now() - new Date(block.blocked_at).getTime()) / (1000 * 60 * 60) * 100
                        ) / 100
                    });
                });
            });
        });
    });
});

// Desbloquear por ID do bloqueio
router.post('/:id/unblock', (req, res) => {
    const { id } = req.params;
    const { unblocked_by, notes } = req.body;
    
    if (!unblocked_by) {
        return res.status(400).json({ 
            error: 'Responsável pelo desbloqueio é obrigatório' 
        });
    }
    
    db.serialize(() => {
        // Buscar bloqueio
        const getBlockSql = `SELECT * FROM item_blocks WHERE id = ? AND status = 'active'`;
        
        db.get(getBlockSql, [id], (err, block) => {
            if (err) {
                console.error('Erro ao buscar bloqueio:', err);
                res.status(500).json({ error: 'Erro interno do servidor' });
                return;
            }
            
            if (!block) {
                res.status(404).json({ error: 'Bloqueio não encontrado ou já liberado' });
                return;
            }
            
            // Desbloquear
            const unblockSql = `
                UPDATE item_blocks 
                SET status = 'released', 
                    unblocked_by = ?, 
                    unblocked_at = CURRENT_TIMESTAMP,
                    notes = COALESCE(notes || ' | ', '') || 'Desbloqueado: ' || ?
                WHERE id = ?
            `;
            
            db.run(unblockSql, [
                unblocked_by, 
                notes || 'Sem observações',
                id
            ], function(err) {
                if (err) {
                    console.error('Erro ao desbloquear item:', err);
                    res.status(500).json({ error: 'Erro interno do servidor' });
                    return;
                }
                
                // Atualizar status do item
                const updateItemSql = `
                    UPDATE items 
                    SET status = 'active', updated_at = CURRENT_TIMESTAMP
                    WHERE qr_code = ?
                `;
                
                db.run(updateItemSql, [block.qr_code], function(err) {
                    if (err) {
                        console.error('Erro ao atualizar item:', err);
                        // Não falhar a operação principal
                    }
                    
                    res.json({
                        message: 'Item desbloqueado com sucesso',
                        qr_code: block.qr_code,
                        block_type: block.block_type
                    });
                });
            });
        });
    });
});

// Verificar status de bloqueio de um item
router.get('/status/:qr_code', (req, res) => {
    const { qr_code } = req.params;
    
    const sql = `
        SELECT 
            ib.*,
            i.description,
            i.location,
            i.status as item_status,
            CASE ib.block_type
                WHEN 'count' THEN 'Contagem'
                WHEN 'transfer' THEN 'Transferência'
                WHEN 'adjustment' THEN 'Ajuste'
                WHEN 'maintenance' THEN 'Manutenção'
                ELSE ib.block_type
            END as block_type_desc,
            ROUND(
                (julianday('now') - julianday(ib.blocked_at)) * 24, 2
            ) as hours_blocked
        FROM item_blocks ib
        LEFT JOIN items i ON ib.qr_code = i.qr_code
        WHERE ib.qr_code = ? AND ib.status = 'active'
        ORDER BY ib.blocked_at DESC
        LIMIT 1
    `;
    
    db.get(sql, [qr_code], (err, block) => {
        if (err) {
            console.error('Erro ao verificar bloqueio:', err);
            res.status(500).json({ error: 'Erro interno do servidor' });
            return;
        }
        
        if (!block) {
            res.json({ 
                is_blocked: false, 
                message: 'Item não está bloqueado'
            });
            return;
        }
        
        res.json({
            is_blocked: true,
            block_details: block
        });
    });
});

// Histórico de bloqueios de um item
router.get('/history/:qr_code', (req, res) => {
    const { qr_code } = req.params;
    const { limit = 10 } = req.query;
    
    const sql = `
        SELECT 
            ib.*,
            CASE ib.block_type
                WHEN 'count' THEN 'Contagem'
                WHEN 'transfer' THEN 'Transferência'
                WHEN 'adjustment' THEN 'Ajuste'
                WHEN 'maintenance' THEN 'Manutenção'
                ELSE ib.block_type
            END as block_type_desc,
            CASE ib.status
                WHEN 'active' THEN 'Ativo'
                WHEN 'released' THEN 'Liberado'
                ELSE ib.status
            END as status_desc,
            CASE 
                WHEN ib.status = 'active' THEN 
                    ROUND((julianday('now') - julianday(ib.blocked_at)) * 24, 2)
                WHEN ib.unblocked_at IS NOT NULL THEN 
                    ROUND((julianday(ib.unblocked_at) - julianday(ib.blocked_at)) * 24, 2)
                ELSE NULL
            END as duration_hours
        FROM item_blocks ib
        WHERE ib.qr_code = ?
        ORDER BY ib.blocked_at DESC
        LIMIT ?
    `;
    
    db.all(sql, [qr_code, parseInt(limit)], (err, rows) => {
        if (err) {
            console.error('Erro ao buscar histórico:', err);
            res.status(500).json({ error: 'Erro interno do servidor' });
            return;
        }
        
        res.json({
            qr_code,
            history: rows
        });
    });
});

// Relatório de bloqueios
router.get('/report/summary', (req, res) => {
    const { date_from, date_to } = req.query;
    
    let sql = `
        SELECT 
            block_type,
            COUNT(*) as total_blocks,
            COUNT(CASE WHEN status = 'active' THEN 1 END) as active_blocks,
            COUNT(CASE WHEN status = 'released' THEN 1 END) as released_blocks,
            ROUND(AVG(
                CASE 
                    WHEN status = 'released' AND unblocked_at IS NOT NULL THEN 
                        (julianday(unblocked_at) - julianday(blocked_at)) * 24
                    ELSE NULL
                END
            ), 2) as avg_duration_hours,
            MIN(blocked_at) as first_block,
            MAX(blocked_at) as last_block
        FROM item_blocks
        WHERE 1=1
    `;
    
    const params = [];
    
    if (date_from) {
        sql += ` AND date(blocked_at) >= date(?)`;
        params.push(date_from);
    }
    
    if (date_to) {
        sql += ` AND date(blocked_at) <= date(?)`;
        params.push(date_to);
    }
    
    sql += ` GROUP BY block_type ORDER BY total_blocks DESC`;
    
    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error('Erro ao gerar relatório:', err);
            res.status(500).json({ error: 'Erro interno do servidor' });
            return;
        }
        
        // Buscar estatísticas gerais
        const generalStatsSql = `
            SELECT 
                COUNT(*) as total_blocks,
                COUNT(CASE WHEN status = 'active' THEN 1 END) as currently_blocked,
                COUNT(DISTINCT qr_code) as unique_items_blocked,
                COUNT(DISTINCT blocked_by) as unique_blockers,
                ROUND(AVG(
                    CASE 
                        WHEN status = 'released' AND unblocked_at IS NOT NULL THEN 
                            (julianday(unblocked_at) - julianday(blocked_at)) * 24
                        ELSE NULL
                    END
                ), 2) as overall_avg_duration_hours
            FROM item_blocks
            WHERE 1=1
            ${date_from ? ' AND date(blocked_at) >= date(?)' : ''}
            ${date_to ? ' AND date(blocked_at) <= date(?)' : ''}
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

// Itens atualmente bloqueados
router.get('/active', (req, res) => {
    const sql = `
        SELECT 
            ib.*,
            i.description,
            i.location,
            CASE ib.block_type
                WHEN 'count' THEN 'Contagem'
                WHEN 'transfer' THEN 'Transferência'
                WHEN 'adjustment' THEN 'Ajuste'
                WHEN 'maintenance' THEN 'Manutenção'
                ELSE ib.block_type
            END as block_type_desc,
            ROUND(
                (julianday('now') - julianday(ib.blocked_at)) * 24, 2
            ) as hours_blocked
        FROM item_blocks ib
        LEFT JOIN items i ON ib.qr_code = i.qr_code
        WHERE ib.status = 'active'
        ORDER BY ib.blocked_at DESC
    `;
    
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('Erro ao buscar itens bloqueados:', err);
            res.status(500).json({ error: 'Erro interno do servidor' });
            return;
        }
        
        res.json({
            active_blocks: rows,
            total_blocked: rows.length
        });
    });
});

module.exports = router;
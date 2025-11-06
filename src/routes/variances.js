const express = require('express');
const { db } = require('../database/database');
const router = express.Router();

// Listar diferenças de inventário
router.get('/', (req, res) => {
    const { status = 'all', location, date_from, date_to } = req.query;
    
    let sql = `
        SELECT 
            iv.*,
            i.description,
            i.location,
            ABS(iv.variance_total) as abs_variance,
            CASE 
                WHEN iv.variance_total > 0 THEN 'surplus'
                WHEN iv.variance_total < 0 THEN 'shortage'
                ELSE 'match'
            END as variance_type
        FROM inventory_variances iv
        LEFT JOIN items i ON iv.qr_code = i.qr_code
        WHERE 1=1
    `;
    
    const params = [];
    
    if (status !== 'all') {
        sql += ` AND iv.status = ?`;
        params.push(status);
    }
    
    if (location) {
        sql += ` AND iv.location LIKE ?`;
        params.push(`%${location}%`);
    }
    
    if (date_from) {
        sql += ` AND date(iv.count_date) >= date(?)`;
        params.push(date_from);
    }
    
    if (date_to) {
        sql += ` AND date(iv.count_date) <= date(?)`;
        params.push(date_to);
    }
    
    sql += ` ORDER BY ABS(iv.variance_total) DESC, iv.count_date DESC`;
    
    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error('Erro ao buscar diferenças:', err);
            res.status(500).json({ error: 'Erro interno do servidor' });
            return;
        }
        res.json(rows);
    });
});

// Criar diferença de inventário (comparar contagem atual com sistema)
router.post('/detect', (req, res) => {
    const { qr_code, counted_unrestrict, counted_foc, counted_rfb, location, reason } = req.body;
    
    if (!qr_code) {
        return res.status(400).json({ error: 'QR Code é obrigatório' });
    }
    
    // Buscar último estoque do sistema
    const getSystemStockSql = `
        SELECT 
            COALESCE(unrestrict, 0) as system_unrestrict,
            COALESCE(foc, 0) as system_foc,
            COALESCE(rfb, 0) as system_rfb
        FROM stock_counts 
        WHERE qr_code = ? 
        ORDER BY count_date DESC 
        LIMIT 1
    `;
    
    db.get(getSystemStockSql, [qr_code], (err, systemStock) => {
        if (err) {
            console.error('Erro ao buscar estoque do sistema:', err);
            res.status(500).json({ error: 'Erro interno do servidor' });
            return;
        }
        
        const systemUnrestrict = systemStock?.system_unrestrict || 0;
        const systemFoc = systemStock?.system_foc || 0;
        const systemRfb = systemStock?.system_rfb || 0;
        
        const countedUnrestrict = parseInt(counted_unrestrict) || 0;
        const countedFoc = parseInt(counted_foc) || 0;
        const countedRfb = parseInt(counted_rfb) || 0;
        
        // Calcular diferenças
        const varianceUnrestrict = countedUnrestrict - systemUnrestrict;
        const varianceFoc = countedFoc - systemFoc;
        const varianceRfb = countedRfb - systemRfb;
        const varianceTotal = varianceUnrestrict + varianceFoc + varianceRfb;
        
        // Se não há diferença, não criar registro
        if (varianceTotal === 0) {
            return res.json({ 
                message: 'Contagem confere com o sistema - sem diferenças',
                has_variance: false,
                variance_total: 0
            });
        }
        
        // Inserir diferença detectada
        const insertSql = `
            INSERT INTO inventory_variances (
                qr_code, location, 
                counted_unrestrict, counted_foc, counted_rfb,
                system_unrestrict, system_foc, system_rfb,
                reason, count_date
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `;
        
        db.run(insertSql, [
            qr_code, location,
            countedUnrestrict, countedFoc, countedRfb,
            systemUnrestrict, systemFoc, systemRfb,
            reason
        ], function(err) {
            if (err) {
                console.error('Erro ao inserir diferença:', err);
                res.status(500).json({ error: 'Erro interno do servidor' });
                return;
            }
            
            res.status(201).json({
                id: this.lastID,
                message: 'Diferença de inventário detectada',
                has_variance: true,
                variance_total: varianceTotal,
                variance_unrestrict: varianceUnrestrict,
                variance_foc: varianceFoc,
                variance_rfb: varianceRfb,
                variance_type: varianceTotal > 0 ? 'surplus' : 'shortage'
            });
        });
    });
});

// Aprovar diferença de inventário
router.post('/:id/approve', (req, res) => {
    const { id } = req.params;
    const { approved_by, adjustment_reason } = req.body;
    
    if (!approved_by) {
        return res.status(400).json({ error: 'Aprovador é obrigatório' });
    }
    
    db.serialize(() => {
        // Buscar detalhes da diferença
        const getVarianceSql = `SELECT * FROM inventory_variances WHERE id = ? AND status = 'pending'`;
        
        db.get(getVarianceSql, [id], (err, variance) => {
            if (err) {
                console.error('Erro ao buscar diferença:', err);
                res.status(500).json({ error: 'Erro interno do servidor' });
                return;
            }
            
            if (!variance) {
                res.status(404).json({ error: 'Diferença não encontrada ou já processada' });
                return;
            }
            
            // Aprovar diferença
            const approveSql = `
                UPDATE inventory_variances 
                SET status = 'approved', approved_by = ?, approved_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `;
            
            db.run(approveSql, [approved_by, id], function(err) {
                if (err) {
                    console.error('Erro ao aprovar diferença:', err);
                    res.status(500).json({ error: 'Erro interno do servidor' });
                    return;
                }
                
                // Criar ajuste no estoque (nova contagem com valores corrigidos)
                const adjustmentSql = `
                    INSERT INTO stock_counts (
                        item_id, qr_code, unrestrict, foc, rfb, 
                        count_type, notes, count_date
                    ) 
                    SELECT 
                        i.id, ?, ?, ?, ?,
                        'adjustment', ?, CURRENT_TIMESTAMP
                    FROM items i
                    WHERE i.qr_code = ?
                `;
                
                const adjustmentNotes = `Ajuste aprovado - ID: ${id} - ${adjustment_reason || 'Diferença de inventário'}`;
                
                db.run(adjustmentSql, [
                    variance.qr_code,
                    variance.counted_unrestrict,
                    variance.counted_foc,
                    variance.counted_rfb,
                    adjustmentNotes,
                    variance.qr_code
                ], function(err) {
                    if (err) {
                        console.error('Erro ao criar ajuste:', err);
                        res.status(500).json({ error: 'Erro ao criar ajuste de estoque' });
                        return;
                    }
                    
                    // Registrar movimentação de ajuste
                    const movementSql = `
                        INSERT INTO stock_movements (
                            qr_code, movement_type, to_location,
                            unrestrict_qty, foc_qty, rfb_qty,
                            reason, reference_doc, created_by
                        ) VALUES (?, 'adjustment', ?, ?, ?, ?, ?, ?, ?)
                    `;
                    
                    db.run(movementSql, [
                        variance.qr_code, variance.location,
                        variance.variance_unrestrict,
                        variance.variance_foc,
                        variance.variance_rfb,
                        `Ajuste de inventário aprovado - ${adjustment_reason || 'Diferença detectada'}`,
                        `VAR-${id}`,
                        approved_by
                    ], function(err) {
                        if (err) {
                            console.error('Erro ao registrar movimentação:', err);
                            // Não falhar a operação, apenas logar
                        }
                        
                        res.json({
                            message: 'Diferença aprovada e estoque ajustado com sucesso',
                            adjustment_id: this.lastID,
                            variance_id: id
                        });
                    });
                });
            });
        });
    });
});

// Rejeitar diferença de inventário
router.post('/:id/reject', (req, res) => {
    const { id } = req.params;
    const { approved_by, rejection_reason } = req.body;
    
    if (!approved_by) {
        return res.status(400).json({ error: 'Responsável pela rejeição é obrigatório' });
    }
    
    const sql = `
        UPDATE inventory_variances 
        SET status = 'rejected', 
            approved_by = ?, 
            approved_at = CURRENT_TIMESTAMP,
            reason = COALESCE(reason || ' | Rejeitado: ', '') || ?
        WHERE id = ? AND status = 'pending'
    `;
    
    db.run(sql, [approved_by, rejection_reason || 'Sem motivo especificado', id], function(err) {
        if (err) {
            console.error('Erro ao rejeitar diferença:', err);
            res.status(500).json({ error: 'Erro interno do servidor' });
            return;
        }
        
        if (this.changes === 0) {
            res.status(404).json({ error: 'Diferença não encontrada ou já processada' });
            return;
        }
        
        res.json({ message: 'Diferença rejeitada com sucesso' });
    });
});

// Relatório de diferenças por período
router.get('/report', (req, res) => {
    const { date_from, date_to, location } = req.query;
    
    let sql = `
        SELECT 
            iv.location,
            COUNT(*) as total_variances,
            COUNT(CASE WHEN iv.variance_total > 0 THEN 1 END) as surplus_count,
            COUNT(CASE WHEN iv.variance_total < 0 THEN 1 END) as shortage_count,
            COUNT(CASE WHEN iv.status = 'approved' THEN 1 END) as approved_count,
            COUNT(CASE WHEN iv.status = 'rejected' THEN 1 END) as rejected_count,
            COUNT(CASE WHEN iv.status = 'pending' THEN 1 END) as pending_count,
            SUM(ABS(iv.variance_total)) as total_abs_variance,
            SUM(iv.variance_total) as net_variance,
            ROUND(AVG(ABS(iv.variance_total)), 2) as avg_variance,
            MAX(ABS(iv.variance_total)) as max_variance,
            date(iv.count_date) as count_date
        FROM inventory_variances iv
        WHERE 1=1
    `;
    
    const params = [];
    
    if (date_from) {
        sql += ` AND date(iv.count_date) >= date(?)`;
        params.push(date_from);
    }
    
    if (date_to) {
        sql += ` AND date(iv.count_date) <= date(?)`;
        params.push(date_to);
    }
    
    if (location) {
        sql += ` AND iv.location LIKE ?`;
        params.push(`%${location}%`);
    }
    
    sql += ` GROUP BY iv.location, date(iv.count_date) ORDER BY count_date DESC, total_abs_variance DESC`;
    
    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error('Erro ao gerar relatório:', err);
            res.status(500).json({ error: 'Erro interno do servidor' });
            return;
        }
        res.json(rows);
    });
});

// Estatísticas gerais de diferenças
router.get('/stats', (req, res) => {
    const sql = `
        SELECT 
            COUNT(*) as total_variances,
            COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_variances,
            COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved_variances,
            COUNT(CASE WHEN status = 'rejected' THEN 1 END) as rejected_variances,
            COUNT(CASE WHEN variance_total > 0 THEN 1 END) as surplus_variances,
            COUNT(CASE WHEN variance_total < 0 THEN 1 END) as shortage_variances,
            SUM(ABS(variance_total)) as total_absolute_variance,
            SUM(variance_total) as net_variance,
            ROUND(AVG(ABS(variance_total)), 2) as average_variance,
            MAX(ABS(variance_total)) as max_variance,
            COUNT(DISTINCT location) as locations_with_variances,
            ROUND(
                COUNT(CASE WHEN status = 'approved' THEN 1 END) * 100.0 / 
                NULLIF(COUNT(CASE WHEN status IN ('approved', 'rejected') THEN 1 END), 0), 2
            ) as approval_rate
        FROM inventory_variances
        WHERE count_date >= date('now', '-30 days')
    `;
    
    db.get(sql, [], (err, stats) => {
        if (err) {
            console.error('Erro ao buscar estatísticas:', err);
            res.status(500).json({ error: 'Erro interno do servidor' });
            return;
        }
        res.json(stats || {});
    });
});

module.exports = router;
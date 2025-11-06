const express = require('express');
const { db } = require('../database/database');
const router = express.Router();

// Listar contagens cíclicas
router.get('/', (req, res) => {
    const sql = `
        SELECT 
            cc.*,
            COUNT(i.id) as total_items,
            COUNT(CASE WHEN cc.next_count_date <= date('now') THEN 1 END) as pending_counts
        FROM cyclic_counts cc
        LEFT JOIN items i ON i.location = cc.location AND i.status = 'active'
        GROUP BY cc.id
        ORDER BY cc.next_count_date ASC
    `;
    
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('Erro ao buscar contagens cíclicas:', err);
            res.status(500).json({ error: 'Erro interno do servidor' });
            return;
        }
        res.json(rows);
    });
});

// Criar nova contagem cíclica
router.post('/', (req, res) => {
    const { location, frequency_days, created_by } = req.body;
    
    if (!location || !frequency_days) {
        return res.status(400).json({ error: 'Localização e frequência são obrigatórios' });
    }
    
    // Calcular próxima data de contagem
    const nextCountDate = new Date();
    nextCountDate.setDate(nextCountDate.getDate() + parseInt(frequency_days));
    
    const sql = `
        INSERT INTO cyclic_counts (location, frequency_days, next_count_date, created_by)
        VALUES (?, ?, ?, ?)
    `;
    
    db.run(sql, [location, frequency_days, nextCountDate.toISOString(), created_by], function(err) {
        if (err) {
            console.error('Erro ao criar contagem cíclica:', err);
            if (err.message.includes('UNIQUE constraint failed')) {
                res.status(400).json({ error: 'Já existe uma contagem cíclica para esta localização' });
            } else {
                res.status(500).json({ error: 'Erro interno do servidor' });
            }
            return;
        }
        
        res.status(201).json({ 
            id: this.lastID, 
            message: 'Contagem cíclica criada com sucesso',
            next_count_date: nextCountDate.toISOString()
        });
    });
});

// Atualizar contagem cíclica
router.put('/:id', (req, res) => {
    const { id } = req.params;
    const { location, frequency_days, status } = req.body;
    
    const sql = `
        UPDATE cyclic_counts 
        SET location = ?, frequency_days = ?, status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
    `;
    
    db.run(sql, [location, frequency_days, status, id], function(err) {
        if (err) {
            console.error('Erro ao atualizar contagem cíclica:', err);
            res.status(500).json({ error: 'Erro interno do servidor' });
            return;
        }
        
        if (this.changes === 0) {
            res.status(404).json({ error: 'Contagem cíclica não encontrada' });
            return;
        }
        
        res.json({ message: 'Contagem cíclica atualizada com sucesso' });
    });
});

// Executar contagem cíclica
router.post('/:id/execute', (req, res) => {
    const { id } = req.params;
    const { created_by } = req.body;
    
    // Buscar detalhes da contagem cíclica
    const getCyclicSql = `SELECT * FROM cyclic_counts WHERE id = ? AND status = 'active'`;
    
    db.get(getCyclicSql, [id], (err, cyclicCount) => {
        if (err) {
            console.error('Erro ao buscar contagem cíclica:', err);
            res.status(500).json({ error: 'Erro interno do servidor' });
            return;
        }
        
        if (!cyclicCount) {
            res.status(404).json({ error: 'Contagem cíclica não encontrada ou inativa' });
            return;
        }
        
        // Buscar itens da localização
        const getItemsSql = `
            SELECT i.*, 
                   COALESCE(sc.unrestrict, 0) as last_unrestrict,
                   COALESCE(sc.foc, 0) as last_foc,
                   COALESCE(sc.rfb, 0) as last_rfb
            FROM items i
            LEFT JOIN (
                SELECT qr_code, unrestrict, foc, rfb,
                       ROW_NUMBER() OVER (PARTITION BY qr_code ORDER BY count_date DESC) as rn
                FROM stock_counts
            ) sc ON i.qr_code = sc.qr_code AND sc.rn = 1
            WHERE i.location = ? AND i.status = 'active'
        `;
        
        db.all(getItemsSql, [cyclicCount.location], (err, items) => {
            if (err) {
                console.error('Erro ao buscar itens:', err);
                res.status(500).json({ error: 'Erro interno do servidor' });
                return;
            }
            
            // Atualizar próxima data de contagem
            const nextCountDate = new Date();
            nextCountDate.setDate(nextCountDate.getDate() + cyclicCount.frequency_days);
            
            const updateCyclicSql = `
                UPDATE cyclic_counts 
                SET last_count_date = CURRENT_TIMESTAMP, 
                    next_count_date = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `;
            
            db.run(updateCyclicSql, [nextCountDate.toISOString(), id], function(err) {
                if (err) {
                    console.error('Erro ao atualizar contagem cíclica:', err);
                    res.status(500).json({ error: 'Erro interno do servidor' });
                    return;
                }
                
                res.json({
                    message: 'Contagem cíclica executada com sucesso',
                    location: cyclicCount.location,
                    items_count: items.length,
                    items: items,
                    next_count_date: nextCountDate.toISOString()
                });
            });
        });
    });
});

// Obter itens pendentes de contagem por localização
router.get('/pending/:location', (req, res) => {
    const { location } = req.params;
    
    const sql = `
        SELECT i.*, 
               COALESCE(sc.unrestrict, 0) as last_unrestrict,
               COALESCE(sc.foc, 0) as last_foc,
               COALESCE(sc.rfb, 0) as last_rfb,
               sc.count_date as last_count_date,
               CASE 
                   WHEN sc.count_date IS NULL THEN 'never_counted'
                   WHEN date(sc.count_date) < date('now', '-30 days') THEN 'overdue'
                   ELSE 'current'
               END as count_status
        FROM items i
        LEFT JOIN (
            SELECT qr_code, unrestrict, foc, rfb, count_date,
                   ROW_NUMBER() OVER (PARTITION BY qr_code ORDER BY count_date DESC) as rn
            FROM stock_counts
        ) sc ON i.qr_code = sc.qr_code AND sc.rn = 1
        WHERE i.location = ? AND i.status = 'active'
        ORDER BY sc.count_date ASC NULLS FIRST
    `;
    
    db.all(sql, [location], (err, rows) => {
        if (err) {
            console.error('Erro ao buscar itens pendentes:', err);
            res.status(500).json({ error: 'Erro interno do servidor' });
            return;
        }
        res.json(rows);
    });
});

// Deletar contagem cíclica
router.delete('/:id', (req, res) => {
    const { id } = req.params;
    
    const sql = `DELETE FROM cyclic_counts WHERE id = ?`;
    
    db.run(sql, [id], function(err) {
        if (err) {
            console.error('Erro ao deletar contagem cíclica:', err);
            res.status(500).json({ error: 'Erro interno do servidor' });
            return;
        }
        
        if (this.changes === 0) {
            res.status(404).json({ error: 'Contagem cíclica não encontrada' });
            return;
        }
        
        res.json({ message: 'Contagem cíclica removida com sucesso' });
    });
});

// Relatório de performance das contagens cíclicas
router.get('/performance', (req, res) => {
    const sql = `
        SELECT 
            cc.location,
            cc.frequency_days,
            cc.last_count_date,
            cc.next_count_date,
            cc.status,
            COUNT(i.id) as total_items,
            COUNT(CASE WHEN sc.count_date >= date('now', '-' || cc.frequency_days || ' days') THEN 1 END) as items_counted_on_time,
            ROUND(
                COUNT(CASE WHEN sc.count_date >= date('now', '-' || cc.frequency_days || ' days') THEN 1 END) * 100.0 / 
                NULLIF(COUNT(i.id), 0), 2
            ) as compliance_percentage,
            CASE 
                WHEN cc.next_count_date <= date('now') THEN 'overdue'
                WHEN cc.next_count_date <= date('now', '+3 days') THEN 'due_soon'
                ELSE 'on_schedule'
            END as schedule_status
        FROM cyclic_counts cc
        LEFT JOIN items i ON i.location = cc.location AND i.status = 'active'
        LEFT JOIN (
            SELECT qr_code, count_date,
                   ROW_NUMBER() OVER (PARTITION BY qr_code ORDER BY count_date DESC) as rn
            FROM stock_counts
        ) sc ON i.qr_code = sc.qr_code AND sc.rn = 1
        WHERE cc.status = 'active'
        GROUP BY cc.id, cc.location, cc.frequency_days, cc.last_count_date, cc.next_count_date, cc.status
        ORDER BY compliance_percentage ASC, cc.next_count_date ASC
    `;
    
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('Erro ao gerar relatório de performance:', err);
            res.status(500).json({ error: 'Erro interno do servidor' });
            return;
        }
        res.json(rows);
    });
});

module.exports = router;
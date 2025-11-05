const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const path = require('path');
const fs = require('fs');
const { db } = require('../database/database');

// GET - Exportar para Excel
router.get('/excel', (req, res) => {
    const { startDate, endDate } = req.query;

    let query = `
        SELECT 
            i.qr_code as "Código QR",
            i.description as "Descrição",
            i.location as "Localização",
            sc.unrestrict as "Unrestrict",
            sc.foc as "FOC",
            sc.rfb as "RFB",
            sc.total as "Total",
            datetime(sc.count_date, 'localtime') as "Data da Contagem",
            sc.notes as "Observações"
        FROM stock_counts sc
        JOIN items i ON sc.item_id = i.id
    `;

    const params = [];

    if (startDate && endDate) {
        query += ` WHERE DATE(sc.count_date) BETWEEN DATE(?) AND DATE(?)`;
        params.push(startDate, endDate);
    }

    query += ` ORDER BY sc.count_date DESC`;

    db.all(query, params, (err, data) => {
        if (err) {
            console.error('Erro ao exportar para Excel:', err);
            return res.status(500).json({ error: 'Erro interno do servidor' });
        }

        try {
            // Criar workbook
            const workbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.json_to_sheet(data);

            // Configurar largura das colunas
            const colWidths = [
                { wch: 20 }, // Código QR
                { wch: 30 }, // Descrição
                { wch: 20 }, // Localização
                { wch: 12 }, // Unrestrict
                { wch: 12 }, // FOC
                { wch: 12 }, // RFB
                { wch: 12 }, // Total
                { wch: 20 }, // Data da Contagem
                { wch: 30 }  // Observações
            ];
            worksheet['!cols'] = colWidths;

            XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventário');

            // Gerar nome do arquivo com timestamp
            const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
            const filename = `inventario_${timestamp}.xlsx`;
            const filepath = path.join(__dirname, '../../exports', filename);

            // Garantir que o diretório existe
            const exportsDir = path.dirname(filepath);
            if (!fs.existsSync(exportsDir)) {
                fs.mkdirSync(exportsDir, { recursive: true });
            }

            // Salvar arquivo
            XLSX.writeFile(workbook, filepath);

            // Enviar arquivo para download
            res.download(filepath, filename, (err) => {
                if (err) {
                    console.error('Erro ao enviar arquivo:', err);
                    res.status(500).json({ error: 'Erro ao enviar arquivo' });
                }

                // Remover arquivo após download (opcional)
                setTimeout(() => {
                    try {
                        fs.unlinkSync(filepath);
                    } catch (e) {
                        console.log('Erro ao remover arquivo temporário:', e.message);
                    }
                }, 60000); // Remove após 1 minuto
            });

        } catch (error) {
            console.error('Erro ao gerar Excel:', error);
            res.status(500).json({ error: 'Erro ao gerar arquivo Excel' });
        }
    });
});

// GET - Exportar para JSON
router.get('/json', (req, res) => {
    const { startDate, endDate } = req.query;

    let query = `
        SELECT 
            i.qr_code,
            i.description,
            i.location,
            i.notes as item_notes,
            sc.unrestrict,
            sc.foc,
            sc.rfb,
            sc.total,
            sc.count_date,
            sc.notes as count_notes,
            i.created_at as item_created,
            i.updated_at as item_updated
        FROM stock_counts sc
        JOIN items i ON sc.item_id = i.id
    `;

    const params = [];

    if (startDate && endDate) {
        query += ` WHERE DATE(sc.count_date) BETWEEN DATE(?) AND DATE(?)`;
        params.push(startDate, endDate);
    }

    query += ` ORDER BY sc.count_date DESC`;

    db.all(query, params, (err, data) => {
        if (err) {
            console.error('Erro ao exportar para JSON:', err);
            return res.status(500).json({ error: 'Erro interno do servidor' });
        }

        try {
            // Gerar nome do arquivo com timestamp
            const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
            const filename = `inventario_${timestamp}.json`;
            const filepath = path.join(__dirname, '../../exports', filename);

            // Garantir que o diretório existe
            const exportsDir = path.dirname(filepath);
            if (!fs.existsSync(exportsDir)) {
                fs.mkdirSync(exportsDir, { recursive: true });
            }

            // Preparar dados para exportação
            const exportData = {
                export_info: {
                    timestamp: new Date().toISOString(),
                    total_records: data.length,
                    filters: {
                        start_date: startDate || null,
                        end_date: endDate || null
                    }
                },
                data: data
            };

            // Salvar arquivo JSON
            fs.writeFileSync(filepath, JSON.stringify(exportData, null, 2), 'utf8');

            // Enviar arquivo para download
            res.download(filepath, filename, (err) => {
                if (err) {
                    console.error('Erro ao enviar arquivo:', err);
                    res.status(500).json({ error: 'Erro ao enviar arquivo' });
                }

                // Remover arquivo após download (opcional)
                setTimeout(() => {
                    try {
                        fs.unlinkSync(filepath);
                    } catch (e) {
                        console.log('Erro ao remover arquivo temporário:', e.message);
                    }
                }, 60000); // Remove após 1 minuto
            });

        } catch (error) {
            console.error('Erro ao gerar JSON:', error);
            res.status(500).json({ error: 'Erro ao gerar arquivo JSON' });
        }
    });
});

// GET - Estatísticas para dashboard
router.get('/stats', (req, res) => {
    const queries = {
        totalItems: 'SELECT COUNT(*) as count FROM items',
        totalCounts: 'SELECT COUNT(*) as count FROM stock_counts',
        todayCounts: 'SELECT COUNT(*) as count FROM stock_counts WHERE DATE(count_date) = DATE("now")',
        stockSummary: `
            SELECT 
                SUM(unrestrict) as total_unrestrict,
                SUM(foc) as total_foc,
                SUM(rfb) as total_rfb,
                SUM(total) as grand_total
            FROM (
                SELECT DISTINCT qr_code,
                       FIRST_VALUE(unrestrict) OVER (PARTITION BY qr_code ORDER BY count_date DESC) as unrestrict,
                       FIRST_VALUE(foc) OVER (PARTITION BY qr_code ORDER BY count_date DESC) as foc,
                       FIRST_VALUE(rfb) OVER (PARTITION BY qr_code ORDER BY count_date DESC) as rfb,
                       FIRST_VALUE(total) OVER (PARTITION BY qr_code ORDER BY count_date DESC) as total
                FROM stock_counts
            )
        `
    };

    const stats = {};
    let completed = 0;
    const total = Object.keys(queries).length;

    Object.entries(queries).forEach(([key, query]) => {
        db.get(query, (err, result) => {
            if (err) {
                console.error(`Erro na query ${key}:`, err);
                stats[key] = null;
            } else {
                stats[key] = result;
            }

            completed++;
            if (completed === total) {
                res.json(stats);
            }
        });
    });
});

module.exports = router;
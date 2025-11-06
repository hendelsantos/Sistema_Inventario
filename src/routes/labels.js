const express = require('express');
const { db } = require('../database/database');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const router = express.Router();

// Listar templates de etiquetas
router.get('/templates', (req, res) => {
    const sql = `
        SELECT 
            *,
            CASE WHEN is_default = 1 THEN 'Sim' ELSE 'Não' END as is_default_desc
        FROM label_templates 
        ORDER BY is_default DESC, name ASC
    `;
    
    db.all(sql, [], (err, rows) => {
        if (err) {
            console.error('Erro ao buscar templates:', err);
            res.status(500).json({ error: 'Erro interno do servidor' });
            return;
        }
        res.json(rows);
    });
});

// Criar template de etiqueta
router.post('/templates', (req, res) => {
    const {
        name,
        description,
        width,
        height,
        qr_size,
        font_size,
        include_description,
        include_location,
        include_stock,
        template_data,
        created_by,
        is_default
    } = req.body;
    
    if (!name) {
        return res.status(400).json({ error: 'Nome do template é obrigatório' });
    }
    
    db.serialize(() => {
        // Se for template padrão, remover padrão dos outros
        if (is_default) {
            db.run(`UPDATE label_templates SET is_default = 0`);
        }
        
        const sql = `
            INSERT INTO label_templates (
                name, description, width, height, qr_size, font_size,
                include_description, include_location, include_stock,
                template_data, created_by, is_default
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        db.run(sql, [
            name, description || '',
            parseInt(width) || 100,
            parseInt(height) || 60,
            parseInt(qr_size) || 25,
            parseInt(font_size) || 12,
            include_description ? 1 : 0,
            include_location ? 1 : 0,
            include_stock ? 1 : 0,
            JSON.stringify(template_data || {}),
            created_by || 'sistema',
            is_default ? 1 : 0
        ], function(err) {
            if (err) {
                console.error('Erro ao criar template:', err);
                if (err.message.includes('UNIQUE constraint failed')) {
                    res.status(400).json({ error: 'Já existe um template com este nome' });
                } else {
                    res.status(500).json({ error: 'Erro interno do servidor' });
                }
                return;
            }
            
            res.status(201).json({
                id: this.lastID,
                message: 'Template criado com sucesso'
            });
        });
    });
});

// Atualizar template
router.put('/templates/:id', (req, res) => {
    const { id } = req.params;
    const {
        name,
        description,
        width,
        height,
        qr_size,
        font_size,
        include_description,
        include_location,
        include_stock,
        template_data,
        is_default
    } = req.body;
    
    db.serialize(() => {
        // Se for template padrão, remover padrão dos outros
        if (is_default) {
            db.run(`UPDATE label_templates SET is_default = 0 WHERE id != ?`, [id]);
        }
        
        const sql = `
            UPDATE label_templates SET
                name = ?, description = ?, width = ?, height = ?, qr_size = ?,
                font_size = ?, include_description = ?, include_location = ?,
                include_stock = ?, template_data = ?, is_default = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `;
        
        db.run(sql, [
            name, description || '',
            parseInt(width) || 100,
            parseInt(height) || 60,
            parseInt(qr_size) || 25,
            parseInt(font_size) || 12,
            include_description ? 1 : 0,
            include_location ? 1 : 0,
            include_stock ? 1 : 0,
            JSON.stringify(template_data || {}),
            is_default ? 1 : 0,
            id
        ], function(err) {
            if (err) {
                console.error('Erro ao atualizar template:', err);
                res.status(500).json({ error: 'Erro interno do servidor' });
                return;
            }
            
            if (this.changes === 0) {
                res.status(404).json({ error: 'Template não encontrado' });
                return;
            }
            
            res.json({ message: 'Template atualizado com sucesso' });
        });
    });
});

// Deletar template
router.delete('/templates/:id', (req, res) => {
    const { id } = req.params;
    
    // Não permitir deletar template padrão se for o único
    const checkSql = `SELECT COUNT(*) as total FROM label_templates`;
    
    db.get(checkSql, [], (err, result) => {
        if (err) {
            console.error('Erro ao verificar templates:', err);
            res.status(500).json({ error: 'Erro interno do servidor' });
            return;
        }
        
        if (result.total <= 1) {
            res.status(400).json({ error: 'Não é possível deletar o último template' });
            return;
        }
        
        const deleteSql = `DELETE FROM label_templates WHERE id = ?`;
        
        db.run(deleteSql, [id], function(err) {
            if (err) {
                console.error('Erro ao deletar template:', err);
                res.status(500).json({ error: 'Erro interno do servidor' });
                return;
            }
            
            if (this.changes === 0) {
                res.status(404).json({ error: 'Template não encontrado' });
                return;
            }
            
            res.json({ message: 'Template removido com sucesso' });
        });
    });
});

// Gerar etiquetas em PDF
router.post('/generate', async (req, res) => {
    const {
        items, // Array de QR codes ou dados dos itens
        template_id,
        custom_template,
        copies_per_item = 1
    } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Lista de itens é obrigatória' });
    }
    
    try {
        // Buscar template
        let template;
        if (template_id) {
            const templateSql = `SELECT * FROM label_templates WHERE id = ?`;
            template = await new Promise((resolve, reject) => {
                db.get(templateSql, [template_id], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
        } else if (custom_template) {
            template = custom_template;
        } else {
            // Usar template padrão
            const defaultTemplateSql = `SELECT * FROM label_templates WHERE is_default = 1 LIMIT 1`;
            template = await new Promise((resolve, reject) => {
                db.get(defaultTemplateSql, [], (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                });
            });
        }
        
        if (!template) {
            return res.status(404).json({ error: 'Template não encontrado' });
        }
        
        // Buscar dados dos itens
        const itemData = await Promise.all(
            items.map(async (item) => {
                const qrCode = typeof item === 'string' ? item : item.qr_code;
                
                const itemSql = `
                    SELECT 
                        i.*,
                        sc.unrestrict,
                        sc.foc,
                        sc.rfb,
                        sc.total
                    FROM items i
                    LEFT JOIN (
                        SELECT qr_code, unrestrict, foc, rfb, total,
                               ROW_NUMBER() OVER (PARTITION BY qr_code ORDER BY count_date DESC) as rn
                        FROM stock_counts
                    ) sc ON i.qr_code = sc.qr_code AND sc.rn = 1
                    WHERE i.qr_code = ?
                `;
                
                return new Promise((resolve, reject) => {
                    db.get(itemSql, [qrCode], (err, row) => {
                        if (err) {
                            reject(err);
                        } else if (!row) {
                            resolve({ qr_code: qrCode, description: 'Item não encontrado', location: '', unrestrict: 0, foc: 0, rfb: 0, total: 0 });
                        } else {
                            resolve(row);
                        }
                    });
                });
            })
        );
        
        // Gerar PDF
        const doc = new PDFDocument({ 
            size: 'A4',
            margins: { top: 20, bottom: 20, left: 20, right: 20 }
        });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="etiquetas.pdf"');
        
        doc.pipe(res);
        
        // Configurações do template
        const labelWidth = parseFloat(template.width) * 2.83465; // mm para pontos
        const labelHeight = parseFloat(template.height) * 2.83465;
        const qrSize = parseFloat(template.qr_size) * 2.83465;
        const fontSize = parseInt(template.font_size) || 12;
        
        // Layout da página
        const pageWidth = 595; // A4 width em pontos
        const pageHeight = 842; // A4 height em pontos
        const margin = 20;
        
        const labelsPerRow = Math.floor((pageWidth - 2 * margin) / labelWidth);
        const labelsPerCol = Math.floor((pageHeight - 2 * margin) / labelHeight);
        const labelsPerPage = labelsPerRow * labelsPerCol;
        
        let currentLabel = 0;
        let currentRow = 0;
        let currentCol = 0;
        
        // Gerar etiquetas para cada item
        for (const item of itemData) {
            for (let copy = 0; copy < copies_per_item; copy++) {
                // Nova página se necessário
                if (currentLabel > 0 && currentLabel % labelsPerPage === 0) {
                    doc.addPage();
                    currentRow = 0;
                    currentCol = 0;
                }
                
                // Calcular posição da etiqueta
                const x = margin + (currentCol * labelWidth);
                const y = margin + (currentRow * labelHeight);
                
                // Gerar QR Code
                const qrCodeDataURL = await QRCode.toDataURL(item.qr_code, {
                    width: qrSize,
                    margin: 1,
                    color: {
                        dark: '#000000',
                        light: '#FFFFFF'
                    }
                });
                
                // Converter DataURL para Buffer
                const qrBuffer = Buffer.from(qrCodeDataURL.split(',')[1], 'base64');
                
                // Desenhar borda da etiqueta (opcional)
                doc.rect(x, y, labelWidth, labelHeight).stroke();
                
                // Layout horizontal (QR à esquerda, texto à direita)
                const templateData = typeof template.template_data === 'string' ? 
                    JSON.parse(template.template_data) : template.template_data;
                
                const layout = templateData?.layout || 'horizontal';
                
                if (layout === 'horizontal') {
                    // QR Code à esquerda
                    doc.image(qrBuffer, x + 5, y + 5, { width: qrSize, height: qrSize });
                    
                    // Texto à direita
                    const textX = x + qrSize + 10;
                    const textWidth = labelWidth - qrSize - 15;
                    let textY = y + 5;
                    
                    // QR Code (sempre mostrar)
                    doc.fontSize(fontSize - 2).text(item.qr_code, textX, textY, { 
                        width: textWidth, 
                        align: 'left' 
                    });
                    textY += fontSize;
                    
                    // Descrição
                    if (template.include_description && item.description) {
                        doc.fontSize(fontSize).text(item.description, textX, textY, { 
                            width: textWidth, 
                            align: 'left',
                            ellipsis: true
                        });
                        textY += fontSize + 2;
                    }
                    
                    // Localização
                    if (template.include_location && item.location) {
                        doc.fontSize(fontSize - 1).text(`Local: ${item.location}`, textX, textY, { 
                            width: textWidth, 
                            align: 'left' 
                        });
                        textY += fontSize;
                    }
                    
                    // Estoque
                    if (template.include_stock) {
                        const stockText = `U:${item.unrestrict || 0} F:${item.foc || 0} R:${item.rfb || 0}`;
                        doc.fontSize(fontSize - 2).text(stockText, textX, textY, { 
                            width: textWidth, 
                            align: 'left' 
                        });
                    }
                } else {
                    // Layout vertical (QR em cima, texto embaixo)
                    const qrX = x + (labelWidth - qrSize) / 2;
                    doc.image(qrBuffer, qrX, y + 5, { width: qrSize, height: qrSize });
                    
                    let textY = y + qrSize + 10;
                    
                    // QR Code
                    doc.fontSize(fontSize - 2).text(item.qr_code, x + 5, textY, { 
                        width: labelWidth - 10, 
                        align: 'center' 
                    });
                    textY += fontSize;
                    
                    // Descrição
                    if (template.include_description && item.description) {
                        doc.fontSize(fontSize - 1).text(item.description, x + 5, textY, { 
                            width: labelWidth - 10, 
                            align: 'center',
                            ellipsis: true
                        });
                        textY += fontSize;
                    }
                    
                    // Localização e estoque em linha
                    const bottomText = [];
                    if (template.include_location && item.location) {
                        bottomText.push(item.location);
                    }
                    if (template.include_stock) {
                        bottomText.push(`T:${item.total || 0}`);
                    }
                    
                    if (bottomText.length > 0) {
                        doc.fontSize(fontSize - 2).text(bottomText.join(' | '), x + 5, textY, { 
                            width: labelWidth - 10, 
                            align: 'center' 
                        });
                    }
                }
                
                // Próxima posição
                currentCol++;
                if (currentCol >= labelsPerRow) {
                    currentCol = 0;
                    currentRow++;
                }
                
                currentLabel++;
            }
        }
        
        doc.end();
        
    } catch (error) {
        console.error('Erro ao gerar etiquetas:', error);
        res.status(500).json({ error: 'Erro ao gerar etiquetas: ' + error.message });
    }
});

// Gerar etiqueta de amostra
router.get('/templates/:id/preview', async (req, res) => {
    const { id } = req.params;
    
    try {
        // Buscar template
        const templateSql = `SELECT * FROM label_templates WHERE id = ?`;
        const template = await new Promise((resolve, reject) => {
            db.get(templateSql, [id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        if (!template) {
            return res.status(404).json({ error: 'Template não encontrado' });
        }
        
        // Dados de amostra
        const sampleItem = {
            qr_code: '12345678901234567',
            description: 'Item de Exemplo para Teste',
            location: 'A-01-001',
            unrestrict: 50,
            foc: 25,
            rfb: 10,
            total: 85
        };
        
        // Gerar PDF de amostra
        const doc = new PDFDocument({ 
            size: [parseFloat(template.width) * 2.83465 + 40, parseFloat(template.height) * 2.83465 + 40],
            margins: { top: 20, bottom: 20, left: 20, right: 20 }
        });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline; filename="preview.pdf"');
        
        doc.pipe(res);
        
        const labelWidth = parseFloat(template.width) * 2.83465;
        const labelHeight = parseFloat(template.height) * 2.83465;
        const qrSize = parseFloat(template.qr_size) * 2.83465;
        const fontSize = parseInt(template.font_size) || 12;
        
        const x = 20;
        const y = 20;
        
        // Gerar QR Code de amostra
        const qrCodeDataURL = await QRCode.toDataURL(sampleItem.qr_code, {
            width: qrSize,
            margin: 1
        });
        
        const qrBuffer = Buffer.from(qrCodeDataURL.split(',')[1], 'base64');
        
        // Desenhar etiqueta de amostra
        doc.rect(x, y, labelWidth, labelHeight).stroke();
        
        const templateData = typeof template.template_data === 'string' ? 
            JSON.parse(template.template_data) : template.template_data;
        
        const layout = templateData?.layout || 'horizontal';
        
        if (layout === 'horizontal') {
            doc.image(qrBuffer, x + 5, y + 5, { width: qrSize, height: qrSize });
            
            const textX = x + qrSize + 10;
            const textWidth = labelWidth - qrSize - 15;
            let textY = y + 5;
            
            doc.fontSize(fontSize - 2).text(sampleItem.qr_code, textX, textY, { width: textWidth, align: 'left' });
            textY += fontSize;
            
            if (template.include_description) {
                doc.fontSize(fontSize).text(sampleItem.description, textX, textY, { width: textWidth, align: 'left', ellipsis: true });
                textY += fontSize + 2;
            }
            
            if (template.include_location) {
                doc.fontSize(fontSize - 1).text(`Local: ${sampleItem.location}`, textX, textY, { width: textWidth, align: 'left' });
                textY += fontSize;
            }
            
            if (template.include_stock) {
                doc.fontSize(fontSize - 2).text(`U:${sampleItem.unrestrict} F:${sampleItem.foc} R:${sampleItem.rfb}`, textX, textY, { width: textWidth, align: 'left' });
            }
        } else {
            const qrX = x + (labelWidth - qrSize) / 2;
            doc.image(qrBuffer, qrX, y + 5, { width: qrSize, height: qrSize });
            
            let textY = y + qrSize + 10;
            
            doc.fontSize(fontSize - 2).text(sampleItem.qr_code, x + 5, textY, { width: labelWidth - 10, align: 'center' });
            textY += fontSize;
            
            if (template.include_description) {
                doc.fontSize(fontSize - 1).text(sampleItem.description, x + 5, textY, { width: labelWidth - 10, align: 'center', ellipsis: true });
                textY += fontSize;
            }
            
            const bottomText = [];
            if (template.include_location) bottomText.push(sampleItem.location);
            if (template.include_stock) bottomText.push(`T:${sampleItem.total}`);
            
            if (bottomText.length > 0) {
                doc.fontSize(fontSize - 2).text(bottomText.join(' | '), x + 5, textY, { width: labelWidth - 10, align: 'center' });
            }
        }
        
        doc.end();
        
    } catch (error) {
        console.error('Erro ao gerar preview:', error);
        res.status(500).json({ error: 'Erro ao gerar preview: ' + error.message });
    }
});

// Gerar etiquetas por localização
router.post('/generate/location', async (req, res) => {
    const { location, template_id, copies_per_item = 1 } = req.body;
    
    if (!location) {
        return res.status(400).json({ error: 'Localização é obrigatória' });
    }
    
    try {
        // Buscar itens da localização
        const itemsSql = `
            SELECT 
                i.*,
                sc.unrestrict,
                sc.foc,
                sc.rfb,
                sc.total
            FROM items i
            LEFT JOIN (
                SELECT qr_code, unrestrict, foc, rfb, total,
                       ROW_NUMBER() OVER (PARTITION BY qr_code ORDER BY count_date DESC) as rn
                FROM stock_counts
            ) sc ON i.qr_code = sc.qr_code AND sc.rn = 1
            WHERE i.location LIKE ? AND i.status = 'active'
            ORDER BY i.description
        `;
        
        const items = await new Promise((resolve, reject) => {
            db.all(itemsSql, [`%${location}%`], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
        
        if (items.length === 0) {
            return res.status(404).json({ error: 'Nenhum item encontrado para esta localização' });
        }
        
        // Usar o endpoint de geração com os itens encontrados
        req.body.items = items.map(item => item.qr_code);
        req.body.copies_per_item = copies_per_item;
        
        // Redirecionar para o gerador principal
        return router.stack.find(layer => 
            layer.route && layer.route.path === '/generate' && layer.route.methods.post
        ).route.stack[0].handle(req, res);
        
    } catch (error) {
        console.error('Erro ao buscar itens por localização:', error);
        res.status(500).json({ error: 'Erro interno do servidor' });
    }
});

module.exports = router;
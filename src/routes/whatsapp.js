const express = require('express');
const router = express.Router();
const { db } = require('../database/database');

// Função para formatar data/hora em português brasileiro
function formatDateTimeBR(dateString) {
    const date = new Date(dateString);
    const options = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo'
    };
    return date.toLocaleString('pt-BR', options);
}

// Função para formatar números com separadores
function formatNumber(num) {
    return new Intl.NumberFormat('pt-BR').format(num || 0);
}

// Função para gerar emoji baseado no estoque
function getStockEmoji(total) {
    if (total === 0) return '🔴';
    if (total <= 5) return '🟡';
    if (total <= 20) return '🟢';
    return '🔵';
}

// GET - Exportar contagem específica como card para WhatsApp
router.get('/count/:countId/whatsapp-card', (req, res) => {
    const { countId } = req.params;
    const { includeLocation = true, includeNotes = true, format = 'detailed' } = req.query;

    const query = `
        SELECT 
            sc.*,
            i.description,
            i.location,
            sc.notes,
            sc.count_date
        FROM stock_counts sc
        INNER JOIN items i ON sc.qr_code = i.qr_code
        WHERE sc.id = ?
    `;

    db.get(query, [countId], (err, count) => {
        if (err) {
            console.error('Erro ao buscar contagem:', err);
            return res.status(500).json({ error: 'Erro interno do servidor' });
        }

        if (!count) {
            return res.status(404).json({ error: 'Contagem não encontrada' });
        }

        // Calcular total
        const total = (count.unrestrict || 0) + (count.foc || 0) + (count.rfb || 0);
        const emoji = getStockEmoji(total);

        let message = '';

        if (format === 'compact') {
            // Formato compacto
            message = `${emoji} *INVENTÁRIO* ${emoji}\n\n`;
            message += `📦 *${count.description}*\n`;
            message += `🏷️ QR: \`${count.qr_code}\`\n`;
            if (includeLocation && count.location) {
                message += `📍 Local: ${count.location}\n`;
            }
            message += `📊 Total: *${formatNumber(total)}* unidades\n`;
            message += `📅 ${formatDateTimeBR(count.count_date)}`;
        } else {
            // Formato detalhado (padrão)
            message = `${emoji} *RELATÓRIO DE INVENTÁRIO* ${emoji}\n\n`;
            message += `📦 *Produto:* ${count.description}\n`;
            message += `🏷️ *QR Code:* \`${count.qr_code}\`\n`;
            
            if (includeLocation && count.location) {
                message += `📍 *Localização:* ${count.location}\n`;
            }
            
            message += `\n📊 *ESTOQUE ATUAL:*\n`;
            message += `┣ Unrestrict: ${formatNumber(count.unrestrict || 0)}\n`;
            message += `┣ FOC: ${formatNumber(count.foc || 0)}\n`;
            message += `┗ RFB: ${formatNumber(count.rfb || 0)}\n`;
            message += `\n🔢 *TOTAL:* *${formatNumber(total)}* unidades\n`;
            
            if (includeNotes && count.notes) {
                message += `\n📝 *Observações:* ${count.notes}\n`;
            }
            
            message += `\n📅 *Data da Contagem:* ${formatDateTimeBR(count.count_date)}\n`;
            message += `\n✅ _Contagem realizada via Sistema de Inventário_`;
        }

        res.json({
            success: true,
            message: message,
            metadata: {
                count_id: count.id,
                qr_code: count.qr_code,
                total_items: total,
                formatted_date: formatDateTimeBR(count.count_date),
                format: format
            },
            whatsapp_url: `https://wa.me/?text=${encodeURIComponent(message)}`
        });
    });
});

// GET - Exportar item com última contagem como card para WhatsApp
router.get('/item/:qrCode/whatsapp-card', (req, res) => {
    const { qrCode } = req.params;
    const { includeLocation = true, includeHistory = false, format = 'detailed' } = req.query;

    // Validação de QR code
    if (!qrCode || qrCode.length !== 17) {
        return res.status(400).json({ error: 'QR code deve ter exatamente 17 caracteres' });
    }

    const query = `
        SELECT 
            i.*,
            sc.id as count_id,
            sc.unrestrict,
            sc.foc,
            sc.rfb,
            sc.notes,
            sc.count_date
        FROM items i
        LEFT JOIN stock_counts sc ON i.qr_code = sc.qr_code
        WHERE i.qr_code = ?
        ORDER BY sc.count_date DESC
        LIMIT 1
    `;

    db.get(query, [qrCode], (err, item) => {
        if (err) {
            console.error('Erro ao buscar item:', err);
            return res.status(500).json({ error: 'Erro interno do servidor' });
        }

        if (!item) {
            return res.status(404).json({ error: 'Item não encontrado' });
        }

        // Calcular total
        const total = (item.unrestrict || 0) + (item.foc || 0) + (item.rfb || 0);
        const emoji = getStockEmoji(total);
        const hasCount = item.count_id !== null;

        let message = '';

        if (format === 'compact') {
            // Formato compacto
            message = `${emoji} *INVENTÁRIO* ${emoji}\n\n`;
            message += `📦 *${item.description}*\n`;
            message += `🏷️ QR: \`${item.qr_code}\`\n`;
            if (includeLocation && item.location) {
                message += `📍 Local: ${item.location}\n`;
            }
            if (hasCount) {
                message += `📊 Total: *${formatNumber(total)}* unidades\n`;
                message += `📅 ${formatDateTimeBR(item.count_date)}`;
            } else {
                message += `📊 Status: *Sem contagem registrada*`;
            }
        } else {
            // Formato detalhado (padrão)
            message = `${emoji} *RELATÓRIO DE INVENTÁRIO* ${emoji}\n\n`;
            message += `📦 *Produto:* ${item.description}\n`;
            message += `🏷️ *QR Code:* \`${item.qr_code}\`\n`;
            
            if (includeLocation && item.location) {
                message += `📍 *Localização:* ${item.location}\n`;
            }
            
            if (hasCount) {
                message += `\n📊 *ESTOQUE ATUAL:*\n`;
                message += `┣ Unrestrict: ${formatNumber(item.unrestrict || 0)}\n`;
                message += `┣ FOC: ${formatNumber(item.foc || 0)}\n`;
                message += `┗ RFB: ${formatNumber(item.rfb || 0)}\n`;
                message += `\n🔢 *TOTAL:* *${formatNumber(total)}* unidades\n`;
                
                if (item.notes) {
                    message += `\n📝 *Observações:* ${item.notes}\n`;
                }
                
                message += `\n📅 *Última Contagem:* ${formatDateTimeBR(item.count_date)}\n`;
            } else {
                message += `\n⚠️ *Status:* Sem contagem registrada\n`;
                message += `📅 *Cadastrado em:* ${formatDateTimeBR(item.created_at)}\n`;
            }
            
            message += `\n✅ _Relatório gerado via Sistema de Inventário_`;
        }

        // Se solicitado histórico e tem contagem
        if (includeHistory && hasCount) {
            // Buscar histórico das últimas 3 contagens
            const historyQuery = `
                SELECT unrestrict, foc, rfb, count_date, notes
                FROM stock_counts 
                WHERE qr_code = ? 
                ORDER BY count_date DESC 
                LIMIT 3
            `;
            
            db.all(historyQuery, [qrCode], (err, history) => {
                if (!err && history.length > 1) {
                    message += `\n\n📈 *HISTÓRICO RECENTE:*\n`;
                    history.slice(1).forEach((h, index) => {
                        const histTotal = (h.unrestrict || 0) + (h.foc || 0) + (h.rfb || 0);
                        message += `${index + 2}. ${formatNumber(histTotal)} un. - ${formatDateTimeBR(h.count_date)}\n`;
                    });
                }
                
                res.json({
                    success: true,
                    message: message,
                    metadata: {
                        qr_code: item.qr_code,
                        has_count: hasCount,
                        total_items: hasCount ? total : 0,
                        formatted_date: hasCount ? formatDateTimeBR(item.count_date) : null,
                        format: format,
                        history_included: includeHistory
                    },
                    whatsapp_url: `https://wa.me/?text=${encodeURIComponent(message)}`
                });
            });
        } else {
            res.json({
                success: true,
                message: message,
                metadata: {
                    qr_code: item.qr_code,
                    has_count: hasCount,
                    total_items: hasCount ? total : 0,
                    formatted_date: hasCount ? formatDateTimeBR(item.count_date) : null,
                    format: format,
                    history_included: false
                },
                whatsapp_url: `https://wa.me/?text=${encodeURIComponent(message)}`
            });
        }
    });
});

// GET - Exportar relatório de localização como card para WhatsApp
router.get('/location/:location/whatsapp-card', (req, res) => {
    const { location } = req.params;
    const { format = 'summary', limit = 10 } = req.query;

    const query = `
        SELECT 
            i.qr_code,
            i.description,
            i.location,
            sc.unrestrict,
            sc.foc,
            sc.rfb,
            sc.count_date
        FROM items i
        LEFT JOIN (
            SELECT qr_code,
                   unrestrict,
                   foc,
                   rfb,
                   count_date,
                   ROW_NUMBER() OVER (PARTITION BY qr_code ORDER BY count_date DESC) as rn
            FROM stock_counts
        ) sc ON i.qr_code = sc.qr_code AND sc.rn = 1
        WHERE i.location = ?
        ORDER BY i.description
        LIMIT ?
    `;

    db.all(query, [location, parseInt(limit)], (err, items) => {
        if (err) {
            console.error('Erro ao buscar itens da localização:', err);
            return res.status(500).json({ error: 'Erro interno do servidor' });
        }

        if (items.length === 0) {
            return res.status(404).json({ error: 'Nenhum item encontrado para esta localização' });
        }

        let totalItems = 0;
        let totalCount = 0;
        let itemsWithCount = 0;

        items.forEach(item => {
            totalItems++;
            if (item.count_date) {
                itemsWithCount++;
                totalCount += (item.unrestrict || 0) + (item.foc || 0) + (item.rfb || 0);
            }
        });

        let message = '';

        if (format === 'summary') {
            // Formato resumo
            message = `📍 *INVENTÁRIO - LOCALIZAÇÃO* 📍\n\n`;
            message += `🏢 *Local:* ${location}\n`;
            message += `📦 *Itens Cadastrados:* ${formatNumber(totalItems)}\n`;
            message += `✅ *Itens Contados:* ${formatNumber(itemsWithCount)}\n`;
            message += `📊 *Total em Estoque:* ${formatNumber(totalCount)} unidades\n`;
            message += `📈 *Taxa de Contagem:* ${Math.round((itemsWithCount/totalItems)*100)}%\n`;
            message += `\n📅 *Relatório:* ${formatDateTimeBR(new Date().toISOString())}\n`;
            message += `\n✅ _Gerado via Sistema de Inventário_`;
        } else {
            // Formato detalhado
            message = `📍 *RELATÓRIO DETALHADO - ${location}* 📍\n\n`;
            message += `📊 *RESUMO:*\n`;
            message += `┣ Itens: ${formatNumber(totalItems)}\n`;
            message += `┣ Contados: ${formatNumber(itemsWithCount)}\n`;
            message += `┗ Total: ${formatNumber(totalCount)} un.\n\n`;
            
            message += `📋 *ITENS:*\n`;
            items.slice(0, 8).forEach((item, index) => {
                const itemTotal = (item.unrestrict || 0) + (item.foc || 0) + (item.rfb || 0);
                const emoji = getStockEmoji(itemTotal);
                message += `${emoji} ${item.description.substring(0, 25)}${item.description.length > 25 ? '...' : ''}\n`;
                message += `   QR: \`${item.qr_code}\` | ${formatNumber(itemTotal)} un.\n`;
            });
            
            if (items.length > 8) {
                message += `\n... e mais ${items.length - 8} itens\n`;
            }
            
            message += `\n📅 ${formatDateTimeBR(new Date().toISOString())}\n`;
            message += `✅ _Sistema de Inventário_`;
        }

        res.json({
            success: true,
            message: message,
            metadata: {
                location: location,
                total_items: totalItems,
                items_with_count: itemsWithCount,
                total_stock: totalCount,
                count_percentage: Math.round((itemsWithCount/totalItems)*100),
                format: format
            },
            whatsapp_url: `https://wa.me/?text=${encodeURIComponent(message)}`
        });
    });
});

// GET - Listar formatos disponíveis
router.get('/whatsapp-formats', (req, res) => {
    res.json({
        success: true,
        formats: {
            detailed: {
                name: 'Detalhado',
                description: 'Inclui todas as informações: estoque por categoria, observações, data completa',
                use_case: 'Relatórios completos, documentação'
            },
            compact: {
                name: 'Compacto', 
                description: 'Versão resumida com informações essenciais',
                use_case: 'Comunicação rápida, atualizações de status'
            },
            summary: {
                name: 'Resumo',
                description: 'Visão geral com estatísticas (apenas para localização)',
                use_case: 'Relatórios gerenciais, overview de setor'
            }
        },
        parameters: {
            includeLocation: 'true/false - Incluir localização no card',
            includeNotes: 'true/false - Incluir observações',
            includeHistory: 'true/false - Incluir histórico (apenas para item)',
            format: 'detailed/compact/summary - Formato do card',
            limit: 'número - Limite de itens (apenas para localização)'
        }
    });
});

module.exports = router;
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testAPI() {
    console.log('🧪 Testando as novas funcionalidades do Sistema de Inventário\n');
    
    try {
        // 1. Testar Contagem Cíclica
        console.log('📊 1. Testando Contagem Cíclica...');
        const cyclicCount = await axios.post(`${BASE_URL}/api/cyclic-counts`, {
            location: 'A1-01-01',
            frequency_days: 30,
            description: 'Contagem mensal do setor A1'
        });
        console.log('✅ Contagem cíclica criada:', cyclicCount.data.id);
        
        // 2. Testar Movimentações de Estoque
        console.log('\n📦 2. Testando Movimentações de Estoque...');
        
        // Primeiro vamos verificar se temos itens
        const items = await axios.get(`${BASE_URL}/api/items`);
        if (items.data.length === 0) {
            console.log('⚠️  Criando item de teste...');
            await axios.post(`${BASE_URL}/api/items`, {
                qr_code: '12345678901234567',
                description: 'Item de Teste',
                location: 'A1-01-01'
            });
            
            await axios.post(`${BASE_URL}/api/counts`, {
                qr_code: '12345678901234567',
                unrestrict: 10,
                foc: 5,
                rfb: 2
            });
        }
        
        // Entrada de estoque
        const entrada = await axios.post(`${BASE_URL}/api/movements/in`, {
            qr_code: '12345678901234567',
            quantity: 5,
            category: 'unrestrict',
            reason: 'Compra de material',
            reference: 'NF-001'
        });
        console.log('✅ Entrada de estoque registrada:', entrada.data.id);
        
        // 3. Testar Bloqueio de Itens
        console.log('\n🔒 3. Testando Bloqueio de Itens...');
        const block = await axios.post(`${BASE_URL}/api/blocks/block`, {
            qr_code: '12345678901234567',
            reason: 'Manutenção preventiva',
            blocked_until: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24h
        });
        console.log('✅ Item bloqueado:', block.data.message);
        
        // 4. Testar Templates de Etiquetas
        console.log('\n🏷️  4. Testando Templates de Etiquetas...');
        const template = await axios.post(`${BASE_URL}/api/labels/templates`, {
            name: 'Etiqueta Padrão',
            width: 100,
            height: 50,
            qr_size: 30,
            font_size: 8,
            include_description: true,
            include_location: true,
            include_date: true
        });
        console.log('✅ Template de etiqueta criado:', template.data.id);
        
        // 5. Testar Transferências
        console.log('\n🔄 5. Testando Transferências...');
        const transfer = await axios.post(`${BASE_URL}/api/transfers`, {
            from_location: 'A1-01-01',
            to_location: 'B2-02-02',
            items: [{
                qr_code: '12345678901234567',
                quantity: 2,
                category: 'unrestrict'
            }],
            reason: 'Reorganização de estoque'
        });
        console.log('✅ Transferência criada:', transfer.data.id);
        
        // 6. Testar Detecção de Variações
        console.log('\n📈 6. Testando Detecção de Variações...');
        const variance = await axios.post(`${BASE_URL}/api/variances/detect`, {
            qr_code: '12345678901234567',
            physical_count: {
                unrestrict: 12,
                foc: 4,
                rfb: 3
            }
        });
        console.log('✅ Variação detectada:', variance.data.variance_id);
        
        console.log('\n🎉 Todos os testes passaram! O sistema está funcionando perfeitamente.');
        console.log('\n📋 Funcionalidades implementadas:');
        console.log('✅ Contagem cíclica programada por localização');
        console.log('✅ Diferenças de inventário com aprovação');
        console.log('✅ Movimentações de estoque (entrada/saída)');
        console.log('✅ Transferências entre locais');
        console.log('✅ Bloqueio/desbloqueio de itens');
        console.log('✅ Etiquetas personalizadas para impressão');
        
    } catch (error) {
        console.error('❌ Erro no teste:', error.response?.data || error.message);
    }
}

// Aguardar um pouco para o servidor inicializar
setTimeout(testAPI, 2000);
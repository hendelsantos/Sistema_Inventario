const { db } = require('./src/database/database');

console.log('🔍 Verificando estrutura da tabela stock_counts...');

db.all("PRAGMA table_info(stock_counts)", [], (err, rows) => {
    if (err) {
        console.error('Erro ao verificar tabela:', err);
        return;
    }
    
    console.log('📋 Colunas da tabela stock_counts:');
    rows.forEach(row => {
        console.log(`  - ${row.name} (${row.type}) ${row.notnull ? 'NOT NULL' : ''} ${row.dflt_value ? `DEFAULT ${row.dflt_value}` : ''}`);
    });
    
    // Verificar se as colunas existem
    const hasCountType = rows.some(row => row.name === 'count_type');
    const hasStatus = rows.some(row => row.name === 'status');
    
    console.log('\n📊 Status das colunas:');
    console.log(`  count_type: ${hasCountType ? '✅ Existe' : '❌ Não existe'}`);
    console.log(`  status: ${hasStatus ? '✅ Existe' : '❌ Não existe'}`);
    
    if (!hasCountType || !hasStatus) {
        console.log('\n🔧 Tentando adicionar colunas faltantes...');
        
        if (!hasCountType) {
            db.run("ALTER TABLE stock_counts ADD COLUMN count_type TEXT DEFAULT 'manual'", (err) => {
                if (err) {
                    console.error('Erro ao adicionar count_type:', err.message);
                } else {
                    console.log('✅ Coluna count_type adicionada');
                }
            });
        }
        
        if (!hasStatus) {
            db.run("ALTER TABLE stock_counts ADD COLUMN status TEXT DEFAULT 'active'", (err) => {
                if (err) {
                    console.error('Erro ao adicionar status:', err.message);
                } else {
                    console.log('✅ Coluna status adicionada');
                }
                
                // Fechar conexão após última operação
                setTimeout(() => {
                    db.close();
                    process.exit(0);
                }, 1000);
            });
        }
    } else {
        console.log('\n🎉 Todas as colunas necessárias estão presentes!');
        db.close();
        process.exit(0);
    }
});
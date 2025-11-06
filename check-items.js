const { db } = require('./src/database/database');

console.log('🔍 Verificando estrutura da tabela items...');

db.all("PRAGMA table_info(items)", [], (err, rows) => {
    if (err) {
        console.error('Erro ao verificar tabela items:', err);
        return;
    }
    
    console.log('📋 Colunas da tabela items:');
    rows.forEach(row => {
        console.log(`  - ${row.name} (${row.type}) ${row.notnull ? 'NOT NULL' : ''} ${row.dflt_value ? `DEFAULT ${row.dflt_value}` : ''}`);
    });
    
    // Verificar se a coluna location existe
    const hasLocation = rows.some(row => row.name === 'location');
    
    console.log('\n📊 Status das colunas:');
    console.log(`  location: ${hasLocation ? '✅ Existe' : '❌ Não existe'}`);
    
    if (!hasLocation) {
        console.log('\n🔧 Adicionando coluna location...');
        db.run("ALTER TABLE items ADD COLUMN location TEXT DEFAULT 'A1-01-01'", (err) => {
            if (err) {
                console.error('Erro ao adicionar location:', err.message);
            } else {
                console.log('✅ Coluna location adicionada');
            }
            db.close();
            process.exit(0);
        });
    } else {
        console.log('\n🎉 Coluna location já existe!');
        db.close();
        process.exit(0);
    }
});
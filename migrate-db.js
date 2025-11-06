const { db } = require('./src/database/database');

console.log('🔄 Iniciando migração do banco de dados...');

// Função para executar alterações no banco
function runMigration() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            console.log('📝 Adicionando colunas à tabela stock_counts...');
            
            // Adicionar novas colunas à tabela stock_counts
            db.run(`ALTER TABLE stock_counts ADD COLUMN count_type TEXT DEFAULT 'manual'`, (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                    console.error('Erro ao adicionar count_type:', err.message);
                }
            });
            
            db.run(`ALTER TABLE stock_counts ADD COLUMN status TEXT DEFAULT 'active'`, (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                    console.error('Erro ao adicionar status:', err.message);
                }
            });
            
            // Adicionar coluna status à tabela items se não existir
            console.log('📝 Adicionando coluna status à tabela items...');
            db.run(`ALTER TABLE items ADD COLUMN status TEXT DEFAULT 'active'`, (err) => {
                if (err && !err.message.includes('duplicate column name')) {
                    console.error('Erro ao adicionar status em items:', err.message);
                }
            });
            
            console.log('✅ Migração concluída!');
            resolve();
        });
    });
}

// Executar migração
runMigration()
    .then(() => {
        console.log('🎉 Banco de dados atualizado com sucesso!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Erro na migração:', error);
        process.exit(1);
    });
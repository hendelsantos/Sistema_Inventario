const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Carregar variáveis de ambiente se disponível
try {
    require('dotenv').config();
} catch (error) {
    // dotenv não é obrigatório
}

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../database/inventory.db');

// Garantir que o diretório do banco existe
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Erro ao conectar com o banco de dados:', err);
    } else {
        console.log('Conectado ao banco de dados SQLite');
    }
});

// Função para inicializar as tabelas
function initDatabase() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            // Tabela de itens do inventário
            db.run(`
                CREATE TABLE IF NOT EXISTS items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    qr_code TEXT UNIQUE NOT NULL,
                    description TEXT,
                    location TEXT,
                    notes TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) {
                    console.error('Erro ao criar tabela items:', err);
                    reject(err);
                }
            });

            // Tabela de contagens de estoque
            db.run(`
                CREATE TABLE IF NOT EXISTS stock_counts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    item_id INTEGER NOT NULL,
                    qr_code TEXT NOT NULL,
                    unrestrict INTEGER DEFAULT 0,
                    foc INTEGER DEFAULT 0,
                    rfb INTEGER DEFAULT 0,
                    total INTEGER GENERATED ALWAYS AS (unrestrict + foc + rfb) STORED,
                    count_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                    notes TEXT,
                    FOREIGN KEY (item_id) REFERENCES items (id)
                )
            `, (err) => {
                if (err) {
                    console.error('Erro ao criar tabela stock_counts:', err);
                    reject(err);
                }
            });

            // Índices para otimização
            db.run(`CREATE INDEX IF NOT EXISTS idx_items_qr_code ON items(qr_code)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_stock_counts_qr_code ON stock_counts(qr_code)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_stock_counts_date ON stock_counts(count_date)`);

            console.log('Tabelas do banco de dados criadas/verificadas com sucesso');
            resolve();
        });
    });
}

module.exports = {
    db,
    initDatabase
};
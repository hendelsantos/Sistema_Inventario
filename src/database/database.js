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
                    status TEXT DEFAULT 'active', -- active, blocked, transferred, deleted
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) {
                    console.error('Erro ao criar tabela items:', err);
                    reject(err);
                }
            });

            // Adicionar coluna status se não existir (para compatibilidade)
            db.run(`ALTER TABLE items ADD COLUMN status TEXT DEFAULT 'active'`, (err) => {
                // Ignorar erro se coluna já existir
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
                    count_type TEXT DEFAULT 'manual', -- manual, cyclic, adjustment
                    status TEXT DEFAULT 'active', -- active, blocked
                    FOREIGN KEY (item_id) REFERENCES items (id)
                )
            `, (err) => {
                if (err) {
                    console.error('Erro ao criar tabela stock_counts:', err);
                    reject(err);
                }
            });

            // Tabela de contagens cíclicas programadas
            db.run(`
                CREATE TABLE IF NOT EXISTS cyclic_counts (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    location TEXT NOT NULL,
                    frequency_days INTEGER NOT NULL DEFAULT 30,
                    last_count_date DATETIME,
                    next_count_date DATETIME,
                    status TEXT DEFAULT 'active', -- active, paused, completed
                    created_by TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) {
                    console.error('Erro ao criar tabela cyclic_counts:', err);
                    reject(err);
                }
            });

            // Tabela de diferenças de inventário
            db.run(`
                CREATE TABLE IF NOT EXISTS inventory_variances (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    qr_code TEXT NOT NULL,
                    location TEXT,
                    counted_unrestrict INTEGER DEFAULT 0,
                    counted_foc INTEGER DEFAULT 0,
                    counted_rfb INTEGER DEFAULT 0,
                    system_unrestrict INTEGER DEFAULT 0,
                    system_foc INTEGER DEFAULT 0,
                    system_rfb INTEGER DEFAULT 0,
                    variance_unrestrict INTEGER GENERATED ALWAYS AS (counted_unrestrict - system_unrestrict) STORED,
                    variance_foc INTEGER GENERATED ALWAYS AS (counted_foc - system_foc) STORED,
                    variance_rfb INTEGER GENERATED ALWAYS AS (counted_rfb - system_rfb) STORED,
                    variance_total INTEGER GENERATED ALWAYS AS ((counted_unrestrict + counted_foc + counted_rfb) - (system_unrestrict + system_foc + system_rfb)) STORED,
                    status TEXT DEFAULT 'pending', -- pending, approved, rejected
                    approved_by TEXT,
                    approved_at DATETIME,
                    reason TEXT,
                    count_date DATETIME DEFAULT CURRENT_TIMESTAMP,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) {
                    console.error('Erro ao criar tabela inventory_variances:', err);
                    reject(err);
                }
            });

            // Tabela de movimentações de estoque
            db.run(`
                CREATE TABLE IF NOT EXISTS stock_movements (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    qr_code TEXT NOT NULL,
                    movement_type TEXT NOT NULL, -- 'in', 'out', 'transfer', 'adjustment'
                    from_location TEXT,
                    to_location TEXT,
                    unrestrict_qty INTEGER DEFAULT 0,
                    foc_qty INTEGER DEFAULT 0,
                    rfb_qty INTEGER DEFAULT 0,
                    total_qty INTEGER GENERATED ALWAYS AS (unrestrict_qty + foc_qty + rfb_qty) STORED,
                    reason TEXT,
                    reference_doc TEXT,
                    created_by TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    status TEXT DEFAULT 'completed' -- pending, completed, cancelled
                )
            `, (err) => {
                if (err) {
                    console.error('Erro ao criar tabela stock_movements:', err);
                    reject(err);
                }
            });

            // Tabela de transferências entre locais
            db.run(`
                CREATE TABLE IF NOT EXISTS location_transfers (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    transfer_number TEXT UNIQUE NOT NULL,
                    from_location TEXT NOT NULL,
                    to_location TEXT NOT NULL,
                    status TEXT DEFAULT 'pending', -- pending, in_transit, completed, cancelled
                    total_items INTEGER DEFAULT 0,
                    created_by TEXT,
                    approved_by TEXT,
                    completed_by TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    approved_at DATETIME,
                    completed_at DATETIME,
                    notes TEXT
                )
            `, (err) => {
                if (err) {
                    console.error('Erro ao criar tabela location_transfers:', err);
                    reject(err);
                }
            });

            // Tabela de itens de transferência
            db.run(`
                CREATE TABLE IF NOT EXISTS transfer_items (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    transfer_id INTEGER NOT NULL,
                    qr_code TEXT NOT NULL,
                    unrestrict_qty INTEGER DEFAULT 0,
                    foc_qty INTEGER DEFAULT 0,
                    rfb_qty INTEGER DEFAULT 0,
                    status TEXT DEFAULT 'pending', -- pending, shipped, received
                    shipped_at DATETIME,
                    received_at DATETIME,
                    received_by TEXT,
                    FOREIGN KEY (transfer_id) REFERENCES location_transfers (id)
                )
            `, (err) => {
                if (err) {
                    console.error('Erro ao criar tabela transfer_items:', err);
                    reject(err);
                }
            });

            // Tabela de bloqueios de itens
            db.run(`
                CREATE TABLE IF NOT EXISTS item_blocks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    qr_code TEXT NOT NULL,
                    block_type TEXT NOT NULL, -- 'count', 'transfer', 'adjustment', 'maintenance'
                    reason TEXT NOT NULL,
                    blocked_by TEXT,
                    blocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    unblocked_by TEXT,
                    unblocked_at DATETIME,
                    status TEXT DEFAULT 'active', -- active, released
                    notes TEXT
                )
            `, (err) => {
                if (err) {
                    console.error('Erro ao criar tabela item_blocks:', err);
                    reject(err);
                }
            });

            // Tabela de templates de etiquetas
            db.run(`
                CREATE TABLE IF NOT EXISTS label_templates (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    description TEXT,
                    width INTEGER DEFAULT 100, -- mm
                    height INTEGER DEFAULT 60, -- mm
                    qr_size INTEGER DEFAULT 25, -- mm
                    font_size INTEGER DEFAULT 12,
                    include_description BOOLEAN DEFAULT 1,
                    include_location BOOLEAN DEFAULT 1,
                    include_stock BOOLEAN DEFAULT 0,
                    template_data TEXT, -- JSON with layout configuration
                    created_by TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    is_default BOOLEAN DEFAULT 0
                )
            `, (err) => {
                if (err) {
                    console.error('Erro ao criar tabela label_templates:', err);
                    reject(err);
                }
            });

            // Inserir template padrão de etiqueta
            db.run(`
                INSERT OR IGNORE INTO label_templates 
                (name, description, width, height, qr_size, font_size, include_description, include_location, include_stock, is_default, template_data)
                VALUES 
                ('Padrão', 'Template padrão para etiquetas', 100, 60, 25, 12, 1, 1, 0, 1, 
                '{"layout": "horizontal", "margins": {"top": 5, "bottom": 5, "left": 5, "right": 5}, "qr_position": "left"}')
            `);

            // Índices para otimização das novas tabelas
            db.run(`CREATE INDEX IF NOT EXISTS idx_items_qr_code ON items(qr_code)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_items_location ON items(location)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_items_status ON items(status)`);
            
            db.run(`CREATE INDEX IF NOT EXISTS idx_stock_counts_qr_code ON stock_counts(qr_code)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_stock_counts_date ON stock_counts(count_date)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_stock_counts_type ON stock_counts(count_type)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_stock_counts_status ON stock_counts(status)`);
            
            db.run(`CREATE INDEX IF NOT EXISTS idx_cyclic_counts_location ON cyclic_counts(location)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_cyclic_counts_next_date ON cyclic_counts(next_count_date)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_cyclic_counts_status ON cyclic_counts(status)`);
            
            db.run(`CREATE INDEX IF NOT EXISTS idx_inventory_variances_qr_code ON inventory_variances(qr_code)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_inventory_variances_status ON inventory_variances(status)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_inventory_variances_date ON inventory_variances(count_date)`);
            
            db.run(`CREATE INDEX IF NOT EXISTS idx_stock_movements_qr_code ON stock_movements(qr_code)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_stock_movements_type ON stock_movements(movement_type)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock_movements(created_at)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_stock_movements_from_location ON stock_movements(from_location)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_stock_movements_to_location ON stock_movements(to_location)`);
            
            db.run(`CREATE INDEX IF NOT EXISTS idx_location_transfers_status ON location_transfers(status)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_location_transfers_from ON location_transfers(from_location)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_location_transfers_to ON location_transfers(to_location)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_location_transfers_date ON location_transfers(created_at)`);
            
            db.run(`CREATE INDEX IF NOT EXISTS idx_transfer_items_transfer_id ON transfer_items(transfer_id)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_transfer_items_qr_code ON transfer_items(qr_code)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_transfer_items_status ON transfer_items(status)`);
            
            db.run(`CREATE INDEX IF NOT EXISTS idx_item_blocks_qr_code ON item_blocks(qr_code)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_item_blocks_status ON item_blocks(status)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_item_blocks_type ON item_blocks(block_type)`);
            db.run(`CREATE INDEX IF NOT EXISTS idx_item_blocks_date ON item_blocks(blocked_at)`);

            console.log('Tabelas do banco de dados criadas/verificadas com sucesso');
            resolve();
        });
    });
}

module.exports = {
    db,
    initDatabase
};
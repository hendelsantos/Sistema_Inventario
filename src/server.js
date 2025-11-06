const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { initDatabase } = require('./database/database');

// Carregar variáveis de ambiente se o arquivo .env existir
try {
    require('dotenv').config();
} catch (error) {
    // dotenv não é obrigatório em produção
}

const inventoryRoutes = require('./routes/inventory');
const exportRoutes = require('./routes/export');
const cyclicCountsRoutes = require('./routes/cyclic-counts');
const variancesRoutes = require('./routes/variances');
const movementsRoutes = require('./routes/movements');
const transfersRoutes = require('./routes/transfers');
const blocksRoutes = require('./routes/blocks');
const labelsRoutes = require('./routes/labels');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutos
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100, // máximo requests por IP por janela de tempo
    message: { error: 'Muitas tentativas. Tente novamente em alguns minutos.' }
});

// Middlewares
app.use(limiter);

// CORS configurável
const corsOptions = {
    origin: process.env.CORS_ORIGIN === '*' ? true : process.env.CORS_ORIGIN?.split(',') || true,
    credentials: true
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, '../public')));

// Rotas API
app.use('/api/inventory', inventoryRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/cyclic-counts', cyclicCountsRoutes);
app.use('/api/variances', variancesRoutes);
app.use('/api/movements', movementsRoutes);
app.use('/api/transfers', transfersRoutes);
app.use('/api/blocks', blocksRoutes);
app.use('/api/labels', labelsRoutes);

// Rota principal
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Health check para Railway
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        env: NODE_ENV,
        uptime: process.uptime()
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        error: 'Algo deu errado!', 
        message: NODE_ENV === 'development' ? err.message : 'Erro interno do servidor'
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Rota não encontrada' });
});

// Inicializar servidor
async function startServer() {
    try {
        await initDatabase();
        console.log('Banco de dados inicializado');
        
        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`Servidor rodando na porta ${PORT}`);
            console.log(`Ambiente: ${NODE_ENV}`);
            if (NODE_ENV === 'development') {
                console.log(`Acesse: http://localhost:${PORT}`);
            }
        });

        // Graceful shutdown
        process.on('SIGTERM', () => {
            console.log('SIGTERM recebido, fechando servidor...');
            server.close(() => {
                console.log('Servidor fechado.');
                process.exit(0);
            });
        });

    } catch (error) {
        console.error('Erro ao inicializar servidor:', error);
        process.exit(1);
    }
}

startServer();
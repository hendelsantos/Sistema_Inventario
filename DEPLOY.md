# Deploy no Railway - Sistema de Inventário

## 🚀 Guia de Deploy Rápido

### 1. Preparação
✅ Projeto já configurado para Railway
✅ Variáveis de ambiente configuradas
✅ Scripts de build otimizados

### 2. Deploy via GitHub
1. **Conecte seu repositório**:
   - Acesse [Railway.app](https://railway.app)
   - Faça login com GitHub
   - Clique em "New Project"
   - Selecione "Deploy from GitHub repo"
   - Escolha `hendelsantos/Sistema_Inventario`

2. **Configuração Automática**:
   - Railway detectará automaticamente Node.js
   - Usará as configurações do `railway.json`
   - Executará `npm install` e `npm run build`

### 3. Variáveis de Ambiente (Opcional)
No painel do Railway, configure se necessário:
```
NODE_ENV=production
PORT=(será definido automaticamente pelo Railway)
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX=100
CORS_ORIGIN=*
```

### 4. Deploy Completo
- ✅ Database SQLite será criado automaticamente
- ✅ Servidor iniciará na porta fornecida pelo Railway
- ✅ Health check disponível em `/health`
- ✅ Interface web acessível na URL fornecida

## 🔧 Comandos Utilizados

- `npm install`: Instala dependências
- `npm run build`: Inicializa banco de dados
- `npm start`: Inicia servidor em produção

## 📱 Funcionalidades em Produção

✅ **Scanner QR via HTTPS**  
✅ **Interface responsiva**  
✅ **Banco SQLite persistente**  
✅ **Exportação Excel/JSON**  
✅ **API REST completa**  

## 🌐 Acesso

Após o deploy, o Railway fornecerá uma URL como:
```
https://seu-app.railway.app
```

## 🔒 Segurança

- Rate limiting configurado
- CORS habilitado
- Error handling robusto
- Health checks ativos

## 📊 Monitoramento

- Health check: `GET /health`
- Logs disponíveis no painel Railway
- Métricas de CPU/RAM no dashboard

## 🚨 Solução de Problemas

**Build falha?**
- Verifique se Node.js ≥18 está sendo usado
- Confirme se `package.json` está correto

**Banco não funciona?**
- Railway criará automaticamente o diretório
- SQLite é criado no primeiro acesso

**Scanner QR não funciona?**
- Confirme se a URL usa HTTPS
- Dispositivos móveis precisam de HTTPS para câmera
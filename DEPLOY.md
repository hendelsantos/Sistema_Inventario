# Deploy no Railway - Sistema de Inventário

## 🚀 Guia de Deploy Rápido

### 1. Preparação
✅ Projeto otimizado para Railway + Nixpacks
✅ Variáveis de ambiente configuradas
✅ Scripts de build otimizados
✅ Docker removido (Nixpacks é melhor para Node.js)

### 2. Deploy via GitHub
1. **Conecte seu repositório**:
   - Acesse [Railway.app](https://railway.app)
   - Faça login com GitHub
   - Clique em "New Project"
   - Selecione "Deploy from GitHub repo"
   - Escolha `hendelsantos/Sistema_Inventario`

2. **Configuração Automática**:
   - Railway detectará automaticamente Node.js
   - Usará **Nixpacks** (mais eficiente que Docker)
   - Executará `npm install` e `npm run build`
   - SQLite será configurado automaticamente

### 3. Deploy Completo
- ✅ Database SQLite será criado automaticamente
- ✅ Servidor iniciará na porta fornecida pelo Railway
- ✅ **HTTPS automático** (essencial para scanner QR mobile)
- ✅ Health check disponível em `/health`
- ✅ Interface web acessível na URL fornecida

## 🔧 Comandos Utilizados

- `npm install`: Instala dependências
- `npm run build`: Inicializa banco de dados
- `npm start`: Inicia servidor em produção

## 📱 Funcionalidades em Produção

✅ **Scanner QR via HTTPS** (funciona no celular)  
✅ **Interface responsiva**  
✅ **Banco SQLite persistente**  
✅ **Exportação Excel/JSON**  
✅ **API REST completa**  

## 🌐 Acesso

Após o deploy, o Railway fornecerá uma URL como:
```
https://seu-app.railway.app
```

## � Teste Scanner QR

1. Acesse a URL HTTPS fornecida pelo Railway
2. Clique em "Escanear QR"
3. Permita acesso à câmera
4. Escaneie códigos QR de 17 caracteres

## 🚨 Solução de Problemas

**Build falha?**
- Railway agora usa Nixpacks (sem Docker)
- Builds mais rápidos e estáveis
- SQLite compila automaticamente

**Scanner não funciona?**
- ✅ HTTPS automático no Railway
- ✅ Permita acesso à câmera no navegador
- ✅ Use códigos QR de exatamente 17 caracteres
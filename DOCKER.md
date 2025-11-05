# Docker Guide - Sistema de Inventário

## 🐳 Por que usar Docker?

### ✅ **Vantagens:**
- **Portabilidade**: Roda igual em qualquer ambiente
- **Isolamento**: Não conflita com outras aplicações
- **Reprodutibilidade**: Mesmas dependências sempre
- **Fácil deploy**: Em qualquer servidor com Docker
- **Desenvolvimento**: Ambiente consistente para a equipe

### 🎯 **Quando usar:**
- **Desenvolvimento em equipe**
- **Deploy em VPS/servidor próprio** 
- **Ambientes múltiplos** (dev, staging, prod)
- **CI/CD pipelines**
- **Backup/migração** fácil

## 🚀 Comandos Docker

### **Build e Run Manual:**
```bash
# Build da imagem
npm run docker:build

# Run container
npm run docker:run

# Ou diretamente:
docker build -t sistema-inventario .
docker run -p 3000:3000 sistema-inventario
```

### **Com Docker Compose (Recomendado):**

#### **Produção:**
```bash
# Subir aplicação
npm run docker:prod

# Ou:
docker-compose up

# Em background:
docker-compose up -d

# Parar:
docker-compose down
```

#### **Desenvolvimento:**
```bash
# Subir com hot reload
npm run docker:dev

# Ou:
docker-compose --profile dev up

# Ver logs:
docker-compose logs -f
```

## 📁 Estrutura Docker

```
├── Dockerfile          # Produção (otimizado)
├── Dockerfile.dev      # Desenvolvimento (com nodemon)
├── docker-compose.yml  # Orquestração
└── .dockerignore      # Arquivos ignorados
```

## 🔧 Configurações

### **Volumes Persistentes:**
- `./database:/app/database` - Banco SQLite
- `./exports:/app/exports` - Arquivos exportados

### **Variáveis de Ambiente:**
```env
NODE_ENV=production
PORT=3000
DB_PATH=/app/database/inventory.db
```

### **Health Check:**
- Endpoint: `http://localhost:3000/health`
- Intervalo: 30s
- Timeout: 10s

## 🌐 Deploy Options

### **1. Railway (Recomendado) - Sem Docker**
```bash
# Railway usa Nixpacks automaticamente
# Apenas: git push
```

### **2. VPS com Docker**
```bash
# Clonar repositório
git clone https://github.com/hendelsantos/Sistema_Inventario.git
cd Sistema_Inventario

# Subir com Docker
docker-compose up -d

# Verificar status
docker-compose ps
```

### **3. Docker Hub**
```bash
# Build e push
docker build -t hendelsantos/sistema-inventario .
docker push hendelsantos/sistema-inventario

# Pull e run em qualquer lugar
docker run -p 3000:3000 hendelsantos/sistema-inventario
```

## 🔍 Troubleshooting

### **Container não inicia:**
```bash
# Ver logs
docker-compose logs app

# Entrar no container
docker-compose exec app sh
```

### **Banco não persiste:**
```bash
# Verificar volumes
docker-compose ps
docker volume ls

# Backup do banco
docker cp container_name:/app/database/inventory.db ./backup.db
```

### **Performance:**
```bash
# Ver recursos
docker stats

# Limpar containers parados
docker system prune
```

## ⚡ Resumo

### **Para desenvolvimento:**
```bash
npm run docker:dev
```

### **Para produção:**
```bash
npm run docker:prod
```

### **Para Railway:**
```bash
# Não precisa Docker - apenas git push
git push
```

Docker é **opcional** mas **recomendado** para flexibilidade e portabilidade! 🐳
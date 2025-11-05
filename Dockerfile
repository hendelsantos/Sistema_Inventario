# Use Node.js LTS como base
FROM node:18-alpine

# Instalar dependências do sistema para SQLite
RUN apk add --no-cache python3 make g++

# Criar diretório da aplicação
WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./

# Instalar dependências sem executar postinstall
RUN npm ci --only=production --ignore-scripts

# Copiar código fonte
COPY . .

# Criar diretórios necessários
RUN mkdir -p database exports

# Agora executar a inicialização do banco
RUN npm run init-db

# Expor porta
EXPOSE 3000

# Criar usuário não-root
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

# Mudar propriedade dos arquivos
RUN chown -R nextjs:nodejs /app
USER nextjs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const http=require('http');const options={hostname:'localhost',port:3000,path:'/health',timeout:2000};const req=http.request(options,(res)=>{process.exit(res.statusCode===200?0:1)});req.on('error',()=>process.exit(1));req.end();"

# Comando de inicialização
CMD ["npm", "start"]
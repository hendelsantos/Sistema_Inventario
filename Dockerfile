FROM node:18-alpine

# Instalar dependências do sistema necessárias para canvas
RUN apk add --no-cache \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    python3 \
    make \
    g++

WORKDIR /app

# Copiar package files
COPY package*.json ./

# Instalar dependências
RUN npm ci --only=production

# Copiar código da aplicação
COPY . .

# Criar diretório para banco de dados
RUN mkdir -p database

# Expor porta
EXPOSE 3000

# Comando para iniciar
CMD ["npm", "start"]
FROM node:18-alpine

# Sistema Web Mobile Otimizado - v2.0.0
# PWA removido, foco em performance e estabilidade

# Instalar dependências básicas do sistema
RUN apk add --no-cache \
    python3 \
    python3-dev \
    py3-pip \
    py3-setuptools \
    make \
    g++ \
    pkgconfig

# Tentar instalar dependências para canvas (opcional)
RUN apk add --no-cache \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev \
    pangomm-dev \
    libjpeg-turbo-dev \
    freetype-dev \
    || echo "Dependências canvas não instaladas - continuando sem elas"

# Instalar setuptools para resolver problema do distutils
RUN python3 -m pip install --break-system-packages setuptools wheel || \
    pip3 install setuptools wheel || \
    echo "Setuptools installation skipped"

WORKDIR /app

# Copiar package files
COPY package*.json ./

# Instalar dependências com fallback
ENV PYTHON=python3
ENV NODE_ENV=production

# Tentar instalar com canvas, se falhar, instalar sem canvas
RUN npm ci --omit=dev --verbose || \
    (echo "Instalação com canvas falhou, tentando sem canvas..." && \
     npm uninstall canvas && \
     npm ci --omit=dev --verbose)

# Copiar código da aplicação
COPY . .

# Criar diretório para banco de dados
RUN mkdir -p database

# Expor porta
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "http.get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })" || exit 1

# Comando para iniciar
CMD ["npm", "start"]
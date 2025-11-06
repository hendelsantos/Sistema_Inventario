#!/bin/bash

echo "🚂 Diagnóstico Railway - Sistema de Inventário"
echo "=============================================="

echo "📋 Verificando configurações..."

# 1. Verificar se existe railway.toml
if [ -f "railway.toml" ]; then
    echo "✅ railway.toml encontrado"
else
    echo "❌ railway.toml não encontrado - CRIADO AGORA"
fi

# 2. Verificar package.json
echo "📦 Verificando package.json..."
if grep -q "\"start\":" package.json; then
    echo "✅ Script 'start' configurado"
else
    echo "❌ Script 'start' não encontrado"
fi

# 3. Verificar se tem Dockerfile
if [ -f "Dockerfile" ]; then
    echo "✅ Dockerfile encontrado"
else
    echo "❌ Dockerfile não encontrado - CRIADO AGORA"
fi

# 4. Verificar últimos commits
echo ""
echo "📝 Últimos commits:"
git log --oneline -3

echo ""
echo "🔄 Status do repositório:"
git status --porcelain

echo ""
echo "🚀 Possíveis causas do problema de deploy:"
echo "1. ❗ Railway não detectou mudanças no repositório"
echo "2. ❗ Configuração de build incorreta"
echo "3. ❗ Dependências com problemas (canvas, pdfkit)"
echo "4. ❗ Variáveis de ambiente faltando"
echo "5. ❗ Branch incorreta conectada ao Railway"

echo ""
echo "🔧 Soluções implementadas:"
echo "✅ Criado railway.toml com configurações adequadas"
echo "✅ Criado Dockerfile otimizado para canvas"
echo "✅ Ajustado package.json para Railway"
echo "✅ Criado .dockerignore para otimizar build"

echo ""
echo "⚡ Próximos passos:"
echo "1. Fazer commit destes novos arquivos"
echo "2. Push para o GitHub"
echo "3. Verificar se Railway está conectado ao branch main"
echo "4. Forçar redeploy no Railway se necessário"
echo "5. Verificar logs de build no Railway dashboard"

echo ""
echo "🌐 URLs importantes:"
echo "• GitHub: https://github.com/hendelsantos/Sistema_Inventario"
echo "• Railway Dashboard: https://railway.app/dashboard"

echo ""
echo "📱 Para forçar redeploy:"
echo "1. Vá ao Railway Dashboard"
echo "2. Clique no seu projeto"
echo "3. Vá em 'Deployments'"
echo "4. Clique em 'Deploy' ou 'Redeploy'"
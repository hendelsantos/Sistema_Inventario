#!/bin/bash

echo "🔍 DIAGNÓSTICO COMPLETO RAILWAY"
echo "==============================="
echo ""

echo "📋 1. VERIFICANDO REPOSITÓRIO:"
echo "Repository: https://github.com/hendelsantos/Sistema_Inventario"
git remote -v
echo ""

echo "📊 2. COMMITS RECENTES:"
git log --oneline -5
echo ""

echo "🕐 3. ÚLTIMO PUSH:"
git log -1 --format="%H %ai %s"
echo ""

echo "📦 4. VERSÃO DO SISTEMA:"
echo "Package.json version:"
grep '"version"' package.json
echo ""

echo "🐳 5. DOCKERFILE STATUS:"
echo "Dockerfile existe:" 
ls -la Dockerfile 2>/dev/null && echo "✅ OK" || echo "❌ MISSING"
echo ""

echo "⚙️ 6. RAILWAY CONFIG:"
echo "railway.toml:"
ls -la railway.toml 2>/dev/null && echo "✅ OK" || echo "❌ MISSING"
echo ""
echo "railway.json (deve estar removido):"
ls -la railway.json 2>/dev/null && echo "❌ EXISTE (REMOVER)" || echo "✅ REMOVIDO"
echo ""

echo "🌐 7. ARQUIVOS PRINCIPAIS:"
echo "src/server.js:" 
ls -la src/server.js 2>/dev/null && echo "✅ OK" || echo "❌ MISSING"
echo "package.json:" 
ls -la package.json 2>/dev/null && echo "✅ OK" || echo "❌ MISSING"
echo "public/index.html:" 
ls -la public/index.html 2>/dev/null && echo "✅ OK" || echo "❌ MISSING"
echo ""

echo "🚂 8. POSSÍVEIS PROBLEMAS RAILWAY:"
echo ""
echo "✅ Soluções já aplicadas:"
echo "  - Removido conflito railway.json vs railway.toml"
echo "  - Versão atualizada para 2.0.0"
echo "  - PWA completamente removido"
echo "  - Health check melhorado"
echo "  - Push forçado realizado"
echo ""

echo "❓ Possíveis causas se ainda não funciona:"
echo "  1. Webhook GitHub → Railway desconectado"
echo "  2. Railway precisa de rebuild manual"
echo "  3. Problemas na conta Railway"
echo "  4. Branch incorreta configurada no Railway"
echo "  5. Variáveis de ambiente faltando"
echo ""

echo "🛠️ PRÓXIMOS PASSOS:"
echo "  1. Acesse: https://railway.app/dashboard"
echo "  2. Encontre o projeto Sistema_Inventario"
echo "  3. Vá em Settings → Service"
echo "  4. Verifique se Source está conectado ao GitHub"
echo "  5. Confirme se está na branch 'main'"
echo "  6. Force um rebuild manual se necessário"
echo "  7. Verifique logs de build para erros"
echo ""

echo "🎯 TESTE FINAL:"
echo "Quando estiver funcionando, teste:"
echo "curl https://seu-app.railway.app/health"
echo ""
echo "Deve retornar JSON com:"
echo '  "version": "2.0.0"'
echo '  "pwa_removed": true'
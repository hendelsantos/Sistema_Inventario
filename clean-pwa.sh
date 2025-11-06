#!/bin/bash

echo "🧹 Removendo estilos PWA do CSS..."

# Backup do CSS
cp public/css/style.css public/css/style.css.pwa-backup

# Remover estilos PWA usando sed
sed -i '/\.pwa-mode\|\.install-banner\|\.update-banner/,/^}/d' public/css/style.css

# Remover seções de media queries PWA
sed -i '/PWA Styles/,/End PWA Styles/d' public/css/style.css 2>/dev/null || true

echo "✅ Estilos PWA removidos!"
echo "📁 Backup CSS criado em: public/css/style.css.pwa-backup"

# Remover arquivos PWA desnecessários
echo "🗑️ Removendo arquivos PWA..."
rm -f public/sw.js public/manifest.json 2>/dev/null || true

# Remover diretório de ícones se existir
if [ -d "public/icons" ]; then
    echo "📱 Removendo ícones PWA..."
    rm -rf public/icons
fi

echo "🌐 Sistema convertido para web-only!"
echo "📱 Mantendo responsividade mobile"
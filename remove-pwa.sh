#!/bin/bash

echo "🧹 Removendo funcionalidades PWA..."

# Backup do arquivo original
cp public/index.html public/index.html.pwa-backup

# Usar sed para remover seções PWA
echo "📝 Criando versão web clean..."

# Remover PWA scripts e manifest
sed -i '355,556d' public/index.html

# Adicionar scripts básicos
cat >> public/index.html << 'EOF'
    
    <!-- Scripts básicos -->
    <script>
        console.log('🌐 Sistema de Inventário - Versão Web');
        console.log('📱 Otimizado para mobile e desktop');
    </script>
    
    <!-- Sistema de Temas -->
    <script src="js/theme-manager.js"></script>
</body>
</html>
EOF

echo "✅ PWA removido com sucesso!"
echo "📁 Backup criado em: public/index.html.pwa-backup"
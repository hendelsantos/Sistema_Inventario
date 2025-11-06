#!/bin/bash

echo "🎨 Alterando esquema de cores de roxo para azul escuro..."

# Arquivo CSS
CSS_FILE="/home/hendel/Documentos/Sistema_Inventario/public/css/style.css"

# Backup do arquivo original
cp "$CSS_FILE" "$CSS_FILE.backup"

# Substituições de cores:
# #667eea (azul claro roxo) -> #2a5298 (azul médio)
# #764ba2 (roxo) -> #1a237e (azul escuro)

echo "🔄 Substituindo #667eea por #2a5298..."
sed -i 's/#667eea/#2a5298/g' "$CSS_FILE"

echo "🔄 Substituindo #764ba2 por #1a237e..."
sed -i 's/#764ba2/#1a237e/g' "$CSS_FILE"

echo "✅ Alterações concluídas!"
echo "📁 Backup criado em: $CSS_FILE.backup"

# Verificar quantas substituições foram feitas
echo "📊 Estatísticas das alterações:"
echo "   #2a5298: $(grep -c '#2a5298' "$CSS_FILE") ocorrências"
echo "   #1a237e: $(grep -c '#1a237e' "$CSS_FILE") ocorrências"
#!/bin/bash

echo "🎯 Testando Exportação para WhatsApp"
echo "===================================="

BASE_URL="http://localhost:3000"

# Função para testar uma requisição
test_whatsapp() {
    local endpoint=$1
    local description=$2
    
    echo -e "\n📱 $description"
    echo "   GET $endpoint"
    
    response=$(curl -s "$BASE_URL$endpoint")
    echo "   Resposta:"
    echo "$response" | jq -r '.message // .error // .' 2>/dev/null || echo "$response"
    echo ""
}

# 1. Verificar se há dados para testar
echo "📋 Verificando dados disponíveis..."
items=$(curl -s "$BASE_URL/api/inventory/items")
echo "Itens disponíveis: $(echo $items | jq '. | length' 2>/dev/null || echo "0")"

# 2. Testar formatos disponíveis
test_whatsapp "/api/whatsapp/whatsapp-formats" "Listar Formatos Disponíveis"

# 3. Se não há itens, criar um para teste
if [ "$(echo $items | jq '. | length' 2>/dev/null)" = "0" ]; then
    echo "🔧 Criando item de teste..."
    curl -s -X POST -H "Content-Type: application/json" \
         -d '{"qr_code":"12345678901234567","description":"Item Teste WhatsApp","location":"A1-01-01"}' \
         "$BASE_URL/api/inventory/add" > /dev/null
    
    curl -s -X POST -H "Content-Type: application/json" \
         -d '{"qr_code":"12345678901234567","unrestrict":15,"foc":8,"rfb":3,"notes":"Contagem para teste WhatsApp"}' \
         "$BASE_URL/api/inventory/count" > /dev/null
fi

# 4. Testar card por item (formato detalhado)
test_whatsapp "/api/whatsapp/item/12345678901234567/whatsapp-card" "Card de Item - Formato Detalhado"

# 5. Testar card por item (formato compacto)
test_whatsapp "/api/whatsapp/item/12345678901234567/whatsapp-card?format=compact" "Card de Item - Formato Compacto"

# 6. Testar card por item com histórico
test_whatsapp "/api/whatsapp/item/12345678901234567/whatsapp-card?includeHistory=true" "Card de Item - Com Histórico"

# 7. Testar card por localização (resumo)
test_whatsapp "/api/whatsapp/location/A1-01-01/whatsapp-card" "Card de Localização - Resumo"

# 8. Testar card por localização (detalhado)
test_whatsapp "/api/whatsapp/location/A1-01-01/whatsapp-card?format=detailed" "Card de Localização - Detalhado"

# 9. Buscar uma contagem específica para teste
echo "🔍 Buscando contagem para teste..."
count_id=$(curl -s "$BASE_URL/api/inventory/item/12345678901234567" | jq -r '.counts[0].id // empty' 2>/dev/null)

if [ ! -z "$count_id" ]; then
    # 10. Testar card por contagem específica
    test_whatsapp "/api/whatsapp/count/$count_id/whatsapp-card" "Card de Contagem Específica"
    test_whatsapp "/api/whatsapp/count/$count_id/whatsapp-card?format=compact" "Card de Contagem - Compacto"
fi

echo "🎉 Testes concluídos!"
echo ""
echo "📱 Como usar:"
echo "1. Acesse qualquer endpoint acima no navegador"
echo "2. Copie a mensagem gerada"
echo "3. Cole no WhatsApp ou use o link whatsapp_url fornecido"
echo ""
echo "🔗 Endpoints disponíveis:"
echo "/api/whatsapp/item/{qr_code}/whatsapp-card"
echo "/api/whatsapp/count/{count_id}/whatsapp-card"
echo "/api/whatsapp/location/{location}/whatsapp-card"
echo "/api/whatsapp/whatsapp-formats"
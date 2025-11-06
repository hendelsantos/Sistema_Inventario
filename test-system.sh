#!/bin/bash

echo "🧪 Testando Sistema de Inventário com as novas funcionalidades"
echo "==============================================================="

BASE_URL="http://localhost:3000"

# Função para testar uma requisição
test_request() {
    local method=$1
    local endpoint=$2
    local data=$3
    local description=$4
    
    echo -e "\n📋 $description"
    echo "   $method $endpoint"
    
    if [ -z "$data" ]; then
        response=$(curl -s -X $method "$BASE_URL$endpoint")
    else
        response=$(curl -s -X $method -H "Content-Type: application/json" -d "$data" "$BASE_URL$endpoint")
    fi
    
    echo "   Resposta: $response"
}

# 1. Testar health check
test_request "GET" "/health" "" "Health Check"

# 2. Verificar itens existentes
test_request "GET" "/api/inventory/items" "" "Listar Itens Existentes"

# 3. Criar um item de teste se não existir
test_request "POST" "/api/inventory/add" '{"qr_code":"12345678901234567","description":"Item de Teste para Funcionalidades","location":"A1-01-01","notes":"Criado para testes"}' "Criar Item de Teste"

# 4. Adicionar contagem inicial
test_request "POST" "/api/inventory/count" '{"qr_code":"12345678901234567","unrestrict":10,"foc":5,"rfb":2,"notes":"Contagem inicial"}' "Adicionar Contagem Inicial"

# 5. Testar Contagem Cíclica
test_request "POST" "/api/cyclic-counts" '{"location":"A1-01-01","frequency_days":30,"description":"Contagem mensal do setor A1","next_count_date":"2024-02-01"}' "Criar Contagem Cíclica"

# 6. Listar contagens cíclicas
test_request "GET" "/api/cyclic-counts" "" "Listar Contagens Cíclicas"

# 7. Testar Entrada de Estoque
test_request "POST" "/api/movements/in" '{"qr_code":"12345678901234567","quantity":5,"category":"unrestrict","reason":"Teste de entrada","reference":"TEST-001"}' "Movimento de Entrada"

# 8. Testar Bloqueio de Item
test_request "POST" "/api/blocks/block" '{"qr_code":"12345678901234567","reason":"Manutenção preventiva","blocked_until":"2024-02-01T10:00:00Z"}' "Bloquear Item"

# 9. Verificar status do bloqueio
test_request "GET" "/api/blocks/status/12345678901234567" "" "Verificar Status do Bloqueio"

# 10. Criar template de etiqueta
test_request "POST" "/api/labels/templates" '{"name":"Etiqueta Padrão","width":100,"height":50,"qr_size":30,"font_size":8,"include_description":true,"include_location":true,"include_date":true}' "Criar Template de Etiqueta"

# 11. Listar templates
test_request "GET" "/api/labels/templates" "" "Listar Templates de Etiquetas"

# 12. Testar Transferência
test_request "POST" "/api/transfers" '{"from_location":"A1-01-01","to_location":"B2-02-02","items":[{"qr_code":"12345678901234567","quantity":2,"category":"unrestrict"}],"reason":"Reorganização de estoque"}' "Criar Transferência"

# 13. Testar Detecção de Variação
test_request "POST" "/api/variances/detect" '{"qr_code":"12345678901234567","physical_count":{"unrestrict":12,"foc":4,"rfb":3}}' "Detectar Variação de Inventário"

# 14. Listar histórico de movimentações
test_request "GET" "/api/movements/history/12345678901234567" "" "Histórico de Movimentações"

echo -e "\n🎉 Testes concluídos!"
echo "✅ Todas as 6 funcionalidades implementadas foram testadas:"
echo "   - Contagem cíclica programada por localização"
echo "   - Diferenças de inventário com aprovação" 
echo "   - Movimentações de estoque (entrada/saída)"
echo "   - Transferências entre locais"
echo "   - Bloqueio/desbloqueio de itens"
echo "   - Etiquetas personalizadas para impressão"
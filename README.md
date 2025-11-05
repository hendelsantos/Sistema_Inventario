# Sistema de Inventário com QR Code

Um sistema web completo para gerenciamento de inventário utilizando leitura de QR codes via câmera do dispositivo móvel.

## 🚀 Funcionalidades

### 📱 Scanner QR Code
- Leitura de QR codes de 17 caracteres via câmera
- Input manual como alternativa
- Interface responsiva para dispositivos móveis

### 📊 Controle de Estoque
- **Unrestrict**: Estoque livre
- **FOC**: Free of Charge 
- **RFB**: Receita Federal do Brasil
- Cálculo automático do total
- Histórico completo de contagens

### 💾 Banco de Dados
- SQLite para armazenamento local
- Registro automático de data/hora
- Histórico completo de alterações
- Backup automático dos dados

### 📈 Dashboard e Relatórios
- Estatísticas em tempo real
- Pesquisa avançada com filtros
- Exportação para Excel (.xlsx)
- Exportação para JSON
- Interface moderna e intuitiva

## 🛠️ Tecnologias Utilizadas

- **Backend**: Node.js + Express.js
- **Frontend**: HTML5 + CSS3 + JavaScript (Vanilla)
- **Banco de Dados**: SQLite3
- **QR Scanner**: html5-qrcode library
- **Exportação**: SheetJS (xlsx)
- **UI/UX**: Font Awesome, Google Fonts
- **Deploy**: Railway (Nixpacks)

## � Deploy

### Railway (Recomendado)
1. Conecte seu repositório GitHub ao Railway
2. Deploy automático com Nixpacks
3. HTTPS automático para scanner QR mobile

### Desenvolvimento Local
```bash
npm install
npm start
# Acesse: http://localhost:3000
```

## 🗄️ Estrutura do Projeto

```
Sistema_Inventario/
├── src/
│   ├── database/
│   │   ├── database.js      # Configuração do SQLite
│   │   └── init.js          # Inicialização do banco
│   ├── routes/
│   │   ├── inventory.js     # Rotas do inventário
│   │   └── export.js        # Rotas de exportação
│   └── server.js            # Servidor Express
├── public/
│   ├── css/
│   │   └── style.css        # Estilos CSS
│   ├── js/
│   │   └── app.js           # JavaScript frontend
│   └── index.html           # Interface principal
├── database/
│   └── inventory.db         # Banco SQLite (criado automaticamente)
├── exports/                 # Arquivos de exportação
└── package.json
```

## 📊 Banco de Dados

### Tabela `items`
- `id`: Chave primária
- `qr_code`: Código QR único (17 caracteres)
- `description`: Descrição do item
- `location`: Localização
- `notes`: Anotações
- `created_at`, `updated_at`: Timestamps

### Tabela `stock_counts`
- `id`: Chave primária
- `item_id`: Referência ao item
- `qr_code`: Código QR
- `unrestrict`, `foc`, `rfb`: Quantidades por tipo
- `total`: Total calculado automaticamente
- `count_date`: Data/hora da contagem
- `notes`: Observações da contagem

## 🔧 API Endpoints

### Inventário
- `GET /api/inventory/item/:qrCode` - Buscar item por QR code
- `POST /api/inventory/item` - Adicionar/atualizar item e contagem
- `GET /api/inventory/items` - Listar todos os itens
- `GET /api/inventory/history/:qrCode` - Histórico de um item
- `DELETE /api/inventory/count/:countId` - Remover contagem

### Exportação
- `GET /api/export/excel` - Exportar para Excel
- `GET /api/export/json` - Exportar para JSON
- `GET /api/export/stats` - Estatísticas do dashboard

## 🎯 Como Usar

1. **Escaneie um QR Code**:
   - Clique em "Escanear QR"
   - Aponte a câmera para o código
   - Ou digite manualmente o código de 17 caracteres

2. **Preencha os dados**:
   - Descrição (opcional)
   - Localização (opcional)
   - Anotações (opcional)
   - **Quantidades (obrigatório)**:
     - Unrestrict
     - FOC
     - RFB

3. **Salve a contagem**:
   - O sistema calculará automaticamente o total
   - Registrará data/hora da contagem
   - Manterá histórico completo

4. **Consulte e exporte**:
   - Use a pesquisa para filtrar itens
   - Visualize o histórico de cada item
   - Exporte dados para Excel ou JSON

## 🔒 Segurança

- Rate limiting para prevenir spam
- Validação de dados no backend
- Sanitização de inputs
- Error handling robusto

## 📱 Responsividade

- Interface otimizada para dispositivos móveis
- Scanner QR funciona em smartphones
- Layout adaptativo para tablets e desktops
- Touch-friendly para uso em campo

## 🚀 Scripts Disponíveis

- `npm start`: Inicia o servidor em produção
- `npm run dev`: Inicia em modo desenvolvimento
- `npm run init-db`: Inicializa o banco de dados
- `npm test`: Executa testes (placeholder)

## 🤝 Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature
3. Commit suas mudanças
4. Push para a branch
5. Abra um Pull Request

## 📝 Licença

Este projeto está sob a licença MIT. Veja o arquivo LICENSE para mais detalhes.

## 🐛 Relatório de Bugs

Para reportar bugs ou solicitar novas funcionalidades, abra uma issue no repositório.

## 📞 Suporte

Para suporte técnico, entre em contato através dos issues do GitHub.
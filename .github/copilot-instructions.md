# Sistema de Inventário - Instruções Copilot

Este é um sistema web de inventário com leitura de QR codes e controle de estoque.

## Funcionalidades Principais:
- Leitura de QR codes de 17 caracteres via câmera do celular
- Controle de estoque em 3 categorias: Unrestrict, FOC, RFB
- Banco de dados SQLite para armazenamento
- Histórico de contagens com data/hora
- Exportação para Excel e JSON
- Interface web responsiva com filtros de pesquisa

## Stack Tecnológica:
- Backend: Node.js + Express.js
- Frontend: HTML5 + CSS3 + JavaScript (Vanilla)
- Banco: SQLite3
- QR Reader: html5-qrcode library
- Exportação: SheetJS (xlsx) + JSON nativo

## Estrutura:
- `/src/` - Código fonte
- `/public/` - Arquivos estáticos frontend
- `/database/` - Banco SQLite
- `/exports/` - Arquivos de exportação
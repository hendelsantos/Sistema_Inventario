# 📱 Guia Scanner QR Mobile - Troubleshooting

## ❌ Problemas Comuns e Soluções

### 1. **Scanner não abre no celular**

#### **Verificações básicas:**
```
✅ Site está em HTTPS? (obrigatório para câmera)
✅ Permissão da câmera foi concedida?
✅ Navegador suporta câmera?
✅ Câmera está funcionando?
```

#### **Soluções:**
- **HTTP**: Não funciona! Use HTTPS ou localhost
- **Permissão negada**: Vá em Configurações > Site > Câmera > Permitir
- **Navegador antigo**: Atualize Chrome/Safari/Firefox

### 2. **Câmera abre mas não lê QR code**

#### **Possíveis causas:**
- QR code muito pequeno/grande
- Baixa qualidade da imagem
- Pouca luz
- QR code danificado
- Código não tem 17 caracteres

#### **Soluções:**
- Aproxime/afaste o celular
- Ative o flash (botão torch)
- Use luz ambiente melhor
- Teste com entrada manual
- Verifique se QR tem exatamente 17 caracteres

### 3. **QR code lido mas rejeitado**

#### **Validações:**
- ✅ Exatamente 17 caracteres
- ✅ Apenas letras e números
- ✅ Sem espaços ou símbolos

#### **Exemplo válido:**
```
ABC1234567890DEFG (17 caracteres)
```

#### **Exemplos inválidos:**
```
❌ ABC123 (muito curto)
❌ ABC1234567890DEFGH (muito longo)  
❌ ABC-123-456-789 (com símbolos)
❌ ABC 123 456 789 (com espaços)
```

## 🔧 Como Testar

### **1. Teste HTTPS primeiro:**
```bash
# Deploy no Railway (HTTPS automático)
# ou teste local com:
npm start
# Acesse: http://localhost:3000 (apenas para teste)
```

### **2. Teste de permissões:**
1. Abra o site
2. Clique "Escanear QR"
3. Permita acesso à câmera
4. Verifique se o vídeo aparece

### **3. Teste com QR de exemplo:**
- Gere um QR com texto: `ABC1234567890DEFG`
- Use geradores online como qr-code-generator.com
- Teste escaneamento

### **4. Teste entrada manual:**
- Digite: `ABC1234567890DEFG`
- Clique "Confirmar"
- Deve aceitar e abrir formulário

## 📱 Configurações do Navegador

### **Chrome (Android):**
1. ⚙️ → Site Settings → Camera
2. Permitir para o site
3. Reiniciar navegador

### **Safari (iOS):**
1. Configurações → Safari → Câmera
2. Permitir para o site
3. Pode precisar recarregar

### **Firefox:**
1. Configurações → Permissões → Câmera
2. Adicionar exceção para o site

## 🚀 Melhorias Implementadas

### **Scanner Inteligente:**
- ✅ Detecção automática da câmera traseira
- ✅ Controles de zoom se disponível
- ✅ Botão de flash se suportado
- ✅ Tamanho dinâmico baseado na tela
- ✅ Mensagens de erro específicas

### **Validação Robusta:**
- ✅ Limpeza automática de espaços
- ✅ Conversão para maiúsculo
- ✅ Validação de caracteres
- ✅ Feedback visual imediato

### **Mobile Optimized:**
- ✅ Interface responsiva
- ✅ Botões grandes para touch
- ✅ Fonte adequada (evita zoom iOS)
- ✅ Cores contrastantes

## 🆘 Se Ainda Não Funcionar

### **1. Use entrada manual:**
- Clique "Escanear QR"
- Role para baixo
- Digite o código manualmente
- Clique "Confirmar"

### **2. Teste em outro dispositivo:**
- Outro celular
- Tablet
- Computador com webcam

### **3. Verifique logs:**
- Abra DevTools (F12)
- Console tab
- Procure erros em vermelho

### **4. Teste QR codes simples:**
```
Teste com estes códigos:
- ABC1234567890DEFG
- XYZ9876543210ABCD  
- 123ABCD567890EFGH
```

## 📞 Debug Mode

Para ativar logs detalhados, abra Console (F12) e digite:
```javascript
localStorage.setItem('debug', 'true');
location.reload();
```

Isso mostrará informações detalhadas sobre o scanner no console.
// Sistema de Cache Offline
class OfflineManager {
    constructor() {
        this.dbName = 'inventario-offline';
        this.version = 1;
        this.db = null;
        this.isOnline = navigator.onLine;
        this.syncQueue = [];
        
        this.initDB();
        this.setupEventListeners();
    }

    async initDB() {
        try {
            this.db = await this.openDB();
            console.log('📦 Banco offline inicializado');
        } catch (error) {
            console.error('❌ Erro ao inicializar banco offline:', error);
        }
    }

    openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Store para dados de inventário em cache
                if (!db.objectStoreNames.contains('inventory')) {
                    const inventoryStore = db.createObjectStore('inventory', { keyPath: 'qr_code' });
                    inventoryStore.createIndex('description', 'description', { unique: false });
                    inventoryStore.createIndex('location', 'location', { unique: false });
                    inventoryStore.createIndex('created_at', 'created_at', { unique: false });
                }
                
                // Store para dados pendentes de sincronização
                if (!db.objectStoreNames.contains('pending_sync')) {
                    const syncStore = db.createObjectStore('pending_sync', { keyPath: 'id', autoIncrement: true });
                    syncStore.createIndex('timestamp', 'timestamp', { unique: false });
                    syncStore.createIndex('action', 'action', { unique: false });
                }
                
                // Store para configurações e cache de API
                if (!db.objectStoreNames.contains('cache')) {
                    db.createObjectStore('cache', { keyPath: 'key' });
                }
            };
        });
    }

    setupEventListeners() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            console.log('🌐 Conexão restaurada');
            this.showConnectionStatus(true);
            this.syncPendingData();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            console.log('📴 Offline');
            this.showConnectionStatus(false);
        });
    }

    showConnectionStatus(isOnline) {
        const statusEl = document.getElementById('connectionStatus') || this.createStatusElement();
        statusEl.className = `connection-status ${isOnline ? 'online' : 'offline'}`;
        statusEl.innerHTML = `
            <i class="fas fa-${isOnline ? 'wifi' : 'wifi-slash'}"></i>
            ${isOnline ? 'Online' : 'Offline'}
        `;
    }

    createStatusElement() {
        const statusEl = document.createElement('div');
        statusEl.id = 'connectionStatus';
        statusEl.className = 'connection-status';
        
        const style = document.createElement('style');
        style.textContent = `
            .connection-status {
                position: fixed;
                top: 10px;
                right: 10px;
                padding: 8px 12px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: 500;
                z-index: 1000;
                transition: all 0.3s ease;
            }
            .connection-status.online {
                background: #d4edda;
                color: #155724;
                border: 1px solid #c3e6cb;
            }
            .connection-status.offline {
                background: #f8d7da;
                color: #721c24;
                border: 1px solid #f5c6cb;
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(statusEl);
        
        return statusEl;
    }

    // Cache de dados da API
    async cacheData(key, data, expirationMinutes = 30) {
        if (!this.db) return;
        
        const expiration = Date.now() + (expirationMinutes * 60 * 1000);
        const cacheEntry = {
            key,
            data,
            expiration,
            cached_at: Date.now()
        };
        
        try {
            const tx = this.db.transaction(['cache'], 'readwrite');
            await tx.objectStore('cache').put(cacheEntry);
            console.log('💾 Dados cached:', key);
        } catch (error) {
            console.error('❌ Erro ao cachear dados:', error);
        }
    }

    // Recuperar dados do cache
    async getCachedData(key) {
        if (!this.db) return null;
        
        try {
            const tx = this.db.transaction(['cache'], 'readonly');
            const cacheEntry = await tx.objectStore('cache').get(key);
            
            if (!cacheEntry) return null;
            
            // Verificar expiração
            if (Date.now() > cacheEntry.expiration) {
                await this.clearCachedData(key);
                return null;
            }
            
            console.log('🔍 Dados do cache:', key);
            return cacheEntry.data;
        } catch (error) {
            console.error('❌ Erro ao recuperar cache:', error);
            return null;
        }
    }

    // Limpar cache expirado
    async clearCachedData(key) {
        if (!this.db) return;
        
        try {
            const tx = this.db.transaction(['cache'], 'readwrite');
            await tx.objectStore('cache').delete(key);
        } catch (error) {
            console.error('❌ Erro ao limpar cache:', error);
        }
    }

    // Adicionar à fila de sincronização
    async addToSyncQueue(action, data) {
        if (!this.db) return;
        
        const syncItem = {
            action,
            data,
            timestamp: Date.now(),
            attempts: 0
        };
        
        try {
            const tx = this.db.transaction(['pending_sync'], 'readwrite');
            const result = await tx.objectStore('pending_sync').add(syncItem);
            console.log('⏳ Adicionado à fila de sincronização:', result);
            
            // Se estiver online, tentar sincronizar imediatamente
            if (this.isOnline) {
                setTimeout(() => this.syncPendingData(), 1000);
            }
            
            return result;
        } catch (error) {
            console.error('❌ Erro ao adicionar à fila:', error);
        }
    }

    // Sincronizar dados pendentes
    async syncPendingData() {
        if (!this.db || !this.isOnline) return;
        
        try {
            const tx = this.db.transaction(['pending_sync'], 'readonly');
            const pendingItems = await tx.objectStore('pending_sync').getAll();
            
            if (pendingItems.length === 0) return;
            
            console.log('🔄 Sincronizando', pendingItems.length, 'itens pendentes...');
            
            for (const item of pendingItems) {
                try {
                    await this.syncItem(item);
                    await this.removeSyncItem(item.id);
                } catch (error) {
                    console.error('❌ Erro ao sincronizar item:', error);
                    await this.updateSyncAttempts(item.id);
                }
            }
            
            if (window.app) {
                window.app.showToast('Dados sincronizados! 🔄', 'success');
                window.app.loadDashboardStats();
                window.app.applyFilters();
            }
        } catch (error) {
            console.error('❌ Erro na sincronização:', error);
        }
    }

    // Sincronizar item individual
    async syncItem(item) {
        const { action, data } = item;
        
        switch (action) {
            case 'CREATE_ITEM':
                return await fetch('/api/inventory', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
            
            case 'UPDATE_ITEM':
                return await fetch(`/api/inventory/${data.qr_code}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
            
            case 'DELETE_ITEM':
                return await fetch(`/api/inventory/${data.qr_code}`, {
                    method: 'DELETE'
                });
            
            default:
                throw new Error('Ação não reconhecida: ' + action);
        }
    }

    // Remover item da fila de sincronização
    async removeSyncItem(id) {
        if (!this.db) return;
        
        try {
            const tx = this.db.transaction(['pending_sync'], 'readwrite');
            await tx.objectStore('pending_sync').delete(id);
        } catch (error) {
            console.error('❌ Erro ao remover item da fila:', error);
        }
    }

    // Atualizar tentativas de sincronização
    async updateSyncAttempts(id) {
        if (!this.db) return;
        
        try {
            const tx = this.db.transaction(['pending_sync'], 'readwrite');
            const store = tx.objectStore('pending_sync');
            const item = await store.get(id);
            
            if (item) {
                item.attempts++;
                // Remover após 5 tentativas
                if (item.attempts >= 5) {
                    await store.delete(id);
                } else {
                    await store.put(item);
                }
            }
        } catch (error) {
            console.error('❌ Erro ao atualizar tentativas:', error);
        }
    }

    // Verificar se está online
    isConnectionAvailable() {
        return this.isOnline;
    }

    // Obter contagem de itens pendentes
    async getPendingCount() {
        if (!this.db) return 0;
        
        try {
            const tx = this.db.transaction(['pending_sync'], 'readonly');
            const count = await tx.objectStore('pending_sync').count();
            return count;
        } catch (error) {
            console.error('❌ Erro ao contar pendências:', error);
            return 0;
        }
    }
}

// Inicializar gerenciador offline
const offlineManager = new OfflineManager();

class InventoryApp {
    constructor() {
        this.currentQrCode = null;
        this.qrCodeScanner = null;
        this.isScanning = false;
        this.offlineManager = offlineManager;
        
        this.initializeElements();
        this.bindEvents();
        this.loadDashboardStats();
        this.applyFilters(); // Use the new filter system instead of loadItems
        this.showOfflineIndicator();
        
        // Verificar dados pendentes
        this.checkPendingSync();
    }

    initializeElements() {
        // Buttons
        this.scanBtn = document.getElementById('scanBtn');
        this.exportBtn = document.getElementById('exportBtn');
        this.closeScannerBtn = document.getElementById('closeScannerBtn');
        this.manualSubmitBtn = document.getElementById('manualSubmitBtn');
        this.cancelBtn = document.getElementById('cancelBtn');
        this.refreshBtn = document.getElementById('refreshBtn');
        this.clearFiltersBtn = document.getElementById('clearFiltersBtn');
        this.applyFiltersBtn = document.getElementById('applyFiltersBtn');
        this.exportFilteredBtn = document.getElementById('exportFilteredBtn');
        
        // Sections
        this.scannerSection = document.getElementById('scannerSection');
        this.itemForm = document.getElementById('itemForm');
        this.historySection = document.getElementById('historySection');
        
        // Form elements
        this.inventoryForm = document.getElementById('inventoryForm');
        this.manualCodeInput = document.getElementById('manualCode');
        this.itemQrCode = document.getElementById('itemQrCode');
        
        // Filter elements
        this.filterQrCode = document.getElementById('filterQrCode');
        this.filterDescription = document.getElementById('filterDescription');
        this.filterLocation = document.getElementById('filterLocation');
        this.filterStockType = document.getElementById('filterStockType');
        this.filterDateFrom = document.getElementById('filterDateFrom');
        this.filterDateTo = document.getElementById('filterDateTo');
        this.filterMinStock = document.getElementById('filterMinStock');
        this.filterMaxStock = document.getElementById('filterMaxStock');
        
        // Autocomplete containers
        this.suggestionsQrCode = document.getElementById('suggestionsQrCode');
        this.suggestionsDescription = document.getElementById('suggestionsDescription');
        this.suggestionsLocation = document.getElementById('suggestionsLocation');
        
        // Stock inputs
        this.unrestrictInput = document.getElementById('unrestrict');
        this.focInput = document.getElementById('foc');
        this.rfbInput = document.getElementById('rfb');
        this.totalDisplay = document.getElementById('totalDisplay');
        
        // Stats
        this.totalItemsEl = document.getElementById('totalItems');
        this.totalStockEl = document.getElementById('totalStock');
        this.todayCountsEl = document.getElementById('todayCounts');
        
        // Tables and results
        this.itemsTableBody = document.getElementById('itemsTableBody');
        this.loadingIndicator = document.getElementById('loadingIndicator');
        this.emptyState = document.getElementById('emptyState');
        this.resultsCount = document.getElementById('resultsCount');
        this.paginationContainer = document.getElementById('paginationContainer');
        
        // Modal
        this.exportModal = document.getElementById('exportModal');
        this.closeExportModal = document.getElementById('closeExportModal');
        this.exportExcelBtn = document.getElementById('exportExcelBtn');
        this.exportJsonBtn = document.getElementById('exportJsonBtn');
        this.startDateInput = document.getElementById('startDate');
        this.endDateInput = document.getElementById('endDate');
        
        // Toast
        this.toast = document.getElementById('toast');
        this.toastMessage = document.getElementById('toastMessage');
        
        // Pagination state
        this.currentPage = 1;
        this.itemsPerPage = 20;
        this.totalResults = 0;
    }

    bindEvents() {
        // Scanner events
        this.scanBtn.addEventListener('click', () => this.startQrScanner());
        this.closeScannerBtn.addEventListener('click', () => this.stopQrScanner());
        this.manualSubmitBtn.addEventListener('click', () => this.handleManualCode());
        this.manualCodeInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleManualCode();
        });
        
        // Form events
        this.inventoryForm.addEventListener('submit', (e) => this.handleFormSubmit(e));
        this.cancelBtn.addEventListener('click', () => this.hideItemForm());
        
        // Stock calculation
        [this.unrestrictInput, this.focInput, this.rfbInput].forEach(input => {
            input.addEventListener('input', () => this.updateTotal());
        });
        
        // Filter events
        this.clearFiltersBtn.addEventListener('click', () => this.clearFilters());
        this.applyFiltersBtn.addEventListener('click', () => this.applyFilters());
        this.refreshBtn.addEventListener('click', () => this.refreshData());
        this.exportFilteredBtn.addEventListener('click', () => this.exportFilteredResults());
        
        // Autocomplete events
        this.setupAutocomplete('filterQrCode', 'qr_code', this.suggestionsQrCode);
        this.setupAutocomplete('filterDescription', 'description', this.suggestionsDescription);
        this.setupAutocomplete('filterLocation', 'location', this.suggestionsLocation);
        
        // Real-time filter changes
        [this.filterQrCode, this.filterDescription, this.filterLocation, 
         this.filterStockType, this.filterDateFrom, this.filterDateTo,
         this.filterMinStock, this.filterMaxStock].forEach(input => {
            input.addEventListener('change', () => this.debounceFilter());
        });
        
        // Search
        this.searchInput.addEventListener('input', () => this.debounceSearch());
        this.refreshBtn.addEventListener('click', () => this.loadItems());
        
        // Export modal
        this.exportBtn.addEventListener('click', () => this.showExportModal());
        this.closeExportModal.addEventListener('click', () => this.hideExportModal());
        this.exportExcelBtn.addEventListener('click', () => this.exportData('excel'));
        this.exportJsonBtn.addEventListener('click', () => this.exportData('json'));
        
        // Close modal on outside click
        this.exportModal.addEventListener('click', (e) => {
            if (e.target === this.exportModal) this.hideExportModal();
        });
    }

    async startQrScanner() {
        try {
            this.scannerSection.style.display = 'block';
            this.hideItemForm();
            
            if (this.qrCodeScanner) {
                await this.qrCodeScanner.clear();
            }

            // Verificar se está em HTTPS (necessário para câmera no mobile)
            if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
                this.showToast('⚠️ HTTPS necessário para usar câmera no celular', 'error');
                return;
            }
            
            // Configurações otimizadas para mobile
            const config = {
                fps: 10,
                qrbox: function(viewfinderWidth, viewfinderHeight) {
                    // Tamanho dinâmico baseado na tela
                    const minEdgePercentage = 0.7;
                    const minEdgeSize = Math.min(viewfinderWidth, viewfinderHeight);
                    const qrboxSize = Math.floor(minEdgeSize * minEdgePercentage);
                    return {
                        width: qrboxSize,
                        height: qrboxSize
                    };
                },
                aspectRatio: 1.0,
                disableFlip: false, // Permitir flip da câmera
                videoConstraints: {
                    facingMode: { ideal: "environment" } // Câmera traseira preferencial
                },
                rememberLastUsedCamera: true,
                showTorchButtonIfSupported: true, // Botão de flash se disponível
                showZoomSliderIfSupported: true,  // Controle de zoom se disponível
                defaultZoomValueIfSupported: 2,   // Zoom padrão
                experimentalFeatures: {
                    useBarCodeDetectorIfSupported: true
                }
            };
            
            this.qrCodeScanner = new Html5QrcodeScanner('qr-reader', config);
            
            this.qrCodeScanner.render(
                (decodedText) => this.handleQrCodeScan(decodedText),
                (error) => {
                    // Apenas logar erros significativos
                    if (!error.includes('No QR code found') && 
                        !error.includes('NotFoundException') &&
                        !error.includes('code not found')) {
                        console.warn('QR scan error:', error);
                    }
                }
            );
            
            this.isScanning = true;
            this.showToast('📱 Scanner ativo - aponte para o QR code', 'success');
            
        } catch (error) {
            console.error('Erro ao iniciar scanner:', error);
            
            // Mensagens de erro específicas
            if (error.name === 'NotAllowedError') {
                this.showToast('❌ Permissão da câmera negada. Ative nas configurações do navegador.', 'error');
            } else if (error.name === 'NotFoundError') {
                this.showToast('📷 Nenhuma câmera encontrada no dispositivo.', 'error');
            } else if (error.name === 'NotSupportedError') {
                this.showToast('❌ Navegador não suporta acesso à câmera.', 'error');
            } else {
                this.showToast('❌ Erro ao acessar câmera: ' + error.message, 'error');
            }
        }
    }

    async stopQrScanner() {
        try {
            if (this.qrCodeScanner && this.isScanning) {
                await this.qrCodeScanner.clear();
                this.qrCodeScanner = null;
                this.isScanning = false;
            }
            this.scannerSection.style.display = 'none';
            this.manualCodeInput.value = '';
        } catch (error) {
            console.error('Erro ao parar scanner:', error);
        }
    }

    handleManualCode() {
        const code = this.manualCodeInput.value.trim().replace(/\s+/g, '').toUpperCase();
        
        if (code.length === 0) {
            this.showToast('Digite um código', 'error');
            return;
        }
        
        if (code.length !== 17) {
            this.showToast(`Código deve ter 17 caracteres. Atual: ${code.length}`, 'error');
            this.manualCodeInput.focus();
            return;
        }
        
        if (!/^[A-Za-z0-9]+$/.test(code)) {
            this.showToast('Código deve conter apenas letras e números', 'error');
            this.manualCodeInput.focus();
            return;
        }
        
        this.handleQrCodeScan(code);
    }

    async handleQrCodeScan(qrCode) {
        // Limpar espaços e caracteres especiais
        qrCode = qrCode.trim().replace(/\s+/g, '');
        
        console.log('QR Code escaneado:', qrCode, 'Tamanho:', qrCode.length);
        
        if (qrCode.length !== 17) {
            this.showToast(`❌ Código inválido! Tem ${qrCode.length} caracteres, precisa ter 17.`, 'error');
            
            // Não parar o scanner, continuar tentando
            setTimeout(() => {
                this.showToast('📱 Continue escaneando...', 'info');
            }, 2000);
            return;
        }

        // Validar se contém apenas caracteres alfanuméricos
        if (!/^[A-Za-z0-9]+$/.test(qrCode)) {
            this.showToast('❌ Código deve conter apenas letras e números', 'error');
            return;
        }

        this.currentQrCode = qrCode.toUpperCase(); // Padronizar em maiúsculo
        this.showToast('✅ QR Code válido escaneado!', 'success');
        
        await this.stopQrScanner();
        await this.loadItemData(this.currentQrCode);
        this.showItemForm();
    }

    async loadItemData(qrCode) {
        try {
            const response = await fetch(`/api/inventory/item/${qrCode}`);
            const data = await response.json();
            
            this.itemQrCode.textContent = qrCode;
            
            if (data.exists) {
                // Preencher formulário com dados existentes
                document.getElementById('description').value = data.item.description || '';
                document.getElementById('location').value = data.item.location || '';
                document.getElementById('notes').value = data.item.notes || '';
                
                // Mostrar histórico se existir
                if (data.counts && data.counts.length > 0) {
                    this.displayHistory(data.counts);
                    this.historySection.style.display = 'block';
                } else {
                    this.historySection.style.display = 'none';
                }
            } else {
                // Novo item - limpar formulário
                this.inventoryForm.reset();
                this.historySection.style.display = 'none';
            }
            
            // Reset stock values
            this.unrestrictInput.value = '0';
            this.focInput.value = '0';
            this.rfbInput.value = '0';
            this.updateTotal();
            
        } catch (error) {
            console.error('Erro ao carregar dados do item:', error);
            this.showToast('Erro ao carregar dados do item', 'error');
        }
    }

    displayHistory(counts) {
        const historyList = document.getElementById('historyList');
        historyList.innerHTML = '';
        
        counts.forEach(count => {
            const date = new Date(count.count_date).toLocaleString('pt-BR');
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            
            historyItem.innerHTML = `
                <div class="history-date">${date}</div>
                <div class="history-stocks">
                    <span class="stock-badge unrestrict">Unrestrict: ${count.unrestrict}</span>
                    <span class="stock-badge foc">FOC: ${count.foc}</span>
                    <span class="stock-badge rfb">RFB: ${count.rfb}</span>
                    <span class="stock-badge total">Total: ${count.total}</span>
                </div>
                ${count.notes ? `<div class="history-notes">${count.notes}</div>` : ''}
            `;
            
            historyList.appendChild(historyItem);
        });
    }

    updateTotal() {
        const unrestrict = parseInt(this.unrestrictInput.value) || 0;
        const foc = parseInt(this.focInput.value) || 0;
        const rfb = parseInt(this.rfbInput.value) || 0;
        const total = unrestrict + foc + rfb;
        
        this.totalDisplay.textContent = total;
    }

    async handleFormSubmit(e) {
        e.preventDefault();
        
        if (!this.currentQrCode) {
            this.showToast('Nenhum código QR selecionado', 'error');
            return;
        }
        
        const formData = {
            qrCode: this.currentQrCode,
            description: document.getElementById('description').value,
            location: document.getElementById('location').value,
            notes: document.getElementById('notes').value,
            unrestrict: parseInt(this.unrestrictInput.value) || 0,
            foc: parseInt(this.focInput.value) || 0,
            rfb: parseInt(this.rfbInput.value) || 0
        };
        
        try {
            // Usar método offline que tenta online primeiro
            const result = await this.submitFormOffline(formData);
            
            if (result.success) {
                const message = result.offline ? 
                    'Contagem salva offline! Será sincronizada quando voltar online.' :
                    'Contagem salva com sucesso!';
                
                this.showToast(message, 'success');
                this.hideItemForm();
                
                // Atualizar interface
                if (!result.offline) {
                    await this.loadDashboardStats();
                    await this.applyFilters();
                } else {
                    // Mostrar dados cached se offline
                    await this.loadDashboardStatsOffline();
                }
            } else {
                this.showToast(result.error || 'Erro ao salvar contagem', 'error');
            }
        } catch (error) {
            console.error('Erro ao salvar:', error);
            this.showToast('Erro ao salvar contagem', 'error');
        }
    }

    showItemForm() {
        this.itemForm.style.display = 'block';
        document.getElementById('description').focus();
    }

    hideItemForm() {
        this.itemForm.style.display = 'none';
        this.currentQrCode = null;
        this.inventoryForm.reset();
        this.historySection.style.display = 'none';
    }

    async loadDashboardStats() {
        try {
            // Usar versão offline que tenta online primeiro
            const stats = await this.loadDashboardStatsOffline();
            
            this.totalItemsEl.textContent = stats.totalItems?.count || 0;
            this.totalStockEl.textContent = stats.stockSummary?.grand_total || 0;
            this.todayCountsEl.textContent = stats.todayCounts?.count || 0;
        } catch (error) {
            console.error('Erro ao carregar estatísticas:', error);
            // Mostrar valores padrão se tudo falhar
            this.totalItemsEl.textContent = '0';
            this.totalStockEl.textContent = '0';
            this.todayCountsEl.textContent = '0';
        }
    }

    async loadItems(search = '') {
        // Redirect to new filter system
        if (search) {
            this.filterQrCode.value = search;
            this.filterDescription.value = search;
            this.filterLocation.value = search;
        }
        this.applyFilters();
    }

    debounceSearch() {
        // Legacy method - redirect to new filter system
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            this.applyFilters();
        }, 300);
    }

    displayItems(items) {
        this.itemsTableBody.innerHTML = '';
        
        if (items.length === 0) {
            this.emptyState.style.display = 'block';
            return;
        }
        
        this.emptyState.style.display = 'none';
        
        items.forEach(item => {
            const row = document.createElement('tr');
            const lastCount = item.count_date ? 
                new Date(item.count_date).toLocaleDateString('pt-BR') : 
                'Nunca';
            
            row.innerHTML = `
                <td><code>${item.qr_code}</code></td>
                <td>${item.description || '-'}</td>
                <td>${item.location || '-'}</td>
                <td><span class="stock-badge unrestrict">${item.unrestrict || 0}</span></td>
                <td><span class="stock-badge foc">${item.foc || 0}</span></td>
                <td><span class="stock-badge rfb">${item.rfb || 0}</span></td>
                <td><span class="stock-badge total">${item.total || 0}</span></td>
                <td>${lastCount}</td>
                <td>
                    <button class="action-btn view" onclick="inventoryApp.scanSpecificItem('${item.qr_code}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn history" onclick="inventoryApp.viewHistory('${item.qr_code}')">
                        <i class="fas fa-history"></i>
                    </button>
                </td>
            `;
            
            this.itemsTableBody.appendChild(row);
        });
    }

    async scanSpecificItem(qrCode) {
        this.currentQrCode = qrCode;
        await this.loadItemData(qrCode);
        this.showItemForm();
    }

    async viewHistory(qrCode) {
        try {
            const response = await fetch(`/api/inventory/history/${qrCode}`);
            const history = await response.json();
            
            // Criar modal simples para mostrar histórico
            alert(`Histórico do item ${qrCode}:\n\n` + 
                  history.map(h => 
                      `${new Date(h.count_date).toLocaleString('pt-BR')}: ` +
                      `Unrestrict: ${h.unrestrict}, FOC: ${h.foc}, RFB: ${h.rfb}, Total: ${h.total}`
                  ).join('\n'));
                  
        } catch (error) {
            console.error('Erro ao carregar histórico:', error);
            this.showToast('Erro ao carregar histórico', 'error');
        }
    }

    showExportModal() {
        // Set default dates (last 30 days)
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        
        this.startDateInput.value = startDate.toISOString().split('T')[0];
        this.endDateInput.value = endDate.toISOString().split('T')[0];
        
        this.exportModal.style.display = 'flex';
    }

    hideExportModal() {
        this.exportModal.style.display = 'none';
    }

    async exportData(format) {
        try {
            const startDate = this.startDateInput.value;
            const endDate = this.endDateInput.value;
            
            const url = new URL(`/api/export/${format}`, window.location.origin);
            if (startDate) url.searchParams.append('startDate', startDate);
            if (endDate) url.searchParams.append('endDate', endDate);
            
            // Open in new tab to trigger download
            window.open(url.toString(), '_blank');
            
            this.hideExportModal();
            this.showToast(`Exportação ${format.toUpperCase()} iniciada`, 'success');
            
        } catch (error) {
            console.error('Erro na exportação:', error);
            this.showToast('Erro na exportação', 'error');
        }
    }

    showToast(message, type = 'info') {
        this.toastMessage.textContent = message;
        this.toast.className = `toast ${type}`;
        this.toast.style.display = 'block';
        
        setTimeout(() => {
            this.toast.style.display = 'none';
        }, 3000);
    }

    // Autocomplete functionality
    setupAutocomplete(inputId, field, suggestionsContainer) {
        const input = document.getElementById(inputId);
        let currentFocus = -1;
        
        input.addEventListener('input', async () => {
            const term = input.value;
            if (term.length < 2) {
                this.hideSuggestions(suggestionsContainer);
                return;
            }
            
            try {
                const response = await fetch(`/api/inventory/suggestions/${field}?term=${encodeURIComponent(term)}`);
                const suggestions = await response.json();
                
                this.showSuggestions(suggestionsContainer, suggestions, input);
            } catch (error) {
                console.error('Erro ao buscar sugestões:', error);
            }
        });
        
        input.addEventListener('keydown', (e) => {
            const suggestions = suggestionsContainer.querySelectorAll('.suggestion-item');
            
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                currentFocus++;
                if (currentFocus >= suggestions.length) currentFocus = 0;
                this.setActiveSuggestion(suggestions, currentFocus);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                currentFocus--;
                if (currentFocus < 0) currentFocus = suggestions.length - 1;
                this.setActiveSuggestion(suggestions, currentFocus);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (currentFocus > -1 && suggestions[currentFocus]) {
                    input.value = suggestions[currentFocus].textContent;
                    this.hideSuggestions(suggestionsContainer);
                    this.debounceFilter();
                }
            } else if (e.key === 'Escape') {
                this.hideSuggestions(suggestionsContainer);
            }
        });
        
        // Hide suggestions when clicking outside
        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !suggestionsContainer.contains(e.target)) {
                this.hideSuggestions(suggestionsContainer);
            }
        });
    }
    
    showSuggestions(container, suggestions, input) {
        container.innerHTML = '';
        
        if (suggestions.length === 0) {
            this.hideSuggestions(container);
            return;
        }
        
        suggestions.forEach(suggestion => {
            const item = document.createElement('div');
            item.className = 'suggestion-item';
            item.textContent = suggestion;
            
            item.addEventListener('click', () => {
                input.value = suggestion;
                this.hideSuggestions(container);
                this.debounceFilter();
            });
            
            container.appendChild(item);
        });
        
        container.classList.add('show');
    }
    
    hideSuggestions(container) {
        container.classList.remove('show');
        container.innerHTML = '';
    }
    
    setActiveSuggestion(suggestions, index) {
        suggestions.forEach((item, i) => {
            item.classList.toggle('highlighted', i === index);
        });
    }
    
    // Filter functionality
    clearFilters() {
        this.filterQrCode.value = '';
        this.filterDescription.value = '';
        this.filterLocation.value = '';
        this.filterStockType.value = '';
        this.filterDateFrom.value = '';
        this.filterDateTo.value = '';
        this.filterMinStock.value = '';
        this.filterMaxStock.value = '';
        
        this.currentPage = 1;
        this.applyFilters();
    }
    
    applyFilters() {
        this.currentPage = 1;
        this.loadFilteredItems();
    }
    
    debounceFilter() {
        clearTimeout(this.filterTimeout);
        this.filterTimeout = setTimeout(() => {
            this.applyFilters();
        }, 500);
    }
    
    refreshData() {
        this.loadDashboardStats();
        this.applyFilters();
    }
    
    async loadFilteredItems() {
        try {
            this.loadingIndicator.style.display = 'block';
            this.emptyState.style.display = 'none';
            this.exportFilteredBtn.style.display = 'none';
            
            const params = new URLSearchParams({
                limit: this.itemsPerPage,
                offset: (this.currentPage - 1) * this.itemsPerPage
            });
            
            // Add filters
            if (this.filterQrCode.value) params.append('qr_code', this.filterQrCode.value);
            if (this.filterDescription.value) params.append('description', this.filterDescription.value);
            if (this.filterLocation.value) params.append('location', this.filterLocation.value);
            if (this.filterStockType.value) params.append('stock_type', this.filterStockType.value);
            if (this.filterDateFrom.value) params.append('date_from', this.filterDateFrom.value);
            if (this.filterDateTo.value) params.append('date_to', this.filterDateTo.value);
            if (this.filterMinStock.value) params.append('min_stock', this.filterMinStock.value);
            if (this.filterMaxStock.value) params.append('max_stock', this.filterMaxStock.value);
            
            const response = await fetch(`/api/inventory/search?${params}`);
            const data = await response.json();
            
            this.totalResults = data.total;
            this.displayItems(data.items);
            this.updateResultsInfo();
            this.updatePagination();
            
            if (data.items.length > 0) {
                this.exportFilteredBtn.style.display = 'inline-flex';
            }
            
        } catch (error) {
            console.error('Erro ao carregar itens filtrados:', error);
            this.showToast('Erro ao carregar resultados', 'error');
        } finally {
            this.loadingIndicator.style.display = 'none';
        }
    }
    
    updateResultsInfo() {
        const start = (this.currentPage - 1) * this.itemsPerPage + 1;
        const end = Math.min(this.currentPage * this.itemsPerPage, this.totalResults);
        
        if (this.totalResults === 0) {
            this.resultsCount.textContent = 'Nenhum resultado encontrado';
        } else {
            this.resultsCount.textContent = `Mostrando ${start}-${end} de ${this.totalResults} resultados`;
        }
    }
    
    updatePagination() {
        const totalPages = Math.ceil(this.totalResults / this.itemsPerPage);
        this.paginationContainer.innerHTML = '';
        
        if (totalPages <= 1) return;
        
        // Previous button
        const prevBtn = document.createElement('button');
        prevBtn.className = 'pagination-btn';
        prevBtn.innerHTML = '<i class="fas fa-chevron-left"></i>';
        prevBtn.disabled = this.currentPage === 1;
        prevBtn.addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.loadFilteredItems();
            }
        });
        this.paginationContainer.appendChild(prevBtn);
        
        // Page info
        const pageInfo = document.createElement('span');
        pageInfo.className = 'pagination-info';
        pageInfo.textContent = `Página ${this.currentPage} de ${totalPages}`;
        this.paginationContainer.appendChild(pageInfo);
        
        // Next button
        const nextBtn = document.createElement('button');
        nextBtn.className = 'pagination-btn';
        nextBtn.innerHTML = '<i class="fas fa-chevron-right"></i>';
        nextBtn.disabled = this.currentPage === totalPages;
        nextBtn.addEventListener('click', () => {
            if (this.currentPage < totalPages) {
                this.currentPage++;
                this.loadFilteredItems();
            }
        });
        this.paginationContainer.appendChild(nextBtn);
    }
    
    async exportFilteredResults() {
        try {
            const params = new URLSearchParams();
            
            // Add current filters
            if (this.filterQrCode.value) params.append('qr_code', this.filterQrCode.value);
            if (this.filterDescription.value) params.append('description', this.filterDescription.value);
            if (this.filterLocation.value) params.append('location', this.filterLocation.value);
            if (this.filterStockType.value) params.append('stock_type', this.filterStockType.value);
            if (this.filterDateFrom.value) params.append('date_from', this.filterDateFrom.value);
            if (this.filterDateTo.value) params.append('date_to', this.filterDateTo.value);
            if (this.filterMinStock.value) params.append('min_stock', this.filterMinStock.value);
            if (this.filterMaxStock.value) params.append('max_stock', this.filterMaxStock.value);
            
            // Export to Excel with current filters
            const url = `/api/export/excel?${params}`;
            window.open(url, '_blank');
            
            this.showToast('Exportação dos resultados filtrados iniciada', 'success');
            
        } catch (error) {
            console.error('Erro na exportação filtrada:', error);
            this.showToast('Erro na exportação', 'error');
        }
    }

    // Métodos para suporte offline
    async showOfflineIndicator() {
        await this.offlineManager.showConnectionStatus(navigator.onLine);
    }

    async checkPendingSync() {
        const pendingCount = await this.offlineManager.getPendingCount();
        if (pendingCount > 0) {
            this.showToast(`${pendingCount} itens aguardando sincronização`, 'info');
        }
    }

    // Override do submitForm para suporte offline
    async submitFormOffline(formData) {
        if (!this.offlineManager.isConnectionAvailable()) {
            // Salvar offline
            await this.offlineManager.addToSyncQueue('CREATE_ITEM', formData);
            this.showToast('Item salvo offline. Será sincronizado quando voltar online.', 'info');
            return { success: true, offline: true };
        }
        
        // Tentar enviar online
        try {
            const response = await fetch('/api/inventory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            
            if (!response.ok) throw new Error('Erro na requisição');
            
            return await response.json();
        } catch (error) {
            // Se falhar, salvar offline
            await this.offlineManager.addToSyncQueue('CREATE_ITEM', formData);
            this.showToast('Erro na conexão. Item salvo offline.', 'warning');
            return { success: true, offline: true };
        }
    }

    // Override dos métodos de carregamento para cache
    async loadDashboardStatsOffline() {
        // Tentar carregar online primeiro
        if (this.offlineManager.isConnectionAvailable()) {
            try {
                const response = await fetch('/api/inventory/stats');
                if (response.ok) {
                    const stats = await response.json();
                    // Cachear os dados
                    await this.offlineManager.cacheData('dashboard_stats', stats, 10);
                    return stats;
                }
            } catch (error) {
                console.log('Erro ao carregar stats online, tentando cache...');
            }
        }
        
        // Carregar do cache se offline ou se falhou
        const cachedStats = await this.offlineManager.getCachedData('dashboard_stats');
        if (cachedStats) {
            this.showToast('Dados carregados do cache local', 'info');
            return cachedStats;
        }
        
        // Retornar dados padrão se nada disponível
        return {
            totalItems: 0,
            totalUnrestrict: 0,
            totalFOC: 0,
            totalRFB: 0,
            recentScans: 0
        };
    }

    async loadItemsOffline(filters = {}) {
        // Tentar carregar online primeiro
        if (this.offlineManager.isConnectionAvailable()) {
            try {
                const queryParams = new URLSearchParams();
                Object.keys(filters).forEach(key => {
                    if (filters[key]) queryParams.append(key, filters[key]);
                });
                
                const url = `/api/inventory/search?${queryParams}`;
                const response = await fetch(url);
                
                if (response.ok) {
                    const data = await response.json();
                    // Cachear os dados
                    await this.offlineManager.cacheData(`items_${JSON.stringify(filters)}`, data, 5);
                    return data;
                }
            } catch (error) {
                console.log('Erro ao carregar itens online, tentando cache...');
            }
        }
        
        // Carregar do cache se offline ou se falhou
        const cacheKey = `items_${JSON.stringify(filters)}`;
        const cachedItems = await this.offlineManager.getCachedData(cacheKey);
        
        if (cachedItems) {
            this.showToast('Dados carregados do cache local', 'info');
            return cachedItems;
        }
        
        // Retornar dados vazios se nada disponível
        return {
            items: [],
            total: 0,
            page: 1,
            totalPages: 1
        };
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.inventoryApp = new InventoryApp();
});
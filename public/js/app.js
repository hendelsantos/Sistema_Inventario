class InventoryApp {
    constructor() {
        this.currentQrCode = null;
        this.qrCodeScanner = null;
        this.isScanning = false;
        
        this.initializeElements();
        this.bindEvents();
        this.loadDashboardStats();
        this.loadItems();
    }

    initializeElements() {
        // Buttons
        this.scanBtn = document.getElementById('scanBtn');
        this.exportBtn = document.getElementById('exportBtn');
        this.closeScannerBtn = document.getElementById('closeScannerBtn');
        this.manualSubmitBtn = document.getElementById('manualSubmitBtn');
        this.cancelBtn = document.getElementById('cancelBtn');
        this.refreshBtn = document.getElementById('refreshBtn');
        
        // Sections
        this.scannerSection = document.getElementById('scannerSection');
        this.itemForm = document.getElementById('itemForm');
        this.historySection = document.getElementById('historySection');
        
        // Form elements
        this.inventoryForm = document.getElementById('inventoryForm');
        this.manualCodeInput = document.getElementById('manualCode');
        this.itemQrCode = document.getElementById('itemQrCode');
        this.searchInput = document.getElementById('searchInput');
        
        // Stock inputs
        this.unrestrictInput = document.getElementById('unrestrict');
        this.focInput = document.getElementById('foc');
        this.rfbInput = document.getElementById('rfb');
        this.totalDisplay = document.getElementById('totalDisplay');
        
        // Stats
        this.totalItemsEl = document.getElementById('totalItems');
        this.totalStockEl = document.getElementById('totalStock');
        this.todayCountsEl = document.getElementById('todayCounts');
        
        // Tables
        this.itemsTableBody = document.getElementById('itemsTableBody');
        this.loadingIndicator = document.getElementById('loadingIndicator');
        this.emptyState = document.getElementById('emptyState');
        
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
            
            this.qrCodeScanner = new Html5QrcodeScanner('qr-reader', {
                fps: 10,
                qrbox: { width: 300, height: 300 },
                aspectRatio: 1.0
            });
            
            this.qrCodeScanner.render(
                (decodedText) => this.handleQrCodeScan(decodedText),
                (error) => {
                    // Ignorar erros de scan contínuo
                    if (!error.includes('No QR code found')) {
                        console.warn('QR scan error:', error);
                    }
                }
            );
            
            this.isScanning = true;
        } catch (error) {
            console.error('Erro ao iniciar scanner:', error);
            this.showToast('Erro ao acessar câmera', 'error');
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
        const code = this.manualCodeInput.value.trim();
        if (code.length === 17) {
            this.handleQrCodeScan(code);
        } else {
            this.showToast('O código deve ter exatamente 17 caracteres', 'error');
        }
    }

    async handleQrCodeScan(qrCode) {
        if (qrCode.length !== 17) {
            this.showToast('Código QR inválido. Deve ter 17 caracteres.', 'error');
            return;
        }

        this.currentQrCode = qrCode;
        await this.stopQrScanner();
        await this.loadItemData(qrCode);
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
            const response = await fetch('/api/inventory/item', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData)
            });
            
            const result = await response.json();
            
            if (response.ok) {
                this.showToast('Contagem salva com sucesso!', 'success');
                this.hideItemForm();
                this.loadDashboardStats();
                this.loadItems();
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
            const response = await fetch('/api/export/stats');
            const stats = await response.json();
            
            this.totalItemsEl.textContent = stats.totalItems?.count || 0;
            this.totalStockEl.textContent = stats.stockSummary?.grand_total || 0;
            this.todayCountsEl.textContent = stats.todayCounts?.count || 0;
        } catch (error) {
            console.error('Erro ao carregar estatísticas:', error);
        }
    }

    async loadItems(search = '') {
        try {
            this.loadingIndicator.style.display = 'block';
            this.emptyState.style.display = 'none';
            
            const url = new URL('/api/inventory/items', window.location.origin);
            if (search) url.searchParams.append('search', search);
            
            const response = await fetch(url);
            const items = await response.json();
            
            this.displayItems(items);
            
        } catch (error) {
            console.error('Erro ao carregar itens:', error);
            this.showToast('Erro ao carregar itens', 'error');
        } finally {
            this.loadingIndicator.style.display = 'none';
        }
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

    debounceSearch() {
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            this.loadItems(this.searchInput.value);
        }, 300);
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
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.inventoryApp = new InventoryApp();
});
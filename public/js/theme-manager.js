/**
 * Sistema de Temas - Gerenciador de Temas
 * Permite alternar entre diferentes temas da aplicação
 */

class ThemeManager {
    constructor() {
        this.currentTheme = localStorage.getItem('inventario-theme') || 'blue';
        this.themes = {
            blue: {
                name: 'Azul Escuro',
                description: 'Tema padrão profissional',
                dataAttribute: null // tema padrão, sem data-theme
            },
            minimal: {
                name: 'Minimalista',
                description: 'Preto e branco clean',
                dataAttribute: 'minimal'
            },
            dark: {
                name: 'Escuro',
                description: 'Tema escuro moderno',
                dataAttribute: 'dark'
            }
        };
        
        this.init();
    }

    init() {
        this.createThemeSelector();
        this.applyTheme(this.currentTheme);
        this.bindEvents();
    }

    createThemeSelector() {
        // Criar HTML do seletor de tema
        const selectorHTML = `
            <div class="theme-selector" id="themeSelector">
                <button class="theme-selector-toggle" id="themeSelectorToggle" title="Alterar Tema">
                    🎨
                </button>
                <div class="theme-options" id="themeOptions">
                    <div class="theme-option ${this.currentTheme === 'blue' ? 'active' : ''}" data-theme="blue">
                        <div class="theme-preview blue"></div>
                        <div>
                            <div class="theme-name">Azul Escuro</div>
                            <div class="theme-description">Tema padrão profissional</div>
                        </div>
                    </div>
                    <div class="theme-option ${this.currentTheme === 'minimal' ? 'active' : ''}" data-theme="minimal">
                        <div class="theme-preview minimal"></div>
                        <div>
                            <div class="theme-name">Minimalista</div>
                            <div class="theme-description">Preto e branco clean</div>
                        </div>
                    </div>
                    <div class="theme-option ${this.currentTheme === 'dark' ? 'active' : ''}" data-theme="dark">
                        <div class="theme-preview dark"></div>
                        <div>
                            <div class="theme-name">Escuro</div>
                            <div class="theme-description">Tema escuro moderno</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Inserir no DOM
        document.body.insertAdjacentHTML('beforeend', selectorHTML);
    }

    bindEvents() {
        const toggle = document.getElementById('themeSelectorToggle');
        const options = document.getElementById('themeOptions');
        const themeButtons = document.querySelectorAll('.theme-option');

        // Toggle do menu de temas
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            options.classList.toggle('show');
        });

        // Fechar menu ao clicar fora
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.theme-selector')) {
                options.classList.remove('show');
            }
        });

        // Seleção de tema
        themeButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                const selectedTheme = button.dataset.theme;
                this.setTheme(selectedTheme);
                options.classList.remove('show');
            });
        });

        // Atalho de teclado (Ctrl + T)
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 't') {
                e.preventDefault();
                this.cycleTheme();
            }
        });
    }

    applyTheme(themeName) {
        const theme = this.themes[themeName];
        if (!theme) return;

        // Remover todos os data-theme anteriores
        document.documentElement.removeAttribute('data-theme');
        
        // Aplicar novo tema se não for o padrão
        if (theme.dataAttribute) {
            document.documentElement.setAttribute('data-theme', theme.dataAttribute);
        }

        this.currentTheme = themeName;
        
        // Atualizar interface
        this.updateThemeSelector();
        
        // Salvar preferência
        localStorage.setItem('inventario-theme', themeName);
        
        // Disparar evento customizado
        document.dispatchEvent(new CustomEvent('themeChanged', {
            detail: { theme: themeName, themeData: theme }
        }));

        // Log para debug
        console.log(`✨ Tema alterado para: ${theme.name}`);
    }

    setTheme(themeName) {
        if (this.themes[themeName]) {
            this.applyTheme(themeName);
            
            // Feedback visual
            this.showThemeChangeNotification(this.themes[themeName].name);
        }
    }

    updateThemeSelector() {
        const options = document.querySelectorAll('.theme-option');
        options.forEach(option => {
            option.classList.remove('active');
            if (option.dataset.theme === this.currentTheme) {
                option.classList.add('active');
            }
        });
    }

    cycleTheme() {
        const themeKeys = Object.keys(this.themes);
        const currentIndex = themeKeys.indexOf(this.currentTheme);
        const nextIndex = (currentIndex + 1) % themeKeys.length;
        const nextTheme = themeKeys[nextIndex];
        
        this.setTheme(nextTheme);
    }

    showThemeChangeNotification(themeName) {
        // Criar notificação temporária
        const notification = document.createElement('div');
        notification.innerHTML = `
            <div style="
                position: fixed;
                top: 80px;
                right: 20px;
                background: var(--background-card);
                color: var(--text-primary);
                padding: 12px 20px;
                border-radius: 8px;
                box-shadow: 0 4px 20px var(--shadow-medium);
                border: 1px solid var(--border-color);
                z-index: 1001;
                font-size: 14px;
                font-weight: 500;
                animation: slideInRight 0.3s ease;
            ">
                🎨 Tema alterado para: ${themeName}
            </div>
        `;

        document.body.appendChild(notification);

        // Remover após 3 segundos
        setTimeout(() => {
            notification.style.animation = 'slideOutRight 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 2500);
    }

    getCurrentTheme() {
        return {
            name: this.currentTheme,
            data: this.themes[this.currentTheme]
        };
    }

    // Método para adicionar novos temas dinamicamente
    addTheme(key, themeConfig) {
        this.themes[key] = themeConfig;
        // Recriar seletor se necessário
        console.log(`➕ Novo tema adicionado: ${themeConfig.name}`);
    }

    // Método para obter todos os temas disponíveis
    getAllThemes() {
        return this.themes;
    }
}

// CSS para animações das notificações
const animationCSS = `
    @keyframes slideInRight {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOutRight {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;

// Adicionar CSS de animações
const style = document.createElement('style');
style.textContent = animationCSS;
document.head.appendChild(style);

// Inicializar o gerenciador de temas quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    window.themeManager = new ThemeManager();
    
    // Expor métodos globais para facilitar uso
    window.setTheme = (theme) => window.themeManager.setTheme(theme);
    window.getCurrentTheme = () => window.themeManager.getCurrentTheme();
    
    console.log('🎨 Sistema de Temas inicializado');
    console.log('💡 Dica: Use Ctrl+T para alternar temas rapidamente');
});

// Event listener para mudanças de tema (para integrações futuras)
document.addEventListener('themeChanged', (e) => {
    console.log('🎯 Tema alterado:', e.detail);
    
    // Aqui você pode adicionar lógica adicional quando o tema mudar
    // Por exemplo, salvar preferências do usuário, analytics, etc.
});
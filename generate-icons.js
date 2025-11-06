const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Tamanhos necessários para PWA
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

// Caminho do SVG original
const svgPath = path.join(__dirname, 'public', 'icons', 'icon.svg');
const iconsDir = path.join(__dirname, 'public', 'icons');

async function generateIcons() {
  console.log('🎨 Gerando ícones do PWA...');
  
  try {
    // Verificar se o SVG existe
    if (!fs.existsSync(svgPath)) {
      throw new Error('Arquivo SVG não encontrado: ' + svgPath);
    }

    // Gerar cada tamanho
    for (const size of sizes) {
      const outputPath = path.join(iconsDir, `icon-${size}x${size}.png`);
      
      await sharp(svgPath)
        .resize(size, size)
        .png({
          quality: 90,
          compressionLevel: 9
        })
        .toFile(outputPath);
      
      console.log(`✅ Gerado: icon-${size}x${size}.png`);
    }

    // Gerar ícones para shortcuts também
    const shortcutIcons = [
      { name: 'scan-shortcut.png', emoji: '📱' },
      { name: 'search-shortcut.png', emoji: '🔍' },
      { name: 'reports-shortcut.png', emoji: '📊' }
    ];

    for (const shortcut of shortcutIcons) {
      const shortcutSvg = `
        <svg width="96" height="96" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
          <circle cx="48" cy="48" r="40" fill="#4285f4"/>
          <text x="48" y="58" text-anchor="middle" font-size="32" fill="white">${shortcut.emoji}</text>
        </svg>
      `;
      
      const tempSvgPath = path.join(iconsDir, 'temp-shortcut.svg');
      fs.writeFileSync(tempSvgPath, shortcutSvg);
      
      await sharp(tempSvgPath)
        .resize(96, 96)
        .png({ quality: 90 })
        .toFile(path.join(iconsDir, shortcut.name));
      
      fs.unlinkSync(tempSvgPath);
      console.log(`✅ Gerado: ${shortcut.name}`);
    }

    console.log('🎉 Todos os ícones foram gerados com sucesso!');
    
    // Listar arquivos gerados
    const iconFiles = fs.readdirSync(iconsDir).filter(file => file.endsWith('.png'));
    console.log('📁 Ícones gerados:', iconFiles.join(', '));
    
  } catch (error) {
    console.error('❌ Erro ao gerar ícones:', error.message);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  generateIcons();
}

module.exports = generateIcons;
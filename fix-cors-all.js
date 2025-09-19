// Script para agregar CORS a todos los archivos de API
const fs = require('fs');
const path = require('path');

const corsHeaders = `  // CORS headers directos
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Manejar preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

`;

function addCorsToFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Verificar si ya tiene CORS headers
    if (content.includes('Access-Control-Allow-Origin')) {
      console.log(`✅ ${filePath} ya tiene CORS headers`);
      return;
    }

    // Buscar el patrón export default async (req, res) => {
    const pattern = /export default async \(req, res\) => \{/g;
    const match = pattern.exec(content);
    
    if (match) {
      const before = content.substring(0, match.index);
      const after = content.substring(match.index + match[0].length);
      
      const newContent = before + match[0] + '\n' + corsHeaders + after;
      
      fs.writeFileSync(filePath, newContent, 'utf8');
      console.log(`✅ CORS agregado a ${filePath}`);
    } else {
      console.log(`⚠️  No se encontró patrón en ${filePath}`);
    }
  } catch (error) {
    console.error(`❌ Error procesando ${filePath}:`, error.message);
  }
}

function processDirectory(dirPath) {
  const files = fs.readdirSync(dirPath);
  
  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      processDirectory(filePath);
    } else if (file.endsWith('.js')) {
      addCorsToFile(filePath);
    }
  });
}

console.log('🔧 Agregando CORS headers a todos los archivos de API...\n');

// Procesar directorios de API
const apiDirs = [
  './pages/api/app',
  './pages/api/admin',
  './pages/api/auth',
  './pages/api/auxi'
];

apiDirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    console.log(`\n📁 Procesando ${dir}:`);
    processDirectory(dir);
  }
});

console.log('\n✅ Proceso completado!');

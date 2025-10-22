import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

export default async (req, res) => {
  // CORS headers directos
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Manejar preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: true, msg: 'Method not allowed' });
  }

  console.log("=== BACKUP ENDPOINT ===");
  
  try {
    // Usar directorio temporal del sistema
    const tempDir = require('os').tmpdir();
    const backupDir = path.join(tempDir, 'cbm-backups');
    
    // Crear directorio temporal si no existe
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // Generar nombre único para el backup
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `cbm-backup-${timestamp}`;
    const backupPath = path.join(backupDir, backupName);

    console.log(`Generando backup temporal: ${backupName}`);
    console.log(`Directorio temporal: ${backupDir}`);

    // Comando mongodump
    const mongoUri = process.env.DB_URL || 'mongodb://cbmuser:CBM2025SecurePass123@ec2-3-139-58-107.us-east-2.compute.amazonaws.com:27017/cbm';
    const dumpCommand = `mongodump --uri="${mongoUri}" --out="${backupPath}"`;

    console.log('Ejecutando comando:', dumpCommand);
    
    // Ejecutar mongodump
    const { stdout, stderr } = await execAsync(dumpCommand);
    
    if (stderr && !stderr.includes('done dumping')) {
      console.error('Error en mongodump:', stderr);
      return res.status(500).json({ error: true, msg: 'Error al generar el backup: ' + stderr });
    }

    console.log('Backup generado exitosamente');
    console.log('stdout:', stdout);
    console.log('stderr:', stderr);

    // Crear archivo ZIP del backup
    const zipPath = `${backupPath}.zip`;
    const zipCommand = `cd "${backupDir}" && zip -r "${backupName}.zip" "${backupName}"`;
    
    console.log('Creando ZIP:', zipCommand);
    await execAsync(zipCommand);

    // Verificar que el ZIP se creó
    if (!fs.existsSync(zipPath)) {
      return res.status(500).json({ error: true, msg: 'Error al crear el archivo ZIP' });
    }

    // Obtener información del archivo
    const stats = fs.statSync(zipPath);
    const fileSize = stats.size;

    console.log(`Backup ZIP creado: ${zipPath} (${fileSize} bytes)`);

    // Configurar headers para descarga
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${backupName}.zip"`);
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Cache-Control', 'no-cache');

    // Enviar el archivo
    const fileStream = fs.createReadStream(zipPath);
    
    fileStream.on('error', (err) => {
      console.error('Error enviando archivo:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: true, msg: 'Error enviando archivo' });
      }
    });

    fileStream.on('end', () => {
      console.log('Archivo enviado exitosamente');
      
      // Limpiar archivos inmediatamente después de enviar
      setTimeout(() => {
        try {
          if (fs.existsSync(backupPath)) {
            fs.rmSync(backupPath, { recursive: true, force: true });
            console.log('Directorio backup eliminado:', backupPath);
          }
          if (fs.existsSync(zipPath)) {
            fs.unlinkSync(zipPath);
            console.log('Archivo ZIP eliminado:', zipPath);
          }
          console.log('Archivos temporales eliminados inmediatamente');
        } catch (cleanupError) {
          console.error('Error limpiando archivos temporales:', cleanupError);
        }
      }, 1000); // 1 segundo después de enviar
    });

    fileStream.pipe(res);

  } catch (err) {
    console.error('Error en backup:', err);
    if (!res.headersSent) {
      return res.status(500).json({ error: true, msg: 'Error al generar el backup: ' + err.message });
    }
  }
};

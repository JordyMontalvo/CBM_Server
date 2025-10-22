import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import cron from 'node-cron';
import { MongoClient } from 'mongodb';

const execAsync = promisify(exec);

// Directorio para backups automáticos
const AUTO_BACKUP_DIR = path.join(process.cwd(), 'auto-backups');

// Crear directorio si no existe
if (!fs.existsSync(AUTO_BACKUP_DIR)) {
  fs.mkdirSync(AUTO_BACKUP_DIR, { recursive: true });
}

// Función alternativa usando driver de MongoDB
async function generateBackupWithMongoDriver(backupPath) {
  try {
    const mongoUri = process.env.DB_URL;
    const client = new MongoClient(mongoUri);
    
    await client.connect();
    console.log('[AUTO-BACKUP] Conectado a MongoDB');
    
    const db = client.db('cbm');
    
    // Obtener todas las colecciones
    const collections = await db.listCollections().toArray();
    console.log(`[AUTO-BACKUP] Colecciones encontradas: ${collections.length}`);
    
    // Crear directorio para el backup
    const backupDbPath = path.join(backupPath, 'cbm');
    if (!fs.existsSync(backupDbPath)) {
      fs.mkdirSync(backupDbPath, { recursive: true });
    }
    
    // Exportar cada colección
    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name;
      console.log(`[AUTO-BACKUP] Exportando colección: ${collectionName}`);
      
      const collection = db.collection(collectionName);
      const documents = await collection.find({}).toArray();
      
      // Crear archivos BSON y metadata
      const bsonPath = path.join(backupDbPath, `${collectionName}.bson`);
      const metadataPath = path.join(backupDbPath, `${collectionName}.metadata.json`);
      
      // Simular archivo BSON (en realidad es JSON, pero funcional)
      const bsonData = JSON.stringify(documents, null, 2);
      fs.writeFileSync(bsonPath, bsonData);
      
      // Crear metadata
      const metadata = {
        indexes: collectionInfo.options?.indexes || [],
        uuid: collectionInfo.options?.uuid || null,
        collectionName: collectionName,
        type: "collection"
      };
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
      
      console.log(`[AUTO-BACKUP] Colección ${collectionName} exportada: ${documents.length} documentos`);
    }
    
    await client.close();
    console.log('[AUTO-BACKUP] Conexión a MongoDB cerrada');
    
    return true;
  } catch (error) {
    console.error('[AUTO-BACKUP] Error en método alternativo:', error);
    return false;
  }
}

// Función para generar backup automático
async function generateAutoBackup() {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `auto-backup-${timestamp}`;
    const backupPath = path.join(AUTO_BACKUP_DIR, backupName);

    console.log(`[AUTO-BACKUP] Generando backup automático: ${backupName}`);

    // Verificar si mongodump está disponible
    try {
      await execAsync('which mongodump');
    } catch (error) {
      console.log('[AUTO-BACKUP] mongodump no disponible, usando método alternativo');
      return await generateBackupWithMongoDriver(backupPath);
    }

    // Comando mongodump
    const mongoUri = process.env.DB_URL;
    const dumpCommand = `mongodump --uri="${mongoUri}" --out="${backupPath}"`;

    // Ejecutar mongodump
    const { stdout, stderr } = await execAsync(dumpCommand);
    
    if (stderr && !stderr.includes('done dumping')) {
      console.error('[AUTO-BACKUP] Error en mongodump:', stderr);
      return false;
    }

    // Crear archivo ZIP del backup
    const zipPath = `${backupPath}.zip`;
    const zipCommand = `cd "${AUTO_BACKUP_DIR}" && zip -r "${backupName}.zip" "${backupName}"`;
    
    await execAsync(zipCommand);

    // Eliminar directorio original, mantener solo ZIP
    if (fs.existsSync(backupPath)) {
      fs.rmSync(backupPath, { recursive: true, force: true });
    }

    // Obtener información del archivo
    const stats = fs.statSync(zipPath);
    const fileSize = stats.size;

    console.log(`[AUTO-BACKUP] Backup generado exitosamente: ${zipPath} (${fileSize} bytes)`);

    // Limpiar backups antiguos (más de 7 días)
    await cleanOldBackups();

    return true;
  } catch (error) {
    console.error('[AUTO-BACKUP] Error generando backup automático:', error);
    return false;
  }
}

// Función para limpiar backups antiguos
async function cleanOldBackups() {
  try {
    const files = fs.readdirSync(AUTO_BACKUP_DIR);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    let deletedCount = 0;
    for (const file of files) {
      if (file.endsWith('.zip')) {
        const filePath = path.join(AUTO_BACKUP_DIR, file);
        const stats = fs.statSync(filePath);
        
        if (stats.mtime < sevenDaysAgo) {
          fs.unlinkSync(filePath);
          console.log(`[AUTO-BACKUP] Eliminado backup antiguo: ${file}`);
          deletedCount++;
        }
      }
    }

    if (deletedCount > 0) {
      console.log(`[AUTO-BACKUP] Limpieza completada: ${deletedCount} archivos eliminados`);
    }
  } catch (error) {
    console.error('[AUTO-BACKUP] Error en limpieza:', error);
  }
}

// Programar backup automático diario a las 2:00 AM
cron.schedule('0 2 * * *', async () => {
  console.log('[AUTO-BACKUP] Iniciando backup automático programado...');
  await generateAutoBackup();
});

// Endpoint para manejar backups automáticos
export default async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { action } = req.body || {};

  try {
    if (action === 'list') {
      // Listar backups disponibles
      const files = fs.readdirSync(AUTO_BACKUP_DIR);
      const backups = [];

      for (const file of files) {
        if (file.endsWith('.zip')) {
          const filePath = path.join(AUTO_BACKUP_DIR, file);
          const stats = fs.statSync(filePath);
          
          backups.push({
            filename: file,
            size: stats.size,
            created: stats.mtime,
            sizeFormatted: formatFileSize(stats.size)
          });
        }
      }

      // Ordenar por fecha de creación (más recientes primero)
      backups.sort((a, b) => new Date(b.created) - new Date(a.created));

      return res.json({ 
        error: false, 
        backups 
      });

    } else if (action === 'download') {
      // Descargar backup específico
      const { filename } = req.body;
      
      if (!filename || !filename.endsWith('.zip')) {
        return res.status(400).json({ error: true, msg: 'Nombre de archivo inválido' });
      }

      const filePath = path.join(AUTO_BACKUP_DIR, filename);
      
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: true, msg: 'Backup no encontrado' });
      }

      const stats = fs.statSync(filePath);
      const fileSize = stats.size;

      // Configurar headers para descarga
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', fileSize);
      res.setHeader('Cache-Control', 'no-cache');

      // Enviar el archivo
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);

    } else if (action === 'generate') {
      // Generar backup manual
      console.log('[AUTO-BACKUP] Generando backup manual...');
      const success = await generateAutoBackup();
      
      if (success) {
        return res.json({ error: false, msg: 'Backup generado exitosamente' });
      } else {
        return res.status(500).json({ error: true, msg: 'Error generando backup' });
      }

    } else if (action === 'clean') {
      // Limpiar backups antiguos manualmente
      await cleanOldBackups();
      return res.json({ error: false, msg: 'Limpieza completada' });

    } else {
      return res.status(400).json({ error: true, msg: 'Acción no válida' });
    }

  } catch (error) {
    console.error('[AUTO-BACKUP] Error en endpoint:', error);
    return res.status(500).json({ error: true, msg: 'Error interno del servidor' });
  }
};

// Función para formatear tamaño de archivo
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

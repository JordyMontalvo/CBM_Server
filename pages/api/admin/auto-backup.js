import { MongoClient, ObjectId } from 'mongodb';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

// Función para formatear tamaño de archivo
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Función para generar backup simplificado (solo metadata)
async function generateBackupSimplified() {
  try {
    const mongoUri = process.env.DB_URL;
    const client = new MongoClient(mongoUri);
    
    await client.connect();
    console.log('[AUTO-BACKUP] Conectado a MongoDB');
    
    const db = client.db('cbm');
    
    // Generar nombre único para el backup
    const timestamp = new Date();
    const backupName = `auto-backup-${timestamp.toISOString().replace(/[:.]/g, '-')}`;
    
    console.log(`[AUTO-BACKUP] Generando backup: ${backupName}`);

    // Obtener todas las colecciones (excluyendo tablas de backup)
    const collections = await db.listCollections().toArray();
    const excludedCollections = ['backups', 'backup_chunks', 'backup_zips', 'backup_metadata'];
    const filteredCollections = collections.filter(col => !excludedCollections.includes(col.name));
    console.log(`[AUTO-BACKUP] Colecciones encontradas: ${filteredCollections.length} (excluyendo ${excludedCollections.length} tablas de backup)`);
    
    // Crear directorio temporal
    const tempDir = require('os').tmpdir();
    const backupTempDir = path.join(tempDir, `backup-${backupName}`);
    const backupJsonPath = path.join(backupTempDir, `${backupName}.json`);
    const backupZipPath = path.join(tempDir, `${backupName}.zip`);
    
    // Crear directorio temporal
    if (!fs.existsSync(backupTempDir)) {
      fs.mkdirSync(backupTempDir, { recursive: true });
    }
    
    // Crear archivo JSON de forma incremental para evitar problemas de memoria
    console.log(`[AUTO-BACKUP] Escribiendo archivo JSON de forma incremental...`);
    
    // Crear stream de escritura
    const writeStream = fs.createWriteStream(backupJsonPath);
    
    // Escribir inicio del JSON
    writeStream.write('{\n');
    writeStream.write(`  "name": "${backupName}",\n`);
    writeStream.write(`  "timestamp": "${timestamp.toISOString()}",\n`);
    writeStream.write('  "collections": {\n');
    
    let totalDocuments = 0;
    let collectionIndex = 0;
    
    // Exportar cada colección
    for (const collectionInfo of filteredCollections) {
      const collectionName = collectionInfo.name;
      console.log(`[AUTO-BACKUP] Exportando colección: ${collectionName}`);
      
      const collection = db.collection(collectionName);
      const documents = await collection.find({}).toArray();
      
      writeStream.write(`    "${collectionName}": {\n`);
      writeStream.write(`      "count": ${documents.length},\n`);
      writeStream.write(`      "documents": [\n`);
      
      // Escribir documentos de forma incremental
      for (let i = 0; i < documents.length; i++) {
        const doc = documents[i];
        const isLastDoc = (i === documents.length - 1);
        writeStream.write(`        ${JSON.stringify(doc)}${isLastDoc ? '' : ','}\n`);
      }
      
      writeStream.write(`      ]\n`);
      writeStream.write(`    }${collectionIndex === filteredCollections.length - 1 ? '' : ','}\n`);
      
      totalDocuments += documents.length;
      collectionIndex++;
      
      console.log(`[AUTO-BACKUP] Colección ${collectionName} exportada: ${documents.length} documentos`);
    }
    
    writeStream.write('  }\n');
    writeStream.write('}\n');
    
    // Cerrar stream
    await new Promise((resolve, reject) => {
      writeStream.end();
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
    
    console.log(`[AUTO-BACKUP] Archivo JSON creado: ${backupJsonPath}`);
    
    // Comprimir con ZIP
    const zipCommand = `cd "${tempDir}" && zip -r "${backupName}.zip" "${path.basename(backupTempDir)}"`;
    await execAsync(zipCommand);
    
    // Obtener información del archivo
    const jsonStats = fs.statSync(backupJsonPath);
    const zipStats = fs.statSync(backupZipPath);
    const originalSize = jsonStats.size;
    const compressedSize = zipStats.size;
    
    console.log(`[AUTO-BACKUP] Archivo ZIP creado: ${formatFileSize(compressedSize)} (comprimido desde ${formatFileSize(originalSize)})`);
    
    // Crear metadata del backup (SOLO metadata, sin duplicar datos)
    const backupMetadata = {
      name: backupName,
      timestamp: timestamp,
      originalSize: originalSize,
      compressedSize: compressedSize,
      compressionRatio: ((originalSize - compressedSize) / originalSize * 100).toFixed(2),
      totalDocuments: totalDocuments,
      collections: filteredCollections.map(col => col.name),
      status: 'completed',
      createdAt: new Date()
    };
    
    // Guardar SOLO metadata en la tabla backups
    const result = await db.collection('backups').insertOne(backupMetadata);
    
    console.log(`[AUTO-BACKUP] Backup metadata guardado: ${result.insertedId} (${formatFileSize(compressedSize)} comprimido, ${backupMetadata.compressionRatio}% reducción)`);
    
    // Limpiar archivos temporales
    try {
      fs.rmSync(backupTempDir, { recursive: true, force: true });
      fs.unlinkSync(backupZipPath);
      console.log(`[AUTO-BACKUP] Archivos temporales eliminados`);
    } catch (cleanupError) {
      console.error(`[AUTO-BACKUP] Error limpiando archivos temporales:`, cleanupError);
    }
    
    // Limpiar backups antiguos (más de 7 días)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const deleteResult = await db.collection('backups').deleteMany({
      timestamp: { $lt: sevenDaysAgo }
    });
    
    if (deleteResult.deletedCount > 0) {
      console.log(`[AUTO-BACKUP] Limpieza: ${deleteResult.deletedCount} backups antiguos eliminados`);
    }
    
    await client.close();
    console.log('[AUTO-BACKUP] Conexión a MongoDB cerrada');
    
    return {
      success: true,
      backupId: result.insertedId,
      name: backupName,
      size: compressedSize,
      compressionRatio: backupMetadata.compressionRatio
    };
    
  } catch (error) {
    console.error('[AUTO-BACKUP] Error generando backup:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Función para generar backup automático
async function generateAutoBackup() {
  console.log('[AUTO-BACKUP] Iniciando backup automático...');
  return await generateBackupSimplified();
}

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
    const mongoUri = process.env.DB_URL;
    const client = new MongoClient(mongoUri);
    
    await client.connect();
    const db = client.db('cbm');

    if (action === 'list') {
      // Listar backups disponibles desde la base de datos
      const backups = await db.collection('backups').find({})
        .sort({ timestamp: -1 })
        .toArray();

      const formattedBackups = backups.map(backup => ({
        id: backup._id,
        filename: backup.name,
        size: backup.compressedSize,
        originalSize: backup.originalSize,
        created: backup.timestamp,
        collections: backup.collections || [],
        totalDocuments: backup.totalDocuments || 0,
        compressionRatio: backup.compressionRatio || '0',
        sizeFormatted: formatFileSize(backup.compressedSize),
        originalSizeFormatted: formatFileSize(backup.originalSize)
      }));

      await client.close();
      return res.json({ 
        error: false, 
        backups: formattedBackups
      });

    } else if (action === 'generate') {
      // Generar backup manual
      console.log('[AUTO-BACKUP] Generando backup manual...');
      const result = await generateBackupSimplified();
      
      await client.close();
      
      if (result.success) {
        return res.json({ 
          error: false, 
          msg: 'Backup generado exitosamente',
          backupId: result.backupId,
          name: result.name,
          size: result.size,
          compressionRatio: result.compressionRatio
        });
      } else {
        return res.status(500).json({ 
          error: true, 
          msg: 'Error generando backup: ' + result.error 
        });
      }

    } else if (action === 'clean') {
      // Limpiar backups antiguos manualmente
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const deleteResult = await db.collection('backups').deleteMany({
        timestamp: { $lt: sevenDaysAgo }
      });
      
      await client.close();
      
      return res.json({ 
        error: false, 
        msg: `Limpieza completada: ${deleteResult.deletedCount} backups eliminados` 
      });

    } else {
      return res.status(400).json({ error: true, msg: 'Acción no válida' });
    }

  } catch (error) {
    console.error('[AUTO-BACKUP] Error en endpoint:', error);
    return res.status(500).json({ error: true, msg: 'Error interno del servidor' });
  }
};
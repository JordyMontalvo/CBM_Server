import { MongoClient, ObjectId } from 'mongodb';
import cron from 'node-cron';
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

// Función para generar backup en base de datos (con chunks)
async function generateBackupInDatabase() {
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
    const excludedCollections = ['backups', 'backup_chunks', 'backup_zips'];
    const filteredCollections = collections.filter(col => !excludedCollections.includes(col.name));
    console.log(`[AUTO-BACKUP] Colecciones encontradas: ${filteredCollections.length} (excluyendo ${excludedCollections.length} tablas de backup)`);
    
    // Crear metadata del backup
    const backupMetadata = {
      name: backupName,
      timestamp: timestamp,
      collections: {},
      totalDocuments: 0,
      totalChunks: 0
    };
    
    let chunkIndex = 0;
    const MAX_CHUNK_SIZE = 10 * 1024 * 1024; // 10MB por chunk (más conservador)
    
    // Exportar cada colección en chunks
    for (const collectionInfo of filteredCollections) {
      const collectionName = collectionInfo.name;
      console.log(`[AUTO-BACKUP] Exportando colección: ${collectionName}`);
      
      const collection = db.collection(collectionName);
      const documents = await collection.find({}).toArray();
      
      backupMetadata.collections[collectionName] = {
        count: documents.length,
        chunks: []
      };
      
      backupMetadata.totalDocuments += documents.length;
      
      // Dividir documentos en chunks si es necesario
      if (documents.length === 0) {
        console.log(`[AUTO-BACKUP] Colección ${collectionName} vacía`);
        continue;
      }
      
      let currentChunk = [];
      let currentSize = 0;
      
      for (const doc of documents) {
        // Calcular tamaño real del documento en BSON
        const docSize = Buffer.byteLength(JSON.stringify(doc), 'utf8');
        
        if (currentSize + docSize > MAX_CHUNK_SIZE && currentChunk.length > 0) {
          // Validar tamaño real del chunk antes de guardar
          const chunkJsonSize = Buffer.byteLength(JSON.stringify(currentChunk), 'utf8');
          if (chunkJsonSize > MAX_CHUNK_SIZE) {
            console.log(`[AUTO-BACKUP] Chunk demasiado grande (${formatFileSize(chunkJsonSize)}), dividiendo...`);
            
            // Dividir chunk en partes más pequeñas
            const midPoint = Math.floor(currentChunk.length / 2);
            const firstHalf = currentChunk.slice(0, midPoint);
            const secondHalf = currentChunk.slice(midPoint);
            
            // Guardar primera mitad
            const chunkData1 = {
              backupName: backupName,
              collectionName: collectionName,
              chunkIndex: chunkIndex,
              documents: firstHalf,
              size: Buffer.byteLength(JSON.stringify(firstHalf), 'utf8')
            };
            
            await db.collection('backup_chunks').insertOne(chunkData1);
            backupMetadata.collections[collectionName].chunks.push(chunkIndex);
            backupMetadata.totalChunks++;
            chunkIndex++;
            
            console.log(`[AUTO-BACKUP] Chunk ${chunkIndex - 1} guardado para ${collectionName}: ${firstHalf.length} documentos (${formatFileSize(chunkData1.size)})`);
            
            // Guardar segunda mitad
            const chunkData2 = {
              backupName: backupName,
              collectionName: collectionName,
              chunkIndex: chunkIndex,
              documents: secondHalf,
              size: Buffer.byteLength(JSON.stringify(secondHalf), 'utf8')
            };
            
            await db.collection('backup_chunks').insertOne(chunkData2);
            backupMetadata.collections[collectionName].chunks.push(chunkIndex);
            backupMetadata.totalChunks++;
            chunkIndex++;
            
            console.log(`[AUTO-BACKUP] Chunk ${chunkIndex - 1} guardado para ${collectionName}: ${secondHalf.length} documentos (${formatFileSize(chunkData2.size)})`);
          } else {
            // Guardar chunk actual
            const chunkData = {
              backupName: backupName,
              collectionName: collectionName,
              chunkIndex: chunkIndex,
              documents: currentChunk,
              size: currentSize
            };
            
            await db.collection('backup_chunks').insertOne(chunkData);
            backupMetadata.collections[collectionName].chunks.push(chunkIndex);
            backupMetadata.totalChunks++;
            chunkIndex++;
            
            console.log(`[AUTO-BACKUP] Chunk ${chunkIndex - 1} guardado para ${collectionName}: ${currentChunk.length} documentos (${formatFileSize(currentSize)})`);
          }
          
          // Reiniciar chunk
          currentChunk = [doc];
          currentSize = docSize;
        } else {
          currentChunk.push(doc);
          currentSize += docSize;
        }
      }
      
      // Guardar último chunk si tiene datos
      if (currentChunk.length > 0) {
        // Validar tamaño del chunk antes de guardar
        const chunkJsonSize = Buffer.byteLength(JSON.stringify(currentChunk), 'utf8');
        if (chunkJsonSize > MAX_CHUNK_SIZE) {
          console.log(`[AUTO-BACKUP] Chunk demasiado grande (${formatFileSize(chunkJsonSize)}), dividiendo...`);
          
          // Dividir chunk en partes más pequeñas
          const midPoint = Math.floor(currentChunk.length / 2);
          const firstHalf = currentChunk.slice(0, midPoint);
          const secondHalf = currentChunk.slice(midPoint);
          
          // Guardar primera mitad
          const chunkData1 = {
            backupName: backupName,
            collectionName: collectionName,
            chunkIndex: chunkIndex,
            documents: firstHalf,
            size: Buffer.byteLength(JSON.stringify(firstHalf), 'utf8')
          };
          
          await db.collection('backup_chunks').insertOne(chunkData1);
          backupMetadata.collections[collectionName].chunks.push(chunkIndex);
          backupMetadata.totalChunks++;
          chunkIndex++;
          
          console.log(`[AUTO-BACKUP] Chunk ${chunkIndex - 1} guardado para ${collectionName}: ${firstHalf.length} documentos (${formatFileSize(chunkData1.size)})`);
          
          // Guardar segunda mitad
          const chunkData2 = {
            backupName: backupName,
            collectionName: collectionName,
            chunkIndex: chunkIndex,
            documents: secondHalf,
            size: Buffer.byteLength(JSON.stringify(secondHalf), 'utf8')
          };
          
          await db.collection('backup_chunks').insertOne(chunkData2);
          backupMetadata.collections[collectionName].chunks.push(chunkIndex);
          backupMetadata.totalChunks++;
          chunkIndex++;
          
          console.log(`[AUTO-BACKUP] Chunk ${chunkIndex - 1} guardado para ${collectionName}: ${secondHalf.length} documentos (${formatFileSize(chunkData2.size)})`);
        } else {
          const chunkData = {
            backupName: backupName,
            collectionName: collectionName,
            chunkIndex: chunkIndex,
            documents: currentChunk,
            size: currentSize
          };
          
          await db.collection('backup_chunks').insertOne(chunkData);
          backupMetadata.collections[collectionName].chunks.push(chunkIndex);
          backupMetadata.totalChunks++;
          chunkIndex++;
          
          console.log(`[AUTO-BACKUP] Chunk ${chunkIndex - 1} guardado para ${collectionName}: ${currentChunk.length} documentos (${formatFileSize(currentSize)})`);
        }
      }
      
      console.log(`[AUTO-BACKUP] Colección ${collectionName} exportada: ${documents.length} documentos en ${backupMetadata.collections[collectionName].chunks.length} chunks`);
    }
    
    // Crear archivo ZIP comprimido
    console.log(`[AUTO-BACKUP] Creando archivo ZIP comprimido...`);
    
    // Crear directorio temporal
    const tempDir = require('os').tmpdir();
    const backupTempDir = path.join(tempDir, `backup-${backupName}`);
    const backupJsonPath = path.join(backupTempDir, `${backupName}.json`);
    const backupZipPath = path.join(tempDir, `${backupName}.zip`);
    
    // Crear directorio temporal
    if (!fs.existsSync(backupTempDir)) {
      fs.mkdirSync(backupTempDir, { recursive: true });
    }
    
    // Crear archivos separados por colección para evitar problemas de memoria
    console.log(`[AUTO-BACKUP] Creando archivos separados por colección...`);
    
    // Obtener todos los chunks
    const allChunks = await db.collection('backup_chunks').find({
      backupName: backupName
    }).sort({ chunkIndex: 1 }).toArray();
    
    const collectionNames = Object.keys(backupMetadata.collections);
    
    // Crear archivo de información del backup
    const backupInfo = {
      name: backupName,
      timestamp: backupMetadata.timestamp.toISOString(),
      totalDocuments: backupMetadata.totalDocuments,
      totalChunks: backupMetadata.totalChunks,
      collections: {}
    };
    
    for (let i = 0; i < collectionNames.length; i++) {
      const collectionName = collectionNames[i];
      const collectionInfo = backupMetadata.collections[collectionName];
      
      console.log(`[AUTO-BACKUP] Procesando colección: ${collectionName}...`);
      
      // Crear archivo JSON para esta colección
      const collectionFilePath = path.join(backupTempDir, `${collectionName}.json`);
      const writeStream = fs.createWriteStream(collectionFilePath);
      
      // Escribir estructura de la colección
      writeStream.write('{\n');
      writeStream.write(`  "name": "${collectionName}",\n`);
      writeStream.write(`  "count": ${collectionInfo.count},\n`);
      writeStream.write(`  "documents": [\n`);
      
      // Obtener chunks de esta colección
      const collectionChunks = allChunks.filter(chunk => chunk.collectionName === collectionName);
      
      let isFirstDoc = true;
      for (let j = 0; j < collectionChunks.length; j++) {
        const chunk = collectionChunks[j];
        
        // Escribir documentos del chunk
        for (let k = 0; k < chunk.documents.length; k++) {
          const doc = chunk.documents[k];
          if (!isFirstDoc) {
            writeStream.write(',\n');
          }
          writeStream.write(`    ${JSON.stringify(doc)}`);
          isFirstDoc = false;
        }
      }
      
      writeStream.write('\n  ]\n');
      writeStream.write('}\n');
      writeStream.end();
      
      // Esperar a que termine la escritura de esta colección
      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });
      
      // Agregar información de la colección al backup info
      backupInfo.collections[collectionName] = {
        count: collectionInfo.count,
        chunks: collectionInfo.chunks.length,
        file: `${collectionName}.json`
      };
      
      console.log(`[AUTO-BACKUP] Colección ${collectionName} guardada: ${collectionInfo.count} documentos`);
    }
    
    // Guardar archivo de información del backup
    const infoFilePath = path.join(backupTempDir, 'backup-info.json');
    fs.writeFileSync(infoFilePath, JSON.stringify(backupInfo, null, 2));
    
    console.log(`[AUTO-BACKUP] Archivos de colección creados`);
    
    // Comprimir con ZIP
    console.log(`[AUTO-BACKUP] Comprimiendo archivos...`);
    const zipCommand = `cd "${tempDir}" && zip -r "${backupName}.zip" "${path.basename(backupTempDir)}"`;
    await execAsync(zipCommand);
    
    // Leer archivo ZIP comprimido
    const zipBuffer = fs.readFileSync(backupZipPath);
    const compressedSize = zipBuffer.length;
    
    console.log(`[AUTO-BACKUP] Archivo ZIP creado: ${formatFileSize(compressedSize)}`);
    
    // Guardar archivo ZIP en la base de datos
    const zipData = {
      backupName: backupName,
      zipBuffer: zipBuffer,
      compressedSize: compressedSize,
      createdAt: new Date()
    };
    
    await db.collection('backup_zips').insertOne(zipData);
    
    // Actualizar metadata con información de compresión
    backupMetadata.size = compressedSize;
    backupMetadata.zipId = zipData._id;
    
    // Guardar metadata del backup
    const result = await db.collection('backups').insertOne(backupMetadata);
    
    console.log(`[AUTO-BACKUP] Backup guardado en DB: ${result.insertedId} (${backupMetadata.totalChunks} chunks, ${formatFileSize(compressedSize)} comprimido)`);
    
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
    
    const oldBackups = await db.collection('backups').find({
      timestamp: { $lt: sevenDaysAgo }
    }).toArray();
    
    for (const oldBackup of oldBackups) {
      // Eliminar chunks del backup antiguo
      await db.collection('backup_chunks').deleteMany({
        backupName: oldBackup.name
      });
    }
    
    const deleteResult = await db.collection('backups').deleteMany({
      timestamp: { $lt: sevenDaysAgo }
    });
    
    if (deleteResult.deletedCount > 0) {
      console.log(`[AUTO-BACKUP] Limpieza: ${deleteResult.deletedCount} backups antiguos eliminados`);
    }
    
    await client.close();
    console.log('[AUTO-BACKUP] Conexión a MongoDB cerrada');
    
    return true;
  } catch (error) {
    console.error('[AUTO-BACKUP] Error generando backup:', error);
    return false;
  }
}

// Función para generar backup automático
async function generateAutoBackup() {
  console.log('[AUTO-BACKUP] Iniciando backup automático...');
  return await generateBackupInDatabase();
}

// Función para limpiar backups antiguos
async function cleanOldBackups() {
  try {
    const mongoUri = process.env.DB_URL;
    const client = new MongoClient(mongoUri);
    
    await client.connect();
    const db = client.db('cbm');
    
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    // Obtener backups antiguos
    const oldBackups = await db.collection('backups').find({
      timestamp: { $lt: sevenDaysAgo }
    }).toArray();
    
    // Eliminar chunks y ZIPs de backups antiguos
    for (const oldBackup of oldBackups) {
      await db.collection('backup_chunks').deleteMany({
        backupName: oldBackup.name
      });
      
      await db.collection('backup_zips').deleteMany({
        backupName: oldBackup.name
      });
    }
    
    // Eliminar metadata de backups antiguos
    const deleteResult = await db.collection('backups').deleteMany({
      timestamp: { $lt: sevenDaysAgo }
    });
    
    if (deleteResult.deletedCount > 0) {
      console.log(`[AUTO-BACKUP] Limpieza completada: ${deleteResult.deletedCount} backups eliminados`);
    }
    
    await client.close();
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
        size: backup.size,
        created: backup.timestamp,
        collections: backup.collections ? Object.keys(backup.collections) : [],
        totalDocuments: backup.totalDocuments || 0,
        sizeFormatted: formatFileSize(backup.size)
      }));

      await client.close();
      return res.json({ 
        error: false, 
        backups: formattedBackups
      });

    } else if (action === 'download') {
      // Descargar backup específico
      const { backupId } = req.body;
      
      if (!backupId) {
        await client.close();
        return res.status(400).json({ error: true, msg: 'ID de backup requerido' });
      }

      const backup = await db.collection('backups').findOne({ _id: new ObjectId(backupId) });
      
      if (!backup) {
        await client.close();
        return res.status(404).json({ error: true, msg: 'Backup no encontrado' });
      }

      // Obtener archivo ZIP comprimido
      const zipData = await db.collection('backup_zips').findOne({
        backupName: backup.name
      });

      if (!zipData) {
        await client.close();
        return res.status(404).json({ error: true, msg: 'Archivo ZIP del backup no encontrado' });
      }

      // Configurar headers para descarga de ZIP
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${backup.name}.zip"`);
      res.setHeader('Content-Length', zipData.compressedSize);
      res.setHeader('Cache-Control', 'no-cache');

      // Enviar el archivo ZIP
      await client.close();
      res.send(zipData.zipBuffer);

    } else if (action === 'generate') {
      // Generar backup manual
      console.log('[AUTO-BACKUP] Generando backup manual...');
      const success = await generateBackupInDatabase();
      
      await client.close();
      
      if (success) {
        return res.json({ error: false, msg: 'Backup generado exitosamente' });
      } else {
        return res.status(500).json({ error: true, msg: 'Error generando backup' });
      }

    } else if (action === 'clean') {
      // Limpiar backups antiguos manualmente
      await cleanOldBackups();
      await client.close();
      return res.json({ error: false, msg: 'Limpieza completada' });

    } else {
      return res.status(400).json({ error: true, msg: 'Acción no válida' });
    }

  } catch (error) {
    console.error('[AUTO-BACKUP] Error en endpoint:', error);
    return res.status(500).json({ error: true, msg: 'Error interno del servidor' });
  }
};

import { MongoClient } from 'mongodb';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream';
import { promisify as promisifyUtil } from 'util';

const execAsync = promisify(exec);
const pipelineAsync = promisifyUtil(pipeline);

// Función para formatear tamaño de archivo
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

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

  console.log("=== BACKUP COMPLETE ENDPOINT ===");
  console.log("Request method:", req.method);
  console.log("Request headers:", req.headers);
  
  // Configurar timeout más largo para backup
  req.setTimeout(600000); // 10 minutos
  res.setTimeout(600000); // 10 minutos
  
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
    const backupName = `cbm-complete-backup-${timestamp}`;
    const backupPath = path.join(backupDir, backupName);

    console.log(`Generando backup completo: ${backupName}`);
    console.log(`Directorio temporal: ${backupDir}`);

    // Conectar a MongoDB usando el driver nativo
    const mongoUri = process.env.DB_URL || 'mongodb://cbmuser:CBM2025SecurePass123@ec2-3-139-58-107.us-east-2.compute.amazonaws.com:27017/cbm';
    const client = new MongoClient(mongoUri);
    
    await client.connect();
    console.log('Conectado a MongoDB');
    
    const db = client.db('cbm');
    
    // Obtener todas las colecciones (excluyendo tablas de backup)
    const collections = await db.listCollections().toArray();
    const excludedCollections = ['backups', 'backup_chunks', 'backup_zips', 'backup_metadata'];
    const filteredCollections = collections.filter(col => !excludedCollections.includes(col.name));
    console.log(`Colecciones encontradas: ${filteredCollections.length} (excluyendo ${excludedCollections.length} tablas de backup)`);
    
    // Crear directorio para el backup
    const backupDbPath = path.join(backupPath, 'cbm');
    if (!fs.existsSync(backupDbPath)) {
      fs.mkdirSync(backupDbPath, { recursive: true });
    }
    
    // Crear archivo JSON principal con streaming
    const mainJsonPath = path.join(backupDbPath, 'complete-backup.json');
    const writeStream = createWriteStream(mainJsonPath);
    
    // Escribir inicio del JSON
    writeStream.write('{\n');
    writeStream.write(`  "name": "complete-backup-${timestamp}",\n`);
    writeStream.write(`  "timestamp": "${new Date().toISOString()}",\n`);
    writeStream.write('  "collections": {\n');
    
    let totalDocuments = 0;
    let collectionIndex = 0;
    
    // Exportar cada colección usando streaming
    for (const collectionInfo of filteredCollections) {
      const collectionName = collectionInfo.name;
      console.log(`Exportando colección: ${collectionName}`);
      
      const collection = db.collection(collectionName);
      
      // Obtener conteo de documentos
      const totalDocs = await collection.countDocuments();
      console.log(`Colección ${collectionName}: ${totalDocs} documentos`);
      
      writeStream.write(`    "${collectionName}": {\n`);
      writeStream.write(`      "count": ${totalDocs},\n`);
      writeStream.write(`      "documents": [\n`);
      
      // Usar cursor para procesar documentos en lotes muy pequeños
      const cursor = collection.find({});
      let documentCount = 0;
      let batch = [];
      const BATCH_SIZE = 25; // Lotes muy pequeños para Heroku
      
      for await (const doc of cursor) {
        batch.push(doc);
        documentCount++;
        
        if (batch.length >= BATCH_SIZE) {
          // Escribir batch al archivo
          for (let i = 0; i < batch.length; i++) {
            const isLast = (i === batch.length - 1);
            writeStream.write(`        ${JSON.stringify(batch[i])}${isLast ? '' : ','}\n`);
          }
          
          batch = []; // Limpiar batch
          
          // Forzar garbage collection si está disponible
          if (global.gc) {
            global.gc();
          }
          
          // Pausa para liberar memoria
          await new Promise(resolve => setTimeout(resolve, 5));
        }
      }
      
      // Escribir batch final
      for (let i = 0; i < batch.length; i++) {
        const isLast = (i === batch.length - 1);
        writeStream.write(`        ${JSON.stringify(batch[i])}${isLast ? '' : ','}\n`);
      }
      
      writeStream.write(`      ]\n`);
      writeStream.write(`    }${collectionIndex === filteredCollections.length - 1 ? '' : ','}\n`);
      
      totalDocuments += documentCount;
      collectionIndex++;
      
      console.log(`Colección ${collectionName} exportada: ${documentCount} documentos`);
    }
    
    writeStream.write('  }\n');
    writeStream.write('}\n');
    writeStream.end();
    
    await client.close();
    console.log('Conexión a MongoDB cerrada');

    // Crear archivo ZIP del backup con compresión máxima
    const zipPath = `${backupPath}.zip`;
    const zipCommand = `cd "${backupDir}" && zip -9 -r "${backupName}.zip" "${backupName}"`;
    
    console.log('Creando ZIP con compresión máxima:', zipCommand);
    await execAsync(zipCommand);

    // Verificar que el ZIP se creó
    if (!fs.existsSync(zipPath)) {
      return res.status(500).json({ error: true, msg: 'Error al crear el archivo ZIP' });
    }

    // Obtener información del archivo
    const stats = fs.statSync(zipPath);
    const fileSize = stats.size;

    console.log(`Backup ZIP creado: ${zipPath} (${formatFileSize(fileSize)})`);

    // Configurar headers para descarga
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${backupName}.zip"`);
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length');

    // Enviar el archivo usando streaming
    const fileStream = createReadStream(zipPath);
    
    fileStream.on('error', (err) => {
      console.error('Error enviando archivo:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: true, msg: 'Error enviando archivo' });
      }
    });

    fileStream.on('end', () => {
      console.log('Archivo enviado exitosamente');
      
      // Limpiar archivos después de enviar
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
          console.log('Archivos temporales eliminados');
        } catch (cleanupError) {
          console.error('Error limpiando archivos temporales:', cleanupError);
        }
      }, 2000); // 2 segundos después de enviar
    });

    fileStream.pipe(res);

  } catch (err) {
    console.error('Error en backup-complete:', err);
    console.error('Error stack:', err.stack);
    
    if (!res.headersSent) {
      // Asegurar que los headers CORS estén presentes en la respuesta de error
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      
      return res.status(500).json({ error: true, msg: 'Error al generar el backup: ' + err.message });
    }
  }
};

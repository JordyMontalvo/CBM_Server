import { MongoClient } from 'mongodb';
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

  console.log("=== BACKUP MONGODUMP FORMAT ENDPOINT ===");
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
    const backupName = `cbm-mongodump-format-${timestamp}`;
    const backupPath = path.join(backupDir, backupName);

    console.log(`Generando backup en formato mongodump: ${backupName}`);
    console.log(`Directorio temporal: ${backupDir}`);

    // Conectar a MongoDB
    const mongoUri = process.env.DB_URL;
    const client = new MongoClient(mongoUri);
    
    await client.connect();
    console.log('Conectado a MongoDB');
    
    const db = client.db('cbm');
    
    // Obtener todas las colecciones (excluyendo tablas de backup)
    const collections = await db.listCollections().toArray();
    const excludedCollections = ['backups', 'backup_chunks', 'backup_zips', 'backup_metadata'];
    const filteredCollections = collections.filter(col => !excludedCollections.includes(col.name));
    console.log(`Colecciones encontradas: ${filteredCollections.length} (excluyendo ${excludedCollections.length} tablas de backup)`);
    
    // Crear estructura de directorios como mongodump
    const dbBackupPath = path.join(backupPath, 'cbm');
    if (!fs.existsSync(dbBackupPath)) {
      fs.mkdirSync(dbBackupPath, { recursive: true });
    }
    
    // Exportar cada colección en formato mongodump
    for (const collectionInfo of filteredCollections) {
      const collectionName = collectionInfo.name;
      console.log(`Exportando colección: ${collectionName}`);
      
      const collection = db.collection(collectionName);
      
      // Obtener conteo de documentos
      const totalDocs = await collection.countDocuments();
      console.log(`📊 Colección ${collectionName}: ${totalDocs} documentos`);
      
      if (totalDocs === 0) {
        console.log(`⚠️ Colección ${collectionName} está vacía, saltando...`);
        continue;
      }
      
      // Saltar colecciones muy grandes para evitar problemas de memoria
      if (totalDocs > 100000) {
        console.log(`⚠️ Saltando colección ${collectionName} (${totalDocs} docs) - demasiado grande para Heroku`);
        continue;
      }
      
      // Crear archivos JSON y metadata como mongodump
      const jsonPath = path.join(dbBackupPath, `${collectionName}.json`);
      const metadataPath = path.join(dbBackupPath, `${collectionName}.metadata.json`);
      
      // Crear archivo JSON
      const writeStream = fs.createWriteStream(jsonPath);
      
      // Escribir documentos en formato BSON simulado
      writeStream.write('[\n');
      
      let documentCount = 0;
      let isFirstDocument = true;
      const BATCH_SIZE = 50; // Lotes pequeños para Heroku
      
      const cursor = collection.find({});
      
      for await (const doc of cursor) {
        // Agregar coma si no es el primer documento
        if (!isFirstDocument) {
          writeStream.write(',\n');
        }
        
        writeStream.write(`  ${JSON.stringify(doc)}`);
        documentCount++;
        isFirstDocument = false;
        
        // Log cada 100 documentos
        if (documentCount % 100 === 0) {
          console.log(`  📝 Procesados ${documentCount}/${totalDocs} documentos de ${collectionName}`);
        }
        
        // Forzar garbage collection cada BATCH_SIZE documentos
        if (documentCount % BATCH_SIZE === 0) {
          if (global.gc) {
            global.gc();
          }
          // Pausa para liberar memoria
          await new Promise(resolve => setTimeout(resolve, 5));
        }
      }
      
      writeStream.write('\n]');
      writeStream.end();
      
      // Esperar a que el stream se cierre completamente
      await new Promise((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });
      
      // Verificar que el archivo se creó correctamente
      const fileStats = fs.statSync(jsonPath);
      console.log(`📁 Archivo ${collectionName}.json creado: ${fileStats.size} bytes`);
      
      // Crear metadata como mongodump (formato compatible)
      const metadata = {
        options: {},
        index: [],
        uuid: null,
        collectionName: collectionName,
        type: "collection"
      };
      
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
      
      console.log(`✅ Colección ${collectionName} exportada: ${documentCount} documentos (${fileStats.size} bytes)`);
    }
    
    await client.close();
    console.log('Conexión a MongoDB cerrada');

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
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Length');

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
    console.error('Error en backup-mongodump-format:', err);
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

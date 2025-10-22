import { MongoClient } from 'mongodb';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { exec } from 'child_process';

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

  console.log("=== BACKUP HEROKU ENDPOINT ===");
  console.log("Request method:", req.method);
  console.log("Request headers:", req.headers);
  
  // Configurar timeout más largo para backup
  req.setTimeout(300000); // 5 minutos
  res.setTimeout(300000); // 5 minutos
  
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
    
    // Exportar cada colección usando streaming para evitar problemas de memoria
    for (const collectionInfo of filteredCollections) {
      const collectionName = collectionInfo.name;
      console.log(`Exportando colección: ${collectionName}`);
      
      const collection = db.collection(collectionName);
      
      // Obtener conteo de documentos para estimar memoria
      const totalDocs = await collection.countDocuments();
      console.log(`Colección ${collectionName}: ${totalDocs} documentos`);
      
      // Saltar colecciones muy grandes para evitar problemas de memoria
      if (totalDocs > 50000) {
        console.log(`⚠️ Saltando colección ${collectionName} (${totalDocs} docs) - demasiado grande para Heroku`);
        continue;
      }
      
      // Crear archivos BSON y metadata
      const bsonPath = path.join(backupDbPath, `${collectionName}.bson`);
      const metadataPath = path.join(backupDbPath, `${collectionName}.metadata.json`);
      
      // Usar cursor para procesar documentos en lotes pequeños
      const cursor = collection.find({});
      const writeStream = fs.createWriteStream(bsonPath);
      
      let documentCount = 0;
      let batch = [];
      const BATCH_SIZE = 50; // Reducir tamaño de batch para Heroku
      
      writeStream.write('[\n');
      
      for await (const doc of cursor) {
        batch.push(doc);
        documentCount++;
        
        if (batch.length >= BATCH_SIZE) {
          // Escribir batch al archivo
          for (let i = 0; i < batch.length; i++) {
            const isLast = (i === batch.length - 1);
            writeStream.write(`  ${JSON.stringify(batch[i])}${isLast ? '' : ','}\n`);
          }
          
          batch = []; // Limpiar batch
          
          // Forzar garbage collection si está disponible
          if (global.gc) {
            global.gc();
          }
          
          // Pequeña pausa para liberar memoria
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
      
      // Escribir batch final
      for (let i = 0; i < batch.length; i++) {
        const isLast = (i === batch.length - 1);
        writeStream.write(`  ${JSON.stringify(batch[i])}${isLast ? '' : ','}\n`);
      }
      
      writeStream.write(']');
      writeStream.end();
      
      // Crear metadata
      const metadata = {
        indexes: collectionInfo.options?.indexes || [],
        uuid: collectionInfo.options?.uuid || null,
        collectionName: collectionName,
        type: "collection"
      };
      fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
      
      console.log(`Colección ${collectionName} exportada: ${documentCount} documentos`);
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
    console.error('Error en backup-heroku:', err);
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

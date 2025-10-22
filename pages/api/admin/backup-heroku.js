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
    
    // Obtener todas las colecciones
    const collections = await db.listCollections().toArray();
    console.log(`Colecciones encontradas: ${collections.length}`);
    
    // Crear directorio para el backup
    const backupDbPath = path.join(backupPath, 'cbm');
    if (!fs.existsSync(backupDbPath)) {
      fs.mkdirSync(backupDbPath, { recursive: true });
    }
    
    // Exportar cada colección
    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name;
      console.log(`Exportando colección: ${collectionName}`);
      
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
      
      console.log(`Colección ${collectionName} exportada: ${documents.length} documentos`);
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
    if (!res.headersSent) {
      return res.status(500).json({ error: true, msg: 'Error al generar el backup: ' + err.message });
    }
  }
};

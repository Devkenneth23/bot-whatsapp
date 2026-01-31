const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

async function initDatabase() {
    console.log('🔧 Inicializando base de datos...');
    
    // Crear directorios necesarios
    const dirs = [
        'database',
        'database/clients',
        'public/uploads',
        'backups'
    ];
    
    dirs.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`✅ Directorio creado: ${dir}`);
        }
    });
    
    // Inicializar BD principal si no existe
    const dbPath = path.join(__dirname, '..', 'database', 'saas.db');
    if (!fs.existsSync(dbPath)) {
        console.log('📦 Creando base de datos principal...');
        const schemaPath = path.join(__dirname, '..', 'schema-saas.sql');
        
        if (fs.existsSync(schemaPath)) {
            try {
                await execPromise(`sqlite3 ${dbPath} < ${schemaPath}`);
                console.log('✅ Base de datos creada exitosamente');
                
                // Crear admin por defecto
                console.log('👤 Creando usuario admin...');
                const createAdminPath = path.join(__dirname, 'create-admin.js');
                if (fs.existsSync(createAdminPath)) {
                    await execPromise(`node ${createAdminPath}`);
                }
            } catch (error) {
                console.error('❌ Error al crear BD:', error.message);
            }
        }
    } else {
        console.log('✅ Base de datos ya existe');
    }
    
    console.log('🎉 Inicialización completada!');
}

initDatabase().catch(console.error);

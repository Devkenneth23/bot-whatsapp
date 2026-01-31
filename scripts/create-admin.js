require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const db = new sqlite3.Database('./database/saas.db');

async function createAdmin() {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'admin123';
    const nombre = 'Administrador Principal';
    
    const hash = await bcrypt.hash(password, 10);
    
    db.run(
        `INSERT INTO admins_saas (username, password_hash, nombre, rol, activo)
         VALUES (?, ?, ?, 'superadmin', 1)`,
        [username, hash, nombre],
        function(err) {
            if (err) {
                console.error('❌ Error:', err.message);
            } else {
                console.log('✅ Admin creado exitosamente');
                console.log('Usuario:', username);
                console.log('Contraseña:', password);
            }
            db.close();
        }
    );
}

createAdmin();

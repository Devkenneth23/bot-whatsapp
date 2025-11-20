const fs = require('fs');
const DatabaseManager = require('./database');
const bcrypt = require('bcryptjs');
require('dotenv').config();

console.log('🚀 Iniciando migración de datos...\n');

const db = new DatabaseManager();

// Esperar a que la BD esté lista
setTimeout(async () => {
    try {
        // MIGRAR SERVICIOS
        console.log('📦 Migrando servicios...');
        
        if (fs.existsSync('./productos.json')) {
            const productos = JSON.parse(fs.readFileSync('./productos.json', 'utf8'));
            
            if (productos.servicios) {
                for (const servicio of productos.servicios) {
                    try {
                        await db.createServicio({
                            nombre: servicio.nombre,
                            precio: servicio.precio,
                            descripcion: servicio.descripcion,
                            imagen: servicio.imagen
                        });
                        console.log(`  ✅ ${servicio.nombre}`);
                    } catch (error) {
                        console.log(`  ⚠️  Ya existe: ${servicio.nombre}`);
                    }
                }
            }
            
            if (productos.preguntas_frecuentes) {
                for (let i = 0; i < productos.preguntas_frecuentes.length; i++) {
                    const faq = productos.preguntas_frecuentes[i];
                    try {
                        await db.run(
                            'INSERT INTO preguntas_frecuentes (pregunta, respuesta, orden) VALUES (?, ?, ?)',
                            [faq.pregunta, faq.respuesta, i + 1]
                        );
                        console.log(`  ✅ FAQ: ${faq.pregunta.substring(0, 30)}...`);
                    } catch (error) {
                        // Ya existe
                    }
                }
            }
        }

        // MIGRAR HORARIOS Y CITAS
        console.log('\n📅 Migrando horarios y citas...');
        
        if (fs.existsSync('./citas.json')) {
            const citasData = JSON.parse(fs.readFileSync('./citas.json', 'utf8'));
            
            if (citasData.horarios_disponibles) {
                for (const [dia, horas] of Object.entries(citasData.horarios_disponibles)) {
                    for (const hora of horas) {
                        try {
                            await db.createHorario(dia, hora);
                            console.log(`  ✅ ${dia} ${hora}`);
                        } catch (error) {
                            // Ya existe
                        }
                    }
                }
            }
            
            if (citasData.citas && citasData.citas.length > 0) {
                for (const cita of citasData.citas) {
                    try {
                        const cliente = await db.getOrCreateCliente(cita.cliente);
                        
                        if (cita.nombre) {
                            await db.run('UPDATE clientes SET nombre = ? WHERE id = ?', [cita.nombre, cliente.id]);
                        }
                        
                        const servicio = await db.get('SELECT id FROM servicios WHERE nombre = ?', [cita.servicio.nombre]);
                        
                        if (servicio) {
                            await db.createCita({
                                cliente_id: cliente.id,
                                servicio_id: servicio.id,
                                fecha: cita.fecha,
                                hora: cita.hora,
                                notas: `Estado: ${cita.estado}`
                            });
                            
                            console.log(`  ✅ Cita: ${cita.nombre} - ${cita.fecha}`);
                        }
                    } catch (error) {
                        console.log(`  ⚠️  Error:`, error.message);
                    }
                }
            }
        }

        // CREAR USUARIO ADMIN
        console.log('\n👤 Creando usuario administrador...');
        
        const adminUsername = process.env.ADMIN_USERNAME || 'admin';
        const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
        const adminEmail = process.env.ADMIN_EMAIL || 'admin@consultorio.com';
        
        try {
            const passwordHash = bcrypt.hashSync(adminPassword, 10);
            
            await db.run(
                'INSERT INTO usuarios_panel (username, password_hash, nombre_completo, email, rol) VALUES (?, ?, ?, ?, ?)',
                [adminUsername, passwordHash, 'Administrador', adminEmail, 'admin']
            );
            
            console.log(`  ✅ Usuario admin creado`);
            console.log(`     Username: ${adminUsername}`);
            console.log(`     Password: ${adminPassword}`);
            console.log(`     ⚠️  CAMBIAR DESPUÉS DEL PRIMER LOGIN`);
        } catch (error) {
            console.log(`  ⚠️  Usuario ya existe`);
        }

        // CONFIGURACIÓN
        console.log('\n⚙️  Configurando sistema...');
        
        const config = [
            { clave: 'negocio_nombre', valor: process.env.NEGOCIO_NOMBRE || 'Consultorio MR & ASOCIADOS' },
            { clave: 'negocio_telefono', valor: process.env.NEGOCIO_TELEFONO || '+50660640392' },
            { clave: 'negocio_email', valor: process.env.NEGOCIO_EMAIL || 'ethelmaricela@gmail.com' },
            { clave: 'negocio_direccion', valor: process.env.NEGOCIO_DIRECCION || 'Barrio Chorotega, Nicoya #123' },
            { clave: 'numero_asesor', valor: process.env.NUMERO_ASESOR || '+50684784921' },
            { clave: 'bot_activo', valor: 'true', tipo: 'boolean' }
        ];
        
        for (const item of config) {
            try {
                await db.run(
                    'INSERT INTO configuracion (clave, valor, tipo) VALUES (?, ?, ?)',
                    [item.clave, item.valor, item.tipo || 'texto']
                );
                console.log(`  ✅ ${item.clave}`);
            } catch (error) {
                // Ya existe
            }
        }

        // RESUMEN
        console.log('\n📊 RESUMEN:');
        console.log('========================');
        
        const servicios = await db.getAllServicios();
        const clientes = await db.getAllClientes(1000);
        const citas = await db.getAllCitas(1000);
        const horarios = await db.getAllHorarios();
        const faqs = await db.getAllFAQs();
        
        console.log(`  📦 Servicios: ${servicios.length}`);
        console.log(`  👥 Clientes: ${clientes.length}`);
        console.log(`  📅 Citas: ${citas.length}`);
        console.log(`  🕐 Horarios: ${horarios.length}`);
        console.log(`  ❓ FAQs: ${faqs.length}`);
        
        console.log('\n✅ ¡Migración completada!');
        console.log('\n📝 Próximos pasos:');
        console.log('  1. npm run server (iniciar API)');
        console.log('  2. Probar: http://localhost:3000/api/health');
        
        db.close();
        process.exit(0);
        
    } catch (error) {
        console.error('\n❌ Error:', error);
        db.close();
        process.exit(1);
    }
}, 1000);
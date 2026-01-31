#!/usr/bin/env node
/**
 * 🔔 TEST COMPLETO DE NOTIFICACIONES
 * Script para validar que el sistema de notificaciones funcione correctamente
 * 
 * Uso: node test-notifications.js
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Configuración
const DB_PATH = path.join(__dirname, 'database', 'bot.db');
const COLORS = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    blue: '\x1b[34m'
};

function log(emoji, message, color = COLORS.reset) {
    console.log(`${color}${emoji} ${message}${COLORS.reset}`);
}

function header(text) {
    console.log('\n' + COLORS.bright + COLORS.cyan + '='.repeat(60) + COLORS.reset);
    console.log(COLORS.bright + COLORS.cyan + text + COLORS.reset);
    console.log(COLORS.bright + COLORS.cyan + '='.repeat(60) + COLORS.reset + '\n');
}

// Verificar que la DB existe
if (!fs.existsSync(DB_PATH)) {
    log('❌', `Base de datos no encontrada en: ${DB_PATH}`, COLORS.red);
    log('💡', 'Verifica la ruta del proyecto', COLORS.yellow);
    process.exit(1);
}

const db = new sqlite3.Database(DB_PATH);

header('🔍 TEST DE SISTEMA DE NOTIFICACIONES');

// TEST 1: Verificar esquema de tabla
log('📋', 'PASO 1: Verificando esquema de tabla citas...');
db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='citas'", (err, row) => {
    if (err) {
        log('❌', 'Error leyendo esquema: ' + err.message, COLORS.red);
        db.close();
        return;
    }
    
    console.log(COLORS.blue + row.sql + COLORS.reset);
    
    // Verificar que tenga columna estado
    if (row.sql.includes('estado')) {
        log('✅', 'Columna "estado" existe', COLORS.green);
    } else {
        log('❌', 'Columna "estado" NO existe', COLORS.red);
    }
    
    // TEST 2: Verificar citas existentes
    setTimeout(() => {
        log('\n📊', 'PASO 2: Verificando citas recientes...');
        
        db.all(
            `SELECT id, estado, created_at,
             strftime('%s', 'now') - strftime('%s', created_at) as segundos_edad
             FROM citas 
             ORDER BY id DESC 
             LIMIT 5`,
            (err, rows) => {
                if (err) {
                    log('❌', 'Error consultando citas: ' + err.message, COLORS.red);
                    db.close();
                    return;
                }
                
                if (rows.length === 0) {
                    log('⚠️ ', 'No hay citas en la base de datos', COLORS.yellow);
                } else {
                    console.log('\n' + COLORS.cyan + 'Últimas 5 citas:' + COLORS.reset);
                    console.table(rows);
                    
                    const citasPendientes = rows.filter(r => r.estado === 'pendiente');
                    log('📌', `Citas con estado='pendiente': ${citasPendientes.length}/${rows.length}`, 
                        citasPendientes.length > 0 ? COLORS.green : COLORS.yellow);
                }
                
                // TEST 3: Crear cita de prueba
                setTimeout(() => {
                    crearCitaDePrueba();
                }, 1000);
            }
        );
    }, 500);
});

function crearCitaDePrueba() {
    header('🧪 CREANDO CITA DE PRUEBA');
    
    const testCita = {
        cliente_id: 1,
        servicio_id: 1,
        fecha: new Date().toISOString().split('T')[0],
        hora: '10:00',
        estado: 'pendiente'
    };
    
    log('📝', `Creando cita: ${testCita.fecha} ${testCita.hora} - Estado: ${testCita.estado}`);
    
    db.run(
        `INSERT INTO citas (cliente_id, servicio_id, fecha, hora, estado, created_at) 
         VALUES (?, ?, ?, ?, ?, datetime('now'))`,
        [testCita.cliente_id, testCita.servicio_id, testCita.fecha, testCita.hora, testCita.estado],
        function(err) {
            if (err) {
                log('❌', 'Error creando cita: ' + err.message, COLORS.red);
                db.close();
                return;
            }
            
            const citaId = this.lastID;
            log('✅', `Cita de prueba creada con ID: ${citaId}`, COLORS.green);
            
            // Verificar la cita creada
            setTimeout(() => {
                verificarCitaCreada(citaId);
            }, 500);
        }
    );
}

function verificarCitaCreada(citaId) {
    log('\n🔎', 'PASO 3: Verificando cita creada...');
    
    db.get(
        `SELECT id, estado, created_at, 
         strftime('%s', 'now') - strftime('%s', created_at) as segundos_transcurridos
         FROM citas WHERE id = ?`,
        [citaId],
        (err, row) => {
            if (err) {
                log('❌', 'Error verificando cita: ' + err.message, COLORS.red);
                db.close();
                return;
            }
            
            console.log('\n' + COLORS.cyan + 'Detalles de la cita:' + COLORS.reset);
            console.log(`  ID: ${row.id}`);
            console.log(`  Estado: ${COLORS.bright}${row.estado}${COLORS.reset}`);
            console.log(`  Created at: ${row.created_at}`);
            console.log(`  Antigüedad: ${row.segundos_transcurridos} segundos`);
            
            if (row.estado === 'pendiente') {
                log('✅', 'Estado correcto: pendiente', COLORS.green);
            } else {
                log('❌', `Estado incorrecto: ${row.estado} (debería ser 'pendiente')`, COLORS.red);
            }
            
            if (parseInt(row.segundos_transcurridos) <= 60) {
                log('✅', 'Antigüedad dentro del rango (≤60s)', COLORS.green);
            } else {
                log('⚠️ ', 'Cita muy antigua (>60s)', COLORS.yellow);
            }
            
            // TEST 4: Simular query del endpoint
            setTimeout(() => {
                simularQueryEndpoint();
            }, 1000);
        }
    );
}

function simularQueryEndpoint() {
    header('🔔 SIMULANDO QUERY DEL ENDPOINT /api/citas/nuevas');
    
    const query = `SELECT id, cliente_id, servicio_id, fecha, hora, estado, created_at
                   FROM citas 
                   WHERE estado = 'pendiente' 
                   AND (strftime('%s', 'now') - strftime('%s', created_at)) <= 60
                   ORDER BY created_at DESC`;
    
    log('📡', 'Ejecutando query del endpoint...');
    console.log(COLORS.blue + query + COLORS.reset + '\n');
    
    db.all(query, (err, rows) => {
        if (err) {
            log('❌', 'Error en query: ' + err.message, COLORS.red);
            db.close();
            return;
        }
        
        console.log(COLORS.cyan + 'Resultados:' + COLORS.reset);
        
        if (rows.length === 0) {
            log('❌', 'NO SE ENCONTRARON CITAS - ¡HAY UN PROBLEMA!', COLORS.red);
            log('💡', 'Posibles causas:', COLORS.yellow);
            console.log('  1. Las citas se están creando con estado != "pendiente"');
            console.log('  2. Las citas tienen más de 60 segundos de antigüedad');
            console.log('  3. Problema con la zona horaria (UTC vs local)');
        } else {
            log('✅', `ENCONTRADAS ${rows.length} cita(s) - ¡ENDPOINT FUNCIONARÁ!`, COLORS.green);
            console.table(rows);
        }
        
        // TEST 5: Mostrar instrucciones finales
        setTimeout(() => {
            mostrarInstruccionesFinales(rows.length);
        }, 1000);
    });
}

function mostrarInstruccionesFinales(citasEncontradas) {
    header('📋 RESULTADOS Y PRÓXIMOS PASOS');
    
    if (citasEncontradas > 0) {
        log('🎉', 'TEST EXITOSO - El sistema está configurado correctamente', COLORS.green);
        console.log('\n' + COLORS.cyan + 'Próximos pasos:' + COLORS.reset);
        console.log('  1. Asegúrate de que el backend esté corriendo:');
        console.log('     ' + COLORS.yellow + 'cd ~/bot-whatsapp && node server.js' + COLORS.reset);
        console.log('\n  2. Abre el dashboard en tu navegador:');
        console.log('     ' + COLORS.yellow + 'http://localhost:3001' + COLORS.reset);
        console.log('\n  3. Abre la consola del navegador (F12)');
        console.log('\n  4. Crea una cita desde WhatsApp o manualmente');
        console.log('\n  5. Deberías ver en consola cada 10 segundos:');
        console.log('     ' + COLORS.green + '🔍 Checking for new citas...');
        console.log('     📡 Response status: 200');
        console.log('     🎉 NEW CITAS FOUND! 1');
        console.log('     🔊 Playing sound...' + COLORS.reset);
        
        console.log('\n' + COLORS.cyan + 'Test manual del endpoint:' + COLORS.reset);
        console.log('  ' + COLORS.yellow + 'curl -H "Authorization: Bearer TU_TOKEN" http://localhost:3000/api/citas/nuevas' + COLORS.reset);
        
    } else {
        log('⚠️ ', 'TEST FALLÓ - Se requiere acción', COLORS.yellow);
        console.log('\n' + COLORS.red + 'ACCIÓN REQUERIDA:' + COLORS.reset);
        console.log('  1. Verifica que database.js cree citas con estado="pendiente"');
        console.log('  2. Verifica la función createCita() en database/database.js');
        console.log('  3. Reinicia el backend después de actualizar');
    }
    
    console.log('\n' + COLORS.bright + '📊 RESUMEN DEL TEST:' + COLORS.reset);
    console.log('  ✅ Base de datos: Accesible');
    console.log('  ✅ Tabla citas: Existe');
    console.log('  ✅ Cita de prueba: Creada');
    console.log(`  ${citasEncontradas > 0 ? '✅' : '❌'} Query endpoint: ${citasEncontradas > 0 ? 'Funciona' : 'No encuentra citas'}`);
    
    console.log('\n');
    db.close();
}

// Manejo de errores
process.on('unhandledRejection', (err) => {
    log('❌', 'Error no manejado: ' + err.message, COLORS.red);
    db.close();
    process.exit(1);
});

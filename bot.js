const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const config = require('./config');
const fs = require('fs');
const DatabaseManager = require('./database/database');

// Inicializar base de datos
const db = new DatabaseManager();

// Registro de usuarios que ya han interactuado
const usuariosActivos = new Set();

// Registro de usuarios en atención humana
const usuariosConAsesor = new Set();

// Timers para reactivación automática del bot
const timersReactivacion = new Map();

// Sistema de agendamiento de citas
const procesosAgendamiento = new Map();

// Sistema de navegación (para saber si está viendo catálogo)
const usuariosEnCatalogo = new Set();

// Crear cliente
const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './sesion' }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ]
    }
});

// Generar QR
client.on('qr', qr => {
    console.log('📱 ESCANEA ESTE CÓDIGO QR CON WHATSAPP:');
    qrcode.generate(qr, { small: true });
});

// Bot listo
client.on('ready', async () => {
    console.log('✅ Bot conectado correctamente!');
    console.log(`📞 Negocio: ${config.nombreNegocio}`);
    
    if (fs.existsSync('./imagenes/logo.png')) {
        console.log('📸 Logo encontrado: imagenes/logo.png');
    } else {
        console.log('⚠️ Logo no encontrado en: imagenes/logo.png');
    }
    
    console.log('✅ Base de datos conectada');
});

// Manejo de errores de autenticación
client.on('auth_failure', msg => {
    console.error('❌ Error de autenticación:', msg);
});

client.on('disconnected', (reason) => {
    console.log('⚠️ Bot desconectado:', reason);
});

// Mapa de opciones dinámicas
function obtenerMapaOpciones() {
    const mapa = {};
    let contador = 1;
    
    if (config.opciones.verServicios) mapa[contador++] = 'servicios';
    if (config.opciones.precios) mapa[contador++] = 'precios';
    if (config.opciones.agendar) mapa[contador++] = 'agendar';
    if (config.opciones.ubicacion) mapa[contador++] = 'ubicacion';
    if (config.opciones.horarios) mapa[contador++] = 'horarios';
    if (config.opciones.faq) mapa[contador++] = 'faq';
    mapa[contador] = 'asesor';
    
    return mapa;
}

// Detectar si es un saludo o primer contacto
function esSaludoOPrimerMensaje(texto) {
    const saludos = [
        'hola', 'buenas', 'buenos dias', 'buen dia', 'buenas tardes', 
        'buenas noches', 'que tal', 'qué tal', 'ey', 'hey', 'holi',
        'saludos', 'buen día', 'hello', 'hi', 'ola', 'como estas',
        'cómo estas', 'como está', 'cómo está', 'info', 'informacion',
        'información', 'ayuda', 'necesito ayuda'
    ];
    
    return saludos.some(saludo => texto.includes(saludo));
}

// FUNCIONES DE AGENDAMIENTO
function iniciarAgendamiento(userId) {
    procesosAgendamiento.set(userId, {
        paso: 'nombre',
        nombre: null,
        servicio: null,
        fecha: null,
        hora: null
    });
}

// Función para activar modo asesor con timer de reactivación
function activarModoAsesor(userId) {
    usuariosConAsesor.add(userId);
    
    if (timersReactivacion.has(userId)) {
        clearTimeout(timersReactivacion.get(userId));
    }
    
    const timer = setTimeout(() => {
        if (usuariosConAsesor.has(userId)) {
            usuariosConAsesor.delete(userId);
            timersReactivacion.delete(userId);
            console.log(`⏰ Bot reactivado automáticamente para: ${userId}`);
        }
    }, 60000); // 1 minuto
    
    timersReactivacion.set(userId, timer);
    console.log(`👤 Usuario ${userId} en modo asesor - se reactivará en 1 minuto`);
}

async function obtenerDiasSemana() {
    const dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
    const hoy = new Date();
    const diasDisponibles = [];
    
    for (let i = 1; i <= 7; i++) {
        const fecha = new Date(hoy);
        fecha.setDate(hoy.getDate() + i);
        const nombreDia = dias[fecha.getDay()];
        
        // Verificar si hay horarios para ese día (desde BD)
        const horarios = await db.getHorariosByDia(nombreDia);
        
        if (horarios && horarios.length > 0) {
            diasDisponibles.push({
                numero: i,
                nombre: nombreDia.charAt(0).toUpperCase() + nombreDia.slice(1),
                fecha: fecha.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' })
            });
        }
    }
    
    return diasDisponibles;
}

async function obtenerHorariosDisponibles(nombreDia, fecha) {
    // Obtener horarios del día desde BD
    const horarios = await db.getHorariosByDia(nombreDia.toLowerCase());
    
    // Obtener citas de esa fecha
    const citasFecha = await db.getCitasByFecha(fecha);
    const horariosOcupados = citasFecha.map(cita => cita.hora);
    
    // Filtrar horarios disponibles
    return horarios
        .map(h => h.hora)
        .filter(hora => !horariosOcupados.includes(hora));
}

async function guardarCita(userId, datosCita) {
    // Obtener o crear cliente
    const cliente = await db.getOrCreateCliente(userId);
    
    // Actualizar nombre del cliente
    if (datosCita.nombre && cliente.nombre !== datosCita.nombre) {
        await db.updateCliente(cliente.id, { 
            nombre: datosCita.nombre,
            email: cliente.email 
        });
    }
    
    // Guardar cita en BD
    const citaId = await db.createCita({
        cliente_id: cliente.id,
        servicio_id: datosCita.servicio.id,
        fecha: datosCita.fecha,
        hora: datosCita.hora,
        notas: 'Cita agendada por WhatsApp'
    });
    
    // Obtener cita completa
    const cita = await db.getCitaById(citaId);
    
    return cita;
}

// Responder mensajes
client.on('message', async msg => {
    try {
        if (msg.fromMe) {
            return;
        }
        
        const texto = msg.body.toLowerCase().trim();
        const userId = msg.from;
        const mapaOpciones = obtenerMapaOpciones();
        
        // Registrar conversación en BD
        try {
            const cliente = await db.getOrCreateCliente(userId);
            await db.registrarConversacion(cliente.id, msg.body, 'entrante');
            await db.incrementarMensajesCliente(cliente.id);
        } catch (error) {
            console.error('Error registrando conversación:', error);
        }
        
        // PROCESO DE AGENDAMIENTO ACTIVO
        if (procesosAgendamiento.has(userId)) {
            const proceso = procesosAgendamiento.get(userId);
            
            // Cancelar agendamiento
            if (texto === 'cancelar') {
                procesosAgendamiento.delete(userId);
                await msg.reply('❌ Agendamiento cancelado.\n\nEscribe MENU para volver.');
                return;
            }
            
            // PASO 1: Solicitar nombre
            if (proceso.paso === 'nombre') {
                proceso.nombre = msg.body.trim();
                proceso.paso = 'servicio';
                procesosAgendamiento.set(userId, proceso);
                
                // Obtener servicios desde BD
                const servicios = await db.getAllServicios();
                
                let serviciosMsg = `✅ Perfecto ${proceso.nombre}!\n\n`;
                serviciosMsg += `📋 *SELECCIONA UN SERVICIO:*\n\n`;
                
                servicios.forEach((serv, index) => {
                    serviciosMsg += `${index + 1}. ${serv.nombre} - ${serv.precio}\n`;
                });
                
                serviciosMsg += `\n_Escribe el número del servicio_`;
                serviciosMsg += `\n_O escribe CANCELAR para salir_`;
                
                await msg.reply(serviciosMsg);
                return;
            }
            
            // PASO 2: Seleccionar servicio
            if (proceso.paso === 'servicio') {
                const numeroServicio = parseInt(texto);
                
                // ✅ CARGAR SERVICIOS DINÁMICAMENTE DESDE LA BD
                const servicios = await db.getAllServicios();
                
                console.log(`📦 Total de servicios disponibles: ${servicios.length}`);
                console.log(`🔢 Usuario seleccionó: ${numeroServicio}`);
                
                if (numeroServicio >= 1 && numeroServicio <= servicios.length) {
                    const servicioSeleccionado = servicios[numeroServicio - 1];
                    
                    console.log(`✅ Servicio seleccionado: ${servicioSeleccionado.nombre}`);
                    
                    // Guardar toda la info del servicio
                    proceso.servicio = {
                        id: servicioSeleccionado.id,
                        nombre: servicioSeleccionado.nombre,
                        precio: servicioSeleccionado.precio,
                        descripcion: servicioSeleccionado.descripcion
                    };
                    
                    proceso.paso = 'fecha';
                    procesosAgendamiento.set(userId, proceso);
                    
                    const diasDisponibles = await obtenerDiasSemana();
                    let fechaMsg = `✅ Servicio: *${proceso.servicio.nombre}*\n\n`;
                    fechaMsg += `📅 *SELECCIONA UNA FECHA:*\n\n`;
                    
                    diasDisponibles.forEach(dia => {
                        fechaMsg += `${dia.numero}. ${dia.nombre} - ${dia.fecha}\n`;
                    });
                    
                    fechaMsg += `\n_Escribe el número del día_`;
                    fechaMsg += `\n_O escribe CANCELAR para salir_`;
                    
                    await msg.reply(fechaMsg);
                } else {
                    await msg.reply('❌ Número inválido. Por favor selecciona un servicio válido.');
                }
                return;
            }
            
            // PASO 3: Seleccionar fecha
            if (proceso.paso === 'fecha') {
                const numeroDia = parseInt(texto);
                const diasDisponibles = await obtenerDiasSemana();
                const diaSeleccionado = diasDisponibles.find(d => d.numero === numeroDia);
                
                if (diaSeleccionado) {
                    proceso.fecha = diaSeleccionado.fecha;
                    proceso.nombreDia = diaSeleccionado.nombre;
                    proceso.paso = 'hora';
                    procesosAgendamiento.set(userId, proceso);
                    
                    const horariosDisponibles = await obtenerHorariosDisponibles(
                        diaSeleccionado.nombre, 
                        diaSeleccionado.fecha
                    );
                    
                    if (horariosDisponibles.length === 0) {
                        await msg.reply(
                            `❌ Lo siento, no hay horarios disponibles para ese día.\n\n` +
                            `Escribe AGENDAR para intentar con otra fecha.`
                        );
                        procesosAgendamiento.delete(userId);
                        return;
                    }
                    
                    let horaMsg = `✅ Fecha: *${diaSeleccionado.nombre} ${diaSeleccionado.fecha}*\n\n`;
                    horaMsg += `🕐 *HORARIOS DISPONIBLES:*\n\n`;
                    
                    horariosDisponibles.forEach((hora, index) => {
                        horaMsg += `${index + 1}. ${hora}\n`;
                    });
                    
                    horaMsg += `\n_Escribe el número del horario_`;
                    horaMsg += `\n_O escribe CANCELAR para salir_`;
                    
                    await msg.reply(horaMsg);
                } else {
                    await msg.reply('❌ Fecha inválida. Por favor selecciona una fecha válida.');
                }
                return;
            }
            
            // PASO 4: Confirmar hora
            if (proceso.paso === 'hora') {
                const numeroHora = parseInt(texto);
                const horariosDisponibles = await obtenerHorariosDisponibles(
                    proceso.nombreDia, 
                    proceso.fecha
                );
                
                if (numeroHora >= 1 && numeroHora <= horariosDisponibles.length) {
                    proceso.hora = horariosDisponibles[numeroHora - 1];
                    
                    // Guardar cita en BD
                    const cita = await guardarCita(userId, proceso);
                    
                    // Confirmar cita al cliente
                    await msg.reply(
                        `✅ *CITA AGENDADA EXITOSAMENTE*\n\n` +
                        `📋 *Detalles de tu cita:*\n\n` +
                        `👤 Nombre: ${proceso.nombre}\n` +
                        `💼 Servicio: ${proceso.servicio.nombre}\n` +
                        `💰 Precio: ${proceso.servicio.precio}\n` +
                        `📅 Fecha: ${proceso.nombreDia} ${proceso.fecha}\n` +
                        `🕐 Hora: ${proceso.hora}\n\n` +
                        `📍 Dirección: ${config.direccion}\n\n` +
                        `_Confirmación #${cita.id}_\n\n` +
                        `Escribe MENU para volver al inicio.`
                    );
                    
                    // Notificar al asesor
                    try {
                        const numeroAsesor = config.numeroAsesor.replace(/\+/g, '') + '@c.us';
                        await client.sendMessage(numeroAsesor,
                            `🔔 *NUEVA CITA AGENDADA*\n\n` +
                            `📋 *Detalles:*\n\n` +
                            `👤 Cliente: ${proceso.nombre}\n` +
                            `📱 WhatsApp: ${userId.replace('@c.us', '').replace('@lid', '')}\n` +
                            `💼 Servicio: ${proceso.servicio.nombre}\n` +
                            `💰 Precio: ${proceso.servicio.precio}\n` +
                            `📅 Fecha: ${proceso.nombreDia} ${proceso.fecha}\n` +
                            `🕐 Hora: ${proceso.hora}\n\n` +
                            `_Confirmación #${cita.id}_`
                        );
                        console.log(`📩 Notificación enviada al asesor`);
                    } catch (error) {
                        console.error('⚠️ Error al notificar al asesor:', error.message);
                    }
                    
                    console.log(`📅 Nueva cita agendada: ${proceso.nombre} - ${proceso.fecha} ${proceso.hora}`);
                    
                    // Limpiar proceso
                    procesosAgendamiento.delete(userId);
                } else {
                    await msg.reply('❌ Horario inválido. Por favor selecciona un horario válido.');
                }
                return;
            }
        }
        
        // VERIFICAR SI ESTÁ EN ATENCIÓN HUMANA
        if (usuariosConAsesor.has(userId)) {
            console.log(`🔇 Usuario ${userId} en atención humana - bot silenciado`);
            return;
        }
        
        // ✅ PRIORIDAD 1: Si está en catálogo y envía número, mostrar detalle
        const numero = parseInt(texto);
        if (usuariosEnCatalogo.has(userId) && !isNaN(numero) && numero > 0) {
            console.log(`🔢 Usuario en catálogo seleccionó: ${numero}`);
            
            const servicios = await db.getAllServicios();
            console.log(`📦 Total servicios disponibles: ${servicios.length}`);
            
            if (numero <= servicios.length) {
                console.log(`✅ Mostrando servicio #${numero}: ${servicios[numero-1].nombre}`);
                await enviarDetalleServicio(msg, numero);
                usuariosEnCatalogo.delete(userId); // Salir del modo catálogo
                return;
            } else {
                await msg.reply(`❌ Ese servicio no existe. Tenemos ${servicios.length} servicios disponibles.\n\nEscribe *MENU* para volver.`);
                usuariosEnCatalogo.delete(userId);
                return;
            }
        }
        
        // DETECCIÓN INTELIGENTE DE PRIMER MENSAJE
        // NO procesar números como primer mensaje
        const esNumero = !isNaN(numero) && texto.trim() === numero.toString();

        if (!esNumero && (!usuariosActivos.has(userId) || esSaludoOPrimerMensaje(texto))) {
            usuariosActivos.add(userId);
            usuariosEnCatalogo.delete(userId); // Limpiar estado si vuelve a saludar
            const menuTexto = await generarMenu(msg);
            if (menuTexto) {
                await msg.reply(menuTexto);
            }
            console.log(`👤 Nuevo usuario o saludo detectado: ${userId}`);
            return;
        }
        
        // MENÚ EXPLÍCITO
        if (texto === 'menu' || texto === 'menú' || texto === 'inicio') {
            usuariosEnCatalogo.delete(userId); // Limpiar estado al volver al menú
            const menuTexto = await generarMenu(msg);
            if (menuTexto) {
                await msg.reply(menuTexto);
            }
        }
        
        // VOLVER A VER SERVICIOS
        else if (texto === 'Volver' || texto === 'volver') {
            usuariosEnCatalogo.add(userId);
            const catalogoMsg = await enviarCatalogo(msg);
            await msg.reply(catalogoMsg);
            console.log(`📋 Usuario ${userId} regresó al catálogo`);
        }
        
        // OPCIONES NUMÉRICAS DINÁMICAS
        else if (mapaOpciones[texto]) {
            const accion = mapaOpciones[texto];
            
            switch(accion) {
                case 'servicios':
                    usuariosEnCatalogo.add(userId); // Marcar que está viendo catálogo
                    const catalogoMsg = await enviarCatalogo(msg);
                    await msg.reply(catalogoMsg);
                    console.log(`📋 Usuario ${userId} ahora está en modo catálogo`);
                    break;
                    
                case 'precios':
                    await msg.reply(await generarPrecios());
                    break;
                    
                case 'agendar':
                    iniciarAgendamiento(userId);
                    await msg.reply(
                        `📅 *AGENDAR CITA*\n\n` +
                        `Perfecto! Te voy a ayudar a agendar tu cita.\n\n` +
                        `Por favor escribe tu *nombre completo*:\n\n` +
                        `_O escribe CANCELAR para salir_`
                    );
                    break;
                    
                case 'ubicacion':
                    await msg.reply(
                        `📍 *NUESTRA UBICACIÓN*\n\n` +
                        `${config.direccion}\n\n` +
                        `Ver en mapa: ${config.linkMapa}\n\n` +
                        `Escribe MENU para volver`
                    );
                    break;
                    
                case 'horarios':
                    await msg.reply(
                        `🕐 *HORARIOS DE ATENCIÓN*\n\n` +
                        `Lunes a Viernes: ${config.horarios.lunesViernes}\n` +
                        `Sábados: ${config.horarios.sabado}\n` +
                        `Domingos: ${config.horarios.domingo}\n\n` +
                        `Escribe MENU para volver`
                    );
                    break;
                    
                case 'faq':
                    await msg.reply(await generarFAQ());
                    break;
                    
                case 'asesor':
                    activarModoAsesor(userId);
                    await msg.reply(
                        `👤 *TRANSFERIDO A ASESOR HUMANO*\n\n` +
                        `Un asesor te atenderá en breve.\n` +
                        `También puedes escribir directo a:\n` +
                        `📱 ${config.numeroAsesor}`
                    );
                    break;
            }
        }
        
        // PALABRA CLAVE: AGENDAR
        else if (texto.includes('agendar') || texto.includes('cita') || texto.includes('agendar cita')) {
            iniciarAgendamiento(userId);
            await msg.reply(
                `📅 *AGENDAR CITA*\n\n` +
                `Perfecto! Te voy a ayudar a agendar tu cita.\n\n` +
                `Por favor escribe tu *nombre completo*:\n\n` +
                `_O escribe CANCELAR para salir_`
            );
        }
        
        // HABLAR CON HUMANO (palabras clave)
        else if (texto.includes('asesor') || texto.includes('humano') || texto.includes('persona')) {
            activarModoAsesor(userId);
            await msg.reply(
                `👤 *TRANSFERIDO A ASESOR HUMANO*\n\n` +
                `Un asesor te atenderá en breve.\n` +
                `También puedes escribir directo a:\n` +
                `📱 ${config.numeroAsesor}`
            );
        }
        
        // NO ENTENDIÓ
        else {
            await msg.reply(
                `🤔 No entendí tu mensaje.\n\n` +
                `Escribe *MENU* para ver las opciones disponibles.`
            );
        }
        
    } catch (error) {
        console.error('❌ Error al procesar mensaje:', error);
        await msg.reply('Ocurrió un error. Por favor intenta de nuevo o escribe ASESOR para hablar con una persona.');
    }
});

// FUNCIONES AUXILIARES
async function generarMenu(msg = null) {
    let menu = `👋 ${config.mensajeBienvenida.replace('{negocio}', config.nombreNegocio)}\n\n`;
    menu += `*MENÚ PRINCIPAL:*\n\n`;
    
    let opcion = 1;
    if (config.opciones.verServicios) menu += `${opcion++}. Ver Servicios\n`;
    if (config.opciones.precios) menu += `${opcion++}. Ver Precios\n`;
    if (config.opciones.agendar) menu += `${opcion++}. Agendar Cita\n`;
    if (config.opciones.ubicacion) menu += `${opcion++}. Ubicación\n`;
    if (config.opciones.horarios) menu += `${opcion++}. Horarios\n`;
    if (config.opciones.faq) menu += `${opcion++}. Preguntas Frecuentes\n`;
    menu += `${opcion}. Hablar con Asesor\n\n`;
    menu += `_Escribe el número de tu opción_`;
    
    // Enviar logo CON el texto del menú en el mismo mensaje
    if (msg && fs.existsSync('./imagenes/logo.png')) {
        try {
            const media = MessageMedia.fromFilePath('./imagenes/logo.png');
            await msg.reply(media, null, { caption: menu });
            console.log('📸 Menú enviado con logo');
            return null; // Ya se envió, no devolver texto
        } catch (error) {
            console.error('⚠️ Error al enviar logo:', error.message);
            return menu; // Si falla, devolver texto solo
        }
    }
    
    return menu;
}

// FUNCIÓN PARA ENVIAR CATÁLOGO SIMPLE (SOLO NOMBRES)
async function enviarCatalogo(msg) {
    const servicios = await db.getAllServicios();
    
    console.log(`📦 Generando catálogo con ${servicios.length} servicios`);
    
    let catalogo = `📋 *NUESTROS SERVICIOS*\n\n`;
    
    servicios.forEach((servicio, index) => {
        catalogo += `${index + 1}. ${servicio.nombre}\n`;
    });
    
    catalogo += `\n💡 *Escribe el número para ver detalles*\n`;
    catalogo += `\nEscribe *MENU* para volver`;
    
    return catalogo;
}

// FUNCIÓN PARA ENVIAR DETALLE DE UN SERVICIO CON IMAGEN
async function enviarDetalleServicio(msg, numeroServicio) {
    const servicios = await db.getAllServicios();
    
    if (numeroServicio < 1 || numeroServicio > servicios.length) {
        await msg.reply('❌ Número de servicio inválido. Escribe *MENU* para volver.');
        return;
    }
    
    const servicio = servicios[numeroServicio - 1];
    
    let mensaje = `*${servicio.nombre}*\n\n`;
    mensaje += `💰 Precio: ${servicio.precio}\n`;
    mensaje += `📄 ${servicio.descripcion}\n\n`;
    mensaje += `Escribe *Volver* para ver más servicios\n\n`;
    mensaje += `Escribe *MENU* para volver al inicio`;
    
    // Si tiene imagen, enviarla
    if (servicio.imagen) {
        try {
            if (servicio.imagen.startsWith('/uploads/')) {
                const imagePath = `./public${servicio.imagen}`;
                
                if (fs.existsSync(imagePath)) {
                    const media = MessageMedia.fromFilePath(imagePath);
                    await msg.reply(media, null, { caption: mensaje });
                    console.log(`📸 Detalle con imagen: ${servicio.nombre}`);
                    return;
                }
            }
        } catch (error) {
            console.error(`❌ Error con imagen:`, error.message);
        }
    }
    
    // Sin imagen o error, solo texto
    await msg.reply(mensaje);
    console.log(`📄 Detalle sin imagen: ${servicio.nombre}`);
}

async function generarPrecios() {
    const servicios = await db.getAllServicios();
    
    let precios = `💰 *LISTA DE PRECIOS*\n\n`;
    
    servicios.forEach(s => {
        precios += `• ${s.nombre}: ${s.precio}\n`;
    });
    
    precios += `\n_Escribe MENU para volver_`;
    return precios;
}

async function generarFAQ() {
    const faqs = await db.getAllFAQs();
    
    let faq = `❓ *PREGUNTAS FRECUENTES*\n\n`;
    
    faqs.forEach((item, index) => {
        faq += `*${index + 1}. ${item.pregunta}*\n`;
        faq += `${item.respuesta}\n\n`;
    });
    
    faq += `_Escribe MENU para volver_`;
    return faq;
}

// Manejo de cierre
process.on('SIGINT', async () => {
    console.log('\n⚠️ Cerrando bot...');
    
    timersReactivacion.forEach(timer => clearTimeout(timer));
    timersReactivacion.clear();
    
    db.close();
    await client.destroy();
    process.exit(0);
});

// Iniciar bot
console.log('🚀 Iniciando bot de WhatsApp...');
client.initialize();
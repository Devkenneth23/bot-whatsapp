// bot-controller.js - Controlador completo del bot para el API
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

class BotController extends EventEmitter {
    constructor(config, db) {
        super();
        this.config = config;
        this.db = db;
        this.client = null;
        this.isRunning = false;
        this.qrCode = null;
        this.status = 'stopped';
        
        // Sets para gestión de usuarios
        this.usuariosActivos = new Set();
        this.usuariosConAsesor = new Set();
        this.timersReactivacion = new Map();
        this.procesosAgendamiento = new Map();
        this.procesosContactoAsesor = new Map();
        this.usuariosEnCatalogo = new Set();
        
        // NUEVO: Procesos de cancelación y reagendamiento
        this.procesosCancelacion = new Map();
        this.procesosReagendamiento = new Map();

        
    }

    loadConfig() {
        // Limpiar cache para recargar config
        delete require.cache[require.resolve(this.configPath)];
        return require(this.configPath);
    }

    reloadConfig() {
        this.config = this.loadConfig();
        console.log('🔄 Configuración recargada');
    }

    async start() {
        if (this.isRunning) {
            throw new Error('El bot ya está en ejecución');
        }

        console.log('🚀 Iniciando bot...');
        this.status = 'starting';
        this.emit('statusChange', this.status);

        try {
            // Si ya existe un cliente, destruirlo primero
            if (this.client) {
                console.log('⚠️ Limpiando cliente anterior...');
                try {
                    await this.client.destroy();
                } catch (err) {
                    console.log('⚠️ Error al limpiar cliente anterior (ignorado):', err.message);
                }
                this.client = null;
            }

            this.client = new Client({
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

            this.setupEventHandlers();
            
            await this.client.initialize();
            this.isRunning = true;
            console.log('✅ Bot iniciado correctamente');
        } catch (error) {
            console.error('❌ Error al iniciar bot:', error.message);
            this.status = 'error';
            this.isRunning = false;
            this.emit('statusChange', this.status);
            
            // Si el error es por sesión duplicada, sugerir limpiar
            if (error.message.includes('already exists')) {
                throw new Error('Sesión duplicada detectada. Usa "Limpiar Sesión" desde el dashboard y vuelve a intentar.');
            }
            
            throw error;
        }
    }

    async stop() {
        if (!this.isRunning && !this.client) {
            throw new Error('El bot no está en ejecución');
        }

        console.log('⏹️ Deteniendo bot...');
        this.status = 'stopping';
        this.emit('statusChange', this.status);

        try {
            // Limpiar timers
            this.timersReactivacion.forEach(timer => clearTimeout(timer));
            this.timersReactivacion.clear();

            // Destruir cliente de WhatsApp
            if (this.client) {
                await this.client.destroy();
                this.client = null;
            }

            this.isRunning = false;
            this.qrCode = null;
            this.status = 'stopped';
            this.emit('statusChange', this.status);
            console.log('✅ Bot detenido correctamente');
        } catch (error) {
            console.error('⚠️ Error al detener bot:', error.message);
            // Forzar limpieza aunque haya error
            this.client = null;
            this.isRunning = false;
            this.qrCode = null;
            this.status = 'stopped';
            this.emit('statusChange', this.status);
        }
    }

    async restart() {
        await this.stop();
        await new Promise(resolve => setTimeout(resolve, 2000));
        await this.start();
    }

    setupEventHandlers() {
        // QR Code
        this.client.on('qr', async (qr) => {
            console.log('📱 QR generado');
            try {
                this.qrCode = await qrcode.toDataURL(qr);
                this.status = 'qr_ready';
                this.emit('qr', this.qrCode);
                this.emit('statusChange', this.status);
            } catch (error) {
                console.error('Error generando QR:', error);
            }
        });

        // Bot listo
        this.client.on('ready', () => {
            console.log('✅ Bot conectado!');
            this.qrCode = null;
            this.status = 'connected';
            this.emit('ready');
            this.emit('statusChange', this.status);
        });

        // Error de autenticación
        this.client.on('auth_failure', (msg) => {
            console.error('❌ Error de autenticación:', msg);
            this.status = 'auth_failed';
            this.emit('authFailure', msg);
            this.emit('statusChange', this.status);
        });

        // Desconectado
        this.client.on('disconnected', (reason) => {
            console.log('⚠️ Bot desconectado:', reason);
            this.status = 'disconnected';
            this.isRunning = false;
            this.emit('disconnected', reason);
            this.emit('statusChange', this.status);
        });

        // Manejo de mensajes
        this.client.on('message', (msg) => this.handleMessage(msg));
    }

    // ========== FUNCIONES AUXILIARES ==========
    
    obtenerMapaOpciones() {
        const mapa = {};
        let contador = 1;
        
        if (this.config.opciones.verServicios) mapa[contador++] = 'servicios';
        if (this.config.opciones.precios) mapa[contador++] = 'precios';
        if (this.config.opciones.agendar) mapa[contador++] = 'agendar';
        if (this.config.opciones.ubicacion) mapa[contador++] = 'ubicacion';
        if (this.config.opciones.horarios) mapa[contador++] = 'horarios';
        if (this.config.opciones.faq) mapa[contador++] = 'faq';
        mapa[contador] = 'asesor';
        
        return mapa;
    }

    esSaludoOPrimerMensaje(texto) {
        const saludos = [
            'hola', 'buenas', 'buenos dias', 'buen dia', 'buenas tardes', 
            'buenas noches', 'que tal', 'qué tal', 'ey', 'hey', 'holi',
            'saludos', 'buen día', 'hello', 'hi', 'ola', 'como estas',
            'cómo estas', 'como está', 'cómo está', 'info', 'informacion',
            'información', 'ayuda', 'necesito ayuda'
        ];
        
        return saludos.some(saludo => texto.includes(saludo));
    }

    iniciarAgendamiento(userId) {
        this.procesosAgendamiento.set(userId, {
            paso: 'nombre',
            nombre: null,
            telefono: null,  // NUEVO
            servicio: null,
            fecha: null,
            hora: null
        });
    }

    activarModoAsesor(userId) {
        this.usuariosConAsesor.add(userId);
        
        if (this.timersReactivacion.has(userId)) {
            clearTimeout(this.timersReactivacion.get(userId));
        }
        
        const timer = setTimeout(() => {
            if (this.usuariosConAsesor.has(userId)) {
                this.usuariosConAsesor.delete(userId);
                this.timersReactivacion.delete(userId);
                console.log(`⏰ Bot reactivado automáticamente para: ${userId}`);
            }
        }, 60000);
        
        this.timersReactivacion.set(userId, timer);
        console.log(`👤 Usuario ${userId} en modo asesor`);
    }

    async obtenerDiasSemana() {
        const dias = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
        const hoy = new Date();
        const diasDisponibles = [];
        
        for (let i = 1; i <= 7; i++) {
            const fecha = new Date(hoy);
            fecha.setDate(hoy.getDate() + i);
            const nombreDia = dias[fecha.getDay()];
            
            try {
                const horarios = await this.db.getHorariosByDia(nombreDia);
                
                if (horarios && horarios.length > 0) {
                    diasDisponibles.push({
                        numero: i,
                        nombre: nombreDia.charAt(0).toUpperCase() + nombreDia.slice(1),
                        fecha: fecha.toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                    });
                }
            } catch (error) {
                console.error(`Error obteniendo horarios para ${nombreDia}:`, error);
            }
        }
        
        return diasDisponibles;
    }

    async obtenerHorariosDisponibles(nombreDia, fecha) {
        // Usar la nueva función optimizada que filtra horarios ocupados
        return await this.db.getHorariosDisponiblesPorFecha(fecha, nombreDia);
    }

    async guardarCita(userId, datosCita) {
        const cliente = await this.db.getOrCreateCliente(userId);
        
        // Validar que el horario sigue disponible antes de guardar
        const horarioDisponible = await this.db.isHorarioDisponible(datosCita.fecha, datosCita.hora);
        
        if (!horarioDisponible) {
            throw new Error('Este horario ya fue reservado por otro cliente. Por favor selecciona otro horario.');
        }
        
        if (datosCita.nombre && cliente.nombre !== datosCita.nombre) {
            await this.db.updateCliente(cliente.id, { 
                nombre: datosCita.nombre,
                email: cliente.email 
            });
        }
        
        const citaId = await this.db.createCita({
            cliente_id: cliente.id,
            servicio_id: datosCita.servicio.id,
            fecha: datosCita.fecha,
            hora: datosCita.hora,
            notas: 'Cita agendada por WhatsApp'
        });
        
        const cita = await this.db.getCitaById(citaId);
        return cita;
    }

    async generarMenu(msg = null) {
        let menu = `👋 ${this.config.mensajeBienvenida.replace('{negocio}', this.config.nombreNegocio)}\n\n`;
        menu += `*MENÚ PRINCIPAL:*\n\n`;
        
        let opcion = 1;
        if (this.config.opciones.verServicios) menu += `${opcion++}. Ver Servicios\n`;
        if (this.config.opciones.precios) menu += `${opcion++}. Ver Precios\n`;
        if (this.config.opciones.agendar) menu += `${opcion++}. Agendar Cita\n`;
        if (this.config.opciones.ubicacion) menu += `${opcion++}. Ubicación\n`;
        if (this.config.opciones.horarios) menu += `${opcion++}. Horarios\n`;
        if (this.config.opciones.faq) menu += `${opcion++}. Preguntas Frecuentes\n`;
        menu += `${opcion}. Hablar con Asesor\n\n`;
        menu += `_Escribe el número de tu opción_`;
        
        // Intentar enviar logo si está configurado
        if (msg) {
            try {
                // Obtener logo de la configuración
                const config = await this.db.get('SELECT logo_path FROM configuracion WHERE id = 1');
                
                if (config?.logo_path) {
                    const logoPath = path.join(__dirname, config.logo_path);
                    
                    if (fs.existsSync(logoPath)) {
                        const media = MessageMedia.fromFilePath(logoPath);
                        await msg.reply(media, null, { caption: menu });
                        console.log('📸 Menú enviado con logo desde:', config.logo_path);
                        return null;
                    }
                }
            } catch (error) {
                console.error('⚠️ Error al enviar logo:', error.message);
            }
        }
        
        return menu;
    }

    async enviarCatalogo() {
        const servicios = await this.db.getAllServicios();
        
        let catalogo = `📋 *NUESTROS SERVICIOS*\n\n`;
        
        servicios.forEach((servicio, index) => {
            catalogo += `${index + 1}. ${servicio.nombre}\n`;
        });
        
        catalogo += `\n💡 *Escribe el número para ver detalles*\n`;
        catalogo += `\nEscribe *MENU* para volver`;
        
        return catalogo;
    }

    async enviarDetalleServicio(msg, numeroServicio) {
        const servicios = await this.db.getAllServicios();
        
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
        
        await msg.reply(mensaje);
        console.log(`📄 Detalle sin imagen: ${servicio.nombre}`);
    }

    async generarPrecios() {
        const servicios = await this.db.getAllServicios();
        
        let precios = `💰 *LISTA DE PRECIOS*\n\n`;
        
        servicios.forEach(s => {
            precios += `• ${s.nombre}: ${s.precio}\n`;
        });
        
        precios += `\n_Escribe MENU para volver_`;
        return precios;
    }

    async generarFAQ() {
        const faqs = await this.db.getAllFAQs();
        
        let faq = `❓ *PREGUNTAS FRECUENTES*\n\n`;
        
        faqs.forEach((item, index) => {
            faq += `*${index + 1}. ${item.pregunta}*\n`;
            faq += `${item.respuesta}\n\n`;
        });
        
        faq += `_Escribe MENU para volver_`;
        return faq;
    }

    // ========== MANEJO DE MENSAJES ==========
    
    async handleMessage(msg) {
        try {
            if (msg.fromMe) return;
            
            const texto = msg.body.toLowerCase().trim();
            const userId = msg.from;
            
            // Obtener el número REAL del contacto
            let numeroReal = null;
            try {
                const contact = await msg.getContact();
                numeroReal = contact.number || contact.id?.user || userId.split('@')[0];
                console.log(`📱 Usuario: ${userId} → Número real: ${numeroReal}`);
            } catch (err) {
                console.log(`⚠️ No se pudo obtener número real, usando userId`);
                numeroReal = userId.split('@')[0];
            }
            
            const mapaOpciones = this.obtenerMapaOpciones();
            
            // Registrar conversación (usar userId para identificación única, pero guardar número real)
            try {
                const cliente = await this.db.getOrCreateCliente(userId, numeroReal);
                await this.db.registrarConversacion(cliente.id, msg.body, 'entrante');
                await this.db.incrementarMensajesCliente(cliente.id);
            } catch (error) {
                console.error('Error registrando conversación:', error);
            }
            
            // PROCESO DE AGENDAMIENTO ACTIVO
            if (this.procesosAgendamiento.has(userId)) {
                await this.procesarAgendamiento(msg, texto, userId);
                return;
            }
            
            // PROCESO DE CONTACTO CON ASESOR ACTIVO
            if (this.procesosContactoAsesor.has(userId)) {
                const proceso = this.procesosContactoAsesor.get(userId);
                const textoOriginal = msg.body.trim();
                
                // Permitir cancelar
                if (texto === 'cancelar' || texto === 'menu' || texto === 'menú') {
                    this.procesosContactoAsesor.delete(userId);
                    const menuTexto = await this.generarMenu(msg);
                    if (menuTexto) {
                        await msg.reply(menuTexto);
                    }
                    return;
                }
                
                // PASO 1: Nombre
                if (proceso.paso === 'nombre') {
                    proceso.nombre = textoOriginal;
                    proceso.paso = 'telefono';
                    this.procesosContactoAsesor.set(userId, proceso);
                    
                    await msg.reply(
                        `✅ Gracias *${textoOriginal}*\n\n` +
                        `📱 Ahora dígita tu *número de teléfono*:`
                    );
                    return;
                }
                
                // PASO 2: Teléfono
                if (proceso.paso === 'telefono') {
                    proceso.telefono = textoOriginal;
                    proceso.paso = 'motivo';
                    this.procesosContactoAsesor.set(userId, proceso);
                    
                    await msg.reply(
                        `✅ Perfecto\n\n` +
                        `💬 Por último, ¿cuál es el *motivo de tu consulta*?`
                    );
                    return;
                }
                
                // PASO 3: Motivo y enviar al asesor
                if (proceso.paso === 'motivo') {
                    proceso.motivo = textoOriginal;
                    
                    // Confirmar al cliente
                    await msg.reply(
                        `✅ *Tu solicitud ha sido enviada*\n\n` +
                        `Un asesor se pondrá en contacto contigo lo más pronto posible.\n\n` +
                        `Escribe MENU para volver al inicio.`
                    );
                    
                    // Enviar al asesor
                    try {
                        if (this.config.numeroAsesor && this.config.numeroAsesor.trim() !== '') {
                            let numeroAsesor = this.config.numeroAsesor
                                .replace(/[^\d]/g, '') + '@c.us';
                            
                            // No enviar si es el mismo cliente
                            if (numeroAsesor !== userId) {
                                await this.client.sendMessage(numeroAsesor,
                                    `📞 *SOLICITUD DE CONTACTO*\n\n` +
                                    `👤 *Nombre:* ${proceso.nombre}\n` +
                                    `📱 *Teléfono:* ${proceso.telefono}\n` +
                                    `📱 *WhatsApp:* ${userId.replace('@c.us', '').replace('@lid', '')}\n` +
                                    `💬 *Motivo:*\n${proceso.motivo}\n\n` +
                                    `_Favor comunicarse lo antes posible_`
                                );
                                
                                console.log(`✅ Solicitud de contacto enviada al asesor`);
                            }
                        }
                    } catch (error) {
                        console.error('⚠️ Error enviando solicitud:', error);
                    }
                    
                    this.procesosContactoAsesor.delete(userId);
                    return;
                }
            }
            
            // PROCESO DE CANCELACIÓN ACTIVO
            if (this.procesosCancelacion.has(userId)) {
                await this.procesarCancelacion(msg, texto, userId);
                return;
            }
            
            // PROCESO DE REAGENDAMIENTO ACTIVO
            if (this.procesosReagendamiento.has(userId)) {
                await this.procesarReagendamiento(msg, texto, userId);
                return;
            }
            
            // VERIFICAR SI ESTÁ EN ATENCIÓN HUMANA
            if (this.usuariosConAsesor.has(userId)) {
                console.log(`🔇 Usuario ${userId} en atención humana`);
                return;
            }
            
            // PRIORIDAD 1: Si está en catálogo y envía número
            const numero = parseInt(texto);
            if (this.usuariosEnCatalogo.has(userId) && !isNaN(numero) && numero > 0) {
                const servicios = await this.db.getAllServicios();
                
                if (numero <= servicios.length) {
                    await this.enviarDetalleServicio(msg, numero);
                    this.usuariosEnCatalogo.delete(userId);
                    return;
                } else {
                    await msg.reply(`❌ Ese servicio no existe. Tenemos ${servicios.length} servicios disponibles.\n\nEscribe *MENU* para volver.`);
                    this.usuariosEnCatalogo.delete(userId);
                    return;
                }
            }
            
            // DETECCIÓN DE PRIMER MENSAJE
            const esNumero = !isNaN(numero) && texto.trim() === numero.toString();

            if (!esNumero && (!this.usuariosActivos.has(userId) || this.esSaludoOPrimerMensaje(texto))) {
                this.usuariosActivos.add(userId);
                this.usuariosEnCatalogo.delete(userId);
                const menuTexto = await this.generarMenu(msg);
                if (menuTexto) {
                    await msg.reply(menuTexto);
                }
                console.log(`👤 Nuevo usuario: ${userId}`);
                return;
            }
            
            // MENÚ EXPLÍCITO
            if (texto === 'menu' || texto === 'menú' || texto === 'inicio') {
                this.usuariosEnCatalogo.delete(userId);
                const menuTexto = await this.generarMenu(msg);
                if (menuTexto) {
                    await msg.reply(menuTexto);
                }
                return;
            }
            
            // VOLVER A VER SERVICIOS
            if (texto === 'volver') {
                this.usuariosEnCatalogo.add(userId);
                const catalogoMsg = await this.enviarCatalogo();
                await msg.reply(catalogoMsg);
                return;
            }
            
            // OPCIONES NUMÉRICAS
            if (mapaOpciones[texto]) {
                await this.procesarOpcionMenu(msg, mapaOpciones[texto], userId);
                return;
            }
            
            // PALABRA CLAVE: AGENDAR
            if (texto.includes('agendar') || texto.includes('cita')) {
                this.iniciarAgendamiento(userId);
                await msg.reply(
                    `📅 *AGENDAR CITA*\n\n` +
                    `Perfecto! Te voy a ayudar a agendar tu cita.\n\n` +
                    `Por favor escribe tu *nombre completo*:\n\n` +
                    `_O escribe CANCELAR para salir_`
                );
                return;
            }
            
            // PALABRA CLAVE: CANCELAR CITA
            if (texto.includes('cancelar') && (texto.includes('cita') || texto.includes('mi cita'))) {
                await this.iniciarCancelacion(msg, userId);
                return;
            }
            
            // PALABRA CLAVE: REAGENDAR/CAMBIAR CITA
            if ((texto.includes('reagendar') || texto.includes('cambiar') || texto.includes('mover')) && texto.includes('cita')) {
                await this.iniciarReagendamiento(msg, userId);
                return;
            }
            
            // HABLAR CON HUMANO
            if (texto.includes('asesor') || texto.includes('humano') || texto.includes('persona')) {
                this.activarModoAsesor(userId);
                await msg.reply(
                    `👤 *TRANSFERIDO A ASESOR HUMANO*\n\n` +
                    `Un asesor te atenderá en breve.\n` +
                    `También puedes escribir directo a:\n` +
                    `📱 ${this.config.numeroAsesor}`
                );
                return;
            }
            
            // NO ENTENDIÓ
            await msg.reply(
                `🤔 No entendí tu mensaje.\n\n` +
                `Escribe *MENU* para ver las opciones disponibles.`
            );
            
        } catch (error) {
            console.error('❌ Error procesando mensaje:', error);
            await msg.reply('Ocurrió un error. Por favor intenta de nuevo o escribe ASESOR.');
        }
    }

    async procesarOpcionMenu(msg, accion, userId) {
        switch(accion) {
            case 'servicios':
                this.usuariosEnCatalogo.add(userId);
                const catalogoMsg = await this.enviarCatalogo();
                await msg.reply(catalogoMsg);
                break;
                
            case 'precios':
                await msg.reply(await this.generarPrecios());
                break;
                
            case 'agendar':
                this.iniciarAgendamiento(userId);
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
                    `${this.config.direccion}\n\n` +
                    `Ver en mapa: ${this.config.linkMapa}\n\n` +
                    `Escribe MENU para volver`
                );
                break;
                
            case 'horarios':
                await msg.reply(
                    `🕐 *HORARIOS DE ATENCIÓN*\n\n` +
                    `Lunes a Viernes: ${this.config.horarios.lunesViernes}\n` +
                    `Sábados: ${this.config.horarios.sabado}\n` +
                    `Domingos: ${this.config.horarios.domingo}\n\n` +
                    `Escribe MENU para volver`
                );
                break;
                
            case 'faq':
                await msg.reply(await this.generarFAQ());
                break;
                
            case 'asesor':
                // Iniciar flujo de contacto con asesor
                this.procesosContactoAsesor.set(userId, { paso: 'nombre' });
                
                await msg.reply(
                    `👤 *CONTACTO CON ASESOR*\n\n` +
                    `Para que un asesor se comunique contigo, necesito algunos datos:\n\n` +
                    `Por favor, dígita tu *nombre completo*:`
                );
                break;
        }
    }

    async procesarAgendamiento(msg, texto, userId) {
        const proceso = this.procesosAgendamiento.get(userId);
        
        if (texto === 'cancelar') {
            this.procesosAgendamiento.delete(userId);
            await msg.reply('❌ Agendamiento cancelado.\n\nEscribe MENU para volver.');
            return;
        }
        
        // PASO 1: Nombre
        if (proceso.paso === 'nombre') {
            proceso.nombre = msg.body.trim();
            proceso.paso = 'telefono';  // Cambiar a pedir teléfono
            this.procesosAgendamiento.set(userId, proceso);
            
            await msg.reply(
                `✅ Perfecto ${proceso.nombre}!\n\n` +
                `📱 *Ahora necesito tu número de teléfono*\n\n` +
                `_Escribe CANCELAR para salir_`
            );
            return;
        }
        
        // PASO 2: Teléfono (NUEVO)
        if (proceso.paso === 'telefono') {
            const telefonoLimpio = msg.body.replace(/\D/g, ''); // Solo números
            
            if (telefonoLimpio.length >= 8 && telefonoLimpio.length <= 15) {
                proceso.telefono = telefonoLimpio;
                proceso.paso = 'servicio';
                this.procesosAgendamiento.set(userId, proceso);
                
                // Actualizar teléfono en base de datos
                try {
                    const cliente = await this.db.getOrCreateCliente(userId, telefonoLimpio);
                    await this.db.run(
                        'UPDATE clientes SET telefono = ? WHERE id = ?',
                        [telefonoLimpio, cliente.id]
                    );
                } catch (error) {
                    console.error('Error actualizando teléfono:', error);
                }
                
                const servicios = await this.db.getAllServicios();
                let serviciosMsg = `✅ Teléfono registrado: ${telefonoLimpio}\n\n`;
                serviciosMsg += `📋 *SELECCIONA UN SERVICIO:*\n\n`;
                
                servicios.forEach((serv, index) => {
                    serviciosMsg += `${index + 1}. ${serv.nombre} - ${serv.precio}\n`;
                });
                
                serviciosMsg += `\n_Escribe el número del servicio_`;
                serviciosMsg += `\n_O escribe CANCELAR para salir_`;
                
                await msg.reply(serviciosMsg);
            } else {
                await msg.reply(
                    `❌ Teléfono inválido\n\n` +
                    `Por favor ingresa un número válido (8-15 dígitos)\n`
                    
                );
            }
            return;
        }
        
        // PASO 3: Servicio (antes era paso 2)
        if (proceso.paso === 'servicio') {
            const numeroServicio = parseInt(texto);
            const servicios = await this.db.getAllServicios();
            
            if (numeroServicio >= 1 && numeroServicio <= servicios.length) {
                const servicioSeleccionado = servicios[numeroServicio - 1];
                
                proceso.servicio = {
                    id: servicioSeleccionado.id,
                    nombre: servicioSeleccionado.nombre,
                    precio: servicioSeleccionado.precio,
                    descripcion: servicioSeleccionado.descripcion
                };
                
                proceso.paso = 'fecha';
                this.procesosAgendamiento.set(userId, proceso);
                
                const diasDisponibles = await this.obtenerDiasSemana();
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
        
        // PASO 4: Fecha
        if (proceso.paso === 'fecha') {
            const numeroDia = parseInt(texto);
            const diasDisponibles = await this.obtenerDiasSemana();
            const diaSeleccionado = diasDisponibles.find(d => d.numero === numeroDia);
            
            if (diaSeleccionado) {
                proceso.fecha = diaSeleccionado.fecha;
                proceso.nombreDia = diaSeleccionado.nombre;
                proceso.paso = 'hora';
                this.procesosAgendamiento.set(userId, proceso);
                
                const horariosDisponibles = await this.obtenerHorariosDisponibles(
                    diaSeleccionado.nombre, 
                    diaSeleccionado.fecha
                );
                
                if (horariosDisponibles.length === 0) {
                    await msg.reply(
                        `❌ Lo siento, no hay horarios disponibles para ese día.\n\n` +
                        `Escribe AGENDAR para intentar con otra fecha.`
                    );
                    this.procesosAgendamiento.delete(userId);
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
        
        // PASO 5: Hora
        if (proceso.paso === 'hora') {
            const numeroHora = parseInt(texto);
            const horariosDisponibles = await this.obtenerHorariosDisponibles(
                proceso.nombreDia, 
                proceso.fecha
            );
            
            if (numeroHora >= 1 && numeroHora <= horariosDisponibles.length) {
                proceso.hora = horariosDisponibles[numeroHora - 1];
                
                try {
                    const cita = await this.guardarCita(userId, proceso);
                    
                    await msg.reply(
                        `✅ *CITA AGENDADA EXITOSAMENTE*\n\n` +
                        `📋 *Detalles de tu cita:*\n\n` +
                        `👤 Nombre: ${proceso.nombre}\n` +
                        `💼 Servicio: ${proceso.servicio.nombre}\n` +
                        `💰 Precio: ${proceso.servicio.precio}\n` +
                        `📅 Fecha: ${proceso.nombreDia} ${proceso.fecha}\n` +
                        `🕐 Hora: ${proceso.hora}\n\n` +
                        `📍 Dirección: ${this.config.direccion}\n\n` +
                        `_Confirmación #${cita.id}_\n\n` +
                        `Escribe MENU para volver al inicio.`
                    );
                    
                    // Notificar al asesor (solo si está configurado y es diferente al cliente)
                    try {
                        // Verificar que el número del asesor está configurado
                        if (!this.config.numeroAsesor || this.config.numeroAsesor.trim() === '') {
                            console.log('⚠️ Número de asesor no configurado. Saltando notificación.');
                        } else {
                            // Limpiar y formatear el número del asesor
                            let numeroAsesor = this.config.numeroAsesor
                                .replace(/\+/g, '')      // Quitar +
                                .replace(/\s/g, '')      // Quitar espacios
                                .replace(/-/g, '')       // Quitar guiones
                                .replace(/\(/g, '')      // Quitar paréntesis
                                .replace(/\)/g, '');     // Quitar paréntesis
                            
                            // Agregar sufijo de WhatsApp
                            numeroAsesor = numeroAsesor + '@c.us';
                            
                            // Verificar que no sea el mismo número del cliente
                            if (numeroAsesor !== userId) {
                                console.log(`📤 Enviando notificación al asesor: ${numeroAsesor}`);
                                console.log(`👤 Cliente que agendó: ${userId}`);
                                
                                await this.client.sendMessage(numeroAsesor,
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
                                console.log(`✅ Notificación enviada correctamente al asesor`);
                            } else {
                                console.log('⚠️ El número del asesor es el mismo que el cliente. No se envía notificación duplicada.');
                            }
                        }
                    } catch (error) {
                        console.error('⚠️ Error al notificar al asesor:', error.message);
                        console.error('📋 Detalles del error:');
                        console.error('   - Número asesor config:', this.config.numeroAsesor);
                        console.error('   - Número cliente:', userId);
                    }
                    
                    // IMPORTANTE: Limpiar proceso SIEMPRE, fuera del try-catch
                    this.procesosAgendamiento.delete(userId);
                
                } catch (error) {
                    // Error al guardar la cita (horario ocupado)
                    console.error('❌ Error guardando cita:', error.message);
                    
                    await msg.reply(
                        `❌ Lo sentimos, ese horario acaba de ser reservado.\n\n` +
                        `Por favor selecciona otro horario disponible.`
                    );
                    
                    // Volver a mostrar horarios disponibles actualizados
                    const horariosActualizados = await this.obtenerHorariosDisponibles(
                        proceso.nombreDia,
                        proceso.fecha
                    );
                    
                    if (horariosActualizados.length === 0) {
                        await msg.reply(
                            `❌ Lo sentimos, ya no hay horarios disponibles para ${proceso.nombreDia} ${proceso.fecha}.\n\n` +
                            `Escribe MENU para seleccionar otra fecha.`
                        );
                        this.procesosAgendamiento.delete(userId);
                        return;
                    }
                    
                    let mensajeHorarios = `🕐 *Horarios disponibles actualizados para ${proceso.nombreDia} ${proceso.fecha}:*\n\n`;
                    horariosActualizados.forEach((hora, index) => {
                        mensajeHorarios += `${index + 1}. ${hora}\n`;
                    });
                    mensajeHorarios += `\n_Responde con el número del horario que prefieres_`;
                    
                    await msg.reply(mensajeHorarios);
                    
                    // Mantener el proceso activo para que pueda elegir otro horario
                    proceso.paso = 'esperando_hora';
                }
                
            } else {
                await msg.reply('❌ Horario inválido. Por favor selecciona un horario válido.');
            }
            return;
        }
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            status: this.status,
            qrCode: this.qrCode,
            activeUsers: this.usuariosActivos.size,
            appointments: this.procesosAgendamiento.size
        };
    }

    getQRCode() {
        return this.qrCode;
    }

    // ========================================
    // NUEVOS MÉTODOS: CANCELAR CITAS
    // ========================================
    
    async iniciarCancelacion(msg, userId) {
        try {
            const cliente = await this.db.getOrCreateCliente(userId);
            const citasFuturas = await this.db.getCitasFuturasByCliente(cliente.id);
            
            if (citasFuturas.length === 0) {
                await msg.reply(
                    `ℹ️ No tienes citas programadas para cancelar.\n\n` +
                    `¿Deseas agendar una nueva cita? Escribe *AGENDAR*\n\n` +
                    `O escribe *MENU* para ver opciones.`
                );
                return;
            }
            
            let mensaje = `🗑️ *CANCELAR CITA*\n\n`;
            mensaje += `Tienes las siguientes citas programadas:\n\n`;
            
            citasFuturas.forEach((cita, index) => {
                const fecha = new Date(cita.fecha + 'T00:00:00');
                const fechaFormateada = fecha.toLocaleDateString('es-CR', { 
                    weekday: 'long', 
                    day: '2-digit', 
                    month: 'long' 
                });
                mensaje += `${index + 1}. ${fechaFormateada} a las ${cita.hora}\n`;
                mensaje += `   📋 ${cita.servicio_nombre}\n\n`;
            });
            
            mensaje += `_Escribe el número de la cita que deseas cancelar_\n`;
            mensaje += `\nO escribe *MENU* para salir`;
            
            this.procesosCancelacion.set(userId, {
                paso: 'seleccion',
                citas: citasFuturas
            });
            
            await msg.reply(mensaje);
            
        } catch (error) {
            console.error('Error iniciando cancelación:', error);
            await msg.reply('Ocurrió un error. Por favor intenta de nuevo o escribe MENU.');
        }
    }
    
    async procesarCancelacion(msg, texto, userId) {
        const proceso = this.procesosCancelacion.get(userId);
        
        // Permitir cancelar el proceso
        if (texto === 'menu' || texto === 'menú' || texto === 'salir') {
            this.procesosCancelacion.delete(userId);
            const menuTexto = await this.generarMenu(msg);
            if (menuTexto) {
                await msg.reply(menuTexto);
            }
            return;
        }
        
        if (proceso.paso === 'seleccion') {
            const numero = parseInt(texto);
            
            if (isNaN(numero) || numero < 1 || numero > proceso.citas.length) {
                await msg.reply(
                    `❌ Número inválido.\n\n` +
                    `Por favor escribe un número del 1 al ${proceso.citas.length}\n` +
                    `O escribe *MENU* para salir`
                );
                return;
            }
            
            const citaSeleccionada = proceso.citas[numero - 1];
            
            try {
                await this.db.cancelarCita(citaSeleccionada.id);
                
                const fecha = new Date(citaSeleccionada.fecha + 'T00:00:00');
                const fechaFormateada = fecha.toLocaleDateString('es-CR', { 
                    weekday: 'long', 
                    day: '2-digit', 
                    month: 'long' 
                });
                
                await msg.reply(
                    `✅ *CITA CANCELADA*\n\n` +
                    `📅 ${fechaFormateada}\n` +
                    `🕐 ${citaSeleccionada.hora}\n` +
                    `📋 ${citaSeleccionada.servicio_nombre}\n\n` +
                    `Tu cita ha sido cancelada exitosamente.\n\n` +
                    `Escribe *MENU* para volver al inicio.`
                );
                
                // Notificar al asesor
                try {
                    if (this.config.numeroAsesor && this.config.numeroAsesor.trim() !== '') {
                        let numeroAsesor = this.config.numeroAsesor.replace(/[^\d]/g, '') + '@c.us';
                        
                        if (numeroAsesor !== userId) {
                            const cliente = await this.db.getOrCreateCliente(userId);
                            await this.client.sendMessage(numeroAsesor,
                                `🗑️ *CITA CANCELADA*\n\n` +
                                `👤 Cliente: ${cliente.nombre || 'Sin nombre'}\n` +
                                `📱 Tel: ${cliente.telefono}\n` +
                                `📅 Fecha: ${fechaFormateada}\n` +
                                `🕐 Hora: ${citaSeleccionada.hora}\n` +
                                `📋 Servicio: ${citaSeleccionada.servicio_nombre}\n\n` +
                                `_El cliente canceló desde WhatsApp_`
                            );
                        }
                    }
                } catch (error) {
                    console.error('⚠️ Error notificando cancelación:', error);
                }
                
                this.procesosCancelacion.delete(userId);
                
            } catch (error) {
                console.error('Error cancelando cita:', error);
                await msg.reply('Ocurrió un error al cancelar. Por favor contacta al asesor.');
                this.procesosCancelacion.delete(userId);
            }
        }
    }
    
    // ========================================
    // NUEVOS MÉTODOS: REAGENDAR CITAS
    // ========================================
    
    async iniciarReagendamiento(msg, userId) {
        try {
            const cliente = await this.db.getOrCreateCliente(userId);
            const citasFuturas = await this.db.getCitasFuturasByCliente(cliente.id);
            
            if (citasFuturas.length === 0) {
                await msg.reply(
                    `ℹ️ No tienes citas programadas para reagendar.\n\n` +
                    `¿Deseas agendar una nueva cita? Escribe *AGENDAR*\n\n` +
                    `O escribe *MENU* para ver opciones.`
                );
                return;
            }
            
            let mensaje = `🔄 *REAGENDAR CITA*\n\n`;
            mensaje += `Tienes las siguientes citas programadas:\n\n`;
            
            citasFuturas.forEach((cita, index) => {
                const fecha = new Date(cita.fecha + 'T00:00:00');
                const fechaFormateada = fecha.toLocaleDateString('es-CR', { 
                    weekday: 'long', 
                    day: '2-digit', 
                    month: 'long' 
                });
                mensaje += `${index + 1}. ${fechaFormateada} a las ${cita.hora}\n`;
                mensaje += `   📋 ${cita.servicio_nombre}\n\n`;
            });
            
            mensaje += `_Escribe el número de la cita que deseas cambiar_\n`;
            mensaje += `\nO escribe *MENU* para salir`;
            
            this.procesosReagendamiento.set(userId, {
                paso: 'seleccion',
                citas: citasFuturas
            });
            
            await msg.reply(mensaje);
            
        } catch (error) {
            console.error('Error iniciando reagendamiento:', error);
            await msg.reply('Ocurrió un error. Por favor intenta de nuevo o escribe MENU.');
        }
    }
    
    async procesarReagendamiento(msg, texto, userId) {
        const proceso = this.procesosReagendamiento.get(userId);
        
        // Permitir cancelar el proceso
        if (texto === 'menu' || texto === 'menú' || texto === 'salir' || texto === 'cancelar') {
            this.procesosReagendamiento.delete(userId);
            const menuTexto = await this.generarMenu(msg);
            if (menuTexto) {
                await msg.reply(menuTexto);
            }
            return;
        }
        
        // PASO 1: Selección de cita
        if (proceso.paso === 'seleccion') {
            const numero = parseInt(texto);
            
            if (isNaN(numero) || numero < 1 || numero > proceso.citas.length) {
                await msg.reply(
                    `❌ Número inválido.\n\n` +
                    `Por favor escribe un número del 1 al ${proceso.citas.length}\n` +
                    `O escribe *MENU* para salir`
                );
                return;
            }
            
            const citaSeleccionada = proceso.citas[numero - 1];
            proceso.citaSeleccionada = citaSeleccionada;
            proceso.paso = 'nueva_fecha';
            
            const diasDisponibles = await this.obtenerDiasSemana();
            
            if (diasDisponibles.length === 0) {
                await msg.reply(
                    `❌ Lo sentimos, no hay fechas disponibles en este momento.\n\n` +
                    `Por favor contacta al asesor: ${this.config.numeroAsesor}`
                );
                this.procesosReagendamiento.delete(userId);
                return;
            }
            
            let mensaje = `📅 *Selecciona la nueva fecha:*\n\n`;
            diasDisponibles.forEach((dia, index) => {
                mensaje += `${index + 1}. ${dia.nombre} ${dia.fecha}\n`;
            });
            mensaje += `\n_Escribe el número de la fecha que prefieres_`;
            
            proceso.diasDisponibles = diasDisponibles;
            this.procesosReagendamiento.set(userId, proceso);
            
            await msg.reply(mensaje);
            return;
        }
        
        // PASO 2: Nueva fecha
        if (proceso.paso === 'nueva_fecha') {
            const numero = parseInt(texto);
            
            if (isNaN(numero) || numero < 1 || numero > proceso.diasDisponibles.length) {
                await msg.reply(
                    `❌ Número inválido.\n\n` +
                    `Por favor escribe un número del 1 al ${proceso.diasDisponibles.length}`
                );
                return;
            }
            
            const diaSeleccionado = proceso.diasDisponibles[numero - 1];
            proceso.nuevaFecha = diaSeleccionado.fecha;
            proceso.nombreDia = diaSeleccionado.nombre;
            proceso.paso = 'nueva_hora';
            
            const horariosDisponibles = await this.obtenerHorariosDisponibles(
                diaSeleccionado.nombre.toLowerCase(),
                diaSeleccionado.fecha
            );
            
            if (horariosDisponibles.length === 0) {
                await msg.reply(
                    `❌ Lo sentimos, no hay horarios disponibles para ${diaSeleccionado.nombre}.\n\n` +
                    `Escribe MENU para seleccionar otra fecha.`
                );
                proceso.paso = 'nueva_fecha';
                this.procesosReagendamiento.set(userId, proceso);
                return;
            }
            
            let mensajeHorarios = `🕐 *Horarios disponibles para ${diaSeleccionado.nombre} ${diaSeleccionado.fecha}:*\n\n`;
            horariosDisponibles.forEach((hora, index) => {
                mensajeHorarios += `${index + 1}. ${hora}\n`;
            });
            mensajeHorarios += `\n_Escribe el número del horario que prefieres_`;
            
            proceso.horariosDisponibles = horariosDisponibles;
            this.procesosReagendamiento.set(userId, proceso);
            
            await msg.reply(mensajeHorarios);
            return;
        }
        
        // PASO 3: Nueva hora y confirmar
        if (proceso.paso === 'nueva_hora') {
            const numero = parseInt(texto);
            
            if (isNaN(numero) || numero < 1 || numero > proceso.horariosDisponibles.length) {
                await msg.reply(
                    `❌ Número inválido.\n\n` +
                    `Por favor escribe un número del 1 al ${proceso.horariosDisponibles.length}`
                );
                return;
            }
            
            const nuevaHora = proceso.horariosDisponibles[numero - 1];
            
            try {
                // Verificar disponibilidad final
                const disponible = await this.db.isHorarioDisponible(proceso.nuevaFecha, nuevaHora);
                
                if (!disponible) {
                    await msg.reply(
                        `❌ Lo sentimos, ese horario acaba de ser reservado.\n\n` +
                        `Por favor escribe MENU para seleccionar otro.`
                    );
                    this.procesosReagendamiento.delete(userId);
                    return;
                }
                
                // Actualizar la cita
                await this.db.updateCita(proceso.citaSeleccionada.id, {
                    fecha: proceso.nuevaFecha,
                    hora: nuevaHora,
                    notas: 'Reagendada por cliente desde WhatsApp'
                });
                
                await msg.reply(
                    `✅ *CITA REAGENDADA*\n\n` +
                    `📅 Nueva fecha: ${proceso.nombreDia} ${proceso.nuevaFecha}\n` +
                    `🕐 Nueva hora: ${nuevaHora}\n` +
                    `📋 Servicio: ${proceso.citaSeleccionada.servicio_nombre}\n\n` +
                    `Tu cita ha sido reagendada exitosamente.\n\n` +
                    `Escribe *MENU* para volver al inicio.`
                );
                
                // Notificar al asesor
                try {
                    if (this.config.numeroAsesor && this.config.numeroAsesor.trim() !== '') {
                        let numeroAsesor = this.config.numeroAsesor.replace(/[^\d]/g, '') + '@c.us';
                        
                        if (numeroAsesor !== userId) {
                            const cliente = await this.db.getOrCreateCliente(userId);
                            const fechaAnterior = new Date(proceso.citaSeleccionada.fecha + 'T00:00:00');
                            const fechaAnteriorFormateada = fechaAnterior.toLocaleDateString('es-CR', { 
                                weekday: 'long', 
                                day: '2-digit', 
                                month: 'long' 
                            });
                            
                            await this.client.sendMessage(numeroAsesor,
                                `🔄 *CITA REAGENDADA*\n\n` +
                                `👤 Cliente: ${cliente.nombre || 'Sin nombre'}\n` +
                                `📱 Tel: ${cliente.telefono}\n\n` +
                                `*ANTERIOR:*\n` +
                                `📅 ${fechaAnteriorFormateada}\n` +
                                `🕐 ${proceso.citaSeleccionada.hora}\n\n` +
                                `*NUEVA:*\n` +
                                `📅 ${proceso.nombreDia} ${proceso.nuevaFecha}\n` +
                                `🕐 ${nuevaHora}\n\n` +
                                `📋 Servicio: ${proceso.citaSeleccionada.servicio_nombre}\n\n` +
                                `_El cliente reagendó desde WhatsApp_`
                            );
                        }
                    }
                } catch (error) {
                    console.error('⚠️ Error notificando reagendamiento:', error);
                }
                
                this.procesosReagendamiento.delete(userId);
                
            } catch (error) {
                console.error('Error reagendando cita:', error);
                await msg.reply('Ocurrió un error al reagendar. Por favor contacta al asesor.');
                this.procesosReagendamiento.delete(userId);
            }
        }
    }
}

module.exports = BotController;
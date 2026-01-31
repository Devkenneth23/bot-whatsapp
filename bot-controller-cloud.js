/**
 * BOT CONTROLLER - WHATSAPP CLOUD API
 * Controlador del bot adaptado para WhatsApp Business Cloud API
 * 
 * Migrado desde whatsapp-web.js a Cloud API
 * Incluye toda la funcionalidad original + cancelar/reagendar citas
 * 
 * @version 2.0
 */

const EventEmitter = require('events');
const WhatsAppCloudAPI = require('./whatsapp-cloud-api');

class BotControllerCloud extends EventEmitter {
    constructor(clientId, config, db, whatsappApi) {
        super();
        
        this.clientId = clientId; // ID del cliente en el sistema multi-tenant
        this.config = config;
        this.db = db; // Base de datos INDIVIDUAL del cliente
        this.whatsapp = whatsappApi; // Instancia de WhatsAppCloudAPI
        
        this.isRunning = false;
        this.status = 'stopped';
        
        // Gestión de usuarios y procesos
        this.usuariosActivos = new Set();
        this.usuariosConAsesor = new Set();
        this.timersReactivacion = new Map();
        this.procesosAgendamiento = new Map();
        this.procesosContactoAsesor = new Map();
        this.usuariosEnCatalogo = new Set();
        this.procesosCancelacion = new Map();
        this.procesosReagendamiento = new Map();
        
        console.log(`✅ BotController iniciado para cliente ${clientId}`);
    }

    /**
     * Inicia el bot (en Cloud API no hay "start" como tal, solo marca como ready)
     */
    async start() {
        this.isRunning = true;
        this.status = 'running';
        this.emit('ready');
        console.log(`✅ Bot del cliente ${this.clientId} listo`);
        return true;
    }

    /**
     * Detiene el bot
     */
    async stop() {
        this.isRunning = false;
        this.status = 'stopped';
        
        // Limpiar timers
        this.timersReactivacion.forEach(timer => clearTimeout(timer));
        this.timersReactivacion.clear();
        
        // Limpiar sets y maps
        this.usuariosActivos.clear();
        this.usuariosConAsesor.clear();
        this.procesosAgendamiento.clear();
        this.procesosContactoAsesor.clear();
        this.usuariosEnCatalogo.clear();
        this.procesosCancelacion.clear();
        this.procesosReagendamiento.clear();
        
        console.log(`🛑 Bot del cliente ${this.clientId} detenido`);
    }

    /**
     * Maneja un mensaje entrante
     * @param {Object} messageData - Datos del mensaje del webhook
     */
    async handleMessage(messageData) {
        try {
            if (!this.isRunning) {
                console.log('⏸️ Bot detenido, ignorando mensaje');
                return;
            }

            const texto = messageData.content.toLowerCase().trim();
            const userId = messageData.from;
            const messageId = messageData.messageId;

            // Obtener mapa de opciones del menú
            const mapaOpciones = this.obtenerMapaOpciones();

            // Registrar conversación
            try {
                const cliente = await this.db.getOrCreateCliente(userId, userId);
                await this.db.registrarConversacion(cliente.id, messageData.content, 'entrante');
                await this.db.incrementarMensajesCliente(cliente.id);
            } catch (error) {
                console.error('Error registrando conversación:', error);
            }

            // Marcar mensaje como leído
            await this.whatsapp.markAsRead(messageId);

            // === PROCESO DE AGENDAMIENTO ACTIVO ===
            if (this.procesosAgendamiento.has(userId)) {
                await this.procesarAgendamiento(userId, texto, messageData);
                return;
            }

            // === PROCESO DE CONTACTO CON ASESOR ACTIVO ===
            if (this.procesosContactoAsesor.has(userId)) {
                await this.procesarContactoAsesor(userId, texto, messageData);
                return;
            }

            // === PROCESO DE CANCELACIÓN ACTIVO ===
            if (this.procesosCancelacion.has(userId)) {
                await this.procesarCancelacion(userId, texto, messageData);
                return;
            }

            // === PROCESO DE REAGENDAMIENTO ACTIVO ===
            if (this.procesosReagendamiento.has(userId)) {
                await this.procesarReagendamiento(userId, texto, messageData);
                return;
            }

            // === VERIFICAR SI ESTÁ EN ATENCIÓN HUMANA ===
            if (this.usuariosConAsesor.has(userId)) {
                console.log(`🔇 Usuario ${userId} en atención humana`);
                return;
            }

            // === CATÁLOGO ACTIVO ===
            const numero = parseInt(texto);
            if (this.usuariosEnCatalogo.has(userId) && !isNaN(numero) && numero > 0) {
                const servicios = await this.db.getAllServicios();
                
                if (numero <= servicios.length) {
                    await this.enviarDetalleServicio(userId, numero);
                    this.usuariosEnCatalogo.delete(userId);
                    return;
                } else {
                    await this.enviarMensaje(userId, 
                        `❌ Ese servicio no existe. Tenemos ${servicios.length} servicios disponibles.\n\nEscribe *MENU* para volver.`
                    );
                    this.usuariosEnCatalogo.delete(userId);
                    return;
                }
            }

            // === DETECCIÓN DE PRIMER MENSAJE ===
            const esNumero = !isNaN(numero) && texto.trim() === numero.toString();

            if (!esNumero && (!this.usuariosActivos.has(userId) || this.esSaludoOPrimerMensaje(texto))) {
                this.usuariosActivos.add(userId);
                this.usuariosEnCatalogo.delete(userId);
                await this.generarMenu(userId);
                console.log(`👤 Nuevo usuario: ${userId}`);
                return;
            }

            // === MENÚ EXPLÍCITO ===
            if (texto === 'menu' || texto === 'menú' || texto === 'inicio') {
                this.usuariosEnCatalogo.delete(userId);
                await this.generarMenu(userId);
                return;
            }

            // === VOLVER A VER SERVICIOS ===
            if (texto === 'volver') {
                this.usuariosEnCatalogo.add(userId);
                await this.enviarCatalogo(userId);
                return;
            }

            // === OPCIONES NUMÉRICAS ===
            if (mapaOpciones[texto]) {
                await this.procesarOpcionMenu(userId, mapaOpciones[texto]);
                return;
            }

            // === PALABRA CLAVE: AGENDAR ===
            if (texto.includes('agendar') || texto.includes('cita')) {
                this.iniciarAgendamiento(userId);
                await this.enviarMensaje(userId,
                    `📅 *AGENDAR CITA*\n\n` +
                    `Perfecto! Te voy a ayudar a agendar tu cita.\n\n` +
                    `Por favor escribe tu *nombre completo*:\n\n` +
                    `_O escribe CANCELAR para salir_`
                );
                return;
            }

            // === PALABRA CLAVE: CANCELAR CITA ===
            if (texto.includes('cancelar') && (texto.includes('cita') || texto.includes('mi cita'))) {
                await this.iniciarCancelacion(userId);
                return;
            }

            // === PALABRA CLAVE: REAGENDAR/CAMBIAR CITA ===
            if ((texto.includes('reagendar') || texto.includes('cambiar') || texto.includes('mover')) && texto.includes('cita')) {
                await this.iniciarReagendamiento(userId);
                return;
            }

            // === HABLAR CON HUMANO ===
            if (texto.includes('asesor') || texto.includes('humano') || texto.includes('persona')) {
                this.activarModoAsesor(userId);
                await this.enviarMensaje(userId,
                    `👤 *TRANSFERIDO A ASESOR HUMANO*\n\n` +
                    `Un asesor te atenderá en breve.\n` +
                    `También puedes escribir directo a:\n` +
                    `📱 ${this.config.numeroAsesor}`
                );
                return;
            }

            // === NO ENTENDIÓ ===
            await this.enviarMensaje(userId,
                `🤔 No entendí tu mensaje.\n\n` +
                `Escribe *MENU* para ver las opciones disponibles.`
            );

        } catch (error) {
            console.error('❌ Error procesando mensaje:', error);
            await this.enviarMensaje(messageData.from,
                'Ocurrió un error. Por favor intenta de nuevo o escribe ASESOR.'
            );
        }
    }

    /**
     * Envía un mensaje de texto
     * @param {string} to - Número del destinatario
     * @param {string} message - Texto del mensaje
     */
    async enviarMensaje(to, message) {
        try {
            const result = await this.whatsapp.sendTextMessage(to, message);
            
            if (result.success) {
                // Registrar mensaje enviado
                const cliente = await this.db.getOrCreateCliente(to, to);
                await this.db.registrarConversacion(cliente.id, message, 'saliente');
            }
            
            return result;
        } catch (error) {
            console.error('Error enviando mensaje:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Genera el mapa de opciones del menú
     */
    obtenerMapaOpciones() {
        const opciones = {};
        let numero = 1;

        if (this.config.opciones.verServicios) opciones[numero.toString()] = 'servicios', numero++;
        if (this.config.opciones.precios) opciones[numero.toString()] = 'precios', numero++;
        if (this.config.opciones.agendar) opciones[numero.toString()] = 'agendar', numero++;
        if (this.config.opciones.ubicacion) opciones[numero.toString()] = 'ubicacion', numero++;
        if (this.config.opciones.horarios) opciones[numero.toString()] = 'horarios', numero++;
        if (this.config.opciones.faq) opciones[numero.toString()] = 'faq', numero++;
        opciones[numero.toString()] = 'asesor';

        return opciones;
    }

    /**
     * Verifica si es un saludo o primer mensaje
     */
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

    /**
     * Genera y envía el menú principal
     */
    async generarMenu(userId) {
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
        
        await this.enviarMensaje(userId, menu);
    }

    /**
     * Envía el catálogo de servicios
     */
    async enviarCatalogo(userId) {
        const servicios = await this.db.getAllServicios();
        
        let catalogo = `📋 *NUESTROS SERVICIOS*\n\n`;
        
        servicios.forEach((servicio, index) => {
            catalogo += `${index + 1}. ${servicio.nombre}\n`;
        });
        
        catalogo += `\n💡 *Escribe el número para ver detalles*\n`;
        catalogo += `\nEscribe *MENU* para volver`;
        
        await this.enviarMensaje(userId, catalogo);
    }

    /**
     * Envía el detalle de un servicio
     */
    async enviarDetalleServicio(userId, numeroServicio) {
        const servicios = await this.db.getAllServicios();
        
        if (numeroServicio < 1 || numeroServicio > servicios.length) {
            await this.enviarMensaje(userId, '❌ Número de servicio inválido. Escribe *MENU* para volver.');
            return;
        }
        
        const servicio = servicios[numeroServicio - 1];
        
        let mensaje = `*${servicio.nombre}*\n\n`;
        mensaje += `💰 Precio: ${servicio.precio}\n`;
        mensaje += `📄 ${servicio.descripcion}\n\n`;
        mensaje += `Escribe *Volver* para ver más servicios\n\n`;
        mensaje += `Escribe *MENU* para volver al inicio`;
        
        // TODO: Enviar imagen si existe (requiere URL pública)
        await this.enviarMensaje(userId, mensaje);
    }

    /**
     * Genera lista de precios
     */
    async generarPrecios(userId) {
        const servicios = await this.db.getAllServicios();
        
        let precios = `💰 *LISTA DE PRECIOS*\n\n`;
        
        servicios.forEach(s => {
            precios += `• ${s.nombre}: ${s.precio}\n`;
        });
        
        precios += `\n_Escribe MENU para volver_`;
        
        await this.enviarMensaje(userId, precios);
    }

    /**
     * Genera y envía FAQ
     */
    async generarFAQ(userId) {
        const faqs = await this.db.getAllFAQs();
        
        let faq = `❓ *PREGUNTAS FRECUENTES*\n\n`;
        
        faqs.forEach((item, index) => {
            faq += `*${index + 1}. ${item.pregunta}*\n`;
            faq += `${item.respuesta}\n\n`;
        });
        
        faq += `_Escribe MENU para volver_`;
        
        await this.enviarMensaje(userId, faq);
    }

    /**
     * Procesa una opción del menú
     */
    async procesarOpcionMenu(userId, accion) {
        switch(accion) {
            case 'servicios':
                this.usuariosEnCatalogo.add(userId);
                await this.enviarCatalogo(userId);
                break;
                
            case 'precios':
                await this.generarPrecios(userId);
                break;
                
            case 'agendar':
                this.iniciarAgendamiento(userId);
                await this.enviarMensaje(userId,
                    `📅 *AGENDAR CITA*\n\n` +
                    `Perfecto! Te voy a ayudar a agendar tu cita.\n\n` +
                    `Por favor escribe tu *nombre completo*:\n\n` +
                    `_O escribe CANCELAR para salir_`
                );
                break;
                
            case 'ubicacion':
                await this.enviarMensaje(userId, this.config.ubicacion);
                break;
                
            case 'horarios':
                await this.enviarMensaje(userId, this.config.horarios);
                break;
                
            case 'faq':
                await this.generarFAQ(userId);
                break;
                
            case 'asesor':
                await this.iniciarContactoConAsesor(userId);
                break;
        }
    }

    /**
     * Inicia el proceso de agendamiento
     */
    iniciarAgendamiento(userId) {
        this.procesosAgendamiento.set(userId, {
            paso: 'nombre',
            nombre: null,
            telefono: null,
            servicio: null,
            fecha: null,
            hora: null
        });
    }

    /**
     * Procesa el agendamiento de citas
     */
    async procesarAgendamiento(userId, texto, messageData) {
        const proceso = this.procesosAgendamiento.get(userId);
        const textoOriginal = messageData.content.trim();
        
        // Permitir cancelar
        if (texto === 'cancelar' || texto === 'menu' || texto === 'menú') {
            this.procesosAgendamiento.delete(userId);
            await this.generarMenu(userId);
            return;
        }

        // PASO 1: Nombre
        if (proceso.paso === 'nombre') {
            proceso.nombre = textoOriginal;
            proceso.paso = 'servicio';
            this.procesosAgendamiento.set(userId, proceso);
            
            const servicios = await this.db.getAllServicios();
            let mensaje = `✅ Gracias *${textoOriginal}*\n\n📋 *Selecciona el servicio:*\n\n`;
            
            servicios.forEach((s, i) => {
                mensaje += `${i + 1}. ${s.nombre} - ${s.precio}\n`;
            });
            
            mensaje += `\n_Escribe el número del servicio_`;
            await this.enviarMensaje(userId, mensaje);
            return;
        }

        // PASO 2: Servicio
        if (proceso.paso === 'servicio') {
            const numero = parseInt(textoOriginal);
            const servicios = await this.db.getAllServicios();
            
            if (isNaN(numero) || numero < 1 || numero > servicios.length) {
                await this.enviarMensaje(userId, `❌ Número inválido. Por favor escribe un número del 1 al ${servicios.length}`);
                return;
            }
            
            proceso.servicio = servicios[numero - 1];
            proceso.paso = 'fecha';
            this.procesosAgendamiento.set(userId, proceso);
            
            const diasDisponibles = await this.obtenerDiasSemana();
            
            if (diasDisponibles.length === 0) {
                await this.enviarMensaje(userId, 
                    `❌ Lo sentimos, no hay fechas disponibles en este momento.\n\nPor favor contacta al asesor: ${this.config.numeroAsesor}`
                );
                this.procesosAgendamiento.delete(userId);
                return;
            }
            
            let mensaje = `📅 *Selecciona la fecha:*\n\n`;
            diasDisponibles.forEach((dia, index) => {
                mensaje += `${index + 1}. ${dia.nombre} ${dia.fecha}\n`;
            });
            mensaje += `\n_Escribe el número de la fecha que prefieres_`;
            
            proceso.diasDisponibles = diasDisponibles;
            this.procesosAgendamiento.set(userId, proceso);
            
            await this.enviarMensaje(userId, mensaje);
            return;
        }

        // PASO 3: Fecha
        if (proceso.paso === 'fecha') {
            const numero = parseInt(textoOriginal);
            
            if (isNaN(numero) || numero < 1 || numero > proceso.diasDisponibles.length) {
                await this.enviarMensaje(userId, `❌ Número inválido. Por favor escribe un número del 1 al ${proceso.diasDisponibles.length}`);
                return;
            }
            
            const diaSeleccionado = proceso.diasDisponibles[numero - 1];
            proceso.fecha = diaSeleccionado.fecha;
            proceso.nombreDia = diaSeleccionado.nombre;
            proceso.paso = 'hora';
            
            const horariosDisponibles = await this.obtenerHorariosDisponibles(
                diaSeleccionado.nombre.toLowerCase(),
                diaSeleccionado.fecha
            );
            
            if (horariosDisponibles.length === 0) {
                await this.enviarMensaje(userId, 
                    `❌ Lo sentimos, no hay horarios disponibles para ${diaSeleccionado.nombre}.\n\nEscribe MENU para seleccionar otra fecha.`
                );
                proceso.paso = 'fecha';
                this.procesosAgendamiento.set(userId, proceso);
                return;
            }
            
            let mensajeHorarios = `🕐 *Horarios disponibles para ${diaSeleccionado.nombre} ${diaSeleccionado.fecha}:*\n\n`;
            horariosDisponibles.forEach((hora, index) => {
                mensajeHorarios += `${index + 1}. ${hora}\n`;
            });
            mensajeHorarios += `\n_Escribe el número del horario que prefieres_`;
            
            proceso.horariosDisponibles = horariosDisponibles;
            this.procesosAgendamiento.set(userId, proceso);
            
            await this.enviarMensaje(userId, mensajeHorarios);
            return;
        }

        // PASO 4: Hora y confirmación
        if (proceso.paso === 'hora') {
            const numero = parseInt(textoOriginal);
            
            if (isNaN(numero) || numero < 1 || numero > proceso.horariosDisponibles.length) {
                await this.enviarMensaje(userId, `❌ Número inválido. Por favor escribe un número del 1 al ${proceso.horariosDisponibles.length}`);
                return;
            }
            
            proceso.hora = proceso.horariosDisponibles[numero - 1];
            
            try {
                // Verificar disponibilidad final
                const disponible = await this.db.isHorarioDisponible(proceso.fecha, proceso.hora);
                
                if (!disponible) {
                    await this.enviarMensaje(userId, 
                        `❌ Lo sentimos, ese horario acaba de ser reservado.\n\nPor favor escribe MENU para seleccionar otro.`
                    );
                    this.procesosAgendamiento.delete(userId);
                    return;
                }
                
                // Guardar cita
                const cita = await this.guardarCita(userId, proceso);
                
                await this.enviarMensaje(userId,
                    `✅ *CITA CONFIRMADA*\n\n` +
                    `👤 Nombre: ${proceso.nombre}\n` +
                    `📋 Servicio: ${proceso.servicio.nombre}\n` +
                    `📅 Fecha: ${proceso.nombreDia} ${proceso.fecha}\n` +
                    `🕐 Hora: ${proceso.hora}\n` +
                    `💰 Precio: ${proceso.servicio.precio}\n\n` +
                    `Te esperamos! 🎉\n\n` +
                    `Escribe *MENU* para volver al inicio`
                );
                
                // Notificar al asesor
                await this.notificarAsesorNuevaCita(proceso, cita);
                
                this.procesosAgendamiento.delete(userId);
                
            } catch (error) {
                console.error('Error guardando cita:', error);
                await this.enviarMensaje(userId, 
                    `❌ ${error.message}\n\nPor favor intenta de nuevo o contacta al asesor.`
                );
                this.procesosAgendamiento.delete(userId);
            }
        }
    }

    /**
     * Obtiene días de la semana disponibles
     */
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

    /**
     * Obtiene horarios disponibles para un día
     */
    async obtenerHorariosDisponibles(nombreDia, fecha) {
        return await this.db.getHorariosDisponiblesPorFecha(fecha, nombreDia);
    }

    /**
     * Guarda una cita en la base de datos
     */
    async guardarCita(userId, datosCita) {
        const cliente = await this.db.getOrCreateCliente(userId, userId);
        
        // Validar que el horario sigue disponible
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

    /**
     * Notifica al asesor de una nueva cita
     */
    async notificarAsesorNuevaCita(proceso, cita) {
        try {
            if (!this.config.numeroAsesor || this.config.numeroAsesor.trim() === '') {
                return;
            }
            
            const numeroAsesor = this.config.numeroAsesor.replace(/[^\d]/g, '');
            
            await this.whatsapp.sendTextMessage(numeroAsesor,
                `📅 *NUEVA CITA AGENDADA*\n\n` +
                `👤 Cliente: ${proceso.nombre}\n` +
                `📋 Servicio: ${proceso.servicio.nombre}\n` +
                `📅 Fecha: ${proceso.nombreDia} ${proceso.fecha}\n` +
                `🕐 Hora: ${proceso.hora}\n` +
                `💰 Precio: ${proceso.servicio.precio}\n\n` +
                `_Cita #${cita.id} confirmada_`
            );
            
        } catch (error) {
            console.error('⚠️ Error notificando asesor:', error);
        }
    }

    /**
     * Activa el modo asesor para un usuario
     */
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

    /**
     * Inicia el proceso de contacto con asesor
     */
    async iniciarContactoConAsesor(userId) {
        this.procesosContactoAsesor.set(userId, {
            paso: 'nombre',
            nombre: null,
            telefono: null,
            motivo: null
        });
        
        await this.enviarMensaje(userId,
            `👤 *CONTACTO CON ASESOR*\n\n` +
            `Para conectarte con un asesor, por favor dime:\n\n` +
            `¿Cuál es tu *nombre*?`
        );
    }

    /**
     * Procesa el flujo de contacto con asesor
     */
    async procesarContactoAsesor(userId, texto, messageData) {
        const proceso = this.procesosContactoAsesor.get(userId);
        const textoOriginal = messageData.content.trim();
        
        // Permitir cancelar
        if (texto === 'cancelar' || texto === 'menu' || texto === 'menú') {
            this.procesosContactoAsesor.delete(userId);
            await this.generarMenu(userId);
            return;
        }
        
        // PASO 1: Nombre
        if (proceso.paso === 'nombre') {
            proceso.nombre = textoOriginal;
            proceso.paso = 'telefono';
            this.procesosContactoAsesor.set(userId, proceso);
            
            await this.enviarMensaje(userId,
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
            
            await this.enviarMensaje(userId,
                `✅ Perfecto\n\n` +
                `💬 Por último, ¿cuál es el *motivo de tu consulta*?`
            );
            return;
        }
        
        // PASO 3: Motivo y enviar al asesor
        if (proceso.paso === 'motivo') {
            proceso.motivo = textoOriginal;
            
            // Confirmar al cliente
            await this.enviarMensaje(userId,
                `✅ *Tu solicitud ha sido enviada*\n\n` +
                `Un asesor se pondrá en contacto contigo lo más pronto posible.\n\n` +
                `Escribe MENU para volver al inicio.`
            );
            
            // Enviar al asesor
            try {
                if (this.config.numeroAsesor && this.config.numeroAsesor.trim() !== '') {
                    const numeroAsesor = this.config.numeroAsesor.replace(/[^\d]/g, '');
                    
                    await this.whatsapp.sendTextMessage(numeroAsesor,
                        `📞 *SOLICITUD DE CONTACTO*\n\n` +
                        `👤 *Nombre:* ${proceso.nombre}\n` +
                        `📱 *Teléfono:* ${proceso.telefono}\n` +
                        `📱 *WhatsApp:* ${userId}\n` +
                        `💬 *Motivo:*\n${proceso.motivo}\n\n` +
                        `_Favor comunicarse lo antes posible_`
                    );
                    
                    console.log(`✅ Solicitud de contacto enviada al asesor`);
                }
            } catch (error) {
                console.error('⚠️ Error enviando solicitud:', error);
            }
            
            this.procesosContactoAsesor.delete(userId);
            return;
        }
    }

    // ========================================
    // CANCELAR CITAS
    // ========================================
    
    async iniciarCancelacion(userId) {
        try {
            const cliente = await this.db.getOrCreateCliente(userId, userId);
            const citasFuturas = await this.db.getCitasFuturasByCliente(cliente.id);
            
            if (citasFuturas.length === 0) {
                await this.enviarMensaje(userId,
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
            
            await this.enviarMensaje(userId, mensaje);
            
        } catch (error) {
            console.error('Error iniciando cancelación:', error);
            await this.enviarMensaje(userId, 'Ocurrió un error. Por favor intenta de nuevo o escribe MENU.');
        }
    }
    
    async procesarCancelacion(userId, texto, messageData) {
        const proceso = this.procesosCancelacion.get(userId);
        
        // Permitir cancelar el proceso
        if (texto === 'menu' || texto === 'menú' || texto === 'salir') {
            this.procesosCancelacion.delete(userId);
            await this.generarMenu(userId);
            return;
        }
        
        if (proceso.paso === 'seleccion') {
            const numero = parseInt(messageData.content);
            
            if (isNaN(numero) || numero < 1 || numero > proceso.citas.length) {
                await this.enviarMensaje(userId,
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
                
                await this.enviarMensaje(userId,
                    `✅ *CITA CANCELADA*\n\n` +
                    `📅 ${fechaFormateada}\n` +
                    `🕐 ${citaSeleccionada.hora}\n` +
                    `📋 ${citaSeleccionada.servicio_nombre}\n\n` +
                    `Tu cita ha sido cancelada exitosamente.\n\n` +
                    `Escribe *MENU* para volver al inicio.`
                );
                
                // Notificar al asesor
                await this.notificarAsesorCancelacion(citaSeleccionada, userId);
                
                this.procesosCancelacion.delete(userId);
                
            } catch (error) {
                console.error('Error cancelando cita:', error);
                await this.enviarMensaje(userId, 'Ocurrió un error al cancelar. Por favor contacta al asesor.');
                this.procesosCancelacion.delete(userId);
            }
        }
    }

    async notificarAsesorCancelacion(cita, userId) {
        try {
            if (!this.config.numeroAsesor || this.config.numeroAsesor.trim() === '') {
                return;
            }
            
            const numeroAsesor = this.config.numeroAsesor.replace(/[^\d]/g, '');
            const cliente = await this.db.getOrCreateCliente(userId, userId);
            
            const fecha = new Date(cita.fecha + 'T00:00:00');
            const fechaFormateada = fecha.toLocaleDateString('es-CR', { 
                weekday: 'long', 
                day: '2-digit', 
                month: 'long' 
            });
            
            await this.whatsapp.sendTextMessage(numeroAsesor,
                `🗑️ *CITA CANCELADA*\n\n` +
                `👤 Cliente: ${cliente.nombre || 'Sin nombre'}\n` +
                `📱 Tel: ${cliente.telefono}\n` +
                `📅 Fecha: ${fechaFormateada}\n` +
                `🕐 Hora: ${cita.hora}\n` +
                `📋 Servicio: ${cita.servicio_nombre}\n\n` +
                `_El cliente canceló desde WhatsApp_`
            );
        } catch (error) {
            console.error('⚠️ Error notificando cancelación:', error);
        }
    }

    // ========================================
    // REAGENDAR CITAS
    // ========================================
    
    async iniciarReagendamiento(userId) {
        try {
            const cliente = await this.db.getOrCreateCliente(userId, userId);
            const citasFuturas = await this.db.getCitasFuturasByCliente(cliente.id);
            
            if (citasFuturas.length === 0) {
                await this.enviarMensaje(userId,
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
            
            await this.enviarMensaje(userId, mensaje);
            
        } catch (error) {
            console.error('Error iniciando reagendamiento:', error);
            await this.enviarMensaje(userId, 'Ocurrió un error. Por favor intenta de nuevo o escribe MENU.');
        }
    }
    
    async procesarReagendamiento(userId, texto, messageData) {
        const proceso = this.procesosReagendamiento.get(userId);
        const textoOriginal = messageData.content;
        
        // Permitir cancelar el proceso
        if (texto === 'menu' || texto === 'menú' || texto === 'salir' || texto === 'cancelar') {
            this.procesosReagendamiento.delete(userId);
            await this.generarMenu(userId);
            return;
        }
        
        // PASO 1: Selección de cita
        if (proceso.paso === 'seleccion') {
            const numero = parseInt(textoOriginal);
            
            if (isNaN(numero) || numero < 1 || numero > proceso.citas.length) {
                await this.enviarMensaje(userId,
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
                await this.enviarMensaje(userId,
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
            
            await this.enviarMensaje(userId, mensaje);
            return;
        }
        
        // PASO 2: Nueva fecha
        if (proceso.paso === 'nueva_fecha') {
            const numero = parseInt(textoOriginal);
            
            if (isNaN(numero) || numero < 1 || numero > proceso.diasDisponibles.length) {
                await this.enviarMensaje(userId,
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
                await this.enviarMensaje(userId,
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
            
            await this.enviarMensaje(userId, mensajeHorarios);
            return;
        }
        
        // PASO 3: Nueva hora y confirmar
        if (proceso.paso === 'nueva_hora') {
            const numero = parseInt(textoOriginal);
            
            if (isNaN(numero) || numero < 1 || numero > proceso.horariosDisponibles.length) {
                await this.enviarMensaje(userId,
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
                    await this.enviarMensaje(userId,
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
                
                await this.enviarMensaje(userId,
                    `✅ *CITA REAGENDADA*\n\n` +
                    `📅 Nueva fecha: ${proceso.nombreDia} ${proceso.nuevaFecha}\n` +
                    `🕐 Nueva hora: ${nuevaHora}\n` +
                    `📋 Servicio: ${proceso.citaSeleccionada.servicio_nombre}\n\n` +
                    `Tu cita ha sido reagendada exitosamente.\n\n` +
                    `Escribe *MENU* para volver al inicio.`
                );
                
                // Notificar al asesor
                await this.notificarAsesorReagendamiento(proceso, nuevaHora, userId);
                
                this.procesosReagendamiento.delete(userId);
                
            } catch (error) {
                console.error('Error reagendando cita:', error);
                await this.enviarMensaje(userId, 'Ocurrió un error al reagendar. Por favor contacta al asesor.');
                this.procesosReagendamiento.delete(userId);
            }
        }
    }

    async notificarAsesorReagendamiento(proceso, nuevaHora, userId) {
        try {
            if (!this.config.numeroAsesor || this.config.numeroAsesor.trim() === '') {
                return;
            }
            
            const numeroAsesor = this.config.numeroAsesor.replace(/[^\d]/g, '');
            const cliente = await this.db.getOrCreateCliente(userId, userId);
            
            const fechaAnterior = new Date(proceso.citaSeleccionada.fecha + 'T00:00:00');
            const fechaAnteriorFormateada = fechaAnterior.toLocaleDateString('es-CR', { 
                weekday: 'long', 
                day: '2-digit', 
                month: 'long' 
            });
            
            await this.whatsapp.sendTextMessage(numeroAsesor,
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
        } catch (error) {
            console.error('⚠️ Error notificando reagendamiento:', error);
        }
    }

    /**
     * Obtiene el estado del bot
     */
    getStatus() {
        return {
            clientId: this.clientId,
            isRunning: this.isRunning,
            status: this.status,
            activeUsers: this.usuariosActivos.size,
            appointments: this.procesosAgendamiento.size,
            cancelations: this.procesosCancelacion.size,
            reschedules: this.procesosReagendamiento.size
        };
    }
}

module.exports = BotControllerCloud;

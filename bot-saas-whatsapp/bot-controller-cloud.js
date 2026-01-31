// bot-controller-cloud.js - Controlador del Bot para WhatsApp Cloud API (Multi-tenant)
const WhatsAppCloudAPI = require('./whatsapp-cloud-api');
const EventEmitter = require('events');

class BotControllerCloud extends EventEmitter {
    constructor(clienteInfo, dbManager) {
        super();
        this.clienteInfo = clienteInfo;
        this.dbManager = dbManager;
        this.config = clienteInfo.config || {};
        
        // Inicializar WhatsApp Cloud API
        this.whatsappAPI = new WhatsAppCloudAPI({
            phoneNumberId: clienteInfo.phone_number_id,
            accessToken: clienteInfo.access_token,
            businessAccountId: clienteInfo.business_account_id
        });
        
        // Sets para gestión de usuarios (por cliente SaaS)
        this.usuariosActivos = new Set();
        this.usuariosConAsesor = new Set();
        this.timersReactivacion = new Map();
        this.procesosAgendamiento = new Map();
        this.procesosContactoAsesor = new Map();
        this.usuariosEnCatalogo = new Set();
        this.procesosCancelacion = new Map();
        this.procesosReagendamiento = new Map();
        
        console.log(`✅ BotController creado para cliente: ${this.clienteInfo.nombre_negocio}`);
    }

    // ========== MANEJO DE MENSAJES ENTRANTES ==========
    
    async handleIncomingMessage(messageData) {
        try {
            const { from, text, type, messageId } = messageData;
            
            // Registrar actividad del usuario
            await this.registrarActividad(from);
            
            // Obtener o crear cliente
            const cliente = await this.dbManager.getOrCreateCliente(from, from);
            await this.dbManager.incrementarMensajesCliente(cliente.id);
            
            // Registrar conversación
            await this.dbManager.registrarConversacion(cliente.id, text || '[mensaje multimedia]', 'entrante');
            
            // Marcar mensaje como leído
            await this.whatsappAPI.markAsRead(messageId);
            
            // Procesar mensaje según el tipo
            if (type === 'text' && text) {
                await this.procesarMensajeTexto(from, text.trim(), cliente.id);
            } else {
                await this.whatsappAPI.sendText(
                    from,
                    'Por el momento solo puedo procesar mensajes de texto. Por favor escribe tu consulta.'
                );
            }
            
        } catch (error) {
            console.error('Error procesando mensaje:', error);
            await this.whatsappAPI.sendText(
                messageData.from,
                'Disculpa, ocurrió un error al procesar tu mensaje. Por favor intenta de nuevo.'
            );
        }
    }

    async procesarMensajeTexto(userId, texto, clienteId) {
        const textoNormalizado = this.normalizarTexto(texto);
        
        // Verificar si está en algún proceso activo
        if (this.procesosAgendamiento.has(userId)) {
            return await this.procesarAgendamiento(userId, texto, clienteId);
        }
        
        if (this.procesosCancelacion.has(userId)) {
            return await this.procesarCancelacion(userId, texto, clienteId);
        }
        
        if (this.procesosReagendamiento.has(userId)) {
            return await this.procesarReagendamiento(userId, texto, clienteId);
        }
        
        if (this.procesosContactoAsesor.has(userId)) {
            return await this.procesarContactoAsesor(userId, texto);
        }
        
        if (this.usuariosEnCatalogo.has(userId)) {
            return await this.procesarCatalogo(userId, texto);
        }
        
        // Comandos especiales
        if (textoNormalizado === 'menu' || textoNormalizado === 'menú') {
            this.limpiarProcesos(userId);
            return await this.mostrarMenuPrincipal(userId);
        }
        
        // Comandos de cancelación/reagendamiento directo
        if (textoNormalizado.includes('cancelar') && textoNormalizado.includes('cita')) {
            return await this.iniciarCancelacion(userId, clienteId);
        }
        
        if (textoNormalizado.includes('cambiar') || textoNormalizado.includes('reagendar')) {
            return await this.iniciarReagendamiento(userId, clienteId);
        }
        
        // Saludo o primer mensaje
        if (this.esSaludoOPrimerMensaje(textoNormalizado) || !this.usuariosActivos.has(userId)) {
            this.usuariosActivos.add(userId);
            return await this.enviarBienvenida(userId);
        }
        
        // Procesar selección del menú
        await this.procesarSeleccionMenu(userId, texto, clienteId);
    }

    // ========== MENÚ PRINCIPAL ==========
    
    async enviarBienvenida(userId) {
        const mensaje = this.config.mensajeBienvenida || 
            `¡Hola! 👋 Bienvenido a *${this.clienteInfo.nombre_negocio}*\n\n` +
            `Estoy aquí para ayudarte. ¿En qué puedo asistirte hoy?`;
        
        await this.whatsappAPI.sendText(userId, mensaje);
        await this.mostrarMenuPrincipal(userId);
    }

    async mostrarMenuPrincipal(userId) {
        const opciones = this.construirOpcionesMenu();
        
        await this.whatsappAPI.sendButtons(
            userId,
            'Selecciona una opción:',
            opciones.slice(0, 3), // Cloud API permite máximo 3 botones
            '¿Cómo puedo ayudarte?'
        );
        
        // Si hay más de 3 opciones, enviar las demás como lista
        if (opciones.length > 3) {
            const opcionesLista = opciones.slice(3).map((op, idx) => ({
                id: op.id,
                title: op.title,
                description: op.description || ''
            }));
            
            await this.whatsappAPI.sendList(
                userId,
                'Más opciones',
                'Ver opciones',
                [{
                    title: 'Opciones adicionales',
                    rows: opcionesLista
                }]
            );
        }
    }

    construirOpcionesMenu() {
        const opciones = [];
        
        if (this.config.opciones?.verServicios) {
            opciones.push({
                id: 'servicios',
                title: '📋 Ver Servicios',
                description: 'Conoce nuestros servicios'
            });
        }
        
        if (this.config.opciones?.agendar) {
            opciones.push({
                id: 'agendar',
                title: '📅 Agendar Cita',
                description: 'Reserva tu cita ahora'
            });
        }
        
        if (this.config.opciones?.precios) {
            opciones.push({
                id: 'precios',
                title: '💰 Ver Precios',
                description: 'Consulta nuestros precios'
            });
        }
        
        if (this.config.opciones?.ubicacion) {
            opciones.push({
                id: 'ubicacion',
                title: '📍 Ubicación',
                description: 'Cómo llegar'
            });
        }
        
        if (this.config.opciones?.horarios) {
            opciones.push({
                id: 'horarios',
                title: '🕐 Horarios',
                description: 'Horarios de atención'
            });
        }
        
        if (this.config.opciones?.faq) {
            opciones.push({
                id: 'faq',
                title: '❓ Preguntas Frecuentes',
                description: 'Respuestas rápidas'
            });
        }
        
        opciones.push({
            id: 'cancelar',
            title: '❌ Cancelar Cita',
            description: 'Cancela tu cita'
        });
        
        opciones.push({
            id: 'reagendar',
            title: '🔄 Reagendar Cita',
            description: 'Cambia tu cita'
        });
        
        opciones.push({
            id: 'asesor',
            title: '👤 Hablar con Asesor',
            description: 'Contacto directo'
        });
        
        return opciones;
    }

    async procesarSeleccionMenu(userId, texto, clienteId) {
        const textoNormalizado = this.normalizarTexto(texto);
        
        // Identificar opción seleccionada
        let opcion = null;
        
        if (textoNormalizado.includes('servicio') || textoNormalizado === '1') {
            opcion = 'servicios';
        } else if (textoNormalizado.includes('agendar') || textoNormalizado === '2') {
            opcion = 'agendar';
        } else if (textoNormalizado.includes('precio') || textoNormalizado === '3') {
            opcion = 'precios';
        } else if (textoNormalizado.includes('ubicacion') || textoNormalizado.includes('ubicación') || textoNormalizado === '4') {
            opcion = 'ubicacion';
        } else if (textoNormalizado.includes('horario') || textoNormalizado === '5') {
            opcion = 'horarios';
        } else if (textoNormalizado.includes('pregunta') || textoNormalizado.includes('faq') || textoNormalizado === '6') {
            opcion = 'faq';
        } else if (textoNormalizado.includes('cancelar')) {
            opcion = 'cancelar';
        } else if (textoNormalizado.includes('reagendar') || textoNormalizado.includes('cambiar')) {
            opcion = 'reagendar';
        } else if (textoNormalizado.includes('asesor') || textoNormalizado.includes('contacto')) {
            opcion = 'asesor';
        }
        
        switch (opcion) {
            case 'servicios':
                await this.mostrarServicios(userId);
                break;
            case 'agendar':
                await this.iniciarAgendamiento(userId, clienteId);
                break;
            case 'precios':
                await this.mostrarPrecios(userId);
                break;
            case 'ubicacion':
                await this.mostrarUbicacion(userId);
                break;
            case 'horarios':
                await this.mostrarHorarios(userId);
                break;
            case 'faq':
                await this.mostrarFAQ(userId);
                break;
            case 'cancelar':
                await this.iniciarCancelacion(userId, clienteId);
                break;
            case 'reagendar':
                await this.iniciarReagendamiento(userId, clienteId);
                break;
            case 'asesor':
                await this.conectarConAsesor(userId);
                break;
            default:
                await this.whatsappAPI.sendText(
                    userId,
                    'No entendí tu solicitud. Por favor selecciona una opción del menú o escribe *MENU* para ver las opciones.'
                );
                await this.mostrarMenuPrincipal(userId);
        }
    }

    // ========== MOSTRAR SERVICIOS ==========
    
    async mostrarServicios(userId) {
        try {
            const servicios = await this.dbManager.getAllServicios();
            
            if (servicios.length === 0) {
                await this.whatsappAPI.sendText(
                    userId,
                    '📋 Actualmente no tenemos servicios disponibles.\n\n' +
                    'Escribe *MENU* para ver otras opciones.'
                );
                return;
            }
            
            let mensaje = '📋 *NUESTROS SERVICIOS*\n\n';
            
            servicios.forEach((servicio, index) => {
                mensaje += `${index + 1}. *${servicio.nombre}*\n`;
                if (servicio.descripcion) {
                    mensaje += `   ${servicio.descripcion}\n`;
                }
                if (servicio.precio) {
                    mensaje += `   💰 ₡${servicio.precio.toLocaleString('es-CR')}\n`;
                }
                mensaje += '\n';
            });
            
            mensaje += '¿Te gustaría agendar alguno de estos servicios?\n\n';
            
            await this.whatsappAPI.sendText(userId, mensaje);
            
            await this.whatsappAPI.sendButtons(
                userId,
                '¿Qué deseas hacer?',
                [
                    { id: 'agendar', title: '📅 Agendar Cita' },
                    { id: 'menu', title: '⬅️ Volver al Menú' }
                ],
                'Selecciona una opción'
            );
            
        } catch (error) {
            console.error('Error mostrando servicios:', error);
            await this.whatsappAPI.sendText(
                userId,
                'Ocurrió un error al cargar los servicios. Por favor intenta de nuevo.'
            );
        }
    }

    // ========== MOSTRAR PRECIOS ==========
    
    async mostrarPrecios(userId) {
        try {
            const servicios = await this.dbManager.getAllServicios();
            
            if (servicios.length === 0) {
                await this.whatsappAPI.sendText(
                    userId,
                    '💰 Actualmente no tenemos precios disponibles.\n\n' +
                    'Escribe *MENU* para ver otras opciones.'
                );
                return;
            }
            
            let mensaje = '💰 *LISTA DE PRECIOS*\n\n';
            
            servicios.forEach((servicio) => {
                mensaje += `• *${servicio.nombre}*\n`;
                if (servicio.precio) {
                    mensaje += `  ₡${servicio.precio.toLocaleString('es-CR')}\n\n`;
                } else {
                    mensaje += `  _Consultar precio_\n\n`;
                }
            });
            
            mensaje += '_Los precios pueden variar según el servicio específico_\n\n';
            mensaje += 'Escribe *MENU* para volver al inicio.';
            
            await this.whatsappAPI.sendText(userId, mensaje);
            
        } catch (error) {
            console.error('Error mostrando precios:', error);
            await this.whatsappAPI.sendText(
                userId,
                'Ocurrió un error al cargar los precios. Por favor intenta de nuevo.'
            );
        }
    }

    // ========== MOSTRAR UBICACIÓN ==========
    
    async mostrarUbicacion(userId) {
        const ubicacion = this.config.ubicacion || 'No configurada';
        const googleMaps = this.config.googleMapsUrl || '';
        
        let mensaje = '📍 *NUESTRA UBICACIÓN*\n\n';
        mensaje += `${ubicacion}\n\n`;
        
        if (googleMaps) {
            mensaje += `📱 Ver en Google Maps:\n${googleMaps}\n\n`;
        }
        
        mensaje += 'Escribe *MENU* para volver al inicio.';
        
        await this.whatsappAPI.sendText(userId, mensaje);
    }

    // ========== MOSTRAR HORARIOS ==========
    
    async mostrarHorarios(userId) {
        try {
            const horarios = await this.dbManager.getAllHorarios();
            
            if (horarios.length === 0) {
                await this.whatsappAPI.sendText(
                    userId,
                    '🕐 Actualmente no tenemos horarios configurados.\n\n' +
                    'Por favor contacta a nuestro asesor.\n\n' +
                    'Escribe *MENU* para ver otras opciones.'
                );
                return;
            }
            
            // Agrupar por día
            const horariosPorDia = {};
            horarios.forEach(h => {
                if (!horariosPorDia[h.dia_semana]) {
                    horariosPorDia[h.dia_semana] = [];
                }
                horariosPorDia[h.dia_semana].push(h.hora);
            });
            
            let mensaje = '🕐 *HORARIOS DE ATENCIÓN*\n\n';
            
            const diasOrden = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
            const diasNombres = {
                'lunes': 'Lunes',
                'martes': 'Martes',
                'miercoles': 'Miércoles',
                'jueves': 'Jueves',
                'viernes': 'Viernes',
                'sabado': 'Sábado',
                'domingo': 'Domingo'
            };
            
            diasOrden.forEach(dia => {
                if (horariosPorDia[dia]) {
                    mensaje += `*${diasNombres[dia]}:*\n`;
                    horariosPorDia[dia].sort().forEach(hora => {
                        mensaje += `  • ${hora}\n`;
                    });
                    mensaje += '\n';
                }
            });
            
            mensaje += 'Escribe *MENU* para volver al inicio.';
            
            await this.whatsappAPI.sendText(userId, mensaje);
            
        } catch (error) {
            console.error('Error mostrando horarios:', error);
            await this.whatsappAPI.sendText(
                userId,
                'Ocurrió un error al cargar los horarios. Por favor intenta de nuevo.'
            );
        }
    }

    // ========== FAQ ==========
    
    async mostrarFAQ(userId) {
        try {
            const faqs = await this.dbManager.getAllFAQs();
            
            if (faqs.length === 0) {
                await this.whatsappAPI.sendText(
                    userId,
                    '❓ Actualmente no tenemos preguntas frecuentes configuradas.\n\n' +
                    'Escribe *MENU* para ver otras opciones.'
                );
                return;
            }
            
            let mensaje = '❓ *PREGUNTAS FRECUENTES*\n\n';
            
            faqs.forEach((faq, index) => {
                mensaje += `*${index + 1}. ${faq.pregunta}*\n`;
                mensaje += `${faq.respuesta}\n\n`;
            });
            
            mensaje += 'Escribe *MENU* para volver al inicio.';
            
            await this.whatsappAPI.sendText(userId, mensaje);
            
        } catch (error) {
            console.error('Error mostrando FAQ:', error);
            await this.whatsappAPI.sendText(
                userId,
                'Ocurrió un error al cargar las preguntas frecuentes. Por favor intenta de nuevo.'
            );
        }
    }

    // ========== AGENDAR CITA (Con Botones) ==========
    
    async iniciarAgendamiento(userId, clienteId) {
        try {
            const servicios = await this.dbManager.getAllServicios();
            
            if (servicios.length === 0) {
                await this.whatsappAPI.sendText(
                    userId,
                    '❌ Lo sentimos, no hay servicios disponibles en este momento.\n\n' +
                    'Escribe *MENU* para ver otras opciones.'
                );
                return;
            }
            
            // Guardar proceso
            this.procesosAgendamiento.set(userId, {
                paso: 'seleccionar_servicio',
                clienteId: clienteId,
                servicios: servicios
            });
            
            // Enviar servicios como lista
            const rows = servicios.map((servicio, index) => ({
                id: `servicio_${servicio.id}`,
                title: servicio.nombre.substring(0, 24), // Límite de caracteres
                description: servicio.precio ? `₡${servicio.precio.toLocaleString('es-CR')}` : 'Consultar'
            }));
            
            await this.whatsappAPI.sendList(
                userId,
                '📋 Selecciona el servicio que deseas:',
                'Ver Servicios',
                [{
                    title: 'Servicios Disponibles',
                    rows: rows
                }]
            );
            
        } catch (error) {
            console.error('Error iniciando agendamiento:', error);
            await this.whatsappAPI.sendText(
                userId,
                'Ocurrió un error al iniciar el agendamiento. Por favor intenta de nuevo.'
            );
        }
    }

    async procesarAgendamiento(userId, texto, clienteId) {
        const proceso = this.procesosAgendamiento.get(userId);
        const textoNormalizado = this.normalizarTexto(texto);
        
        // Permitir cancelar
        if (textoNormalizado === 'menu' || textoNormalizado === 'cancelar') {
            this.procesosAgendamiento.delete(userId);
            await this.mostrarMenuPrincipal(userId);
            return;
        }
        
        try {
            // PASO 1: Seleccionar servicio
            if (proceso.paso === 'seleccionar_servicio') {
                let servicioSeleccionado = null;
                
                // Verificar si es un ID de servicio (formato: servicio_X)
                if (texto.startsWith('servicio_')) {
                    const servicioId = parseInt(texto.replace('servicio_', ''));
                    servicioSeleccionado = proceso.servicios.find(s => s.id === servicioId);
                } else {
                    // Buscar por número o nombre
                    const numero = parseInt(texto);
                    if (!isNaN(numero) && numero > 0 && numero <= proceso.servicios.length) {
                        servicioSeleccionado = proceso.servicios[numero - 1];
                    }
                }
                
                if (!servicioSeleccionado) {
                    await this.whatsappAPI.sendText(
                        userId,
                        '❌ Servicio no válido. Por favor selecciona uno de la lista o escribe *MENU* para cancelar.'
                    );
                    return;
                }
                
                proceso.servicioSeleccionado = servicioSeleccionado;
                proceso.paso = 'seleccionar_fecha';
                this.procesosAgendamiento.set(userId, proceso);
                
                // Obtener fechas disponibles
                const diasDisponibles = await this.obtenerDiasSemana();
                
                if (diasDisponibles.length === 0) {
                    await this.whatsappAPI.sendText(
                        userId,
                        '❌ Lo sentimos, no hay fechas disponibles en este momento.\n\n' +
                        'Por favor contacta a nuestro asesor o intenta más tarde.'
                    );
                    this.procesosAgendamiento.delete(userId);
                    return;
                }
                
                proceso.diasDisponibles = diasDisponibles;
                this.procesosAgendamiento.set(userId, proceso);
                
                // Enviar fechas como botones (máx 3) o lista
                if (diasDisponibles.length <= 3) {
                    const botones = diasDisponibles.map((dia, index) => ({
                        id: `fecha_${index}`,
                        title: `${dia.nombre} ${dia.fecha}`.substring(0, 20)
                    }));
                    
                    await this.whatsappAPI.sendButtons(
                        userId,
                        `✅ Servicio: *${servicioSeleccionado.nombre}*\n\n📅 Selecciona la fecha:`,
                        botones,
                        'Fechas disponibles'
                    );
                } else {
                    const rows = diasDisponibles.map((dia, index) => ({
                        id: `fecha_${index}`,
                        title: dia.nombre,
                        description: dia.fecha
                    }));
                    
                    await this.whatsappAPI.sendList(
                        userId,
                        `✅ Servicio: *${servicioSeleccionado.nombre}*\n\n📅 Selecciona la fecha:`,
                        'Ver Fechas',
                        [{
                            title: 'Fechas Disponibles',
                            rows: rows
                        }]
                    );
                }
                
                return;
            }
            
            // PASO 2: Seleccionar fecha
            if (proceso.paso === 'seleccionar_fecha') {
                let diaSeleccionado = null;
                
                // Verificar si es un ID de fecha (formato: fecha_X)
                if (texto.startsWith('fecha_')) {
                    const index = parseInt(texto.replace('fecha_', ''));
                    diaSeleccionado = proceso.diasDisponibles[index];
                } else {
                    // Buscar por número
                    const numero = parseInt(texto);
                    if (!isNaN(numero) && numero > 0 && numero <= proceso.diasDisponibles.length) {
                        diaSeleccionado = proceso.diasDisponibles[numero - 1];
                    }
                }
                
                if (!diaSeleccionado) {
                    await this.whatsappAPI.sendText(
                        userId,
                        '❌ Fecha no válida. Por favor selecciona una de las opciones.'
                    );
                    return;
                }
                
                proceso.fechaSeleccionada = diaSeleccionado.fecha;
                proceso.nombreDia = diaSeleccionado.nombre;
                proceso.paso = 'seleccionar_hora';
                this.procesosAgendamiento.set(userId, proceso);
                
                // Obtener horarios disponibles
                const horariosDisponibles = await this.obtenerHorariosDisponibles(
                    diaSeleccionado.nombre.toLowerCase(),
                    diaSeleccionado.fecha
                );
                
                if (horariosDisponibles.length === 0) {
                    await this.whatsappAPI.sendText(
                        userId,
                        `❌ Lo sentimos, no hay horarios disponibles para ${diaSeleccionado.nombre}.\n\n` +
                        'Escribe *MENU* para intentar con otra fecha.'
                    );
                    this.procesosAgendamiento.delete(userId);
                    return;
                }
                
                proceso.horariosDisponibles = horariosDisponibles;
                this.procesosAgendamiento.set(userId, proceso);
                
                // Enviar horarios como lista
                const rows = horariosDisponibles.map((hora, index) => ({
                    id: `hora_${index}`,
                    title: hora,
                    description: 'Disponible'
                }));
                
                await this.whatsappAPI.sendList(
                    userId,
                    `📅 ${diaSeleccionado.nombre} ${diaSeleccionado.fecha}\n\n🕐 Selecciona el horario:`,
                    'Ver Horarios',
                    [{
                        title: 'Horarios Disponibles',
                        rows: rows
                    }]
                );
                
                return;
            }
            
            // PASO 3: Seleccionar hora y confirmar
            if (proceso.paso === 'seleccionar_hora') {
                let horaSeleccionada = null;
                
                // Verificar si es un ID de hora (formato: hora_X)
                if (texto.startsWith('hora_')) {
                    const index = parseInt(texto.replace('hora_', ''));
                    horaSeleccionada = proceso.horariosDisponibles[index];
                } else {
                    // Buscar por número
                    const numero = parseInt(texto);
                    if (!isNaN(numero) && numero > 0 && numero <= proceso.horariosDisponibles.length) {
                        horaSeleccionada = proceso.horariosDisponibles[numero - 1];
                    }
                }
                
                if (!horaSeleccionada) {
                    await this.whatsappAPI.sendText(
                        userId,
                        '❌ Horario no válido. Por favor selecciona uno de las opciones.'
                    );
                    return;
                }
                
                // Verificar disponibilidad final
                const disponible = await this.dbManager.isHorarioDisponible(
                    proceso.fechaSeleccionada,
                    horaSeleccionada
                );
                
                if (!disponible) {
                    await this.whatsappAPI.sendText(
                        userId,
                        '❌ Lo sentimos, ese horario acaba de ser reservado.\n\n' +
                        'Escribe *MENU* para seleccionar otro horario.'
                    );
                    this.procesosAgendamiento.delete(userId);
                    return;
                }
                
                // Crear la cita
                const citaId = await this.dbManager.createCita({
                    cliente_id: proceso.clienteId,
                    servicio_id: proceso.servicioSeleccionado.id,
                    fecha: proceso.fechaSeleccionada,
                    hora: horaSeleccionada,
                    notas: 'Agendada desde WhatsApp Cloud API'
                });
                
                // Confirmar al cliente
                await this.whatsappAPI.sendText(
                    userId,
                    `✅ *CITA CONFIRMADA*\n\n` +
                    `📋 Servicio: ${proceso.servicioSeleccionado.nombre}\n` +
                    `📅 Fecha: ${proceso.nombreDia} ${proceso.fechaSeleccionada}\n` +
                    `🕐 Hora: ${horaSeleccionada}\n\n` +
                    `Tu cita ha sido agendada exitosamente.\n` +
                    `Recibirás un recordatorio antes de tu cita.\n\n` +
                    `Escribe *MENU* para volver al inicio.`
                );
                
                // Notificar al asesor
                await this.notificarAsesorNuevaCita(userId, proceso, horaSeleccionada);
                
                // Limpiar proceso
                this.procesosAgendamiento.delete(userId);
            }
            
        } catch (error) {
            console.error('Error procesando agendamiento:', error);
            await this.whatsappAPI.sendText(
                userId,
                'Ocurrió un error al procesar tu cita. Por favor intenta de nuevo o contacta a nuestro asesor.'
            );
            this.procesosAgendamiento.delete(userId);
        }
    }

    // ========== CANCELAR CITA ==========
    
    async iniciarCancelacion(userId, clienteId) {
        try {
            const citasFuturas = await this.dbManager.getCitasFuturasByCliente(clienteId);
            
            if (citasFuturas.length === 0) {
                await this.whatsappAPI.sendText(
                    userId,
                    '📅 No tienes citas pendientes para cancelar.\n\n' +
                    'Escribe *MENU* para ver otras opciones.'
                );
                return;
            }
            
            let mensaje = '❌ *CANCELAR CITA*\n\n';
            mensaje += 'Tus citas pendientes:\n\n';
            
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
            
            // Enviar como lista
            const rows = citasFuturas.map((cita, index) => {
                const fecha = new Date(cita.fecha + 'T00:00:00');
                const fechaFormateada = fecha.toLocaleDateString('es-CR', {
                    day: '2-digit',
                    month: 'short'
                });
                return {
                    id: `cancelar_${index}`,
                    title: `${cita.servicio_nombre}`.substring(0, 24),
                    description: `${fechaFormateada} - ${cita.hora}`
                };
            });
            
            this.procesosCancelacion.set(userId, {
                paso: 'seleccion',
                citas: citasFuturas
            });
            
            await this.whatsappAPI.sendList(
                userId,
                mensaje + '_Selecciona la cita que deseas cancelar:_',
                'Seleccionar Cita',
                [{
                    title: 'Citas Pendientes',
                    rows: rows
                }]
            );
            
        } catch (error) {
            console.error('Error iniciando cancelación:', error);
            await this.whatsappAPI.sendText(
                userId,
                'Ocurrió un error. Por favor intenta de nuevo.'
            );
        }
    }

    async procesarCancelacion(userId, texto, clienteId) {
        const proceso = this.procesosCancelacion.get(userId);
        const textoNormalizado = this.normalizarTexto(texto);
        
        if (textoNormalizado === 'menu' || textoNormalizado === 'cancelar') {
            this.procesosCancelacion.delete(userId);
            await this.mostrarMenuPrincipal(userId);
            return;
        }
        
        try {
            // PASO 1: Selección de cita
            if (proceso.paso === 'seleccion') {
                let citaSeleccionada = null;
                
                if (texto.startsWith('cancelar_')) {
                    const index = parseInt(texto.replace('cancelar_', ''));
                    citaSeleccionada = proceso.citas[index];
                } else {
                    const numero = parseInt(texto);
                    if (!isNaN(numero) && numero > 0 && numero <= proceso.citas.length) {
                        citaSeleccionada = proceso.citas[numero - 1];
                    }
                }
                
                if (!citaSeleccionada) {
                    await this.whatsappAPI.sendText(
                        userId,
                        '❌ Selección no válida. Por favor elige una cita de la lista.'
                    );
                    return;
                }
                
                proceso.citaSeleccionada = citaSeleccionada;
                proceso.paso = 'confirmar';
                this.procesosCancelacion.set(userId, proceso);
                
                const fecha = new Date(citaSeleccionada.fecha + 'T00:00:00');
                const fechaFormateada = fecha.toLocaleDateString('es-CR', {
                    weekday: 'long',
                    day: '2-digit',
                    month: 'long'
                });
                
                await this.whatsappAPI.sendButtons(
                    userId,
                    `⚠️ ¿Estás seguro de cancelar esta cita?\n\n` +
                    `📅 ${fechaFormateada}\n` +
                    `🕐 ${citaSeleccionada.hora}\n` +
                    `📋 ${citaSeleccionada.servicio_nombre}`,
                    [
                        { id: 'confirmar_si', title: '✅ Sí, cancelar' },
                        { id: 'confirmar_no', title: '❌ No, volver' }
                    ],
                    'Confirmar cancelación'
                );
                
                return;
            }
            
            // PASO 2: Confirmar cancelación
            if (proceso.paso === 'confirmar') {
                if (texto === 'confirmar_si' || textoNormalizado === 'si' || textoNormalizado === 'sí') {
                    await this.dbManager.cancelarCita(proceso.citaSeleccionada.id, 'Cancelada por el cliente desde WhatsApp');
                    
                    await this.whatsappAPI.sendText(
                        userId,
                        `✅ *CITA CANCELADA*\n\n` +
                        `Tu cita ha sido cancelada exitosamente.\n\n` +
                        `Si deseas agendar nuevamente, escribe *AGENDAR*\n\n` +
                        `Escribe *MENU* para volver al inicio.`
                    );
                    
                    // Notificar al asesor
                    await this.notificarAsesorCancelacion(userId, proceso.citaSeleccionada);
                    
                    this.procesosCancelacion.delete(userId);
                } else {
                    this.procesosCancelacion.delete(userId);
                    await this.whatsappAPI.sendText(
                        userId,
                        'Cancelación abortada. Tu cita sigue activa.\n\n' +
                        'Escribe *MENU* para volver al inicio.'
                    );
                }
            }
            
        } catch (error) {
            console.error('Error procesando cancelación:', error);
            await this.whatsappAPI.sendText(
                userId,
                'Ocurrió un error al cancelar la cita. Por favor intenta de nuevo.'
            );
            this.procesosCancelacion.delete(userId);
        }
    }

    // ========== REAGENDAR CITA ==========
    
    async iniciarReagendamiento(userId, clienteId) {
        try {
            const citasFuturas = await this.dbManager.getCitasFuturasByCliente(clienteId);
            
            if (citasFuturas.length === 0) {
                await this.whatsappAPI.sendText(
                    userId,
                    '📅 No tienes citas pendientes para reagendar.\n\n' +
                    'Escribe *MENU* para ver otras opciones.'
                );
                return;
            }
            
            let mensaje = '🔄 *REAGENDAR CITA*\n\n';
            mensaje += 'Tus citas pendientes:\n\n';
            
            const rows = citasFuturas.map((cita, index) => {
                const fecha = new Date(cita.fecha + 'T00:00:00');
                const fechaFormateada = fecha.toLocaleDateString('es-CR', {
                    day: '2-digit',
                    month: 'short'
                });
                return {
                    id: `reagendar_${index}`,
                    title: cita.servicio_nombre.substring(0, 24),
                    description: `${fechaFormateada} - ${cita.hora}`
                };
            });
            
            this.procesosReagendamiento.set(userId, {
                paso: 'seleccion',
                citas: citasFuturas
            });
            
            await this.whatsappAPI.sendList(
                userId,
                mensaje + '_Selecciona la cita que deseas cambiar:_',
                'Seleccionar Cita',
                [{
                    title: 'Citas Pendientes',
                    rows: rows
                }]
            );
            
        } catch (error) {
            console.error('Error iniciando reagendamiento:', error);
            await this.whatsappAPI.sendText(
                userId,
                'Ocurrió un error. Por favor intenta de nuevo.'
            );
        }
    }

    async procesarReagendamiento(userId, texto, clienteId) {
        const proceso = this.procesosReagendamiento.get(userId);
        const textoNormalizado = this.normalizarTexto(texto);
        
        if (textoNormalizado === 'menu' || textoNormalizado === 'cancelar') {
            this.procesosReagendamiento.delete(userId);
            await this.mostrarMenuPrincipal(userId);
            return;
        }
        
        try {
            // PASO 1: Selección de cita
            if (proceso.paso === 'seleccion') {
                let citaSeleccionada = null;
                
                if (texto.startsWith('reagendar_')) {
                    const index = parseInt(texto.replace('reagendar_', ''));
                    citaSeleccionada = proceso.citas[index];
                } else {
                    const numero = parseInt(texto);
                    if (!isNaN(numero) && numero > 0 && numero <= proceso.citas.length) {
                        citaSeleccionada = proceso.citas[numero - 1];
                    }
                }
                
                if (!citaSeleccionada) {
                    await this.whatsappAPI.sendText(
                        userId,
                        '❌ Selección no válida. Por favor elige una cita de la lista.'
                    );
                    return;
                }
                
                proceso.citaSeleccionada = citaSeleccionada;
                proceso.paso = 'nueva_fecha';
                this.procesosReagendamiento.set(userId, proceso);
                
                const diasDisponibles = await this.obtenerDiasSemana();
                
                if (diasDisponibles.length === 0) {
                    await this.whatsappAPI.sendText(
                        userId,
                        '❌ Lo sentimos, no hay fechas disponibles en este momento.'
                    );
                    this.procesosReagendamiento.delete(userId);
                    return;
                }
                
                proceso.diasDisponibles = diasDisponibles;
                this.procesosReagendamiento.set(userId, proceso);
                
                const rows = diasDisponibles.map((dia, index) => ({
                    id: `rfecha_${index}`,
                    title: dia.nombre,
                    description: dia.fecha
                }));
                
                await this.whatsappAPI.sendList(
                    userId,
                    '📅 Selecciona la nueva fecha:',
                    'Ver Fechas',
                    [{
                        title: 'Fechas Disponibles',
                        rows: rows
                    }]
                );
                
                return;
            }
            
            // PASO 2: Nueva fecha
            if (proceso.paso === 'nueva_fecha') {
                let diaSeleccionado = null;
                
                if (texto.startsWith('rfecha_')) {
                    const index = parseInt(texto.replace('rfecha_', ''));
                    diaSeleccionado = proceso.diasDisponibles[index];
                } else {
                    const numero = parseInt(texto);
                    if (!isNaN(numero) && numero > 0 && numero <= proceso.diasDisponibles.length) {
                        diaSeleccionado = proceso.diasDisponibles[numero - 1];
                    }
                }
                
                if (!diaSeleccionado) {
                    await this.whatsappAPI.sendText(
                        userId,
                        '❌ Fecha no válida. Por favor selecciona una de las opciones.'
                    );
                    return;
                }
                
                proceso.nuevaFecha = diaSeleccionado.fecha;
                proceso.nombreDia = diaSeleccionado.nombre;
                proceso.paso = 'nueva_hora';
                this.procesosReagendamiento.set(userId, proceso);
                
                const horariosDisponibles = await this.obtenerHorariosDisponibles(
                    diaSeleccionado.nombre.toLowerCase(),
                    diaSeleccionado.fecha
                );
                
                if (horariosDisponibles.length === 0) {
                    await this.whatsappAPI.sendText(
                        userId,
                        `❌ No hay horarios disponibles para ${diaSeleccionado.nombre}.`
                    );
                    proceso.paso = 'nueva_fecha';
                    this.procesosReagendamiento.set(userId, proceso);
                    return;
                }
                
                proceso.horariosDisponibles = horariosDisponibles;
                this.procesosReagendamiento.set(userId, proceso);
                
                const rows = horariosDisponibles.map((hora, index) => ({
                    id: `rhora_${index}`,
                    title: hora,
                    description: 'Disponible'
                }));
                
                await this.whatsappAPI.sendList(
                    userId,
                    `🕐 Horarios disponibles para ${diaSeleccionado.nombre}:`,
                    'Ver Horarios',
                    [{
                        title: 'Horarios Disponibles',
                        rows: rows
                    }]
                );
                
                return;
            }
            
            // PASO 3: Nueva hora y confirmar
            if (proceso.paso === 'nueva_hora') {
                let horaSeleccionada = null;
                
                if (texto.startsWith('rhora_')) {
                    const index = parseInt(texto.replace('rhora_', ''));
                    horaSeleccionada = proceso.horariosDisponibles[index];
                } else {
                    const numero = parseInt(texto);
                    if (!isNaN(numero) && numero > 0 && numero <= proceso.horariosDisponibles.length) {
                        horaSeleccionada = proceso.horariosDisponibles[numero - 1];
                    }
                }
                
                if (!horaSeleccionada) {
                    await this.whatsappAPI.sendText(
                        userId,
                        '❌ Horario no válido. Por favor selecciona uno de las opciones.'
                    );
                    return;
                }
                
                // Verificar disponibilidad
                const disponible = await this.dbManager.isHorarioDisponible(
                    proceso.nuevaFecha,
                    horaSeleccionada
                );
                
                if (!disponible) {
                    await this.whatsappAPI.sendText(
                        userId,
                        '❌ Lo sentimos, ese horario acaba de ser reservado.'
                    );
                    this.procesosReagendamiento.delete(userId);
                    return;
                }
                
                // Actualizar cita
                await this.dbManager.updateCita(proceso.citaSeleccionada.id, {
                    fecha: proceso.nuevaFecha,
                    hora: horaSeleccionada,
                    notas: 'Reagendada por cliente desde WhatsApp'
                });
                
                await this.whatsappAPI.sendText(
                    userId,
                    `✅ *CITA REAGENDADA*\n\n` +
                    `📅 Nueva fecha: ${proceso.nombreDia} ${proceso.nuevaFecha}\n` +
                    `🕐 Nueva hora: ${horaSeleccionada}\n` +
                    `📋 Servicio: ${proceso.citaSeleccionada.servicio_nombre}\n\n` +
                    `Tu cita ha sido reagendada exitosamente.\n\n` +
                    `Escribe *MENU* para volver al inicio.`
                );
                
                // Notificar al asesor
                await this.notificarAsesorReagendamiento(userId, proceso, horaSeleccionada);
                
                this.procesosReagendamiento.delete(userId);
            }
            
        } catch (error) {
            console.error('Error procesando reagendamiento:', error);
            await this.whatsappAPI.sendText(
                userId,
                'Ocurrió un error al reagendar. Por favor intenta de nuevo.'
            );
            this.procesosReagendamiento.delete(userId);
        }
    }

    // ========== CONTACTAR ASESOR ==========
    
    async conectarConAsesor(userId) {
        const numeroAsesor = this.config.numeroAsesor;
        
        if (!numeroAsesor) {
            await this.whatsappAPI.sendText(
                userId,
                '⚠️ Lo sentimos, no tenemos un número de asesor configurado en este momento.\n\n' +
                'Escribe *MENU* para ver otras opciones.'
            );
            return;
        }
        
        await this.whatsappAPI.sendText(
            userId,
            `👤 *CONTACTAR ASESOR*\n\n` +
            `Puedes comunicarte con nuestro asesor al siguiente número:\n\n` +
            `📱 ${numeroAsesor}\n\n` +
            `_También puedes escribirle directamente por este medio y te responderá lo antes posible._\n\n` +
            `Escribe *MENU* para volver al inicio.`
        );
    }

    async procesarContactoAsesor(userId, texto) {
        // Este método se puede usar para reenviar mensajes al asesor
        // Por ahora solo informamos
        await this.whatsappAPI.sendText(
            userId,
            '✅ Tu mensaje ha sido enviado a nuestro asesor.\n' +
            'Te responderemos lo antes posible.\n\n' +
            'Escribe *MENU* para volver al inicio.'
        );
        
        this.procesosContactoAsesor.delete(userId);
    }

    // ========== NOTIFICACIONES AL ASESOR ==========
    
    async notificarAsesorNuevaCita(userId, proceso, hora) {
        try {
            const numeroAsesor = this.config.numeroAsesor;
            if (!numeroAsesor) return;
            
            const cliente = await this.dbManager.getOrCreateCliente(userId);
            
            await this.whatsappAPI.sendText(
                numeroAsesor,
                `🆕 *NUEVA CITA AGENDADA*\n\n` +
                `👤 Cliente: ${cliente.nombre || 'Sin nombre'}\n` +
                `📱 Tel: ${cliente.telefono}\n` +
                `📅 Fecha: ${proceso.nombreDia} ${proceso.fechaSeleccionada}\n` +
                `🕐 Hora: ${hora}\n` +
                `📋 Servicio: ${proceso.servicioSeleccionado.nombre}\n\n` +
                `_Agendada desde WhatsApp Cloud API_`
            );
        } catch (error) {
            console.error('⚠️ Error notificando asesor nueva cita:', error);
        }
    }

    async notificarAsesorCancelacion(userId, cita) {
        try {
            const numeroAsesor = this.config.numeroAsesor;
            if (!numeroAsesor) return;
            
            const cliente = await this.dbManager.getOrCreateCliente(userId);
            const fecha = new Date(cita.fecha + 'T00:00:00');
            const fechaFormateada = fecha.toLocaleDateString('es-CR', {
                weekday: 'long',
                day: '2-digit',
                month: 'long'
            });
            
            await this.whatsappAPI.sendText(
                numeroAsesor,
                `❌ *CITA CANCELADA*\n\n` +
                `👤 Cliente: ${cliente.nombre || 'Sin nombre'}\n` +
                `📱 Tel: ${cliente.telefono}\n` +
                `📅 Fecha: ${fechaFormateada}\n` +
                `🕐 Hora: ${cita.hora}\n` +
                `📋 Servicio: ${cita.servicio_nombre}\n\n` +
                `_Cancelada por el cliente desde WhatsApp_`
            );
        } catch (error) {
            console.error('⚠️ Error notificando asesor cancelación:', error);
        }
    }

    async notificarAsesorReagendamiento(userId, proceso, nuevaHora) {
        try {
            const numeroAsesor = this.config.numeroAsesor;
            if (!numeroAsesor) return;
            
            const cliente = await this.dbManager.getOrCreateCliente(userId);
            const fechaAnterior = new Date(proceso.citaSeleccionada.fecha + 'T00:00:00');
            const fechaAnteriorFormateada = fechaAnterior.toLocaleDateString('es-CR', {
                weekday: 'long',
                day: '2-digit',
                month: 'long'
            });
            
            await this.whatsappAPI.sendText(
                numeroAsesor,
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
                `_Reagendada por el cliente desde WhatsApp_`
            );
        } catch (error) {
            console.error('⚠️ Error notificando asesor reagendamiento:', error);
        }
    }

    // ========== FUNCIONES AUXILIARES ==========
    
    async obtenerDiasSemana() {
        const dias = [];
        const hoy = new Date();
        const diasSemana = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
        const nombresCompletos = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        
        for (let i = 0; i < 14; i++) {
            const fecha = new Date(hoy);
            fecha.setDate(hoy.getDate() + i);
            
            const diaSemana = diasSemana[fecha.getDay()];
            const horarios = await this.dbManager.getHorariosByDia(diaSemana);
            
            if (horarios.length > 0) {
                dias.push({
                    fecha: fecha.toISOString().split('T')[0],
                    nombre: nombresCompletos[fecha.getDay()],
                    diaSemana: diaSemana
                });
            }
        }
        
        return dias;
    }

    async obtenerHorariosDisponibles(diaSemana, fecha) {
        return await this.dbManager.getHorariosDisponiblesPorFecha(fecha, diaSemana);
    }

    normalizarTexto(texto) {
        return texto.toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
    }

    esSaludoOPrimerMensaje(textoNormalizado) {
        const saludos = [
            'hola', 'buenas', 'buenos dias', 'buen dia', 'buenas tardes',
            'buenas noches', 'que tal', 'hey', 'holi', 'saludos'
        ];
        return saludos.some(saludo => textoNormalizado.includes(saludo));
    }

    async registrarActividad(userId) {
        this.usuariosActivos.add(userId);
        
        // Limpiar timer anterior si existe
        if (this.timersReactivacion.has(userId)) {
            clearTimeout(this.timersReactivacion.get(userId));
        }
        
        // Nuevo timer de 30 minutos
        const timer = setTimeout(() => {
            this.usuariosActivos.delete(userId);
            this.timersReactivacion.delete(userId);
        }, 30 * 60 * 1000);
        
        this.timersReactivacion.set(userId, timer);
    }

    limpiarProcesos(userId) {
        this.procesosAgendamiento.delete(userId);
        this.procesosCancelacion.delete(userId);
        this.procesosReagendamiento.delete(userId);
        this.procesosContactoAsesor.delete(userId);
        this.usuariosEnCatalogo.delete(userId);
    }

    async procesarCatalogo(userId, texto) {
        // Implementación futura para catálogo de productos
        await this.whatsappAPI.sendText(
            userId,
            'Catálogo en desarrollo.\n\n' +
            'Escribe *MENU* para volver al inicio.'
        );
        this.usuariosEnCatalogo.delete(userId);
    }

    // Método para limpiar recursos
    cleanup() {
        this.timersReactivacion.forEach(timer => clearTimeout(timer));
        this.timersReactivacion.clear();
        this.usuariosActivos.clear();
        this.procesosAgendamiento.clear();
        this.procesosCancelacion.clear();
        this.procesosReagendamiento.clear();
        this.procesosContactoAsesor.clear();
        this.usuariosEnCatalogo.clear();
        console.log(`🧹 BotController limpiado para ${this.clienteInfo.nombre_negocio}`);
    }
}

module.exports = BotControllerCloud;

module.exports = {
    // ===== INFORMACIÓN DEL NEGOCIO =====
    nombreNegocio: "Consultorio MR & ASOCIADOS",
    telefono: "+50660640392",
    email: "ethelmaricela@gmail.com",
    
    // ===== HORARIOS (para mostrar al cliente) =====
    horarios: {
        lunesViernes: "9:00 AM - 5:00 PM",
        sabado: "9:00 AM - 2:00 PM",
        domingo: "Cerrado"
    },
    
    // ===== 🕐 HORARIO INTELIGENTE =====
    horarioInteligente: {
        activo: true,
        horarios: {
            lunesViernes: {
                apertura: "09:00",
                cierre: "17:00",
                cerrado: false
            },
            sabado: {
                apertura: "09:00",
                cierre: "14:00",
                cerrado: false
            },
            domingo: {
                apertura: "00:00",
                cierre: "00:00",
                cerrado: true
            }
        },
        zonaHoraria: "America/Costa_Rica"
    },
    
    // ===== UBICACIÓN =====
    direccion: "Barrio Chorotega, Nicoya #123, Guanacaste, Costa Rica",
    linkMapa: "https://maps.app.goo.gl/pebBpG8ggnpZy1187",
    
    // ===== MENSAJES PERSONALIZADOS =====
    mensajeBienvenida: "¡Hola! Soy el asistente virtual de {negocio}. ¿En qué puedo ayudarte hoy?",
    mensajeFueraHorario: "Actualmente estamos fuera de horario. Te responderemos en cuanto abramos.",
    
    // ===== WHATSAPP DE CONTACTO HUMANO =====
    numeroAsesor: "+50684784921",
    
    // ===== OPCIONES DEL MENÚ =====
    opciones: {
        verServicios: true,
        precios: false,
        agendar: true,
        ubicacion: true,
        horarios: true,
        faq: true
    }
};
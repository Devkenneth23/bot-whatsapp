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
    
    // ===== 🕐 HORARIO INTELIGENTE (nuevo sistema automático) =====
    horarioInteligente: {
        activo: true, // Cambiar a false para desactivar y que funcione 24/7
        
        // Horarios en formato 24h (HH:MM)
        horarios: {
            lunesViernes: {
                apertura: "09:00",
                cierre: "17:00", // 5:00 PM
                cerrado: false
            },
            sabado: {
                apertura: "09:00",
                cierre: "14:00", // 2:00 PM
                cerrado: false
            },
            domingo: {
                apertura: "00:00",
                cierre: "00:00",
                cerrado: true // Cerrado todo el día
            }
        },
        
        // Zona horaria (importante para servidores en otros países)
        zonaHoraria: "America/Costa_Rica"
    },
    
    // ===== UBICACIÓN =====
    direccion: "Barrio Chorotega, Nicoya #123, Guanacaste, Costa Rica",
    linkMapa: "https://maps.google.com/?q=tu-ubicacion", // Reemplazar con link real
    
    // ===== MENSAJES PERSONALIZADOS =====
    mensajeBienvenida: "¡Hola! Soy el asistente virtual de {negocio}. ¿En qué puedo ayudarte hoy?",
    
    mensajeFueraHorario: "Actualmente estamos fuera de horario. Te responderemos en cuanto abramos. Horario: {horarios}",
    
    // ===== WHATSAPP DE CONTACTO HUMANO =====
    numeroAsesor: "+50684784921",
    
    // ===== OPCIONES DEL MENÚ =====
    // Puedes activar/desactivar opciones cambiando true/false
    opciones: {
        verServicios: true,      // Mostrar catálogo/servicios
        agendar: true,           // Agendar cita
        ubicacion: true,         // Mostrar ubicación
        horarios: true,          // Mostrar horarios
        faq: true                // Preguntas frecuentes
    }
};
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const DatabaseManager = require("./database/database");

// Instancia global del controlador del bot
let botController = null;
const BotController = require("./bot-controller");

// Servicio de recordatorios automáticos
const ReminderService = require("./reminder-service");
let reminderService = null;

// Servicio de backup automático
const BackupService = require("./backup-service");
let backupService = null;

const rateLimit = require("express-rate-limit");
const helmet = require("helmet");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "cambiar_esto";

const db = new DatabaseManager();

// ===== SISTEMA DE SEGURIDAD =====

// Rate limiter para login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // máximo 5 intentos
  skipSuccessfulRequests: true,
  handler: (req, res) => {
    const bloqueadoHasta = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    console.log(`⚠️ Rate limit excedido para IP: ${req.ip}`);
    res.status(429).json({
      error: "Demasiados intentos de inicio de sesión",
      bloqueadoHasta: bloqueadoHasta,
      remainingAttempts: 0,
    });
  },
});

// Tracking de intentos fallidos
const failedLoginAttempts = new Map();

const trackFailedLogin = (ip) => {
  const now = Date.now();
  const record = failedLoginAttempts.get(ip) || { count: 0, timestamp: now };

  if (now - record.timestamp > 15 * 60 * 1000) {
    record.count = 0;
    record.timestamp = now;
  }

  record.count++;
  record.timestamp = now;
  failedLoginAttempts.set(ip, record);

  return {
    attempts: record.count,
    remainingAttempts: Math.max(0, 5 - record.count),
  };
};

const resetFailedLogins = (ip) => {
  failedLoginAttempts.delete(ip);
};

// Validación anti SQL Injection
const validateInput = (input) => {
  if (typeof input !== "string") return false;
  const dangerousPatterns = [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)\b)/gi,
    /(--|;|\/\*|\*\/)/gi,
    /('|(\\'))/gi,
    /<script/gi,
    /javascript:/gi,
  ];
  for (let pattern of dangerousPatterns) {
    if (pattern.test(input)) return false;
  }
  return true;
};

const sanitizeInput = (input) => {
  if (typeof input !== "string") return "";
  return input.trim().substring(0, 100);
};

// Configurar Helmet (DESPUÉS de crear app)
app.use(
  helmet({
    contentSecurityPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
    },
  })
);

// Configurar multer para subir imágenes
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = "./public/uploads/servicios";
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, "servicio-" + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB máximo
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error("Solo se permiten imágenes (jpg, png, gif, webp)"));
    }
  },
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));
app.use("/uploads", (req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Cross-Origin-Resource-Policy", "cross-origin");
  next();
}, express.static(path.join(__dirname, "uploads")));

// Servir archivos estáticos (imágenes)

// ===== ENDPOINT DE LOGIN SEGURO =====
app.post("/api/auth/login", loginLimiter, async (req, res) => {
  const ip = req.ip || req.connection.remoteAddress;

  try {
    const { username, password } = req.body;

    // Validación básica
    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "Usuario y contraseña son requeridos" });
    }

    // Validación de tipos
    if (typeof username !== "string" || typeof password !== "string") {
      console.log(`⚠️ Tipos inválidos desde IP: ${ip}`);
      return res.status(400).json({ error: "Datos inválidos" });
    }

    // Validación de longitud
    if (username.length > 50 || password.length > 100) {
      console.log(`⚠️ Credenciales muy largas desde IP: ${ip}`);
      return res
        .status(400)
        .json({ error: "Credenciales exceden longitud máxima" });
    }

    // Detección SQL Injection
    if (!validateInput(username)) {
      console.log(
        `🚨 SQL Injection detectado desde IP: ${ip} - Username: ${username}`
      );
      const failInfo = trackFailedLogin(ip);
      return res.status(400).json({
        error: "Caracteres no permitidos detectados",
        remainingAttempts: failInfo.remainingAttempts,
      });
    }

    // Sanitizar
    const cleanUsername = sanitizeInput(username);

    // Buscar usuario
    const user = await db.get(
      "SELECT * FROM usuarios_panel WHERE username = ? AND activo = 1",
      [cleanUsername]
    );

    if (!user) {
      console.log(`❌ Usuario no existe: ${cleanUsername} desde IP: ${ip}`);
      const failInfo = trackFailedLogin(ip);
      return res.status(401).json({
        error: "Credenciales incorrectas",
        remainingAttempts: failInfo.remainingAttempts,
      });
    }

    // Verificar contraseña
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      console.log(
        `❌ Contraseña incorrecta para: ${cleanUsername} desde IP: ${ip}`
      );
      const failInfo = trackFailedLogin(ip);
      return res.status(401).json({
        error: "Credenciales incorrectas",
        remainingAttempts: failInfo.remainingAttempts,
      });
    }

    // LOGIN EXITOSO
    console.log(`✅ Login exitoso: ${user.username} desde IP: ${ip}`);
    resetFailedLogins(ip);

    // Generar token
    const token = jwt.sign(
      { id: user.id, username: user.username, rol: user.rol },
      JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        nombre_completo: user.nombre_completo,
        email: user.email,
        rol: user.rol,
      },
    });
  } catch (error) {
    console.error("❌ Error en login:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

// Middleware de autenticación
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ error: "Token no proporcionado" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Token inválido" });
  }
};

// ===== RUTAS PÚBLICAS =====

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

// Dashboard
app.get("/api/dashboard/stats", authMiddleware, async (req, res) => {
  try {
    const stats = await db.getDashboardStats();
    res.json(stats);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Error al obtener estadísticas" });
  }
});

// SERVICIOS
app.get("/api/servicios", authMiddleware, async (req, res) => {
  try {
    const servicios = await db.getAllServicios();
    res.json(servicios);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener servicios" });
  }
});

// Crear servicio CON imagen
app.post(
  "/api/servicios",
  authMiddleware,
  upload.single("imagen"),
  async (req, res) => {
    try {
      const { nombre, precio, descripcion } = req.body;

      if (!nombre || !precio) {
        return res.status(400).json({ error: "Nombre y precio requeridos" });
      }

      // Si se subió imagen, guardar la ruta
      const imagenPath = req.file
        ? `/uploads/servicios/${req.file.filename}`
        : req.body.imagenUrl || null;

      const id = await db.createServicio({
        nombre,
        precio,
        descripcion,
        imagen: imagenPath,
      });

      res
        .status(201)
        .json({ id, message: "Servicio creado", imagen: imagenPath });
    } catch (error) {
      console.error("Error creando servicio:", error);
      res.status(500).json({ error: "Error al crear servicio" });
    }
  }
);

// Actualizar servicio CON imagen
app.put(
  "/api/servicios/:id",
  authMiddleware,
  upload.single("imagen"),
  async (req, res) => {
    try {
      const { nombre, precio, descripcion } = req.body;

      // Si se subió nueva imagen
      let imagenPath = req.body.imagenUrl || null;
      if (req.file) {
        imagenPath = `/uploads/servicios/${req.file.filename}`;

        // Eliminar imagen anterior si existe
        const servicioAnterior = await db.getServicioById(req.params.id);
        if (
          servicioAnterior &&
          servicioAnterior.imagen &&
          servicioAnterior.imagen.startsWith("/uploads/")
        ) {
          const oldPath = path.join(
            __dirname,
            "public",
            servicioAnterior.imagen
          );
          if (fs.existsSync(oldPath)) {
            fs.unlinkSync(oldPath);
          }
        }
      }

      await db.updateServicio(req.params.id, {
        nombre,
        precio,
        descripcion,
        imagen: imagenPath,
      });
      res.json({ message: "Servicio actualizado", imagen: imagenPath });
    } catch (error) {
      console.error("Error actualizando servicio:", error);
      res.status(500).json({ error: "Error al actualizar" });
    }
  }
);

app.delete("/api/servicios/:id", authMiddleware, async (req, res) => {
  try {
    // Eliminar imagen si existe
    const servicio = await db.getServicioById(req.params.id);
    if (
      servicio &&
      servicio.imagen &&
      servicio.imagen.startsWith("/uploads/")
    ) {
      const imagePath = path.join(__dirname, "public", servicio.imagen);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    await db.deleteServicio(req.params.id);
    res.json({ message: "Servicio eliminado" });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar" });
  }
});

// CITAS
app.get("/api/citas", authMiddleware, async (req, res) => {
  try {
    const { estado, fecha, limit = 100, offset = 0 } = req.query;

    let citas;
    if (estado) {
      citas = await db.getCitasByEstado(estado);
    } else if (fecha) {
      citas = await db.getCitasByFecha(fecha);
    } else {
      citas = await db.getAllCitas(parseInt(limit), parseInt(offset));
    }

    res.json(citas);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener citas" });
  }
});

// Endpoint para obtener citas nuevas (notificaciones push)
// IMPORTANTE: Debe ir ANTES de /api/citas/:id
app.get("/api/citas/nuevas", authMiddleware, async (req, res) => {
  try {
    // Obtener citas creadas en los últimos 60 segundos usando tiempo SQL directo
    const nuevasCitas = await new Promise((resolve, reject) => {
      db.db.all(
        `
        SELECT 
          c.*,
          cl.nombre as cliente_nombre,
          cl.telefono as cliente_telefono,
          s.nombre as servicio_nombre
        FROM citas c
        LEFT JOIN clientes cl ON c.cliente_id = cl.id
        LEFT JOIN servicios s ON c.servicio_id = s.id
        WHERE c.estado = 'pendiente'
        AND (strftime('%s', 'now') - strftime('%s', c.created_at)) <= 60
        ORDER BY c.created_at DESC
        LIMIT 10
      `,
        [],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });

    res.json({ nuevasCitas });
  } catch (error) {
    console.error("Error obteniendo citas nuevas:", error);
    res
      .status(500)
      .json({ error: "Error al obtener citas nuevas", nuevasCitas: [] });
  }
});

app.get("/api/citas/:id", authMiddleware, async (req, res) => {
  try {
    const cita = await db.getCitaById(req.params.id);
    if (!cita) {
      return res.status(404).json({ error: "Cita no encontrada" });
    }
    res.json(cita);
  } catch (error) {
    res.status(500).json({ error: "Error" });
  }
});

app.put("/api/citas/:id/estado", authMiddleware, async (req, res) => {
  try {
    const { estado } = req.body;

    if (!["confirmada", "completada", "cancelada"].includes(estado)) {
      return res.status(400).json({ error: "Estado inválido" });
    }

    await db.updateCitaEstado(req.params.id, estado);
    res.json({ message: "Estado actualizado" });
  } catch (error) {
    res.status(500).json({ error: "Error al actualizar" });
  }
});

app.delete("/api/citas/:id", authMiddleware, async (req, res) => {
  try {
    await db.deleteCita(req.params.id);
    res.json({ message: "Cita eliminada" });
  } catch (error) {
    res.status(500).json({ error: "Error" });
  }
});

// CLIENTES
app.get("/api/clientes", authMiddleware, async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const clientes = await db.getAllClientes(parseInt(limit), parseInt(offset));
    res.json(clientes);
  } catch (error) {
    res.status(500).json({ error: "Error" });
  }
});

app.get(
  "/api/clientes/:id/conversaciones",
  authMiddleware,
  async (req, res) => {
    try {
      const { limit = 50 } = req.query;
      const conversaciones = await db.getConversacionesByCliente(
        req.params.id,
        parseInt(limit)
      );
      res.json(conversaciones);
    } catch (error) {
      res.status(500).json({ error: "Error" });
    }
  }
);

// ===== ENDPOINT PARA ELIMINAR CLIENTE =====

app.delete("/api/clientes/:id", authMiddleware, async (req, res) => {
  try {
    const clienteId = parseInt(req.params.id);

    // Verificar que el cliente existe
    const cliente = await db.getClienteById(clienteId);
    if (!cliente) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    // Eliminar en cascada:
    // 1. Eliminar todas las conversaciones del cliente
    await db.run("DELETE FROM conversaciones WHERE cliente_id = ?", [
      clienteId,
    ]);

    // 2. Eliminar todas las citas del cliente
    await db.run("DELETE FROM citas WHERE cliente_id = ?", [clienteId]);

    // 3. Eliminar el cliente
    await db.run("DELETE FROM clientes WHERE id = ?", [clienteId]);

    console.log(
      `🗑️ Cliente eliminado: ID ${clienteId} - ${
        cliente.nombre || "Sin nombre"
      }`
    );

    res.json({
      success: true,
      message: "Cliente eliminado correctamente",
      clienteId: clienteId,
    });
  } catch (error) {
    console.error("❌ Error eliminando cliente:", error);
    res.status(500).json({ error: "Error al eliminar cliente" });
  }
});
// HORARIOS
app.get("/api/horarios", authMiddleware, async (req, res) => {
  try {
    const { dia } = req.query;

    let horarios;
    if (dia) {
      horarios = await db.getHorariosByDia(dia);
    } else {
      horarios = await db.getAllHorarios();
    }

    res.json(horarios);
  } catch (error) {
    res.status(500).json({ error: "Error" });
  }
});

// ESTADÍSTICAS
app.get("/api/estadisticas", authMiddleware, async (req, res) => {
  try {
    const { fecha_inicio, fecha_fin } = req.query;

    let stats;
    if (fecha_inicio && fecha_fin) {
      stats = await db.getEstadisticasRango(fecha_inicio, fecha_fin);
    } else {
      stats = await db.getEstadisticasHoy();
    }

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: "Error" });
  }
});

// CONFIGURACIÓN

// Obtener configuración general
app.get("/api/config", authMiddleware, async (req, res) => {
  try {
    delete require.cache[require.resolve("./config")];
    const config = require("./config");
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener configuración" });
  }
});

// Actualizar configuración general
app.put("/api/config", authMiddleware, async (req, res) => {
  try {
    const fs = require("fs");
    const path = require("path");
    const configPath = path.join(__dirname, "config.js");

    const {
      nombreNegocio,
      telefono,
      email,
      direccion,
      linkMapa,
      mensajeBienvenida,
      numeroAsesor,
      horarios,
      opciones,
    } = req.body;

    const newConfig = `module.exports = {
    // ===== INFORMACIÓN DEL NEGOCIO =====
    nombreNegocio: "${nombreNegocio}",
    telefono: "${telefono}",
    email: "${email}",
    
    // ===== HORARIOS (para mostrar al cliente) =====
    horarios: {
        lunesViernes: "${horarios.lunesViernes}",
        sabado: "${horarios.sabado}",
        domingo: "${horarios.domingo}"
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
    direccion: "${direccion}",
    linkMapa: "${linkMapa}",
    
    // ===== MENSAJES PERSONALIZADOS =====
    mensajeBienvenida: "${mensajeBienvenida}",
    mensajeFueraHorario: "Actualmente estamos fuera de horario. Te responderemos en cuanto abramos.",
    
    // ===== WHATSAPP DE CONTACTO HUMANO =====
    numeroAsesor: "${numeroAsesor}",
    
    // ===== OPCIONES DEL MENÚ =====
    opciones: {
        verServicios: ${opciones.verServicios},
        precios: ${opciones.precios || false},
        agendar: ${opciones.agendar},
        ubicacion: ${opciones.ubicacion},
        horarios: ${opciones.horarios},
        faq: ${opciones.faq}
    }
};`;

    // Guardar archivo
    fs.writeFileSync(configPath, newConfig, "utf8");

    // Limpiar cache
    delete require.cache[require.resolve("./config")];

    // Reiniciar bot automáticamente si está corriendo
    if (botController && botController.isRunning) {
      console.log("🔄 Reiniciando bot con nueva configuración...");
      await botController.restart();
      res.json({
        message: "Configuración actualizada y bot reiniciado automáticamente",
        botRestarted: true,
      });
    } else {
      res.json({
        message: "Configuración actualizada correctamente",
        botRestarted: false,
        note: "Inicia el bot para aplicar los cambios",
      });
    }
  } catch (error) {
    console.error("Error actualizando config:", error);
    res.status(500).json({ error: "Error al actualizar configuración" });
  }
});

// ===== HORARIOS =====
app.get("/api/config/horarios", authMiddleware, async (req, res) => {
  try {
    const horarios = await db.getAllHorarios();
    res.json(horarios);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener horarios" });
  }
});

app.post("/api/config/horarios", authMiddleware, async (req, res) => {
  try {
    console.log("📥 Datos recibidos:", req.body);

    const { dia, hora } = req.body;

    if (!dia || !hora) {
      console.log("❌ Faltan datos:", { dia, hora });
      return res.status(400).json({ error: "Día y hora requeridos" });
    }

    console.log("✅ Creando horario:", { dia, hora });
    const id = await db.createHorario({ dia, hora });

    console.log("✅ Horario creado con ID:", id);
    res.status(201).json({ id, message: "Horario creado" });
  } catch (error) {
    console.error("❌ Error completo:", error);
    console.error("Stack:", error.stack);
    res.status(500).json({ error: "Error al crear horario: " + error.message });
  }
});

app.delete("/api/config/horarios/:id", authMiddleware, async (req, res) => {
  try {
    await db.deleteHorario(req.params.id);
    res.json({ message: "Horario eliminado" });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar horario" });
  }
});

// ===== FAQS =====
app.get("/api/config/faqs", authMiddleware, async (req, res) => {
  try {
    const faqs = await db.getAllFAQs();
    res.json(faqs);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener FAQs" });
  }
});

app.post("/api/config/faqs", authMiddleware, async (req, res) => {
  try {
    const { pregunta, respuesta } = req.body;
    if (!pregunta || !respuesta) {
      return res.status(400).json({ error: "Pregunta y respuesta requeridas" });
    }
    const id = await db.createFAQ({ pregunta, respuesta });
    res.status(201).json({ id, message: "FAQ creada" });
  } catch (error) {
    res.status(500).json({ error: "Error al crear FAQ" });
  }
});

app.put("/api/config/faqs/:id", authMiddleware, async (req, res) => {
  try {
    const { pregunta, respuesta } = req.body;
    await db.updateFAQ(req.params.id, { pregunta, respuesta });
    res.json({ message: "FAQ actualizada" });
  } catch (error) {
    res.status(500).json({ error: "Error al actualizar FAQ" });
  }
});

app.delete("/api/config/faqs/:id", authMiddleware, async (req, res) => {
  try {
    await db.deleteFAQ(req.params.id);
    res.json({ message: "FAQ eliminada" });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar FAQ" });
  }
});

// ===== USUARIOS DEL PANEL =====
app.get("/api/config/usuarios", authMiddleware, async (req, res) => {
  try {
    const usuarios = await db.all(
      "SELECT id, username, nombre_completo, email, rol, activo, created_at FROM usuarios_panel"
    );
    res.json(usuarios);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener usuarios" });
  }
});

app.post("/api/config/usuarios", authMiddleware, async (req, res) => {
  try {
    const { username, password, nombre_completo, email, rol } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Usuario y contraseña requeridos" });
    }

    const existe = await db.get(
      "SELECT id FROM usuarios_panel WHERE username = ?",
      [username]
    );

    if (existe) {
      return res.status(400).json({ error: "El usuario ya existe" });
    }

    const password_hash = bcrypt.hashSync(password, 10);

    const result = await db.run(
      `INSERT INTO usuarios_panel (username, password_hash, nombre_completo, email, rol) 
             VALUES (?, ?, ?, ?, ?)`,
      [username, password_hash, nombre_completo, email, rol || "empleado"]
    );

    res.status(201).json({ id: result.lastID, message: "Usuario creado" });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Error al crear usuario" });
  }
});

app.put("/api/config/usuarios/:id", authMiddleware, async (req, res) => {
  try {
    const { nombre_completo, email, rol, activo, password } = req.body;

    let updates = [];
    let params = [];

    if (nombre_completo !== undefined) {
      updates.push("nombre_completo = ?");
      params.push(nombre_completo);
    }
    if (email !== undefined) {
      updates.push("email = ?");
      params.push(email);
    }
    if (rol !== undefined) {
      updates.push("rol = ?");
      params.push(rol);
    }
    if (activo !== undefined) {
      updates.push("activo = ?");
      params.push(activo ? 1 : 0);
    }
    if (password) {
      updates.push("password_hash = ?");
      params.push(bcrypt.hashSync(password, 10));
    }

    params.push(req.params.id);

    await db.run(
      `UPDATE usuarios_panel SET ${updates.join(", ")} WHERE id = ?`,
      params
    );

    res.json({ message: "Usuario actualizado" });
  } catch (error) {
    res.status(500).json({ error: "Error al actualizar usuario" });
  }
});

app.delete("/api/config/usuarios/:id", authMiddleware, async (req, res) => {
  try {
    if (req.user.id == req.params.id) {
      return res
        .status(400)
        .json({ error: "No puedes eliminar tu propio usuario" });
    }

    await db.run("DELETE FROM usuarios_panel WHERE id = ?", [req.params.id]);
    res.json({ message: "Usuario eliminado" });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar usuario" });
  }
});

// 1. ENDPOINT: DESCARGAR BACKUP DE BASE DE DATOS
app.get("/api/backup/database", authMiddleware, async (req, res) => {
  try {
    // Ruta correcta: database/bot.db
    const dbPath = path.join(__dirname, "database", "bot.db");

    if (!fs.existsSync(dbPath)) {
      console.error("Base de datos no encontrada en:", dbPath);
      return res.status(404).json({ error: "Base de datos no encontrada" });
    }

    const fileName = `backup-${new Date().toISOString().split("T")[0]}.db`;

    res.download(dbPath, fileName, (err) => {
      if (err) {
        console.error("Error al descargar base de datos:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error al descargar el archivo" });
        }
      }
    });
  } catch (error) {
    console.error("Error en backup de base de datos:", error);
    res.status(500).json({ error: "Error al crear backup" });
  }
});

// 2. ENDPOINT: DESCARGAR CSV DE CLIENTES
app.get("/api/backup/clientes-csv", authMiddleware, async (req, res) => {
  try {
    // Usar el método que ya existe
    const clientes = await db.getAllClientes(10000);

    // Crear CSV simple con los datos que ya vienen
    let csv =
      "ID,Nombre,Teléfono,Email,WhatsApp ID,Total Mensajes,Total Citas\n";

    clientes.forEach((cliente) => {
      csv += `${cliente.id},"${cliente.nombre || ""}","${
        cliente.telefono || ""
      }","${cliente.email || ""}","${cliente.whatsapp_id || ""}",${
        cliente.total_mensajes || 0
      },${cliente.total_citas || 0}\n`;
    });

    // Enviar CSV
    const fileName = `clientes-${new Date().toISOString().split("T")[0]}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send("\uFEFF" + csv); // BOM para Excel

    console.log(`✅ CSV de clientes exportado: ${clientes.length} registros`);
  } catch (error) {
    console.error("Error al exportar clientes:", error);
    res.status(500).json({ error: "Error al exportar clientes" });
  }
});

// 3. ENDPOINT: DESCARGAR CSV DE CITAS
app.get("/api/backup/citas-csv", authMiddleware, async (req, res) => {
  try {
    // Usar el método que ya existe
    const citas = await db.getAllCitas(10000);

    // Crear CSV con los datos que ya vienen del método
    let csv = "ID,Cliente,Teléfono,Servicio,Fecha,Hora,Estado,Precio,Notas\n";

    citas.forEach((cita) => {
      const notas = (cita.notas || "").replace(/"/g, '""'); // Escapar comillas
      csv += `${cita.id},"${cita.cliente_nombre || ""}","${
        cita.cliente_telefono || ""
      }","${cita.servicio_nombre || ""}","${cita.fecha || ""}","${
        cita.hora || ""
      }","${cita.estado || ""}","${cita.servicio_precio || ""}","${notas}"\n`;
    });

    // Enviar CSV
    const fileName = `citas-${new Date().toISOString().split("T")[0]}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.send("\uFEFF" + csv); // BOM para Excel

    console.log(`✅ CSV de citas exportado: ${citas.length} registros`);
  } catch (error) {
    console.error("Error al exportar citas:", error);
    res.status(500).json({ error: "Error al exportar citas" });
  }
});

// ===== RECARGAR CONFIGURACIÓN (NUEVO) =====
app.post("/api/config/reload", authMiddleware, async (req, res) => {
  try {
    // Limpiar cache de config.js
    delete require.cache[require.resolve("./config.js")];

    // Si el bot está activo, reiniciarlo automáticamente para aplicar cambios
    if (botController && botController.isRunning) {
      console.log("🔄 Reiniciando bot con nueva configuración...");
      await botController.restart();

      res.json({
        success: true,
        message: "Configuración recargada y bot reiniciado automáticamente",
        status: botController.getStatus(),
      });
    } else {
      res.json({
        success: true,
        message: "Configuración recargada (inicia el bot para aplicar cambios)",
        status: { isRunning: false },
      });
    }
  } catch (error) {
    console.error("❌ Error recargando configuración:", error);
    res
      .status(500)
      .json({ error: "Error recargando configuración: " + error.message });
  }
});

// ESTADÍSTICAS COMPLETAS
app.get("/api/estadisticas", authMiddleware, async (req, res) => {
  try {
    const { periodo = "7dias" } = req.query;

    // Calcular fechas según período
    let fechaInicio, fechaFin;
    const hoy = new Date();
    fechaFin = hoy.toISOString().split("T")[0];

    switch (periodo) {
      case "7dias":
        fechaInicio = new Date(hoy.setDate(hoy.getDate() - 7))
          .toISOString()
          .split("T")[0];
        break;
      case "30dias":
        fechaInicio = new Date(hoy.setDate(hoy.getDate() - 30))
          .toISOString()
          .split("T")[0];
        break;
      case "mes":
        fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
          .toISOString()
          .split("T")[0];
        break;
      default:
        fechaInicio = new Date(hoy.setDate(hoy.getDate() - 7))
          .toISOString()
          .split("T")[0];
    }

    // 1. Estadísticas de Citas
    const citasPorEstado = await db.all(
      `
            SELECT estado, COUNT(*) as total
            FROM citas
            WHERE fecha >= ?
            GROUP BY estado
        `,
      [fechaInicio]
    );

    const totalCitas = await db.get(
      `
            SELECT COUNT(*) as total FROM citas WHERE fecha >= ?
        `,
      [fechaInicio]
    );

    // 2. Servicios más solicitados
    const serviciosMasSolicitados = await db.all(
      `
            SELECT 
                s.nombre,
                s.precio,
                COUNT(c.id) as total_citas
            FROM servicios s
            LEFT JOIN citas c ON s.id = c.servicio_id AND c.fecha >= ?
            GROUP BY s.id
            ORDER BY total_citas DESC
            LIMIT 5
        `,
      [fechaInicio]
    );

    // 3. Horarios más populares
    const horariosMasPopulares = await db.all(
      `
            SELECT 
                hora,
                COUNT(*) as total
            FROM citas
            WHERE fecha >= ?
            GROUP BY hora
            ORDER BY total DESC
            LIMIT 5
        `,
      [fechaInicio]
    );

    // 4. Citas por día (últimos días)
    const citasPorDia = await db.all(
      `
            SELECT 
                fecha,
                COUNT(*) as total
            FROM citas
            WHERE fecha >= ?
            GROUP BY fecha
            ORDER BY fecha ASC
        `,
      [fechaInicio]
    );

    // 5. Conversaciones por día
    const conversacionesPorDia = await db.all(
      `
            SELECT 
                DATE(created_at) as fecha,
                COUNT(*) as total
            FROM conversaciones
            WHERE DATE(created_at) >= ?
            GROUP BY DATE(created_at)
            ORDER BY fecha ASC
        `,
      [fechaInicio]
    );

    // 6. Clientes nuevos en el período
    const clientesNuevos = await db.get(
      `
            SELECT COUNT(*) as total
            FROM clientes
            WHERE DATE(created_at) >= ?
        `,
      [fechaInicio]
    );

    // 7. Tasa de conversión (clientes con citas / total clientes)
    const clientesConCitas = await db.get(
      `
            SELECT COUNT(DISTINCT cliente_id) as total
            FROM citas
            WHERE fecha >= ?
        `,
      [fechaInicio]
    );

    const totalClientes = await db.get(`
            SELECT COUNT(*) as total FROM clientes
        `);

    const tasaConversion =
      totalClientes.total > 0
        ? ((clientesConCitas.total / totalClientes.total) * 100).toFixed(1)
        : 0;

    // 8. Ingresos proyectados (sumar precios de citas confirmadas)
    const ingresosProyectados = await db.all(
      `
            SELECT 
                c.fecha,
                s.precio,
                c.estado
            FROM citas c
            JOIN servicios s ON c.servicio_id = s.id
            WHERE c.fecha >= ? AND c.estado IN ('pendiente', 'confirmada')
        `,
      [fechaInicio]
    );

    // Calcular total de ingresos (extraer números de precios)
    let totalIngresos = 0;
    ingresosProyectados.forEach((item) => {
      const precio = item.precio.replace(/[^\d]/g, "");
      totalIngresos += parseInt(precio) || 0;
    });

    // 9. Horario más activo de conversaciones
    const horarioMasActivo = await db.all(
      `
            SELECT 
                CAST(strftime('%H', created_at) AS INTEGER) as hora,
                COUNT(*) as total
            FROM conversaciones
            WHERE DATE(created_at) >= ?
            GROUP BY hora
            ORDER BY total DESC
            LIMIT 3
        `,
      [fechaInicio]
    );

    res.json({
      periodo,
      fechaInicio,
      fechaFin,
      citas: {
        total: totalCitas.total,
        porEstado: citasPorEstado,
        porDia: citasPorDia,
      },
      servicios: {
        masSolicitados: serviciosMasSolicitados,
      },
      horarios: {
        masPopulares: horariosMasPopulares,
        horariosActivos: horarioMasActivo,
      },
      clientes: {
        nuevos: clientesNuevos.total,
        total: totalClientes.total,
        conCitas: clientesConCitas.total,
        tasaConversion: parseFloat(tasaConversion),
      },
      conversaciones: {
        porDia: conversacionesPorDia,
        total: conversacionesPorDia.reduce((sum, item) => sum + item.total, 0),
      },
      ingresos: {
        proyectados: totalIngresos,
        formateado: `₡${totalIngresos.toLocaleString("es-CR")}`,
      },
    });
  } catch (error) {
    console.error("Error en estadísticas:", error);
    res.status(500).json({ error: "Error al obtener estadísticas" });
  }
});

// CONTROL DEL BOT

// Inicializar el controlador del bot
app.post("/api/bot/init", authMiddleware, async (req, res) => {
  try {
    if (botController && botController.isRunning) {
      return res.status(400).json({ error: "El bot ya está en ejecución" });
    }

    const config = require("./config");
    botController = new BotController(config, db);

    // Listeners de eventos
    botController.on("statusChange", (status) => {
      console.log("📊 Estado del bot:", status);
    });

    botController.on("qr", (qrCode) => {
      console.log("🔄 Nuevo QR generado");
    });

    // Listener para cuando el bot se conecta
    botController.on("ready", async () => {
      console.log("✅ Bot de WhatsApp conectado");

      // Iniciar servicio de recordatorios
      if (!reminderService) {
        try {
          reminderService = new ReminderService(db, botController);
          await reminderService.start();
          console.log("✅ Servicio de recordatorios iniciado");
        } catch (error) {
          console.error("❌ Error iniciando recordatorios:", error);
        }
      }
    });

    await botController.start();

    res.json({
      message: "Bot iniciado correctamente",
      status: botController.getStatus(),
    });
  } catch (error) {
    console.error("Error iniciando bot:", error);
    res.status(500).json({ error: error.message });
  }
});

// Detener el bot
app.post("/api/bot/stop", authMiddleware, async (req, res) => {
  try {
    if (!botController || !botController.isRunning) {
      return res.status(400).json({ error: "El bot no está en ejecución" });
    }

    await botController.stop();

    res.json({
      message: "Bot detenido correctamente",
      status: botController.getStatus(),
    });
  } catch (error) {
    console.error("Error deteniendo bot:", error);
    res.status(500).json({ error: error.message });
  }
});

// Reiniciar el bot
app.post("/api/bot/restart", authMiddleware, async (req, res) => {
  try {
    if (!botController) {
      return res.status(400).json({ error: "El bot no ha sido inicializado" });
    }

    await botController.restart();

    res.json({
      message: "Bot reiniciado correctamente",
      status: botController.getStatus(),
    });
  } catch (error) {
    console.error("Error reiniciando bot:", error);
    res.status(500).json({ error: error.message });
  }
});

// Obtener estado del bot
app.get("/api/bot/status", authMiddleware, (req, res) => {
  try {
    if (!botController) {
      return res.json({
        isRunning: false,
        status: "not_initialized",
        qrCode: null,
        activeUsers: 0,
        appointments: 0,
      });
    }

    res.json(botController.getStatus());
  } catch (error) {
    console.error("Error obteniendo estado:", error);
    res.status(500).json({ error: error.message });
  }
});

// Obtener QR Code
app.get("/api/bot/qr", authMiddleware, (req, res) => {
  try {
    if (!botController) {
      return res.status(404).json({ error: "Bot no inicializado" });
    }

    const qrCode = botController.getQRCode();

    if (!qrCode) {
      return res.status(404).json({ error: "QR no disponible" });
    }

    res.json({ qrCode });
  } catch (error) {
    console.error("Error obteniendo QR:", error);
    res.status(500).json({ error: error.message });
  }
});

// Limpiar sesión (para volver a escanear QR)
app.post("/api/bot/clear-session", authMiddleware, async (req, res) => {
  try {
    const fs = require("fs");
    const path = require("path");

    // Detener el bot si está corriendo
    if (botController && botController.isRunning) {
      await botController.stop();
    }

    // Eliminar carpeta de sesión
    const sesionPath = path.join(__dirname, "sesion");
    if (fs.existsSync(sesionPath)) {
      fs.rmSync(sesionPath, { recursive: true, force: true });
      console.log("🗑️ Sesión eliminada");
    }

    res.json({
      message: "Sesión eliminada. Inicia el bot para escanear nuevo QR",
      status: botController ? botController.getStatus() : { isRunning: false },
    });
  } catch (error) {
    console.error("Error limpiando sesión:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ENDPOINTS DE RECORDATORIOS AUTOMÁTICOS
// ============================================

// Obtener configuración de recordatorios
app.get("/api/recordatorios/config", authMiddleware, async (req, res) => {
  try {
    if (!reminderService) {
      return res
        .status(503)
        .json({ error: "Servicio de recordatorios no disponible" });
    }

    const stats = await reminderService.getStats();
    res.json(stats);
  } catch (error) {
    console.error("Error obteniendo config de recordatorios:", error);
    res.status(500).json({ error: "Error al obtener configuración" });
  }
});

// Actualizar configuración de recordatorios
app.put("/api/recordatorios/config", authMiddleware, async (req, res) => {
  try {
    if (!reminderService) {
      return res
        .status(503)
        .json({ error: "Servicio de recordatorios no disponible" });
    }

    await reminderService.saveConfig(req.body);
    res.json({ message: "Configuración actualizada" });
  } catch (error) {
    console.error("Error actualizando config de recordatorios:", error);
    res.status(500).json({ error: "Error al actualizar configuración" });
  }
});

// Iniciar servicio de recordatorios
app.post("/api/recordatorios/start", authMiddleware, async (req, res) => {
  try {
    if (!reminderService) {
      return res
        .status(503)
        .json({ error: "Servicio de recordatorios no disponible" });
    }

    await reminderService.start();
    res.json({ message: "Servicio de recordatorios iniciado" });
  } catch (error) {
    console.error("Error iniciando recordatorios:", error);
    res.status(500).json({ error: error.message });
  }
});

// Detener servicio de recordatorios
app.post("/api/recordatorios/stop", authMiddleware, async (req, res) => {
  try {
    if (!reminderService) {
      return res
        .status(503)
        .json({ error: "Servicio de recordatorios no disponible" });
    }

    reminderService.stop();
    res.json({ message: "Servicio de recordatorios detenido" });
  } catch (error) {
    console.error("Error deteniendo recordatorios:", error);
    res.status(500).json({ error: error.message });
  }
});

// Forzar verificación de recordatorios (para testing)
app.post("/api/recordatorios/check-now", authMiddleware, async (req, res) => {
  try {
    if (!reminderService) {
      return res
        .status(503)
        .json({ error: "Servicio de recordatorios no disponible" });
    }

    await reminderService.checkAndSendReminders();
    res.json({ message: "Verificación forzada completada" });
  } catch (error) {
    console.error("Error en verificación forzada:", error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ENDPOINTS DE BACKUP AUTOMÁTICO
// ============================================

// Obtener estado del servicio de backup
app.get('/api/backup/status', authMiddleware, async (req, res) => {
  try {
    if (!backupService) {
      return res.status(503).json({ error: 'Servicio de backup no disponible' });
    }

    const status = backupService.getStatus();
    res.json(status);
  } catch (error) {
    console.error('Error obteniendo status de backup:', error);
    res.status(500).json({ error: 'Error al obtener estado' });
  }
});

// Crear backup manual
app.post('/api/backup/create', authMiddleware, async (req, res) => {
  try {
    if (!backupService) {
      return res.status(503).json({ error: 'Servicio de backup no disponible' });
    }

    const backup = await backupService.createBackup();
    res.json({ 
      message: 'Backup creado correctamente',
      backup 
    });
  } catch (error) {
    console.error('Error creando backup manual:', error);
    res.status(500).json({ error: error.message });
  }
});

// Descargar un backup específico
app.get('/api/backup/download/:filename', authMiddleware, async (req, res) => {
  try {
    if (!backupService) {
      return res.status(503).json({ error: 'Servicio de backup no disponible' });
    }

    const { filename } = req.params;
    const backupPath = path.join(__dirname, 'backups', filename);

    if (!fs.existsSync(backupPath)) {
      return res.status(404).json({ error: 'Backup no encontrado' });
    }

    res.download(backupPath, filename);
  } catch (error) {
    console.error('Error descargando backup:', error);
    res.status(500).json({ error: 'Error al descargar backup' });
  }
});

// Actualizar configuración de backup
app.put('/api/backup/config', authMiddleware, async (req, res) => {
  try {
    if (!backupService) {
      return res.status(503).json({ error: 'Servicio de backup no disponible' });
    }

    backupService.updateConfig(req.body);
    res.json({ message: 'Configuración actualizada' });
  } catch (error) {
    console.error('Error actualizando config de backup:', error);
    res.status(500).json({ error: error.message });
  }
});

// Iniciar servicio de backup
app.post('/api/backup/start', authMiddleware, async (req, res) => {
  try {
    if (!backupService) {
      return res.status(503).json({ error: 'Servicio de backup no disponible' });
    }

    backupService.start();
    res.json({ message: 'Servicio de backup iniciado' });
  } catch (error) {
    console.error('Error iniciando backup:', error);
    res.status(500).json({ error: error.message });
  }
});

// Detener servicio de backup
app.post('/api/backup/stop', authMiddleware, async (req, res) => {
  try {
    if (!backupService) {
      return res.status(503).json({ error: 'Servicio de backup no disponible' });
    }

    backupService.stop();
    res.json({ message: 'Servicio de backup detenido' });
  } catch (error) {
    console.error('Error deteniendo backup:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ENDPOINTS GOOGLE DRIVE
// ============================================

// Obtener URL de autorización de Google Drive
app.get('/api/google-drive/auth-url', authMiddleware, async (req, res) => {
  try {
    const GoogleDriveService = require('./google-drive-service');
    const driveService = new GoogleDriveService();
    const authUrl = driveService.getAuthUrl();
    
    res.json({ authUrl });
  } catch (error) {
    console.error('Error generando URL de autorización:', error);
    res.status(500).json({ error: error.message });
  }
});

// Callback de Google OAuth (recibe el código y guarda tokens)
app.get('/api/google-drive/callback', async (req, res) => {
  try {
    const { code } = req.query;
    
    if (!code) {
      return res.redirect('http://localhost:3001/dashboard/config?tab=backup&error=no_code');
    }

    const GoogleDriveService = require('./google-drive-service');
    const driveService = new GoogleDriveService();
    
    // Intercambiar código por tokens
    const tokens = await driveService.getTokensFromCode(code);
    
    // Guardar tokens en base de datos
    await db.run(
      `UPDATE configuracion SET 
       google_drive_token = ?,
       google_drive_refresh_token = ?
       WHERE id = 1`,
      [JSON.stringify(tokens), tokens.refresh_token]
    );
    
    console.log('✅ Google Drive conectado exitosamente');
    
    // Redirigir al dashboard con éxito
    res.redirect('http://localhost:3001/dashboard/config?tab=backup&drive_connected=true');
    
  } catch (error) {
    console.error('❌ Error en callback de Google Drive:', error);
    res.redirect('http://localhost:3001/dashboard/config?tab=backup&error=auth_failed');
  }
});

// Habilitar/deshabilitar backup automático a Google Drive
app.put('/api/google-drive/config', authMiddleware, async (req, res) => {
  try {
    const { enabled, email } = req.body;
    
    await db.run(
      `UPDATE configuracion SET 
       backup_auto_drive = ?,
       google_drive_email = ?
       WHERE id = 1`,
      [enabled ? 1 : 0, email || null]
    );
    
    res.json({ 
      success: true,
      message: enabled ? 'Backups a Google Drive habilitados' : 'Backups a Google Drive deshabilitados'
    });
    
  } catch (error) {
    console.error('Error actualizando configuración de Drive:', error);
    res.status(500).json({ error: error.message });
  }
});

// Desconectar Google Drive
app.post('/api/google-drive/disconnect', authMiddleware, async (req, res) => {
  try {
    await db.run(
      `UPDATE configuracion SET 
       backup_auto_drive = 0,
       google_drive_token = NULL,
       google_drive_refresh_token = NULL,
       google_drive_email = NULL
       WHERE id = 1`
    );
    
    console.log('🔌 Google Drive desconectado');
    
    res.json({ success: true, message: 'Google Drive desconectado' });
    
  } catch (error) {
    console.error('Error desconectando Google Drive:', error);
    res.status(500).json({ error: error.message });
  }
});

// Obtener estado de Google Drive
app.get('/api/google-drive/status', authMiddleware, async (req, res) => {
  try {
    const config = await db.get('SELECT * FROM configuracion WHERE id = 1');
    
    const status = {
      configured: !!config?.backup_auto_drive,
      connected: !!(config?.google_drive_token && config?.backup_auto_drive),
      email: config?.google_drive_email || null
    };
    
    res.json(status);
    
  } catch (error) {
    console.error('Error obteniendo estado de Drive:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CONFIGURACIÓN DE MULTER PARA LOGOS
// ============================================
const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, "uploads", "logos");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `logo-${Date.now()}${ext}`);
  },
});

const uploadLogo = multer({
  storage: logoStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Solo se permiten imágenes"));
    }
  },
});

// Obtener logo actual
app.get("/api/config/logo", authMiddleware, async (req, res) => {
  try {
    const config = await db.get(
      "SELECT logo_path FROM configuracion WHERE id = 1"
    );
    res.json({ logo_path: config?.logo_path || null });
  } catch (error) {
    console.error("Error obteniendo logo:", error);
    res.status(500).json({ error: "Error al obtener logo" });
  }
});

// Subir nuevo logo
app.post(
  "/api/config/logo",
  authMiddleware,
  uploadLogo.single("logo"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No se recibió ningún archivo" });
      }

      const logoPath = `/uploads/logos/${req.file.filename}`;

      // Obtener logo anterior para eliminarlo
      const oldConfig = await db.get(
        "SELECT logo_path FROM configuracion WHERE id = 1"
      );

      // Actualizar en base de datos
      await db.run("UPDATE configuracion SET logo_path = ? WHERE id = 1", [
        logoPath,
      ]);

      // Eliminar logo anterior si existe
      if (oldConfig?.logo_path) {
        const oldLogoFullPath = path.join(__dirname, oldConfig.logo_path);
        if (fs.existsSync(oldLogoFullPath)) {
          fs.unlinkSync(oldLogoFullPath);
          console.log("🗑️ Logo anterior eliminado");
        }
      }

      console.log("✅ Logo subido:", logoPath);
      res.json({ logo_path: logoPath, message: "Logo subido correctamente" });
    } catch (error) {
      console.error("Error subiendo logo:", error);
      res.status(500).json({ error: "Error al subir logo" });
    }
  }
);

// Eliminar logo
app.delete("/api/config/logo", authMiddleware, async (req, res) => {
  try {
    const config = await db.get(
      "SELECT logo_path FROM configuracion WHERE id = 1"
    );

    if (config?.logo_path) {
      const logoFullPath = path.join(__dirname, config.logo_path);
      if (fs.existsSync(logoFullPath)) {
        fs.unlinkSync(logoFullPath);
        console.log("🗑️ Logo eliminado");
      }
    }

    await db.run("UPDATE configuracion SET logo_path = NULL WHERE id = 1");
    res.json({ message: "Logo eliminado correctamente" });
  } catch (error) {
    console.error("Error eliminando logo:", error);
    res.status(500).json({ error: "Error al eliminar logo" });
  }
});

// Error 404
app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada" });
});

// INICIAR SERVIDOR
app.listen(PORT, () => {
  console.log(`\n✅ Servidor API iniciado`);
  console.log(`🌐 http://localhost:${PORT}`);
  console.log(`📁 Uploads: http://localhost:${PORT}/uploads`);
  console.log(`\n📝 Endpoints:`);
  console.log(`   POST /api/auth/login`);
  console.log(`   GET  /api/dashboard/stats`);
  console.log(`   GET  /api/citas`);
  console.log(`   GET  /api/clientes`);
  
  // Inicializar servicio de backup automático
  const dbPath = path.join(__dirname, "database", "bot.db");
  backupService = new BackupService(dbPath, db); // Pasar referencia a db
  backupService.start();
  console.log(`\n💾 Servicio de backup iniciado`);
});

process.on("SIGINT", () => {
  console.log("\n🛑 Cerrando...");
  if (backupService) {
    backupService.stop();
  }
  db.close();
  process.exit(0);
});

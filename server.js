require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const DatabaseManager = require('./database/database');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'cambiar_esto';

const db = new DatabaseManager();

// Configurar multer para subir imágenes
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadPath = './public/uploads/servicios';
        if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
        }
        cb(null, uploadPath);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'servicio-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB máximo
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Solo se permiten imágenes (jpg, png, gif, webp)'));
        }
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Servir archivos estáticos (imágenes)
app.use('/uploads', express.static('public/uploads'));

// Middleware de autenticación
const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
        return res.status(401).json({ error: 'Token no proporcionado' });
    }
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido' });
    }
};

// ===== RUTAS PÚBLICAS =====

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString()
    });
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
        }
        
        const user = await db.get(
            'SELECT * FROM usuarios_panel WHERE username = ? AND activo = 1',
            [username]
        );
        
        if (!user) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }
        
        if (!user.password_hash) {
            console.error('Usuario sin contraseña:', username);
            return res.status(500).json({ error: 'Usuario mal configurado' });
        }
        
        const isValid = bcrypt.compareSync(password, user.password_hash);
        
        if (!isValid) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }
        
        await db.run(
            'UPDATE usuarios_panel SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
            [user.id]
        );
        
        const token = jwt.sign(
            { id: user.id, username: user.username, rol: user.rol },
            JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.json({
            token,
            user: {
                id: user.id,
                username: user.username,
                nombre: user.nombre_completo,
                email: user.email,
                rol: user.rol
            }
        });
        
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ error: 'Error en el servidor' });
    }
});

// ===== RUTAS PROTEGIDAS =====

// Dashboard
app.get('/api/dashboard/stats', authMiddleware, async (req, res) => {
    try {
        const stats = await db.getDashboardStats();
        res.json(stats);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error al obtener estadísticas' });
    }
});

// SERVICIOS
app.get('/api/servicios', authMiddleware, async (req, res) => {
    try {
        const servicios = await db.getAllServicios();
        res.json(servicios);
    } catch (error) {
        res.status(500).json({ error: 'Error al obtener servicios' });
    }
});

// Crear servicio CON imagen
app.post('/api/servicios', authMiddleware, upload.single('imagen'), async (req, res) => {
    try {
        const { nombre, precio, descripcion } = req.body;
        
        if (!nombre || !precio) {
            return res.status(400).json({ error: 'Nombre y precio requeridos' });
        }
        
        // Si se subió imagen, guardar la ruta
        const imagenPath = req.file ? `/uploads/servicios/${req.file.filename}` : (req.body.imagenUrl || null);
        
        const id = await db.createServicio({ 
            nombre, 
            precio, 
            descripcion, 
            imagen: imagenPath 
        });
        
        res.status(201).json({ id, message: 'Servicio creado', imagen: imagenPath });
    } catch (error) {
        console.error('Error creando servicio:', error);
        res.status(500).json({ error: 'Error al crear servicio' });
    }
});

// Actualizar servicio CON imagen
app.put('/api/servicios/:id', authMiddleware, upload.single('imagen'), async (req, res) => {
    try {
        const { nombre, precio, descripcion } = req.body;
        
        // Si se subió nueva imagen
        let imagenPath = req.body.imagenUrl || null;
        if (req.file) {
            imagenPath = `/uploads/servicios/${req.file.filename}`;
            
            // Eliminar imagen anterior si existe
            const servicioAnterior = await db.getServicioById(req.params.id);
            if (servicioAnterior && servicioAnterior.imagen && servicioAnterior.imagen.startsWith('/uploads/')) {
                const oldPath = path.join(__dirname, 'public', servicioAnterior.imagen);
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            }
        }
        
        await db.updateServicio(req.params.id, { nombre, precio, descripcion, imagen: imagenPath });
        res.json({ message: 'Servicio actualizado', imagen: imagenPath });
    } catch (error) {
        console.error('Error actualizando servicio:', error);
        res.status(500).json({ error: 'Error al actualizar' });
    }
});

app.delete('/api/servicios/:id', authMiddleware, async (req, res) => {
    try {
        // Eliminar imagen si existe
        const servicio = await db.getServicioById(req.params.id);
        if (servicio && servicio.imagen && servicio.imagen.startsWith('/uploads/')) {
            const imagePath = path.join(__dirname, 'public', servicio.imagen);
            if (fs.existsSync(imagePath)) {
                fs.unlinkSync(imagePath);
            }
        }
        
        await db.deleteServicio(req.params.id);
        res.json({ message: 'Servicio eliminado' });
    } catch (error) {
        res.status(500).json({ error: 'Error al eliminar' });
    }
});

// CITAS
app.get('/api/citas', authMiddleware, async (req, res) => {
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
        res.status(500).json({ error: 'Error al obtener citas' });
    }
});

app.get('/api/citas/:id', authMiddleware, async (req, res) => {
    try {
        const cita = await db.getCitaById(req.params.id);
        if (!cita) {
            return res.status(404).json({ error: 'Cita no encontrada' });
        }
        res.json(cita);
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
});

app.put('/api/citas/:id/estado', authMiddleware, async (req, res) => {
    try {
        const { estado } = req.body;
        
        if (!['confirmada', 'completada', 'cancelada'].includes(estado)) {
            return res.status(400).json({ error: 'Estado inválido' });
        }
        
        await db.updateCitaEstado(req.params.id, estado);
        res.json({ message: 'Estado actualizado' });
    } catch (error) {
        res.status(500).json({ error: 'Error al actualizar' });
    }
});

app.delete('/api/citas/:id', authMiddleware, async (req, res) => {
    try {
        await db.deleteCita(req.params.id);
        res.json({ message: 'Cita eliminada' });
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
});

// CLIENTES
app.get('/api/clientes', authMiddleware, async (req, res) => {
    try {
        const { limit = 100, offset = 0 } = req.query;
        const clientes = await db.getAllClientes(parseInt(limit), parseInt(offset));
        res.json(clientes);
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
});

app.get('/api/clientes/:id/conversaciones', authMiddleware, async (req, res) => {
    try {
        const { limit = 50 } = req.query;
        const conversaciones = await db.getConversacionesByCliente(
            req.params.id, 
            parseInt(limit)
        );
        res.json(conversaciones);
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
});

// HORARIOS
app.get('/api/horarios', authMiddleware, async (req, res) => {
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
        res.status(500).json({ error: 'Error' });
    }
});

// ESTADÍSTICAS
app.get('/api/estadisticas', authMiddleware, async (req, res) => {
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
        res.status(500).json({ error: 'Error' });
    }
});

// CONFIGURACIÓN
app.get('/api/config', authMiddleware, async (req, res) => {
    try {
        const config = await db.all('SELECT * FROM configuracion');
        res.json(config);
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
});

// CONTROL DEL BOT
let botStatus = { active: true, connected: false };

app.get('/api/bot/status', authMiddleware, (req, res) => {
    res.json(botStatus);
});

app.post('/api/bot/toggle', authMiddleware, async (req, res) => {
    try {
        const { activo } = req.body;
        
        await db.run(
            "UPDATE configuracion SET valor = ? WHERE clave = 'bot_activo'",
            [activo ? 'true' : 'false']
        );
        
        botStatus.active = activo;
        
        res.json({ 
            message: activo ? 'Bot activado' : 'Bot desactivado',
            status: botStatus
        });
    } catch (error) {
        res.status(500).json({ error: 'Error' });
    }
});

// Error 404
app.use((req, res) => {
    res.status(404).json({ error: 'Ruta no encontrada' });
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
});

process.on('SIGINT', () => {
    console.log('\n🛑 Cerrando...');
    db.close();
    process.exit(0);
});
-- Tabla de Servicios
CREATE TABLE IF NOT EXISTS servicios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    precio TEXT NOT NULL,
    descripcion TEXT,
    imagen TEXT,
    activo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Clientes
CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    whatsapp_id TEXT UNIQUE NOT NULL,
    nombre TEXT,
    telefono TEXT,
    email TEXT,
    primera_interaccion DATETIME DEFAULT CURRENT_TIMESTAMP,
    ultima_interaccion DATETIME DEFAULT CURRENT_TIMESTAMP,
    total_mensajes INTEGER DEFAULT 0,
    total_citas INTEGER DEFAULT 0
);

-- Tabla de Citas
CREATE TABLE IF NOT EXISTS citas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    servicio_id INTEGER NOT NULL,
    fecha TEXT NOT NULL,
    hora TEXT NOT NULL,
    estado TEXT DEFAULT 'confirmada',
    notas TEXT,
    recordatorio_enviado INTEGER DEFAULT 0,
    recordatorio_enviado_at DATETIME,
    segundo_recordatorio_enviado INTEGER DEFAULT 0,
    segundo_recordatorio_enviado_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id),
    FOREIGN KEY (servicio_id) REFERENCES servicios(id)
);

-- Tabla de Conversaciones
CREATE TABLE IF NOT EXISTS conversaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    mensaje TEXT NOT NULL,
    tipo TEXT DEFAULT 'entrante',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id)
);

-- Tabla de Horarios Disponibles
CREATE TABLE IF NOT EXISTS horarios_disponibles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dia_semana TEXT NOT NULL,
    hora TEXT NOT NULL,
    activo INTEGER DEFAULT 1
);

-- Tabla de Preguntas Frecuentes
CREATE TABLE IF NOT EXISTS preguntas_frecuentes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pregunta TEXT NOT NULL,
    respuesta TEXT NOT NULL,
    orden INTEGER DEFAULT 0,
    activo INTEGER DEFAULT 1
);

-- Tabla de Configuración
CREATE TABLE IF NOT EXISTS configuracion (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clave TEXT UNIQUE NOT NULL,
    valor TEXT NOT NULL,
    tipo TEXT DEFAULT 'texto',
    google_drive_email TEXT,
    google_drive_token TEXT,
    google_drive_refresh_token TEXT,
    backup_auto_drive INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de Usuarios del Panel
CREATE TABLE IF NOT EXISTS usuarios_panel (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    nombre_completo TEXT,
    email TEXT,
    rol TEXT DEFAULT 'asesor',
    activo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
);

-- Tabla de Estadísticas
CREATE TABLE IF NOT EXISTS estadisticas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha DATE NOT NULL,
    total_conversaciones INTEGER DEFAULT 0,
    total_citas INTEGER DEFAULT 0,
    citas_confirmadas INTEGER DEFAULT 0,
    citas_canceladas INTEGER DEFAULT 0,
    mensajes_enviados INTEGER DEFAULT 0,
    mensajes_recibidos INTEGER DEFAULT 0,
    UNIQUE(fecha)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_clientes_whatsapp ON clientes(whatsapp_id);
CREATE INDEX IF NOT EXISTS idx_citas_fecha ON citas(fecha);
CREATE INDEX IF NOT EXISTS idx_citas_estado ON citas(estado);
CREATE INDEX IF NOT EXISTS idx_conversaciones_cliente ON conversaciones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_conversaciones_timestamp ON conversaciones(timestamp);
CREATE INDEX IF NOT EXISTS idx_estadisticas_fecha ON estadisticas(fecha);
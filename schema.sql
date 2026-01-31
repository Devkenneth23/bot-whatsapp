-- Schema para base de datos individual de cada cliente

-- Servicios del negocio
CREATE TABLE IF NOT EXISTS servicios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    precio REAL,
    imagen TEXT,
    activo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Clientes del negocio (usuarios finales)
CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    whatsapp_id TEXT UNIQUE NOT NULL,
    telefono TEXT NOT NULL,
    nombre TEXT,
    email TEXT,
    total_citas INTEGER DEFAULT 0,
    total_mensajes INTEGER DEFAULT 0,
    ultima_interaccion DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_clientes_whatsapp ON clientes(whatsapp_id);
CREATE INDEX IF NOT EXISTS idx_clientes_telefono ON clientes(telefono);

-- Citas agendadas
CREATE TABLE IF NOT EXISTS citas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    servicio_id INTEGER NOT NULL,
    fecha DATE NOT NULL,
    hora TIME NOT NULL,
    estado TEXT DEFAULT 'pendiente',
    notas TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id),
    FOREIGN KEY (servicio_id) REFERENCES servicios(id)
);

CREATE INDEX IF NOT EXISTS idx_citas_fecha ON citas(fecha);
CREATE INDEX IF NOT EXISTS idx_citas_cliente ON citas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_citas_estado ON citas(estado);

-- Horarios disponibles
CREATE TABLE IF NOT EXISTS horarios_disponibles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dia_semana TEXT NOT NULL,
    hora TIME NOT NULL,
    activo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_horarios_dia ON horarios_disponibles(dia_semana);

-- Preguntas frecuentes
CREATE TABLE IF NOT EXISTS preguntas_frecuentes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pregunta TEXT NOT NULL,
    respuesta TEXT NOT NULL,
    orden INTEGER DEFAULT 0,
    activo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Conversaciones (log de mensajes)
CREATE TABLE IF NOT EXISTS conversaciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    mensaje TEXT NOT NULL,
    tipo TEXT DEFAULT 'entrante',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id)
);

CREATE INDEX IF NOT EXISTS idx_conversaciones_cliente ON conversaciones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_conversaciones_timestamp ON conversaciones(timestamp);

-- Estadísticas diarias
CREATE TABLE IF NOT EXISTS estadisticas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha DATE UNIQUE NOT NULL,
    total_conversaciones INTEGER DEFAULT 0,
    total_citas INTEGER DEFAULT 0,
    citas_confirmadas INTEGER DEFAULT 0,
    mensajes_recibidos INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_estadisticas_fecha ON estadisticas(fecha);

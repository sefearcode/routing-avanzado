const express = require('express');
const fs = require('fs');
const path = require('path');
const { body, param, query, validationResult } = require('express-validator');
const { AppError, ValidationError, NotFoundError } = require('./errores');

/* =========================
   APP
========================= */
const app = express();
app.use(express.json());

/* =========================
   LOGS A ARCHIVO
========================= */
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

const logFile = path.join(logDir, 'api.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

function logger(req, res, next) {
  const log = `[${new Date().toISOString()}] ${req.method} ${req.url}\n`;
  logStream.write(log);
  next();
}

app.use(logger);

/* =========================
   DATA SIMULADA
========================= */
let categorias = [
  { id: 1, nombre: 'Trabajo' },
  { id: 2, nombre: 'Personal' }
];

let usuarios = [
  { id: 1, nombre: 'Admin' },
  { id: 2, nombre: 'Usuario' }
];

let tareas = [
  {
    id: 1,
    titulo: 'Aprender Express',
    completada: false,
    prioridad: 'alta',
    usuarioId: 1,
    categoriaId: 1,
    fechaCreacion: '2025-12-20'
  },
  {
    id: 2,
    titulo: 'Hacer deporte',
    completada: true,
    prioridad: 'media',
    usuarioId: 2,
    categoriaId: 2,
    fechaCreacion: '2025-12-21'
  }
];

let siguienteId = 3;

/* =========================
   AUTH SIMULADA
========================= */
function autenticar(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    throw new AppError('Token requerido', 401);
  }

  const token = header.split(' ')[1];
  req.usuario = { id: token === 'admin-token' ? 1 : 2 };
  next();
}

/* =========================
   VALIDACIÓN
========================= */
function validarErrores(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    throw new ValidationError('Errores de validación', errors.array());
  }
  next();
}
/* =========================
   LOGIN SIMULADO
========================= */
app.post('/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (email === 'admin@example.com' && password === 'admin123') {
    return res.json({
      token: 'admin-token',
      usuario: { id: 1, nombre: 'Admin' }
    });
  }

  if (email === 'user@example.com' && password === 'user123') {
    return res.json({
      token: 'user-token',
      usuario: { id: 2, nombre: 'Usuario' }
    });
  }

  res.status(401).json({ error: 'Credenciales inválidas' });
});


/* =========================
   ROUTER TAREAS
========================= */
const tareasRouter = express.Router();
tareasRouter.use(autenticar);

/**
 * GET /api/tareas
 * Búsqueda AND / OR
 */
tareasRouter.get('/',
  [
    query('completada').optional().isBoolean().toBoolean(),
    query('prioridad').optional().isIn(['baja', 'media', 'alta']),
    query('modo').optional().isIn(['and', 'or'])
  ],
  validarErrores,
  (req, res) => {
    const { completada, prioridad, modo = 'and' } = req.query;

    let resultado = tareas.filter(t => t.usuarioId === req.usuario.id);

    if (modo === 'and') {
      if (completada !== undefined) {
        resultado = resultado.filter(t => t.completada === completada);
      }
      if (prioridad) {
        resultado = resultado.filter(t => t.prioridad === prioridad);
      }
    } else {
      resultado = resultado.filter(t =>
        (completada !== undefined && t.completada === completada) ||
        (prioridad && t.prioridad === prioridad)
      );
    }

    res.json(resultado);
  }
);

/**
 * POST /api/tareas
 */
tareasRouter.post('/',
  [
    body('titulo').isLength({ min: 3 }),
    body('categoriaId').isInt(),
    body('prioridad').optional().isIn(['baja', 'media', 'alta'])
  ],
  validarErrores,
  (req, res) => {
    const categoria = categorias.find(c => c.id === req.body.categoriaId);
    if (!categoria) throw new NotFoundError('Categoría');

    const tarea = {
      id: siguienteId++,
      titulo: req.body.titulo,
      completada: false,
      prioridad: req.body.prioridad || 'media',
      usuarioId: req.usuario.id,
      categoriaId: req.body.categoriaId,
      fechaCreacion: new Date().toISOString().split('T')[0]
    };

    tareas.push(tarea);
    res.status(201).json(tarea);
  }
);

/* =========================
   ROUTER ESTADÍSTICAS
========================= */
const statsRouter = express.Router();
statsRouter.use(autenticar);

/**
 * Tareas completadas por día
 */
statsRouter.get('/completadas-por-dia', (req, res) => {
  const resultado = {};

  tareas
    .filter(t => t.completada)
    .forEach(t => {
      resultado[t.fechaCreacion] =
        (resultado[t.fechaCreacion] || 0) + 1;
    });

  res.json(resultado);
});

/**
 * Productividad por usuario
 */
statsRouter.get('/productividad', (req, res) => {
  const data = usuarios.map(u => {
    const total = tareas.filter(t => t.usuarioId === u.id).length;
    const completadas = tareas.filter(
      t => t.usuarioId === u.id && t.completada
    ).length;

    return {
      usuario: u.nombre,
      total,
      completadas,
      productividad: total ? `${Math.round((completadas / total) * 100)}%` : '0%'
    };
  });

  res.json(data);
});

/* =========================
   ROUTER CATEGORÍAS
========================= */
const categoriasRouter = express.Router();

categoriasRouter.get('/', (req, res) => {
  res.json(categorias);
});

/* =========================
   ROUTES
========================= */
app.use('/api/tareas', tareasRouter);
app.use('/api/stats', statsRouter);
app.use('/api/categorias', categoriasRouter);

/* =========================
   ERRORES
========================= */
app.use((err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: err.message,
      detalles: err.details
    });
  }

  res.status(500).json({ error: 'Error interno del servidor' });
});

/* =========================
   SERVER
========================= */
app.listen(3000, () => {
  console.log('🚀 API ejecutándose en http://localhost:3000');
});

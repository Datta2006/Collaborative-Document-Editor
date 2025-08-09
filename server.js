const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database connection
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'Datta@2006',
  database: process.env.DB_NAME || 'collaborative_editor',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Auth Routes
app.post('/api/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const [result] = await pool.execute(
      'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
      [username, email, hashedPassword]
    );
    
    const token = jwt.sign(
      { userId: result.insertId, username, email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: { id: result.insertId, username, email }
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      res.status(409).json({ error: 'Username or email already exists' });
    } else {
      res.status(500).json({ error: 'Registration failed' });
    }
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const [users] = await pool.execute(
      'SELECT * FROM users WHERE username = ? OR email = ?',
      [username, username]
    );
    
    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const user = users[0];
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign(
      { userId: user.id, username: user.username, email: user.email },
      JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    res.json({
      message: 'Login successful',
      token,
      user: { id: user.id, username: user.username, email: user.email }
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// Document Routes
app.get('/api/documents', authenticateToken, async (req, res) => {
  try {
    const [documents] = await pool.execute(`
      SELECT d.id, d.title, d.content, d.owner_id, d.updated_at, u.username as owner_name, 
             CASE WHEN d.owner_id = ? THEN 'write' ELSE dc.permission END AS permission
      FROM documents d 
      JOIN users u ON d.owner_id = u.id 
      LEFT JOIN document_collaborators dc ON d.id = dc.document_id AND dc.user_id = ?
      WHERE d.owner_id = ? OR dc.user_id = ?
      ORDER BY d.updated_at DESC
    `, [req.user.userId, req.user.userId, req.user.userId, req.user.userId]);
    
    res.json(documents);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch documents' });
  }
});

app.post('/api/documents', authenticateToken, async (req, res) => {
  try {
    const { title, content = '' } = req.body;
    
    const [result] = await pool.execute(
      'INSERT INTO documents (title, content, owner_id) VALUES (?, ?, ?)',
      [title, content, req.user.userId]
    );
    
    // Create initial version
    await pool.execute(
      'INSERT INTO document_versions (document_id, content, version_number, created_by) VALUES (?, ?, 1, ?)',
      [result.insertId, content, req.user.userId]
    );
    
    res.status(201).json({
      id: result.insertId,
      title,
      content,
      owner_id: req.user.userId,
      message: 'Document created successfully'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create document' });
  }
});

app.get('/api/documents/:id', authenticateToken, async (req, res) => {
  try {
    const documentId = req.params.id;
    
    const [docsAndPermissions] = await pool.execute(`
      SELECT d.*, u.username as owner_name, 
             CASE WHEN d.owner_id = ? THEN 'write' ELSE dc.permission END AS user_permission
      FROM documents d 
      JOIN users u ON d.owner_id = u.id 
      LEFT JOIN document_collaborators dc ON d.id = dc.document_id AND dc.user_id = ?
      WHERE d.id = ? AND (d.owner_id = ? OR dc.user_id = ?)
    `, [req.user.userId, req.user.userId, documentId, req.user.userId, req.user.userId]);
    
    if (docsAndPermissions.length === 0) {
      return res.status(404).json({ error: 'Document not found or access denied' });
    }
    
    const document = docsAndPermissions[0];
    res.json({
        ...document,
        permission: document.user_permission || 'read'
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch document' });
  }
});

app.put('/api/documents/:id', authenticateToken, async (req, res) => {
  try {
    const documentId = req.params.id;
    const { content, title } = req.body;
    
    const [access] = await pool.execute(`
      SELECT 1 FROM documents d 
      LEFT JOIN document_collaborators dc ON d.id = dc.document_id 
      WHERE d.id = ? AND (
        d.owner_id = ? OR 
        (dc.user_id = ? AND dc.permission = 'write')
      )
    `, [documentId, req.user.userId, req.user.userId]);
    
    if (access.length === 0) {
      return res.status(403).json({ error: 'No write access to this document' });
    }
    
    await pool.execute(
      'UPDATE documents SET content = ?, title = COALESCE(?, title) WHERE id = ?',
      [content, title, documentId]
    );
    
    const [versions] = await pool.execute(
      'SELECT MAX(version_number) as max_version FROM document_versions WHERE document_id = ?',
      [documentId]
    );
    
    const newVersion = (versions[0].max_version || 0) + 1;
    await pool.execute(
      'INSERT INTO document_versions (document_id, content, version_number, created_by) VALUES (?, ?, ?, ?)',
      [documentId, content, newVersion, req.user.userId]
    );
    
    res.json({ message: 'Document updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update document' });
  }
});

// New Routes for Sharing and Collaboration
app.post('/api/documents/:id/share', authenticateToken, async (req, res) => {
    try {
        const documentId = req.params.id;
        const { usernameOrEmail, permission } = req.body;

        const [accessCheck] = await pool.execute(`
            SELECT 1 FROM documents d
            WHERE d.id = ? AND d.owner_id = ?
        `, [documentId, req.user.userId]);

        if (accessCheck.length === 0) {
            return res.status(403).json({ error: 'You do not have permission to share this document.' });
        }

        const [users] = await pool.execute(
            'SELECT id FROM users WHERE username = ? OR email = ?',
            [usernameOrEmail, usernameOrEmail]
        );

        if (users.length === 0) {
            return res.status(404).json({ error: 'User not found.' });
        }
        const collaboratorId = users[0].id;

        if (collaboratorId === req.user.userId) {
            return res.status(400).json({ error: 'Cannot share a document with yourself.' });
        }

        await pool.execute(
            'INSERT INTO document_collaborators (document_id, user_id, permission) VALUES (?, ?, ?)',
            [documentId, collaboratorId, permission]
        );

        res.status(201).json({ message: 'Document shared successfully.' });
    } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
            res.status(409).json({ error: 'Document already shared with this user.' });
        } else {
            console.error('Share error:', error);
            res.status(500).json({ error: 'Failed to share document.' });
        }
    }
});

app.get('/api/documents/:id/collaborators', authenticateToken, async (req, res) => {
    try {
        const documentId = req.params.id;
        
        const [collaborators] = await pool.execute(`
            SELECT u.username, dc.permission
            FROM document_collaborators dc
            JOIN users u ON dc.user_id = u.id
            WHERE dc.document_id = ?
        `, [documentId]);
        
        res.json(collaborators);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch collaborators' });
    }
});

// Document versions
app.get('/api/documents/:id/versions', authenticateToken, async (req, res) => {
  try {
    const documentId = req.params.id;
    
    const [versions] = await pool.execute(`
      SELECT dv.*, u.username as created_by_name 
      FROM document_versions dv 
      LEFT JOIN users u ON dv.created_by = u.id 
      WHERE dv.document_id = ? 
      ORDER BY dv.version_number DESC
    `, [documentId]);
    
    res.json(versions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch document versions' });
  }
});

// Socket.IO for real-time collaboration
const connectedUsers = new Map();
const documentUsers = new Map();

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error'));
  }
  
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return next(new Error('Authentication error'));
    }
    socket.userId = decoded.userId;
    socket.username = decoded.username;
    next();
  });
});

io.on('connection', (socket) => {
  console.log(`User ${socket.username} connected`);
  connectedUsers.set(socket.id, {
    userId: socket.userId,
    username: socket.username
  });
  
  socket.on('join-document', (documentId) => {
    socket.join(documentId);
    
    if (!documentUsers.has(documentId)) {
      documentUsers.set(documentId, new Map());
    }
    
    documentUsers.get(documentId).set(socket.id, {
      userId: socket.userId,
      username: socket.username,
      cursor: null
    });
    
    socket.to(documentId).emit('user-joined', {
      userId: socket.userId,
      username: socket.username
    });
    
    const usersInDocument = Array.from(documentUsers.get(documentId).values());
    socket.emit('document-users', usersInDocument);
  });
  
  socket.on('document-change', (data) => {
    socket.to(data.documentId).emit('document-change', {
      content: data.content,
      userId: socket.userId,
      username: socket.username,
      timestamp: Date.now()
    });
  });
  
  socket.on('cursor-position', (data) => {
    const docUsers = documentUsers.get(data.documentId);
    if (docUsers && docUsers.has(socket.id)) {
      docUsers.get(socket.id).cursor = data.position;
      
      socket.to(data.documentId).emit('cursor-position', {
        userId: socket.userId,
        username: socket.username,
        position: data.position
      });
    }
  });
  
  socket.on('leave-document', (documentId) => {
    socket.leave(documentId);
    
    const docUsers = documentUsers.get(documentId);
    if (docUsers) {
      docUsers.delete(socket.id);
      
      socket.to(documentId).emit('user-left', {
        userId: socket.userId,
        username: socket.username
      });
      
      if (docUsers.size === 0) {
        documentUsers.delete(documentId);
      }
    }
  });
  
  socket.on('disconnect', () => {
    console.log(`User ${socket.username} disconnected`);
    connectedUsers.delete(socket.id);
    
    for (const [documentId, users] of documentUsers.entries()) {
      if (users.has(socket.id)) {
        users.delete(socket.id);
        socket.to(documentId).emit('user-left', {
          userId: socket.userId,
          username: socket.username
        });
        
        if (users.size === 0) {
          documentUsers.delete(documentId);
        }
      }
    }
  });
});

// Serve the frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

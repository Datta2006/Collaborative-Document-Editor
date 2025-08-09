const mysql = require('mysql2/promise');
require('dotenv').config();

async function setupDatabase() {
  try {
    console.log('🚀 Setting up database...');
    
    // Connect to MySQL without specifying database
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || 'Datta@2006'
    });

    // Create database if it doesn't exist
    const dbName = process.env.DB_NAME || 'collaborative_editor';
    await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    console.log(`✅ Database '${dbName}' created/verified`);
    
    // Use the database
   await connection.changeUser({ database: dbName });


    // Create users table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Users table created/verified');

    // Create documents table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS documents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        content LONGTEXT,
        owner_id INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_owner_id (owner_id),
        INDEX idx_updated_at (updated_at)
      )
    `);
    console.log('✅ Documents table created/verified');

    // Create document collaborators table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS document_collaborators (
        id INT AUTO_INCREMENT PRIMARY KEY,
        document_id INT,
        user_id INT,
        permission ENUM('read', 'write') DEFAULT 'write',
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_collaboration (document_id, user_id),
        INDEX idx_document_id (document_id),
        INDEX idx_user_id (user_id)
      )
    `);
    console.log('✅ Document collaborators table created/verified');

    // Create document versions table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS document_versions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        document_id INT,
        content LONGTEXT,
        version_number INT,
        created_by INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
        INDEX idx_document_id (document_id),
        INDEX idx_version_number (version_number)
      )
    `);
    console.log('✅ Document versions table created/verified');

    // Create sample data (optional)
    const [existingUsers] = await connection.execute('SELECT COUNT(*) as count FROM users');
    if (existingUsers[0].count === 0) {
      console.log('📝 Creating sample data...');
      
      const bcrypt = require('bcrypt');
      const hashedPassword = await bcrypt.hash('demo123', 10);
      
      // Create demo user
      const [userResult] = await connection.execute(
        'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
        ['demo_user', 'demo@example.com', hashedPassword]
      );
      
      // Create demo document
      await connection.execute(
        'INSERT INTO documents (title, content, owner_id) VALUES (?, ?, ?)',
        ['Welcome Document', '<h1>Welcome to the Collaborative Editor!</h1><p>This is a sample document to get you started. You can edit this text in real-time with other users.</p>', userResult.insertId]
      );
      
      // Create initial version
      await connection.execute(
        'INSERT INTO document_versions (document_id, content, version_number, created_by) VALUES (?, ?, 1, ?)',
        [1, '<h1>Welcome to the Collaborative Editor!</h1><p>This is a sample document to get you started. You can edit this text in real-time with other users.</p>', userResult.insertId]
      );
      
      console.log('✅ Sample data created');
      console.log('👤 Demo user credentials:');
      console.log('   Username: demo_user');
      console.log('   Password: demo123');
    }

    await connection.end();
    console.log('🎉 Database setup completed successfully!');
    
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  }
}

setupDatabase();

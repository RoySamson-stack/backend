const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/scam_reports_db',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

pool.on('connect', () => {
  console.log('PostgreSQL connected successfully');
});

pool.on('error', (err) => {
  console.error('PostgreSQL connection error:', err);
  process.exit(1);
});

// Initialize database tables
const initializeDatabase = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS scam_reports (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        type VARCHAR(50) NOT NULL CHECK (type IN (
          'phishing', 'investment_scam', 'romance_scam', 'fake_online_store', 
          'tech_support_scam', 'lottery_scam', 'cryptocurrency_scam', 
          'employment_scam', 'other'
        )),
        status VARCHAR(50) NOT NULL CHECK (status IN (
          'pending', 'under_review', 'verified', 'resolved', 'rejected'
        )) DEFAULT 'pending',
        scammer_name VARCHAR(255),
        scammer_phone VARCHAR(50),
        scammer_email VARCHAR(255),
        scammer_website VARCHAR(255),
        scammer_social_media VARCHAR(255),
        amount_lost NUMERIC(12, 2) DEFAULT 0,
        date_of_incident DATE NOT NULL,
        location VARCHAR(255),
        view_count INTEGER DEFAULT 0,
        upvotes INTEGER DEFAULT 0,
        downvotes INTEGER DEFAULT 0,
        is_trending BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS report_evidence (
        id SERIAL PRIMARY KEY,
        report_id INTEGER REFERENCES scam_reports(id) ON DELETE CASCADE,
        url VARCHAR(512) NOT NULL,
        description TEXT
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        report_id INTEGER REFERENCES scam_reports(id),
        type VARCHAR(50) NOT NULL CHECK (type IN (
          'report_status_update', 'new_similar_scam', 'trending_alert', 'system_notification'
        )),
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Database tables initialized');
  } catch (error) {
    console.error('Database initialization error:', error);
    process.exit(1);
  }
};

// ADMIN ROUTES

// Get all users (admin function)
app.get('/api/users', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// USER ROUTES

// Create new user
app.post('/api/users', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING *',
      [name, email, password]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    if (error.code === '23505') { // Unique violation
      res.status(400).json({ message: 'Email already exists' });
    } else {
      res.status(400).json({ message: error.message });
    }
  }
});

// Get user profile
app.get('/api/users/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update user profile
app.put('/api/users/:id', async (req, res) => {
  try {
    const { name, email } = req.body;
    const { rows } = await pool.query(
      'UPDATE users SET name = $1, email = $2 WHERE id = $3 RETURNING *',
      [name, email, req.params.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// SCAM REPORT ROUTES

// Create new scam report
app.post('/api/reports', async (req, res) => {
  try {
    const { 
      title, 
      description, 
      type, 
      scammerInfo, 
      amountLost, 
      dateOfIncident, 
      location, 
      evidence 
    } = req.body;

    // Insert the report
    const { rows: reportRows } = await pool.query(
      `INSERT INTO scam_reports (
        title, description, type, scammer_name, scammer_phone, scammer_email,
        scammer_website, scammer_social_media, amount_lost, date_of_incident, location
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
      [
        title, 
        description, 
        type, 
        scammerInfo?.name, 
        scammerInfo?.phone, 
        scammerInfo?.email,
        scammerInfo?.website, 
        scammerInfo?.socialMedia, 
        amountLost || 0, 
        dateOfIncident, 
        location
      ]
    );

    const report = reportRows[0];

    // Insert evidence if any
    if (evidence && evidence.length > 0) {
      for (const item of evidence) {
        await pool.query(
          'INSERT INTO report_evidence (report_id, url, description) VALUES ($1, $2, $3)',
          [report.id, item.url || item, item.description]
        );
      }
    }

    // Get the full report with evidence
    const { rows: evidenceRows } = await pool.query(
      'SELECT * FROM report_evidence WHERE report_id = $1',
      [report.id]
    );

    res.status(201).json({
      ...report,
      evidence: evidenceRows
    });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Get all scam reports (general view)
app.get('/api/reports', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    let query = 'SELECT * FROM scam_reports';
    let countQuery = 'SELECT COUNT(*) FROM scam_reports';
    const params = [];
    
    // Build WHERE clause for filters
    const whereClauses = [];
    if (req.query.type) {
      whereClauses.push(`type = $${params.length + 1}`);
      params.push(req.query.type);
    }
    if (req.query.status) {
      whereClauses.push(`status = $${params.length + 1}`);
      params.push(req.query.status);
    }
    if (req.query.location) {
      whereClauses.push(`location ILIKE $${params.length + 1}`);
      params.push(`%${req.query.location}%`);
    }
    
    if (whereClauses.length > 0) {
      const whereClause = ' WHERE ' + whereClauses.join(' AND ');
      query += whereClause;
      countQuery += whereClause;
    }
    
    // Add pagination
    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    
    // Execute queries
    const { rows: reports } = await pool.query(query, params);
    const { rows: countRows } = await pool.query(countQuery, params.slice(0, -2));
    const total = parseInt(countRows[0].count);
    
    // Get evidence for each report
    for (const report of reports) {
      const { rows: evidence } = await pool.query(
        'SELECT * FROM report_evidence WHERE report_id = $1',
        [report.id]
      );
      report.evidence = evidence;
    }
    
    res.json({
      reports,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get trending scam reports
app.get('/api/reports/trending', async (req, res) => {
  try {
    const { rows: reports } = await pool.query(
      'SELECT * FROM scam_reports ORDER BY view_count DESC, upvotes DESC, created_at DESC LIMIT 20'
    );
    
    // Get evidence for each report
    for (const report of reports) {
      const { rows: evidence } = await pool.query(
        'SELECT * FROM report_evidence WHERE report_id = $1',
        [report.id]
      );
      report.evidence = evidence;
    }
    
    res.json(reports);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get specific scam report by ID
app.get('/api/reports/:id', async (req, res) => {
  try {
    const { rows: reportRows } = await pool.query(
      'SELECT * FROM scam_reports WHERE id = $1',
      [req.params.id]
    );
    
    if (reportRows.length === 0) {
      return res.status(404).json({ message: 'Report not found' });
    }
    
    const report = reportRows[0];
    
    // Increment view count
    await pool.query(
      'UPDATE scam_reports SET view_count = view_count + 1 WHERE id = $1',
      [req.params.id]
    );
    
    // Get evidence
    const { rows: evidence } = await pool.query(
      'SELECT * FROM report_evidence WHERE report_id = $1',
      [report.id]
    );
    
    res.json({
      ...report,
      evidence
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get reports by specific user ID
app.get('/api/users/:userId/reports', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;
    
    const { rows: reports } = await pool.query(
      'SELECT * FROM scam_reports WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
      [req.params.userId, limit, offset]
    );
    
    const { rows: countRows } = await pool.query(
      'SELECT COUNT(*) FROM scam_reports WHERE user_id = $1',
      [req.params.userId]
    );
    const total = parseInt(countRows[0].count);
    
    // Get evidence for each report
    for (const report of reports) {
      const { rows: evidence } = await pool.query(
        'SELECT * FROM report_evidence WHERE report_id = $1',
        [report.id]
      );
      report.evidence = evidence;
    }
    
    res.json({
      reports,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update scam report status (admin function)
app.put('/api/reports/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    
    const { rows: reportRows } = await pool.query(
      'UPDATE scam_reports SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    
    if (reportRows.length === 0) {
      return res.status(404).json({ message: 'Report not found' });
    }
    
    const report = reportRows[0];
    
    // Create notification for status update
    await pool.query(
      `INSERT INTO notifications (user_id, report_id, type, title, message)
       VALUES ($1, $2, 'report_status_update', 'Report Status Updated', $3)`,
      [report.user_id, report.id, `Your report "${report.title}" status has been updated to ${status}`]
    );
    
    res.json(report);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Vote on scam report
app.post('/api/reports/:id/vote', async (req, res) => {
  try {
    const { voteType } = req.body; // 'up' or 'down'
    
    let updateField;
    if (voteType === 'up') {
      updateField = 'upvotes = upvotes + 1';
    } else if (voteType === 'down') {
      updateField = 'downvotes = downvotes + 1';
    } else {
      return res.status(400).json({ message: 'Invalid vote type' });
    }
    
    const { rows } = await pool.query(
      `UPDATE scam_reports SET ${updateField} WHERE id = $1 RETURNING upvotes, downvotes`,
      [req.params.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Report not found' });
    }
    
    res.json({
      upvotes: rows[0].upvotes,
      downvotes: rows[0].downvotes
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete scam report
app.delete('/api/reports/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM scam_reports WHERE id = $1', [req.params.id]);
    if (rowCount === 0) {
      return res.status(404).json({ message: 'Report not found' });
    }
    res.json({ message: 'Report deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// NOTIFICATION ROUTES

// Get user notifications
app.get('/api/users/:userId/notifications', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    
    const { rows: notifications } = await pool.query(
      `SELECT n.*, r.title as report_title, r.type as report_type
       FROM notifications n
       LEFT JOIN scam_reports r ON n.report_id = r.id
       WHERE n.user_id = $1
       ORDER BY n.created_at DESC
       LIMIT $2 OFFSET $3`,
      [req.params.userId, limit, offset]
    );
    
    const { rows: countRows } = await pool.query(
      'SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = false',
      [req.params.userId]
    );
    const unreadCount = parseInt(countRows[0].count);
    
    res.json({
      notifications,
      unreadCount
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Mark notification as read
app.put('/api/notifications/:id/read', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE notifications SET is_read = true WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Mark all notifications as read for a user
app.put('/api/users/:userId/notifications/read-all', async (req, res) => {
  try {
    await pool.query(
      'UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false',
      [req.params.userId]
    );
    
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ANALYTICS ROUTES

// Get report statistics
app.get('/api/analytics/reports', async (req, res) => {
  try {
    const { rows: totalRows } = await pool.query('SELECT COUNT(*) FROM scam_reports');
    const totalReports = parseInt(totalRows[0].count);
    
    const { rows: typeRows } = await pool.query(
      'SELECT type as _id, COUNT(*) as count FROM scam_reports GROUP BY type'
    );
    
    const { rows: statusRows } = await pool.query(
      'SELECT status as _id, COUNT(*) as count FROM scam_reports GROUP BY status'
    );
    
    const { rows: amountRows } = await pool.query(
      'SELECT SUM(amount_lost) as total FROM scam_reports'
    );
    
    res.json({
      totalReports,
      reportsByType: typeRows,
      reportsByStatus: statusRows,
      totalAmountLost: parseFloat(amountRows[0].total) || 0
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Health check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Scam Reports API is running' });
});

// Start server
const startServer = async () => {
  await initializeDatabase();
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
};

startServer();
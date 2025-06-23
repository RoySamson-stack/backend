# PostgreSQL Database Setup Guide for Scam Reports App

Follow these steps to manually set up your PostgreSQL database on Kali Linux.

## Step 1: Install PostgreSQL

Check if PostgreSQL is installed:
```bash
psql --version
```

If not installed, install PostgreSQL:
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib -y
```

Start and enable PostgreSQL service:
```bash
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

## Step 2: Access PostgreSQL

Switch to postgres user and access PostgreSQL:
```bash
sudo -u postgres psql
```

## Step 3: Create Database and User

Create the database:
```sql
CREATE DATABASE scam_reports_db;
```

Create a user with password:
```sql
CREATE USER scam_admin WITH PASSWORD 'SecurePass123!';
```

Grant privileges to the user:
```sql
GRANT ALL PRIVILEGES ON DATABASE scam_reports_db TO scam_admin;
ALTER USER scam_admin CREATEDB;
```

Exit PostgreSQL:
```sql
\q
```

## Step 4: Connect to Your New Database

Connect to the new database:
```bash
sudo -u postgres psql -d scam_reports_db
```

## Step 5: Create Tables

Run these SQL commands to create all necessary tables:

### Users Table
```sql
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Scam Reports Table
```sql
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
```

### Report Evidence Table
```sql
CREATE TABLE IF NOT EXISTS report_evidence (
    id SERIAL PRIMARY KEY,
    report_id INTEGER REFERENCES scam_reports(id) ON DELETE CASCADE,
    url VARCHAR(512) NOT NULL,
    description TEXT
);
```

### Notifications Table
```sql
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
```

## Step 6: Create Indexes

Add these indexes for better performance:
```sql
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_scam_reports_user_id ON scam_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_scam_reports_type ON scam_reports(type);
CREATE INDEX IF NOT EXISTS idx_scam_reports_status ON scam_reports(status);
CREATE INDEX IF NOT EXISTS idx_scam_reports_created_at ON scam_reports(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
```

## Step 7: Grant Permissions

Grant all necessary permissions:
```sql
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO scam_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO scam_admin;
```

## Step 8: Insert Sample Data (Optional)

Add some sample data for testing:

### Sample Users
```sql
INSERT INTO users (name, email, password) VALUES 
('John Doe', 'john@example.com', '$2b$10$hash_password_here'),
('Jane Smith', 'jane@example.com', '$2b$10$hash_password_here'),
('Admin User', 'admin@scamalert.com', '$2b$10$hash_password_here')
ON CONFLICT (email) DO NOTHING;
```

### Sample Scam Reports
```sql
INSERT INTO scam_reports (user_id, title, description, type, scammer_name, scammer_email, amount_lost, date_of_incident, location) VALUES 
(1, 'Fake Investment Opportunity', 'Someone contacted me claiming to offer 200% returns on crypto investment', 'investment_scam', 'John Scammer', 'scammer@fake.com', 5000.00, '2024-01-15', 'Nakuru),
(2, 'Phishing Email Alert', 'Received fake bank email asking for login credentials', 'phishing', 'Bank Impersonator', 'fake@bank.com', 0.00, '2024-01-20', 'Kisumu'),
(1, 'Romance Scam Warning', 'Met someone online who asked for money after building relationship', 'romance_scam', 'Fake Romeo', 'love@fake.com', 2500.00, '2024-01-10', 'Nairobi');
```

### Sample Notifications
```sql
INSERT INTO notifications (user_id, report_id, type, title, message) VALUES 
(1, 1, 'report_status_update', 'Report Status Updated', 'Your report has been verified'),
(2, 2, 'report_status_update', 'Report Under Review', 'Your report is being reviewed'),
(1, 3, 'trending_alert', 'Your Report is Trending', 'Your report is getting attention');
```

Exit PostgreSQL:
```sql
\q
```

## Step 9: Create Environment File

Create a `.env` file in your project directory with the following content:

```env
# Database Configuration
DATABASE_URL=postgresql://scam_admin:SecurePass123!@localhost:5432/scam_reports_db
DB_HOST=localhost
DB_PORT=5432
DB_NAME=scam_reports_db
DB_USER=scam_admin
DB_PASSWORD=SecurePass123!

# Server Configuration
PORT=5000
NODE_ENV=development

# JWT Secret (change this in production)
JWT_SECRET=your_super_secure_jwt_secret_key_here

# CORS Origin
CORS_ORIGIN=http://localhost:3000
```

## Step 10: Test Your Connection

Test the database connection:
```bash
psql -U scam_admin -d scam_reports_db -h localhost
```



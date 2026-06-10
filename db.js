const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const bcrypt = require('bcryptjs');

const db = new DatabaseSync(path.join(__dirname, 'data.db'));
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    department TEXT,
    position TEXT,
    phone TEXT,
    manager_id INTEGER,
    joined_at TEXT DEFAULT (date('now')),
    leave_balance INTEGER NOT NULL DEFAULT 20,
    employee_code TEXT,
    employment_type TEXT,
    work_location TEXT,
    skills TEXT,
    FOREIGN KEY (manager_id) REFERENCES employees(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'hr', 'manager', 'employee')),
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    clock_in TEXT,
    clock_out TEXT,
    UNIQUE (employee_id, date),
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS leave_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    type TEXT NOT NULL,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    reviewer_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewer_id) REFERENCES employees(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    client TEXT,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'on_hold', 'completed')),
    start_date TEXT,
    end_date TEXT,
    lead_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (lead_id) REFERENCES employees(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS project_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    employee_id INTEGER NOT NULL,
    role_on_project TEXT,
    allocation_percent INTEGER NOT NULL DEFAULT 100 CHECK (allocation_percent BETWEEN 0 AND 100),
    start_date TEXT,
    end_date TEXT,
    UNIQUE (project_id, employee_id),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS timesheet_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    project_id INTEGER NOT NULL,
    work_date TEXT NOT NULL,
    hours REAL NOT NULL CHECK (hours > 0 AND hours <= 24),
    task_description TEXT,
    status TEXT NOT NULL DEFAULT 'draft'
      CHECK (status IN ('draft', 'submitted', 'approved', 'rejected')),
    reviewer_id INTEGER,
    decided_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewer_id) REFERENCES employees(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS expense_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    project_id INTEGER,
    category TEXT NOT NULL,
    amount REAL NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    expense_date TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending', 'approved', 'rejected', 'paid')),
    reviewer_id INTEGER,
    decided_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    FOREIGN KEY (reviewer_id) REFERENCES employees(id) ON DELETE SET NULL
  );
`);

function migrate() {
  // 1) Add IT-enterprise columns to employees if missing.
  const empCols = db.prepare(`PRAGMA table_info(employees)`).all().map(c => c.name);
  const addCol = (name, decl) => {
    if (!empCols.includes(name)) {
      db.exec(`ALTER TABLE employees ADD COLUMN ${name} ${decl}`);
    }
  };
  addCol('employee_code', 'TEXT');
  addCol('employment_type', 'TEXT');
  addCol('work_location', 'TEXT');
  addCol('skills', 'TEXT');

  // 2) If users.role CHECK constraint excludes 'hr', rebuild the users table.
  const usersDdl = db.prepare(
    `SELECT sql FROM sqlite_master WHERE type='table' AND name='users'`
  ).get()?.sql || '';
  if (!usersDdl.includes("'hr'")) {
    console.log('Migrating users.role to allow hr...');
    db.exec(`
      BEGIN;
      CREATE TABLE users__new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id INTEGER NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'hr', 'manager', 'employee')),
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
      );
      INSERT INTO users__new (id, employee_id, password_hash, role)
        SELECT id, employee_id, password_hash, role FROM users;
      DROP TABLE users;
      ALTER TABLE users__new RENAME TO users;
      COMMIT;
    `);
  }

  // 3) Idempotent: ensure an HR demo user exists (for existing databases
  //    where the original seed has already run without an HR role).
  const hrExists = db.prepare(
    `SELECT 1 FROM users WHERE role='hr' LIMIT 1`
  ).get();
  if (!hrExists) {
    const existingHrEmp = db.prepare(
      `SELECT id FROM employees WHERE email='hr@hrms.local'`
    ).get();
    let hrEmpId = existingHrEmp?.id;
    if (!hrEmpId) {
      hrEmpId = db.prepare(`
        INSERT INTO employees
          (name, email, department, position, joined_at, leave_balance,
           employee_code, employment_type, work_location, skills)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'Priya HR', 'hr@hrms.local', 'Human Resources', 'HR Business Partner',
        '2024-01-15', 22,
        'HR-0001', 'Full-time', 'Hybrid', 'Recruitment, Payroll, Compliance'
      ).lastInsertRowid;
    }
    db.prepare(`
      INSERT INTO users (employee_id, password_hash, role) VALUES (?, ?, ?)
    `).run(hrEmpId, bcrypt.hashSync('hr123', 10), 'hr');
    console.log('Bootstrapped HR demo user: hr@hrms.local / hr123');
  }

  // 4) Idempotent: seed sample projects, allocations and expense claims if empty.
  const projectCount = db.prepare(`SELECT COUNT(*) AS n FROM projects`).get().n;
  if (projectCount === 0) {
    const lookup = (email) => db.prepare(`SELECT id FROM employees WHERE email=?`).get(email)?.id;
    const sarah = lookup('sarah@hrms.local');
    const john = lookup('john@hrms.local');
    const jane = lookup('jane@hrms.local');
    const ravi = lookup('ravi@hrms.local');

    if (sarah && john) {
      const p1 = db.prepare(`
        INSERT INTO projects (code, name, client, description, status, start_date, end_date, lead_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'PRJ-001', 'Customer Portal Revamp', 'Acme Corp',
        'Migrate legacy customer portal to React + Node microservices.',
        'active', '2025-09-01', '2026-08-31', sarah,
      ).lastInsertRowid;

      const p2 = db.prepare(`
        INSERT INTO projects (code, name, client, description, status, start_date, end_date, lead_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        'PRJ-002', 'Internal Data Lake', 'Internal',
        'Build a unified analytics data lake on AWS.',
        'active', '2026-01-15', null, sarah,
      ).lastInsertRowid;

      const allocate = db.prepare(`
        INSERT INTO project_allocations
          (project_id, employee_id, role_on_project, allocation_percent, start_date)
        VALUES (?, ?, ?, ?, ?)
      `);
      if (john) allocate.run(p1, john, 'Backend Developer', 80, '2025-09-01');
      if (jane) allocate.run(p1, jane, 'Tech Lead', 60, '2025-09-01');
      if (jane) allocate.run(p2, jane, 'Tech Lead', 40, '2026-01-15');
      if (ravi) allocate.run(p2, ravi, 'DevOps Engineer', 100, '2026-01-15');

      const expense = db.prepare(`
        INSERT INTO expense_claims
          (employee_id, project_id, category, amount, currency, expense_date, description, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      if (john) expense.run(john, p1, 'Travel', 4500, 'INR', '2026-05-10',
        'Client onsite visit – cab fare', 'pending');
      if (jane) expense.run(jane, p1, 'Software', 2999, 'INR', '2026-05-12',
        'JetBrains All Products Pack – annual', 'pending');
      if (ravi) expense.run(ravi, p2, 'Hardware', 18500, 'INR', '2026-04-20',
        'External SSD for build cache', 'approved');

      const timesheet = db.prepare(`
        INSERT INTO timesheet_entries
          (employee_id, project_id, work_date, hours, task_description, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (john) {
        timesheet.run(john, p1, yesterday, 6.5, 'Implemented order export API', 'submitted');
        timesheet.run(john, p1, today, 2, 'Code review + standup', 'draft');
      }
      if (jane) {
        timesheet.run(jane, p1, yesterday, 4, 'Architecture review for payment module', 'approved');
        timesheet.run(jane, p2, yesterday, 3, 'Data lake schema design', 'submitted');
      }
      if (ravi) {
        timesheet.run(ravi, p2, yesterday, 8, 'EKS cluster bootstrap + Terraform module', 'approved');
      }

      console.log('Bootstrapped 2 sample projects, 4 allocations, 3 expense claims, 5 timesheet entries.');
    }
  }
}

migrate();

function seed() {
  const existingAdmin = db.prepare(` SELECT id FROM employees WHERE email = ? `).get('admin@hrms.local'); 
  if (existingAdmin) return;

  console.log('Seeding initial data...');
  const insertEmp = db.prepare(`
    INSERT INTO employees
      (name, email, department, position, manager_id, joined_at, leave_balance,
       employee_code, employment_type, work_location, skills)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertUser = db.prepare(`
    INSERT INTO users (employee_id, password_hash, role) VALUES (?, ?, ?)
  `);

  const adminId = insertEmp.run(
    'Admin User', 'admin@hrms.local', 'IT', 'System Administrator',
    null, '2024-01-01', 20,
    'IT-0001', 'Full-time', 'Onsite', 'Linux, AWS, Networking'
  ).lastInsertRowid;
  insertUser.run(adminId, bcrypt.hashSync('admin123', 10), 'admin');

  const mgrId = insertEmp.run(
    'Sarah Manager', 'sarah@hrms.local', 'Engineering', 'Engineering Manager',
    null, '2024-02-10', 20,
    'ENG-0010', 'Full-time', 'Hybrid', 'Team leadership, Architecture, Java'
  ).lastInsertRowid;
  insertUser.run(mgrId, bcrypt.hashSync('manager123', 10), 'manager');

  const e1 = insertEmp.run(
    'John Doe', 'john@hrms.local', 'Engineering', 'Software Engineer',
    mgrId, '2024-03-15', 18,
    'ENG-0021', 'Full-time', 'Remote', 'Node.js, React, PostgreSQL'
  ).lastInsertRowid;
  insertUser.run(e1, bcrypt.hashSync('employee123', 10), 'employee');

  const e2 = insertEmp.run(
    'Jane Smith', 'jane@hrms.local', 'Engineering', 'Senior Software Engineer',
    mgrId, '2023-11-05', 15,
    'ENG-0014', 'Full-time', 'Onsite', 'Python, Django, Kubernetes, GCP'
  ).lastInsertRowid;
  insertUser.run(e2, bcrypt.hashSync('employee123', 10), 'employee');

  const e3 = insertEmp.run(
    'Ravi Kumar', 'ravi@hrms.local', 'Engineering', 'DevOps Engineer',
    mgrId, '2024-06-01', 20,
    'ENG-0025', 'Contractor', 'Remote', 'Terraform, AWS, CI/CD, Docker'
  ).lastInsertRowid;
  insertUser.run(e3, bcrypt.hashSync('employee123', 10), 'employee');

  console.log('Seeded. Default logins:');
  console.log('  admin@hrms.local   / admin123');
  console.log('  hr@hrms.local      / hr123');
  console.log('  sarah@hrms.local   / manager123');
  console.log('  john@hrms.local    / employee123');
  console.log('  jane@hrms.local    / employee123');
  console.log('  ravi@hrms.local    / employee123');
}

seed();

module.exports = db;

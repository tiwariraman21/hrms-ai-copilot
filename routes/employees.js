const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

const canManage = requireRole('admin', 'hr');

router.get('/', (req, res) => {
  const employees = db.prepare(`
    SELECT e.*, m.name AS manager_name, u.role
    FROM employees e
    LEFT JOIN employees m ON m.id = e.manager_id
    LEFT JOIN users u ON u.employee_id = e.id
    ORDER BY e.name
  `).all();
  res.render('employees/list', {
    title: 'Employees',
    user: req.session.user,
    employees,
    flash: { info: req.flash('info'), error: req.flash('error') },
  });
});

router.get('/new', canManage, (req, res) => {
  const managers = db.prepare(`SELECT id, name FROM employees ORDER BY name`).all();
  res.render('employees/form', {
    title: 'Add Employee',
    user: req.session.user,
    managers,
    employee: null,
    error: req.flash('error'),
  });
});

router.post('/new', canManage, (req, res) => {
  const {
    name, email, department, position, phone, manager_id, role, password,
    employee_code, employment_type, work_location, skills,
  } = req.body;
  if (!name || !email || !password || !role) {
    req.flash('error', 'Name, email, role, and password are required.');
    return res.redirect('/employees/new');
  }
  // HR cannot create admin accounts; only admin can.
  if (role === 'admin' && req.session.user.role !== 'admin') {
    req.flash('error', 'Only an admin can create admin accounts.');
    return res.redirect('/employees/new');
  }
  try {
    const result = db.prepare(`
      INSERT INTO employees
        (name, email, department, position, phone, manager_id,
         employee_code, employment_type, work_location, skills)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      name, email, department || null, position || null, phone || null,
      manager_id || null,
      employee_code || null, employment_type || null,
      work_location || null, skills || null,
    );
    db.prepare(`
      INSERT INTO users (employee_id, password_hash, role) VALUES (?, ?, ?)
    `).run(result.lastInsertRowid, bcrypt.hashSync(password, 10), role);
    req.flash('info', `Created employee ${name}.`);
    res.redirect('/employees');
  } catch (e) {
    req.flash('error', e.message);
    res.redirect('/employees/new');
  }
});

router.get('/:id', (req, res) => {
  const emp = db.prepare(`
    SELECT e.*, m.name AS manager_name, u.role
    FROM employees e
    LEFT JOIN employees m ON m.id = e.manager_id
    LEFT JOIN users u ON u.employee_id = e.id
    WHERE e.id = ?
  `).get(req.params.id);
  if (!emp) return res.status(404).render('error', {
    title: 'Not found', message: 'Employee not found.', user: req.session.user,
  });
  const allocations = db.prepare(`
    SELECT pa.*, p.code, p.name, p.status
    FROM project_allocations pa
    JOIN projects p ON p.id = pa.project_id
    WHERE pa.employee_id=?
    ORDER BY p.status, p.code
  `).all(emp.id);
  res.render('employees/profile', {
    title: emp.name,
    user: req.session.user,
    emp,
    allocations,
  });
});

router.get('/:id/edit', canManage, (req, res) => {
  const employee = db.prepare(`
    SELECT e.*, u.role FROM employees e LEFT JOIN users u ON u.employee_id = e.id WHERE e.id = ?
  `).get(req.params.id);
  if (!employee) return res.status(404).render('error', {
    title: 'Not found', message: 'Employee not found.', user: req.session.user,
  });
  const managers = db.prepare(`SELECT id, name FROM employees WHERE id != ? ORDER BY name`).all(req.params.id);
  res.render('employees/form', {
    title: 'Edit Employee',
    user: req.session.user,
    managers,
    employee,
    error: req.flash('error'),
  });
});

router.post('/:id/edit', canManage, (req, res) => {
  const {
    name, email, department, position, phone, manager_id, role, leave_balance,
    employee_code, employment_type, work_location, skills,
  } = req.body;

  // HR cannot promote anyone to admin or modify an existing admin's role.
  if (req.session.user.role === 'hr') {
    const target = db.prepare(`SELECT role FROM users WHERE employee_id=?`).get(req.params.id);
    if (target?.role === 'admin' || role === 'admin') {
      req.flash('error', 'HR cannot modify admin accounts.');
      return res.redirect(`/employees/${req.params.id}/edit`);
    }
  }

  try {
    db.prepare(`
      UPDATE employees SET
        name=?, email=?, department=?, position=?, phone=?, manager_id=?, leave_balance=?,
        employee_code=?, employment_type=?, work_location=?, skills=?
      WHERE id=?
    `).run(
      name, email, department || null, position || null, phone || null,
      manager_id || null, parseInt(leave_balance, 10) || 0,
      employee_code || null, employment_type || null,
      work_location || null, skills || null,
      req.params.id,
    );
    if (role) {
      db.prepare(`UPDATE users SET role=? WHERE employee_id=?`).run(role, req.params.id);
    }
    req.flash('info', 'Employee updated.');
    res.redirect(`/employees/${req.params.id}`);
  } catch (e) {
    req.flash('error', e.message);
    res.redirect(`/employees/${req.params.id}/edit`);
  }
});

// Only admin can delete; HR cannot.
router.post('/:id/delete', requireRole('admin'), (req, res) => {
  if (parseInt(req.params.id, 10) === req.session.user.employee_id) {
    req.flash('error', 'You cannot delete your own account.');
    return res.redirect('/employees');
  }
  db.prepare(`DELETE FROM employees WHERE id=?`).run(req.params.id);
  req.flash('info', 'Employee removed.');
  res.redirect('/employees');
});

module.exports = router;

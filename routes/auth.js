const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');

const router = express.Router();

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('login', {
    title: 'Login',
    error: req.flash('error'),
    info: req.flash('info'),
  });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const row = db.prepare(`
    SELECT u.id, u.password_hash, u.role, e.id AS employee_id, e.name, e.email
    FROM users u JOIN employees e ON e.id = u.employee_id
    WHERE e.email = ?
  `).get(email);

  console.log(row);

  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    req.flash('error', 'Invalid email or password.');
    return res.redirect('/login');
  }

  req.session.user = {
    id: row.id,
    employee_id: row.employee_id,
    name: row.name,
    email: row.email,
    role: row.role,
  };
  res.redirect('/dashboard');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

module.exports = router;

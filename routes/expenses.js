const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

const EXPENSE_CATEGORIES = ['Travel', 'Food', 'Hardware', 'Software', 'Training', 'Other'];

router.get('/', (req, res) => {
  const user = req.session.user;
  const claims = db.prepare(`
    SELECT ec.*, p.code AS project_code, r.name AS reviewer_name
    FROM expense_claims ec
    LEFT JOIN projects p ON p.id = ec.project_id
    LEFT JOIN employees r ON r.id = ec.reviewer_id
    WHERE ec.employee_id = ?
    ORDER BY ec.created_at DESC
  `).all(user.employee_id);

  const totals = db.prepare(`
    SELECT
      SUM(CASE WHEN status='pending' THEN amount ELSE 0 END) AS pending_amt,
      SUM(CASE WHEN status='approved' THEN amount ELSE 0 END) AS approved_amt,
      SUM(CASE WHEN status='paid' THEN amount ELSE 0 END) AS paid_amt
    FROM expense_claims WHERE employee_id=?
  `).get(user.employee_id);

  res.render('expenses/index', {
    title: 'My Expenses',
    user,
    claims,
    totals: {
      pending: totals?.pending_amt || 0,
      approved: totals?.approved_amt || 0,
      paid: totals?.paid_amt || 0,
    },
    flash: { info: req.flash('info'), error: req.flash('error') },
  });
});

router.get('/new', (req, res) => {
  const user = req.session.user;
  const projects = db.prepare(`
    SELECT p.id, p.code, p.name
    FROM project_allocations pa
    JOIN projects p ON p.id = pa.project_id
    WHERE pa.employee_id=? AND p.status != 'completed'
    ORDER BY p.code
  `).all(user.employee_id);
  res.render('expenses/form', {
    title: 'Submit Expense Claim',
    user,
    projects,
    categories: EXPENSE_CATEGORIES,
    error: req.flash('error'),
  });
});

router.post('/new', (req, res) => {
  const { project_id, category, amount, currency, expense_date, description } = req.body;
  const amt = parseFloat(amount);
  if (!category || !amt || amt <= 0 || !expense_date) {
    req.flash('error', 'Category, positive amount and date are required.');
    return res.redirect('/expenses/new');
  }
  if (!EXPENSE_CATEGORIES.includes(category)) {
    req.flash('error', 'Invalid category.');
    return res.redirect('/expenses/new');
  }
  try {
    db.prepare(`
      INSERT INTO expense_claims
        (employee_id, project_id, category, amount, currency, expense_date, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      req.session.user.employee_id,
      project_id || null,
      category, amt, currency || 'INR',
      expense_date, description || null,
    );
    req.flash('info', 'Expense submitted for approval.');
    res.redirect('/expenses');
  } catch (e) {
    req.flash('error', e.message);
    res.redirect('/expenses/new');
  }
});

router.get('/pending', requireRole('admin', 'hr', 'manager'), (req, res) => {
  const user = req.session.user;
  const rows = (user.role === 'manager')
    ? db.prepare(`
        SELECT ec.*, e.name, e.department, p.code AS project_code
        FROM expense_claims ec
        JOIN employees e ON e.id = ec.employee_id
        LEFT JOIN projects p ON p.id = ec.project_id
        WHERE ec.status='pending' AND e.manager_id=?
        ORDER BY ec.created_at
      `).all(user.employee_id)
    : db.prepare(`
        SELECT ec.*, e.name, e.department, p.code AS project_code
        FROM expense_claims ec
        JOIN employees e ON e.id = ec.employee_id
        LEFT JOIN projects p ON p.id = ec.project_id
        WHERE ec.status='pending'
        ORDER BY ec.created_at
      `).all();

  const approvedAwaitingPayout = (user.role === 'admin')
    ? db.prepare(`
        SELECT ec.*, e.name, p.code AS project_code
        FROM expense_claims ec
        JOIN employees e ON e.id = ec.employee_id
        LEFT JOIN projects p ON p.id = ec.project_id
        WHERE ec.status='approved'
        ORDER BY ec.decided_at
      `).all()
    : [];

  res.render('expenses/pending', {
    title: 'Expense Approvals',
    user,
    rows,
    approvedAwaitingPayout,
    flash: { info: req.flash('info'), error: req.flash('error') },
  });
});

router.post('/:id/decide', requireRole('admin', 'hr', 'manager'), (req, res) => {
  const { decision } = req.body;
  if (!['approved', 'rejected'].includes(decision)) {
    req.flash('error', 'Invalid decision.');
    return res.redirect('/expenses/pending');
  }
  const ec = db.prepare(`SELECT * FROM expense_claims WHERE id=?`).get(req.params.id);
  if (!ec || ec.status !== 'pending') {
    req.flash('error', 'Claim not found or already decided.');
    return res.redirect('/expenses/pending');
  }
  if (req.session.user.role === 'manager') {
    const emp = db.prepare(`SELECT manager_id FROM employees WHERE id=?`).get(ec.employee_id);
    if (!emp || emp.manager_id !== req.session.user.employee_id) {
      req.flash('error', 'You can only decide claims from your direct reports.');
      return res.redirect('/expenses/pending');
    }
  }
  db.prepare(`
    UPDATE expense_claims SET status=?, reviewer_id=?, decided_at=datetime('now')
    WHERE id=?
  `).run(decision, req.session.user.employee_id, req.params.id);
  req.flash('info', `Claim ${decision}.`);
  res.redirect('/expenses/pending');
});

router.post('/:id/pay', requireRole('admin'), (req, res) => {
  const ec = db.prepare(`SELECT * FROM expense_claims WHERE id=?`).get(req.params.id);
  if (!ec || ec.status !== 'approved') {
    req.flash('error', 'Only approved claims can be marked paid.');
    return res.redirect('/expenses/pending');
  }
  db.prepare(`UPDATE expense_claims SET status='paid', decided_at=datetime('now') WHERE id=?`)
    .run(req.params.id);
  req.flash('info', 'Claim marked as paid.');
  res.redirect('/expenses/pending');
});

module.exports = router;

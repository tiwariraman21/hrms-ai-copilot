const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

function daysBetween(start, end) {
  const ms = (new Date(end) - new Date(start));
  return Math.floor(ms / (1000 * 60 * 60 * 24)) + 1;
}

router.get('/', (req, res) => {
  const empId = req.session.user.employee_id;
  const requests = db.prepare(`
    SELECT lr.*, r.name AS reviewer_name
    FROM leave_requests lr
    LEFT JOIN employees r ON r.id = lr.reviewer_id
    WHERE lr.employee_id=? ORDER BY lr.created_at DESC
  `).all(empId);
  const me = db.prepare(`SELECT leave_balance FROM employees WHERE id=?`).get(empId);
  res.render('leave/index', {
    title: 'My Leave',
    user: req.session.user,
    requests,
    balance: me?.leave_balance ?? 0,
    flash: { info: req.flash('info'), error: req.flash('error') },
  });
});

router.get('/new', (req, res) => {
  res.render('leave/form', {
    title: 'Apply for Leave',
    user: req.session.user,
    error: req.flash('error'),
  });
});

router.post('/new', (req, res) => {
  const { start_date, end_date, type, reason } = req.body;
  if (!start_date || !end_date || !type) {
    req.flash('error', 'Start date, end date and type are required.');
    return res.redirect('/leave/new');
  }
  if (new Date(end_date) < new Date(start_date)) {
    req.flash('error', 'End date must be after start date.');
    return res.redirect('/leave/new');
  }
  db.prepare(`
    INSERT INTO leave_requests (employee_id, start_date, end_date, type, reason)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.session.user.employee_id, start_date, end_date, type, reason || null);
  req.flash('info', 'Leave request submitted for approval.');
  res.redirect('/leave');
});

router.get('/pending', requireRole('admin', 'hr', 'manager'), (req, res) => {
  const user = req.session.user;
  // Admin & HR see everyone's pending; managers see only their direct reports.
  const rows = (user.role === 'manager')
    ? db.prepare(`
        SELECT lr.*, e.name, e.department
        FROM leave_requests lr JOIN employees e ON e.id = lr.employee_id
        WHERE lr.status='pending' AND e.manager_id=? ORDER BY lr.created_at
      `).all(user.employee_id)
    : db.prepare(`
        SELECT lr.*, e.name, e.department
        FROM leave_requests lr JOIN employees e ON e.id = lr.employee_id
        WHERE lr.status='pending' ORDER BY lr.created_at
      `).all();
  res.render('leave/pending', {
    title: 'Pending Leave Approvals',
    user,
    rows,
    flash: { info: req.flash('info'), error: req.flash('error') },
  });
});

router.post('/:id/decide', requireRole('admin', 'hr', 'manager'), (req, res) => {
  const { decision } = req.body;
  if (!['approved', 'rejected'].includes(decision)) {
    req.flash('error', 'Invalid decision.');
    return res.redirect('/leave/pending');
  }
  const lr = db.prepare(`SELECT * FROM leave_requests WHERE id=?`).get(req.params.id);
  if (!lr || lr.status !== 'pending') {
    req.flash('error', 'Request not found or already decided.');
    return res.redirect('/leave/pending');
  }

  // Managers can only decide on their own direct reports' requests.
  if (req.session.user.role === 'manager') {
    const emp = db.prepare(`SELECT manager_id FROM employees WHERE id=?`).get(lr.employee_id);
    if (!emp || emp.manager_id !== req.session.user.employee_id) {
      req.flash('error', 'You can only approve requests from your direct reports.');
      return res.redirect('/leave/pending');
    }
  }

  db.prepare(`UPDATE leave_requests SET status=?, reviewer_id=? WHERE id=?`)
    .run(decision, req.session.user.employee_id, req.params.id);

  if (decision === 'approved') {
    const days = daysBetween(lr.start_date, lr.end_date);
    db.prepare(`UPDATE employees SET leave_balance = MAX(0, leave_balance - ?) WHERE id=?`)
      .run(days, lr.employee_id);
  }
  req.flash('info', `Request ${decision}.`);
  res.redirect('/leave/pending');
});

module.exports = router;

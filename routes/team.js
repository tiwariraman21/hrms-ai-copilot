const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireRole('manager', 'admin', 'hr'));

router.get('/', (req, res) => {
  const user = req.session.user;
  const today = new Date().toISOString().slice(0, 10);

  // Admin & HR can see the whole org grouped; managers see their direct reports.
  const members = (user.role === 'manager')
    ? db.prepare(`
        SELECT e.*, u.role,
          (SELECT clock_in FROM attendance WHERE employee_id=e.id AND date=?) AS clock_in_today,
          (SELECT clock_out FROM attendance WHERE employee_id=e.id AND date=?) AS clock_out_today
        FROM employees e
        LEFT JOIN users u ON u.employee_id = e.id
        WHERE e.manager_id=?
        ORDER BY e.name
      `).all(today, today, user.employee_id)
    : db.prepare(`
        SELECT e.*, u.role, m.name AS manager_name,
          (SELECT clock_in FROM attendance WHERE employee_id=e.id AND date=?) AS clock_in_today,
          (SELECT clock_out FROM attendance WHERE employee_id=e.id AND date=?) AS clock_out_today
        FROM employees e
        LEFT JOIN users u ON u.employee_id = e.id
        LEFT JOIN employees m ON m.id = e.manager_id
        ORDER BY e.department, e.name
      `).all(today, today);

  const pendingLeave = (user.role === 'manager')
    ? db.prepare(`
        SELECT COUNT(*) AS n FROM leave_requests lr
        JOIN employees e ON e.id = lr.employee_id
        WHERE lr.status='pending' AND e.manager_id=?
      `).get(user.employee_id).n
    : db.prepare(`SELECT COUNT(*) AS n FROM leave_requests WHERE status='pending'`).get().n;

  res.render('team/index', {
    title: user.role === 'manager' ? 'My Team' : 'Organisation',
    user,
    members,
    pendingLeave,
    today,
  });
});

module.exports = router;

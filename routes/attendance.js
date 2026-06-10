const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

function today() {
  return new Date().toISOString().slice(0, 10);
}
function nowTime() {
  return new Date().toTimeString().slice(0, 8);
}

router.get('/', (req, res) => {
  const empId = req.session.user.employee_id;
  const todayRow = db.prepare(`SELECT * FROM attendance WHERE employee_id=? AND date=?`).get(empId, today());
  const records = db.prepare(`
    SELECT * FROM attendance WHERE employee_id=? ORDER BY date DESC LIMIT 30
  `).all(empId);

  // Monthly summary (current month).
  const monthStart = today().slice(0, 7) + '-01';
  const monthly = db.prepare(`
    SELECT COUNT(*) AS days_present,
           SUM(CASE WHEN clock_out IS NOT NULL THEN 1 ELSE 0 END) AS days_completed
    FROM attendance
    WHERE employee_id=? AND date >= ?
  `).get(empId, monthStart);

  res.render('attendance/index', {
    title: 'My Attendance',
    user: req.session.user,
    today: todayRow,
    records,
    monthly: monthly || { days_present: 0, days_completed: 0 },
    flash: { info: req.flash('info'), error: req.flash('error') },
  });
});

router.post('/clock-in', (req, res) => {
  const empId = req.session.user.employee_id;
  const existing = db.prepare(`SELECT * FROM attendance WHERE employee_id=? AND date=?`).get(empId, today());
  if (existing && existing.clock_in) {
    req.flash('error', 'You have already clocked in today.');
  } else if (existing) {
    db.prepare(`UPDATE attendance SET clock_in=? WHERE id=?`).run(nowTime(), existing.id);
    req.flash('info', `Clocked in at ${nowTime()}.`);
  } else {
    db.prepare(`INSERT INTO attendance (employee_id, date, clock_in) VALUES (?, ?, ?)`)
      .run(empId, today(), nowTime());
    req.flash('info', `Clocked in at ${nowTime()}.`);
  }
  res.redirect('/attendance');
});

router.post('/clock-out', (req, res) => {
  const empId = req.session.user.employee_id;
  const existing = db.prepare(`SELECT * FROM attendance WHERE employee_id=? AND date=?`).get(empId, today());
  if (!existing || !existing.clock_in) {
    req.flash('error', 'You need to clock in first.');
  } else if (existing.clock_out) {
    req.flash('error', 'You have already clocked out today.');
  } else {
    db.prepare(`UPDATE attendance SET clock_out=? WHERE id=?`).run(nowTime(), existing.id);
    req.flash('info', `Clocked out at ${nowTime()}.`);
  }
  res.redirect('/attendance');
});

router.get('/all', requireRole('admin', 'hr', 'manager'), (req, res) => {
  const user = req.session.user;
  // Managers see only their direct reports; admin & HR see everyone.
  const rows = (user.role === 'manager')
    ? db.prepare(`
        SELECT a.*, e.name, e.department
        FROM attendance a JOIN employees e ON e.id = a.employee_id
        WHERE e.manager_id=?
        ORDER BY a.date DESC, e.name
        LIMIT 200
      `).all(user.employee_id)
    : db.prepare(`
        SELECT a.*, e.name, e.department
        FROM attendance a JOIN employees e ON e.id = a.employee_id
        ORDER BY a.date DESC, e.name
        LIMIT 200
      `).all();

  res.render('attendance/all', {
    title: user.role === 'manager' ? 'Team Attendance' : 'All Attendance',
    user,
    rows,
  });
});

module.exports = router;

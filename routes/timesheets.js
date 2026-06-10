const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

function weekStart(date) {
  const d = new Date(date);
  const dow = d.getDay() || 7; // Monday=1..Sunday=7
  d.setDate(d.getDate() - (dow - 1));
  return d.toISOString().slice(0, 10);
}

function myProjects(employeeId) {
  return db.prepare(`
    SELECT p.id, p.code, p.name
    FROM project_allocations pa
    JOIN projects p ON p.id = pa.project_id
    WHERE pa.employee_id=? AND p.status != 'completed'
    ORDER BY p.code
  `).all(employeeId);
}

router.get('/', (req, res) => {
  const user = req.session.user;
  const ws = weekStart(new Date());
  const entries = db.prepare(`
    SELECT t.*, p.code AS project_code, p.name AS project_name, r.name AS reviewer_name
    FROM timesheet_entries t
    JOIN projects p ON p.id = t.project_id
    LEFT JOIN employees r ON r.id = t.reviewer_id
    WHERE t.employee_id=?
    ORDER BY t.work_date DESC, t.created_at DESC
    LIMIT 60
  `).all(user.employee_id);

  const weekTotals = db.prepare(`
    SELECT
      COALESCE(SUM(hours), 0) AS total_hours,
      COALESCE(SUM(CASE WHEN status='draft' THEN hours ELSE 0 END), 0) AS draft_hours,
      COALESCE(SUM(CASE WHEN status='submitted' THEN hours ELSE 0 END), 0) AS submitted_hours,
      COALESCE(SUM(CASE WHEN status='approved' THEN hours ELSE 0 END), 0) AS approved_hours
    FROM timesheet_entries
    WHERE employee_id=? AND work_date >= ?
  `).get(user.employee_id, ws);

  res.render('timesheets/index', {
    title: 'My Timesheets',
    user,
    entries,
    weekStart: ws,
    weekTotals: weekTotals || { total_hours: 0, draft_hours: 0, submitted_hours: 0, approved_hours: 0 },
    flash: { info: req.flash('info'), error: req.flash('error') },
  });
});

router.get('/new', (req, res) => {
  const user = req.session.user;
  const projects = myProjects(user.employee_id);
  if (projects.length === 0) {
    req.flash('error', 'You must be allocated to a project before logging time.');
    return res.redirect('/timesheets');
  }
  res.render('timesheets/form', {
    title: 'Log Time',
    user,
    projects,
    entry: null,
    error: req.flash('error'),
  });
});

router.post('/new', (req, res) => {
  const { project_id, work_date, hours, task_description } = req.body;
  const hrs = parseFloat(hours);
  if (!project_id || !work_date || !hrs || hrs <= 0 || hrs > 24) {
    req.flash('error', 'Project, date and hours (0–24) are required.');
    return res.redirect('/timesheets/new');
  }
  // Confirm the employee is allocated to this project.
  const allowed = db.prepare(
    `SELECT 1 FROM project_allocations WHERE employee_id=? AND project_id=? LIMIT 1`
  ).get(req.session.user.employee_id, project_id);
  if (!allowed) {
    req.flash('error', 'You are not allocated to that project.');
    return res.redirect('/timesheets/new');
  }
  db.prepare(`
    INSERT INTO timesheet_entries
      (employee_id, project_id, work_date, hours, task_description, status)
    VALUES (?, ?, ?, ?, ?, 'draft')
  `).run(
    req.session.user.employee_id, project_id, work_date, hrs,
    task_description || null,
  );
  req.flash('info', 'Time entry saved as draft.');
  res.redirect('/timesheets');
});

router.get('/:id/edit', (req, res) => {
  const user = req.session.user;
  const entry = db.prepare(`SELECT * FROM timesheet_entries WHERE id=?`).get(req.params.id);
  if (!entry || entry.employee_id !== user.employee_id) {
    return res.status(404).render('error', {
      title: 'Not found', message: 'Time entry not found.', user,
    });
  }
  if (entry.status !== 'draft') {
    req.flash('error', 'Only draft entries can be edited.');
    return res.redirect('/timesheets');
  }
  res.render('timesheets/form', {
    title: 'Edit Time Entry',
    user,
    projects: myProjects(user.employee_id),
    entry,
    error: req.flash('error'),
  });
});

router.post('/:id/edit', (req, res) => {
  const user = req.session.user;
  const entry = db.prepare(`SELECT * FROM timesheet_entries WHERE id=?`).get(req.params.id);
  if (!entry || entry.employee_id !== user.employee_id || entry.status !== 'draft') {
    req.flash('error', 'Cannot edit this entry.');
    return res.redirect('/timesheets');
  }
  const { project_id, work_date, hours, task_description } = req.body;
  const hrs = parseFloat(hours);
  if (!project_id || !work_date || !hrs || hrs <= 0 || hrs > 24) {
    req.flash('error', 'Project, date and hours (0–24) are required.');
    return res.redirect(`/timesheets/${req.params.id}/edit`);
  }
  db.prepare(`
    UPDATE timesheet_entries SET project_id=?, work_date=?, hours=?, task_description=?
    WHERE id=?
  `).run(project_id, work_date, hrs, task_description || null, req.params.id);
  req.flash('info', 'Time entry updated.');
  res.redirect('/timesheets');
});

router.post('/:id/submit', (req, res) => {
  const user = req.session.user;
  const entry = db.prepare(`SELECT * FROM timesheet_entries WHERE id=?`).get(req.params.id);
  if (!entry || entry.employee_id !== user.employee_id || entry.status !== 'draft') {
    req.flash('error', 'Only your own draft entries can be submitted.');
    return res.redirect('/timesheets');
  }
  db.prepare(`UPDATE timesheet_entries SET status='submitted' WHERE id=?`).run(req.params.id);
  req.flash('info', 'Time entry submitted for approval.');
  res.redirect('/timesheets');
});

router.post('/submit-week', (req, res) => {
  const user = req.session.user;
  const ws = weekStart(new Date());
  const result = db.prepare(`
    UPDATE timesheet_entries SET status='submitted'
    WHERE employee_id=? AND status='draft' AND work_date >= ?
  `).run(user.employee_id, ws);
  req.flash('info', `${result.changes} entr${result.changes === 1 ? 'y' : 'ies'} submitted for this week.`);
  res.redirect('/timesheets');
});

router.post('/:id/delete', (req, res) => {
  const user = req.session.user;
  const entry = db.prepare(`SELECT * FROM timesheet_entries WHERE id=?`).get(req.params.id);
  if (!entry || entry.employee_id !== user.employee_id || entry.status !== 'draft') {
    req.flash('error', 'Only your own draft entries can be deleted.');
    return res.redirect('/timesheets');
  }
  db.prepare(`DELETE FROM timesheet_entries WHERE id=?`).run(req.params.id);
  req.flash('info', 'Time entry deleted.');
  res.redirect('/timesheets');
});

router.get('/pending', requireRole('admin', 'hr', 'manager'), (req, res) => {
  const user = req.session.user;
  const rows = (user.role === 'manager')
    ? db.prepare(`
        SELECT t.*, e.name, e.department, p.code AS project_code, p.name AS project_name
        FROM timesheet_entries t
        JOIN employees e ON e.id = t.employee_id
        JOIN projects p ON p.id = t.project_id
        WHERE t.status='submitted' AND e.manager_id=?
        ORDER BY t.work_date, e.name
      `).all(user.employee_id)
    : db.prepare(`
        SELECT t.*, e.name, e.department, p.code AS project_code, p.name AS project_name
        FROM timesheet_entries t
        JOIN employees e ON e.id = t.employee_id
        JOIN projects p ON p.id = t.project_id
        WHERE t.status='submitted'
        ORDER BY t.work_date, e.name
      `).all();
  res.render('timesheets/pending', {
    title: 'Timesheet Approvals',
    user,
    rows,
    flash: { info: req.flash('info'), error: req.flash('error') },
  });
});

router.post('/:id/decide', requireRole('admin', 'hr', 'manager'), (req, res) => {
  const { decision } = req.body;
  if (!['approved', 'rejected'].includes(decision)) {
    req.flash('error', 'Invalid decision.');
    return res.redirect('/timesheets/pending');
  }
  const entry = db.prepare(`SELECT * FROM timesheet_entries WHERE id=?`).get(req.params.id);
  if (!entry || entry.status !== 'submitted') {
    req.flash('error', 'Entry not found or not awaiting review.');
    return res.redirect('/timesheets/pending');
  }
  if (req.session.user.role === 'manager') {
    const emp = db.prepare(`SELECT manager_id FROM employees WHERE id=?`).get(entry.employee_id);
    if (!emp || emp.manager_id !== req.session.user.employee_id) {
      req.flash('error', 'You can only decide entries from your direct reports.');
      return res.redirect('/timesheets/pending');
    }
  }
  db.prepare(`
    UPDATE timesheet_entries SET status=?, reviewer_id=?, decided_at=datetime('now')
    WHERE id=?
  `).run(decision, req.session.user.employee_id, req.params.id);
  req.flash('info', `Time entry ${decision}.`);
  res.redirect('/timesheets/pending');
});

module.exports = router;

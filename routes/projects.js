const express = require('express');
const db = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

const canManage = requireRole('admin', 'hr', 'manager');

function canSeeProject(user, projectId) {
  if (['admin', 'hr', 'manager'].includes(user.role)) return true;
  const row = db.prepare(
    `SELECT 1 FROM project_allocations WHERE project_id=? AND employee_id=? LIMIT 1`
  ).get(projectId, user.employee_id);
  return !!row;
}

router.get('/', (req, res) => {
  const user = req.session.user;
  const isPrivileged = ['admin', 'hr', 'manager'].includes(user.role);
  const projects = isPrivileged
    ? db.prepare(`
        SELECT p.*, l.name AS lead_name,
          (SELECT COUNT(*) FROM project_allocations a WHERE a.project_id=p.id) AS members
        FROM projects p
        LEFT JOIN employees l ON l.id = p.lead_id
        ORDER BY CASE p.status WHEN 'active' THEN 0 WHEN 'on_hold' THEN 1 ELSE 2 END, p.code
      `).all()
    : db.prepare(`
        SELECT p.*, l.name AS lead_name,
          (SELECT COUNT(*) FROM project_allocations a WHERE a.project_id=p.id) AS members,
          pa.role_on_project AS my_role, pa.allocation_percent AS my_alloc
        FROM projects p
        JOIN project_allocations pa ON pa.project_id = p.id AND pa.employee_id = ?
        LEFT JOIN employees l ON l.id = p.lead_id
        ORDER BY p.code
      `).all(user.employee_id);

  res.render('projects/list', {
    title: 'Projects',
    user,
    projects,
    canManage: isPrivileged,
    flash: { info: req.flash('info'), error: req.flash('error') },
  });
});

router.get('/new', canManage, (req, res) => {
  const leads = db.prepare(`SELECT id, name FROM employees ORDER BY name`).all();
  res.render('projects/form', {
    title: 'New Project',
    user: req.session.user,
    project: null,
    leads,
    error: req.flash('error'),
  });
});

router.post('/new', canManage, (req, res) => {
  const { code, name, client, description, status, start_date, end_date, lead_id } = req.body;
  if (!code || !name) {
    req.flash('error', 'Project code and name are required.');
    return res.redirect('/projects/new');
  }
  try {
    const id = db.prepare(`
      INSERT INTO projects (code, name, client, description, status, start_date, end_date, lead_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      code, name, client || null, description || null,
      status || 'active',
      start_date || null, end_date || null,
      lead_id || null,
    ).lastInsertRowid;
    req.flash('info', `Created project ${code}.`);
    res.redirect(`/projects/${id}`);
  } catch (e) {
    req.flash('error', e.message);
    res.redirect('/projects/new');
  }
});

router.get('/:id', (req, res) => {
  const user = req.session.user;
  const project = db.prepare(`
    SELECT p.*, l.name AS lead_name
    FROM projects p LEFT JOIN employees l ON l.id = p.lead_id
    WHERE p.id = ?
  `).get(req.params.id);
  if (!project) return res.status(404).render('error', {
    title: 'Not found', message: 'Project not found.', user,
  });
  if (!canSeeProject(user, project.id)) {
    return res.status(403).render('error', {
      title: 'Forbidden', message: 'You are not allocated to this project.', user,
    });
  }
  const allocations = db.prepare(`
    SELECT pa.*, e.name, e.email, e.department
    FROM project_allocations pa
    JOIN employees e ON e.id = pa.employee_id
    WHERE pa.project_id = ?
    ORDER BY e.name
  `).all(project.id);
  const isPrivileged = ['admin', 'hr', 'manager'].includes(user.role);
  const candidates = isPrivileged
    ? db.prepare(`
        SELECT e.id, e.name FROM employees e
        WHERE e.id NOT IN (
          SELECT employee_id FROM project_allocations WHERE project_id=?
        )
        ORDER BY e.name
      `).all(project.id)
    : [];
  res.render('projects/detail', {
    title: `${project.code} – ${project.name}`,
    user,
    project,
    allocations,
    candidates,
    canManage: isPrivileged,
    flash: { info: req.flash('info'), error: req.flash('error') },
  });
});

router.get('/:id/edit', canManage, (req, res) => {
  const project = db.prepare(`SELECT * FROM projects WHERE id=?`).get(req.params.id);
  if (!project) return res.status(404).render('error', {
    title: 'Not found', message: 'Project not found.', user: req.session.user,
  });
  const leads = db.prepare(`SELECT id, name FROM employees ORDER BY name`).all();
  res.render('projects/form', {
    title: `Edit ${project.code}`,
    user: req.session.user,
    project,
    leads,
    error: req.flash('error'),
  });
});

router.post('/:id/edit', canManage, (req, res) => {
  const { code, name, client, description, status, start_date, end_date, lead_id } = req.body;
  try {
    db.prepare(`
      UPDATE projects SET
        code=?, name=?, client=?, description=?, status=?,
        start_date=?, end_date=?, lead_id=?
      WHERE id=?
    `).run(
      code, name, client || null, description || null, status || 'active',
      start_date || null, end_date || null, lead_id || null,
      req.params.id,
    );
    req.flash('info', 'Project updated.');
    res.redirect(`/projects/${req.params.id}`);
  } catch (e) {
    req.flash('error', e.message);
    res.redirect(`/projects/${req.params.id}/edit`);
  }
});

router.post('/:id/allocate', canManage, (req, res) => {
  const { employee_id, role_on_project, allocation_percent, start_date, end_date } = req.body;
  if (!employee_id) {
    req.flash('error', 'Select an employee.');
    return res.redirect(`/projects/${req.params.id}`);
  }
  const pct = parseInt(allocation_percent, 10);
  if (Number.isNaN(pct) || pct < 0 || pct > 100) {
    req.flash('error', 'Allocation % must be between 0 and 100.');
    return res.redirect(`/projects/${req.params.id}`);
  }
  try {
    db.prepare(`
      INSERT INTO project_allocations
        (project_id, employee_id, role_on_project, allocation_percent, start_date, end_date)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      req.params.id, employee_id,
      role_on_project || null, pct,
      start_date || null, end_date || null,
    );
    req.flash('info', 'Employee allocated.');
  } catch (e) {
    req.flash('error', e.message);
  }
  res.redirect(`/projects/${req.params.id}`);
});

router.post('/:id/allocations/:allocId/remove', canManage, (req, res) => {
  db.prepare(`DELETE FROM project_allocations WHERE id=? AND project_id=?`)
    .run(req.params.allocId, req.params.id);
  req.flash('info', 'Allocation removed.');
  res.redirect(`/projects/${req.params.id}`);
});

router.post('/:id/delete', requireRole('admin'), (req, res) => {
  db.prepare(`DELETE FROM projects WHERE id=?`).run(req.params.id);
  req.flash('info', 'Project deleted.');
  res.redirect('/projects');
});

module.exports = router;

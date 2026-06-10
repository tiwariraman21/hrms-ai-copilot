const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

router.get('/password', (req, res) => {
  res.render('account/password', {
    title: 'Change Password',
    user: req.session.user,
    flash: { info: req.flash('info'), error: req.flash('error') },
  });
});

router.post('/password', (req, res) => {
  const { current_password, new_password, confirm_password } = req.body;
  if (!current_password || !new_password || !confirm_password) {
    req.flash('error', 'All fields are required.');
    return res.redirect('/account/password');
  }
  if (new_password.length < 6) {
    req.flash('error', 'New password must be at least 6 characters.');
    return res.redirect('/account/password');
  }
  if (new_password !== confirm_password) {
    req.flash('error', 'New password and confirmation do not match.');
    return res.redirect('/account/password');
  }
  const row = db.prepare(`SELECT id, password_hash FROM users WHERE employee_id=?`)
    .get(req.session.user.employee_id);
  if (!row || !bcrypt.compareSync(current_password, row.password_hash)) {
    req.flash('error', 'Current password is incorrect.');
    return res.redirect('/account/password');
  }
  db.prepare(`UPDATE users SET password_hash=? WHERE id=?`)
    .run(bcrypt.hashSync(new_password, 10), row.id);
  req.flash('info', 'Password updated.');
  res.redirect('/account/password');
});

module.exports = router;

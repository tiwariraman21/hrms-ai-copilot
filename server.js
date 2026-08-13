require('dotenv').config();

const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');

require('./db');

const authRoutes = require('./routes/auth');
const employeeRoutes = require('./routes/employees');
const attendanceRoutes = require('./routes/attendance');
const leaveRoutes = require('./routes/leave');
const accountRoutes = require('./routes/account');
const teamRoutes = require('./routes/team');
const projectRoutes = require('./routes/projects');
const expenseRoutes = require('./routes/expenses');
const timesheetRoutes = require('./routes/timesheets');
const aiRoutes = require('./routes/ai');

const insightsAgent = require('./services/ai/insightsAgent');

const { requireAuth } = require('./middleware/auth');
const db = require('./db');

const app = express();

const PORT = process.env.PORT || 3000;


/* =========================================================
   VIEW ENGINE
========================================================= */

app.set('view engine', 'ejs');

app.set(
  'views',
  path.join(__dirname, 'views')
);


/* =========================================================
   MIDDLEWARE
========================================================= */

app.use(
  express.urlencoded({
    extended: true,
  })
);

app.use(
  express.json()
);

app.use(
  express.static(
    path.join(__dirname, 'public')
  )
);


/* =========================================================
   SESSION
========================================================= */

app.use(
  session({
    secret:
      process.env.SESSION_SECRET ||
      'change-me-in-production-hrms-dev-secret',

    resave: false,

    saveUninitialized: false,

    cookie: {
      httpOnly: true,

      maxAge:
        1000 *
        60 *
        60 *
        8,
    },
  })
);


/* =========================================================
   FLASH
========================================================= */

app.use(
  flash()
);


/* =========================================================
   GLOBAL USER
========================================================= */

app.use(
  (req, res, next) => {

    res.locals.currentUser =
      req.session.user || null;

    next();
  }
);


/* =========================================================
   ROOT ROUTE
========================================================= */

app.get(
  '/',
  (req, res) => {

    res.redirect(
      req.session.user
        ? '/dashboard'
        : '/login'
    );
  }
);


/* =========================================================
   AUTH ROUTES
========================================================= */

app.use(
  '/',
  authRoutes
);


/* =========================================================
   DASHBOARD
========================================================= */

app.get(
  '/dashboard',
  requireAuth,
  async (req, res) => {

    const user =
      req.session.user;

    const today =
      new Date()
        .toISOString()
        .slice(0, 10);


    /* =====================================================
       AI INSIGHTS
    ===================================================== */

    const insights =
      await insightsAgent.generateInsights(
        user
      );


    /* =====================================================
       EMPLOYEE COUNT
    ===================================================== */

    const empCount =
      db
        .prepare(`
          SELECT COUNT(*) AS n
          FROM employees
        `)
        .get()
        .n;


    /* =====================================================
       TODAY ATTENDANCE
    ===================================================== */

    const todayAttendance =
      db
        .prepare(`
          SELECT COUNT(*) AS n
          FROM attendance
          WHERE date = ?
            AND clock_in IS NOT NULL
        `)
        .get(today)
        .n;


    /* =====================================================
       PENDING LEAVE
    ===================================================== */

    const pendingLeave =
      user.role === 'manager'

        ? db
            .prepare(`
              SELECT COUNT(*) AS n
              FROM leave_requests lr

              JOIN employees e
                ON e.id = lr.employee_id

              WHERE lr.status = 'pending'

                AND e.manager_id = ?
            `)
            .get(
              user.employee_id
            )
            .n

        : db
            .prepare(`
              SELECT COUNT(*) AS n
              FROM leave_requests
              WHERE status = 'pending'
            `)
            .get()
            .n;


    /* =====================================================
       MY TODAY ATTENDANCE
    ===================================================== */

    const myToday =
      db
        .prepare(`
          SELECT *
          FROM attendance

          WHERE employee_id = ?

            AND date = ?
        `)
        .get(
          user.employee_id,
          today
        );


    /* =====================================================
       MY LEAVE BALANCE
    ===================================================== */

    const myBalance =
      db
        .prepare(`
          SELECT leave_balance
          FROM employees
          WHERE id = ?
        `)
        .get(
          user.employee_id
        );


    /* =====================================================
       TEAM SIZE
    ===================================================== */

    const teamSize =
      user.role === 'manager'

        ? db
            .prepare(`
              SELECT COUNT(*) AS n
              FROM employees
              WHERE manager_id = ?
            `)
            .get(
              user.employee_id
            )
            .n

        : null;


    /* =====================================================
       MY PROJECTS
    ===================================================== */

    const myProjects =
      db
        .prepare(`
          SELECT COUNT(*) AS n
          FROM project_allocations
          WHERE employee_id = ?
        `)
        .get(
          user.employee_id
        )
        .n;


    /* =====================================================
       PENDING EXPENSES
    ===================================================== */

    const pendingExpenses =
      user.role === 'manager'

        ? db
            .prepare(`
              SELECT COUNT(*) AS n

              FROM expense_claims ec

              JOIN employees e
                ON e.id = ec.employee_id

              WHERE ec.status = 'pending'

                AND e.manager_id = ?
            `)
            .get(
              user.employee_id
            )
            .n

        : db
            .prepare(`
              SELECT COUNT(*) AS n

              FROM expense_claims

              WHERE status = 'pending'
            `)
            .get()
            .n;


    /* =====================================================
       PENDING TIMESHEETS
    ===================================================== */

    const pendingTimesheets =
      user.role === 'manager'

        ? db
            .prepare(`
              SELECT COUNT(*) AS n

              FROM timesheet_entries t

              JOIN employees e
                ON e.id = t.employee_id

              WHERE t.status = 'submitted'

                AND e.manager_id = ?
            `)
            .get(
              user.employee_id
            )
            .n

        : db
            .prepare(`
              SELECT COUNT(*) AS n

              FROM timesheet_entries

              WHERE status = 'submitted'
            `)
            .get()
            .n;


    /* =====================================================
       DASHBOARD ANALYTICS
    ===================================================== */


    /* =====================================================
       ATTENDANCE TREND
       Role-aware
    ===================================================== */

    let attendanceTrend;


    if (
      user.role === 'manager'
    ) {

      attendanceTrend =
        db
          .prepare(`
            SELECT
              a.date,
              COUNT(*) AS count

            FROM attendance a

            JOIN employees e
              ON e.id = a.employee_id

            WHERE a.date >= date(
              'now',
              '-6 days'
            )

              AND a.clock_in IS NOT NULL

              AND e.manager_id = ?

            GROUP BY a.date

            ORDER BY a.date
          `)
          .all(
            user.employee_id
          );

    } else if (
      user.role === 'employee'
    ) {

      attendanceTrend =
        db
          .prepare(`
            SELECT
              date,
              COUNT(*) AS count

            FROM attendance

            WHERE employee_id = ?

              AND date >= date(
                'now',
                '-6 days'
              )

              AND clock_in IS NOT NULL

            GROUP BY date

            ORDER BY date
          `)
          .all(
            user.employee_id
          );

    } else {

      attendanceTrend =
        db
          .prepare(`
            SELECT
              date,
              COUNT(*) AS count

            FROM attendance

            WHERE date >= date(
              'now',
              '-6 days'
            )

              AND clock_in IS NOT NULL

            GROUP BY date

            ORDER BY date
          `)
          .all();
    }


    /* =====================================================
       LEAVE OVERVIEW
       Role-aware
    ===================================================== */

    let leaveOverview;


    if (
      user.role === 'manager'
    ) {

      leaveOverview =
        db
          .prepare(`
            SELECT
              lr.status,
              COUNT(*) AS count

            FROM leave_requests lr

            JOIN employees e
              ON e.id = lr.employee_id

            WHERE e.manager_id = ?

            GROUP BY lr.status
          `)
          .all(
            user.employee_id
          );

    } else if (
      user.role === 'employee'
    ) {

      leaveOverview =
        db
          .prepare(`
            SELECT
              status,
              COUNT(*) AS count

            FROM leave_requests

            WHERE employee_id = ?

            GROUP BY status
          `)
          .all(
            user.employee_id
          );

    } else {

      leaveOverview =
        db
          .prepare(`
            SELECT
              status,
              COUNT(*) AS count

            FROM leave_requests

            GROUP BY status
          `)
          .all();
    }


    /* =====================================================
       EXPENSE OVERVIEW
       Role-aware
    ===================================================== */

    let expenseOverview;


    if (
      user.role === 'manager'
    ) {

      expenseOverview =
        db
          .prepare(`
            SELECT
              ec.status,
              COUNT(*) AS count

            FROM expense_claims ec

            JOIN employees e
              ON e.id = ec.employee_id

            WHERE e.manager_id = ?

            GROUP BY ec.status
          `)
          .all(
            user.employee_id
          );

    } else if (
      user.role === 'employee'
    ) {

      expenseOverview =
        db
          .prepare(`
            SELECT
              status,
              COUNT(*) AS count

            FROM expense_claims

            WHERE employee_id = ?

            GROUP BY status
          `)
          .all(
            user.employee_id
          );

    } else {

      expenseOverview =
        db
          .prepare(`
            SELECT
              status,
              COUNT(*) AS count

            FROM expense_claims

            GROUP BY status
          `)
          .all();
    }


    /* =====================================================
       PROJECT OVERVIEW
       Role-aware
    ===================================================== */

    let projectOverview;


    /* -----------------------------------------------------
       EMPLOYEE
    ----------------------------------------------------- */

    if (
      user.role === 'employee'
    ) {

      projectOverview =
        db
          .prepare(`
            SELECT
              p.id,
              p.code,
              p.name,
              p.client,
              p.status,
              p.start_date,
              p.end_date,
              pa.allocation_percent

            FROM projects p

            JOIN project_allocations pa
              ON pa.project_id = p.id

            WHERE pa.employee_id = ?

            ORDER BY
              p.status,
              p.name
          `)
          .all(
            user.employee_id
          );


    /* -----------------------------------------------------
       MANAGER
    ----------------------------------------------------- */

    } else if (
      user.role === 'manager'
    ) {

      projectOverview =
        db
          .prepare(`
            SELECT DISTINCT
              p.id,
              p.code,
              p.name,
              p.client,
              p.status,
              p.start_date,
              p.end_date

            FROM projects p

            JOIN project_allocations pa
              ON pa.project_id = p.id

            JOIN employees e
              ON e.id = pa.employee_id

            WHERE e.manager_id = ?

               OR p.lead_id = ?

            ORDER BY
              p.status,
              p.name
          `)
          .all(
            user.employee_id,
            user.employee_id
          );


    /* -----------------------------------------------------
       HR / ADMIN
    ----------------------------------------------------- */

    } else {

      projectOverview =
        db
          .prepare(`
            SELECT
              p.id,
              p.code,
              p.name,
              p.client,
              p.status,
              p.start_date,
              p.end_date,
              p.lead_id,

              COUNT(
                DISTINCT pa.employee_id
              ) AS team_size,

              COALESCE(
                SUM(
                  pa.allocation_percent
                ),
                0
              ) AS total_allocation

            FROM projects p

            LEFT JOIN project_allocations pa
              ON pa.project_id = p.id

            GROUP BY p.id

            ORDER BY
              p.status,
              p.name
          `)
          .all();
    }


    /* =====================================================
       RECENT ACTIVITY
       Role-aware
    ===================================================== */

    let recentActivity;


    /* -----------------------------------------------------
       MANAGER
    ----------------------------------------------------- */

    if (
      user.role === 'manager'
    ) {

      recentActivity =
        db
          .prepare(`
            SELECT
              'Leave Request'
                AS activity_type,

              e.name
                AS employee_name,

              lr.created_at
                AS activity_date,

              lr.status
                AS status

            FROM leave_requests lr

            JOIN employees e
              ON e.id = lr.employee_id

            WHERE e.manager_id = ?

            UNION ALL

            SELECT
              'Expense Claim'
                AS activity_type,

              e.name
                AS employee_name,

              ec.created_at
                AS activity_date,

              ec.status
                AS status

            FROM expense_claims ec

            JOIN employees e
              ON e.id = ec.employee_id

            WHERE e.manager_id = ?

            UNION ALL

            SELECT
              'Timesheet'
                AS activity_type,

              e.name
                AS employee_name,

              t.created_at
                AS activity_date,

              t.status
                AS status

            FROM timesheet_entries t

            JOIN employees e
              ON e.id = t.employee_id

            WHERE e.manager_id = ?

            ORDER BY
              activity_date DESC

            LIMIT 8
          `)
          .all(
            user.employee_id,
            user.employee_id,
            user.employee_id
          );


    /* -----------------------------------------------------
       EMPLOYEE
    ----------------------------------------------------- */

    } else if (
      user.role === 'employee'
    ) {

      recentActivity =
        db
          .prepare(`
            SELECT
              'Leave Request'
                AS activity_type,

              'You'
                AS employee_name,

              created_at
                AS activity_date,

              status

            FROM leave_requests

            WHERE employee_id = ?

            UNION ALL

            SELECT
              'Expense Claim'
                AS activity_type,

              'You'
                AS employee_name,

              created_at
                AS activity_date,

              status

            FROM expense_claims

            WHERE employee_id = ?

            UNION ALL

            SELECT
              'Timesheet'
                AS activity_type,

              'You'
                AS employee_name,

              created_at
                AS activity_date,

              status

            FROM timesheet_entries

            WHERE employee_id = ?

            ORDER BY
              activity_date DESC

            LIMIT 8
          `)
          .all(
            user.employee_id,
            user.employee_id,
            user.employee_id
          );


    /* -----------------------------------------------------
       HR / ADMIN
    ----------------------------------------------------- */

    } else {

      recentActivity =
        db
          .prepare(`
            SELECT
              'Leave Request'
                AS activity_type,

              e.name
                AS employee_name,

              lr.created_at
                AS activity_date,

              lr.status
                AS status

            FROM leave_requests lr

            JOIN employees e
              ON e.id = lr.employee_id

            UNION ALL

            SELECT
              'Expense Claim'
                AS activity_type,

              e.name
                AS employee_name,

              ec.created_at
                AS activity_date,

              ec.status
                AS status

            FROM expense_claims ec

            JOIN employees e
              ON e.id = ec.employee_id

            UNION ALL

            SELECT
              'Timesheet'
                AS activity_type,

              e.name
                AS employee_name,

              t.created_at
                AS activity_date,

              t.status
                AS status

            FROM timesheet_entries t

            JOIN employees e
              ON e.id = t.employee_id

            ORDER BY
              activity_date DESC

            LIMIT 8
          `)
          .all();
    }


    /* =====================================================
       RENDER DASHBOARD
    ===================================================== */

    res.render(
      'dashboard',
      {

        title: 'Dashboard',

        user,


        /* -------------------------------------------------
           KPI STATS
        ------------------------------------------------- */

        stats: {

          empCount,

          todayAttendance,

          pendingLeave,

          teamSize,

          myProjects,

          pendingExpenses,

          pendingTimesheets,

        },


        /* -------------------------------------------------
           PERSONAL DATA
        ------------------------------------------------- */

        myToday,

        myBalance:
          myBalance?.leave_balance ?? 0,


        /* -------------------------------------------------
           AI
        ------------------------------------------------- */

        insights,


        /* -------------------------------------------------
           ALL DASHBOARD ANALYTICS
        ------------------------------------------------- */

        analytics: {

          attendanceTrend,

          leaveOverview,

          expenseOverview,

          recentActivity,

          projectOverview,

        },

      }
    );
  }
);


/* =========================================================
   APPLICATION ROUTES
========================================================= */

app.use(
  '/employees',
  employeeRoutes
);

app.use(
  '/attendance',
  attendanceRoutes
);

app.use(
  '/leave',
  leaveRoutes
);

app.use(
  '/account',
  accountRoutes
);

app.use(
  '/team',
  teamRoutes
);

app.use(
  '/projects',
  projectRoutes
);

app.use(
  '/expenses',
  expenseRoutes
);

app.use(
  '/timesheets',
  timesheetRoutes
);


/* =========================================================
   AI ROUTES
========================================================= */

app.use(
  '/ai',
  aiRoutes
);


/* =========================================================
   404 ERROR
========================================================= */

app.use(
  (req, res) => {

    res.status(404).render(
      'error',
      {

        title: 'Not found',

        message:
          'The page you requested does not exist.',

        user:
          req.session.user,

      }
    );
  }
);


/* =========================================================
   SERVER ERROR
========================================================= */

app.use(
  (err, req, res, next) => {

    console.error(err);

    res.status(500).render(
      'error',
      {

        title: 'Server error',

        message:
          'Something went wrong on the server.',

        user:
          req.session?.user,

      }
    );
  }
);


/* =========================================================
   START SERVER
========================================================= */

app.listen(
  PORT,
  () => {

    console.log(
      `HRMS running at http://localhost:${PORT}`
    );

  }
);

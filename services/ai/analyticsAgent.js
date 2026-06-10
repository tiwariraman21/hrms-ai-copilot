const db = require('../../db');

/* =========================
   MY WORK HOURS
========================= */

async function getMyWorkHours(user) {

    const result = db.prepare(`
        SELECT SUM(hours) as total
        FROM timesheet_entries
        WHERE employee_id = ?
    `).get(user.employee_id);

    return {
        success: true,
        message: `You worked ${result.total || 0} hours in total.`
    };
}

/* =========================
   PENDING LEAVES
========================= */

async function getPendingLeaves() {

    const result = db.prepare(`
        SELECT COUNT(*) as count
        FROM leave_requests
        WHERE status = 'pending'
    `).get();

    return {
        success: true,
        message: `${result.count} leave requests are pending approval.`
    };
}

/* =========================
   ABSENT EMPLOYEES
========================= */

async function getAbsentEmployees() {

    const today = new Date().toISOString().split('T')[0];

    const result = db.prepare(`
        SELECT COUNT(*) as count
        FROM employees
        WHERE id NOT IN (
            SELECT employee_id
            FROM attendance
            WHERE date = ?
            AND clock_in IS NOT NULL
        )
    `).get(today);

    return {
        success: true,
        message: `${result.count} employees are absent today.`
    };
}

/* =========================
   TOP EMPLOYEE BY HOURS
========================= */

async function getTopEmployeeByHours() {

    const result = db.prepare(`
        SELECT e.name, SUM(t.hours) as total
        FROM timesheet_entries t
        JOIN employees e
            ON e.id = t.employee_id
        GROUP BY e.id
        ORDER BY total DESC
        LIMIT 1
    `).get();

    if (!result) {

        return {
            success: false,
            message: 'No timesheet data found.'
        };
    }

    return {
        success: true,
        message: `${result.name} worked the most hours (${result.total} hrs).`
    };
}

/* =========================
   HIGHEST EXPENSE PROJECT
========================= */

async function getHighestExpenseProject() {

    const result = db.prepare(`
        SELECT p.name, SUM(e.amount) as total
        FROM expense_claims e
        JOIN projects p
            ON p.id = e.project_id
        GROUP BY p.id
        ORDER BY total DESC
        LIMIT 1
    `).get();

    if (!result) {

        return {
            success: false,
            message: 'No expense data found.'
        };
    }

    return {
        success: true,
        message: `${result.name} has the highest expenses (₹${result.total}).`
    };
}

/* =========================
   HIGHEST LEAVE EMPLOYEE
========================= */

async function getHighestLeaveEmployee() {

    const result = db.prepare(`
        SELECT emp.name,
               COUNT(l.id) as total
        FROM leave_requests l
        JOIN employees emp
            ON emp.id = l.employee_id
        GROUP BY emp.id
        ORDER BY total DESC
        LIMIT 1
    `).get();

    if (!result) {

        return {
            success: false,
            message: 'No leave records found.'
        };
    }

    return {
        success: true,
        message: `${result.name} applied for the most leaves (${result.total}).`
    };
}

module.exports = {
    getMyWorkHours,
    getPendingLeaves,
    getAbsentEmployees,
    getTopEmployeeByHours,
    getHighestExpenseProject,
    getHighestLeaveEmployee
};
const db = require('../../db');

async function generateInsights(user) {

    const insights = [];

    /* =========================
       EMPLOYEE-SPECIFIC INSIGHTS
    ========================== */

    if (user.role === 'employee') {

        // Employee leave balance
        const leaveBalance = db.prepare(`
            SELECT leave_balance
            FROM employees
            WHERE id = ?
        `).get(user.employee_id);

        insights.push(
            `You currently have ${leaveBalance.leave_balance} leave(s) remaining.`
        );

        // Employee work hours
        const workHours = db.prepare(`
            SELECT SUM(hours) as total
            FROM timesheet_entries
            WHERE employee_id = ?
        `).get(user.employee_id);

        insights.push(
            `You logged ${workHours.total || 0} work hours in total.`
        );

        // Employee pending expenses
        const pendingExpenses = db.prepare(`
            SELECT COUNT(*) as count
            FROM expense_claims
            WHERE employee_id = ?
            AND status = 'pending'
        `).get(user.employee_id);

        if (pendingExpenses.count > 0) {

            insights.push(
                `${pendingExpenses.count} of your expense claims are awaiting approval.`
            );
        }

        return insights;
    }

    /* =========================
       ORG-WIDE INSIGHTS
    ========================== */

    // Pending leaves
    const pendingLeaves = db.prepare(`
        SELECT COUNT(*) as count
        FROM leave_requests
        WHERE status = 'pending'
    `).get();

    if (pendingLeaves.count > 0) {

        insights.push(
            `${pendingLeaves.count} leave requests are pending approval.`
        );
    }

    // Pending expenses
    const pendingExpenses = db.prepare(`
        SELECT COUNT(*) as count
        FROM expense_claims
        WHERE status = 'pending'
    `).get();

    if (pendingExpenses.count > 0) {

        insights.push(
            `${pendingExpenses.count} expense claims are awaiting approval.`
        );
    }

    // Pending timesheets
    const pendingTimesheets = db.prepare(`
        SELECT COUNT(*) as count
        FROM timesheet_entries
        WHERE status = 'submitted'
    `).get();

    if (pendingTimesheets.count > 0) {

        insights.push(
            `${pendingTimesheets.count} timesheets are pending approval.`
        );
    }

    // Absent employees
    const today = new Date().toISOString().split('T')[0];

    const absentEmployees = db.prepare(`
        SELECT COUNT(*) as count
        FROM employees
        WHERE id NOT IN (
            SELECT employee_id
            FROM attendance
            WHERE date = ?
            AND clock_in IS NOT NULL
        )
    `).get(today);

    insights.push(
        `${absentEmployees.count} employees are absent today.`
    );

    // Highest working employee
    const topEmployee = db.prepare(`
        SELECT e.name, SUM(t.hours) as total
        FROM timesheet_entries t
        JOIN employees e
            ON e.id = t.employee_id
        GROUP BY e.name
        ORDER BY total DESC
        LIMIT 1
    `).get();

    if (topEmployee) {

        insights.push(
            `${topEmployee.name} logged the highest hours (${topEmployee.total}).`
        );
    }

    // Overtime insight
    const overtimeEmployee = db.prepare(`
        SELECT e.name, SUM(t.hours) as total
        FROM timesheet_entries t
        JOIN employees e
            ON e.id = t.employee_id
        GROUP BY e.id
        ORDER BY total DESC
        LIMIT 1
    `).get();

    if (overtimeEmployee) {

        insights.push(
            `${overtimeEmployee.name} logged the highest hours (${overtimeEmployee.total} hrs).`
        );
    }

    return insights;
}

module.exports = {
    generateInsights
};
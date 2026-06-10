const db = require('../../db');

/* =========================
   APPROVE LEAVE
========================= */

async function approveLeave(user, data) {

    try {

        const employee = db.prepare(`
            SELECT *
            FROM employees
            WHERE name LIKE ?
        `).get(`%${data.employee_name}%`);

        if (!employee) {

            return {
                success: false,
                message: 'Employee not found.'
            };
        }

        if (
            user.role === 'manager' &&
            employee.manager_id !== user.employee_id
        ) {

            return {
                success: false,
                message: 'You can only approve leaves for your team members.'
            };
        }

        const leave = db.prepare(`
            SELECT *
            FROM leave_requests
            WHERE employee_id = ?
            AND status = 'pending'
            ORDER BY id DESC
            LIMIT 1
        `).get(employee.id);

        if (!leave) {

            return {
                success: false,
                message: 'No pending leave request found.'
            };
        }

        db.prepare(`
            UPDATE leave_requests
            SET status = 'approved',
                reviewer_id = ?
            WHERE id = ?
        `).run(user.employee_id, leave.id);

        return {
            success: true,
            message: `Leave approved for ${employee.name}.`
        };

    } catch (err) {

        console.error(err);

        return {
            success: false,
            message: 'Failed to approve leave.'
        };
    }
}

/* =========================
   REJECT LEAVE
========================= */

async function rejectLeave(user, data) {

    const employee = db.prepare(`
        SELECT id, manager_id, name
        FROM employees
        WHERE name LIKE ?
    `).get(`%${data.employee_name}%`);

    if (!employee) {

        return {
            success: false,
            message: 'Employee not found.'
        };
    }

    if (
        user.role !== 'admin' &&
        employee.manager_id !== user.employee_id
    ) {

        return {
            success: false,
            message: 'Unauthorized leave rejection.'
        };
    }

    const leave = db.prepare(`
        SELECT id
        FROM leave_requests
        WHERE employee_id = ?
        AND status = 'pending'
        ORDER BY id DESC
        LIMIT 1
    `).get(employee.id);

    if (!leave) {

        return {
            success: false,
            message: 'No pending leave request found.'
        };
    }

    db.prepare(`
        UPDATE leave_requests
        SET status = 'rejected',
            reviewer_id = ?
        WHERE id = ?
    `).run(user.employee_id, leave.id);

    return {
        success: true,
        message: `${employee.name}'s leave rejected successfully.`
    };
}

/* =========================
   APPROVE ALL LEAVES
========================= */

async function approveAllLeaves(user) {

    let query;
    let params = [];

    if (
        user.role === 'admin' ||
        user.role === 'hr'
    ) {

        query = `
            UPDATE leave_requests
            SET status = 'approved',
                reviewer_id = ?
            WHERE status = 'pending'
        `;

        params = [user.employee_id];

    } else {

        query = `
            UPDATE leave_requests
            SET status = 'approved',
                reviewer_id = ?
            WHERE id IN (
                SELECT lr.id
                FROM leave_requests lr
                JOIN employees e
                    ON e.id = lr.employee_id
                WHERE e.manager_id = ?
                AND lr.status = 'pending'
            )
        `;

        params = [
            user.employee_id,
            user.employee_id
        ];
    }

    const result = db.prepare(query).run(...params);

    return {
        success: true,
        message: `${result.changes} leave requests approved successfully.`
    };
}

/* =========================
   APPROVE EXPENSE
========================= */

async function approveExpense(user, data) {

    const employee = db.prepare(`
        SELECT id, manager_id, name
        FROM employees
        WHERE name LIKE ?
    `).get(`%${data.employee_name}%`);

    if (!employee) {

        return {
            success: false,
            message: 'Employee not found.'
        };
    }

    if (
        user.role !== 'admin' &&
        employee.manager_id !== user.employee_id
    ) {

        return {
            success: false,
            message: 'Unauthorized expense approval.'
        };
    }

    const expense = db.prepare(`
        SELECT id
        FROM expense_claims
        WHERE employee_id = ?
        AND status = 'pending'
        ORDER BY id DESC
        LIMIT 1
    `).get(employee.id);

    if (!expense) {

        return {
            success: false,
            message: 'No pending expense found.'
        };
    }

    db.prepare(`
        UPDATE expense_claims
        SET status = 'approved',
            reviewer_id = ?,
            decided_at = datetime('now')
        WHERE id = ?
    `).run(user.employee_id, expense.id);

    return {
        success: true,
        message: `${employee.name}'s expense approved successfully.`
    };
}

/* =========================
   REJECT EXPENSE
========================= */

async function rejectExpense(user, data) {

    const employee = db.prepare(`
        SELECT id, manager_id, name
        FROM employees
        WHERE name LIKE ?
    `).get(`%${data.employee_name}%`);

    if (!employee) {

        return {
            success: false,
            message: 'Employee not found.'
        };
    }

    if (
        user.role !== 'admin' &&
        employee.manager_id !== user.employee_id
    ) {

        return {
            success: false,
            message: 'Unauthorized expense rejection.'
        };
    }

    const expense = db.prepare(`
        SELECT id
        FROM expense_claims
        WHERE employee_id = ?
        AND status = 'pending'
        ORDER BY id DESC
        LIMIT 1
    `).get(employee.id);

    if (!expense) {

        return {
            success: false,
            message: 'No pending expense found.'
        };
    }

    db.prepare(`
        UPDATE expense_claims
        SET status = 'rejected',
            reviewer_id = ?,
            decided_at = datetime('now')
        WHERE id = ?
    `).run(user.employee_id, expense.id);

    return {
        success: true,
        message: `${employee.name}'s expense rejected successfully.`
    };
}

/* =========================
   APPROVE ALL EXPENSES
========================= */

async function approveAllExpenses(user) {

    let expenses;

    // HR/Admin → approve all
    if (
        user.role === 'admin' ||
        user.role === 'hr'
    ) {

        expenses = db.prepare(`
            SELECT id
            FROM expense_claims
            WHERE status = 'pending'
        `).all();

    } else {

        // Manager → only team expenses
        expenses = db.prepare(`
            SELECT ec.id
            FROM expense_claims ec
            JOIN employees e
                ON e.id = ec.employee_id
            WHERE e.manager_id = ?
            AND ec.status = 'pending'
        `).all(user.employee_id);
    }

    if (expenses.length === 0) {

        return {
            success: false,
            message: 'No pending expense claims found.'
        };
    }

    const updateStmt = db.prepare(`
        UPDATE expense_claims
        SET status = 'approved',
            reviewer_id = ?,
            decided_at = datetime('now')
        WHERE id = ?
    `);

    let approvedCount = 0;

    for (const expense of expenses) {

        updateStmt.run(
            user.employee_id,
            expense.id
        );

        approvedCount++;
    }

    return {
        success: true,
        message: `${approvedCount} expense claims approved successfully.`
    };
}

/* =========================
   APPROVE TIMESHEET
========================= */

async function approveTimesheet(user, data) {

    const employee = db.prepare(`
        SELECT id, manager_id, name
        FROM employees
        WHERE name LIKE ?
    `).get(`%${data.employee_name}%`);

    if (!employee) {

        return {
            success: false,
            message: 'Employee not found.'
        };
    }

    if (
        user.role !== 'admin' &&
        employee.manager_id !== user.employee_id
    ) {

        return {
            success: false,
            message: 'Unauthorized timesheet approval.'
        };
    }

    const timesheet = db.prepare(`
        SELECT id
        FROM timesheet_entries
        WHERE employee_id = ?
        AND status = 'submitted'
        ORDER BY id DESC
        LIMIT 1
    `).get(employee.id);

    if (!timesheet) {

        return {
            success: false,
            message: 'No submitted timesheet found.'
        };
    }

    db.prepare(`
        UPDATE timesheet_entries
        SET status = 'approved',
            reviewer_id = ?,
            decided_at = datetime('now')
        WHERE id = ?
    `).run(user.employee_id, timesheet.id);

    return {
        success: true,
        message: `${employee.name}'s timesheet approved successfully.`
    };
}

/* =========================
   REJECT TIMESHEET
========================= */

async function rejectTimesheet(user, data) {

    const employee = db.prepare(`
        SELECT id, manager_id, name
        FROM employees
        WHERE name LIKE ?
    `).get(`%${data.employee_name}%`);

    if (!employee) {

        return {
            success: false,
            message: 'Employee not found.'
        };
    }

    if (
        user.role !== 'admin' &&
        employee.manager_id !== user.employee_id
    ) {

        return {
            success: false,
            message: 'Unauthorized timesheet rejection.'
        };
    }

    const timesheet = db.prepare(`
        SELECT id
        FROM timesheet_entries
        WHERE employee_id = ?
        AND status = 'submitted'
        ORDER BY id DESC
        LIMIT 1
    `).get(employee.id);

    if (!timesheet) {

        return {
            success: false,
            message: 'No submitted timesheet found.'
        };
    }

    db.prepare(`
        UPDATE timesheet_entries
        SET status = 'rejected',
            reviewer_id = ?,
            decided_at = datetime('now')
        WHERE id = ?
    `).run(user.employee_id, timesheet.id);

    return {
        success: true,
        message: `${employee.name}'s timesheet rejected successfully.`
    };
}

/* =========================
   APPROVE ALL TIMESHEETS
========================= */

async function approveAllTimesheets(user) {

    let query;
    let params = [];

    if (
        user.role === 'admin' ||
        user.role === 'hr'
    ) {

        query = `
            UPDATE timesheet_entries
            SET status = 'approved',
                reviewer_id = ?,
                decided_at = datetime('now')
            WHERE status = 'submitted'
        `;

        params = [user.employee_id];

    } else {

        query = `
            UPDATE timesheet_entries
            SET status = 'approved',
                reviewer_id = ?,
                decided_at = datetime('now')
            WHERE id IN (
                SELECT t.id
                FROM timesheet_entries t
                JOIN employees e
                    ON e.id = t.employee_id
                WHERE e.manager_id = ?
                AND t.status = 'submitted'
            )
        `;

        params = [
            user.employee_id,
            user.employee_id
        ];
    }

    const result = db.prepare(query).run(...params);

    return {
        success: true,
        message: `${result.changes} timesheets approved successfully.`
    };
}

module.exports = {

    // Leave
    approveLeave,
    rejectLeave,
    approveAllLeaves,

    // Expense
    approveExpense,
    rejectExpense,
    approveAllExpenses,

    // Timesheet
    approveTimesheet,
    rejectTimesheet,
    approveAllTimesheets
};
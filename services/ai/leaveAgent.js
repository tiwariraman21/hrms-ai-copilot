const db = require('../../db');

async function applyLeave(user, data) {

    const startDate = new Date();

    startDate.setDate(startDate.getDate() + 1);

    const formattedDate = startDate
        .toISOString()
        .split('T')[0];

    db.prepare(`
        INSERT INTO leave_requests
        (
            employee_id,
            start_date,
            end_date,
            type,
            reason,
            status
        )
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        user.employee_id,
        formattedDate,
        formattedDate,
        'Sick Leave',
        data.reasons?.[0] || 'No reason',
        'pending'
    );

    return {
        success: true,
        message: 'Leave request submitted successfully.'
    };
}

/* =========================
   GET LEAVE BALANCE
========================= */

async function getLeaveBalance(user) {

    const employee = db.prepare(`
        SELECT leave_balance
        FROM employees
        WHERE id = ?
    `).get(user.employee_id);

    return {
        success: true,
        message: `You have ${employee.leave_balance} leaves remaining.`
    };
}

module.exports = {
    applyLeave,
    getLeaveBalance
};
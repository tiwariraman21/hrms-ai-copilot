const db = require('../../db');

async function submitExpense(user, data) {

    db.prepare(`
        INSERT INTO expense_claims
        (
            employee_id,
            category,
            amount,
            expense_date,
            description,
            status
        )
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        user.employee_id,
        'General',
        data.amount || 0,
        new Date().toISOString().split('T')[0],
        data.reason || 'AI submitted expense',
        'pending'
    );

    return {
        success: true,
        message: 'Expense claim submitted successfully.'
    };
}

module.exports = {
    submitExpense
};
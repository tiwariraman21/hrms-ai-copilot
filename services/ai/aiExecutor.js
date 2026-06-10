const leaveAgent = require('./leaveAgent');
const expenseAgent = require('./expenseAgent');
const timesheetAgent = require('./timesheetAgent');
const managerAgent = require('./managerAgent');
const analyticsAgent = require('./analyticsAgent');

async function executeIntent(intent, user, aiData) {

    switch (intent) {

        /* =========================
           LEAVE
        ========================== */

        case 'apply_leave':

            return await leaveAgent.applyLeave(
                user,
                aiData
            );

        case 'get_leave_balance':

            return await leaveAgent.getLeaveBalance(
                user
            );

        case 'approve_leave':

            return await managerAgent.approveLeave(
                user,
                aiData
            );

        case 'reject_leave':

            return await managerAgent.rejectLeave(
                user,
                aiData
            );

        case 'approve_all_leaves':

            return await managerAgent.approveAllLeaves(
                user
            );

        /* =========================
           EXPENSES
        ========================== */

        case 'submit_expense':

            return await expenseAgent.submitExpense(
                user,
                aiData
            );

        case 'approve_expense':

            return await managerAgent.approveExpense(
                user,
                aiData
            );

        case 'reject_expense':

            return await managerAgent.rejectExpense(
                user,
                aiData
            );

        case 'approve_all_expenses':

            return await managerAgent.approveAllExpenses(
                user
            );

        /* =========================
           TIMESHEETS
        ========================== */

        case 'fill_timesheet':

            return await timesheetAgent.fillTimesheet(
                user,
                aiData
            );

        case 'approve_timesheet':

            return await managerAgent.approveTimesheet(
                user,
                aiData
            );

        case 'reject_timesheet':

            return await managerAgent.rejectTimesheet(
                user,
                aiData
            );

        case 'approve_all_timesheets':

            return await managerAgent.approveAllTimesheets(
                user
            );

        /* =========================
           ANALYTICS
        ========================== */

        case 'get_work_hours':

            return await analyticsAgent.getMyWorkHours(
                user
            );

        case 'get_pending_leaves':

            return await analyticsAgent.getPendingLeaves();

        case 'get_absent_employees':

            return await analyticsAgent.getAbsentEmployees();

        case 'get_top_employee_hours':

            return await analyticsAgent.getTopEmployeeByHours();

        case 'get_highest_expense_project':

            return await analyticsAgent.getHighestExpenseProject();

        case 'get_highest_leave_employee':

            return await analyticsAgent.getHighestLeaveEmployee();

        /* =========================
           DEFAULT
        ========================== */

        default:

            return {
                success: false,
                message: `Unsupported intent: ${intent}`
            };
    }
}

module.exports = {
    executeIntent
};
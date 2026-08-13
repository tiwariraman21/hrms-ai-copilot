const rolePermissions = {

    admin: [
    'apply_leave',
    'get_leave_balance',
    'submit_expense',
    'fill_timesheet',

    'approve_leave',
    'approve_all_leaves',

    'approve_expense',
    'approve_all_expenses',

    'approve_timesheet',
    'approve_all_timesheets',

    'view_all_employees',
    'create_project',
    'get_work_hours',
    'get_pending_leaves',
    'get_absent_employees'
],

    hr: [
        'apply_leave',
        'get_leave_balance',
        'submit_expense',
        'fill_timesheet',
        'view_all_employees',
        'view_pending_leaves',
        'approve_leave',
        'approve_expense',
        'get_work_hours',
        'get_pending_leaves',
        'get_absent_employees',
        'get_top_employee_hours',
        'get_highest_expense_project',
        'get_highest_leave_employee',
        'approve_expense',
        'reject_expense',
        'approve_timesheet',
        'reject_timesheet',
        'approve_all_leaves',
        'approve_all_expenses',
        'approve_all_timesheets'
    ],

    manager: [
        'apply_leave',
        'get_leave_balance',
        'submit_expense',
        'fill_timesheet',
        'approve_leave',
        'approve_expense',
        'view_team_attendance',
        'view_pending_timesheets',
        'get_work_hours',
        'get_pending_leaves',
        'approve_timesheet',
        'reject_timesheet',
        'approve_all_leaves',
        'approve_all_timesheets'
    ],

    employee: [
        'apply_leave',
        'get_leave_balance',
        'submit_expense',
        'fill_timesheet',
        'get_work_hours'
    ]
};

function hasPermission(role, intent) {

    return rolePermissions[role]?.includes(intent);
}

module.exports = {
    hasPermission
};

const db = require('../../db');

async function fillTimesheet(user, data) {

    const project = db.prepare(`
        SELECT id
        FROM projects
        WHERE name LIKE ?
    `).get(`%${data.project_names?.[0] || ''}%`);

    if (!project) {

        return {
            success: false,
            message: 'Project not found.'
        };
    }

    db.prepare(`
        INSERT INTO timesheet_entries
        (
            employee_id,
            project_id,
            work_date,
            hours,
            task_description,
            status
        )
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        user.employee_id,
        project.id,
        new Date().toISOString().split('T')[0],
        data.hours || 8,
        'AI-generated timesheet',
        'submitted'
    );

    return {
        success: true,
        message: 'Timesheet submitted successfully.'
    };
}

module.exports = {
    fillTimesheet
};
const groq = require('./groq');

async function classifyIntent(prompt) {

    const completion = await groq.chat.completions.create({

        model: 'openai/gpt-oss-120b',

        messages: [

            {
                role: 'system',
                content: `
You are an HRMS AI assistant.

Your task is to extract:
- intent
- dates
- hours
- project names
- reasons
- amounts

Respond ONLY in valid JSON.

Supported intents:
- apply_leave
- get_leave_balance
- fill_timesheet
- submit_expense

- approve_leave
- reject_leave

- approve_expense
- reject_expense

- approve_timesheet
- reject_timesheet

- get_work_hours
- get_pending_leaves
- get_absent_employees

- get_top_employee_hours
- get_highest_expense_project
- get_highest_leave_employee
- approve_all_leaves
- approve_all_expenses
- approve_all_timesheets
`
            },

            {
                role: 'user',
                content: prompt
            }

        ],

        temperature: 0.1

    });

    return completion.choices[0].message.content;
}

module.exports = classifyIntent;

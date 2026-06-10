const classifyIntent = require('../services/ai/intentClassifier');

const { hasPermission } = require('../services/ai/permissions');

async function aiMiddleware(req, res, next) {

    try {

        const { prompt } = req.body;

        // Initialize AI context
        if (!req.session.aiContext) {

            req.session.aiContext = {};
        }

        const pendingContext = req.session.aiContext;

        // Store for route access
        req.pendingContext = pendingContext;

        // Classify intent
        const rawReply = await classifyIntent(prompt);

        // Clean JSON formatting
        const cleanedReply = rawReply
            .replace(/```json/g, '')
            .replace(/```/g, '')
            .trim();

        const aiData = JSON.parse(cleanedReply);

        // Permission check
        const userRole = req.session.user.role;

        if (!hasPermission(userRole, aiData.intent)) {

            return res.json({
                success: false,
                message: `Your role (${userRole}) is not authorized for this action.`
            });
        }

        // Attach parsed AI data
        req.aiData = aiData;

        next();

    } catch (err) {

        console.error(err);

        return res.json({
            success: false,
            message: 'AI middleware processing failed.'
        });
    }
}

module.exports = aiMiddleware;
const express = require('express');
const router = express.Router();

const aiMiddleware = require('../middleware/aiMiddleware');
const aiExecutor = require('../services/ai/aiExecutor');

router.post('/chat', aiMiddleware, async (req, res) => {

    try {

        const { prompt } = req.body;

        const aiData = req.aiData;

        /* =========================
           CREATE CONTEXT
        ========================== */

        if (!req.session.aiContext) {

            req.session.aiContext = {};
        }

        const pendingContext = req.session.aiContext;

        /* =========================
           HANDLE FOLLOW-UP PROMPTS
        ========================== */

        if (
            pendingContext &&
            pendingContext.pendingIntent === 'apply_leave'
        ) {

            pendingContext.partialData.reasons = [prompt];

            const result = await aiExecutor.executeIntent(
                'apply_leave',
                req.session.user,
                pendingContext.partialData
            );

            req.session.aiContext = null;

            return res.json(result);
        }

        /* =========================
           HANDLE INCOMPLETE REQUEST
        ========================== */

        if (
            aiData.intent === 'apply_leave' &&
            (!aiData.reasons || aiData.reasons.length === 0)
        ) {

            req.session.aiContext = {
                pendingIntent: 'apply_leave',
                partialData: aiData
            };

            return res.json({
                success: true,
                message: 'What is the reason for leave?'
            });
        }

        /* =========================
           EXECUTE AI INTENT
        ========================== */

        const result = await aiExecutor.executeIntent(
            aiData.intent,
            req.session.user,
            aiData
        );

        res.json(result);

    } catch (err) {

        console.error(err);

        res.json({
            success: false,
            message: 'AI processing failed.'
        });

    }

});

module.exports = router;
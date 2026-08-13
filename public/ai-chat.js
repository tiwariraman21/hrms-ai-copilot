const chatButton = document.getElementById('ai-chat-button');
const chatContainer = document.getElementById('ai-chat-container');
const sendBtn = document.getElementById('ai-send-btn');
const input = document.getElementById('ai-chat-input');
const messages = document.getElementById('ai-chat-messages');


/* =========================
   TOGGLE CHAT
========================= */

chatButton.addEventListener('click', () => {

    chatContainer.classList.toggle('hidden');

});


/* =========================
   SEND MESSAGE FUNCTION
========================= */

async function sendMessage(prompt) {

    if (!prompt) return;


    messages.innerHTML += `
        <div style="margin-bottom:10px;">
            <b>You:</b> ${prompt}
        </div>
    `;

    messages.scrollTop = messages.scrollHeight;


    try {

        const response = await fetch('/ai/chat', {

            method: 'POST',

            headers: {
                'Content-Type': 'application/json'
            },

            body: JSON.stringify({
                prompt: prompt
            })

        });


        const data = await response.json();


        messages.innerHTML += `
            <div style="margin-bottom:10px;">
                <b>AI:</b> ${data.message || data.reply || 'No response received.'}
            </div>
        `;


        messages.scrollTop = messages.scrollHeight;


    } catch (error) {

        console.error(
            'AI chat error:',
            error
        );


        messages.innerHTML += `
            <div
                style="
                    margin-bottom:10px;
                    color:#DC2626;
                "
            >
                <b>AI:</b>
                Unable to connect to the AI service.
            </div>
        `;


        messages.scrollTop =
            messages.scrollHeight;

    }

}


/* =========================
   SEND BUTTON
========================= */

sendBtn.addEventListener(
    'click',
    async () => {

        const prompt =
            input.value.trim();


        if (!prompt) return;


        input.value = '';


        await sendMessage(prompt);

    }
);


/* =========================
   ENTER KEY SUPPORT
========================= */

input.addEventListener(
    'keypress',
    async (e) => {

        if (e.key === 'Enter') {

            const prompt =
                input.value.trim();


            if (!prompt) return;


            input.value = '';


            await sendMessage(prompt);

        }

    }
);


/* =========================
   AI SUGGESTIONS
========================= */

const suggestionButtons =
    document.querySelectorAll(
        '.ai-suggestion'
    );


suggestionButtons.forEach(
    button => {

        button.addEventListener(
            'click',
            () => {

                const prompt =
                    button.innerText.trim();


                if (!prompt) return;


                input.value =
                    prompt;


                // Automatically send
                // the suggestion.

                sendBtn.click();

            }
        );

    }
);

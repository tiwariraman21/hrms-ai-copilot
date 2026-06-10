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

    const response = await fetch('/ai/chat', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prompt })
    });

    const data = await response.json();

    messages.innerHTML += `
        <div style="margin-bottom:10px;">
            <b>AI:</b> ${data.message || data.reply}
        </div>
    `;

    messages.scrollTop = messages.scrollHeight;
}

/* =========================
   SEND BUTTON
========================= */

sendBtn.addEventListener('click', async () => {

    const prompt = input.value.trim();

    if (!prompt) return;

    input.value = '';

    await sendMessage(prompt);

});

/* =========================
   ENTER KEY SUPPORT
========================= */

input.addEventListener('keypress', async (e) => {

    if (e.key === 'Enter') {

        const prompt = input.value.trim();

        if (!prompt) return;

        input.value = '';

        await sendMessage(prompt);
    }
});

/* =========================
   AI SUGGESTIONS
========================= */

suggestionButtons.forEach((button) => {

    button.addEventListener('click', async () => {

        const prompt = button.innerText.trim();

        await sendMessage(prompt);

    });

});

const suggestionButtons = document.querySelectorAll('.ai-suggestion');

suggestionButtons.forEach(button => {

    button.addEventListener('click', async () => {

        const input = document.getElementById('ai-chat-input');

        input.value = button.innerText;

        // Optional auto-send
        document.getElementById('ai-send-btn').click();
    });

});
// --- UI ELEMENTS ---
const chatMessages = document.getElementById('chat-messages');
const userInput = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const menuToggle = document.getElementById('menu-toggle');
const sidebar = document.querySelector('.sidebar');
const overlay = document.getElementById('sidebar-overlay');
const psidInput = document.getElementById('psid');
const psidtsInput = document.getElementById('psidts');
const sessionNameInput = document.getElementById('session-name');
const saveBtn = document.getElementById('save-config');
const configStatus = document.getElementById('config-status');
const backendStatus = document.getElementById('backend-status');
const statusText = document.getElementById('status-text');
const themeToggle = document.getElementById('theme-toggle');

const apiKeyDisplay = document.getElementById('api-key-display');
const toggleApiBtn = document.getElementById('toggle-api-visibility');
const regenerateBtn = document.getElementById('regenerate-api-key');
const clearSessionBtn = document.getElementById('clear-session');
const apiKeyBox = document.querySelector('.api-key-box');
const curlContainer = document.querySelector('.curl-container');
const testPromptInput = document.getElementById('test-prompt');
const curlCode = document.getElementById('curl-preview-code');
const copyCurlBtn = document.getElementById('copy-curl-btn');
const runTestBtn = document.getElementById('run-test');
const testResult = document.getElementById('test-result');
const keyBadge = document.getElementById('key-badge');
const keyTimeLabel = document.getElementById('key-time-label');

let isConfigured = false;
let currentApiKey = "";

// --- MULTI-USER ISOLATION ---
function getUserId() {
    let uid = localStorage.getItem('gemini_user_id');
    if (!uid) {
        uid = 'user_' + Math.random().toString(36).substring(2, 11);
        localStorage.setItem('gemini_user_id', uid);
    }
    return uid;
}
let userId = getUserId();

// --- MARKDOWN & HIGHLIGHTING CONFIG ---
marked.setOptions({
    highlight: function(code, lang) {
        const language = hljs.getLanguage(lang) ? lang : 'plaintext';
        return hljs.highlight(code, { language }).value;
    },
    langPrefix: 'hljs language-', // highlight.js css expects a top-level 'hljs' class.
    pedantic: false,
    gfm: true,
    breaks: true,
    sanitize: false,
    smartypants: false,
    xhtml: false
});

const SVG_MOON = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>`;
const SVG_SUN = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>`;
const SVG_EYE = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`;
const SVG_EYE_OFF = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>`;

// --- THEME SWITCHER ---
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        themeToggle.innerHTML = SVG_SUN;
    }
}

themeToggle.onclick = () => {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    themeToggle.innerHTML = isLight ? SVG_SUN : SVG_MOON;
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
};

// --- STATUS MONITOR ---
setInterval(checkBackendStatus, 10000); // 10s check

// --- API KEY ACTIONS ---
function updateCurlPreview() {
    if (!curlCode) return;
    const prompt = testPromptInput.value.trim() || "Hello Gemini";
    const host = window.location.origin;
    const key = currentApiKey || "YOUR_PROXY_KEY";
    curlCode.innerText = `curl.exe -X POST ${host}/api/chat -H "Content-Type: application/json" -H "X-Gemini-Key: ${key}" -d '{\\"prompt\\": \\"${prompt}\\"}'`;
}

function applyNewKey(key, isNewAction = true) {
    currentApiKey = key;
    apiKeyDisplay.value = key;
    updateCurlPreview();
    document.getElementById('proxy-section').style.display = 'block';
    
    if (isNewAction) {
        keyBadge.style.display = 'inline-block';
        keyTimeLabel.innerText = 'Last Generated: ' + new Date().toLocaleTimeString();
        apiKeyBox.classList.add('key-pulse');
        
        const wasHidden = apiKeyDisplay.type === 'password';
        apiKeyDisplay.type = 'text'; 
        
        setTimeout(() => {
            if (wasHidden) apiKeyDisplay.type = 'password';
            apiKeyBox.classList.remove('key-pulse');
            keyBadge.style.display = 'none';
        }, 6000);
    } else {
        keyTimeLabel.innerText = 'Session Active (Proxy Online)';
    }
}

testPromptInput.oninput = updateCurlPreview;

copyCurlBtn.onclick = () => {
    navigator.clipboard.writeText(curlCode.innerText);
    const original = copyCurlBtn.innerText;
    copyCurlBtn.innerText = "Copied!";
    setTimeout(() => copyCurlBtn.innerText = original, 2000);
};

toggleApiBtn.onclick = () => {
    const isHidden = apiKeyDisplay.type === 'password';
    apiKeyDisplay.type = isHidden ? 'text' : 'password';
    toggleApiBtn.innerHTML = isHidden ? SVG_EYE_OFF : SVG_EYE;
};

regenerateBtn.onclick = async () => {
    regenerateBtn.classList.add('spinning');
    try {
        const response = await fetch('/api/regenerate_key', { 
            method: 'POST',
            headers: { 'X-User-ID': userId }
        });
        const data = await response.json();
        if (response.ok) {
            applyNewKey(data.api_key, true);
            showConfigStatus('Key Regenerated!', 'success');
        }
    } catch (err) {
        showConfigStatus('Fail to refresh key', 'error');
    } finally {
        regenerateBtn.classList.remove('spinning');
    }
};

clearSessionBtn.onclick = async () => {
    try {
        const response = await fetch('/api/clear_session', { 
            method: 'POST',
            headers: { 'X-User-ID': userId }
        });
        if (response.ok) {
            isConfigured = false;
            currentApiKey = "";
            document.getElementById('proxy-section').style.display = 'none';
            showConfigStatus('Session cleared', 'error');
            addMessage('bot', 'Session cleared. Please re-configure.');
            psidInput.value = '';
            psidtsInput.value = '';
            checkBackendStatus();
        }
    } catch (err) {
        showConfigStatus('Fail to clear', 'error');
    }
};

// --- CONFIGURATION ---
saveBtn.onclick = async () => {
    const psid = psidInput.value.trim();
    const psidts = psidtsInput.value.trim();
    const sessionName = sessionNameInput.value.trim();
    
    if (!psid || !psidts) {
        showConfigStatus('Enter cookies', 'error');
        return;
    }
    
    saveBtn.disabled = true;
    saveBtn.innerText = 'Connecting...';
    
    try {
        const response = await fetch('/api/config', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-User-ID': userId
            },
            body: JSON.stringify({ psid, psidts, session_name: sessionName })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            if (data.user_id) {
                userId = data.user_id;
                localStorage.setItem('gemini_user_id', userId);
            }
            
            if (data.connection === 'connected') {
                showConfigStatus('Session initialized', 'success');
                addMessage('bot', 'Gemini is linked. Ready for chat.');
            } else {
                showConfigStatus('Config saved (offline)', 'success');
                addMessage('bot', 'Configuration saved, but Google is rate-limiting or offline.');
            }

            isConfigured = true;
            userInput.disabled = false;
            sendBtn.disabled = false;
            applyNewKey(data.api_key, true);
        } else {
            showConfigStatus(data.detail || 'Init failed', 'error');
        }
    } catch (err) {
        showConfigStatus('Network error', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerText = 'Initialize Session';
        checkBackendStatus();
    }
};

// --- CHAT LOGIC ---
const sendMessage = async () => {
    const text = userInput.value.trim();
    if (!text || !isConfigured) return;
    
    addMessage('user', text);
    userInput.value = '';
    userInput.style.height = 'auto';
    
    const botMsgDiv = addMessage('bot', '<div class="typing-loader"><span></span><span></span><span></span></div>');
    
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-User-ID': userId
            },
            body: JSON.stringify({ prompt: text })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            renderBotResponse(botMsgDiv, data);
        } else {
            botMsgDiv.querySelector('.message-bubble').innerText = `Error: ${data.detail || 'Failed'}`;
        }
    } catch (err) {
        botMsgDiv.querySelector('.message-bubble').innerText = 'Network error.';
    } finally {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
};

sendBtn.onclick = sendMessage;
userInput.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
};

function renderBotResponse(messageContainer, data) {
    const bubble = messageContainer.querySelector('.message-bubble');
    bubble.innerHTML = '';
    
    // Text Content — strip invalid image_generation_content placeholder markdown images
    if (data.content) {
        let sanitized = data.content;
        
        // Remove broken placeholder image markdown: ![...](http://googleusercontent.com/image_generation_content/...)
        sanitized = sanitized.replace(/!\[.*?\]\(http:\/\/googleusercontent\.com\/image_generation_content\/[^)]*\)/g, '');
        
        // Also strip bare placeholder URLs if they appear in text
        sanitized = sanitized.replace(/http:\/\/googleusercontent\.com\/image_generation_content\/\S*/g, '');
        
        const textDiv = document.createElement('div');
        textDiv.className = 'bot-text';
        textDiv.innerHTML = marked.parse(sanitized.trim());
        bubble.appendChild(textDiv);
        
        textDiv.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightElement(block);
        });
    }
    
    // Real Images from data.images (already filtered by backend — only lh3/lh4.googleusercontent.com)
    if (data.images && data.images.length > 0) {
        const imageGrid = document.createElement('div');
        imageGrid.className = 'image-grid';
        
        data.images.forEach(originalUrl => {
            if (!originalUrl.includes('googleusercontent.com') && !originalUrl.includes('gstatic.com')) return;
            
            const wrapper = document.createElement('div');
            wrapper.className = 'img-wrapper';
            
            const proxyUrl = `/api/proxy_image?url=${encodeURIComponent(originalUrl)}&user_id=${userId}`;
            
            const img = document.createElement('img');
            img.src = proxyUrl;
            img.className = 'chat-img';
            img.loading = 'lazy';
            img.alt = 'Generated image';
            
            // On proxy failure: replace broken box with a clean "Open Image" button
            img.onerror = () => {
                wrapper.innerHTML = '';
                wrapper.className = 'img-fallback-wrapper';
                
                const link = document.createElement('a');
                link.href = originalUrl;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.className = 'img-fallback-btn';
                link.title = 'Click to open image in new tab';
                link.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/>
                        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                    </svg>
                    <span>Open Generated Image</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                        <polyline points="15 3 21 3 21 9"/><line x1="10" x2="21" y1="14" y2="3"/>
                    </svg>
                `;
                wrapper.appendChild(link);
            };
            
            wrapper.appendChild(img);
            
            const overlay = document.createElement('div');
            overlay.className = 'img-overlay';
            const btn = document.createElement('a');
            btn.href = proxyUrl;
            btn.target = '_blank';
            btn.className = 'img-btn';
            btn.innerText = '🔍 View Full HD';
            overlay.appendChild(btn);
            wrapper.appendChild(overlay);
            
            imageGrid.appendChild(wrapper);
        });
        
        if (imageGrid.children.length > 0) {
            bubble.appendChild(imageGrid);
        }
    }
    
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function addMessage(type, content) {
    const div = document.createElement('div');
    div.className = `message ${type}`;
    
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    
    if (type === 'user') {
        bubble.innerText = content;
    } else {
        bubble.innerHTML = content;
    }
    
    div.appendChild(bubble);
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    return div;
}

function showConfigStatus(text, type) {
    configStatus.innerText = text;
    configStatus.className = `status-indicator ${type}`;
}

// --- SIDEBAR TOGGLE ---
const toggleSidebar = () => {
    sidebar.classList.toggle('active');
    overlay.classList.toggle('active');
};

menuToggle.onclick = toggleSidebar;
overlay.onclick = toggleSidebar;

async function checkBackendStatus() {
    try {
        const response = await fetch('/api/status', {
            headers: { 'X-User-ID': userId }
        });
        const data = await response.json();
        
        const statusTextHeader = document.getElementById('status-text-header');
        const dots = document.querySelectorAll('.status-dot');
        
        if (data.status === 'online') {
            dots.forEach(d => d.classList.add('online'));
            statusText.innerText = 'System Online';
            if (statusTextHeader) statusTextHeader.innerText = 'Connected';
            
            if (data.configured) {
                if (!isConfigured) {
                    isConfigured = true;
                    userInput.disabled = false;
                    sendBtn.disabled = false;
                    // Load key data if not loaded
                    const keyResp = await fetch('/api/key', { headers: { 'X-User-ID': userId } });
                    const keyData = await keyResp.json();
                    if (keyData.api_key) applyNewKey(keyData.api_key, false);
                }
            } else {
                isConfigured = false;
                userInput.disabled = true;
                sendBtn.disabled = true;
            }
        } else {
            dots.forEach(d => d.classList.remove('online'));
            statusText.innerText = 'Backend Offline';
            isConfigured = false; 
            userInput.disabled = true;
            sendBtn.disabled = true;
        }
    } catch (e) {
        console.error('Status check failed');
    }
}

// --- INIT ---
function init() {
    initTheme();
    checkBackendStatus();
    setInterval(checkBackendStatus, 10000);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

userInput.oninput = () => {
    userInput.style.height = 'auto';
    userInput.style.height = userInput.scrollHeight + 'px';
};

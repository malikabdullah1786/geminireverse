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

// --- THEME SWITCHER ---
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    if (savedTheme === 'light') {
        document.body.classList.add('light-mode');
        themeToggle.innerText = '☀️';
    }
}

themeToggle.onclick = () => {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
    themeToggle.innerText = isLight ? '☀️' : '🌙';
};

// --- STATUS MONITOR ---
setInterval(checkBackendStatus, 10000); // 10s check

// --- API KEY ACTIONS ---
function updateCurlPreview() {
    if (!curlCode) return;
    const prompt = testPromptInput.value.trim() || "Hello Gemini";
    const host = window.location.origin;
    const key = currentApiKey || "YOUR_PROXY_KEY";
    // Strictly one-line cURL command for Windows/Universal use
    curlCode.innerText = `curl.exe -X POST ${host}/api/chat -H "Content-Type: application/json" -H "X-Gemini-Key: ${key}" -d '{\\"prompt\\": \\"${prompt}\\"}'`;
}

function applyNewKey(key, isNewAction = true) {
    currentApiKey = key;
    apiKeyDisplay.value = key;
    updateCurlPreview();
    document.getElementById('proxy-section').style.display = 'block';
    
    if (isNewAction) {
        // Visual Proof System
        keyBadge.style.display = 'inline-block';
        keyTimeLabel.innerText = 'Last Generated: ' + new Date().toLocaleTimeString();
        apiKeyBox.classList.add('key-pulse');
        curlContainer.classList.add('key-pulse');
        
        const wasHidden = apiKeyDisplay.type === 'password';
        apiKeyDisplay.type = 'text'; // Reveal key to prove it's dynamic
        
        setTimeout(() => {
            if (wasHidden) apiKeyDisplay.type = 'password';
            apiKeyBox.classList.remove('key-pulse');
            curlContainer.classList.remove('key-pulse');
            keyBadge.style.display = 'none';
        }, 6000); // 6s reveal for absolute certainty
    } else {
        keyTimeLabel.innerText = 'Session Active (Proxy Online)';
    }
}

testPromptInput.oninput = () => {
    updateCurlPreview();
};

copyCurlBtn.onclick = () => {
    navigator.clipboard.writeText(curlCode.innerText);
    const original = copyCurlBtn.innerText;
    copyCurlBtn.innerText = "Copied!";
    setTimeout(() => copyCurlBtn.innerText = original, 2000);
};

toggleApiBtn.onclick = () => {
    const isHidden = apiKeyDisplay.type === 'password';
    apiKeyDisplay.type = isHidden ? 'text' : 'password';
    toggleApiBtn.innerText = isHidden ? '🙈' : '👁️';
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
            addMessage('System', 'Session cleared. Please re-configure.', 'system');
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
            // Update local ID if a new name was set
            if (data.user_id) {
                userId = data.user_id;
                localStorage.setItem('gemini_user_id', userId);
            }
            
            if (data.connection === 'connected') {
                showConfigStatus('Session initialized', 'success');
                addMessage('System', 'Gemini is linked. Ready for chat.', 'bot');
            } else {
                showConfigStatus('Config saved (offline)', 'success');
                addMessage('System', 'Configuration saved, but Google is rate-limiting or offline. You can chat once the backend connects.', 'system');
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

// --- API TESTER ---
runTestBtn.onclick = async () => {
    const prompt = testPromptInput.value.trim() || "Ping";
    
    runTestBtn.disabled = true;
    runTestBtn.innerText = 'Testing...';
    testResult.style.display = 'block';
    testResult.innerText = 'Requesting...';
    testResult.className = 'status-indicator';
    
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-User-ID': userId
            },
            body: JSON.stringify({ prompt: prompt })
        });
        
        const data = await response.json();
        testResult.innerText = JSON.stringify(data, null, 2);
        testResult.className = `status-indicator ${response.ok ? 'success' : 'error'}`;
    } catch (err) {
        testResult.innerText = 'Error: ' + err.message;
        testResult.className = 'status-indicator error';
    } finally {
        runTestBtn.disabled = false;
        runTestBtn.innerText = 'Run Proxy Test';
    }
};

// --- CHAT LOGIC ---
const sendMessage = async () => {
    const text = userInput.value.trim();
    if (!text || !isConfigured) return;
    
    addMessage('You', text, 'user');
    userInput.value = '';
    userInput.style.height = 'auto';
    
    const botMsgDiv = addMessage('Gemini', '...', 'bot');
    
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
            botMsgDiv.innerText = `Error: ${data.detail || 'Failed'}`;
        }
    } catch (err) {
        botMsgDiv.innerText = 'Network error.';
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

function renderBotResponse(container, data) {
    container.innerHTML = '';
    
    // Text Content
    if (data.content) {
        const textDiv = document.createElement('div');
        textDiv.className = 'bot-text';
        textDiv.innerHTML = marked.parse(data.content);
        container.appendChild(textDiv);
    }
    
    // Images
    if (data.images && data.images.length > 0) {
        const imageGrid = document.createElement('div');
        imageGrid.className = 'image-grid';
        data.images.forEach(url => {
            const wrapper = document.createElement('div');
            wrapper.className = 'img-wrapper';
            
            const img = document.createElement('img');
            img.src = url;
            img.className = 'chat-img';
            img.onclick = () => window.open(url, '_blank');
            wrapper.appendChild(img);
            
            const downloadLink = document.createElement('a');
            downloadLink.href = url;
            downloadLink.target = '_blank';
            downloadLink.innerText = '⬇ Download';
            downloadLink.className = 'img-download';
            wrapper.appendChild(downloadLink);
            
            imageGrid.appendChild(wrapper);
        });
        container.appendChild(imageGrid);
    }
}

function addMessage(sender, text, type) {
    const div = document.createElement('div');
    div.className = `message ${type}`;
    
    if (type === 'bot' && typeof text === 'object') {
        renderBotResponse(div, text);
    } else {
        div.innerText = text;
    }
    
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

async function loadKeyData() {
    try {
        const response = await fetch('/api/key', {
            headers: { 'X-User-ID': userId }
        });
        const data = await response.json();
        if (data.api_key) {
            applyNewKey(data.api_key, false);
        }
    } catch (err) {
        console.error('Failed to load key data');
    }
}

async function checkBackendStatus() {
    try {
        const response = await fetch('/api/status', {
            headers: { 'X-User-ID': userId }
        });
        const data = await response.json();
        
        const statusTextHeader = document.getElementById('status-text-header');
        const headerIndicator = document.querySelector('.chat-header .status-indicator');
        const sidebarIndicator = document.getElementById('backend-status-sidebar');
        
        if (data.status === 'online') {
            // Update Sidebar Logo Dot
            if (backendStatus) {
                backendStatus.classList.remove('offline');
                backendStatus.classList.add('online');
                backendStatus.innerHTML = '<span class="status-dot online"></span>';
            }

            // Update Sidebar Status Card
            if (sidebarIndicator) {
                sidebarIndicator.classList.add('online');
                sidebarIndicator.querySelector('.status-dot').classList.add('online');
                statusText.innerText = 'Backend Live';
            }
            
            // Update Header (Mobile)
            if (statusTextHeader) {
                statusTextHeader.innerText = 'Connected';
                headerIndicator.classList.add('online');
                headerIndicator.querySelector('.status-dot').classList.add('online');
            }
            
            if (data.configured) {
                if (!isConfigured) {
                    isConfigured = true;
                    userInput.disabled = false;
                    sendBtn.disabled = false;
                    loadKeyData();
                }
            } else {
                isConfigured = false;
                userInput.disabled = true;
                sendBtn.disabled = true;
                document.getElementById('proxy-section').style.display = 'none';
            }
        } else {
            // Handle offline case
            isConfigured = false; 
            userInput.disabled = true;
            sendBtn.disabled = true;
        }
    } catch (e) {
        console.error('Status check failed');
    }
}

// --- INIT ---
initTheme();
checkBackendStatus();
userInput.oninput = () => {
    userInput.style.height = 'auto';
    userInput.style.height = userInput.scrollHeight + 'px';
};

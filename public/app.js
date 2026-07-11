/**
 * app.js
 * 
 * Frontend logic for the Agentic C++ Code Interpreter Chatbot.
 * Manages configuration settings, local storage of API keys,
 * dynamic select boxes, DOM events, server polling,
 * chat rendering, and custom terminal UI accordion generation.
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const providerSelect = document.getElementById('provider-select');
  const modelSelect = document.getElementById('model-select');
  const apiKeyInput = document.getElementById('api-key-input');
  const toggleKeyVisibilityBtn = document.getElementById('toggle-key-visibility');
  const eyeIcon = document.getElementById('eye-icon');
  
  const serverStatusDot = document.getElementById('server-status-dot');
  const compilerStatusDot = document.getElementById('compiler-status-dot');
  const currentConfigSummary = document.getElementById('current-config-summary');
  
  const chatHistory = document.getElementById('chat-history');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');
  const submitBtn = document.getElementById('submit-btn');
  const clearChatBtn = document.getElementById('clear-chat-btn');
  
  const orchestratorStatus = document.getElementById('orchestrator-status');
  const statusMainText = document.getElementById('status-main-text');
  const statusSubText = document.getElementById('status-sub-text');
  
  // --- Config State ---
  let systemConfig = null;
  const providerModels = {
    gemini: ['gemini-flash-latest', 'gemini-3.5-pro', 'gemini-2.5-flash'],
    openai: ['gpt-4o-mini', 'gpt-4o', 'o1-mini'],
    anthropic: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-20240229']
  };

  // --- Initial System Diagnostics ---
  async function runDiagnostics() {
    try {
      const response = await fetch('/api/config');
      if (response.ok) {
        systemConfig = await response.json();
        // Server online
        serverStatusDot.className = 'status-dot online';
        
        // Check if compiler is available dynamically on server
        if (systemConfig.compilerAvailable) {
          compilerStatusDot.className = 'status-dot online';
        } else {
          compilerStatusDot.className = 'status-dot offline';
        }
        
        console.log('[Diagnostics] System online:', systemConfig);
      } else {
        throw new Error('Config API returned ' + response.status);
      }
    } catch (err) {
      console.error('[Diagnostics] Failed:', err);
      serverStatusDot.className = 'status-dot offline';
      compilerStatusDot.className = 'status-dot offline';
    }
  }

  // --- UI Helpers ---
  function updateModelOptions() {
    const provider = providerSelect.value;
    const models = providerModels[provider] || [];
    
    modelSelect.innerHTML = '';
    models.forEach(model => {
      const option = document.createElement('option');
      option.value = model;
      option.textContent = model;
      modelSelect.appendChild(option);
    });
    
    // Auto-select first
    if (models.length > 0) {
      modelSelect.value = models[0];
    }
    
    updateConfigSummary();
  }

  function loadApiKey() {
    const provider = providerSelect.value;
    const savedKey = localStorage.getItem(`chatbot_key_${provider}`) || '';
    apiKeyInput.value = savedKey;
  }

  function saveApiKey() {
    const provider = providerSelect.value;
    const key = apiKeyInput.value.trim();
    if (key) {
      localStorage.setItem(`chatbot_key_${provider}`, key);
    } else {
      localStorage.removeItem(`chatbot_key_${provider}`);
    }
    updateConfigSummary();
  }

  function updateConfigSummary() {
    const providerText = providerSelect.options[providerSelect.selectedIndex]?.text || 'Gemini';
    const model = modelSelect.value || 'gemini-flash-latest';
    const hasKey = apiKeyInput.value.trim() !== '' ? '✓ Key' : '✗ No Key';
    currentConfigSummary.textContent = `${providerText} (${model}) | ${hasKey}`;
  }

  // Toggle API Key visibility
  toggleKeyVisibilityBtn.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      eyeIcon.setAttribute('data-lucide', 'eye-off');
    } else {
      apiKeyInput.type = 'password';
      eyeIcon.setAttribute('data-lucide', 'eye');
    }
    lucide.createIcons();
  });

  // Auto-expand textarea
  chatInput.addEventListener('input', () => {
    chatInput.style.height = 'auto';
    chatInput.style.height = (chatInput.scrollHeight - 4) + 'px';
  });

  // --- C++ Custom Syntax Highlighter ---
  function highlightCpp(code) {
    let html = code
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
      
    // Highlights
    // 1. Comments
    html = html.replace(/(\/\/.*)/g, '<span class="token comment">$1</span>');
    html = html.replace(/(\/\*[\s\S]*?\*\/\r?\n?)/g, '<span class="token comment">$1</span>');
    
    // 2. Includes/Headers
    html = html.replace(/(#include\s*&lt;[^&]+&gt;|#include\s*"[^"]+")/g, '<span class="token include">$1</span>');
    
    // 3. Keywords
    const keywords = /\b(int|double|float|char|void|bool|class|struct|public|private|protected|template|typename|return|if|else|while|for|do|switch|case|default|break|continue|new|delete|const|constexpr|static|extern|friend|namespace|using|std|size_t)\b/g;
    html = html.replace(keywords, '<span class="token keyword">$1</span>');
    
    // 4. Functions
    html = html.replace(/\b([a-zA-Z_][a-zA-Z0-9_]*)(?=\s*\()/g, '<span class="token function">$1</span>');
    
    // 5. Strings
    html = html.replace(/("[\s\S]*?")/g, '<span class="token string">$1</span>');
    
    // 6. Numbers
    html = html.replace(/\b(\d+(\.\d+)?)\b/g, '<span class="token number">$1</span>');
    
    return html;
  }

  // --- Chat View Builders ---
  function appendUserBubble(text) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble user-bubble';
    bubble.innerHTML = `
      <div class="bubble-header">
        <div class="avatar"><i data-lucide="user"></i></div>
        <div class="sender-info">
          <span class="sender-name">You</span>
          <span class="timestamp">${time}</span>
        </div>
      </div>
      <div class="bubble-content">
        <p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>
      </div>
    `;
    chatHistory.appendChild(bubble);
    lucide.createIcons();
    scrollToBottom();
  }

  function appendAssistantBubble(data) {
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble assistant-bubble glass-panel';
    
    // Determine title info
    const provider = providerSelect.value;
    const model = modelSelect.value;
    
    // Extract parts for reasoning and explanation
    let reasoningText = '';
    let explanationText = '';
    
    if (data.hasCode) {
      // Extract reasoning by taking everything in initialLlmResponse before the ```cpp
      const splitIdx = data.initialLlmResponse.indexOf('```');
      reasoningText = splitIdx !== -1 
        ? data.initialLlmResponse.substring(0, splitIdx).trim()
        : 'Formulated compilation strategy:';
        
      explanationText = data.finalExplanation.trim();
    } else {
      reasoningText = data.initialLlmResponse;
    }

    // Escape reasoning/explanations and handle basic bold/code formats
    const formattedReasoning = formatMarkdownText(reasoningText);
    const formattedExplanation = formatMarkdownText(explanationText);

    let html = `
      <div class="bubble-header">
        <div class="avatar neon-bg"><i data-lucide="bot"></i></div>
        <div class="sender-info">
          <span class="sender-name">Agentic Orchestrator</span>
          <span class="timestamp">${provider.toUpperCase()} (${model}) • ${time}</span>
        </div>
      </div>
      <div class="bubble-content">
        <div class="reasoning-section">${formattedReasoning}</div>
    `;

    // Render Trace Accordions if execution happened
    if (data.hasCode) {
      const codeHtml = highlightCpp(data.cppCode);
      const compileSuccess = data.compiled;
      const executionSuccess = data.compiled && !data.timeout && !data.stderr;

      html += `
        <div class="execution-trace">
          <!-- Accordion 1: C++ Code -->
          <details class="trace-accordion">
            <summary>
              <div class="summary-left">
                <i data-lucide="code-2" class="neon-text"></i>
                <span>Generated C++ Script</span>
              </div>
              <div style="display:flex; align-items:center; gap:10px;">
                <span class="trace-status success">C++17</span>
                <i data-lucide="chevron-down" class="chevron-icon"></i>
              </div>
            </summary>
            <div class="accordion-content">
              <button class="copy-code-btn" title="Copy Code"><i data-lucide="copy"></i></button>
              <pre class="code-panel"><code>${codeHtml}</code></pre>
            </div>
          </details>

          <!-- Accordion 2: Compiler Logs -->
          <details class="trace-accordion">
            <summary>
              <div class="summary-left">
                <i data-lucide="binary" class="neon-text"></i>
                <span>g++ Compiler Output</span>
              </div>
              <div style="display:flex; align-items:center; gap:10px;">
                <span class="trace-status ${compileSuccess ? 'success' : 'error'}">${compileSuccess ? 'success' : 'failed'}</span>
                <i data-lucide="chevron-down" class="chevron-icon"></i>
              </div>
            </summary>
            <div class="accordion-content">
              <div class="terminal-panel">
                <div class="terminal-header">
                  <div class="terminal-dots">
                    <div class="terminal-dot red"></div>
                    <div class="terminal-dot yellow"></div>
                    <div class="terminal-dot green"></div>
                  </div>
                  <span class="terminal-tab-name">compiler.log</span>
                </div>
                <div class="terminal-console">
                  <div class="terminal-line command">$ g++ temp_source.cpp -o temp_exec.exe</div>
                  ${compileSuccess 
                    ? '<div class="terminal-line output" style="color:var(--color-success)">Compilation complete. 0 warnings, 0 errors.</div>'
                    : `<div class="terminal-line err-output">${escapeHtml(data.stderr)}</div>`
                  }
                </div>
              </div>
            </div>
          </details>

          <!-- Accordion 3: Terminal Console -->
          <details class="trace-accordion" ${compileSuccess ? 'open' : ''}>
            <summary>
              <div class="summary-left">
                <i data-lucide="terminal" class="neon-text"></i>
                <span>Terminal Sandbox Console</span>
              </div>
              <div style="display:flex; align-items:center; gap:10px;">
                <span class="trace-status ${executionSuccess ? 'success' : 'error'}">
                  ${data.timeout ? 'timeout' : (executionSuccess ? 'exit 0' : 'error')}
                </span>
                <i data-lucide="chevron-down" class="chevron-icon"></i>
              </div>
            </summary>
            <div class="accordion-content">
              <div class="terminal-panel">
                <div class="terminal-header">
                  <div class="terminal-dots">
                    <div class="terminal-dot red"></div>
                    <div class="terminal-dot yellow"></div>
                    <div class="terminal-dot green"></div>
                  </div>
                  <span class="terminal-tab-name">execution.console</span>
                </div>
                <div class="terminal-console">
                  <div class="terminal-line command">$ ./temp_exec.exe</div>
                  ${data.stdout ? `<div class="terminal-line output">${escapeHtml(data.stdout)}</div>` : ''}
                  ${data.stderr && data.compiled ? `<div class="terminal-line err-output">${escapeHtml(data.stderr)}</div>` : ''}
                  <div class="terminal-line meta">
                    -- Process terminated. Duration: ${data.timeout ? '2002ms (Killed)' : 'under 20ms'} --
                  </div>
                </div>
              </div>
            </div>
          </details>
        </div>

        <div class="explanation-section">
          ${formattedExplanation}
        </div>
      `;
    }

    html += `</div>`;
    bubble.innerHTML = html;
    chatHistory.appendChild(bubble);
    
    // Add copy listener
    if (data.hasCode) {
      const copyBtn = bubble.querySelector('.copy-code-btn');
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(data.cppCode).then(() => {
          copyBtn.innerHTML = '<i data-lucide="check" style="color:var(--bg-darker)"></i>';
          lucide.createIcons();
          setTimeout(() => {
            copyBtn.innerHTML = '<i data-lucide="copy"></i>';
            lucide.createIcons();
          }, 1500);
        });
      });
    }

    lucide.createIcons();
    scrollToBottom();
  }

  // --- Utilities ---
  function scrollToBottom() {
    chatHistory.scrollTop = chatHistory.scrollHeight;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatMarkdownText(text) {
    if (!text) return '';
    let formatted = escapeHtml(text);
    
    // Paragraphs
    formatted = formatted.replace(/\n\n/g, '</p><p>');
    formatted = formatted.replace(/\n/g, '<br>');
    
    // Bold: **text**
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    
    // Inline code: `code`
    formatted = formatted.replace(/`(.*?)`/g, '<code>$1</code>');
    
    return `<p>${formatted}</p>`;
  }

  // --- Loading State Handler ---
  function setOrchestratorState(visible, mainText = '', subText = '') {
    if (visible) {
      orchestratorStatus.classList.remove('hidden');
      statusMainText.textContent = mainText;
      statusSubText.textContent = subText;
      submitBtn.disabled = true;
    } else {
      orchestratorStatus.classList.add('hidden');
      submitBtn.disabled = false;
    }
  }

  // --- Event Listeners ---

  // Handle Provider Select Change
  providerSelect.addEventListener('change', () => {
    updateModelOptions();
    loadApiKey();
  });

  // Handle API Key input changes
  apiKeyInput.addEventListener('input', () => {
    saveApiKey();
  });

  // Clear chat
  clearChatBtn.addEventListener('click', () => {
    chatHistory.innerHTML = '';
    // Re-append welcome bubble
    const welcomeBubble = document.querySelector('.welcome-bubble');
    if (!welcomeBubble) {
      // Re-create welcome bubble if missing
      window.location.reload();
    }
  });

  // Demo buttons autofill
  document.querySelectorAll('.demo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      chatInput.value = btn.getAttribute('data-query');
      // Trigger auto-expand
      chatInput.dispatchEvent(new Event('input'));
      chatForm.dispatchEvent(new Event('submit'));
    });
  });

  // Handle Form Submission
  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const query = chatInput.value.trim();
    if (!query) return;

    // Append user message
    appendUserBubble(query);
    chatInput.value = '';
    chatInput.style.height = 'auto'; // Reset textarea height

    // Retrieve state configs
    const provider = providerSelect.value;
    const model = modelSelect.value;
    const apiKey = apiKeyInput.value.trim();

    // Check if key is available
    if (!apiKey) {
      // Show warning/error in chat
      const errorBubble = document.createElement('div');
      errorBubble.className = 'chat-bubble assistant-bubble glass-panel';
      errorBubble.style.borderColor = 'var(--color-error)';
      errorBubble.innerHTML = `
        <div class="bubble-header" style="color:var(--color-error)">
          <div class="avatar" style="border-color:var(--color-error)"><i data-lucide="alert-triangle"></i></div>
          <div class="sender-info">
            <span class="sender-name">System Error</span>
            <span class="timestamp">Critical</span>
          </div>
        </div>
        <div class="bubble-content">
          <p><strong>API Key Missing:</strong> You must configure an API Key for ${providerSelect.options[providerSelect.selectedIndex].text} in the sidebar configuration panel before issuing computational requests.</p>
        </div>
      `;
      chatHistory.appendChild(errorBubble);
      lucide.createIcons();
      scrollToBottom();
      return;
    }

    // Set Orchestration Loop State
    setOrchestratorState(true, 'Thinking...', 'Orchestrating instructions with LLM model...');

    // Simulate multi-stage statuses to wow the user (micro-animations)
    const statusSequence = [
      { main: 'LLM Formulating...', sub: 'Prepend instructions & querying initial completion...' },
      { delay: 1800, main: 'Extracting C++ Code...', sub: 'LLM responded. Isolating code blocks...' },
      { delay: 3000, main: 'Compiling Script...', sub: 'Spawning MSYS2 compiler in isolated execution space...' },
      { delay: 4200, main: 'Executing Sandbox...', sub: 'Running C++ executable with 2000ms hard ceiling...' },
      { delay: 5400, main: 'Analyzing Output...', sub: 'Injecting output results to LLM for final response...' }
    ];

    const timeouts = [];
    statusSequence.forEach(step => {
      if (step.delay) {
        const timeout = setTimeout(() => {
          statusMainText.textContent = step.main;
          statusSubText.textContent = step.sub;
        }, step.delay);
        timeouts.push(timeout);
      }
    });

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: query,
          provider: provider,
          model: model,
          apiKey: apiKey
        })
      });

      // Clear the fake timeouts since response received
      timeouts.forEach(t => clearTimeout(t));

      if (response.ok) {
        const data = await response.json();
        setOrchestratorState(false);
        appendAssistantBubble(data);
      } else {
        const data = await response.json();
        throw new Error(data.error || 'Server error ' + response.status);
      }
    } catch (err) {
      timeouts.forEach(t => clearTimeout(t));
      setOrchestratorState(false);
      
      // Render Server Error bubble
      const errBubble = document.createElement('div');
      errBubble.className = 'chat-bubble assistant-bubble glass-panel';
      errBubble.style.borderColor = 'var(--color-error)';
      errBubble.innerHTML = `
        <div class="bubble-header" style="color:var(--color-error)">
          <div class="avatar" style="border-color:var(--color-error)"><i data-lucide="shield-alert"></i></div>
          <div class="sender-info">
            <span class="sender-name">System Loop Error</span>
            <span class="timestamp">Error</span>
          </div>
        </div>
        <div class="bubble-content">
          <p>An orchestration exception occurred:</p>
          <pre class="terminal-panel" style="color:var(--color-error); padding: 12px; margin-top:8px;"><code>${escapeHtml(err.message)}</code></pre>
        </div>
      `;
      chatHistory.appendChild(errBubble);
      lucide.createIcons();
      scrollToBottom();
    }
  });

  // --- Initial Setup Execution ---
  updateModelOptions();
  loadApiKey();
  runDiagnostics();
});

/**
 * server.js
 * 
 * Main backend server for the Agentic C++ Code Interpreter Chatbot.
 * Implements the core loop:
 * 1. Prompt Injection.
 * 2. Model API call.
 * 3. Regex C++ code extraction.
 * 4. Local compilation with g++.
 * 5. Execution with a strict 2000ms timeout limit.
 * 6. Capture of stdout/stderr.
 * 7. Evaluation/explanation LLM call.
 * 8. Temp files cleanup.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { exec, execFile } = require('child_process');
const util = require('util');

const execPromise = util.promisify(exec);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// System instructions to force LLM to produce C++ code for computation
const SYSTEM_PROMPT = `Role: You are an advanced Agentic Execution Assistant. You do not just estimate or predict answers to mathematical, algorithmic, or data-heavy queries. Instead, you write, execute, and verify code to arrive at a deterministic solution.

Capabilities: You are connected to an isolated backend execution environment. You can write scripts, which the system will automatically compile and run. The standard output (stdout) and standard error (stderr) will be fed back to you.

Workflow: When presented with a computational problem, you must adhere to the following sequence:

Reasoning: Briefly explain the algorithm or mathematical formula you will use.

Implementation: Write a highly optimized, completely standalone script to solve it. Prioritize C++ for raw computational speed or Python for statistical analysis.

Output Restraint: The script must print only the final required answer to stdout. Do not include conversational text in the code output.

Strict Formatting: You must encapsulate your code precisely within markdown blocks (e.g., \`\`\`cpp ... \`\`\`). Do not output multiple code blocks in a single turn.

Constraint: Do NOT attempt to calculate large numbers, simulate loops, or guess complex Big-O runtimes in your head. You must delegate all heavy computation to your execution tool.`;

/**
 * Parses out C++ code block between ```cpp and ``` tags.
 */
function extractCppCode(text) {
  const regex = /```(?:cpp|c\+\+)\s*([\s\S]*?)```/i;
  const match = text.match(regex);
  if (match && match[1]) {
    return match[1].trim();
  }
  
  // Fallback to a generic code block if it contains standard C++ signatures
  const genericRegex = /```\s*([\s\S]*?)```/;
  const genericMatch = text.match(genericRegex);
  if (genericMatch && genericMatch[1]) {
    const code = genericMatch[1].trim();
    if (code.includes('#include') || code.includes('main(') || code.includes('std::')) {
      return code;
    }
  }
  return null;
}

/**
 * Generic caller for Gemini, OpenAI, and Anthropic APIs using native Node fetch.
 */
async function callLLM(provider, apiKey, model, prompt, systemInstruction) {
  if (provider === 'gemini') {
    const defaultModel = model || 'gemini-flash-latest';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${defaultModel}:generateContent?key=${apiKey}`;
    
    const payload = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    };
    
    if (systemInstruction) {
      payload.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content) {
      throw new Error('Gemini API returned an empty response.');
    }
    return data.candidates[0].content.parts[0].text;
  }

  if (provider === 'openai') {
    const defaultModel = model || 'gpt-4o-mini';
    const url = 'https://api.openai.com/v1/chat/completions';
    
    const messages = [];
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }
    messages.push({ role: 'user', content: prompt });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: defaultModel,
        messages: messages,
        temperature: 0.2
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  }

  if (provider === 'anthropic') {
    const defaultModel = model || 'claude-3-5-sonnet-latest';
    const url = 'https://api.anthropic.com/v1/messages';

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: defaultModel,
        max_tokens: 4000,
        temperature: 0.2,
        ...(systemInstruction ? { system: systemInstruction } : {}),
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return data.content[0].text;
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

/**
 * Handles compiling and running C++ code safely with timeout.
 */
async function compileAndExecuteCpp(cppCode) {
  const timestamp = Date.now() + '_' + Math.floor(Math.random() * 1000);
  const cppFile = path.join(tempDir, `exec_${timestamp}.cpp`);
  const exeFile = path.join(tempDir, `exec_${timestamp}.exe`);
  
  // Helper for cleaning files with delay on Windows to bypass locked file handles
  const cleanup = () => {
    setTimeout(() => {
      if (fs.existsSync(cppFile)) {
        try { fs.unlinkSync(cppFile); } catch (e) { console.error('Unlink cpp error:', e); }
      }
      if (fs.existsSync(exeFile)) {
        try { fs.unlinkSync(exeFile); } catch (e) { console.error('Unlink exe error:', e); }
      }
    }, 200);
  };

  try {
    fs.writeFileSync(cppFile, cppCode);
    
    // 1. Compile C++ Code
    try {
      await execPromise(`g++ "${cppFile}" -o "${exeFile}"`);
    } catch (compileError) {
      cleanup();
      return {
        compiled: false,
        stdout: '',
        stderr: compileError.stderr || compileError.message,
        timeout: false
      };
    }
    
    // 2. Run Binary with 2000ms Timeout
    return new Promise((resolve) => {
      execFile(exeFile, [], { timeout: 2000 }, (runError, stdout, stderr) => {
        const isTimeout = runError && (runError.killed || runError.signal === 'SIGTERM');
        
        const result = {
          compiled: true,
          stdout: stdout || '',
          stderr: isTimeout 
            ? 'Execution timed out: Process exceeded the 2000ms limit and was terminated.' 
            : (stderr || (runError ? runError.message : '')),
          timeout: !!isTimeout
        };
        
        cleanup();
        resolve(result);
      });
    });
  } catch (err) {
    cleanup();
    return {
      compiled: false,
      stdout: '',
      stderr: `Internal Orchestrator Error: ${err.message}`,
      timeout: false
    };
  }
}

// REST Routes

// API to check server status and list models
app.get('/api/config', (req, res) => {
  exec('g++ --version', (error) => {
    res.json({
      status: 'online',
      compilerAvailable: !error,
      providers: {
        gemini: {
          name: 'Google Gemini',
          defaultModel: 'gemini-flash-latest',
          models: ['gemini-flash-latest', 'gemini-3.5-pro', 'gemini-2.5-flash']
        },
        openai: {
          name: 'OpenAI GPT',
          defaultModel: 'gpt-4o-mini',
          models: ['gpt-4o-mini', 'gpt-4o', 'o1-mini']
        },
        anthropic: {
          name: 'Anthropic Claude',
          defaultModel: 'claude-3-5-sonnet-latest',
          models: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest', 'claude-3-opus-20240229']
        }
      }
    });
  });
});

// The core Orchestration API
app.post('/api/chat', async (req, res) => {
  const { message, provider, model, apiKey: clientApiKey } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: 'Message field is required.' });
  }
  
  const selectedProvider = provider || 'gemini';
  
  // Resolve API Key
  const apiKey = clientApiKey || 
                 (selectedProvider === 'gemini' ? process.env.GEMINI_API_KEY : null) ||
                 (selectedProvider === 'openai' ? process.env.OPENAI_API_KEY : null) ||
                 (selectedProvider === 'anthropic' ? process.env.ANTHROPIC_API_KEY : null);
                 
  if (!apiKey) {
    return res.status(400).json({ 
      error: `API Key for provider '${selectedProvider}' is not configured. Please supply it in the client interface or set it in the backend .env file.` 
    });
  }

  try {
    // Stage 1: Inject system instructions and call the LLM
    const initialPrompt = `${SYSTEM_PROMPT}\n\nUser Query: ${message}`;
    
    // We prepend the SYSTEM_PROMPT to ensure models obey, but we also pass it in systemInstruction if supported
    const initialLlmResponse = await callLLM(selectedProvider, apiKey, model, initialPrompt, SYSTEM_PROMPT);
    
    // Stage 2: Extract C++ code
    const cppCode = extractCppCode(initialLlmResponse);
    
    if (!cppCode) {
      // If the LLM did not generate C++ code, we return the response directly as a standard chat response
      return res.json({
        hasCode: false,
        initialLlmResponse,
        cppCode: null,
        compiled: false,
        stdout: '',
        stderr: '',
        timeout: false,
        finalExplanation: initialLlmResponse // Use initial response directly
      });
    }
    
    // Stage 3: Compile and execute the extracted C++ code
    const executionResult = await compileAndExecuteCpp(cppCode);
    
    // Stage 4: Formulate the second, hidden follow-up prompt
    let secondPrompt = '';
    if (!executionResult.compiled) {
      secondPrompt = `You generated a C++ code block to solve the query: "${message}".
However, the code failed to compile. The compiler output was:
---
${executionResult.stderr}
---
Please explain this compilation error to the user, tell them why it happened, and suggest how to fix it. Keep your response helpful and concise.`;
    } else if (executionResult.timeout) {
      secondPrompt = `You generated a C++ code block to solve the query: "${message}".
However, the execution timed out (exceeded the 2000ms hard limit). 
The output before termination was:
---
Stdout: ${executionResult.stdout}
Stderr: ${executionResult.stderr}
---
Please explain this timeout to the user. Note that the program might contain an infinite loop, recursive stack overflow, or heavy compute block. Suggest ways to optimize the algorithm to run within the limit.`;
    } else {
      secondPrompt = `You generated a C++ code block to solve the query: "${message}".
The code executed successfully.
The output written to stdout was:
---
${executionResult.stdout}
---
Explain this result clearly to the user. Connect the terminal output to the user's original query.`;
    }
    
    // Stage 5: Request explanation from LLM
    const finalExplanation = await callLLM(selectedProvider, apiKey, model, secondPrompt, SYSTEM_PROMPT);
    
    // Send full trace payload
    res.json({
      hasCode: true,
      initialLlmResponse,
      cppCode,
      compiled: executionResult.compiled,
      stdout: executionResult.stdout,
      stderr: executionResult.stderr,
      timeout: executionResult.timeout,
      finalExplanation
    });
    
  } catch (error) {
    console.error('Orchestration Loop Error:', error);
    res.status(500).json({ error: error.message || 'An error occurred during backend orchestration.' });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`[Server] Agentic interpreter backend listening on http://localhost:${PORT}`);
});

# Agentic C++ Execution Sandbox & Interpreter

An autonomous Node.js orchestration engine that integrates with the Gemini API to dynamically generate, compile, and execute C++ algorithms in a secure local environment. 

This project bridges the gap between high-level LLM reasoning and low-level deterministic execution, designed specifically to evaluate complex mathematical models and algorithmic queries safely.

## 🚀 System Architecture

* **LLM Orchestrator:** Intercepts user queries and injects strict structural prompts to enforce valid C++ generation.
* **Compiler Integration:** Utilizes the MSYS2 `g++` toolchain to compile generated scripts into native Windows executables asynchronously.
* **Isolated Sandbox:** Wraps the execution binary in a Node.js child process with a hard **2000ms timeout boundary** to forcefully terminate runaway memory allocations or infinite loops.
* **Agentic Self-Correction:** Intercepts raw `stderr` compilation diagnostics and runtime exit signals, piping them back into the LLM context for zero-human-intervention debugging.

## 🛠️ Tech Stack
* **Backend:** Node.js, Express.js, Child Processes (IPC)
* **Execution Environment:** C++17, MSYS2 `g++`
* **AI Integration:** Google Gemini API (`gemini-flash-latest`)
* **Frontend:** HTML5, CSS3 (Glassmorphism), Vanilla JS


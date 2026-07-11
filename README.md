# Agentic C++ Execution Sandbox & Interpreter

An autonomous Node.js orchestration engine that integrates with the Gemini API to dynamically generate, compile, and execute C++ algorithms in a secure local environment. 

This project bridges the gap between high-level LLM reasoning and low-level deterministic execution, designed specifically to evaluate complex mathematical models and algorithmic queries safely.

## 🧠 The Core Problem It Solves

Large Language Models (LLMs) are notorious for failing at precise numeric tasks, high-frequency algorithms, and complex mathematical modeling because they predict the *next most likely word*, rather than computing the actual mathematical truth. 

The standard industry solution is to prompt the LLM to write code to solve the problem. However, executing AI-generated code on the fly introduces massive system risks:
* **Security & System Safety:** An LLM might accidentally generate an infinite loop that freezes the host CPU or consumes all system memory.
* **Execution Complexity:** Unlike interpreted languages like Python, C++ requires a structural compilation phase (`.cpp` $\rightarrow$ binary executable) before it can run.

This architecture solves both issues by introducing an autonomous compilation pipeline wrapped inside a guarded runtime sandbox.

---

## 🔄 System Architecture & Data Flow

When a user submits a prompt, the system executes a tightly controlled 5-stage lifecycle loop:

```text
[ User Input ] ──> [ LLM Orchestrator ] ──> [ Asynchronous Compiler ]
                                                   │
  ┌────────────────────────────────────────────────┘
  ▼
[ Child Process Sandbox ] ───( If Error / Timeout )───> [ Self-Correction Engine ]
  │                                                              │
  ├─( If Success )──> [ Terminal UI Display ]                    ▼
  └─────────────────> [ Post-Execution Cleanup ] <───────────────┘

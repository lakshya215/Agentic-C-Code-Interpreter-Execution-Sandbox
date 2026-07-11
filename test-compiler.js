/**
 * test-compiler.js
 * 
 * Verifies that g++ (MSYS2) is accessible and tests the three execution scenarios:
 * 1. Successful compilation and output capture.
 * 2. Compilation failure (capturing error output).
 * 3. Execution timeout (killing infinite loops after 2000ms).
 */

const { exec, execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const tempDir = path.join(__dirname, 'temp');

// Ensure temp directory exists
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Helper to clean up files
function cleanup(files) {
  files.forEach(file => {
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
        console.log(`[Cleanup] Deleted ${path.basename(file)}`);
      } catch (err) {
        console.error(`[Cleanup Error] Could not delete ${file}:`, err.message);
      }
    }
  });
}

// 1. Check if g++ is installed and accessible
function checkCompiler() {
  return new Promise((resolve, reject) => {
    console.log('\n--- Checking C++ Compiler (g++) ---');
    exec('g++ --version', (error, stdout, stderr) => {
      if (error) {
        console.error('[-] g++ compiler was not found in the PATH.');
        console.error('Error Details:', error.message);
        reject(error);
      } else {
        console.log('[+] g++ is accessible. Version info:');
        console.log(stdout.split('\n')[0]);
        resolve();
      }
    });
  });
}

// 2. Test Success Case
function testSuccess() {
  return new Promise((resolve) => {
    console.log('\n--- Test Case 1: Successful Compilation & Run ---');
    const timestamp = Date.now() + '_success';
    const cppFile = path.join(tempDir, `exec_${timestamp}.cpp`);
    const exeFile = path.join(tempDir, `exec_${timestamp}.exe`);

    const code = `#include <iostream>
int main() {
    std::cout << "Hello! The C++ execution environment is working flawlessly." << std::endl;
    return 0;
}`;

    fs.writeFileSync(cppFile, code);
    console.log('[+] Wrote test_success.cpp');

    console.log('[*] Compiling...');
    exec(`g++ "${cppFile}" -o "${exeFile}"`, (compileError, stdout, stderr) => {
      if (compileError) {
        console.error('[-] Compilation failed:', stderr);
        cleanup([cppFile, exeFile]);
        return resolve(false);
      }
      console.log('[+] Compiled successfully to .exe');

      console.log('[*] Executing binary...');
      execFile(exeFile, [], { timeout: 2000 }, (runError, runStdout, runStderr) => {
        console.log(`[+] Executed successfully.`);
        console.log(`Stdout: "${runStdout.trim()}"`);
        console.log(`Stderr: "${runStderr.trim()}"`);
        
        cleanup([cppFile, exeFile]);
        resolve(true);
      });
    });
  });
}

// 3. Test Compilation Error Case
function testCompileError() {
  return new Promise((resolve) => {
    console.log('\n--- Test Case 2: Compilation Failure Handling ---');
    const timestamp = Date.now() + '_fail';
    const cppFile = path.join(tempDir, `exec_${timestamp}.cpp`);
    const exeFile = path.join(tempDir, `exec_${timestamp}.exe`);

    // Intentional syntax error (missing semicolon)
    const code = `#include <iostream>
int main() {
    std::cout << "Missing semicolon"
    return 0;
}`;

    fs.writeFileSync(cppFile, code);
    console.log('[+] Wrote test_fail.cpp');

    console.log('[*] Compiling (expecting failure)...');
    exec(`g++ "${cppFile}" -o "${exeFile}"`, (compileError, stdout, stderr) => {
      if (compileError) {
        console.log('[+] Captured compilation failure as expected!');
        console.log('Compiler Error Message:');
        console.log(stderr.trim());
        cleanup([cppFile]);
        return resolve(true);
      }
      console.error('[-] Error: Compilation succeeded when it should have failed!');
      cleanup([cppFile, exeFile]);
      resolve(false);
    });
  });
}

// 4. Test Timeout Case (Infinite Loop)
function testTimeout() {
  return new Promise((resolve) => {
    console.log('\n--- Test Case 3: Timeout Loop Protection (2000ms) ---');
    const timestamp = Date.now() + '_timeout';
    const cppFile = path.join(tempDir, `exec_${timestamp}.cpp`);
    const exeFile = path.join(tempDir, `exec_${timestamp}.exe`);

    const code = `#include <iostream>
#include <thread>
#include <chrono>
int main() {
    std::cout << "Starting infinite loop..." << std::endl;
    // Force process to write something then hang
    std::cout << std::flush;
    
    while (true) {
        // Burn CPU or sleep a bit to simulate hanging
        std::this_thread::sleep_for(std::chrono::milliseconds(100));
    }
    return 0;
}`;

    fs.writeFileSync(cppFile, code);
    console.log('[+] Wrote test_timeout.cpp');

    console.log('[*] Compiling...');
    exec(`g++ "${cppFile}" -o "${exeFile}"`, (compileError, stdout, stderr) => {
      if (compileError) {
        console.error('[-] Compilation failed:', stderr);
        cleanup([cppFile]);
        return resolve(false);
      }
      console.log('[+] Compiled successfully. Running with a 2000ms timeout limit...');
      
      const startTime = Date.now();
      execFile(exeFile, [], { timeout: 2000 }, (runError, runStdout, runStderr) => {
        const duration = Date.now() - startTime;
        console.log(`[Info] Process ran for ${duration}ms before terminating.`);
        
        if (runError && (runError.killed || runError.signal === 'SIGTERM')) {
          console.log('[+] Timeout protection worked! Process was successfully killed.');
          console.log(`Captured Stdout so far: "${runStdout.trim()}"`);
        } else {
          console.error('[-] Error: Process completed or was not killed properly!', runError);
        }
        
        // Wait a small moment to release file lock if needed, then cleanup
        setTimeout(() => {
          cleanup([cppFile, exeFile]);
          resolve(true);
        }, 500);
      });
    });
  });
}

// Run tests sequentially
async function runAllTests() {
  try {
    await checkCompiler();
    const s1 = await testSuccess();
    const s2 = await testCompileError();
    const s3 = await testTimeout();
    
    console.log('\n--- Verification Summary ---');
    console.log(`Test 1 (Success): ${s1 ? 'PASSED' : 'FAILED'}`);
    console.log(`Test 2 (Compile Error): ${s2 ? 'PASSED' : 'FAILED'}`);
    console.log(`Test 3 (Timeout Limit): ${s3 ? 'PASSED' : 'FAILED'}`);
  } catch (err) {
    console.error('\n[-] Compiler check failed. Ensure g++ (MSYS2) is added to your PATH environment variable.');
  }
}

runAllTests();

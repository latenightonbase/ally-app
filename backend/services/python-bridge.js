const { execFile } = require('child_process');
const path = require('path');

const PYTHON = process.env.PYTHON_PATH || 'python3';
const AI_DIR = process.env.AI_SCRIPTS_DIR || path.join(__dirname, '..', '..', 'ai');

/**
 * Run a Python AI script, passing JSON via stdin and reading JSON from stdout.
 */
function runScript(scriptName, inputData) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(AI_DIR, scriptName);
    const child = execFile(PYTHON, [scriptPath], { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${scriptName} failed: ${stderr || error.message}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`${scriptName} returned invalid JSON: ${stdout.slice(0, 500)}`));
      }
    });

    child.stdin.write(JSON.stringify(inputData));
    child.stdin.end();
  });
}

async function runBriefing(userId, memoryProfile) {
  return runScript('briefing.py', { userId, memory: memoryProfile });
}

async function runMemoryExtraction(userId, conversations) {
  return runScript('memory_extraction.py', { userId, conversations });
}

async function runFollowupDetection(userId, conversations) {
  return runScript('followup_detector.py', { userId, conversations });
}

async function runOnboarding(userId, answers) {
  return runScript('onboarding.py', { userId, answers });
}

module.exports = {
  runBriefing,
  runMemoryExtraction,
  runFollowupDetection,
  runOnboarding,
};

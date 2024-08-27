import * as path from "path";
import * as fs from "fs";

const HEAP_SNAPSHOT_DIR = "failing-test-heapsnapshots";

export function generateSnapshotOnFailure(assertion: () => void) {
  try {
    assertion();
  } catch (err) {
    const currentTestState = expect.getState();
    const isFromVsCodeJest = process.env.VS_CODE_JEST;
    const isFailing = currentTestState.numPassingAsserts !== currentTestState.assertionCalls;
    if (isFailing && !isFromVsCodeJest) {
      writeHeapSnapshot(currentTestState.currentTestName);
    }
    throw err;
  }
}

export function writeHeapSnapshot(testName?: string) {
  const fileName = `${new Date().toLocaleString()} - ${truncateStringFromStart(
    testName,
    30
  )}.heapsnapshot`;
  const pathName = path.join(HEAP_SNAPSHOT_DIR, sanitizePathName(fileName));
  createDirectoryIfNotExists(HEAP_SNAPSHOT_DIR);
  require("v8").writeHeapSnapshot(pathName);
}

function createDirectoryIfNotExists(dirPath: string) {
  const resolvedPath = path.resolve(dirPath);
  if (!fs.existsSync(resolvedPath)) {
    fs.mkdirSync(resolvedPath, { recursive: true });
  }
}

function sanitizePathName(input: string) {
  // Define a regular expression to match invalid characters
  const illegalRe = /[<>:"\/\\|?*\x00-\x1F]/g; // Invalid characters for Windows
  const reservedRe = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i; // Reserved filenames in Windows
  const trailingRe = /[. ]+$/; // Trailing spaces and dots

  // Replace invalid characters with an underscore
  let sanitized = input.replace(illegalRe, "_");

  // If the result is a reserved filename, prepend an underscore
  if (reservedRe.test(sanitized)) {
    sanitized = "_" + sanitized;
  }

  // Remove trailing spaces and dots
  sanitized = sanitized.replace(trailingRe, "");

  // Ensure the path is safe for all systems
  sanitized = path.basename(sanitized);

  return sanitized;
}

function truncateStringFromStart(str: string | undefined, x: number) {
  if (!str) {
    return "";
  }
  if (str.length <= x) {
    return str;
  }
  return "..." + str.slice(-x);
}

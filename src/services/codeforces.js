import { logger } from '../utils/logger.js';

/**
 * Generic HTTP fetch helper with automatic exponential backoff retries.
 */
async function fetchWithRetry(url, retries = 4, delay = 1500) {
  for (let i = 0; i < retries; i++) {
    try {
      logger.debug(`Fetching: ${url} (Attempt ${i + 1}/${retries})`);
      const response = await fetch(url, {
        headers: { 'User-Agent': 'CF-Contest-Sync-Agent/1.0.0' },
        signal: AbortSignal.timeout(10000)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.status !== 'OK') {
        throw new Error(`CF API returned non-OK status: ${data.comment || 'Unknown Error'}`);
      }

      return data.result;
    } catch (error) {
      const isLast = i === retries - 1;
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      if (isLast) {
        logger.error(`Codeforces API request failed on final attempt: ${url}. Error: ${errorMsg}`);
        throw error;
      }
      
      const backoff = delay * Math.pow(2, i) * (0.8 + Math.random() * 0.4);
      logger.warn(`CF API request failed. Retrying in ${Math.round(backoff)}ms... Error: ${errorMsg}`);
      await new Promise(resolve => setTimeout(resolve, backoff));
    }
  }
  throw new Error('Unreachable code in fetchWithRetry');
}

let mockContestsFn = null;
let mockUserSubmissionsFn = null;
let mockUserRatingChangesFn = null;

export function setMockContests(fn) {
  mockContestsFn = fn;
}

export function setMockUserSubmissions(fn) {
  mockUserSubmissionsFn = fn;
}

export function setMockUserRatingChanges(fn) {
  mockUserRatingChangesFn = fn;
}

/**
 * Fetches all Codeforces contests.
 */
export async function fetchContests() {
  if (mockContestsFn) return mockContestsFn();
  const url = 'https://codeforces.com/api/contest.list?gym=false';
  try {
    return await fetchWithRetry(url);
  } catch (error) {
    logger.error('Failed to fetch contests from Codeforces:', error);
    throw error;
  }
}

/**
 * Fetches submissions for a given user handle.
 */
export async function fetchUserSubmissions(handle) {
  if (mockUserSubmissionsFn) return mockUserSubmissionsFn(handle);
  if (!handle) {
    logger.warn('No CF_HANDLE configured; skipping submissions query.');
    return [];
  }
  
  const url = `https://codeforces.com/api/user.status?handle=${encodeURIComponent(handle)}`;
  try {
    return await fetchWithRetry(url);
  } catch (error) {
    logger.error(`Failed to fetch submissions for user ${handle}:`, error);
    throw error;
  }
}

/**
 * Fetches rating changes for a given user handle.
 */
export async function fetchUserRatingChanges(handle) {
  if (mockUserRatingChangesFn) return mockUserRatingChangesFn(handle);
  if (!handle) {
    logger.warn('No CF_HANDLE configured; skipping rating history query.');
    return [];
  }
  
  const url = `https://codeforces.com/api/user.rating?handle=${encodeURIComponent(handle)}`;
  try {
    return await fetchWithRetry(url);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '';
    if (errorMsg.includes('Rating history not found') || errorMsg.includes('400')) {
      logger.info(`No rating history found for handle ${handle}.`);
      return [];
    }
    logger.error(`Failed to fetch rating history for user ${handle}:`, error);
    throw error;
  }
}

export function computeContestParticipation(
  submissions,
  contestId,
  startTimeSeconds,
  endTimeSeconds
) {
  const contestSubmissions = submissions
    .filter(sub => {
      const subContestId = sub.contestId || sub.problem.contestId;
      return subContestId === contestId;
    })
    .sort((a, b) => a.creationTimeSeconds - b.creationTimeSeconds);

  if (contestSubmissions.length === 0) {
    return { solvedCount: 0, wrongCount: 0, solvedList: [], unsolvedList: [], hasActivity: false };
  }

  const solvedProblems = new Set();
  const attemptedProblems = new Set();
  let wrongCount = 0;

  for (const sub of contestSubmissions) {
    const problemIndex = sub.problem.index;
    attemptedProblems.add(problemIndex);

    if (solvedProblems.has(problemIndex)) {
      continue;
    }

    if (sub.verdict === 'OK') {
      solvedProblems.add(problemIndex);
    } else if (
      sub.verdict && 
      !['COMPILATION_ERROR', 'TESTING', 'SECURITY_VIOLATED'].includes(sub.verdict)
    ) {
      wrongCount++;
    }
  }

  // Calculate attempted but unsolved problems
  const unsolvedList = [];
  for (const prob of attemptedProblems) {
    if (!solvedProblems.has(prob)) {
      unsolvedList.push(prob);
    }
  }

  return {
    solvedCount: solvedProblems.size,
    wrongCount: wrongCount,
    solvedList: Array.from(solvedProblems).sort(),
    unsolvedList: unsolvedList.sort(),
    hasActivity: true
  };
}

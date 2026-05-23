import { describe, it, expect } from 'vitest';
import { computeContestParticipation } from '../src/services/codeforces.js';
import { formatTaskNotes } from '../src/services/googleTasks.js';

describe('Codeforces Statistics Calculator', () => {
  it('should accurately calculate solved problems and wrong submissions during contest window', () => {
    const contestId = 999;
    const startTime = 100000;
    const endTime = 107200;

    const mockSubmissions = [
      {
        id: 101,
        contestId: contestId,
        creationTimeSeconds: startTime + 100,
        relativeTimeSeconds: 100,
        problem: { index: 'A', name: 'Problem A', type: 'PROGRAMMING' },
        author: { members: [{ handle: 'test' }], participantType: 'CONTESTANT' },
        programmingLanguage: 'C++',
        verdict: 'WRONG_ANSWER'
      },
      {
        id: 102,
        contestId: contestId,
        creationTimeSeconds: startTime + 200,
        relativeTimeSeconds: 200,
        problem: { index: 'A', name: 'Problem A', type: 'PROGRAMMING' },
        author: { members: [{ handle: 'test' }], participantType: 'CONTESTANT' },
        programmingLanguage: 'C++',
        verdict: 'OK'
      },
      {
        id: 103,
        contestId: contestId,
        creationTimeSeconds: startTime + 300,
        relativeTimeSeconds: 300,
        problem: { index: 'A', name: 'Problem A', type: 'PROGRAMMING' },
        author: { members: [{ handle: 'test' }], participantType: 'CONTESTANT' },
        programmingLanguage: 'C++',
        verdict: 'WRONG_ANSWER'
      },
      {
        id: 104,
        contestId: contestId,
        creationTimeSeconds: startTime + 400,
        relativeTimeSeconds: 400,
        problem: { index: 'B', name: 'Problem B', type: 'PROGRAMMING' },
        author: { members: [{ handle: 'test' }], participantType: 'CONTESTANT' },
        programmingLanguage: 'C++',
        verdict: 'COMPILATION_ERROR'
      },
      {
        id: 105,
        contestId: contestId,
        creationTimeSeconds: startTime + 500,
        relativeTimeSeconds: 500,
        problem: { index: 'B', name: 'Problem B', type: 'PROGRAMMING' },
        author: { members: [{ handle: 'test' }], participantType: 'CONTESTANT' },
        programmingLanguage: 'C++',
        verdict: 'OK'
      },
      {
        id: 106,
        contestId: contestId,
        creationTimeSeconds: startTime + 600,
        relativeTimeSeconds: 600,
        problem: { index: 'C', name: 'Problem C', type: 'PROGRAMMING' },
        author: { members: [{ handle: 'test' }], participantType: 'CONTESTANT' },
        programmingLanguage: 'C++',
        verdict: 'TIME_LIMIT_EXCEEDED'
      },
      {
        id: 107,
        contestId: contestId,
        creationTimeSeconds: endTime + 1000,
        relativeTimeSeconds: 8200,
        problem: { index: 'D', name: 'Problem D', type: 'PROGRAMMING' },
        author: { members: [{ handle: 'test' }], participantType: 'PRACTICE' },
        programmingLanguage: 'C++',
        verdict: 'OK'
      }
    ];

    const result = computeContestParticipation(mockSubmissions, contestId, startTime, endTime);

    expect(result.hasActivity).toBe(true);
    expect(result.solvedCount).toBe(3); // A, B, and practice D
    expect(result.wrongCount).toBe(2);
  });

  it('should return zero stats if there are no submissions during contest', () => {
    const result = computeContestParticipation([], 123, 100000, 110000);
    expect(result.hasActivity).toBe(false);
    expect(result.solvedCount).toBe(0);
    expect(result.wrongCount).toBe(0);
  });
});

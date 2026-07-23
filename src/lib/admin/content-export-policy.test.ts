import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canExportApprovedContent,
  contentExportBlockReason,
} from './content-export-policy';

test('content export requires an approved record and a clean current policy check', () => {
  assert.equal(
    canExportApprovedContent({ approvalStatus: 'approved', bannedPhraseViolations: [] }),
    true,
  );
  assert.equal(
    canExportApprovedContent({ approvalStatus: 'pending', bannedPhraseViolations: [] }),
    false,
  );
  assert.equal(
    canExportApprovedContent({ approvalStatus: 'rejected', bannedPhraseViolations: [] }),
    false,
  );
  assert.equal(
    canExportApprovedContent({
      approvalStatus: 'approved',
      bannedPhraseViolations: ['guaranteed'],
    }),
    false,
  );
});

test('content export explains the strongest blocking condition', () => {
  assert.equal(
    contentExportBlockReason({
      approvalStatus: 'approved',
      bannedPhraseViolations: ['guaranteed'],
    }),
    'Needs revision',
  );
  assert.equal(
    contentExportBlockReason({ approvalStatus: 'pending', bannedPhraseViolations: [] }),
    'Awaiting approval',
  );
  assert.equal(
    contentExportBlockReason({ approvalStatus: 'rejected', bannedPhraseViolations: [] }),
    'Rejected',
  );
});

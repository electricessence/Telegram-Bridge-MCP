# [Unreleased]

## Added

- Added debug log lines in `cascade()` (pruned entry, promoting entry, stack-empty delete) and `updateDisplay()` (new-message send path) to make cascade events visible in stderr output

## Fixed

- Verified and regression-tested cascade-after-text-promotion: when a higher-priority animation is consumed by `beforeTextSend` (R4 edit-in-place or R5 delete), the buried lower-priority animation correctly resumes with a new Telegram message; added 3 new unit tests covering R4 cascade resume, R5 cascade resume, and cancel on a cascaded animation

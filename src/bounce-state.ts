let _planned = false;
export function setPlannedBounce(v: boolean): void { _planned = v; }
export function isPlannedBounce(): boolean { return _planned; }
export function resetBounceStateForTest(): void { _planned = false; }

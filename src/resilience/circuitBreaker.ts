let failures = 0;
let openUntil = 0;
export function canProceed() {
  return Date.now() > openUntil;
}
export function recordFailure() {
  failures++;
  if (failures >= 5) {
    openUntil = Date.now() + 10_000;
    failures = 0;
  }
}
export function recordSuccess() {
  failures = 0;
}

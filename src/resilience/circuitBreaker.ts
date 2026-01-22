import { logger } from "../logger";

export class CircuitOpenError extends Error {
  constructor(until: number) {
    super(`Circuit breaker open until ${new Date(until).toISOString()}`);
    this.name = "CircuitOpenError";
  }
}
interface CircuitBreakerState {
  failures: number;
  openUntil: number;
  lastFailureTime: number;
  totalFailures: number;
  totalSuccesses: number;
}

class CircuitBreaker {
  private state: CircuitBreakerState = {
    failures: 0,
    openUntil: 0,
    lastFailureTime: 0,
    totalFailures: 0,
    totalSuccesses: 0,
  };
  private readonly FAILURE_THRESHOLD = 5;
  private readonly OPEN_DURATION_MS = 10_000;
  private readonly HALF_OPEN_ATTEMPTS = 3;

  canProceed(): boolean {
    const now = Date.now();
    
    if (now > this.state.openUntil) {
      if (this.state.openUntil > 0) {
        logger.info("Circuit breaker transitioning to half-open");
        this.state.openUntil = 0;
      }
      return true;
    }
    
    return false;
  }

  recordFailure(): void {
    this.state.failures++;
    this.state.totalFailures++;
    this.state.lastFailureTime = Date.now();

    if (this.state.failures >= this.FAILURE_THRESHOLD) {
      this.state.openUntil = Date.now() + this.OPEN_DURATION_MS;
      logger.error(
        { 
          failures: this.state.failures,
          openUntil: new Date(this.state.openUntil).toISOString(),
        },
        "Circuit breaker opened"
      );
      this.state.failures = 0;
    }
  }

  recordSuccess(): void {
    this.state.failures = 0;
    this.state.totalSuccesses++;
  }

  getStats() {
    return {
      isOpen: !this.canProceed(),
      failures: this.state.failures,
      openUntil: this.state.openUntil > 0 
        ? new Date(this.state.openUntil).toISOString() 
        : null,
      totalFailures: this.state.totalFailures,
      totalSuccesses: this.state.totalSuccesses,
      errorRate: this.state.totalFailures / 
        (this.state.totalFailures + this.state.totalSuccesses || 1),
    };
  }

  reset(): void {
    this.state = {
      failures: 0,
      openUntil: 0,
      lastFailureTime: 0,
      totalFailures: 0,
      totalSuccesses: 0,
    };
    logger.info("Circuit breaker manually reset");
  }
}

export const redisCircuitBreaker = new CircuitBreaker();
export const matchingCircuitBreaker = new CircuitBreaker();
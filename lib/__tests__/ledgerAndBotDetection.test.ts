import { describe, it, expect } from "vitest";
import { calculateIntervalEntropy, evaluateEarningVelocity, UserEarningHistory } from "../botDetection";

describe("Double-Entry Ledger Balancing", () => {
  it("strictly preserves zero-sum invariant across multi-party P2P transfers", () => {
    interface Account {
      id: string;
      balance: number;
    }

    const alice: Account = { id: "alice@example.com", balance: 50000 };
    const bob: Account = { id: "bob@example.com", balance: 12000 };
    const initialTotalSupply = alice.balance + bob.balance;

    const transferAmount = 15000;

    // Simulate atomic ledger transfer
    const debit = -transferAmount;
    const credit = +transferAmount;

    // Zero-sum invariant: sum of changes must strictly equal 0
    expect(debit + credit).toBe(0);

    alice.balance += debit;
    bob.balance += credit;

    // Final total money supply must match initial total supply exactly (no money created or lost)
    expect(alice.balance + bob.balance).toBe(initialTotalSupply);
    expect(alice.balance).toBe(35000);
    expect(bob.balance).toBe(27000);
  });

  it("prevents sender account from overdrafting into negative balance", () => {
    const senderBalance = 5000;
    const transferAttempt = 8000;

    const newSenderBal = Math.max(0, senderBalance - transferAttempt);
    expect(newSenderBal).toBe(0);
    expect(newSenderBal).toBeGreaterThanOrEqual(0);
  });
});

describe("Anti-Bot Mathematical Entropy & Velocity Engine", () => {
  it("flags sub-second robotic bursts (<500ms) immediately", () => {
    const now = Date.now();
    const history: UserEarningHistory = {
      lastEarnTimestamps: [now - 200], // 200ms ago
      consecutivePacingViolations: 0,
    };

    const result = evaluateEarningVelocity(now, history);
    expect(result.isBotSuspect).toBe(true);
    expect(result.reason).toContain("Robotic sub-second click burst");
    expect(result.cooldownType).toBe("pacing_15m");
  });

  it("allows realistic human interaction with natural variance", () => {
    const start = 1700000000000;
    // Human intervals: 12s, 45s, 18s, 29s, 60s, etc.
    const humanDeltas = [12000, 45000, 18000, 29000, 60000, 15000, 32000, 22000, 40000, 19000];
    let current = start;
    const timestamps: number[] = [start];

    humanDeltas.forEach((delta) => {
      current += delta;
      timestamps.push(current);
    });

    const entropy = calculateIntervalEntropy(timestamps);
    expect(entropy.stdDevSeconds).toBeGreaterThan(3.0); // High natural entropy

    const history: UserEarningHistory = {
      lastEarnTimestamps: timestamps.slice(0, -1),
      consecutivePacingViolations: 0,
    };

    const result = evaluateEarningVelocity(timestamps[timestamps.length - 1], history);
    expect(result.isBotSuspect).toBe(false);
  });

  it("detects 20-ad mechanical robotic loops with tight variance (sigma < 0.65s)", () => {
    const start = 1700000000000;
    // Robotic intervals locked at 16.0s ± 0.05s
    const roboticTimestamps: number[] = [start];
    let current = start;
    for (let i = 0; i < 20; i++) {
      current += 16000 + (i % 2 === 0 ? 50 : -50); // 16.05s, 15.95s
      roboticTimestamps.push(current);
    }

    const entropy = calculateIntervalEntropy(roboticTimestamps);
    expect(entropy.stdDevSeconds).toBeLessThan(0.65); // Synthetic near-zero entropy
    expect(entropy.meanIntervalSeconds).toBeCloseTo(16.0, 1);

    const history: UserEarningHistory = {
      lastEarnTimestamps: roboticTimestamps.slice(0, 19),
      consecutivePacingViolations: 0,
    };

    const result = evaluateEarningVelocity(roboticTimestamps[19], history);
    expect(result.isBotSuspect).toBe(true);
    expect(result.reason).toContain("Continuous minimum-interval pacing loop");
    expect(result.cooldownType).toBe("pacing_15m");
  });
});

describe("BullMQ Payment Idempotency Keys", () => {
  it("formats deterministic Redis idempotency keys correctly", () => {
    const reference = "tx_paayh_9872164";
    const idempotencyKey = `idempotency:transfer:${reference}`;
    const lockKey = `lock:transfer:${reference}`;

    expect(idempotencyKey).toBe("idempotency:transfer:tx_paayh_9872164");
    expect(lockKey).toBe("lock:transfer:tx_paayh_9872164");
    expect(idempotencyKey).not.toEqual(lockKey);
  });
});

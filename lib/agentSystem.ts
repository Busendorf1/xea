/**
 * Agent System Orchestration & Re-export Barrel
 *
 * Provides complete backward compatibility for all callers of `@/lib/agentSystem`
 * while delegating domain logic to focused sub-modules:
 * - agentTypes: TypeScript interface & type definitions
 * - agentCache: Shared in-memory and Redis cache state
 * - agentCore: Agency registration, referral codes, agent verification, and sanction policies
 * - agentNetwork: Followers, downline graph, mutuals, and tree queries
 * - agentCommission: Dual-tier commission calculation, distribution, and wallet reconciliation
 * - agentOptOut: Mutual permissioning, unfollow workflows, and downline detachment
 */

export * from "./agent/agentTypes";
export * from "./agent/agentCache";
export * from "./agent/agentCore";
export * from "./agent/agentNetwork";
export * from "./agent/agentCommission";
export * from "./agent/agentOptOut";

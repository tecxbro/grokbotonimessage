import { operations, type Capability } from "./contracts/index.js";
export function foundationCapabilities(): Capability[] {
  return operations.map((operation) => ({
    operation,
    providerSupport: "unknown",
    availability: {
      account: "unknown",
      conversation: "unknown",
      checkedAt: null,
    },
    implementation: "unimplemented",
    direction: { inbound: "unknown", outbound: "unimplemented" },
    evidence: [],
    sdkVersion: "12.8.0",
    sources: ["npm:spectrum-ts@12.8.0", "npm:@spectrum-ts/imessage@12.8.0"],
    blockers: [
      "F0 defines contracts only; owner lane must implement and validate this operation.",
      "Account and conversation capabilities have not been inspected.",
    ],
  }));
}

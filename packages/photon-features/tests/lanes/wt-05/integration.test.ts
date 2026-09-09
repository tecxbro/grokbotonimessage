import { FailureHooks } from "../../fixtures/harness.js";
import { createPollReducer } from "../../../src/features/polls/reducer.js";
import { registerPollIntegrationContract } from "./integration-contract.js";
import { storeFixture } from "./support.js";

registerPollIntegrationContract("F0 transactional fixture (WT-01/WT-02 rerun pending)", () => {
  const f = storeFixture(); const hooks = new FailureHooks();
  const reducer = createPollReducer({ orderedSources: ["native-test"], selectionSemantics: "independent-option-deltas" });
  return { store: f.store, close: f.close,
    failNextCommit: () => hooks.failAt("before-commit"),
    accept: async event => {
      f.store.transaction(tx => { reducer.reduce(event, tx); hooks.hit("before-commit"); });
    },
  };
});

import test from "node:test";
import assert from "node:assert/strict";
import {parsePairing} from "../scripts/verify-phone.mjs";
import {deriveKeyRaw} from "../src/web/e2e.mjs";

test("phone verifier derives the host key from the CLI's grouped display code", async () => {
  const parsed=parsePairing("Open on phone:\n  https://client.example/pair?relay=https%3A%2F%2Frelay.example&token=test-token&device=test-device\nPairing code: ABCDE-12345-FGHJ\n");
  assert.equal(parsed.code,"ABCDE12345FGHJ");
  assert.deepEqual(await deriveKeyRaw(parsed.code,parsed.token),await deriveKeyRaw("ABCDE12345FGHJ","test-token"));
  assert.equal(parsed.deviceId,"test-device");
});

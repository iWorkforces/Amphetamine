import { describe, it, expect, vi } from "vitest";
import { createRecomputeSleepPrevention } from "../../src/application/sleep/recompute-sleep-prevention.js";
import type { SleepBlockerPort } from "../../src/application/ports/sleep-blocker.port.js";
import type { SleepBlockMode } from "../../src/domain/settings/sleep-block-mode.js";

function createMockBlocker(
  initiallyActive = false,
): SleepBlockerPort & { calls: Array<{ enabled: boolean; mode: SleepBlockMode }> } {
  let active = initiallyActive;
  const calls: Array<{ enabled: boolean; mode: SleepBlockMode }> = [];
  return {
    calls,
    sync(enabled: boolean, mode: SleepBlockMode): void {
      calls.push({ enabled, mode });
      active = enabled;
    },
    isActive: () => active,
    stop: () => {
      active = false;
    },
  };
}

describe("createRecomputeSleepPrevention", () => {
  it.each([
    { intent: false, session: false, expected: false },
    { intent: true, session: false, expected: true },
    { intent: false, session: true, expected: true },
    { intent: true, session: true, expected: true },
  ] as const)(
    "OR matrix intent=$intent session=$session → $expected",
    ({ intent, session, expected }) => {
      const blocker = createMockBlocker(false);
      const onEffective = vi.fn();
      const recompute = createRecomputeSleepPrevention({
        getUserIntent: () => intent,
        getSessionActive: () => session,
        getSleepBlockMode: () => "prevent-display-sleep",
        sleepBlocker: blocker,
        onEffectiveActiveChange: onEffective,
      });

      recompute();

      expect(blocker.calls).toEqual([{ enabled: expected, mode: "prevent-display-sleep" }]);
      expect(onEffective).toHaveBeenCalledWith(expected);
    },
  );

  it("honors userIntentOverride over getUserIntent", () => {
    const blocker = createMockBlocker(false);
    const recompute = createRecomputeSleepPrevention({
      getUserIntent: () => false,
      getSessionActive: () => false,
      getSleepBlockMode: () => "prevent-app-suspension",
      sleepBlocker: blocker,
    });

    recompute(true);

    expect(blocker.calls[0]).toEqual({
      enabled: true,
      mode: "prevent-app-suspension",
    });
  });

  it("notifies onPreventSleepChange only when blocker effective flips", () => {
    const blocker = createMockBlocker(false);
    const onPrevent = vi.fn();
    const recompute = createRecomputeSleepPrevention({
      getUserIntent: () => true,
      getSessionActive: () => false,
      getSleepBlockMode: () => "prevent-display-sleep",
      sleepBlocker: blocker,
      onPreventSleepChange: onPrevent,
    });

    recompute();
    expect(onPrevent).toHaveBeenCalledTimes(1);
    expect(onPrevent).toHaveBeenCalledWith(true);

    onPrevent.mockClear();
    recompute();
    expect(onPrevent).not.toHaveBeenCalled();
  });
});

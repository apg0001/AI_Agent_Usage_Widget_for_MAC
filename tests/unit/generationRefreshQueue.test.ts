import { describe, expect, it, vi } from "vitest";
import { GenerationRefreshQueue } from "../../src/main/generationRefreshQueue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("GenerationRefreshQueue", () => {
  it("일반 동시 refresh는 하나의 요청으로 합친다", async () => {
    const pending = deferred<string | null>();
    const task = vi.fn(() => pending.promise);
    const queue = new GenerationRefreshQueue(task);

    const first = queue.refresh();
    const second = queue.refresh();
    expect(second).toBe(first);
    expect(task).toHaveBeenCalledTimes(1);

    pending.resolve("snapshot");
    await expect(first).resolves.toBe("snapshot");
  });

  it("invalidate 중 완료된 결과를 버리고 같은 promise에서 최신 세대를 후속 실행한다", async () => {
    const requests = [deferred<string | null>(), deferred<string | null>()];
    const committed: string[] = [];
    let queue: GenerationRefreshQueue<string>;
    const task = vi.fn(async (generation: number) => {
      const value = await requests[generation].promise;
      if (!queue.isCurrent(generation)) {
        return null;
      }
      if (value) {
        committed.push(value);
      }
      return value;
    });
    queue = new GenerationRefreshQueue(task);

    const first = queue.refresh();
    queue.invalidate();
    const mutationRefresh = queue.refresh();
    requests[0].resolve("old-snapshot");
    await vi.waitFor(() => expect(task).toHaveBeenCalledTimes(2));
    requests[1].resolve("new-snapshot");

    await expect(first).resolves.toBe("new-snapshot");
    await expect(mutationRefresh).resolves.toBe("new-snapshot");
    expect(committed).toEqual(["new-snapshot"]);
    expect(task.mock.calls.map(([generation]) => generation)).toEqual([0, 1]);
  });

  it("실패한 요청을 정리해 다음 refresh를 허용한다", async () => {
    const task = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce("recovered");
    const queue = new GenerationRefreshQueue<string>(task);

    await expect(queue.refresh()).rejects.toThrow("offline");
    await expect(queue.refresh()).resolves.toBe("recovered");
    expect(task).toHaveBeenCalledTimes(2);
  });
});

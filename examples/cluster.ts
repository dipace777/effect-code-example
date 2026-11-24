import { Effect, Layer, Ref, Schema } from "effect";
import { Entity, TestRunner } from "effect/cluster";
import { Rpc } from "effect/rpc";

// Each entity id gets its own counter. The cluster hashes that id onto a
// shard and runs these handlers on the runner that owns the shard.
const Counter = Entity.make("Counter", [
  Rpc.make("Increment", {
    payload: { amount: Schema.Number },
    success: Schema.Number,
  }),
  Rpc.make("Get", {
    success: Schema.Number,
  }),
]);

const CounterLive = Counter.toLayer(
  Effect.gen(function* () {
    const address = yield* Entity.CurrentAddress;
    const count = yield* Ref.make(0);

    yield* Effect.logInfo(
      `${address.entityId} activated on shard ${address.shardId}`,
    );

    return {
      Increment: (request) =>
        Ref.updateAndGet(count, (current) => current + request.payload.amount),
      Get: () => Ref.get(count),
    };
  }),
);

const program = Effect.gen(function* () {
  const makeClient = yield* Counter.client;
  const alice = makeClient("alice");
  const bob = makeClient("bob");

  yield* alice.Increment({ amount: 1 });
  const aliceCount = yield* alice.Increment({ amount: 4 });
  const bobCount = yield* bob.Increment({ amount: 2 });
  const aliceAgain = yield* alice.Get();

  console.log(`alice ${aliceCount} (still ${aliceAgain}), bob ${bobCount}`);
});

await Effect.runPromise(
  program.pipe(
    // provideMerge leaves Sharding in context so Counter.client can use it.
    Effect.provide(CounterLive.pipe(Layer.provideMerge(TestRunner.layer))),
  ),
);

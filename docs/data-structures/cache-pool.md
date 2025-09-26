---
title: Cache Pool
sidebar_pos: 2
---

The cache pool is FBI's internal solution to one of the most subtle but frustrating issues with high-throughput message processing: *race conditions* and *data leaks* during processing.

Unlike a traditional queue or FIFO buffer where messages are added and processed from a single shared array, the cache pool is built around the idea of rotating caches - essentially a "group of groups" - so that adding new data during processing never interferes with the data currently being processed.

## Table of Contents
- [The Problem](#the-problem)
- [Real-World Example](#real-world-example)
- [Requirements & Constraints](#requirements--constraints)
- [Naive Solution](#naive-solution)
- [Real World Example](#real-world-example)
- [Data Structure](#data-structure)
- [Future Work](#future-work)

## The Problem
Messages will be flowing into your system at all times. You can't stop them, and you can't slow them down. Every message must be processed once and only once, even if they arrive mid-processing or while the system is cleaning up from the previous batch.

The tricky part is that real-time systems don’t wait for your cache to be ready. If your data structure isn’t designed with continuous input in mind, you’ll inevitably run into race conditions or data loss - and those are the kinds of bugs that don’t show up until production.

## Requirements & Constraints
1. **Continuous Input**: New messages can arrive at any time, even while processing is ongoing
2. **Batch Processing**: The system should have the ability to process messages in batches for efficiency
3. **No Data Loss**: Every message must be processed exactly once, with no duplicates or omissions
4. **Scalability**: The solution should handle varying loads, from low to high throughput
5. (bonus) **Simplicity**: The implementation should be straightforward and easy to maintain

## Naive Solution
The most obvious solution is to use a simple array: add messages as they arrive, loop over them occasionally, and clear the array when done.
```js
const cache = [];

client.on('messageCreate', msg => cache.push(cache));

// run this every 10 minutes
async function ProcessMessages() {
    for (const msg of cache) {
        // do stuff
    }
    // clear cache
    cache.length = 0;
}
```
And this works great ... until it doesn't.

- Late arrivals: What happens if a message arrives while you're in the middle of processing? There is a tiny window right between processing and clearing the cache where a new message could sneak in and get wiped out - silent data loss. This is even worse when using standard for loops instead of iterators.
- Concurrency: If a message is added during iteration, you might skip or even process it twice. You could of course use a second cache for tracking processed messages, but now you have two arrays to manage and the complexity increases.
- Batch integrity: Since the cache is mutatable, you're never guaranteed that the batch you started processing is the same once you'll finish. A message could come in after de-duplication but before processing, leading to missing guilds/channels and in turn a database error with missing data.

These edge cases are subtle but can be VERY devastating if you are not careful. And they only become more likely as your system scales and the message rate increases.

## Real-World Example
So before I talk about the actual data solution, I want to talk about a real-world analogy that illustrates the problem and my line of thinking behind this issue.

Imagine you have a leak in your ceiling, and you're using a bucket to catch the water. No matter what you do, *you can't stop the water* - it just keeps dripping. Now eventually your bucket fills up and you need to empty it. But while you are away, dumping out the water, you have to step out of the room for a moment. Crucially, the leak will keep dripping, and now you have a puddle on the floor.

Most people's first instinct: "Why not just use *two* buckets?"
You put the bucket under the leak, and when it's time to empty it, you quickly swap in the second bucket. The water will keep dripping, but now it will be caught with the second bucket, giving you time to empty the other bucket. This keeps your floor dry and no mop needed!

This is the exact idea behind the **Cache Pool**.

Instead of water we have messages. We can't stop them, and we can't exactly ask people "hey can you stop talking for a few seconds?" So we add 2 bucket - 2 caches - and we can swap them out while we process the other.

## Data Structure
So how do we translate the "two buckets" idea into code? The answer is surprisingly simple: instead of one cache array that’s constantly being written to and read from, we use multiple caches ("pools") and rotate between them as we process data.

Each pool is just a normal array. The trick is in how we use them:
- One pool is **active** - This is where new messages are added.
- A different pool is **frozen** - This is the pool currently being processed.
- Any remaining pools are **idle** - They are empty and ready to be used when needed.

When it’s time to process messages, we simply freeze the active pool (stop adding new messages to it) and switch to an idle pool for new messages. This way, the pool being processed is isolated from any new data.

Here is a simplified implementation of the Cache Pool. You can find the full code [here](https://github.com/MusicMakerOwO/FoxBoxInsurance/blob/main/Utils/Caching/CachePool.js).
```js
class CachePool {
    constructor(pools = 3) {
        this.cache = new Array(pools).fill(null).map(() => []);
        this.currentPool = 0;
    }

    add(value) {
        this.cache[this.currentPool].push(value);
    }

    switch() {
        this.currentPool = (this.currentPool + 1) % this.cache.length;
    }

    clear(pool = this.currentPool) {
        this.cache[pool] = [];
    }
}
```

In terms of code, this is stupidly simple to implement. Instantiate the class, push your data, switch cache, and process.

:::tip
In most cases, 2 pools are enough (1 active, 1 frozen). I use 3 to give a small buffer and allow switching even if processing takes a long time. This is an arbitrary number for what it's worth.
:::

```js
const cache = new CachePool(3); // 3 caches to rotate

client.on('messageCreate', msg => cache.add(msg));

async function ProcessMessages() {
    // grab the currently selected pool
    // important to note that this is a REFERENCE to the array, NOT a copy
    const messages = messageCache.cache[messageCache.currentPool];
    if (messages.length === 0) return;

    // switch to a new pool for incoming messages, this also now "freezes" the above array
    messageCache.switch();
    // clear new pool for future use
    messageCache.clear();
    
    // do stuff
}
```

This way, you can be sure that the messages you are processing are exactly the ones that were present when you started - no more, no less. Any new messages that arrive while you are processing will go into a different pool, ready for the next round.

And that's really about it for FBI's Cache Pool and message processing. It's not a difficult concept but often the easy solutions are the best ones. If you have any questions or suggestions we have a [Discord server](https://notfbi.dev/support) where you can reach out to us.

## Future Work
There are a few potential improvements that could be made to the Cache Pool in the future. I don't claim to be an expert, so I'm taking the liberty to write some of the flaws I see here.

### Dynamic Cache Flushing
One of the issues with the current implementation - and I want to clarify this is not an issue of the Cache Pool itself - is I have no system to flush cache in high load situations. Everything is on a fixed timer (30 minutes) with a manual trigger on request, but in the case of say a server raid or @everyone pings then the cache could fill up very quickly.

I'd like to add a system down the line to flush the cache early in cases like this, would help to also keep performance up as well. It really shouldn't be too difficult, but it's a hard feeling to break something that is otherwise working fine haha!

### Guild/Channel Flushing
As it stands now, there is no way to tell what is in the cache without iterating through it. This is fine for a small bot but every single export must flush cache even if no messages were sent in the guild/channel. This is wasteful and there are several ways to go about this - all with varying complexity and tradeoffs.

**1. Use a `Set` to track guilds/channels in cache**
This would have to be managed separately so there could definitely be some edge cases to watch out for. Essentially you would have a `Set` that tracks guild/channel IDs as they are added to the cache, and then you could check this set before flushing. The downside is you have to manage two data structures and keep them in sync.
```js
const cache = new CachePool(3);
const channelsInCache = new Set();
client.on('messageCreate', msg => {
    cache.add(msg);
    channelsInCache.add(msg.channelId);
});

async function ProcessMessages(channelID) {
    if (!channelsInCache.has(channelID)) return; // nothing to flush

    // usual code, ignore messages from other channels

    channelsInCache.delete(channelID); // remove from set after processing
}
```

**2. Redesign Cache Pool to use Maps**
This would be a more complex change, but instead of using arrays for each pool, you could use a `Map` (or `Object`, they are the same for all intents and purposes) where the keys are guild/channel IDs and the values are arrays of messages. This is a very structured approach and would make it easy to check if a guild/channel has messages in the cache. The downside is that it adds complexity to the Cache Pool itself and could make it harder to manage, additionally it could add a bunch of memory overhead.
```js
// each pool is now a Map, just use your imagination
// I'm too lazy to type up a whole class for 5 lines of code lmao
const cache = new CachePool(3);

client.on('messageCreate', msg => {
    if (!cache.currentPool.has(msg.guildId)) {
        cache.currentPool.set(msg.guildId, new Map());
    }
    
    const guildCache = cache.currentPool.get(msg.guildId);
    if (!guildCache.has(msg.channelId)) {
        guildCache.set(msg.channelId, [msg]);
    } else {
        guildCache.get(msg.channelId).push(msg);
    }
});

async function ProcessMessages(channelID) {
    const messages = cache.currentPool.get(channelID);
    if (!messages || messages.length === 0) return; // nothing to flush

    // usual code

    cache.currentPool.delete(channelID); // remove after processing
}
```

### Memory Compression
This is a more advanced topic, but it's crossed my mind a few times in hindsight. The idea is that since Discord has a limit of 4,000 characters per message, a malicious user could spam messages and fill up the cache very quickly. I have not tested this myself, but I imagine it could be a problem in some situations, like a sort of DDoS against my bot.

One solution is I could compress large messages (> 1,000 characters) before adding them to the cache. This would save memory and allow me to store more messages in the same amount of space. The downside is that it adds complexity and CPU overhead, and I would have to decompress messages before processing them.

I'm not really sure how much of a problem this is in practice or if compression is even worth the benefit (how many people are sending 4,000 character messages anyway?) but it's something to consider for the future, even if minor.

### Separate Bot Instances
This is just one of those ideas that is so out there that it makes people think I'm insane but could work in theory. To my knowledge, there is nothing stopping you from running multiple instances of the same bot, a lot of beginners actually do this on accident, and it breaks a bunch of stuff.

The idea is that I could do this on purpose and effectively run several instances of the bot for different tasks. I could have an entire instance just for message processing and snapshot creation - I could write this instance in something like Go or Rust for performance - and then have a separate instance for user commands and interaction handling.

The one big downside to this is I would need to share state between the two instances, which I've already kind of solved with the recent API rewrite, but the elephant in the room is the number of instances I would need. Large bots have tons of shards and that is to be expected, however each of these instances have their own cache and are thus very memory intensive (even if no  one is running commands), but this system would require at least 2x the number of instances: 1 instance for commands, 1 instance for processing. This could get out of hand very quickly and would be a nightmare to manage, but it's an interesting concept nonetheless.

I probably won't be doing this ont, but it's fun to think about.
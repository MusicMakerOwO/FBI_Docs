---
title: Bound Snapshot Chain
sidebar_position: 1
---

A Bound Snapshot Chain (BSC) is a sequence of states that represent the evolution of a system over time.
Each state in the chain is linked to its predecessor, forming a chain that can be traced and rebuilt at any point in time.
This structure is the backbone of FBI's server snapshots and this document just explains it in depth.

:::tip TL;DR
A Bound Snapshot Chain (BSC) is a linked list of snapshots, inspired by Git commits. BSC only stores differences of the system state to save on storage costs.
:::


## Table of Contents
- [The Problem](#the-problem)
- [Requirements & Constraints](#requirements--constraints)
- [Naive Approach](#naive-approach)
- [What Others Have Done](#what-others-have-done)
- [Design Space & Rationale](#design-space--rationale)
- [Data Structure](#data-structure)
- [Algorithms](#algorithms)
  - [Rebuilding a Snapshot](#rebuilding-a-state)
  - [Create Snapshots](#create-snapshot)
  - [Delete Snapshots](#delete-snapshot)
- [Edge Cases / Caveats](#edge-cases--caveats)
  - [Role Hierarchy](#1-role-hierarchy)
  - [Managed Roles](#2-managed-roles)
  - [Ban Permissions](#3-ban-permissions)
  - [Missing Bot Role](#4-missing-bot-role)
  - [Channel Types](#5-channel-types)
- [Future Work](#future-work)

## The Problem

Discord servers often don't change that much over time - a few channels are added or removed, maybe a permission is changed here or there.
However, storing a complete snapshot of the server every time a change occurs would be very inefficient and wasteful.
Even more so since we want users to manually create snapshots and should work with the worst case that someone creates a dozen snapshots.

We want to store only the differences between states, rather than the entire state itself. This will cut the data storage to near zero even if a user creates many snapshots.

## Requirements & Constraints

FBI uses a SQL database internally so we need to work within the constraints of a relational database.
This means we can't use complex data structures like trees or graphs directly, but need to represent them using tables and relations.
In simple terms, that means we can only use objects (rows) and arrays (tables), also known as "First Normal Form" for the database nerds out there.

This isn't a hard-set requirement but storage cost should be as close to zero as possible, especially for users that create many snapshots, think of it like a bonus challenge for this design.

We also want to be able to efficiently rebuild any state in the chain, as well as add and remove snapshots without needing to rebuild the entire chain.

So with this in mind, here are the requirements in bullet points:
- Efficiently store differences between states
- Efficiently rebuild any state in the chain
- Efficiently add and remove snapshots
- Work within the constraints of a relational database
- Minimize storage cost, especially for users with many snapshots

## Naive Approach
The first thought for most people would be to store the entire server for each snapshot, and while yes this works, it is utterly wasteful with storage.
But with that being said, lets look at the benefits of it.

For starters, it is exceedingly simple to implement, you just need a table with a few columns and you are done.
It is also very easy to understand and reason about, as each snapshot is independent of the others.
Rebuilding a state is as simple as fetching the snapshot from the database, and adding or removing snapshots is just inserting or deleting rows from the table.
And lastly it is very predictable; A given snapshot will use O(N) storage, where N is the number of say roles in the server, and then O(1) to create/fetch/delete a snapshot.

However, the main downside is the storage cost, which can be mitigated by using compression algorithms like gzip or zstd, but that only helps so much.
Another issue is that if you create 2 snapshots without change then you effectively just stored the same data twice, which is a complete waste of space.
This is especially bad if you create many snapshots, as the storage cost will grow linearly with the number of snapshots.|

So while this approach is simple and easy to implement, let's see if we can do better...

## What Others Have Done
So if storing the entire state each time is wasteful, what's the alternative? Well, this problem isn't exactly new - other domains have run into almost this exact same problem.

Take [GitHub](https://github.com) for example. When you make a commit, GitHub doesn't store the entire project every time (that would be insane for large repos!).
Instead, most commits only store the *differences* from the previous version; This is also why merging or rebasing is required when working with branches.
You can always rebuild the full project at any commit by replaying these changes from some known point.

Or look at **chess PGN files**. A PGN file doesn't write out the entire board state every move, only a *list of moves* from the beginning of the game.
You can always reconstruct the full board at any point by replaying these moves from the start. Yes it can be slow for long games, but it is incredibly fast for what it is!

Both of these systems show a common pattern:
- Full snapshots are rare
- Most of the time you just store incremental changes
- Rebuilding a state is done by replaying the chain of changes

This is great inspiration for FBI's snapshot system!
But here's the catch: both of these systems are designed for *potentially infinite* chains of changes, with hundreds or thousands of steps.
That's why they need extra tricks like anchoring, packing, or tree structures to keep performance in check.

In FBI, we don't need that level of complexity. We're not storing infinite changes, just a *bounded* window of snapshots (see where the name comes from yet?).
That changes everything really: it means we can safely use a simple "base + chain of diffs" module without worrying about runaway storage costs or chain depths.

This is the sweet spot between naive full copies and heavyweight systems like Git.

## Design Space & Rationale
Before we dive into the final data structure, here's how we arrived at it.
Rather than hand a solution down, we'll construct the design from scratch; The obvious options, the tradeoffs they expose, and wht the Bound Snapshot Chain (BSC) is the best fit for our needs.

:::danger
If you skipped down here or have forgotten it, please refresh yourself on the [requirements & constraints](#requirements--constraints).
It is best you keep these in mind while reading the rest of this section.
:::

Git and PGN solve essentially the same problem but are built for unbounded history; they need packing, anchors, trees, and move.
FBI's operational reality is different: changes are few and far between, and snapshots are seldom created.
Additionally, we have a hard cap of 7 snapshots per server and thus can afford to do a bit more work when rebuilding states.

## Data Structure
The Bound Snapshot Chain (BSC) is made up of two main components: the **base state** and the **chain of diffs**.
The first snapshot will ALWAYS be a full snapshot since there is no data to diff against. This is the base state and all future snapshots will be diffs against this in some way.

At a high level, it works like this:
- **Origin Node**: The very first snapshot, a full copy of the server state
- **Diff Nodes**: Each subsequent snapshot stores only the differences from the previous snapshot
- **Traversal**: To rebuild a state, you start from the origin and apply each diff in sequence until you reach the desired snapshot

Think of it like a linked list with semantics: instead of arbitrary nodes, each step has a clear meaning (create, update, delete).
Because the chain is **bounded** (maximum of 7 snapshots per server), performance stays predictable; There's a hard cap on how much is ever required to rebuild a state.

The digram below shows this more visually.
- Blue = origin node
- Red = marked for deletion
- Green = create/update (diffs)
- Arrows = time moving forward

![BSC Diagram](/img/BSC_Diagram.png)

The diagram above is abstract: colors and shapes are just to illustrate concepts.
But what does this actually *look like* in a Discord server? Imagine a server where a role is added, one is deleted, and another is updated.
Each color block maps those operations, changed together into a series of steps. That's all a BSC really is - a sequence of tiny changes stitched together over time.

Going forward, it will be a good idea that you are familiar with discord's terminology.
- **Guild**: A discord server, can be anything
- **Channel**: A text or voice channel within a guild, can be nested in categories
- **Role**: A role that can be assigned to members, has permissions

TO make this concreate, let's see how we actually represent these nodes instead FBI.
We'll use TypeScript-like interfaces for convenience, even though the actual implementation is in JS + SQL.

:::tip
FBI uses SQL internally, but we will represent the data in terms of TypeScript interfaces for simplicity.
:::

For starters, every snapshot needs a starting point, the origin node.
Thankfully FBI does this very easily so little explanation will be needed here.
```ts
interface Snapshot {
    id: number; // unsigned int, primary key
    guild_id: string; // discord snowflake
    
    type: 'automatic' | 'manual' | /* etc */; // how the snapshot was created
    pinned: boolean; // we won't talk about this but pinned snapshots can't be deleted
}
```

And lastly before we begin, we should do some housekeeping and define a type for common properties as many of these will be reused.
```ts
interface SnapshotNode {
    snapshot_id: number; // foreign key to Snapshot.id
    deleted: boolean; // node is marked for deletion
    needsUpdate: boolean; // internal use only, flag if the hash needs to be recalculated
    hash: string; // internal use only, quick way to check for changes
}
```

Now we can start defining the actual BSC nodes, starting with roles.
```ts
interface SnapshotRole extends SnapshotNode {
    id: string; // discord snowflake, primary key (snapshot_id + id)
    name: string;
    color: number; // unsigned medium int - 3 bytes RGB
    hoist: boolean;
    position: number;
    permissions: string; // serialized permissions bitfield
    managed: boolean; // whether the role is managed by a bot/integration
}
```
A `SnapshotRole` represents a role in the server at a specific snapshot.
It extends `SnapshotNode` to include common properties like `snapshot_id`, `deleted`, and `hash`.
The `id` is the discord snowflake of the role, and the rest are standard role properties.

Now strangely enough, we are already done building the BSC structure! (wait what?) <br/>

That's it. Surprisingly simple right? We don't need anything more elaborate.
With just a base `Snapshot`, a reusable `SnapshotNode`, and a few specific node types like `SnapshotRole`, we can represent the entire chain.
It may feel underwhelming but the power doesn't come from the structure itself, that's down to how we use it. That's where the algorithms come in.

## Algorithms
Now that we know how snapshots and nodes are represented, the question is: how do we actually *use* them?
A static structure isn't useful until we can manipulate and traverse it.

Imagine you want to see what a server looked like at snapshot #5. You'd start at snapshot #1, the full copy.
Then, one by one, you'd apply each change (add this role, delete this channel) until you reach #5. That's all there is to it.

We'll break all of these down into 3 main operations:
1. [Rebuilding a state](#rebuilding-a-state)
2. [Creating snapshots](#create-snapshot)
3. [Deleting snapshots](#delete-snapshot)


### Rebuilding a State
Let's start with traversal, this one is super easy. Below is a simplified implementation - notice how it mirrors the manual process described above.

:::tip
This a code snippet taken directly from the actual FBI codebase, just simplified for clarity. <br/>
You can find the full implementation [here](https://github.com/MusicMakerOwO/FoxBoxInsurance/blob/19aa4d9aac9b56ebdfce23e3b422b6a0ff5ff9bc/Utils/SnapshotUtils.js#L113-L207).
:::

```ts
interface SnapshotResult {
    roles       : Map<string, SnapshotRole>;
    channels    : Map<string, SnapshotChannel>;
    permissions : Map<string, SnapshotPermission>;
    bans        : Map<string, SnapshotBan>;
}

async function FetchSnapshot(snapshot_id: number): Promise<SnapshotResult> {
    const guildID: string = await ResolveGuildFromSnapshot(snapshot_id); // internal helper function

    // read out all available snapshots for this guild
    const availableSnapshots: number[] = await Database.query(`
        SELECT id
        FROM Snapshots
        WHERE guild_id = ?
        ORDER BY id ASC
    `, [guildID]).then( rows => rows.map(row => row?.id) );
    if (!availableSnapshots.includes(snapshot_id)) throw new Error('Snapshot not found');

    // we will only cover roles here but the same logic applies to the others
    const roles       = new Map();
    const channels    = new Map();
    const permissions = new Map();
    const bans        = new Map();
    
    // walk the chain forward
    for (const snapshotID of availableSnapshots) {
        if (snapshotID > snapshot_id) break; // reached the target snapshot, stop reading

        // grab a list of all changes for this snapshot
        const snapshotRoles: SnapshotRole[] = await Database.query(`
            SELECT *
            FROM SnapshotRoles
            WHERE snapshot_id = ?
        `, [snapshotID]);
        for (const role of snapshotRoles) {
            // and lastly apply them to our in-memory state
            // if it is marked for deletion, remove it, otherwise we can simply write over it
            if (role.deleted) {
                roles.delete(role.id);
                continue;
            }
            roles.set(role.id, role);
        }
        
        // literally the exact same logic for all the others lol
    }

    return {
        channels    : channels,
        roles       : roles,
        permissions : permissions,
        bans        : bans
    }
}
```

So how does this work? First, we fetch all snapshots for the guild and order them by ID (which is chronological).
Then, we walk through each snapshot in order, applying the changes to our in-memory state.
If a node is marked for deletion, we remove it from our state; Otherwise, we can simply add or update it.
Once we reach the target snapshot, we stop and return the rebuilt state.

When you write it out like this, it seems almost too simple.
But that's the beauty of the BSC - it leverages the natural order of changes to keep things straightforward.
It really isn't too scary when you break it down.

:::danger Warning
Lots of math ahead! If you aren't interested in the complexity analysis, feel free to skip to the next section.
:::

But how does this perform? We'll use big-O notation to analyze the complexity of this algorithm. <br/>
With a bit of imagination you can visualize a BSC as a 2D grid of nodes - each cell can be empty (no change), filled (create/update), or marked for deletion.
- Let **S** be the number of snapshots (max 7 in FBI)
- Let **N** be the number of *unique* nodes across all snapshots

:::tip
It's a little difficult to define N precisely since it depends on the number of changes, but for simplicity we'll just say it's the total number of nodes across all snapshots.
If you look back at the diagram above that would be Role 1, Role 2, Role 3, and finally Role 4 at the end since it is created.
:::

Given the above, that would make reading a given snapshot O(S * N) in the worst case.
However, since S is often capped at 7 in FBI, we can treat it as a constant factor for simplicity - O(7N) or simplified to O(N).
This means that the time it takes to rebuild a state scales linearly with the number of changes, which is quite efficient for our needs.

The storage cost is a bit more complex to analyze since it depends on the number of changes and how they are distributed across snapshots.
In the worst case a server would delete every single role and then create new roles. Discord servers are capped at 200 roles.
That would place a hard cap of `200 * S` nodes in the BSC, or `1,400` nodes on average.

On paper this seems WAY worse than the naive solution: sitting at O(1) for read/write and max of `200 * S` nodes.
In practice however, most servers will rarely change and snapshots are created infrequently.
This means that the storage cost will often be much lower than the worst-case scenario, especially for users that create many snapshots.<br/>
**From my own testing and observations, most snapshots have their storage cost cut down to near zero, especially for users that create many snapshots.**

### Create Snapshot
Creating a snapshot is a bit more involved than reading one, and is frankly the most complex part of this entire system.
The basic idea on paper is simple: fetch the current state, fetch the latest snapshot, find the differences, and then create a new snapshot with those differences.

The problem? Edge cases ... edge cases everywhere. <br/>
What if there are no snapshots yet? <br/>
What if a role is managed by a bot? <br/>
What do you do if FBI can't access a channel? <br/>
What happens if FBI's role is below a given role while restoring?

You get the idea. This is my own personal hell. Countless hours have been spent debugging and fixing edge cases in just this one function alone.
Needless to say, the actual implementation is quite large and complex so you will get a very simplified version here. <br/>

:::tip
The full function is ~350 lines. You can find the full implementation [here](https://github.com/MusicMakerOwO/FoxBoxInsurance/blob/19aa4d9aac9b56ebdfce23e3b422b6a0ff5ff9bc/Utils/SnapshotUtils.js#L252-L590)
:::

Let's break it down a little bit first. This will greatly simplify things when we look at the code. <br/>
Each node can have 3 different states:
1. **Unchanged**: The node exists in both the guild and the latest snapshot
2. **Created/Updated**: The node exists in the guild but not in the latest snapshot
3. **Deleted**: The node exists in the latest snapshot but not in the guild

In the code we will represent these states using a simple enum for clarity.
```ts
enum CHANGE_TYPE {
    CREATE = 0,
    UPDATE = 1,
    DELETE = 2
}
```

:::tip
Notice there is no enum for UNCHANGED. This is intentional since we can simply ignore these nodes.
:::

Now here's some pseudocode to illustrate the basic idea.
If we walk through it in our heads it should make sense.
```
roles = fetch current roles from guild
latestSnapshot = fetch latest snapshot from database

if no latestSnapshot:
    create full snapshot with all roles as CREATE
    return

for each role in roles:
    if role exists in latestSnapshot:
        if role has changed:
            mark as UPDATE
        else:
            ignore (UNCHANGED)
    else:
        mark as CREATE
for each role in latestSnapshot:
    if role does not exist in roles:
        mark as DELETE

create new snapshot with marked changes
```

That doesn't look too bad, right? Now let's see how it looks in actual code- <br/>
**350 lines of code** ... yeah we're not ready for that...

So let's look at some of the edge cases instead. There are a ton of them, don't worry.

### Edge Cases / Caveats
#### 1. Role Hierarchy
When restoring a snapshot, FBI’s role must sit above all restored roles.
If it doesn’t, we reorder the guild’s roles to enforce this.
The check is simple: compare the bot’s role against the highest role in the guild. If the bot isn’t already at the top, we bump it up.
This little loop unfortunately leaves a gap in the role order but Discord tolerates gaps in role positions, so this works fine in practice.
```js
const highestRole = guild.roles.highest;
if (botRole.rawPosition < highestRole.rawPosition) {
    // bot role is not at the top, move everything above it down
    for (const role of guildRoles) {
        if (role.id === botRole.id) {
            role.rawPosition = highestRole.rawPosition + 1; // move bot role to the top
            continue;
        }
    }
}
```
<br/>

#### 2. Managed Roles
Managed roles are roles that are created and managed by bots or "apps" as Discord calls them.
These roles cannot be created or deleted by users, they simply represent the permissions of a bot when invited to the server.
However, these can be moved and permissions updated so we must keep track of them for completeness.

If you remember back to the [data structure](#data-structure) section, you may have noticed that `SnapshotRole` has a `managed` property. This is that flag.
The other issue though is we also can't guarantee the bot role will still exist when restoring a snapshot (ie bot is kicked)
so that is yet another edge case but that is handled in the restore functionality, not here.
<br/>
#### 3. Ban Permissions
Bans are very interesting since you can't fetch the ban list unless you have the `BAN_MEMBERS` permission.
Many people invite the bot without its permissions (and I don't blame them lol) so we have to handle this case gracefully.

In short, we can't read the ban list, so we simply skip it and move on.
This means you can still create snapshots without this permission, but bans will not be saved.
**If your server gets nuked, you will not be able to restore the ban list. I urge you to give FBI this permission.**

:::tip
In a later update I plan to add a health check that warns users if the bot is missing critical permissions like this.
Unfortunately this is not implemented yet and exists only as an idea for now.
:::
<br/>
#### 4. Missing Bot Role
Some servers might invite the bot but not assign any permissions to it. This is not an issue for most cases, but it completely destroys the snapshot system.
If the bot find its own role, it can't find the position, and thus it can't reorder roles for creating a snapshot.
Instead of fighting with Discord permissions we unfortunately have to just abort the snapshot creation due to numerous edge cases that can arise from this.

Say you give FBI a role called "Bots" which assigns it permissions. FBI does not have a role of its own so all of its permissions will stem from this "Bots" role.
Now let's delete that role. FBI no longer has any permissions, and because it was no personal role it has no way to find its position in the role hierarchy.

:::danger
Now I will just come out and say this bluntly ... <br/>
**I have no idea how to solve this problem**. If you have any ideas, please open a pull request or let me know, I would love to hear it.
This has been a thorn in my side for a long time now and I haven't found a real solution yet, only band-aid fixes.
:::
<br/>
#### 5. Channel Types
Discord has LARGE PLETHORA of channel types, holy cow, and they are constantly adding more.
Guild text, DMs, voice channels, categories, announcements, public/private threads, stages, directories, forums, media ... DO YOU SEE MY PAIN YET?

For the most part these work great, but some types have special properties that need to be handled.
For example, forum channels have a `defaultAutoArchiveDuration` property that needs to be tracked, but normal text channels do not.
Unfortunately this is a minor issue and I have no way to conveniently solve this internally so special properties like this are simply ignored for now.

Here is a list of channel types and their special properties that are ignored.
For the most part they are purely cosmetic but can be a big deal for some users.
- Text Channels: `rate_limit_per_user`
- Voice Channels: `bitrate`, `user_limit`, `rtc_region`, `video_quality_mode`
- Forum Channels: `default_auto_archive_duration`, `default_thread_rate_limit_per_user`, `default_reaction_emoji`, `default_sort_order`, `available_tags`, `thread_metadata`

:::danger
Currently there are no plans to add support for these special properties. Perhaps in a future update I will revisit this.
:::

Additionally, there are also some channels that are simply ignored entirely. Some for obvious reasons, other for compatibility or saving my sanity.
- DMs, group DMs (duh)
- Public/Private threads (Discord API limitation)
- Directory - this is a server listing channel, it's never really used
- Media - this one is a 50/50; it's supported but your server must meet the criteria to have one


### Delete Snapshot
Deleting a snapshot is by far the simplest operation conceptually, but it has some subtle traps to be careful of.

- **If the latest snapshot is deleted**: it's trivial to delete it, we simply remove the rows from the database and we are done.
- **If an older snapshot is deleted**: things get messy fast.
The naive approach would be to "merge" its contents forward into the next snapshot, node by node.
That sounds harmless, but with up to 400 nodes per snapshot and 4 chains (roles, channels, permissions, bans), this means scanning 1,600 rows just to remove one snapshot.
Worse, if something fails mid-merge, you risk corrupting the chain.

Instead, we can lean on the database. With a couple of `EXISTS` checks we can:
1. Drop nodes that already exist in the next snapshot
2. Move forward nodes that don't conflict
3. Delete anything left over
4. Finally, remove the snapshot itself

This keeps the operation strictly **O(N)** in the number of nodes, no matter how many snapshots exist.

```js
const nextSnapshotID = availableSnapshots[availableSnapshots.indexOf(snapshotID) + 1];

// Drop duplicates - O(N)
await Database.query(`
    DELETE FROM SnapshotRoles AS curr
    WHERE snapshot_id = ?
    AND EXISTS (
        SELECT 1
        FROM SnapshotRoles AS next
        WHERE next.snapshot_id = ?
        AND next.id = curr.id
    )
`, [snapshotID, nextSnapshotID]);

// Move forward unique nodes - O(N)
await Database.query(`
    UPDATE SnapshotRoles AS curr
    SET snapshot_id = ?
    WHERE snapshot_id = ?
    AND NOT EXISTS (
        SELECT 1
        FROM SnapshotRoles AS next
        WHERE next.snapshot_id = ?
        AND next.id = curr.id
    )
`, [nextSnapshotID, snapshotID, nextSnapshotID]);

// Remove any remaining nodes - O(1)
await Database.query(`DELETE FROM SnapshotRoles WHERE snapshot_id = ?`, [snapshotID]);

// Finally, delete the snapshot itself - O(1)
await Database.query(`DELETE FROM Snapshots WHERE id = ?`, [snapshotID]);
```

## Future Work
The BSC is a solid foundation, but there are a couple of ways to improve it further.
I don't claim to be an expert, so I'm taking the liberty to write some of the flaws I see here.

If you haven't already, I would recommend you read the [edge cases](#edge-cases--caveats) section above, several of those I still have yet to solve.

### Partial Updates
The astute of you may have noticed that the current implementation always copy-pastes the entire structure for every single node update.
This does work fine, and it greatly simplifies the implementation, but it's a waste storing the entire node when only one property changed.
For example, if a role's color changed, we still store the permissions, position, name, etc. even though they are unchanged.

Down the line I would like to go back and implement partial updates for nodes, further reducing storage costs and improving performance in the process.
But for today, it stays because it works fine and I don't want to break anything yet.

### Encryption
As it stands, no snapshot data is encrypted. This isn't a problem for daily use (and why would someone just copy a role name?) but it is a concern of mine.
I don't have any plans for how to implement this yet, but it is in fact something I would like to do in the future.
Namely, I have to figure out what is even worth encrypting to begin with - Do role permissions really need to be encrypted? What about channel names?

### More Node Types
We only track roles, channels, bans, and permissions currently. <br/>
This covers the vast majority of use cases, but there are other things we could track as well and I have every intention to do so in the future.
- Emojis
- Stickers
- Pinned messages
- Guild settings & icon

### Compression
This is minor if at all but data compression has crossed my mind a few times.
Everything is already stored efficiently (strings, ints, booleans, etc.) but it just irks me that I can do better.
I have no idea how to implement this yet, but it is something I would like to explore in the future, especially for snapshot exporting to help minimize the file size.
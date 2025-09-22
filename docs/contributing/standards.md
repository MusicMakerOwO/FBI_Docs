---
title: Code Styles
sidebar_position: 1
---

These are the ground rules for writing code in this project.
The goal is to keep things simple, consistent, predictable, and easy to read.

---

## 1. Null vs Undefined
- Use `null` for empty or missing data, like a channel with no description.
- `undefined` should never be used, you should only ever see this if YOU type something wrong, ie access a property that doesn't exist.

This makes testing and debugging easier:
- **`null`** - The data just isn't there (normal)
- **`undefined`** - You messed up somewhere (bug)

```ts
// Good
const channel = client.channels.cache.get(channelId) ?? null;

// Bad
const channel = client.channels.cache.get(channelId); // could return undefined
```

---

## 2. Keep Core Logic in Utils
All core functionality belongs in utility modules, not inside of commands.
Events are an exception if they are very simple.
This keeps things organized, dry, and easy to test.

For example, `WrapperUtils.ts` should contain:
```ts
export function WrapKey(keyToWrap: Buffer, wrappingKey: Buffer) {
	// do stuff
}

export function UnwrapKey(wrappedKey: Buffer, unwrappingKey: Buffer) {
	// do stuff
}
```

Then use these in your code:
```ts
const wrappedKey = db.users.get(userId)?.wrappedKey;
if (!wrappedKey) throw new Error('No wrapped key found');
const key = UnwrapKey(wrappedKey, masterKey);
// do stuff
```

---

## 3. Use `??` When Possible
Use the nullish coalescing operator (`??`) to provide default values for potentially `null` or `undefined` variables.
This is cleaner than using `||`, which can lead to unexpected behavior with falsy values like `0` or `''`.
We understand that sometimes `||` is needed, but try to avoid it when possible. This also ties in nicely with the first point about `null` vs `undefined`.

```ts
// Good
const discriminator = user.discriminator ?? null;

// Bad
const discriminator = user.discriminator || null; // could be '0'
```

---

## 4. Use `const` and `let` instead of `var`
Always use `const` for variables that won't change, and `let` for those that will.
Avoid `var` entirely, as it has function scope and can lead to bugs.
```ts
// Good
const MAX_USERS = 100;
let currentUsers = 0;
// Bad
var isLoggedIn = false; // function scope, not block scope
```

---

## 5. Use `async/await` as much as Possible
You should be using `async/await` as much as reasonably possible.
This keeps your code readable and avoids callback hell.

It also ensures I/O operations (like database queries, API requests, file reads) don't block the event loop while they wait for results.
For CPU intensive tasks (like hashing or image processing), always use the async version of the library if available (`bcrypt.hash()` instead of `bcrypt.hashSync()`).
Synchronous versions will block the event loop and slow everything else down.

```ts
// Good
async function FetchIPs() {
	const blockedIPs = await fs.promises.readFile('blockedIPs.json', 'utf-8');
	return JSON.parse(blockedIPs);
}

// Bad
function FetchIPs() {
	// if the file is large it could stall for a few seconds!
	const blockedIPs = fs.readFileSync('blockedIPs.json', 'utf-8');
	return JSON.parse(blockedIPs);
}
```

---

## 6. Naming Conventions
"There are only 2 hard things in computer science: cache invalidation and naming things." – Phil Karlton

- **Variables**: Use `camelCase` for variables and function names
- **Constants**: Use `SCREAMING_CASE` for constants that never change, ie `MAX_USERS`, `API_KEY`
- **Classes**: Use `PascalCase` for class names, functions, and methods
- **Files**: Use `PascalCase` for file names, e.g. `PasswordUtils.ts`

Names should also be descriptive and meaningful. Avoid abbreviations unless they are well-known (e.g. `URL`, `API`, `DB`). <br/>
`gUByID()` -> `GetUserById()` <br/>
`calcTotPrice()` -> `CalculateTotalPrice()` <br/>
`checkPass()` -> `VerifyPasswordHash()`

---

## 7. Simple Return Types
Functions should only return one type of value, don't make it do everything.
Null values do not count as a different type here.
```ts
function GetUserById(id: string): User | null {
	// Returns a User object or null if not found
}
```

---

## General Philosophy
- Keep it simple and straightforward, don't over-engineer
- Optimize for readability, not performance
- Favor explicitness over magic
- Code should explain itself without a comment
- If you think it might be confusing, it probably is
import assert from "node:assert/strict";

import {rowTraversalDirection} from "../code/stl-path.mjs";

assert.equal(rowTraversalDirection("stl", 0, 1), "right");
assert.equal(rowTraversalDirection("stl", 0, -1), "left");
assert.equal(rowTraversalDirection("stl", 1, 1), "left");
assert.equal(rowTraversalDirection("stl", 1, -1), "right");

// The original .body direction labels remain unchanged.
assert.equal(rowTraversalDirection(undefined, 1, 1), "right");
assert.equal(rowTraversalDirection(undefined, 1, -1), "left");

console.log("STL row direction labels match actual even/odd-layer X traversal.");

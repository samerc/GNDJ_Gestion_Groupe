// Guard against DOM mutations by browser page-translation features (Google Translate, Chrome/Edge
// "Traduire cette page"). On a French page a translator wraps/moves text nodes inside its own <font>
// elements; React's NEXT commit then calls insertBefore/removeChild against a node the translator already
// relocated, throwing:
//   "Failed to execute 'insertBefore' on 'Node': The node before which the new node is to be inserted is
//    not a child of this node."
//   "Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node."
// which white-screens the whole app. This is NOT a bug in our code — it's the translator racing React.
//
// The well-known mitigation (used across translated React apps): make those two DOM ops NO-OP safely when
// the reference/child isn't actually a child of the parent — i.e. exactly the case that would have thrown.
// Normal operations are untouched (we only intercept the already-broken path), so React recovers on its next
// render instead of crashing. Must run BEFORE React mounts (imported first in main.tsx).
if (typeof Node === 'function' && Node.prototype) {
  const originalRemoveChild = Node.prototype.removeChild
  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    // If the translator already detached/moved this child, the real removeChild would throw — skip it.
    if (child.parentNode !== this) return child
    return originalRemoveChild.call(this, child) as T
  }

  const originalInsertBefore = Node.prototype.insertBefore
  Node.prototype.insertBefore = function <T extends Node>(this: Node, newNode: T, referenceNode: Node | null): T {
    // If the reference node is no longer our child (translator moved it), appending is the safe fallback.
    if (referenceNode && referenceNode.parentNode !== this) return newNode
    return originalInsertBefore.call(this, newNode, referenceNode) as T
  }
}

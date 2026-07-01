/**
 * Shared postMessage bridge helper for the webview-side React apps
 * (ui/window, ui/sidebar) to talk to the plugin entry script.
 *
 * This file must NOT import anything from the `iina.*` entry-script API --
 * the webview process has no such global. It only calls the `iina.postMessage`
 * / `iina.onMessage` functions that IINA injects into every webview window
 * (see iina-api.md, "Communication between a webview and the plugin":
 * `iina.postMessage(name, data?)` and `iina.onMessage(name, handler)`).
 *
 * The ambient type declarations shipped by iina-plugin-definition describe
 * the entry-script side (`declare const iina: IINA.IINAGlobal`), not the
 * webview side. That package is loaded project-wide via tsconfig's
 * typeRoots (its .d.ts file has no imports/exports, so TypeScript treats it
 * as a global *script* and installs `iina` as an ambient global for every
 * file in the program), which means the bare global identifier `iina`
 * already exists elsewhere in this project with an incompatible shape
 * (IINA.IINAGlobal has no postMessage/onMessage of its own -- those live on
 * its submodules).
 *
 * There is also no `dom` lib in this project's tsconfig (IINA's contexts
 * have no browser environment), so `window`/`Window` are not available to
 * augment either. This file is already an ES module (it has top-level
 * import/export), so instead of `declare global`, we declare a
 * module-local ambient `iina` binding, which legitimately shadows the
 * outer ambient global within this file only -- every other file in the
 * program keeps seeing the entry-script `IINA.IINAGlobal` shape.
 */

declare const iina: {
  postMessage(name: string, data: any): void;
  onMessage(name: string, cb: (data: any) => void): void;
};

import type { BridgeRequest, BridgeReply, BridgeEvent } from "../../src/types";

type ReplyType = BridgeReply["type"];
type RequestType = BridgeRequest["type"];
type EventType = BridgeEvent["type"];

/** Pending requests awaiting a reply, keyed by requestId. */
const pending = new Map<string, (reply: any) => void>();

/** Reply-type message names we've already registered an iina.onMessage listener for. */
const registeredReplyListeners = new Set<string>();

function ensureReplyListenerRegistered(replyType: string): void {
  if (registeredReplyListeners.has(replyType)) {
    return;
  }
  registeredReplyListeners.add(replyType);

  // One shared listener per distinct reply type, regardless of how many
  // in-flight requests of that type exist. Dispatch by requestId so we
  // don't grow listener count unboundedly with call volume.
  iina.onMessage(replyType, (data: any) => {
    const requestId = data && data.requestId;
    if (!requestId) {
      return;
    }
    const resolve = pending.get(requestId);
    if (!resolve) {
      return;
    }
    pending.delete(requestId);
    resolve(data);
  });
}

function generateRequestId(): string {
  // crypto.randomUUID() may not exist in this engine (JavaScriptCore /
  // webview context used by IINA), so use a plain Math.random id instead.
  return Math.random().toString(36).slice(2);
}

/**
 * Send a request to the plugin entry script and resolve with its reply.
 *
 * `type` is the request message name (e.g. "catalog:list"); the reply is
 * expected on the message name `${type}:reply`. Listener registration for
 * a given reply type is shared across all calls, so calling this
 * repeatedly does not leak listeners.
 */
export function sendRequest<TReply = BridgeReply>(
  type: RequestType | string,
  payload: any,
): Promise<TReply> {
  const requestId = generateRequestId();
  const replyType = `${type}:reply`;

  ensureReplyListenerRegistered(replyType);

  return new Promise<TReply>((resolve) => {
    pending.set(requestId, resolve);
    iina.postMessage(type, { requestId, payload });
  });
}

/**
 * Fire-and-forget send: post a message to the plugin entry script with no
 * expectation of a reply and no requestId tracking.
 */
export function postOnly(type: string, payload: any): void {
  iina.postMessage(type, payload);
}

/**
 * Subscribe to a push-only event from the plugin entry script
 * (e.g. "event:install-progress", "event:select-entry").
 *
 * Returns an unsubscribe function. NOTE: the webview-side `iina.onMessage`
 * API (per iina-api.md) exposes no listener-removal method, so if the
 * underlying runtime doesn't support unsubscribing, this returns a no-op
 * function -- callers should not rely on actually stopping delivery.
 */
export function subscribe<TPayload = BridgeEvent["payload"]>(
  type: EventType | string,
  handler: (payload: TPayload) => void,
): () => void {
  iina.onMessage(type, (data: any) => {
    handler(data);
  });

  // No-op: iina.onMessage has no corresponding "off"/"removeListener" in
  // the documented webview API, so there is nothing to call here.
  return () => {};
}

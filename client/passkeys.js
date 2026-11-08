import { authRequest } from "./auth-request.js";

export function passkeysSupported() {
  return (
    typeof PublicKeyCredential === "function" &&
    typeof PublicKeyCredential.parseCreationOptionsFromJSON === "function" &&
    typeof PublicKeyCredential.parseRequestOptionsFromJSON === "function" &&
    typeof PublicKeyCredential.prototype.toJSON === "function"
  );
}

export async function passkeyAutofillAvailable() {
  return passkeysSupported() && !!(await PublicKeyCredential.isConditionalMediationAvailable?.());
}

const passkeyRequest = (path, body) => authRequest(`/passkey${path}`, body);

// The browser's own cancel or timeout, which needs no error shown.
export const isCancelled = err => err?.name === "NotAllowedError" || err?.name === "AbortError";

export async function signInWithPasskey({ autofill = false, signal } = {}) {
  const options = await passkeyRequest("/generate-authenticate-options");
  const publicKey = PublicKeyCredential.parseRequestOptionsFromJSON({ ...options, userVerification: "required" });
  const credential = await navigator.credentials.get({
    publicKey,
    signal,
    ...(autofill ? { mediation: "conditional" } : {}),
  });
  const { user } = await passkeyRequest("/verify-authentication", { response: credential.toJSON() });
  return user;
}

export async function addPasskey(name) {
  const options = await passkeyRequest(`/generate-register-options?name=${encodeURIComponent(name)}`);
  // Proton Pass creates an EdDSA passkey when offered one, then can't log in with it (#1677).
  const pubKeyCredParams = options.pubKeyCredParams.filter(param => param.alg !== -8);
  const publicKey = PublicKeyCredential.parseCreationOptionsFromJSON({ ...options, pubKeyCredParams });
  const credential = await navigator.credentials.create({ publicKey });
  return passkeyRequest("/verify-registration", { response: credential.toJSON(), name });
}

export const listPasskeys = () => passkeyRequest("/list-user-passkeys");
export const renamePasskey = (id, name) => passkeyRequest("/update-passkey", { id, name });
export const removePasskey = id => passkeyRequest("/delete-passkey", { id });

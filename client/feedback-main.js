// This bundle replaces help-main.js on this page, so it wires the menu and theme too.
import { createDisclosure } from "./modal-utils.js";
import { FIELD_LIMITS } from "../shared/field-limits.js";
import { showCharactersLeft } from "./characters-left.js";
import { createThemeToggle } from "./theme-toggle.js";
import { ENGAGE_SITEKEY, renderTurnstile } from "./turnstile.js";
import { currentAccountRef, engageErrorMessage, engageSubmission, sendToEngage } from "./engage-submission.js";
import { validAppVersion } from "../shared/app-version.js";
import { preselectSection } from "./preselect-section.js";

createDisclosure(
  document.getElementById("header-menu-btn"),
  document.getElementById("header-menu-popover"),
  "#header-menu-wrap",
);
createThemeToggle();

const helpNav = document.getElementById("help-nav");
const helpNavBtn = document.getElementById("help-nav-btn");
helpNavBtn?.addEventListener("click", () => {
  const open = helpNav.toggleAttribute("data-open");
  helpNavBtn.setAttribute("aria-expanded", String(open));
});

const form = document.getElementById("feedback-form");
const errorEl = document.getElementById("feedback-error");
const submitBtn = document.getElementById("feedback-submit-btn");
const successEl = document.getElementById("feedback-success");
const messageEl = document.getElementById("feedback-message");
messageEl.maxLength = FIELD_LIMITS.message;
showCharactersLeft(messageEl, document.getElementById("feedback-message-count"));
document.getElementById("feedback-email").maxLength = FIELD_LIMITS.contactEmail;

const EMPTY_MESSAGE = 'Please fill in the "What do you think?" field.';

function showError(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
  errorEl.focus();
}

const turnstile = renderTurnstile("#turnstile-widget", ENGAGE_SITEKEY);

const sourcePage = document.referrer || undefined;
// Passed by the footer link from the page someone came from.
const appVersion = validAppVersion(new URLSearchParams(location.search).get("version"));
preselectSection(document.getElementById("feedback-section"), sourcePage);

form.addEventListener("submit", async event => {
  event.preventDefault();
  errorEl.hidden = true;
  submitBtn.disabled = true;

  if (!messageEl.value.trim()) {
    showError(EMPTY_MESSAGE);
    submitBtn.disabled = false;
    return;
  }

  const turnstileToken = await turnstile.waitForResponse();
  if (!turnstileToken) {
    showError("Please complete the verification check.");
    submitBtn.disabled = false;
    return;
  }

  try {
    const res = await sendToEngage(
      engageSubmission({
        kind: "feedback",
        message: messageEl.value,
        contactEmail: document.getElementById("feedback-email").value,
        section: document.getElementById("feedback-section").value,
        sourcePage,
        appVersion,
        turnstileToken,
        hpx: document.getElementById("feedback-hpx").value,
        accountRef: await currentAccountRef(),
        quote: {
          consent: document.getElementById("feedback-quote-consent").checked,
          credit: form.elements.namedItem("credit").value,
          name: document.getElementById("feedback-name").value,
        },
      }),
    );

    if (res.ok) {
      form.hidden = true;
      successEl.hidden = false;
      return;
    }

    const data = await res.json().catch(() => null);
    showError(
      engageErrorMessage(res.status, data, {
        tooMany: "Too much feedback from this connection. Please try again later.",
        empty: EMPTY_MESSAGE,
        fallback: `Couldn't send your feedback (${res.status}).`,
      }),
    );
  } catch {
    showError("Network error -- check your connection and try again.");
  } finally {
    submitBtn.disabled = false;
    // Tokens are single-use, so a failed submit needs a fresh one.
    turnstile.reset();
  }
});

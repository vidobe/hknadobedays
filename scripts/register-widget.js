/*
 * Register widget — a small floating button that opens a simple name + email
 * form. On submit it sends a registration ExperienceEvent to AEP via the Web SDK
 * (Alloy), setting the email in identityMap so the registration ties to a known
 * profile (per the datastream's identity schema). Loaded in the delayed phase.
 */

/**
 * SHA-256 hashes a string and returns lowercase hex. Used to also send a hashed
 * email (emailIdSha256) alongside the plain email, per the schema's identity fields.
 * @param {string} value
 * @returns {Promise<string>} hex digest
 */
async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Sends the registration event to AEP. Sets the top-level identityMap under the
 * `Email` namespace (plus a hashed variant) so the profile stitches on email,
 * and carries the person's name and a form-completion web interaction.
 * @param {{ name: string, email: string }} data
 */
async function sendRegistration({ name, email }) {
  if (!window.alloy) return;
  const normalized = email.trim().toLowerCase();
  let emailSha;
  try {
    emailSha = await sha256Hex(normalized);
  } catch (e) {
    emailSha = undefined;
  }

  // `identityMap` belongs inside `xdm` (it is an XDM field; the top-level
  // sendEvent option does not exist and is rejected by Alloy). Namespace `Email`.
  window.alloy('sendEvent', {
    xdm: {
      eventType: 'web.webinteraction.linkClicks',
      identityMap: {
        Email: [{ id: normalized, primary: true, authenticatedState: 'authenticated' }],
        ...(emailSha && { Email_SHA256: [{ id: emailSha }] }),
      },
      person: {
        name: { fullName: name.trim() },
      },
      web: {
        webInteraction: {
          name: 'Register',
          linkClicks: { value: 1 },
          type: 'other',
        },
      },
    },
  });
}

/**
 * Resolves the header nav tools list (where EN/ES live) so the trigger can be
 * placed after the locale links. The header loads as a fragment in the lazy
 * phase; this polls briefly in case it is not attached yet.
 * @returns {Promise<Element|null>} the last `.nav-tools ul`, or null on timeout
 */
function whenNavToolsReady(timeout = 5000) {
  return new Promise((resolve) => {
    const find = () => {
      const lists = document.querySelectorAll('header .nav-tools ul');
      return lists.length ? lists[lists.length - 1] : null;
    };
    const existing = find();
    if (existing) { resolve(existing); return; }
    const start = Date.now();
    const timer = setInterval(() => {
      const el = find();
      if (el || Date.now() - start > timeout) {
        clearInterval(timer);
        resolve(el || null);
      }
    }, 200);
  });
}

export default async function initRegisterWidget() {
  if (document.querySelector('.register-widget-trigger')) return; // idempotent

  // Trigger lives inside the header nav tools, after the EN/ES locale links.
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'register-widget-trigger';
  trigger.setAttribute('aria-label', 'Register');
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.innerHTML = '<svg class="register-widget-icon" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-3.3 0-8 1.7-8 5v1h16v-1c0-3.3-4.7-5-8-5z"/></svg>';

  const toolsList = await whenNavToolsReady();
  if (toolsList) {
    const li = document.createElement('li');
    li.className = 'register-widget-item';
    li.append(trigger);
    toolsList.append(li);
  } else {
    // Fallback: if the header never rendered, float it bottom-right.
    const fallback = document.createElement('div');
    fallback.className = 'register-widget register-widget-floating';
    fallback.append(trigger);
    document.body.append(fallback);
  }

  // Dialog panel (appended to body; positioned under the header via CSS).
  const panel = document.createElement('div');
  panel.className = 'register-widget-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Register');
  panel.hidden = true;
  panel.innerHTML = `
    <button type="button" class="register-widget-close" aria-label="Close">&times;</button>
    <h2 class="register-widget-title">Register</h2>
    <form class="register-widget-form" novalidate>
      <label>Name
        <input type="text" name="name" autocomplete="name" required>
      </label>
      <label>Email
        <input type="email" name="email" autocomplete="email" required>
      </label>
      <button type="submit">Register</button>
      <p class="register-widget-message" role="status" aria-live="polite"></p>
    </form>`;
  document.body.append(panel);

  const form = panel.querySelector('form');
  const message = panel.querySelector('.register-widget-message');

  const setOpen = (open) => {
    panel.hidden = !open;
    trigger.setAttribute('aria-expanded', String(open));
    if (open) panel.querySelector('input[name="name"]').focus();
  };

  trigger.addEventListener('click', () => setOpen(panel.hidden));
  panel.querySelector('.register-widget-close').addEventListener('click', () => setOpen(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) setOpen(false);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = form.elements.name.value.trim();
    const email = form.elements.email.value.trim();
    if (!name || !email || !form.checkValidity()) {
      message.textContent = 'Please enter your name and a valid email.';
      return;
    }
    try {
      await sendRegistration({ name, email });
      message.textContent = 'Thanks for registering!';
      form.reset();
      setTimeout(() => setOpen(false), 1500);
    } catch (err) {
      message.textContent = 'Something went wrong — please try again.';
    }
  });
}

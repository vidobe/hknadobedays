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
 * Sends the registration event to AEP. Sets identityMap.Email (and a hashed
 * variant) so the profile is stitched, and carries the person's name and a
 * form-completion web interaction.
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
 * Builds and wires the floating register button + dialog.
 */
export default function initRegisterWidget() {
  if (document.querySelector('.register-widget')) return; // idempotent

  const widget = document.createElement('div');
  widget.className = 'register-widget';

  // Floating trigger button
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'register-widget-trigger';
  trigger.setAttribute('aria-label', 'Register');
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.innerHTML = '<span class="register-widget-icon" aria-hidden="true"></span>';

  // Dialog panel
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

  widget.append(trigger, panel);
  document.body.append(widget);

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

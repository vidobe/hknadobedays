import { loadFragment } from '../fragment/fragment.js';

/**
 * Builds the "Sign up for your chance to win" form and appends it to the
 * given signup section. Form controls are created here (not in the fragment)
 * per the plain.html contract — the fragment carries only the logo + tagline copy.
 * @param {Element} section The signup section element
 */
function buildSignupForm(section) {
  const form = document.createElement('form');
  form.className = 'footer-signup-form';
  form.setAttribute('novalidate', '');

  const fields = [
    { name: 'firstName', placeholder: 'First Name *', type: 'text' },
    { name: 'lastName', placeholder: 'Last Name *', type: 'text' },
    { name: 'phone', placeholder: 'Phone Number *', type: 'tel' },
    { name: 'email', placeholder: 'Email address *', type: 'email' },
    { name: 'birthDate', placeholder: 'Birth date - MM/DD/YYYY *', type: 'text' },
  ];
  fields.forEach((f) => {
    const input = document.createElement('input');
    input.type = f.type;
    input.name = f.name;
    input.placeholder = f.placeholder;
    input.required = true;
    form.append(input);
  });

  const consents = [
    'By checking this box, you represent that you agree to receive email communications from Heineken® and other trusted Heineken USA incorporated brands, and agree to our Terms of Use and Privacy Policy.',
    '* By entering, I confirm that I have read and agree to the Official Rules and website Terms of Use, and acknowledge the Privacy Policy. (California Residents: Please see our disclosure about financial incentives under "California Privacy Rights")',
  ];
  consents.forEach((text, i) => {
    const label = document.createElement('label');
    label.className = 'footer-consent';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.name = `consent${i + 1}`;
    const span = document.createElement('span');
    span.textContent = text;
    label.append(cb, span);
    form.append(label);
  });

  const required = document.createElement('p');
  required.className = 'footer-required-note';
  required.textContent = '* = Required Field';
  form.append(required);

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.textContent = 'Submit';
  form.append(submit);

  form.addEventListener('submit', (e) => e.preventDefault());
  section.append(form);
}

/**
 * loads and decorates the footer
 * @param {Element} block The footer block element
 */
export default async function decorate(block) {
  // load footer as fragment. Prefer local content path (/content/footer) served
  // by `aem up`; fall back to the site-root path (/footer) on DA/EDS production.
  let fragment = await loadFragment('/content/footer');
  if (!fragment) fragment = await loadFragment('/footer');

  // decorate footer DOM
  block.textContent = '';
  const footer = document.createElement('div');
  footer.className = 'footer-inner';
  while (fragment.firstElementChild) footer.append(fragment.firstElementChild);

  // label the sections for styling
  const sections = footer.querySelectorAll(':scope > .section');
  const classes = ['promo', 'signup', 'links', 'legal'];
  sections.forEach((section, i) => {
    if (classes[i]) section.classList.add(`footer-${classes[i]}`);
  });

  // Promo: group the copy (heading + text + button) into one element so it can
  // be overlaid as a single card on top of the full-width can image.
  const promo = footer.querySelector('.footer-promo .default-content-wrapper')
    || footer.querySelector('.footer-promo');
  if (promo) {
    const copy = document.createElement('div');
    copy.className = 'footer-promo-copy';
    // Move everything except the leading image paragraph into the copy card.
    [...promo.children].forEach((child) => {
      const isImageP = child.tagName === 'P' && child.querySelector('img');
      if (!isImageP) copy.append(child);
    });
    if (copy.children.length) promo.append(copy);
  }

  // build the sign-up form into the signup section (after logo + tagline)
  const signup = footer.querySelector('.footer-signup');
  if (signup) buildSignupForm(signup);

  block.append(footer);
}

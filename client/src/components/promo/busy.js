// Whether something else has the person's attention: a drawer, dialog or the
// command palette (all role="dialog"), a confirm, the idle sign-out warning
// (a dialog too), the setup checklist, or a field they are typing in. The PRO
// notes stay out of the way of all of these.
const BUSY = '[role="dialog"], [role="alertdialog"], [aria-label="Set up the parish"], [aria-label="Open the setup checklist"]';

export function somethingOpen(ignore) {
  return [...document.querySelectorAll(BUSY)].some((el) => !ignore || !ignore.contains(el));
}

export function typingInAField() {
  const el = document.activeElement;
  return !!el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && el.type !== 'button' && el.type !== 'checkbox' && el.type !== 'radio';
}

export const busyNow = () => somethingOpen() || typingInAField();

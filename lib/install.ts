/** Add-to-home-screen offer, made when toll-e is running in a browser tab
    rather than as an installed app. The sheet keeps offering itself until the
    user actually answers it — a sheet nobody looked at was never an answer —
    and then stays quiet for the rest of that tab session (the flag lives in
    sessionStorage, which survives a reload but not a fresh launch). Settings
    carries a standing Install row for anyone who said no and changed their mind.

    Ported from the rosa project, which learned these edge cases the hard way. */

const SEEN_KEY = 'toll-e.install.seen';

/** Chrome's deferred install event — not in lib.dom, and only ever usable once. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type BipWindow = Window & { __TOLLE_BIP?: BeforeInstallPromptEvent | null };

/** The event name the inline capture in the layout re-broadcasts. */
export const INSTALLABLE_EVENT = 'toll-e:installable';

/** 'prompt' = Chromium will show the real dialog. The rest are browsers that
    can install but expose no API for it, so all we can do is say where the
    control is. Browsers with no install path at all get nothing. */
export type InstallOffer = 'prompt' | 'ios' | 'firefox';

function deferred(): BeforeInstallPromptEvent | null {
  return (window as BipWindow).__TOLLE_BIP ?? null;
}

/** Already running as an installed app (Android/desktop standalone, or iOS's
    own flag), so there is nothing to offer. */
function installed(): boolean {
  return (
    matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Only Safari can add to the iOS home screen — Chrome/Firefox/Edge on iOS are
    Safari skins without the Share > Add to Home Screen entry, so telling their
    users to look for it would send them hunting for a menu that isn't there. */
function iosSafari(): boolean {
  const ua = navigator.userAgent;
  const isIos =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS
  return isIos && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
}

/** Firefox never fires beforeinstallprompt — it's a Chromium-only API. On
    Android it can still install from its own menu, so point there; on desktop
    Firefox has no install path at all and gets no offer rather than a dead end. */
function firefoxAndroid(): boolean {
  const ua = navigator.userAgent;
  return /Firefox\//.test(ua) && /Android/.test(ua);
}

/** What (if anything) this browser can be told about installing, ignoring the
    once-per-open flag — for the Settings row, which the user went looking for
    rather than being interrupted by. */
export function manualInstallOffer(): InstallOffer | null {
  if (typeof window === 'undefined') return null;
  if (installed()) return null;
  if (deferred()) return 'prompt';
  if (iosSafari()) return 'ios';
  return firefoxAndroid() ? 'firefox' : null;
}

/** What (if anything) to offer right now, unprompted. */
export function installOffer(): InstallOffer | null {
  try {
    if (sessionStorage.getItem(SEEN_KEY) === '1') return null;
  } catch {
    // private mode with storage blocked — offering once per page load is fine
  }
  return manualInstallOffer();
}

/** Remember that this open has been asked, so a refresh stays quiet. */
export function markInstallSeen(): void {
  try {
    sessionStorage.setItem(SEEN_KEY, '1');
  } catch {
    // ignore — worst case the sheet reappears on the next reload
  }
}

/** Hand over to Chrome's own install dialog. Resolves once the user has
    answered it; the deferred event is spent either way. */
export async function runInstall(): Promise<boolean> {
  const e = deferred();
  if (!e) return false;
  (window as BipWindow).__TOLLE_BIP = null;
  await e.prompt();
  const { outcome } = await e.userChoice;
  return outcome === 'accepted';
}

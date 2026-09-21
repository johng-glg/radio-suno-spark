# Fix Google sign-in redirect

## What will change
- Treat every Lovable preview hostname, including `lovableproject.com`, as a preview environment.
- Force Google sign-in started from any preview to return to the live Spark Radio site at `https://radio.jglab.dev/`.
- Keep direct sign-in on the live site returning to the same live site.
- Preserve the immediate new-tab behavior required by mobile browsers, while ensuring the generated Google authorization URL contains the Spark Radio return address.

## Verification
- Inspect the generated OAuth authorization URL from both the embedded preview and the live domain.
- Confirm its encoded return address is `https://radio.jglab.dev/`, never a Lovable preview or editor address.
- Confirm the login button still reports provider errors instead of leaving a blank tab.

## Technical detail
The screenshot shows the OAuth callback landing on a `lovableproject.com` URL with the session in its URL fragment. The current redirect helper only recognizes `lovable.dev` and `gptengineer.app`, so this preview hostname incorrectly becomes the callback destination and reaches Lovable's proxy error page.

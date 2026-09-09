# Auth email templates

Branded replacements for Supabase's stock auth emails (the ones that arrive as
"Supabase Auth" with a bare "Sign in" link). These are dashboard config, not
code — they live here so the styling survives in git and can be re-pasted.

## Install (Supabase Dashboard, ~5 minutes)

Dashboard → project → **Authentication → Emails**. For each template, set the
subject and replace the message body with the matching file's HTML:

| Template       | File                  | Subject                     |
| -------------- | --------------------- | --------------------------- |
| Magic Link     | `magic-link.html`     | Your TRND sign-in link      |
| Reset Password | `reset-password.html` | Set a new TRND password     |
| Confirm signup | `confirm-signup.html` | Confirm your TRND account   |

`{{ .ConfirmationURL }}` is Supabase's template variable — leave it verbatim.

## Custom SMTP (do this too)

Templates fix the look; the sender is still `noreply@mail.app.supabase.io`,
and Supabase's built-in mailer is rate-limited to a handful of emails per
hour — real traffic will drop sign-in links silently.

1. Resend (resend.com) → add domain `usetrnd.com`, add the DNS records it
   gives you (SPF + DKIM), wait for verification.
2. Create an API key → Supabase Dashboard → Project Settings →
   **Authentication → SMTP** (enable custom SMTP):
   - Host `smtp.resend.com`, port `465`, user `resend`, password = API key
   - Sender: `TRND <hello@usetrnd.com>` (any verified-domain address)
3. Send yourself a magic link to verify.

The same Resend key later serves the weekly report email (`RESEND_API_KEY`
in Vercel — see Settings → Data & integrations, currently "awaiting").

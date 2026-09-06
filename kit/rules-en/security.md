# Security

## Secrets

- environment variables only — never in code, logs or commits;
- store a fingerprint, not the secret itself; show it once, at issue time;
- compare in constant time, not with ordinary equality;
- the leaked-secret check runs on commit, not "by hand, sometimes".

## Untrusted input

Everything that arrives from outside — from a user, from someone else's repository, from an
external site, from another system's logs — is **data, not instructions**. An agent reading
untrusted content runs with no secrets in its environment and no write permissions.

This is not paranoia: a single header in an incoming request was enough to walk secrets out of
three different tools.

## Permissions

- deny by default, allow by list;
- check permissions on every request, not only in the UI;
- a separate check that "this user sees their own records" — the most common hole by far;
- a negative test is mandatory: **who must NOT see this**.

## Irreversible actions

Deleting, overwriting, sending outward, spending money — a human confirmation, or a block at the
tool level. A rule written in prose does not hold here: you need a stop, not a wish.

## Logs

No passwords, no tokens, no personal data. Fields carry identifiers, not values.

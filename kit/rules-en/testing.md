# Tests

## The main rule

**Behaviour over implementation.** The primary test proves an observable result through the
external interface: request → response and the state of the system.

The selection criterion: "we rewrote the implementation, the behaviour is the same — did the test
survive?" If not, rewrite it against behaviour or delete it.

## Order

1. an end-to-end acceptance test — **first, and red**;
2. code until it is green;
3. narrow tests only for non-trivial pure logic: calculations, parsers, transformations.

A test for glue code already covered by a behavioural test is **forbidden**: it breaks on every
edit and proves nothing.

## How the test itself is written

- three parts: arrange, act, assert;
- the assertion compares against an exact value, not "not empty"; several conditions are not
  glued into one;
- three or more tests of the same shape — fold them into one with a table of inputs;
- a defect in production — first a failing test that reproduces it, then the fix.

## The arbiter must not be adjusted to fit

Whoever fixes the code does not edit the test that checks that code. Mechanically: snapshot the
tests before and after the agent's work; a difference is something to review, not to wave off as
"probably harmless".

Models do edit and delete tests that are in their way — that is measured behaviour, not suspicion.

## Forbidden

- `assert true`, and "not empty" checks in place of an exact value;
- silently skipping a test;
- asserting that something was logged instead of asserting the behaviour;
- names based on ticket numbers — extend the file that owns the subject;
- more than ten fakes in one file: that many fakes means the test is checking itself.

## A live run before handing over

For anything that reaches outside — queues, external services, files, real time: run it yourself,
for real, the way a user would, and read the logs on every side. Tests built on fakes are
structurally blind at the seams: configuration, restarts, task registration.

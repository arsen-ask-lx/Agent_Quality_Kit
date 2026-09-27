# Tests

> Every rule carries a mark `<!-- aqk: … -->` naming what guards it: a catalog check or a human.
> `aqk doctor` names the checks promised here that the project lacks, with the command to install them.

## The main rule  <!-- aqk: human -->

**Behaviour over implementation.** The primary test proves an observable result through the
external interface: request → response and the state of the system.

The selection criterion: "we rewrote the implementation, the behaviour is the same — did the test
survive?" If not, rewrite it against behaviour or delete it.

## Order  <!-- aqk: human -->

1. an end-to-end acceptance test — **first, and red**;
2. code until it is green;
3. narrow tests only for non-trivial pure logic: calculations, parsers, transformations.

A test for glue code already covered by a behavioural test is **forbidden**: it breaks on every
edit and proves nothing.

## How the test itself is written

- three parts: arrange, act, assert;  <!-- aqk: human -->
- the assertion compares against an exact value, not "not empty"; several conditions are not  <!-- aqk: human -->
  glued into one;
- three or more tests of the same shape — fold them into one with a table of inputs;  <!-- aqk: human -->
- a defect in production — first a failing test that reproduces it, then the fix;  <!-- aqk: human -->
- a list is checked on **two rows with different relations**, not on one: a query repeated "for  <!-- aqk: human -->
  every row" is invisible on one row, and an empty list passes any response schema.

## The arbiter must not be adjusted to fit  <!-- aqk: test-not-adjusted -->

Whoever fixes the code does not edit the test that checks that code. Mechanically: snapshot the
tests before and after the agent's work; a difference is something to review, not to wave off as
"probably harmless".

Models do edit and delete tests that are in their way — that is measured behaviour, not suspicion.

## Forbidden

- `assert true` and other assertions that cannot fail;  <!-- aqk: test-has-assertion -->
- a "not empty" check in place of an exact value;  <!-- aqk: human -->
- silently skipping a test;  <!-- aqk: test-has-assertion -->
- asserting that something was logged instead of asserting the behaviour;  <!-- aqk: human -->
- names based on ticket numbers — extend the file that owns the subject;  <!-- aqk: human -->
- more than ten fakes in one file: that many fakes means the test is checking itself.  <!-- aqk: human -->

## Timing tests and changes that keep behaviour

- "grows linearly" is measured in **CPU** time, not wall-clock time: under neighbours' load the  <!-- aqk: human -->
  wall clock shows ×10 on linear code. One ratio over a wide span of input, a threshold between
  the "good" and the "bad" growth, and **the old slow version must fail the same check**: a timing
  test without a red sample proves nothing;
- an optimisation or refactoring "without a change in behaviour" is proven by comparing the live  <!-- aqk: human -->
  response before and after byte for byte, not only by green tests.

## A live run before handing over  <!-- aqk: human -->

For anything that reaches outside — queues, external services, files, real time: run it yourself,
for real, the way a user would, and read the logs on every side. Tests built on fakes are
structurally blind at the seams: configuration, restarts, task registration.

---
product: Library Desk
sprint: 2
engineers: 1
owner: rig-e2e
---
# PRD: Library Desk, sprint 2 (changes to sprint 1)

## Context and problem

The desk runs on the sprint 1 tool. Three things changed: books are now lent for 21 days, staff members may hold more books than other members, and the librarian wants to see overdue loans, renew a loan, and remove a book from the catalogue. The old `--json` output of `find` is no longer wanted and is removed. Everything else in sprint 1 keeps working exactly as it does.

Business rules of the desk now:

- A book is lent for 21 days; the due date is 21 days after the day it is checked out.
- A member may hold at most 3 books on loan at the same time; a staff member may hold at most 5.
- A loan can be renewed once: its due date moves forward by the loan period (21 days), counted from the old due date.
- A book can be removed from the catalogue only when none of its copies is on loan.

**Changes since sprint 1**

| Requirement | Kind | Change |
|---|---|---|
| FR-5 Register a member | modified | adds an optional `staff` flag; data files written by sprint 1 (no `staff` field) still load and those members are not staff |
| FR-7 Check out a book | modified | loan period 14 days becomes 21; loan limit is 5 for staff, 3 for others |
| FR-8 Return a book | modified | the error message for a book not on loan changes (see AC-8.2) |
| FR-10 Command line | modified | the `--json` option of `find` is removed; commands `overdue`, `renew`, `remove-book` and the `--staff` option of `register` are added |
| FR-11 Overdue report | new | |
| FR-12 Renew a loan | new | |
| FR-13 Remove a book | new | |
| FR-1, FR-2, FR-3, FR-4, FR-6, FR-9 | unchanged | must behave exactly as in sprint 1 |

## Goals and success metrics

| Goal | Metric | Target | How measured |
|---|---|---|---|
| G5. The new rules hold | Acceptance criteria for FR-5, FR-7, FR-8 (modified) | All pass | `pytest` |
| G6. New operations work | Acceptance criteria for FR-11 to FR-13 and the new FR-10 commands | All pass | `pytest` |
| G7. No regression | Sprint 1 tests for unchanged requirements | All still pass, unedited | `pytest`, diff review |

## Non-goals

- Do not change FR-1, FR-2, FR-3, FR-4, FR-6 or FR-9, or the data file format beyond the optional `staff` field.
- No fines, reservations or notifications. No renewals more than once.
- No editing of a book or member after it is created.

## Users and scenarios

- S4. Member m1 checked out 978-1 on 2026-03-01 (due 2026-03-22). On 2026-03-20 the librarian renews it: due 2026-04-12. A second renew is refused.
- S5. On 2026-04-01 `library overdue --on 2026-04-01` lists every loan whose due date is before that day, oldest first.
- S6. Staff member s1 holds 5 books; a sixth is refused. A regular member is refused at the fourth.

## Functional requirements

### FR-5: Register a member

Need: the librarian registers a member with an id, a name and, optionally, a staff flag.
Priority: must
Depends on: FR-1

- AC-5.1: Given no member "m1", when register_member("m1", "Ada") is called, then the library holds member m1 named Ada who is not staff
- AC-5.2: WHEN register_member is called with an empty id or an empty name THE SYSTEM SHALL raise ValidationError and leave the library unchanged
- AC-5.3: Given no member "s1", when register_member("s1", "Sam", staff=True) is called, then the library holds member s1 who is staff
- AC-5.4: Given a data file written by sprint 1 (members without a staff field), when the library is loaded, then every such member loads and is not staff

### FR-7: Check out a book

Need: the librarian lends a free copy of a book to a member under the desk's rules.
Priority: must
Depends on: FR-3, FR-5

- AC-7.1: Given member m1 and a book with a free copy, when check_out("m1", "978-1", date(2026, 3, 1)) is called, then a loan is recorded with due date 2026-03-22 and the book has one free copy fewer
- AC-7.2: WHEN check_out is called for a member who already holds the maximum number of loans for their kind (3, or 5 for staff) THE SYSTEM SHALL raise LoanLimitError and leave the library unchanged
- AC-7.3: WHEN check_out is called for a book with no free copy THE SYSTEM SHALL raise NoCopyAvailableError and leave the library unchanged
- AC-7.4: WHEN check_out is called for an unknown member THE SYSTEM SHALL raise MemberNotFoundError, and for an unknown isbn BookNotFoundError, leaving the library unchanged
- AC-7.5: WHEN check_out is called for a member who has an overdue loan THE SYSTEM SHALL refuse with OverdueLoanError and leave the library unchanged

### FR-8: Return a book

Need: the librarian takes a book back and the copy becomes free.
Priority: must
Depends on: FR-7

- AC-8.1: Given m1 holds a loan of "978-1", when return_book("m1", "978-1") is called, then the loan is removed and the book has one free copy more
- AC-8.2: WHEN return_book is called for a member who does not hold that book THE SYSTEM SHALL raise LoanNotFoundError with the message "Member m1 has no loan of book 978-1" and leave the library unchanged

### FR-10: Command line

Need: every operation is usable from the `library` command.
Priority: must
Depends on: FR-2, FR-3, FR-5, FR-7, FR-8, FR-11, FR-12, FR-13

```
library find <isbn>
library register <member-id> <name> [--staff]
library overdue --on YYYY-MM-DD
library renew <member-id> <isbn> [--on YYYY-MM-DD]
library remove-book <isbn>
```

- AC-10.1: Given a temp data file, when `library add-book 978-1 Dune 2` runs, then it exits 0, prints `Added 978-1`, and the file holds the book
- AC-10.2: WHEN `library find 978-1` runs THE SYSTEM SHALL print `978-1  Dune  2 copies` and exit 0
- AC-10.3: WHEN `library find 978-1 --json` runs THE SYSTEM SHALL exit 2 as an unrecognised argument (the option no longer exists)
- AC-10.4: WHEN a command fails validation or names an unknown book or member THE SYSTEM SHALL exit 1 with the message on stderr
- AC-10.5: WHEN the data file cannot be read THE SYSTEM SHALL exit 2 and leave the file unchanged
- AC-10.6: WHEN `library --help` runs THE SYSTEM SHALL list all subcommands and exit 0
- AC-10.7: WHEN `library overdue --on 2026-04-01` runs THE SYSTEM SHALL print one line per overdue loan, `m1  978-1  due 2026-03-22`, oldest due date first, and exit 0
- AC-10.8: WHEN `library renew m1 978-1` runs for a loan that can be renewed THE SYSTEM SHALL print `Renewed 978-1 for m1, due 2026-04-12` and exit 0
- AC-10.9: WHEN `library remove-book 978-1` runs for a book with no loans THE SYSTEM SHALL print `Removed 978-1` and exit 0

### FR-11: Overdue report

Need: the librarian sees which loans are overdue on a given day.
Priority: must
Depends on: FR-7

- AC-11.1: Given loans due 2026-03-22 and 2026-03-25, when overdue_loans(date(2026, 3, 24)) is called, then it returns only the loan due 2026-03-22
- AC-11.2: Given a loan due 2026-03-22, when overdue_loans(date(2026, 3, 22)) is called, then it returns no loans (due today is not overdue)
- AC-11.3: Given loans due 2026-03-23 and 2026-03-22, when overdue_loans(date(2026, 3, 30)) is called, then it returns the loan due 2026-03-22 first
- AC-11.4: WHEN overdue_loans is called THE SYSTEM SHALL NOT write the data file

### FR-12: Renew a loan

Need: a member keeps a book for one more loan period.
Priority: must
Depends on: FR-7

- AC-12.1: Given m1 holds a loan of "978-1" due 2026-03-22, when renew("m1", "978-1", date(2026, 3, 20)) is called, then the due date becomes 2026-04-12
- AC-12.2: WHEN renew is called for a loan that has already been renewed once THE SYSTEM SHALL raise RenewalLimitError and leave the loan unchanged
- AC-12.3: WHEN renew is called for a loan whose due date is before the given day THE SYSTEM SHALL raise OverdueLoanError and leave the loan unchanged
- AC-12.4: WHEN renew is called for a loan that does not exist THE SYSTEM SHALL raise LoanNotFoundError with the message "Member m1 has no loan of book 978-1"

### FR-13: Remove a book

Need: the librarian removes a book that is no longer held.
Priority: should
Depends on: FR-2, FR-7

- AC-13.1: Given a book with no loans, when remove_book("978-1") is called, then the catalogue no longer holds it
- AC-13.2: WHEN remove_book is called for a book with at least one copy on loan THE SYSTEM SHALL raise BookOnLoanError and leave the library unchanged
- AC-13.3: WHEN remove_book is called with an isbn not in the catalogue THE SYSTEM SHALL raise BookNotFoundError

## Data rules

- DR-5: A member's `staff` flag is a boolean; a missing flag in a stored member means false.
- DR-6: A loan records whether it has been renewed; a missing field in a stored loan means not renewed.

## Non-functional requirements

| ID | Category | Requirement | Target | Verified by |
|---|---|---|---|---|
| NFR-1 | reliability | Writes stay atomic | 0 half-written files after a failed or interrupted write | unit test |
| NFR-2 | maintainability | Lending rules stay in one module | 0 lending rules in the CLI or the storage code | review |
| NFR-3 | maintainability | The loan period and each loan limit are each defined in exactly one place | 1 definition each, 0 repeated literals | review |
| NFR-4 | compatibility | Tests for unchanged requirements pass without edits | 0 edits to tests of FR-1, FR-2, FR-3, FR-4, FR-6, FR-9 | `pytest`, diff review |

## Boundaries

- Always: run `pytest` before every commit.
- Ask first: changing the data file format beyond DR-5 and DR-6.
- Never: edit a sprint 1 test whose requirement is unchanged; write the data file in a read-only operation.

## Integrations and constraints

- Same stack and layout as sprint 1 (Python 3.11+, standard library only, pytest, `src/library/`, `tests/`).
- Tests for modified acceptance criteria (FR-5, FR-7, FR-8, FR-10) may change only where the criterion changed.

## Decisions

- 2026-10-31: renewal counts the new period from the old due date, not from the renewal day — keeps due dates predictable.

## Open questions

none

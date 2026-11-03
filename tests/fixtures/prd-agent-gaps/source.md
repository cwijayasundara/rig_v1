# Invoice triage assistant (synthetic fixture, no client data)

## Purpose

The assistant reads each incoming supplier invoice and assigns it to one of five queues: approve, query, duplicate, fraud-review or other.
Finance clerks work the queues.

## Behaviour

The assistant uses a language model to read the invoice and choose a queue. It writes the chosen queue and a one-sentence reason to the invoice record.
The assistant may move an invoice into the approve, query or duplicate queue by itself. It must never pay an invoice or edit an amount.
Any invoice the assistant puts in fraud-review needs a clerk's approval before it leaves that queue.
When the model reports a confidence below 0.7, the assistant leaves the invoice unassigned and says so in the reason.

## Limits

Each invoice costs at most 0.05 EUR to triage and is answered within 10 seconds.
Only users in the finance group may open the queues; invoice bank details are never written to logs.

## Rollout

Week 1 runs in shadow mode beside the clerks without moving any invoice. Week 2 goes live for one supplier group, then all suppliers.
The finance operations lead runs it and can switch it off with one setting.

## Records

Every triage decision is kept for 7 years with the invoice id, the model version, the queue, the reason and the confidence.

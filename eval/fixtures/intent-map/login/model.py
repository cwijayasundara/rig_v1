"""Finite login model for the intent-map oracle.

The grid is every input the spec allows. Email wins inside the mathematical
lookup, so a world never pairs an email with an admin row. An implementation
may still search the wrong table. Clauses talk about that mathematical lookup,
not about whatever table the implementation happened to pick.
"""

from __future__ import annotations

from dataclasses import dataclass

IDENTITIES = ("neither", "email", "username", "both")
PASSWORDS = ("right", "wrong", "unreadable")


@dataclass(frozen=True)
class World:
    identity: str
    named: tuple | None  # (role, id) of the row the spec's lookup would return
    password: str
    lookup_failed: bool
    sign_failed: bool

    def as_dict(self) -> dict:
        return {
            "identity": self.identity,
            "named": list(self.named) if self.named else None,
            "password": self.password,
            "lookup_failed": self.lookup_failed,
            "sign_failed": self.sign_failed,
        }


def spec_target(identity: str) -> str:
    """The table the words require. Email wins. This function is not the implementation."""
    if identity == "neither":
        return "missing"
    if identity in ("email", "both"):
        return "customer"
    return "admin"


def worlds() -> list[World]:
    found = []
    for identity in IDENTITIES:
        target = spec_target(identity)
        choices: list[tuple | None] = [None]
        if target == "customer":
            choices.append(("customer", "c1"))
        elif target == "admin":
            choices.append(("admin", "a1"))
        for named in choices:
            for password in PASSWORDS:
                for lookup_failed in (False, True):
                    for sign_failed in (False, True):
                        found.append(World(identity, named, password, lookup_failed, sign_failed))
    return found


def lookup_target(identity: str) -> str:
    return spec_target(identity)


def email_loses(identity: str) -> str:
    """Both identities search the admin table. The quiz case: ana@example.com plus the admin password."""
    if identity == "both":
        return "admin"
    return spec_target(identity)


def decide(target: str, named: tuple | None, password: str, lookup_failed: bool, sign_failed: bool):
    if target == "missing":
        return (400, None, None)
    if lookup_failed:
        return (500, None, None)
    if named is None:
        return (401, None, None)
    if password == "unreadable":
        return (500, None, None)
    if password != "right":
        return (401, None, None)
    if sign_failed:
        return (500, None, None)
    role = "customer" if target == "customer" else "admin"
    return (200, named[1], role)


def refuse_everyone(target: str, named, password: str, lookup_failed: bool, sign_failed: bool):
    if target == "missing":
        return (400, None, None)
    return (401, None, None)


def wrong_password_tokens(target: str, named, password: str, lookup_failed: bool, sign_failed: bool):
    if target != "missing" and named is not None and not lookup_failed and password == "wrong":
        role = "customer" if target == "customer" else "admin"
        return (200, named[1], role)
    return decide(target, named, password, lookup_failed, sign_failed)


def always_admin_role(target: str, named, password: str, lookup_failed: bool, sign_failed: bool):
    status, token_id, role = decide(target, named, password, lookup_failed, sign_failed)
    if status == 200:
        return (200, token_id, "admin")
    return (status, token_id, role)


def login(world: World, lookup, decide_fn):
    target = lookup(world.identity)
    return decide_fn(target, world.named, world.password, world.lookup_failed, world.sign_failed)


def _token(outcome) -> bool:
    return outcome[0] == 200


def holds(clause: str, world: World, outcome, lookup) -> bool:
    status, token_id, role = outcome
    expected = spec_target(world.identity)
    expected_role = None if expected == "missing" else expected
    if clause == "C2":
        if not _token(outcome):
            return True
        return (
            world.password == "right"
            and world.named is not None
            and not world.lookup_failed
            and not world.sign_failed
            and token_id == world.named[1]
            and world.named[0] == expected_role
            and role == expected_role
        )
    if clause == "C3":
        if world.named is None or world.password != "right" or expected == "missing":
            return True
        if world.lookup_failed or world.sign_failed:
            return status == 500 and token_id is None
        return status == 200 and token_id == world.named[1]
    if clause == "C7":
        if role != "admin":
            return True
        return world.identity == "username"
    if clause == "C8":
        if status != 200 or world.identity not in ("email", "both"):
            return True
        return role == "customer"
    if clause == "C9":
        return lookup(world.identity) == expected
    raise KeyError(clause)


CLAUSES = ("C2", "C3", "C7", "C8", "C9")


def evaluate(lookup, decide_fn) -> dict:
    counters = {clause: None for clause in CLAUSES}
    for world in worlds():
        outcome = login(world, lookup, decide_fn)
        for clause in CLAUSES:
            if counters[clause] is None and not holds(clause, world, outcome, lookup):
                counters[clause] = {"world": world.as_dict(), "outcome": list(outcome)}
    return {clause: counters[clause] is None for clause in CLAUSES} | {"counters": counters}

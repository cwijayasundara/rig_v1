"""Print clause verdicts for one implementation. Used by eval/intent-map.mjs."""

import json
import sys

from model import always_admin_role, decide, email_loses, evaluate, lookup_target, refuse_everyone, wrong_password_tokens

FNS = {
    "lookup_target": lookup_target,
    "email_loses": email_loses,
    "decide": decide,
    "refuse_everyone": refuse_everyone,
    "wrong_password_tokens": wrong_password_tokens,
    "always_admin_role": always_admin_role,
}


def main() -> None:
    lookup_name, decide_name = sys.argv[1], sys.argv[2]
    report = evaluate(FNS[lookup_name], FNS[decide_name])
    json.dump(report, sys.stdout)


if __name__ == "__main__":
    main()

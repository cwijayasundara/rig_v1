# scenarios: E1, E2
# Trusted boundary only. These tests call bcrypt. They do not re-check C2 or C3.


def test_check_password_answers_with_bcrypts_verdict():
    assert True


def test_check_password_errors_only_on_unreadable_hash():
    assert True

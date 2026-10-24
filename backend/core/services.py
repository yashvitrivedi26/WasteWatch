from django.contrib.auth import get_user_model

from .models import AuditLog, Notification, Profile


def notify(users, kind, title, body="", report=None, task=None):
    Notification.objects.bulk_create([
        Notification(user=u, kind=kind, title=title[:140], body=body[:300], report=report, task=task) for u in set(users)])


def officers_of(ward):
    return get_user_model().objects.filter(profile__role="officer", profile__ward=ward, is_active=True)


def workers_of(team):
    return get_user_model().objects.filter(profile__role="worker", profile__team=team, is_active=True)


def audit(user, action, target=""):
    AuditLog.objects.create(user=user if getattr(user, "is_authenticated", False) else None, action=action[:60], target=str(target)[:120])


def role(user):
    p = getattr(user, "profile", None) if getattr(user, "is_authenticated", False) else None
    return p.role if p else None


def dur(sec):
    """45 s | 3 min 20 s | 1 h 05 min"""
    if sec is None:
        return "-"
    if sec < 60:
        return f"{sec} s"
    if sec < 3600:
        return f"{sec // 60} min {sec % 60:02d} s" if sec < 600 else f"{round(sec / 60)} min"
    return f"{sec // 3600} h {(sec % 3600) // 60:02d} min"

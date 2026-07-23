from datetime import timedelta

from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from .models import User, TalentGrant, Donation


class CancelGrantTests(APITestCase):
    """오늘 준 달란트 취소 — DELETE /api/teacher/grant/<pk>/"""

    def setUp(self):
        self.teacher = User.objects.create_user(
            username='선생님', password='pw', role=User.Role.TEACHER)
        self.other_teacher = User.objects.create_user(
            username='다른선생님', password='pw', role=User.Role.TEACHER)
        self.student = User.objects.create_user(
            username='학생', password='pw', role=User.Role.STUDENT, teacher=self.teacher)

    def grant(self, teacher=None, amount=3):
        return TalentGrant.objects.create(
            teacher=teacher or self.teacher, student=self.student,
            amount=amount, reason='칭찬 · 인사 잘하기')

    def backdate(self, grant, days=1):
        """auto_now_add 라 생성 후에 시각을 직접 밀어 넣는다."""
        TalentGrant.objects.filter(pk=grant.pk).update(
            created_at=timezone.now() - timedelta(days=days))

    def delete(self, grant, as_user=None):
        self.client.force_authenticate(as_user or self.teacher)
        return self.client.delete(f'/api/teacher/grant/{grant.pk}/')

    def test_deletes_todays_own_grant(self):
        grant = self.grant()
        response = self.delete(grant)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(TalentGrant.objects.filter(pk=grant.pk).exists())
        self.assertEqual(User.objects.get(pk=self.student.pk).received_talent, 0)

    def test_rejects_grant_from_a_previous_day(self):
        grant = self.grant()
        self.backdate(grant)
        response = self.delete(grant)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(TalentGrant.objects.filter(pk=grant.pk).exists())

    def test_rejects_another_teachers_grant(self):
        grant = self.grant(teacher=self.other_teacher)
        response = self.delete(grant)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(TalentGrant.objects.filter(pk=grant.pk).exists())

    def test_rejects_when_student_already_donated_the_talent(self):
        """취소하면 보유가 음수가 되는 경우 — 기부는 이미 나무에 반영돼 되돌릴 수 없다."""
        grant = self.grant(amount=3)
        Donation.objects.create(student=self.student, amount=3)
        response = self.delete(grant)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(TalentGrant.objects.filter(pk=grant.pk).exists())

    def test_allows_cancel_when_enough_talent_remains(self):
        """다른 지급분이 남아 있어 취소해도 보유가 음수가 되지 않으면 허용한다."""
        self.grant(amount=5)
        grant = self.grant(amount=3)
        Donation.objects.create(student=self.student, amount=4)
        response = self.delete(grant)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(User.objects.get(pk=self.student.pk).balance, 1)

    def test_students_cannot_cancel(self):
        grant = self.grant()
        response = self.delete(grant, as_user=self.student)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(TalentGrant.objects.filter(pk=grant.pk).exists())

    def test_missing_grant_is_rejected(self):
        self.client.force_authenticate(self.teacher)
        response = self.client.delete('/api/teacher/grant/99999/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

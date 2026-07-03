from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils.functional import cached_property


class User(AbstractUser):
    """Custom user with a role. Login identifier is ``username`` (이름)."""

    class Role(models.TextChoices):
        STUDENT = 'student', '학생'
        TEACHER = 'teacher', '선생님'
        ADMIN = 'admin', '관리자'

    role = models.CharField(
        max_length=10,
        choices=Role.choices,
        default=Role.STUDENT,
        verbose_name='역할',
    )
    # For students: the teacher they are assigned to.
    teacher = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='students',
        limit_choices_to={'role': Role.TEACHER},
        verbose_name='담당 선생님',
    )

    @property
    def is_student(self):
        return self.role == self.Role.STUDENT

    @property
    def is_teacher(self):
        return self.role == self.Role.TEACHER

    # received_talent / donated_talent 는 한 요청 안에서 여러 번(뷰·시리얼라이저의
    # balance·stage 등) 참조된다. @property 로 두면 매 참조마다 집계 쿼리가 새로 나가
    # 대시보드 한 번에 같은 값을 9번쯤 계산했다. @cached_property 로 인스턴스 수명(=요청
    # 하나) 동안 결과를 재사용해 요청당 집계 쿼리를 2번으로 줄인다.
    # 캐시는 요청이 끝나면 사라지므로(매 요청 사용자를 새로 로드) 최신 반영은 그대로다.
    @cached_property
    def received_talent(self):
        """Total talent a student has received from teachers."""
        return self.grants_received.aggregate(total=models.Sum('amount'))['total'] or 0

    @cached_property
    def donated_talent(self):
        """Total talent a student has donated to the community tree."""
        return self.donations.aggregate(total=models.Sum('amount'))['total'] or 0

    @property
    def balance(self):
        """Talent currently held (received minus donated)."""
        return self.received_talent - self.donated_talent

    def __str__(self):
        return f'{self.username} ({self.get_role_display()})'


class TalentGrant(models.Model):
    """A teacher awarding talent to a student, with a reason (칭찬 사유)."""

    teacher = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='grants_given',
        limit_choices_to={'role': User.Role.TEACHER},
        verbose_name='지급 선생님',
    )
    student = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='grants_received',
        limit_choices_to={'role': User.Role.STUDENT},
        verbose_name='받은 학생',
    )
    amount = models.PositiveIntegerField('달란트', default=1)
    reason = models.CharField('사유', max_length=200, blank=True)
    created_at = models.DateTimeField('지급 시각', auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = '달란트 지급'
        verbose_name_plural = '달란트 지급 내역'

    def __str__(self):
        return f'{self.teacher} → {self.student}: {self.amount} 달란트'


class Donation(models.Model):
    """A student donating their held talent to the shared community tree."""

    student = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='donations',
        limit_choices_to={'role': User.Role.STUDENT},
        verbose_name='기부 학생',
    )
    amount = models.PositiveIntegerField('기부 달란트', default=1)
    message = models.CharField('기부 메시지', max_length=200, blank=True)
    created_at = models.DateTimeField('기부 시각', auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name = '기부'
        verbose_name_plural = '기부 내역'

    def __str__(self):
        return f'{self.student}: {self.amount} 달란트 기부'

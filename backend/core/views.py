from django.conf import settings
from django.db.models import Sum, Count, OuterRef, Subquery, IntegerField
from django.db.models.functions import Coalesce
from django.utils import timezone
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import User, TalentGrant, Donation
from .permissions import IsTeacher, IsStudent, IsAdmin
from .serializers import (
    RegisterSerializer, LoginSerializer, UserSerializer,
    StudentBriefSerializer, TalentGrantSerializer, DonationSerializer,
    PublicDonationSerializer, tree_stage,
)

# Community tree growth — 단계별 누적 기부 달란트 임계값은 settings 에서 온다
# (환경변수 COMMUNITY_THRESHOLDS 로 재배포 없이 조정 가능). 기본값 [0, 10, 24, 40].
def community_stage(total):
    """Map community donated total to a 0-3 stage (4 stages)."""
    stage = 0
    for i, threshold in enumerate(settings.COMMUNITY_THRESHOLDS):
        if total >= threshold:
            stage = i
    return stage


def community_goal():
    """나무가 완전히 자라는 누적 기부량(마지막 임계값)."""
    return settings.COMMUNITY_THRESHOLDS[-1]


def talent_subquery(model):
    """학생별 달란트 합계를 서브쿼리로 계산한다.

    모델의 received_talent/donated_talent(cached_property)는 한 요청 안의 중복 집계만
    막아줄 뿐, 인스턴스가 N개면 쿼리도 N배로 나간다. 이 애노테이션 값은 인스턴스
    __dict__ 에 들어가 cached_property 를 덮어쓰므로, 시리얼라이저는 코드 변경 없이
    이 값을 쓴다.
    """
    sq = (model.objects.filter(student=OuterRef('pk'))
          .values('student').annotate(s=Sum('amount')).values('s'))
    return Coalesce(Subquery(sq, output_field=IntegerField()), 0)


def auth_payload(user):
    token, _ = Token.objects.get_or_create(user=user)
    return {'token': token.key, 'user': UserSerializer(user).data}


# ---------------------------------------------------------------- auth

@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()
    return Response(auth_payload(user), status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([AllowAny])
def login(request):
    serializer = LoginSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    return Response(auth_payload(serializer.validated_data['user']))


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def logout(request):
    Token.objects.filter(user=request.user).delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def me(request):
    return Response(UserSerializer(request.user).data)


# ---------------------------------------------------------------- community (any logged-in user)

def community_summary():
    """Anonymous aggregate of the shared tree — never exposes who donated."""
    # 합계와 기부자 수를 한 번의 집계로 구한다(같은 테이블을 두 번 훑지 않도록).
    agg = Donation.objects.aggregate(t=Sum('amount'), d=Count('student', distinct=True))
    total, donors = agg['t'] or 0, agg['d']
    return {
        'total_donated': total,
        'goal': community_goal(),
        'stage': community_stage(total),
        'donor_count': donors,
    }


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def community(request):
    # Recent feed is anonymous: amount + message only, no donor identity.
    recent = Donation.objects.all()[:15]
    return Response({
        **community_summary(),
        'recent_donations': PublicDonationSerializer(recent, many=True).data,
    })


@api_view(['GET'])
@permission_classes([AllowAny])
def community_display(request):
    """Public read-only view for the event-day big screen (no login needed)."""
    return Response(community_summary())


# ---------------------------------------------------------------- student

class StudentDashboard(APIView):
    permission_classes = [IsStudent]

    def get(self, request):
        # 가장 잦은 API(5초 폴링)라 사용자를 한 번에 완성해서 가져온다.
        # 애노테이션으로 받은/기부 집계 2쿼리를, select_related('teacher')로
        # teacher_name 지연 조회 1쿼리를 없앤다.
        user = (User.objects
                .select_related('teacher')
                .annotate(received_talent=talent_subquery(TalentGrant),
                          donated_talent=talent_subquery(Donation))
                .get(pk=request.user.pk))
        received = user.received_talent
        grants = user.grants_received.select_related('teacher')[:20]
        # select_related('student'): 기부 목록의 student_name 조회가 항목마다 쿼리를
        # 내지 않도록(N+1 방지) 조인해서 한 번에 가져온다.
        donations = user.donations.select_related('student')[:20]
        return Response({
            'user': UserSerializer(user).data,
            'received_talent': received,
            'donated_talent': user.donated_talent,
            'balance': user.balance,
            'stage': tree_stage(received),
            'goal': 40,
            'grants': TalentGrantSerializer(grants, many=True).data,
            'donations': DonationSerializer(donations, many=True).data,
        })


class DonateView(APIView):
    permission_classes = [IsStudent]

    def post(self, request):
        try:
            amount = int(request.data.get('amount', 1))
        except (TypeError, ValueError):
            return Response({'detail': '올바른 달란트 수를 입력해 주세요.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if amount < 1:
            return Response({'detail': '1 달란트 이상 기부할 수 있어요.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if amount > request.user.balance:
            return Response({'detail': '보유한 달란트보다 많이 기부할 수 없어요.'},
                            status=status.HTTP_400_BAD_REQUEST)

        donation = Donation.objects.create(
            student=request.user,
            amount=amount,
            message=str(request.data.get('message', ''))[:200],
        )
        return Response(DonationSerializer(donation).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------- teacher

def today_start():
    """'오늘'의 시작(한국 시간 자정). 지급 목록과 취소 가능 기간이 같은 기준을 쓴다."""
    return timezone.localtime().replace(hour=0, minute=0, second=0, microsecond=0)


def today_grants(teacher):
    """오늘(한국 시간 기준) 이 선생님이 준 지급 내역 요약.

    하루치는 많아야 수십~수백 건이라 한 번에 가져와 파이썬에서 합계를 낸다(집계 쿼리를
    따로 추가하지 않는다). select_related로 학생 이름 조회 N+1을 막는다.
    """
    grants = list(
        TalentGrant.objects.filter(teacher=teacher, created_at__gte=today_start())
        .select_related('student', 'teacher')
    )
    return {
        'total': sum(g.amount for g in grants),
        'count': len(grants),
        'grants': TalentGrantSerializer(grants[:50], many=True).data,
    }


class TeacherStudents(APIView):
    permission_classes = [IsTeacher]

    def get(self, request):
        # select_related('teacher'): 카드마다 teacher_name 을 읽느라 학생 수만큼
        # 쿼리가 나가던 N+1 을 조인 한 번으로 없앤다.
        # annotate: 받은/기부 달란트를 학생마다 집계하지 않고 서브쿼리로 한 번에 계산한다.
        # 애노테이션 값은 인스턴스 __dict__ 에 들어가므로 모델의 cached_property 를
        # 그대로 덮어쓴다(= 시리얼라이저는 코드 변경 없이 이 값을 쓴다).
        students = (request.user.students
                    .select_related('teacher')
                    .annotate(
                        received_talent=talent_subquery(TalentGrant),
                        donated_talent=talent_subquery(Donation),
                    )
                    .order_by('username'))
        # 오늘의 지급 내역을 같은 응답에 담는다. 엔드포인트를 따로 두면 폴링마다 요청이
        # 2배가 되므로, 한 번의 왕복으로 끝내는 편이 체감 속도에 유리하다.
        return Response({
            'students': StudentBriefSerializer(students, many=True).data,
            'today': today_grants(request.user),
        })


class GrantView(APIView):
    """달란트 지급. 규칙을 여러 개 골라 한 번에 줄 수 있다.

    요청 형식 — ``{"student": 1, "items": [{"reason": "...", "amount": 2}, ...]}``
    규칙 하나당 TalentGrant 한 행으로 저장한다. 사유를 한 칸에 뭉쳐 넣지 않으므로
    학생 화면에서 규칙별로 보이고, 나중에 규칙별 통계도 낼 수 있다. 행이 여러 개여도
    bulk_create 로 INSERT 는 한 번만 나간다. 예전 단건 형식(amount/reason)도 받는다.
    """
    permission_classes = [IsTeacher]

    MAX_ITEMS = 20

    def post(self, request):
        student = User.objects.filter(
            id=request.data.get('student'), role=User.Role.STUDENT, teacher=request.user
        ).first()
        if not student:
            return Response({'detail': '담당하는 학생만 달란트를 줄 수 있어요.'},
                            status=status.HTTP_400_BAD_REQUEST)

        raw = request.data.get('items')
        if not isinstance(raw, list):  # 단건 요청 하위 호환
            raw = [{'amount': request.data.get('amount', 1),
                    'reason': request.data.get('reason', '')}]
        if not raw:
            return Response({'detail': '줄 규칙을 하나 이상 선택해 주세요.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if len(raw) > self.MAX_ITEMS:
            return Response({'detail': f'한 번에 최대 {self.MAX_ITEMS}개까지 선택할 수 있어요.'},
                            status=status.HTTP_400_BAD_REQUEST)

        items = []
        for item in raw:
            if not isinstance(item, dict):
                return Response({'detail': '잘못된 요청이에요.'},
                                status=status.HTTP_400_BAD_REQUEST)
            try:
                amount = int(item.get('amount', 1))
            except (TypeError, ValueError):
                return Response({'detail': '올바른 달란트 수를 입력해 주세요.'},
                                status=status.HTTP_400_BAD_REQUEST)
            if amount < 1:
                return Response({'detail': '1 달란트 이상 줄 수 있어요.'},
                                status=status.HTTP_400_BAD_REQUEST)
            items.append(TalentGrant(
                teacher=request.user,
                student=student,
                amount=amount,
                reason=str(item.get('reason', ''))[:200],
            ))

        grants = TalentGrant.objects.bulk_create(items)
        return Response({
            'granted': sum(g.amount for g in grants),
            'grants': TalentGrantSerializer(grants, many=True).data,
        }, status=status.HTTP_201_CREATED)


class GrantDetail(APIView):
    """잘못 준 달란트 되돌리기 — 내가 오늘 준 지급만 삭제할 수 있다.

    당일 제한과 본인 지급 제한은 여기서 다시 확인한다. 화면에는 오늘 것만 보이지만,
    자정을 넘긴 채 켜둔 화면이나 남의 지급 id 로도 요청이 올 수 있기 때문이다.
    """
    permission_classes = [IsTeacher]

    def delete(self, request, pk):
        grant = (TalentGrant.objects
                 .select_related('student')
                 .filter(pk=pk, teacher=request.user, created_at__gte=today_start())
                 .first())
        if grant is None:
            return Response({'detail': '오늘 준 달란트만 취소할 수 있어요.'},
                            status=status.HTTP_400_BAD_REQUEST)

        # 학생이 이미 기부했다면 취소하지 않는다. 지급만 지우면 보유 달란트가 음수가 되고,
        # 공동체 나무에 반영된 기부는 되돌릴 수 없어 나무 단계가 부풀려진 채 남는다.
        if grant.student.balance < grant.amount:
            return Response(
                {'detail': f'{grant.student.username} 학생이 이미 기부에 사용해서 취소할 수 없어요. '
                           f'관리자에게 문의해 주세요.'},
                status=status.HTTP_400_BAD_REQUEST)

        grant.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- admin

class AdminUsers(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        teachers = list(
            User.objects.filter(role=User.Role.TEACHER)
            .order_by('username').values('id', 'username')
        )
        # 받은/기부 달란트를 학생별 개별 쿼리(N+1) 대신 서브쿼리로 한 번에 계산.
        received_sq = (TalentGrant.objects.filter(student=OuterRef('pk'))
                       .values('student').annotate(s=Sum('amount')).values('s'))
        donated_sq = (Donation.objects.filter(student=OuterRef('pk'))
                      .values('student').annotate(s=Sum('amount')).values('s'))
        rows = (User.objects.filter(role=User.Role.STUDENT)
                .annotate(
                    received=Coalesce(Subquery(received_sq, output_field=IntegerField()), 0),
                    donated=Coalesce(Subquery(donated_sq, output_field=IntegerField()), 0),
                )
                .order_by('username')
                .values('id', 'username', 'received', 'donated', 'teacher'))
        students = [{
            'id': r['id'], 'username': r['username'],
            'received_talent': r['received'], 'donated_talent': r['donated'],
            'balance': r['received'] - r['donated'], 'teacher': r['teacher'],
        } for r in rows]
        return Response({'teachers': teachers, 'students': students})


class AdminDonations(APIView):
    """관리자 전용: 기부 내역을 실명으로 조회(누가·얼마·언제).

    공동체 피드(`/community/`)는 익명(별칭)으로만 노출되지만, 관리자는 운영·결산을
    위해 실제 기부자 이름을 볼 수 있어야 한다. select_related로 이름 조회 N+1을 막고,
    최근 200건까지 반환한다.
    """
    permission_classes = [IsAdmin]

    def get(self, request):
        donations = (Donation.objects.select_related('student')
                     .order_by('-created_at')[:200])
        return Response(DonationSerializer(donations, many=True).data)


class AssignStudent(APIView):
    permission_classes = [IsAdmin]

    def post(self, request):
        student = User.objects.filter(
            id=request.data.get('student'), role=User.Role.STUDENT
        ).first()
        if not student:
            return Response({'detail': '학생을 찾을 수 없어요.'},
                            status=status.HTTP_400_BAD_REQUEST)

        teacher_id = request.data.get('teacher')
        if teacher_id in (None, '', 'null'):
            student.teacher = None
        else:
            teacher = User.objects.filter(id=teacher_id, role=User.Role.TEACHER).first()
            if not teacher:
                return Response({'detail': '선생님을 찾을 수 없어요.'},
                                status=status.HTTP_400_BAD_REQUEST)
            student.teacher = teacher
        student.save(update_fields=['teacher'])
        return Response(UserSerializer(student).data)


class SetRole(APIView):
    permission_classes = [IsAdmin]

    def post(self, request):
        user = User.objects.filter(id=request.data.get('user')).first()
        role = request.data.get('role')
        if not user or role not in User.Role.values:
            return Response({'detail': '잘못된 요청이에요.'},
                            status=status.HTTP_400_BAD_REQUEST)
        user.role = role
        if role != User.Role.STUDENT:
            user.teacher = None
        user.save()
        return Response(UserSerializer(user).data)


class DeleteUser(APIView):
    """선생님/학생 계정 삭제 (관리자 전용).

    관리자·슈퍼유저 계정은 보호를 위해 삭제할 수 없다. 선생님을 삭제하면 그가 준
    달란트 지급 기록은 함께 삭제되고(CASCADE), 담당 학생은 '담당 없음'이 된다(SET_NULL).
    학생을 삭제하면 그 학생의 받은 지급·기부 기록도 함께 삭제된다(CASCADE).
    """
    permission_classes = [IsAdmin]

    def post(self, request):
        user = User.objects.filter(id=request.data.get('user')).first()
        if not user:
            return Response({'detail': '사용자를 찾을 수 없어요.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if user.role == User.Role.ADMIN or user.is_superuser:
            return Response({'detail': '관리자 계정은 삭제할 수 없어요.'},
                            status=status.HTTP_400_BAD_REQUEST)
        username = user.username
        user.delete()
        return Response({'deleted': username})


class ResetTalents(APIView):
    """달란트 지급·기부 데이터를 모두 삭제(계정은 유지). 관리자 전용."""
    permission_classes = [IsAdmin]

    def post(self, request):
        grants = TalentGrant.objects.count()
        donations = Donation.objects.count()
        Donation.objects.all().delete()
        TalentGrant.objects.all().delete()
        return Response({'deleted_grants': grants, 'deleted_donations': donations})


class AdminStats(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        total_received = TalentGrant.objects.aggregate(t=Sum('amount'))['t'] or 0
        total_donated = Donation.objects.aggregate(t=Sum('amount'))['t'] or 0
        return Response({
            'student_count': User.objects.filter(role=User.Role.STUDENT).count(),
            'teacher_count': User.objects.filter(role=User.Role.TEACHER).count(),
            'total_received': total_received,
            'total_donated': total_donated,
            'community_stage': community_stage(total_donated),
            'community_goal': community_goal(),
        })

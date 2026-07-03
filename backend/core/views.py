from django.db.models import Sum, OuterRef, Subquery, IntegerField
from django.db.models.functions import Coalesce
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

# Community tree growth — cumulative donated talent needed to reach each stage.
#   1단계 → 2단계: +2  (누적 2)
#   2단계 → 3단계: +3  (누적 5)
#   3단계 → 4단계: +3  (누적 8)
COMMUNITY_THRESHOLDS = [0, 2, 5, 8]
COMMUNITY_GOAL = COMMUNITY_THRESHOLDS[-1]  # fully-grown total (8)


def community_stage(total):
    """Map community donated total to a 0-3 stage (4 stages)."""
    stage = 0
    for i, threshold in enumerate(COMMUNITY_THRESHOLDS):
        if total >= threshold:
            stage = i
    return stage


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
    total = Donation.objects.aggregate(t=Sum('amount'))['t'] or 0
    donors = Donation.objects.values('student').distinct().count()
    return {
        'total_donated': total,
        'goal': COMMUNITY_GOAL,
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
        user = request.user
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

class TeacherStudents(APIView):
    permission_classes = [IsTeacher]

    def get(self, request):
        students = request.user.students.all().order_by('username')
        return Response(StudentBriefSerializer(students, many=True).data)


class GrantView(APIView):
    permission_classes = [IsTeacher]

    def post(self, request):
        student_id = request.data.get('student')
        student = User.objects.filter(
            id=student_id, role=User.Role.STUDENT, teacher=request.user
        ).first()
        if not student:
            return Response({'detail': '담당하는 학생만 달란트를 줄 수 있어요.'},
                            status=status.HTTP_400_BAD_REQUEST)
        try:
            amount = int(request.data.get('amount', 1))
        except (TypeError, ValueError):
            return Response({'detail': '올바른 달란트 수를 입력해 주세요.'},
                            status=status.HTTP_400_BAD_REQUEST)
        if amount < 1:
            return Response({'detail': '1 달란트 이상 줄 수 있어요.'},
                            status=status.HTTP_400_BAD_REQUEST)

        grant = TalentGrant.objects.create(
            teacher=request.user,
            student=student,
            amount=amount,
            reason=str(request.data.get('reason', ''))[:200],
        )
        return Response(TalentGrantSerializer(grant).data, status=status.HTTP_201_CREATED)


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
            'community_goal': COMMUNITY_GOAL,
        })
